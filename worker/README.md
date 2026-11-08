# chai-mail · 站点邮件网关

把「留言板」和「工作坊需求」两个表单的提交，用站长自己的 QQ 邮箱发出去，并给访客回一封确认信。

## 为什么不能用前端直接连 QQ SMTP

站点是 GitHub Pages 纯静态托管，没有服务端。仓库是公开的，任何写进前端代码的密钥
（包括 QQ 授权码）都会被打进 JS bundle，F12 就能看到——等于把邮箱的发信权和读信权公开。
所以授权码只放在 Worker 的 Secret 里，前端只认一个公开的 Worker 地址。

## 结构

```
worker/
├── src/index.js     # 收表单 → SMTP 发信 → 自动回复
└── wrangler.toml    # 非密钥配置（收件地址、允许的来源域）
```

密钥（不入库）：

| Secret | 说明 |
|---|---|
| `QQ_USER` | 发信用的 QQ 邮箱，如 `1414330095@qq.com` |
| `QQ_PASS` | QQ 邮箱的 **SMTP 授权码**（不是登录密码；QQ 邮箱设置 → 账号 → POP3/SMTP 服务里生成） |

## 部署

```bash
cd worker
npx wrangler login                       # 浏览器授权一次

npx wrangler secret put QQ_USER          # 粘贴 1414330095@qq.com
npx wrangler secret put QQ_PASS          # 粘贴授权码

npx wrangler deploy                      # 输出 https://chai-mail.<子域>.workers.dev
```

部署完把地址回填到 `src/config.js` 的 `MAIL_API`，或在构建时注入：

```
VITE_MAIL_API=https://chai-mail.xxx.workers.dev
```

没配 `MAIL_API` 时前端会自动退回 `mailto:`，站点不会坏，只是要访客自己点发送。

## 接口

`POST /`（任意路径均可），JSON：

```json
{ "kind": "message", "name": "张三", "contact": "a@b.com", "msg": "你好", "website": "" }
```

- `kind`：`message`（留言）或 `need`（工作坊需求）
- `website`：蜜罐字段，非空即视为机器人，直接返回成功但不发信
- 返回 `{ ok, mailed, replied }`；失败返回 `{ ok:false, error }`

`GET /` 返回 `{ ok:true, ready:true|false }`，可用来探活。

## 内置防护

- 蜜罐字段 + 同 IP 10 分钟 5 次限流
- 邮件头字段做 CRLF 清洗，防头注入
- CORS 白名单（`ALLOWED_ORIGINS`），未授权来源浏览器端直接拦截
- 错误不向客户端回显内部信息，只写 `console.error`

## 注意

- Workers 封禁 25 端口，走 `smtp.qq.com:465`（隐式 TLS）。
- QQ 对发信频率有风控，短时间大量发信可能被临时限制；个人站点用量完全够。
- `From` 必须是已认证的 QQ 号，访客邮箱只放在 `Reply-To`，否则 QQ 会拒信（502）。
