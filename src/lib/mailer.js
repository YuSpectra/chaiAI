// 站内表单的统一投递层。
//
// 两条路径：
//   1. 配了 FORM_ENDPOINT（FormSubmit）→ POST 过去，由它把内容转发到站长邮箱；
//   2. 没配 → 退回 mailto，帮访客把内容预填进本机邮件客户端。
//
// 用 application/x-www-form-urlencoded 提交是有意的：这是 CORS 的"简单请求"，
// 浏览器不会发预检（OPTIONS），少一个失败点。

import { CONTACT_EMAIL, CONTACT_WECHAT, FORM_ENDPOINT, FORM_READY } from '../config'

const KIND_LABELS = {
  message: '站内留言',
  need: '工作坊需求',
  broker: '拆搭子牵线',
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function fieldsOf(payload) {
  const kind = KIND_LABELS[payload.kind] ? payload.kind : 'message'
  const label = KIND_LABELS[kind]
  const who = (payload.name || '').trim()

  const f = {
    _subject: `【拆AI·${label}】${who || payload.software || '匿名站友'}`,
    _template: 'table',
    _captcha: 'false',
    表单类型: label,
    称呼: who || '（未填）',
    联系方式: (payload.contact || '').trim() || '（未填）',
    来源页面: payload.source || '未知页面',
  }

  if (kind === 'message') {
    f.留言内容 = (payload.msg || '').trim()
  } else {
    f.主题 = (payload.software || '').trim() || '（未填）'
    f.背景 = (payload.scene || '').trim() || '（未填）'
    f.诉求 = (payload.expect || '').trim() || '（未填）'
  }

  // 访客留的是邮箱 → 让站长在收件箱里直接"回复"就能回到对方
  const contact = (payload.contact || '').trim()
  if (EMAIL_RE.test(contact) && contact !== CONTACT_EMAIL) f._replyto = contact

  // 蜜罐：真人看不到这个字段，机器人会把值填进来
  f._honey = (payload.website || '').trim()

  return f
}

function buildMailto(payload) {
  const f = fieldsOf(payload)
  const body = Object.keys(f)
    .filter(k => !k.startsWith('_'))
    .map(k => `${k}：${f[k]}`)
    .join('\n')
  window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(f._subject)}&body=${encodeURIComponent(body)}`
}

/**
 * @returns {Promise<{ok:boolean, mailed?:boolean, fallback?:boolean, error?:string}>}
 */
export async function submitToOwner(payload) {
  // 蜜罐命中：当作成功，什么也不做
  if (String(payload.website || '').trim()) return { ok: true, mailed: false }

  if (!FORM_READY) {
    buildMailto(payload)
    return { ok: true, fallback: true }
  }

  try {
    const res = await fetch(FORM_ENDPOINT, {
      method: 'POST',
      body: new URLSearchParams(fieldsOf(payload)),
    })
    const data = await res.json().catch(() => ({}))
    const ok = data.success === true || data.success === 'true'
    if (ok) return { ok: true, mailed: true }

    const message = typeof data.message === 'string' ? data.message : ''
    if (/activation/i.test(message)) {
      return { ok: false, error: `邮箱 ${CONTACT_EMAIL} 还没点确认信完成激活，激活后即可收信` }
    }
    return { ok: false, error: '提交失败，请稍后再试' }
  } catch {
    return {
      ok: false,
      error: `网络异常——也可以直接发邮件到 ${CONTACT_EMAIL}，或加微信 ${CONTACT_WECHAT}`,
    }
  }
}
