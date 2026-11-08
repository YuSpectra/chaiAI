// 站点对外联系方式与表单投递配置——全站只在这里改一次
//
// 投递链路：访客提交 → FormSubmit（免注册转发服务）→ CONTACT_EMAIL
// 这套方案不需要任何服务器，也不需要邮箱的 SMTP 授权码：
// 纯静态站点上任何"密钥"都会被打进公开的 JS bundle，所以干脆不持有密钥。

export const CONTACT_EMAIL = '1414330095@qq.com'
export const CONTACT_WECHAT = 'ikoning365'

// FormSubmit 的 AJAX 端点，把邮箱换掉就换收件人。
// 留空则前端退回 mailto（打开访客本机邮件客户端）。
export const FORM_ENDPOINT = `https://formsubmit.co/ajax/${CONTACT_EMAIL}`

export const FORM_READY = /^https?:\/\//.test(FORM_ENDPOINT)
