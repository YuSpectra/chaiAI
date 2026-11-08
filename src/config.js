// 站点对外联系方式与邮件网关配置——全站只在这里改一次
//
// 注意：这里只放「公开可见」的信息。邮箱的 SMTP 授权码属于密钥，
// 永远不能出现在前端代码里（仓库是公开的），它只存在于 Cloudflare Worker 的 Secret。

export const CONTACT_EMAIL = '1414330095@qq.com'
export const CONTACT_WECHAT = 'ikoning365'

// 邮件网关地址（Cloudflare Worker）。
// 留空 = 走 mailto 兜底（点提交会打开访客本机邮件客户端）。
// 也可以在构建时用环境变量注入：VITE_MAIL_API=https://xxx.workers.dev
export const MAIL_API = (import.meta.env.VITE_MAIL_API || '').trim()

export const MAIL_READY = /^https?:\/\//.test(MAIL_API)
