// chai-mail —— 拆AI 站点邮件网关（Cloudflare Worker）
//
// 职责：把站内表单（留言板 / 工作坊需求）转发到站长 QQ 邮箱，并给访客回一封确认信。
// 安全模型：QQ 授权码只存在于 Worker Secret（env.QQ_PASS），前端代码里永远拿不到。
// 平台约束：Workers 封禁 25 端口，故走 smtp.qq.com:465（隐式 TLS）。

import { connect } from 'cloudflare:sockets'

const SMTP_HOST = 'smtp.qq.com'
const SMTP_PORT = 465
const STEP_TIMEOUT = 20000

const te = new TextEncoder()

/* ---------------- 编码工具 ---------------- */

function b64(str) {
  const bytes = te.encode(str)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

function wrap76(s) {
  const out = []
  for (let i = 0; i < s.length; i += 76) out.push(s.slice(i, i + 76))
  return out.join('\r\n')
}

/** 去掉换行，防止邮件头注入（CRLF injection） */
function clean(v, max = 300) {
  return String(v ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, max)
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout:' + label)), ms)),
  ])
}

/* ---------------- 极简 SMTP 客户端（隐式 TLS） ---------------- */

class Smtp {
  constructor(socket) {
    this.socket = socket
    this.reader = socket.readable.getReader()
    this.writer = socket.writable.getWriter()
    this.decoder = new TextDecoder()
    this.buf = ''
  }

  async writeRaw(text) {
    await withTimeout(this.writer.write(te.encode(text)), STEP_TIMEOUT, 'write')
  }

  async line() {
    for (;;) {
      const i = this.buf.indexOf('\n')
      if (i >= 0) {
        const l = this.buf.slice(0, i).replace(/\r$/, '')
        this.buf = this.buf.slice(i + 1)
        return l
      }
      const { value, done } = await withTimeout(this.reader.read(), STEP_TIMEOUT, 'read')
      if (done) throw new Error('smtp: 连接被对端关闭')
      this.buf += this.decoder.decode(value, { stream: true })
    }
  }

  /** 读一个完整响应（支持 250-xxx 多行） */
  async reply() {
    const lines = []
    for (;;) {
      const l = await this.line()
      lines.push(l)
      if (l.length < 4 || l[3] !== '-') break
    }
    return { code: Number(lines[0].slice(0, 3)), lines }
  }

  async cmd(line, expect) {
    await this.writeRaw(line + '\r\n')
    const r = await this.reply()
    if (r.code !== expect) {
      throw new Error(`smtp: ${line.split(' ')[0]} -> ${r.code} ${r.lines.join(' | ')}`)
    }
    return r
  }

  async auth(user, pass) {
    await this.cmd('AUTH LOGIN', 334)
    await this.cmd(b64(user), 334)
    await this.writeRaw(b64(pass) + '\r\n')
    const r = await this.reply()
    if (r.code !== 235) throw new Error(`smtp: 认证失败 ${r.code} ${r.lines.join(' | ')}`)
  }

  close() {
    try { this.writer.releaseLock() } catch { /* noop */ }
    try { this.reader.releaseLock() } catch { /* noop */ }
    try { this.socket.close() } catch { /* noop */ }
  }
}

function buildMessage({ from, to, subject, text, replyTo }) {
  const domain = from.split('@')[1] || 'qq.com'
  const headers = [
    `From: "拆AI 站点" <${from}>`,
    `To: <${to}>`,
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ]
  if (replyTo) headers.push(`Reply-To: <${replyTo}>`)
  return headers.join('\r\n') + '\r\n\r\n' + wrap76(b64(text)) + '\r\n'
}

async function sendMail(env, { to, subject, text, replyTo }) {
  const user = env.QQ_USER
  if (!user || !env.QQ_PASS) throw new Error('缺少 QQ_USER / QQ_PASS secret')

  const socket = connect({ hostname: SMTP_HOST, port: SMTP_PORT }, { secure: 'on' })
  const s = new Smtp(socket)
  try {
    const greet = await s.reply()
    if (greet.code !== 220) throw new Error('smtp: 握手失败 ' + greet.code)

    await s.cmd(`EHLO ${env.EHLO_DOMAIN || 'chai-site'}`, 250)
    await s.auth(user, env.QQ_PASS)
    await s.cmd(`MAIL FROM:<${user}>`, 250)
    await s.cmd(`RCPT TO:<${to}>`, 250)
    await s.cmd('DATA', 354)

    const msg = buildMessage({ from: user, to, subject, text, replyTo })
    // base64 正文不会产生以 "." 开头的行，无需 dot-stuffing
    await s.writeRaw(msg + '.\r\n')

    const done = await s.reply()
    if (done.code !== 250) throw new Error(`smtp: 投递失败 ${done.code} ${done.lines.join(' | ')}`)

    await s.writeRaw('QUIT\r\n').catch(() => {})
    return true
  } finally {
    s.close()
  }
}

/* ---------------- HTTP 层 ---------------- */

function corsHeaders(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)
  if (!origin || !allowed.includes(origin)) return { Vary: 'Origin' }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(body, status, origin, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin, env) },
  })
}

// 尽力而为的限流：同一 IP 10 分钟内最多 5 次（isolate 重启会重置，够挡脚本刷）
const hits = new Map()
const WINDOW = 10 * 60 * 1000
const MAX_HITS = 5

function rateLimited(ip) {
  const now = Date.now()
  const arr = (hits.get(ip) || []).filter(t => now - t < WINDOW)
  if (arr.length >= MAX_HITS) {
    hits.set(ip, arr)
    return true
  }
  arr.push(now)
  hits.set(ip, arr)
  if (hits.size > 5000) hits.clear()
  return false
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function composeEmail(d) {
  const kind = d.kind === 'need' ? '工作坊需求' : '站内留言'
  const who = clean(d.name, 40) || '匿名站友'
  const contact = clean(d.contact, 120)
  const lines = [
    `【${kind}】`,
    '',
    `称呼：${who}`,
    `联系方式：${contact || '（未留，无需回复）'}`,
    `来源：${clean(d.source, 60) || '未知页面'}`,
    `时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}（北京时间）`,
    '',
    '—— 内容 ——',
  ]
  if (d.kind === 'need') {
    lines.push(
      `想拆的软件：${clean(d.software, 200) || '（未填）'}`,
      `现在怎么做：${clean(d.scene, 800) || '（未填）'}`,
      `期望效果：${clean(d.expect, 800) || '（未填）'}`,
    )
  } else {
    lines.push(clean(d.msg, 1200) || '（空白）')
  }
  lines.push('', '—— 直接回复本邮件即可联系对方（若对方留了邮箱）——')
  return {
    subject: `【拆AI·${kind}】${who}`,
    text: lines.join('\n'),
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ''

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin, env) })
    }
    if (request.method === 'GET') {
      return json({ ok: true, service: 'chai-mail', ready: Boolean(env.QQ_USER && env.QQ_PASS) }, 200, origin, env)
    }
    if (request.method !== 'POST') {
      return json({ ok: false, error: 'method not allowed' }, 405, origin, env)
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
    if (rateLimited(ip)) {
      return json({ ok: false, error: '提交太频繁了，请过几分钟再试' }, 429, origin, env)
    }

    let d
    try {
      d = await request.json()
    } catch {
      return json({ ok: false, error: '请求格式不对' }, 400, origin, env)
    }

    // 蜜罐：真人不填，机器人必填
    if (clean(d.website, 100)) return json({ ok: true, mailed: false }, 200, origin, env)

    const to = env.MAIL_TO || env.QQ_USER
    if (!to) return json({ ok: false, error: '服务未配置收件地址' }, 500, origin, env)

    const { subject, text } = composeEmail(d)
    const contact = clean(d.contact, 120)
    const visitorMail = EMAIL_RE.test(contact) && contact !== to ? contact : ''

    try {
      await sendMail(env, { to, subject, text, replyTo: visitorMail })

      // 自动回复：只在访客留了邮箱、且未关闭时发，失败不影响主流程
      let replied = false
      if (visitorMail && env.AUTO_REPLY !== 'off') {
        try {
          await sendMail(env, {
            to: visitorMail,
            subject: '已收到你的留言 · 拆AI 工作坊',
            text: [
              '你好，',
              '',
              '你的留言已经收到，我会亲自看，有需要会邮件回复你。',
              '',
              '—— 你提交的内容 ——',
              text,
              '',
              '此信由系统自动发出，直接回复本邮件即可。',
              '玄龙·拆AI | 小蛮腰 AI 拆书工作坊',
            ].join('\n'),
          })
          replied = true
        } catch (e) {
          console.error('auto-reply failed:', e.message)
        }
      }

      return json({ ok: true, mailed: true, replied }, 200, origin, env)
    } catch (e) {
      console.error('mail failed:', e.message)
      return json({ ok: false, error: '邮件发送失败，请直接发邮件联系我们' }, 502, origin, env)
    }
  },
}
