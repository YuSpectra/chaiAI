# 访客留言自动回信

访客在站内表单留言后，**自动收到一封确认信**。整个链路没有自建服务器。

```
访客提交表单
   ↓  FormSubmit（免注册转发）
站长 QQ 邮箱收件箱
   ↓  GitHub Actions 每 5 分钟跑一次本目录的 reply.py
   ↓  QQ SMTP
访客收到确认信（可直接回复，回到站长邮箱）
```

## 为什么是这个架构

站点托管在 GitHub Pages，纯静态、没有后端。自动回信需要两件静态站点给不了的东西：**常驻运行的进程** + **能连 SMTP 的出口**。

GitHub Actions 的定时任务同时满足：免费、不用另注册账号、凭据存 Secrets 不进仓库。代价是**有延迟**——GitHub 的 cron 最小间隔 5 分钟，实际落地常在 5~20 分钟之间。作为「已收到你的留言」这类确认信够用，但它不是即时对话。

> 需要真正的实时回信，把 `worker/` 那套 Cloudflare Worker 部署起来即可（Worker 支持 TCP 465，能直连 QQ SMTP），本目录的脚本就可以退休。

## 配置

仓库 → Settings → Secrets and variables → Actions，加两条：

| Secret | 值 |
|---|---|
| `QQ_USER` | `1414330095@qq.com` |
| `QQ_AUTH_CODE` | QQ 邮箱「设置 → 账号 → POP3/IMAP/SMTP 服务」里生成的授权码 |

> 授权码不是 QQ 密码。它同时具备收信和发信权限，**只放在 Secrets 里**，绝不要写进任何会被提交的文件。

## 本地调试

```bash
# 只看会回给谁、不回出去（不动邮箱）
QQ_USER=... QQ_AUTH_CODE=... DRY_RUN=1 python tools/autoreply/reply.py

# 真发，但把回信都改投到自己的邮箱，不打扰访客
QQ_USER=... QQ_AUTH_CODE=... TEST_TO_OVERRIDE=you@example.com MAX_PER_RUN=1 \
  python tools/autoreply/reply.py
```

## QQ 邮箱 IMAP 的三个坑（都是实测踩出来的）

1. **不支持 `FROM` 搜索**，返回空集 → 只能 `SINCE <日期>` 取一批，再在本地按发件人过滤。
2. **不支持自定义关键字**，`STORE +FLAGS ($Replied)` 返回 OK 但 FLAGS 不变 → 不能用关键字做幂等。
3. **不支持 `HEADER` 搜索** → 只能把 header 整段拉回来自己比对。

另外**「已读」标记靠不住**：QQ 客户端同步时会把邮件自动标成已读。如果用 `UNSEEN` 判断「是否回过信」，你在手机上瞄一眼那封通知，访客就永远收不到自动回信了。

所以幂等改用**专用文件夹 `ChaiReplied`**：回信成功后把那封通知 `COPY` 一份进去（收件箱原件不动），下一轮读到 Message-ID 已存在就跳过。文件夹超过 400 条时自动裁掉最旧的。

## 行为保证

| 情况 | 行为 |
|---|---|
| 访客没留邮箱 | 跳过（没法回），下轮再扫也不会重复处理 |
| 访客留的就是站长邮箱 | 跳过（防自环） |
| 同一封通知被处理两次 | 靠 `ChaiReplied` 里的 Message-ID 拦住 |
| 发信失败 | **不写记号**，下一轮自动重试 |
| 有人刷表单 | 单轮上限 `MAX_PER_RUN`（默认 20），超额留到下轮 |
| 访客回复了确认信 | 那是一封普通来信，不触发自动回信，不会形成回路 |

## 已知限制

- **延迟 5~20 分钟**（cron 最小粒度 + GitHub 排队）。
- **仓库连续 60 天无提交，GitHub 会自动暂停定时任务**。发现访客收不到回信时，先来 Actions 页面点一次 `Run workflow`，看是否被暂停。
- QQ 邮箱对发信量有限制，正常留言量远低于阈值。
- 访客把确认信当垃圾邮件投进垃圾箱，我们无从知晓。
