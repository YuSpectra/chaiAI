# 观子喻知 YuSpectra — 个人品牌网站

> 向外体察，读懂万象，启思创造，拥抱探索。
> To observe, to understand, to create, to embrace.

一个**零依赖、免构建、纯静态**的响应式个人内容品牌网站。浅色简约风格：白底、细边框、单一沉静强调色（深青绿 `#1c6b64`）、大留白与极轻的淡入动效；没有网格、扫描线、光斑、故障效果或霓虹光晕。移动端优先，所有内容来自本地示例数据，页面完整可浏览。

**视觉规范**：背景 `#f8f9fb`、卡片 `#ffffff`，正文 `#1c2431`、辅助文字 `#6b7482`，强调色只用于链接、按钮与标签；圆角 8–16px；动效 240–300ms，支持 `prefers-reduced-motion`。想换配色只需改 `assets/css/style.css` 顶部 `:root` 里的变量。

> **当前为演示状态**（按需求保留，暂不接真实资源）：
> - **二维码是虚拟的**：外观为二维码点阵，但图上与卡片上都标注了「DEMO · 虚拟 / 暂不可扫码」，不会被误扫。
> - **外链指向本站**：公众号 / 视频号相关的按钮与链接不再指向假的微信域名，统一指向本站页面（`index.html`、`notes.html`、`videos.html`），用相对路径，本地和线上都能直接点开。
> - **自我介绍 = 关于我们**：关于页只用「关于我们」的中英文文案，不编造署名、身份、城市或邮箱；文章作者署名使用品牌名。

本目录按新品牌方案重建，用于替换你原来的 `YuSpectra/chaiAI` 仓库（原仓库是 Vite + React 的「拆AI 工作坊课程阵地」，品牌与定位完全不同）。原仓库在本次环境中因网络返回空响应无法 `git clone`，因此这里是一份可以直接推上去的完整新站点，不含旧项目文件。

---

## 一、目录结构

```
chaiAI/
├── index.html          首页（Hero / 四关键词 / 精选笔记 / 视频墙 / 影像 / 内容流 / 连接 CTA / 内容标签）
├── notes.html          观测笔记列表（标签筛选 + 搜索）
├── note.html           文章详情（?slug=，含分享与 JSON-LD 结构化数据）
├── videos.html         视频列表（2 大 2 小视频墙 + 全部条目）
├── video.html          视频详情（?slug=，占位播放器 + VideoObject 结构化数据）
├── gallery.html        影像画廊（瀑布流 + 灯箱）
├── about.html          关于（关于我们中英文 + 内容方向 + 定位 + 四关键词）
├── connect.html        连接（公众号 / 视频号虚拟二维码 + 指向本站的演示外链）
├── tags.html           标签索引
├── search.html         全站搜索（实时检索笔记 / 视频 / 影像 / 标签）
├── 404.html            404 页
├── assets/
│   ├── css/style.css   全站设计系统（:root 颜色变量、白底卡片、轻动效、响应式、reduced-motion）
│   ├── js/data.js      ★ 唯一内容源：品牌文案、自我介绍、6 篇文章、4 个视频、8 张图片、标签、外链
│   ├── js/site.js      导航 / 页脚 / 搜索 / 筛选 / 灯箱 / 复制链接 / 回到顶部 / 结构化数据
│   └── img/            22 张浅色简约占位 SVG（封面、图片、虚拟二维码、favicon、OG 图）
├── scripts/
│   └── gen-placeholders.mjs   重新生成占位图：node scripts/gen-placeholders.mjs
├── sitemap.xml         站点地图（含 6 篇文章 + 4 个视频详情）
├── rss.xml             RSS 2.0 占位订阅源
└── robots.txt
```

---

## 二、如何本地运行

**推荐：起一个本地静态服务器**（页面间跳转、canonical、复制链接都能正常工作）。

```bash
# 方式 A：Python（Windows / macOS 通用）
cd chaiAI
python -m http.server 8000
# 浏览器打开 http://localhost:8000/

# 方式 B：Node
npx serve .
# 或 npx http-server -p 8000

# 方式 C：VS Code 装 Live Server 插件，右键 index.html → Open with Live Server
```

也可以直接双击 `index.html` 用 `file://` 打开浏览（没有 fetch/ajax，数据用 `<script>` 加载，所以同样能看）；但复制链接、canonical 等在这种模式下不是真实网址，建议用服务器。

不需要 `npm install`，不需要构建，没有框架和打包器。

---

## 三、如何替换内容

**只需改 `assets/js/data.js` 一个文件**，所有页面（首页、列表、详情、搜索、标签、时间线、sitemap 之外的内容）会自动更新。改完刷新浏览器即可。

| 想改什么 | 改哪里 |
|---|---|
| 品牌名 / 中英 Slogan / 关于我们文案 | `SITE.brandZh`、`brandEn`、`sloganZh`、`sloganEn`、`aboutZh`、`aboutEn` |
| **自我介绍 / 关于我们**（中英文共用一份文案） | 文件顶部的 `ABOUT_ZH` / `ABOUT_EN`；`SITE.profile` 的 `intro` / `introEn` 直接引用它们，`displayName` 为品牌署名，`focus` 为内容方向 |
| 文章（标题、摘要、封面、标签、日期、阅读时间、正文） | `NOTES` 数组；正文写在 `body`（HTML 字符串数组，支持 `<h2>/<p>/<blockquote>/<ul>`） |
| 视频（标题、封面、平台、时长、简介、链接） | `VIDEOS` 数组；`featured: true` 的视频在首页显示为大卡 |
| 图片（标题、路径、标签、日期、简介） | `IMAGES` 数组；`ratio` 仅用于占位图生成，真实图片任意尺寸都可以 |
| 标签、内容标签词条、四关键词、导航 | `TAGS`、`TICKER`、`KEYWORDS`、`NAV` |
| 页脚社交链接、版权文案 | `SITE.social`、`SITE.copyright` |

新增内容时，记得同步更新 `sitemap.xml` 和 `rss.xml`（它们是静态文件，不会自动更新）。

**替换图片**：最简单的方式是**同名覆盖** `assets/img/` 里的文件，例如把真实封面存成 `note-01.svg`→改成 `note-01.jpg` 时，需要同步把 `data.js` 中对应的 `cover` 路径改掉。二维码、favicon、OG 图同理。
想重新生成一批占位图：`node scripts/gen-placeholders.mjs`（会覆盖 `assets/img/` 下的占位 SVG，请先备份已替换的真实图片）。

---

## 四、上线前必须替换的占位（清单）

> 现阶段二维码与微信外链是**有意保留的演示状态**，可以先上线浏览，不需要立刻替换；下面列出的是拿到真实资源后要动的地方。

| # | 占位项 | 当前值 | 位置 |
|---|---|---|---|
| 1 | **域名** | 已设为 `https://chai.aibay.asia` | 换域名时全站搜索替换该地址：`data.js` → `SITE.domain`、各 HTML 的 canonical / `og:image`、`sitemap.xml`、`rss.xml`、`robots.txt` |
| 2 | **公众号二维码（虚拟）** | `qr-official-placeholder.svg`（图上标注 DEMO / 暂不可扫码） | `data.js` → `SITE.wechat.officialQr`；把真实二维码图片放进 `assets/img/` 后改路径 |
| 3 | **视频号二维码（虚拟）** | `qr-channel-placeholder.svg` | `data.js` → `SITE.wechat.channelQr` |
| 4 | **公众号外链 / 文章链接（演示）** | `index.html` / `notes.html`（指向本站） | `data.js` → `wechat.officialUrl`、`officialArticleUrl`；`SITE.social` 里的「公众号」 |
| 5 | **视频号链接（演示）** | `videos.html`（指向本站） | `data.js` → `wechat.channelUrl`；`SITE.social` 里的「视频号」 |
| 6 | **视频播放地址** | `REPLACE_VIDEO_URL` ×4 | `data.js` → `VIDEOS[].videoUrl`（填 `.mp4/.webm` 会直接在详情页播放；填平台页面链接则显示「前往平台观看」按钮） |
| 7 | 文章封面 / 视频封面 / 图片 | `assets/img/*.svg` 占位图 | `data.js` 中每条内容的 `cover` / `src` |
| 8 | 自我介绍 | 已是「关于我们」中英文正式文案 | `data.js` 顶部 `ABOUT_ZH` / `ABOUT_EN`（改一处，两处同步） |
| 9 | 二维码 / 演示状态说明文字 | 「虚拟二维码 · 演示用」 | `data.js` → `SITE.wechat.qrHint`、`hint`；连接页与首页 CTA 的静态说明文字 |
| 10 | RSS / sitemap 里的条目与日期 | 示例文章 | `rss.xml`、`sitemap.xml` |

### 从「演示状态」切到真实二维码与外链

1. 把真实二维码图片（建议 `png`，正方形、白底、≥ 400px）放进 `assets/img/`，例如 `qr-official.png`、`qr-channel.png`。
2. 在 `data.js` 里改路径，并把 `wechat.demo` 改为 `false`（卡片上的「DEMO · 虚拟」角标会消失），同时把 `qrHint` / `hint` 换成正式说明：
   ```js
   demo: false,
   officialQr: 'assets/img/qr-official.png',
   channelQr:  'assets/img/qr-channel.png',
   qrHint: '微信内打开更佳 · 长按识别二维码',
   ```
3. 把 `officialUrl` / `officialArticleUrl` / `channelUrl` 换成真实**绝对地址**（`https://…`）；`SITE.social` 里「公众号 / 视频号」两条也一起换。代码会自动识别：绝对地址用 `↗` 并在新窗口打开（带 `rel="noopener noreferrer"`），站内相对地址用 `→` 且同窗口打开。
4. 同步把连接页 / 首页 CTA 里「当前为虚拟二维码与演示链接」的静态说明文字改掉（在 `connect.html`、`index.html` 中搜索「演示」即可定位）。
5. 二维码仍采用「二维码 + 外链卡片」方式，**不依赖任何自动同步接口**；微信内打开体验更佳的提示保留。

重新生成虚拟二维码图：`node scripts/gen-placeholders.mjs`（会覆盖 `assets/img/` 下全部占位 SVG，已替换的真实图片请先备份）。

---

## 五、部署到 `YuSpectra/chaiAI` / GitHub Pages

本目录已带好发布配置，**推到 `main` 即自动上线**。关键点是复用原仓库已有的 `.github/workflows/deploy.yml`（`npm ci → npm run build → 上传 dist → 部署 Pages`），**不需要改动 workflow 文件**：

| 文件 | 作用 |
|---|---|
| `package.json` | 覆盖原 Vite 的配置；`build` 改为运行 `scripts/build-static.mjs`，`check` 跑站点自检 |
| `package-lock.json` | 零依赖 lock，让 workflow 的 `npm ci` 瞬间通过（**必须一起上传**，否则 `npm ci` 会因与旧 lock 不匹配而失败） |
| `scripts/build-static.mjs` | 只用 Node 内置模块，把 11 个 HTML + `assets/` + SEO 文件整理到 `dist/` |
| `.github/workflows/deploy.yml` | **可选**，给全新仓库用的纯静态 workflow。推到 `YuSpectra/chaiAI` 时不要上传它（API 修改 workflow 需要额外 `workflow` 权限），原 workflow 已够用；在 GitHub 网页端上传则无此限制 |

原仓库是 Vite + React 项目（约 2.5 万个文件，另有 `worker/`、`public/`、`.claude/` 与邮件自动回复 workflow）。**替换时只新增/覆盖下列文件，不删除任何旧文件**，旧项目代码仍留在仓库里，可以随时回退：

```
根目录 11 个 html + sitemap.xml / rss.xml / robots.txt（新增/覆盖）
package.json + package-lock.json（覆盖原 Vite 的）
assets/                     （整目录）
scripts/                    （新增 3 个 .mjs，保留原有脚本）
README.md                   （覆盖）
.github/                    （不上传，保留原仓库的 deploy.yml 与 mail-autoreply.yml）
```

安全做法（先把当前 main 备份成分支，再推送）：

```bash
git clone https://github.com/YuSpectra/chaiAI.git
cd chaiAI
git branch legacy-chai-workshop        # 备份旧站
git push origin legacy-chai-workshop   # 旧项目完整保留，随时可回滚
# 把上面列出的文件复制/覆盖进来
git add -A && git commit -m "redesign: 观子喻知 YuSpectra 浅色简约个人品牌站"
git push origin main                   # 自动触发 Pages 部署
```

自定义域名在仓库 Settings → Pages 里已绑定 `chai.aibay.asia`，不需要 `CNAME` 文件；站点内所有 canonical / sitemap / RSS / 分享链接也已指向该域名。

> 若只想先预览、不动线上：把改动推到 `yu-spectra-redesign` 分支，在 GitHub 上对比后再合并 `main`。
> 若部署在子路径（如 `https://username.github.io/chaiAI/`），页面资源用相对路径可直接工作，但 canonical / sitemap / rss 需要改成带子路径的绝对地址。

---

## 六、SEO 与可访问性

- 每个页面都有独立的 `<title>`、`<meta name="description">`、canonical 与 Open Graph 信息；文章/视频详情页会按 `?slug=` 动态改写 title、description、og 与 canonical。
- 首页注入 `WebSite + SearchAction` 结构化数据；文章详情注入 `BlogPosting`；视频详情注入 `VideoObject`（均为 JSON-LD）。
- `sitemap.xml`、`rss.xml`、`robots.txt` 已生成；`404.html` 可直接作为 GitHub Pages 的 404 页。
- 可访问性：键盘焦点高亮（`:focus-visible`）、所有图片有 `alt`、灯箱支持 Esc / ← → 且可关闭、`prefers-reduced-motion` 下关闭全部动效与滚动显现、正文对比度 > 7:1、`html/body` 禁止横向滚动、移动端汉堡菜单带 `aria-expanded`。

---

## 七、交互一览

吸顶半透明导航 / 移动端汉堡菜单 / 首页静态内容标签 / 卡片轻微悬停反馈 / 标签筛选 + 笔记搜索 / 全站实时搜索 / 瀑布流灯箱（左右切换、Esc 关闭）/ 混合内容时间线 / 复制链接 + toast / 回到顶部 / 轻量滚动淡入 / 外链新窗口打开。

字体使用 Space Grotesk + Noto Sans SC（Google Fonts 在线加载）；离线或网络受限时自动降级到系统字体，不影响浏览。所有动效时长 240–300ms。
