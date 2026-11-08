#!/usr/bin/env python3
"""观子喻知 YuSpectra — 读者来信自动回信。

链路（两条入口，同一个收件箱）：
    A. 读者在 connect.html 填表 → FormSubmit 转发到 QQ 邮箱
    B. 读者直接写信到 QQ 邮箱，主题带「【读者来信】」
        → 本脚本每 5 分钟扫一次收件箱
        → 认出访客邮箱，用 QQ SMTP 回一封确认信
        → 把原邮件复制到 ChaiReplied 文件夹，作为「已回信」记号

为什么不用「已读」判断：
    QQ 客户端同步时会把邮件自动标成已读，用 UNSEEN 会导致
    「你在手机上瞄一眼，访客就永远收不到回信」。

设计取舍：
  * 只用标准库（smtplib / imaplib / email），Actions 上不装依赖。
  * 先发信成功、再写记号；发信失败不写，下一轮自动重试。
  * 绝不回给站长自己、formsubmit.co、no-reply / mailer-daemon（防回路）。
  * 单轮最多回 MAX_PER_RUN 封，防止被刷。

环境变量：
    QQ_USER          必填，QQ 邮箱地址
    QQ_AUTH_CODE     必填，QQ 邮箱 SMTP/IMAP 授权码
    OWNER_EMAIL      选填，默认等于 QQ_USER
    IMAP_HOST        选填，默认 imap.qq.com
    SMTP_HOST        选填，默认 smtp.qq.com
    MAX_PER_RUN      选填，单轮最多回几封，默认 20
    LOOKBACK_DAYS    选填，往回扫几天，默认 14
    TEST_TO_OVERRIDE 选填，测试用：所有回信改投这个地址
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
DEDUPE_FOLDER = "ChaiReplied"          # 沿用旧文件夹名，历史记号继续有效
DEDUPE_MAX = 400
DIRECT_SUBJECT_KEYS = ("读者来信",)   # 直投信必须带这四个字，避免误认通知邮件
# 系统/通知类发件人：绝不回信（否则会把 GitHub 构建通知当成读者来信）
SYSTEM_LOCAL_EXACT = {
    "no-reply", "noreply", "no_reply", "postmaster", "mailer-daemon",
    "notifications", "notification", "support", "service", "bounce",
}
SYSTEM_ADDRESSES = {"10000@qq.com", "10000@vip.qq.com"}
SYSTEM_DOMAINS = ("github.com", "githubusercontent.com", "formsubmit.co")

SITE_URL = "https://yuspectra.github.io/chaiAI/"
SIGN_NAME = "观子喻知 YuSpectra"
SIGN_PERSON = "子喻"
ACCENT = "#1c6b64"

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
TAG_RE = re.compile(r"<[^>]+>")

KIND_TEXT = {
    "读者来信": {
        "subject": "已收到你的来信",
        "lead": "谢谢你写信来，已经收到了。",
        "next": "我会亲自读每一封，通常 24 小时内回到你的邮箱。",
    },
    "内容交流": {
        "subject": "已收到你的交流",
        "lead": "谢谢你愿意聊这些，已经收到了。",
        "next": "如果提到的问题正好和最近的笔记相关，我会连同回答一起写出来。",
    },
    "合作咨询": {
        "subject": "已收到你的合作咨询",
        "lead": "谢谢你想到观子喻知，来信已经收到。",
        "next": "我会按内容方向判断是否合适，合适的话两天内回你具体安排。",
    },
}
DEFAULT_KIND_TEXT = {
    "subject": "已收到你的来信",
    "lead": "谢谢你联系观子喻知，来信已经收到。",
    "next": "我通常会在 24 小时内回到你的邮箱。",
}

# 留言者选择的「是否愿意公开」决定回信里追加的说明
SHARE_NOTES = {
    "愿意": (
        "另外，这次的问题我会整理成一篇匿名回信笔记，放进网站的「读者来信」栏目——只会出现问题的"
        "转述，不会出现你的任何信息。"
    ),
    "不愿意": "另外，放心：你写的内容只会留在我的私人记录里，不会出现在网站上。",
}


# ---------------------------------------------------------------- 基础工具


def decode_hdr(value) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value)))
    except Exception:
        return str(value)


def cell_text(raw: str) -> str:
    text = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", raw or "")
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = TAG_RE.sub(" ", text)
    text = html.unescape(text).replace("\xa0", " ")
    return re.sub(r"[ \t\r\f\v]+", " ", text).strip()


def clean_header(value: str) -> str:
    """邮件头不能含换行：折行的主题解码后可能带 \\r\\n，必须压成单行。"""
    return re.sub(r"\s+", " ", (value or "")).strip()


def is_system_sender(addr: str) -> bool:
    addr = (addr or "").strip().lower()
    if not addr or "@" not in addr:
        return True
    local, _, domain = addr.partition("@")
    if addr in SYSTEM_ADDRESSES or addr == OWNER_EMAIL:
        return True
    if local in SYSTEM_LOCAL_EXACT or local.startswith(("no-reply", "noreply", "no_reply")):
        return True
    if domain in SYSTEM_DOMAINS or domain.endswith(".github.com"):
        return True
    return False


def message_text(msg) -> str:
    """取出正文（优先 HTML，FormSubmit 的表格在 HTML 里）。"""
    html_part, plain_part = "", ""
    for part in msg.walk():
        ctype = part.get_content_type()
        if part.get_content_maintype() == "multipart":
            continue
        try:
            payload = part.get_payload(decode=True)
        except Exception:
            continue
        if payload is None:
            continue
        charset = part.get_content_charset() or "utf-8"
        try:
            text = payload.decode(charset, errors="replace")
        except LookupError:
            text = payload.decode("utf-8", errors="replace")
        if ctype == "text/html" and not html_part:
            html_part = text
        elif ctype == "text/plain" and not plain_part:
            plain_part = text
    return html_part or plain_part


def parse_form_fields(body: str) -> dict:
    fields = {}
    for label, value in re.findall(
        r"<td[^>]*>\s*<strong>([\s\S]*?)</strong>\s*</td>\s*<td[^>]*>([\s\S]*?)</td>", body
    ):
        key = cell_text(label)
        if key and key not in fields:
            fields[key] = cell_text(value)
    return fields


def pick_visitor_email(fields: dict, msg) -> str:
    candidates = []
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
        if addr.endswith("@" + FORM_SUBMIT_FROM):
            continue
        if is_system_sender(addr):
            continue
        return addr
    return ""


# ---------------------------------------------------------------- IMAP / SMTP


def imap_connect() -> imaplib.IMAP4_SSL:
    conn = imaplib.IMAP4_SSL(IMAP_HOST, 993, ssl_context=ssl.create_default_context())
    conn.login(QQ_USER, QQ_AUTH_CODE)
    # QQ 邮箱要求客户端先发 ID 命令，否则报 "Unsafe Login"
    try:
        imaplib.Commands["ID"] = ("AUTH",)
        conn._simple_command("ID", '("name" "yuspectra-autoreply" "version" "2.0")')
        conn._untagged_response("OK", [None], "ID")
    except Exception as exc:  # 非致命
        print(f"  [warn] IMAP ID 命令失败（可忽略）：{exc}")
    return conn


def smtp_send(msg: EmailMessage) -> None:
    with smtplib.SMTP_SSL(SMTP_HOST, 465, timeout=30, context=ssl.create_default_context()) as s:
        s.login(QQ_USER, QQ_AUTH_CODE)
        s.send_message(msg)


def ensure_dedupe_folder(conn) -> None:
    typ, _ = conn.select(f'"{DEDUPE_FOLDER}"')
    if typ != "OK":
        conn.create(DEDUPE_FOLDER)


def load_replied_ids(conn) -> set:
    ids = set()
    typ, _ = conn.select(f'"{DEDUPE_FOLDER}"')
    if typ != "OK":
        return ids
    typ, data = conn.uid("SEARCH", None, "ALL")
    if typ != "OK" or not data or not data[0]:
        return ids
    uids = data[0].split()
    for start in range(0, len(uids), 100):
        chunk = b",".join(uids[start:start + 100]).decode()
        typ, fetched = conn.uid("FETCH", chunk, "(BODY.PEEK[HEADER.FIELDS (MESSAGE-ID)])")
        if typ != "OK":
            continue
        for item in fetched:
            if isinstance(item, tuple):
                mid = re.search(rb"Message-ID:\s*(<[^>]+>)", item[1], re.I)
                if mid:
                    ids.add(mid.group(1).decode(errors="replace").strip().lower())
    return ids


def prune_dedupe_folder(conn) -> None:
    typ, _ = conn.select(f'"{DEDUPE_FOLDER}"')
    if typ != "OK":
        return
    typ, data = conn.uid("SEARCH", None, "ALL")
    if typ != "OK" or not data or not data[0]:
        return
    uids = data[0].split()
    if len(uids) <= DEDUPE_MAX:
        return
    for uid in uids[: len(uids) - DEDUPE_MAX]:
        conn.uid("STORE", uid, "+FLAGS", "\\Deleted")
    conn.expunge()


# ---------------------------------------------------------------- 回信内容


def reply_text(name: str, copy: dict, quoted: list, share_note: str = "") -> tuple[str, str]:
    hello = f"{name}，你好：" if name else "你好："
    lines = [hello, "", copy["lead"], copy["next"]]
    if share_note:
        lines.append(share_note)
    lines += ["", "这封信可以直接回复，我会收到。", ""]
    lines += [f"—— {SIGN_PERSON}", SITE_URL, ""]
    if quoted:
        lines += ["-" * 46, "你提交的内容（系统自动留档，无需回复本信）："]
        lines += [f"  {label}：{value}" for label, value in quoted]
        lines += [""]
    lines += ["这封信自动发出，直接回复即可。"]
    text = "\n".join(lines)

    rows = "".join(
        f'<tr><td style="padding:8px 12px;color:#6b7482;font-size:13px;white-space:nowrap;'
        f'vertical-align:top">{html.escape(label)}</td>'
        f'<td style="padding:8px 12px;color:#1c2431;font-size:13px;line-height:1.7">'
        f'{html.escape(value).replace(chr(10), "<br>")}</td></tr>'
        for label, value in quoted
    )
    table = (
        f'<div style="margin:2px 0 22px"><div style="font-size:12px;color:#6b7482;'
        f'letter-spacing:.06em;margin-bottom:6px">你提交的内容</div>'
        f'<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;'
        f'background:#f8f9fb;border:1px solid #e5e8ed;border-radius:8px;border-collapse:separate">'
        f'{rows}</table></div>'
    ) if quoted else ""

    share_html = (
        f'<p style="font-size:14px;line-height:1.8;color:#3b4657;margin:0 0 10px">'
        f'{html.escape(share_note)}</p>'
    ) if share_note else ""

    html_body = f"""<!doctype html>
<html lang="zh-CN"><body style="margin:0;padding:0;background:#f5f6f8">
<div style="max-width:600px;margin:0 auto;padding:32px 20px;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif">
  <div style="background:#ffffff;border:1px solid #e5e8ed;border-radius:12px;padding:32px 30px">
    <div style="font-size:11px;letter-spacing:.14em;color:{ACCENT};margin-bottom:14px">{SIGN_NAME}</div>
    <h1 style="font-size:20px;font-weight:500;color:#1c2431;margin:0 0 18px">{html.escape(copy["subject"])}</h1>
    <p style="font-size:14px;line-height:1.8;color:#1c2431;margin:0 0 12px">{html.escape(hello)}</p>
    <p style="font-size:14px;line-height:1.8;color:#3b4657;margin:0 0 10px">{html.escape(copy["lead"])}</p>
    <p style="font-size:14px;line-height:1.8;color:#3b4657;margin:0 0 20px">{html.escape(copy["next"])}</p>
    {share_html}
    <p style="font-size:14px;line-height:1.8;color:#3b4657;margin:0 0 24px;padding-left:12px;border-left:2px solid {ACCENT}">
      这封信可以直接回复，我会收到。
    </p>
    {table}
    <p style="font-size:14px;line-height:1.8;color:#1c2431;margin:0 0 2px">—— {SIGN_PERSON}</p>
    <p style="font-size:13px;margin:0 0 22px"><a href="{SITE_URL}" style="color:{ACCENT};text-decoration:none">{SITE_URL}</a></p>
    <div style="border-top:1px solid #e5e8ed;padding-top:14px;font-size:12px;color:#9aa2ae;line-height:1.7">
      这封信自动发出，直接回复即可联系到我。
    </div>
  </div>
</div>
</body></html>"""
    return text, html_body


def build_reply(to_addr: str, kind: str, fields: dict, orig, orig_subject: str, name: str) -> EmailMessage:
    copy = KIND_TEXT.get(kind, DEFAULT_KIND_TEXT)
    orig_subject = clean_header(orig_subject)
    name = clean_header(name)
    share_choice = (fields.get("是否愿意公开") or "").strip()
    share_note = SHARE_NOTES.get(share_choice, "")
    quoted = [
        (label, fields.get(label, ""))
        for label in ("留言内容", "是否愿意公开", "主体", "背景", "诉求")
        if fields.get(label) and not fields.get(label, "").startswith("（未填")
    ]
    text, html_body = reply_text(name, copy, quoted, share_note)

    msg = EmailMessage()
    msg["From"] = formataddr((f"{SIGN_NAME} · {SIGN_PERSON}", QQ_USER))
    msg["To"] = to_addr
    msg["Subject"] = f"Re: {orig_subject}" if orig_subject else copy["subject"]
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain="qq.com")
    msg["Auto-Submitted"] = "auto-replied"
    msg["X-Yu-Autoreply"] = "1"
    orig_id = (orig.get("Message-ID") or "").strip()
    if orig_id:
        msg["In-Reply-To"] = orig_id
        msg["References"] = orig_id
    msg.set_content(text)
    msg.add_alternative(html_body, subtype="html")
    return msg


# ---------------------------------------------------------------- 主流程


def classify(msg) -> tuple[str, dict, str, str]:
    """返回 (kind, fields, visitor_email, subject)；不是访客来信则返回空。"""
    sender = decode_hdr(msg.get("From")).lower()
    subject = decode_hdr(msg.get("Subject"))
    body = message_text(msg)

    # A. FormSubmit 转发
    if FORM_SUBMIT_FROM in sender:
        fields = parse_form_fields(body)
        kind = (fields.get("表单类型") or "读者来信").strip()
        visitor = pick_visitor_email(fields, msg)
        return kind, fields, visitor, subject

    # B. 读者直接写信（主题必须带「读者来信」）
    if any(k in (subject or "") for k in DIRECT_SUBJECT_KEYS):
        sender_addr = parseaddr(decode_hdr(msg.get("From")))[1].strip().lower()
        if is_system_sender(sender_addr):
            return "", {}, "", subject
        plain = cell_text(body)
        fields = {"留言内容": plain[:1200]} if plain else {}
        return "读者来信", fields, sender_addr, subject

    return "", {}, "", subject


def main() -> int:
    if not QQ_USER or not QQ_AUTH_CODE:
        print("[error] 缺少 QQ_USER / QQ_AUTH_CODE")
        return 2
    if DRY_RUN:
        print("[dry-run] 只检查，不发信、不写记号")

    conn = imap_connect()
    ensure_dedupe_folder(conn)
    replied_ids = load_replied_ids(conn)
    print(f"记号文件夹已有 {len(replied_ids)} 条回信记录")

    typ, _ = conn.select("INBOX")
    if typ != "OK":
        print("[error] 打不开收件箱")
        return 1
    since = (dt.date.today() - dt.timedelta(days=LOOKBACK_DAYS)).strftime("%d-%b-%Y")
    typ, data = conn.uid("SEARCH", None, "SINCE", since)
    uids = data[0].split() if typ == "OK" and data and data[0] else []
    print(f"收件箱自 {since} 起共 {len(uids)} 封，开始筛选")

    replied = skipped = failed = 0
    for uid in uids:
        if replied >= MAX_PER_RUN:
            print(f"已达单轮上限 {MAX_PER_RUN}，余下留到下一轮")
            break

        # 第一步：只取邮件头，便宜地筛掉大部分无关邮件
        typ, heads = conn.uid(
            "FETCH", uid,
            "(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT MESSAGE-ID AUTO-SUBMITTED X-YU-AUTOREPLY REPLY-TO)])",
        )
        if typ != "OK" or not heads or not isinstance(heads[0], tuple):
            continue
        head = email.message_from_bytes(heads[0][1])
        msg_id = (head.get("Message-ID") or "").strip().lower()
        if msg_id and msg_id in replied_ids:
            skipped += 1
            continue
        if head.get("X-Yu-Autoreply") or (head.get("Auto-Submitted") or "").lower() not in ("", "no"):
            skipped += 1
            continue

        sender = decode_hdr(head.get("From")).lower()
        sender_addr = parseaddr(decode_hdr(head.get("From")))[1].strip().lower()
        subject = decode_hdr(head.get("Subject"))
        is_form = FORM_SUBMIT_FROM in sender
        is_direct = any(k in (subject or "") for k in DIRECT_SUBJECT_KEYS) and not is_system_sender(sender_addr)
        if not (is_form or is_direct):
            skipped += 1
            continue

        # 第二步：候选邮件才拉全文
        typ, fetched = conn.uid("FETCH", uid, "(BODY.PEEK[])")
        if typ != "OK" or not fetched or not isinstance(fetched[0], tuple):
            continue
        orig = email.message_from_bytes(fetched[0][1])

        kind, fields, visitor, subject = classify(orig)
        if not visitor:
            skipped += 1
            continue

        name = (fields.get("称呼") or "").strip()
        to_addr = TEST_TO or visitor
        try:
            reply = build_reply(to_addr, kind, fields, orig, subject, name)
        except Exception as exc:            # 单封邮件异常不该拖垮整轮
            failed += 1
            print(f"  [error] 生成回信失败：{exc}")
            continue

        print(f"  回信 → {to_addr}（{kind}）主题：{subject[:40]}")
        if DRY_RUN:
            skipped += 1
            continue
        try:
            smtp_send(reply)
        except Exception as exc:
            failed += 1
            print(f"  [error] 发送失败，下轮重试：{exc}")
            continue

        replied += 1
        typ, _ = conn.uid("COPY", uid, DEDUPE_FOLDER)
        if typ == "OK" and msg_id:
            replied_ids.add(msg_id)

    prune_dedupe_folder(conn)
    try:
        conn.logout()
    except Exception:
        pass
    print(f"完成：回信 {replied} 封，跳过 {skipped} 封，失败 {failed} 封")
    return 0


if __name__ == "__main__":
    sys.exit(main())
