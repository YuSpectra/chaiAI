#!/usr/bin/env python3
"""访客留言自动回信。

链路：
    访客提交表单 → FormSubmit 转发到站长 QQ 邮箱
        → 本脚本定时扫收件箱里最近的通知邮件
        → 取出访客邮箱，用 QQ SMTP 回一封确认信
        → 把那封通知复制一份到 ChaiReplied 文件夹，作为"已回信"的记号

为什么这么麻烦（QQ 邮箱 IMAP 的三个坑，都是实测出来的）：
  1. 不支持 FROM 搜索（返回空）→ 只能用 SINCE 按日期取，再本地按 From 过滤。
  2. 不支持自定义关键字（STORE 返回 OK 但 FLAGS 不变）→ 不能用 $Replied 标记。
  3. 不支持 HEADER 搜索 → 只能把整段 header 拉回来自己比对。
  另外「已读」标记靠不住：QQ 客户端同步时会把邮件自动标成已读，
  所以不能用 UNSEEN 判断"是否回过"，否则你在手机上瞄一眼，访客就永远收不到回信。

其他设计取舍：
  * 只用标准库（smtplib / imaplib / email），Actions 上不需要装依赖。
  * 先发信成功、再写记号；发信失败就不写，下一轮自动重试。
  * 绝不回给站长自己、也绝不回给 formsubmit.co（防邮件回路）。
  * 单轮最多回 MAX_PER_RUN 封，防止有人刷表单把发信额度打爆。

环境变量：
    QQ_USER          必填，QQ 邮箱地址
    QQ_AUTH_CODE     必填，QQ 邮箱 SMTP/IMAP 授权码
    OWNER_EMAIL      选填，默认等于 QQ_USER
    IMAP_HOST        选填，默认 imap.qq.com
    SMTP_HOST        选填，默认 smtp.qq.com
    MAX_PER_RUN      选填，单轮最多回几封，默认 20
    LOOKBACK_DAYS    选填，往回扫几天，默认 14
    TEST_TO_OVERRIDE 选填，测试用：所有回信改投这个地址，不发真实访客
    DRY_RUN          选填，设为 1 则只打印不发送、不写记号
"""

from __future__ import annotations

import datetime as dt
import email
import html
import imaplib
import os
import re
import smtplib
import ssl
import sys
import time
from email.header import decode_header, make_header
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid, parseaddr

IMAP_HOST = os.environ.get("IMAP_HOST", "imap.qq.com")
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.qq.com")
QQ_USER = (os.environ.get("QQ_USER") or "").strip()
QQ_AUTH_CODE = (os.environ.get("QQ_AUTH_CODE") or "").strip()
OWNER_EMAIL = (os.environ.get("OWNER_EMAIL") or QQ_USER).strip().lower()
MAX_PER_RUN = int(os.environ.get("MAX_PER_RUN") or 20)
LOOKBACK_DAYS = int(os.environ.get("LOOKBACK_DAYS") or 14)
TEST_TO = (os.environ.get("TEST_TO_OVERRIDE") or "").strip()
DRY_RUN = os.environ.get("DRY_RUN") == "1"

FORM_SUBMIT_FROM = "formsubmit.co"
DEDUPE_FOLDER = "ChaiReplied"
DEDUPE_MAX = 400  # 记号文件夹超过这个数就裁掉最旧的

SITE_URL = "https://yuspectra.github.io/chaiAI/"
WECHAT = "ikoning365"

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")

KIND_TEXT = {
    "站内留言": {
        "subject": "已收到你的留言",
        "lead": "谢谢你给拆AI 留言，我们已经收到了。",
        "next": "杨教练会逐条看，通常 24 小时内回复到你邮箱。",
    },
    "工作坊需求": {
        "subject": "已收到你的需求",
        "lead": "谢谢你提的需求，我们已经收到了。",
        "next": "我们会按需求出现的频次排期，定了之后优先通知你。",
    },
    "拆搭子牵线": {
        "subject": "已收到你的牵线申请",
        "lead": "谢谢你申请拆搭子牵线，我们已经收到。",
        "next": "确认双方意向后，我们会把对接方式发给你。",
    },
}
DEFAULT_KIND_TEXT = {
    "subject": "已收到你的来信",
    "lead": "谢谢你联系拆AI，我们已经收到你的信息。",
    "next": "杨教练通常会在 24 小时内回复你。",
}

LETTER_URL = SITE_URL.rstrip("/") + "/about"

# 直投读者来信（不经过表单的普通邮件）：回一封确认信。
# 系统信 / 自己的信 / 邮件线程（Re:）/ 自动邮件一律不回，防回路、防骚扰机器人。
SYSTEM_SENDER_RE = re.compile(
    r"(noreply|no-reply|postmaster|mailer-daemon|notifications@github|@github\.com|formsubmit\.co)",
    re.I,
)


def reader_addr(orig: email.message.Message):
    """直投来信 → (addr, name)；不值得回的信 → None。"""
    raw_from = decode_hdr(orig.get("From"))
    name, addr = parseaddr(raw_from)
    addr = (addr or "").strip().lower()
    if not addr or addr == OWNER_EMAIL:
        return None
    if SYSTEM_SENDER_RE.search(addr):
        return None
    subj = decode_hdr(orig.get("Subject")).strip().lower()
    if subj.startswith(("re:", "答复:", "回复:", "自动回复")):
        return None  # 已经在对话线程里，不再自动插话
    auto = (orig.get("Auto-Submitted") or "").strip().lower()
    if auto and auto != "no":
        return None
    return addr, name.strip('" \'').strip()


def build_letter_ack(addr: str, name: str, orig: email.message.Message) -> EmailMessage:
    """直投来信的确认信：固定模板（不代答内容，答内容由站长/来信选登完成）。"""
    greeting = f"{name}，你好：" if name else "你好："
    text_parts = [
        greeting,
        "",
        "谢谢你给拆AI 写信，信已经收到，杨教练会逐封亲自看。",
        "如果你的问题有普遍性，我们会把回答整理成笔记，公开在网站「关于 · 读者来信」栏目：",
        LETTER_URL,
        "",
        f"如果着急，也可以直接加微信 {WECHAT}。",
        "",
        "—— 拆AI · 杨教练",
        SITE_URL,
        "",
        "这是一封系统自动发送的确认信，直接回复即可联系到真人。",
    ]
    html_body = f"""\
<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px 12px;background:#f5f5f7;
             font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;
              padding:32px 28px;box-shadow:0 1px 3px rgba(0,0,0,.06);">
    <div style="font-size:12px;letter-spacing:.16em;color:#0071e3;
                text-transform:uppercase;margin-bottom:18px;">拆AI · CHAI</div>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.75;color:#1d1d1f;">{html.escape(greeting)}</p>
    <p style="margin:0 0 10px;font-size:15px;line-height:1.75;color:#1d1d1f;">
      谢谢你给拆AI 写信，信已经收到，杨教练会逐封亲自看。
    </p>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.75;color:#1d1d1f;">
      如果你的问题有普遍性，我们会把回答整理成笔记，公开在
      <a href="{LETTER_URL}" style="color:#0071e3;text-decoration:none;">网站「关于 · 读者来信」栏目</a>。
    </p>
    <div style="border-left:3px solid #0071e3;padding:2px 0 2px 14px;margin:0 0 24px;">
      <p style="margin:0;font-size:14px;line-height:1.7;color:#6e6e73;">
        着急的话可以直接加微信 <strong style="color:#1d1d1f;">{WECHAT}</strong>，
        或者直接回复这封邮件补充内容。
      </p>
    </div>
    <p style="margin:0;font-size:14px;line-height:1.7;color:#1d1d1f;">
      —— 拆AI · 杨教练<br>
      <a href="{SITE_URL}" style="color:#0071e3;text-decoration:none;">{SITE_URL}</a>
    </p>
    <p style="margin:22px 0 0;padding-top:16px;border-top:1px solid #e8e8ed;
              font-size:12px;line-height:1.6;color:#86868b;">
      这是一封系统自动发送的确认信，说明你的来信已经进了我们的收件箱。直接回复本邮件即可联系到真人。
    </p>
  </div>
</body></html>"""
    msg = EmailMessage()
    msg["From"] = formataddr(("拆AI · 杨教练", QQ_USER))
    msg["To"] = addr
    orig_subject = decode_hdr(orig.get("Subject"))
    msg["Subject"] = f"Re: {orig_subject}" if orig_subject else "已收到你的来信"
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain="qq.com")
    msg["Auto-Submitted"] = "auto-replied"
    msg["X-Chai-Autoreply"] = "1"
    orig_id = (orig.get("Message-ID") or "").strip()
    if orig_id:
        msg["In-Reply-To"] = orig_id
        msg["References"] = orig_id
    msg.set_content("\n".join(text_parts))
    msg.add_alternative(html_body, subtype="html")
    return msg


# ---------------------------------------------------------------- 连接


def imap_connect() -> imaplib.IMAP4_SSL:
    conn = imaplib.IMAP4_SSL(IMAP_HOST, 993, ssl_context=ssl.create_default_context())
    conn.login(QQ_USER, QQ_AUTH_CODE)
    # QQ 邮箱要求客户端发 ID 命令，否则会报 "Unsafe Login"
    try:
        imaplib.Commands["ID"] = ("AUTH",)
        conn._simple_command("ID", '("name" "chai-autoreply" "version" "1.0")')
        conn._untagged_response("OK", [None], "ID")
    except Exception as exc:  # 非致命
        print(f"  [warn] IMAP ID 命令失败（可忽略）：{exc}")
    return conn


def smtp_send(msg: EmailMessage) -> None:
    with smtplib.SMTP_SSL(SMTP_HOST, 465, timeout=30, context=ssl.create_default_context()) as s:
        s.login(QQ_USER, QQ_AUTH_CODE)
        s.send_message(msg)


# ---------------------------------------------------------------- 记号文件夹


def ensure_dedupe_folder(conn: imaplib.IMAP4_SSL) -> None:
    typ, _ = conn.select(f'"{DEDUPE_FOLDER}"')
    if typ == "OK":
        return
    print(f"  创建记号文件夹 {DEDUPE_FOLDER}")
    conn.create(DEDUPE_FOLDER)
    typ, data = conn.select(f'"{DEDUPE_FOLDER}"')
    if typ != "OK":
        raise RuntimeError(f"无法打开 {DEDUPE_FOLDER}: {data}")


def load_replied_ids(conn: imaplib.IMAP4_SSL) -> set[str]:
    """把记号文件夹里所有 Message-ID 读出来。"""
    conn.select(f'"{DEDUPE_FOLDER}"', readonly=True)
    typ, data = conn.select(f'"{DEDUPE_FOLDER}"')
    if typ != "OK":
        return set()
    typ, res = conn.uid("SEARCH", None, "ALL")
    if typ != "OK" or not res or not res[0]:
        return set()
    uids = res[0].split()
    if not uids:
        return set()
    ids: set[str] = set()
    span = f"{uids[0].decode()}:{uids[-1].decode()}"
    typ, chunks = conn.uid("FETCH", span, "(BODY.PEEK[HEADER.FIELDS (MESSAGE-ID)])")
    if typ != "OK":
        return set()
    for chunk in chunks:
        if isinstance(chunk, tuple) and len(chunk) > 1:
            m = re.search(rb"<[^>]+>", chunk[1])
            if m:
                ids.add(m.group(0).decode("ascii", "ignore").strip().lower())
    return ids


def prune_dedupe_folder(conn: imaplib.IMAP4_SSL) -> None:
    typ, data = conn.select(f'"{DEDUPE_FOLDER}"')
    if typ != "OK":
        return
    typ, res = conn.uid("SEARCH", None, "ALL")
    if typ != "OK" or not res or not res[0]:
        return
    uids = res[0].split()
    if len(uids) <= DEDUPE_MAX:
        return
    drop = uids[: len(uids) - DEDUPE_MAX]
    print(f"  记号文件夹已有 {len(uids)} 条，清理最旧 {len(drop)} 条")
    for uid in drop:
        conn.uid("STORE", uid, "+FLAGS", "\\Deleted")
    conn.expunge()


# ---------------------------------------------------------------- 解析通知


def cell_text(raw: str) -> str:
    """把 FormSubmit 表格单元格里的 HTML 变成纯文本。"""
    m = re.search(r"<pre[^>]*>(.*?)</pre>", raw, re.S)
    content = m.group(1) if m else re.sub(r"<[^>]+>", " ", raw)
    content = html.unescape(content)
    return re.sub(r"[ \t\r\f\v]+", " ", content).strip()


def parse_fields(msg: email.message.Message) -> dict[str, str]:
    body = ""
    for want in ("text/html", "text/plain"):
        for part in msg.walk():
            if part.get_content_type() == want:
                payload = part.get_payload(decode=True)
                if payload:
                    body = payload.decode(part.get_content_charset() or "utf-8", "ignore")
                    break
        if body:
            break

    fields: dict[str, str] = {}
    # 表格模板：<td><strong>标签</strong></td><td>值</td>
    for label, value in re.findall(
        r"<td[^>]*>\s*<strong>([\s\S]*?)</strong>\s*</td>\s*<td[^>]*>([\s\S]*?)</td>",
        body,
    ):
        key = cell_text(label)
        if key and key not in fields:
            fields[key] = cell_text(value)
    return fields


def decode_hdr(value: str | None) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value))).replace("\n", " ").strip()
    except Exception:
        return value.strip()


def pick_visitor_email(fields: dict[str, str], msg: email.message.Message) -> str:
    """访客邮箱：正文联系方式 > Reply-To > 任意字段里的邮箱。"""
    candidates: list[str] = []

    contact = fields.get("联系方式", "")
    if contact and not contact.startswith("（未填"):
        candidates += EMAIL_RE.findall(contact)

    reply_to = parseaddr(decode_hdr(msg.get("Reply-To")))[1]
    if reply_to:
        candidates.append(reply_to)

    for value in fields.values():
        candidates += EMAIL_RE.findall(value)

    for addr in candidates:
        addr = addr.strip().strip(".,;:").lower()
        if not addr or "@" not in addr:
            continue
        if addr == OWNER_EMAIL or addr.endswith("@" + FORM_SUBMIT_FROM):
            continue
        if addr.startswith(("no-reply", "noreply", "postmaster")):
            continue
        return addr
    return ""


# ---------------------------------------------------------------- 组装回信


def build_reply(
    visitor: str,
    fields: dict[str, str],
    orig_msg: email.message.Message,
) -> EmailMessage:
    kind = fields.get("表单类型", "").strip()
    copy = KIND_TEXT.get(kind, DEFAULT_KIND_TEXT)
    who = fields.get("称呼", "").strip()
    if not who or who.startswith("（未填"):
        who = ""

    quoted = [
        (label, fields.get(label, ""))
        for label in ("留言内容", "主体", "背景", "诉求")
        if fields.get(label) and not fields.get(label, "").startswith("（未填")
    ]

    greeting = f"{who}，你好：" if who else "你好："

    text_parts = [
        greeting,
        "",
        copy["lead"],
        copy["next"],
        "",
        f"如果着急，也可以直接加微信 {WECHAT}。",
        "",
        "—— 拆AI · 杨教练",
        SITE_URL,
        "",
        "-" * 46,
        "你提交的内容（系统自动留档，无需回复本信）：",
    ]
    for label, value in quoted:
        text_parts.append(f"  {label}：{value}")
    text_parts += ["", "这是一封系统自动发送的确认信，直接回复即可联系到我们。"]

    html_rows = "".join(
        f'<tr><td style="padding:6px 12px 6px 0;color:#6e6e73;white-space:nowrap;'
        f"vertical-align:top;font-size:13px\">{html.escape(label)}</td>"
        f'<td style="padding:6px 0;color:#1d1d1f;font-size:13px;'
        f'white-space:pre-wrap">{html.escape(value)}</td></tr>'
        for label, value in quoted
    )
    quote_block = (
        '<div style="background:#f5f5f7;border-radius:12px;padding:16px 18px;margin-bottom:24px;">'
        '<div style="font-size:11px;letter-spacing:.1em;color:#86868b;text-transform:uppercase;'
        'margin-bottom:10px;">你提交的内容</div>'
        f'<table style="border-collapse:collapse;width:100%;">{html_rows}</table></div>'
    ) if html_rows else ""

    html_body = f"""\
<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#f5f5f7;
             font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;
              padding:32px 28px;box-shadow:0 1px 3px rgba(0,0,0,.06);">
    <div style="font-size:12px;letter-spacing:.16em;color:#0071e3;
                text-transform:uppercase;margin-bottom:18px;">拆AI · CHAI</div>
    <h1 style="margin:0 0 18px;font-size:21px;line-height:1.4;color:#1d1d1f;font-weight:600;">
      {html.escape(copy["subject"])}
    </h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.75;color:#1d1d1f;">
      {html.escape(greeting)}
    </p>
    <p style="margin:0 0 10px;font-size:15px;line-height:1.75;color:#1d1d1f;">
      {html.escape(copy["lead"])}
    </p>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.75;color:#1d1d1f;">
      {html.escape(copy["next"])}
    </p>
    <div style="border-left:3px solid #0071e3;padding:2px 0 2px 14px;margin:0 0 24px;">
      <p style="margin:0;font-size:14px;line-height:1.7;color:#6e6e73;">
        着急的话可以直接加微信 <strong style="color:#1d1d1f;">{WECHAT}</strong>，
        或者直接回复这封邮件补充内容。
      </p>
    </div>
    {quote_block}
    <p style="margin:0;font-size:14px;line-height:1.7;color:#1d1d1f;">
      —— 拆AI · 杨教练<br>
      <a href="{SITE_URL}" style="color:#0071e3;text-decoration:none;">{SITE_URL}</a>
    </p>
    <p style="margin:22px 0 0;padding-top:16px;border-top:1px solid #e8e8ed;
              font-size:12px;line-height:1.6;color:#86868b;">
      这是一封系统自动发送的确认信，说明你的留言已经进了我们的收件箱。
      直接回复本邮件即可联系到真人。
    </p>
  </div>
</body></html>"""

    msg = EmailMessage()
    msg["From"] = formataddr(("拆AI · 杨教练", QQ_USER))
    msg["To"] = visitor
    orig_subject = decode_hdr(orig_msg.get("Subject"))
    msg["Subject"] = f"Re: {orig_subject}" if orig_subject else copy["subject"]
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain="qq.com")
    msg["Auto-Submitted"] = "auto-replied"
    msg["X-Chai-Autoreply"] = "1"

    orig_id = (orig_msg.get("Message-ID") or "").strip()
    if orig_id:
        msg["In-Reply-To"] = orig_id
        msg["References"] = orig_id

    msg.set_content("\n".join(text_parts))
    msg.add_alternative(html_body, subtype="html")
    return msg


# ---------------------------------------------------------------- 主流程


def main() -> int:
    if not QQ_USER or not QQ_AUTH_CODE:
        print("缺少 QQ_USER / QQ_AUTH_CODE，无法运行")
        return 2

    print(f"账号 {QQ_USER} · 回扫 {LOOKBACK_DAYS} 天 · 单轮上限 {MAX_PER_RUN}" + ("（DRY RUN）" if DRY_RUN else ""))
    if TEST_TO:
        print(f"⚠️  测试模式：所有回信改投 {TEST_TO}")

    conn = imap_connect()
    try:
        # 1. 读记号
        ensure_dedupe_folder(conn)
        replied_ids = load_replied_ids(conn)
        print(f"已回信记号：{len(replied_ids)} 条")

        # 2. 取最近 N 天的收件箱邮件，本地按发件人过滤
        typ, data = conn.select("INBOX")
        if typ != "OK":
            print(f"打开收件箱失败：{data}")
            return 1
        since = (dt.date.today() - dt.timedelta(days=LOOKBACK_DAYS)).strftime("%d-%b-%Y")
        typ, res = conn.uid("SEARCH", None, "SINCE", since)
        if typ != "OK":
            print(f"搜索失败：{typ} {res}")
            return 1
        uids = res[0].split() if res and res[0] else []
        print(f"{since} 之后的邮件：{len(uids)} 封")

        replied = skipped = failed = 0
        for uid in reversed(uids):  # 新的先处理
            if replied >= MAX_PER_RUN:
                print(f"达到单轮上限 {MAX_PER_RUN}，剩余留到下一轮")
                break

            typ, fetched = conn.uid("FETCH", uid, "(BODY.PEEK[])")
            if typ != "OK" or not fetched or not isinstance(fetched[0], tuple):
                print(f"  [uid {uid.decode()}] 读取失败")
                failed += 1
                continue

            orig = email.message_from_bytes(fetched[0][1])
            sender = decode_hdr(orig.get("From")).lower()
            subject = decode_hdr(orig.get("Subject"))
            msg_id = (orig.get("Message-ID") or "").strip().lower()

            if FORM_SUBMIT_FROM not in sender:
                # 直投读者来信：也回一封确认信（系统信/Re: 线程/自动信已被排除）
                ra = reader_addr(orig)
                if not ra or (msg_id and msg_id in replied_ids):
                    continue
                target_addr, target_name = ra
                dest = TEST_TO or target_addr
                print(f"  [uid {uid.decode()}] 读者来信 {subject[:34]!r} → {dest}")
                if DRY_RUN:
                    replied += 1
                    continue
                try:
                    smtp_send(build_letter_ack(dest, target_name, orig))
                except Exception as exc:
                    print(f"        发送失败：{type(exc).__name__}: {exc}")
                    failed += 1
                    time.sleep(1)
                    continue
                try:
                    typ, _ = conn.uid("COPY", uid, DEDUPE_FOLDER)
                    if typ == "OK" and msg_id:
                        replied_ids.add(msg_id)
                except Exception as exc:
                    print(f"        [warn] 写记号异常：{exc}")
                replied += 1
                print("        已回确认信")
                time.sleep(1)
                continue

            if msg_id and msg_id in replied_ids:
                print(f"  [uid {uid.decode()}] 已回过，跳过：{subject[:34]}")
                skipped += 1
                continue

            fields = parse_fields(orig)
            visitor = pick_visitor_email(fields, orig)
            if not visitor:
                print(f"  [uid {uid.decode()}] 访客没留邮箱，无法回信：{subject[:34]}")
                skipped += 1
                continue

            target = TEST_TO or visitor
            reply = build_reply(target, fields, orig)
            print(f"  [uid {uid.decode()}] {subject[:34]!r}")
            print(f"        称呼={fields.get('称呼', '')!r} 类型={fields.get('表单类型', '')!r} → {target}")

            if DRY_RUN:
                replied += 1
                continue

            try:
                smtp_send(reply)
            except Exception as exc:
                print(f"        发送失败：{type(exc).__name__}: {exc}")
                failed += 1
                time.sleep(1)
                continue

            # 发送成功后写记号（复制到 ChaiReplied，保留收件箱里原件不动）
            try:
                typ, _ = conn.uid("COPY", uid, DEDUPE_FOLDER)
                if typ != "OK":
                    print("        [warn] 写记号失败，下一轮可能重复回信")
                elif msg_id:
                    replied_ids.add(msg_id)
            except Exception as exc:
                print(f"        [warn] 写记号异常：{exc}")

            replied += 1
            print("        已回信")
            time.sleep(1)

        if not DRY_RUN and replied:
            prune_dedupe_folder(conn)

        print(f"\n完成：回信 {replied} 封，跳过 {skipped} 封，失败 {failed} 封")
        return 0 if failed == 0 else 1
    finally:
        try:
            conn.close()
        except Exception:
            pass
        try:
            conn.logout()
        except Exception:
            pass


if __name__ == "__main__":
    sys.exit(main())
