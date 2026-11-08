// 站内表单的统一投递层。
//
// 两条路径：
//   1. 配了 MAIL_API（Cloudflare Worker）→ POST 过去，由 Worker 用 QQ SMTP 发信 + 自动回复；
//   2. 没配 → 退回 mailto，帮访客把内容预填进本机邮件客户端，零后端也能用。

import { CONTACT_EMAIL, CONTACT_WECHAT, MAIL_API, MAIL_READY } from '../config'

const KIND_LABELS = {
  message: '站内留言',
  need: '工作坊需求',
  broker: '拆搭子牵线',
}

function buildMailto(payload) {
  const label = KIND_LABELS[payload.kind] || KIND_LABELS.message
  const subject = `【拆AI·${label}】${payload.name || payload.software || '匿名站友'}`

  const lines =
    (payload.kind || 'message') === 'message'
      ? [
          `称呼：${payload.name || '匿名'}`,
          `联系方式：${payload.contact || '（未填）'}`,
          '',
          payload.msg || '',
        ]
      : [
          `称呼：${payload.name || '（未填）'}`,
          `主题：${payload.software || '（未填）'}`,
          `背景：${payload.scene || '（未填）'}`,
          `诉求：${payload.expect || '（未填）'}`,
          `联系方式：${payload.contact || '（未填）'}`,
        ]

  const url = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
    lines.join('\n'),
  )}`
  window.location.href = url
}

/**
 * @returns {Promise<{ok:boolean, mailed?:boolean, replied?:boolean, fallback?:boolean, error?:string}>}
 */
export async function submitToOwner(payload) {
  // 蜜罐命中：当作成功，什么也不做
  if (String(payload.website || '').trim()) return { ok: true, mailed: false }

  if (!MAIL_READY) {
    buildMailto(payload)
    return { ok: true, fallback: true }
  }

  try {
    const res = await fetch(MAIL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.ok) return { ok: true, mailed: data.mailed, replied: data.replied }
    return { ok: false, error: data.error || '提交失败，请稍后再试' }
  } catch {
    return { ok: false, error: `网络异常——也可以直接发邮件到 ${CONTACT_EMAIL}，或加微信 ${CONTACT_WECHAT}` }
  }
}
