#!/usr/bin/env python3
"""autopilot.py — 自动驾驶员：零口令自进化闭环的心跳引擎（v3.1）.

把「扫热点选题 / 拉网站反馈 / 飞轮周报」三句日常口令变零——CI 定时跑本
脚本，或本机 cron 跑（ima 凭据不进 CI 时的本地心跳位）：

    每日: feedback_pull（QQ 邮箱→ima 网站邮箱信息）
          + interest_radar（四榜→ima 热点选题）
    每周: weekly_report（读台账→对账→三重交集选题→ima 周报+仓内 docs/）

用法:
    python3 scripts/autopilot.py                # 每日心跳（反馈+雷达）
    python3 scripts/autopilot.py weekly         # 周报（含每日心跳）
    python3 scripts/autopilot.py radar-only     # 只跑雷达（CI radar job 用）
    python3 scripts/autopilot.py feedback-only  # 只拉反馈

凭据（缺哪个跳过哪个，fail-soft 不报错——心跳不许断）:
    ima:   IMA_CLIENT_ID / IMA_API_KEY 环境变量（CI Secrets）或 ~/.config/ima/
    邮箱:  ~/.config/ima/email.json（host/user/password=QQ授权码）
    周报:  仓内 _rsi_ledger.md + docs/radar-latest.md（皆自动产物）

设计原则：仅标准库；所有外呼只读（R4）；单环节失败跳过并留痕，绝不断心跳。
"""

import json
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import ima_client

KB_DIR = {"feedback": ima_client.DIR_FEEDBACK, "radar": ima_client.DIR_RADAR, "weekly": ima_client.DIR_WEEKLY}
DEADLINE = None  # main() 里设为 12 分钟全局预算；各环节入库前自查

def _docs(name):
    """docs/ 不存在就建（fork 站常无 docs/，否则写报告直接 ENOENT 断掉整个 beat）。"""
    d = ROOT / "docs"
    d.mkdir(parents=True, exist_ok=True)
    return d / name



# ── 三大心跳环节（fail-soft） ──

def dec(v):
    """邮件头解码：QQ/FormSubmit 中转常带非标准 charset（unknown-8bit 等），LookupError 必须兜住。"""
    from email.header import decode_header
    out = ""
    for s, enc in decode_header(v or ""):
        if not isinstance(s, bytes):
            out += s
            continue
        try:
            out += s.decode(enc or "utf-8", "ignore")
        except (LookupError, UnicodeDecodeError):
            out += s.decode("utf-8", "ignore")
    return out


def body_of(part):
    """取邮件正文文本，非标准 charset 一律回退 utf-8。"""
    raw = part.get_payload(decode=True)
    if not isinstance(raw, bytes):
        return raw or ""
    try:
        return raw.decode(part.get_content_charset() or "utf-8", "ignore")
    except (LookupError, UnicodeDecodeError):
        return raw.decode("utf-8", "ignore")


def beat_feedback():
    """QQ 邮箱反馈 → ima 网站邮箱信息。

    CI 实测教训：跨洋连 QQ IMAP 会滴漏式传输，整封拉 20+ 封能把 job 拖死 55 分钟。
    因此两遍式：先只取头部筛选（表单通知 + 真人来信），再只拉入选者的全文；
    全程受 DEADLINE 预算约束；已在 ima 的同名文档跳过，避免每日重复入库。
    """
    import imaplib
    import email as em
    from email.header import decode_header
    from email.utils import parseaddr
    cfgp = Path.home() / ".config/ima/email.json"
    if not cfgp.exists():
        return "skip: 无 email.json"
    cfg = json.loads(cfgp.read_text(encoding="utf-8"))
    since = time.strftime("%d-%b-%Y", time.gmtime(time.time() - 7 * 86400))
    # 云端 runner 连 QQ IMAP 可能被静默丢包，不设超时会无限挂住整个 job
    m = imaplib.IMAP4_SSL(cfg["host"], cfg.get("port", 993), timeout=45)
    m.login(cfg["user"], cfg["password"])
    m.select(cfg.get("mailbox", "INBOX"), readonly=True)
    _, data = m.search(None, f'(SINCE "{since}")')
    nums = data[0].split()[-40:]
    SYS = ("noreply", "no-reply", "postmaster", "mailer-daemon",
           "notifications@github", "@github.com")
    keep = []
    for num in nums:  # 第一遍：只取头，筛选
        if DEADLINE and time.time() > DEADLINE:
            break
        _, d = m.fetch(num, "(BODY.PEEK[HEADER.FIELDS (SUBJECT FROM DATE MESSAGE-ID)])")
        h = em.message_from_bytes(d[0][1])
        frm = dec(h.get("From")).lower()
        if "formsubmit.co" in frm:
            keep.append((num, h))
        elif not any(k in frm for k in SYS) and cfg["user"].lower() not in frm:
            keep.append((num, h))  # 真人直投来信也算网站反馈
    keep = keep[-10:]  # 单轮上限 10 封：控住 ima 限流与 job 时长
    msgs = []
    for num, h in keep:  # 第二遍：只拉入选者全文
        if DEADLINE and time.time() > DEADLINE:
            print("  取全文触达时间预算，截断", file=sys.stderr)
            break
        _, d = m.fetch(num, "(RFC822)")
        msg = em.message_from_bytes(d[0][1])
        body = ""
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/plain":
                    body = body_of(part)
                    break
        else:
            body = body_of(msg)
        msgs.append({"subject": dec(h.get("Subject")) or "(无主题)",
                     "from": dec(h.get("From")), "date": dec(h.get("Date")),
                     "body": body.strip()[:5000]})
    m.logout()
    if not msgs:
        return "ok: 近 7 天无反馈"
    kb = ima_client.kb_id()
    folder = ima_client.ensure_folder(kb, KB_DIR["feedback"])
    # 已有同名文档跳过（否则每日重跑会以时间戳后缀重复入库）
    existing = set()
    cursor = ""
    while True:
        d2 = ima_client.post("openapi/wiki/v1/get_knowledge_list",
                             {"knowledge_base_id": kb, "folder_id": folder,
                              "cursor": cursor, "limit": 50})
        for it in d2.get("knowledge_list") or []:
            t = it.get("title") or ""
            existing.add(t)
            existing.add(t if t.endswith(".md") else t + ".md")  # ima 标题可能不带扩展名，两种都记
        cursor = d2.get("next_cursor") or ""
        if not cursor:
            break
    n = skipped = 0
    for i, msg in enumerate(msgs):
        if DEADLINE and time.time() > DEADLINE:
            print(f"  反馈入库到 {n}/{len(msgs)} 触达时间预算，剩余跳过（心跳优先）", file=sys.stderr)
            break
        name = f"反馈-{msg['date'][:16]}-{msg['subject'][:20]}.md"
        name = re.sub(r'[\\/:*?"<>|]', "_", name)
        if name in existing:
            skipped += 1
            continue
        if n:
            time.sleep(3)  # 上传之间拉开间隔，避开 ima 频率限制
        doc = (f"# 反馈 {msg['subject']}\n\n- 收件: {msg['date']}\n- 发件人: {msg['from']}\n"
               f"- 归档: {time.strftime('%Y-%m-%d %H:%M')} autopilot\n- 状态: 待处理\n\n"
               f"## 原文\n\n{msg['body']}\n\n## 摘要（下一轮迭代信号）\n\n（待补）\n")
        try:
            ima_client.upload_md(kb, folder, name, doc)
            n += 1
        except Exception as e:
            print(f"  反馈入库失败（跳过）: {str(e)[:80]}", file=sys.stderr)
    return f"ok: {n} 封入 ima/{KB_DIR['feedback']}（跳过已在库 {skipped} 封）"


def append_radar_history(hits):
    """雷达历史沉淀：每日一行进 docs/radar-history.md（radar-latest 只留最新，历史可回溯趋势）。"""
    hist = _docs("radar-history.md")
    top = hits[0]["title"] if hits else "（无命中）"
    kws = "、".join(sorted({h["kw"] for h in hits[:10]})) or "-"
    row = f"| {time.strftime('%Y-%m-%d')} | {len(hits)} | {top} | {kws} |"
    if hist.exists():
        lines = hist.read_text(encoding="utf-8").rstrip("\n").splitlines()
        # 同日重跑覆盖当日行（幂等）
        lines = [l for l in lines if not l.startswith(f"| {time.strftime('%Y-%m-%d')} ")] if lines and "| 日期 |" in lines[0] else lines
    else:
        lines = ["| 日期 | 命中 | 当日 Top1 | 命中词 |", "|---|---|---|---|"]
    lines.append(row)
    if len(lines) > 202:  # 表头 2 行 + 保留最近 200 天
        lines = lines[:2] + lines[-200:]
    hist.write_text("\n".join(lines) + "\n", encoding="utf-8")


def beat_radar(keywords_fallback="心学,ai,读书,成长"):
    """四榜 → 匹配 → ima 热点选题 + 仓内 docs/radar-latest.md。

    关键词 = 站长固定关注方向 ∪ 站内 data.js 主题 ∪ 反馈镜像主题。
    同名日报已入库则跳过，避免重跑堆出时间戳副本。
    """
    sys.path.insert(0, str(ROOT / "scripts"))
    import interest_radar as ir
    site = ir.locate_site_dir()
    kws = ir.topics() | {k.strip() for k in keywords_fallback.split(",") if k.strip()}
    kws |= ir.site_keywords(site) | ir.feedback_keywords()
    boards = {}
    for i, ep in enumerate(ir.SOURCES):
        if i:
            time.sleep(ir.FETCH_GAP)
        try:
            boards[ep] = ir.fetch_board(ep)
        except Exception as e:
            print(f"  {ep} 拉取失败（跳过，R3）: {str(e)[:60]}", file=sys.stderr)
    hits = ir.match(kws, boards, site_titles=ir.site_titles(site))
    report = "\n".join([
        f"# 兴趣雷达 · {time.strftime('%Y-%m-%d %H:%M')} 扫描（autopilot）", "",
        f"关注方向: {', '.join(sorted(kws))}", "",
        f"四榜命中 **{len(hits)}** 条：", ""] +
        [f"- [{h['board']}] {h['title']}（热度 {h['hot']}｜{h['kw']}）" for h in hits[:30]] + [
        "", "## 下一步", "",
        "高热+站内有素材的优先；对 WorkBuddy 说「按雷达发一篇」", ""])
    _docs("radar-latest.md").write_text(report, encoding="utf-8")
    append_radar_history(hits)
    if hits:
        try:
            kb = ima_client.kb_id()
            folder = ima_client.ensure_folder(kb, KB_DIR["radar"])
            name = f"雷达-{time.strftime('%Y%m%d')}.md"
            saved = ima_client.upload_md(kb, folder, name, report,
                                         on_duplicate="skip")
            if not saved:
                print("  同日雷达已在 ima，跳过重复入库", file=sys.stderr)
        except Exception as e:
            print(f"  雷达入 ima 失败（仓内报告已留）: {str(e)[:80]}", file=sys.stderr)
    return f"ok: 命中 {len(hits)}，报告已写 docs/radar-latest.md"

def beat_weekly():
    """周报：台账+雷达+反馈三源 → 三重交集选题 → ima 飞轮周报 + 仓内。"""
    ledger = ROOT / "_rsi_ledger.md"
    radar = ROOT / "docs/radar-latest.md"
    lines = [f"# 飞轮周报 · {time.strftime('%Y-%m-%d')}（autopilot 自动生成）", ""]
    # 1) 对账：近 7 天台账行 + 站内文章计数（posts.js）
    week_rows = []
    if ledger.exists():
        for ln in ledger.read_text(encoding="utf-8").splitlines():
            if ln.startswith("| 202") and ln >= f"| {time.strftime('%Y-%m-%d', time.gmtime(time.time()-7*86400))}":
                week_rows.append(ln)
    pass_n = sum(1 for r in week_rows if "| PASS |" in r)
    sys.path.insert(0, str(ROOT / "scripts"))
    import interest_radar as _ir
    site_titles = _ir.site_titles(_ir.locate_site_dir())
    lines += [f"## 一、对账（近 7 天体检 {pass_n}/{len(week_rows)} 天 PASS · 站内文章累计 {len(site_titles)} 篇）", ""]
    if site_titles:
        recent = "、".join(site_titles[-3:])
        lines += [f"最近 3 篇：{recent}", ""]
    lines += week_rows[-7:] + [""]
    # 2) 雷达 top5
    lines += ["## 二、雷达热点 Top5", ""]
    if radar.exists():
        hits = [l for l in radar.read_text(encoding="utf-8").splitlines() if l.startswith("- [")]
        lines += hits[:5] or ["（今日雷达无命中）"]
    lines.append("")
    # 3) 选题建议（三重交集的简化自动版：雷达热词×反馈词表）
    lines += ["## 三、下周选题建议", "",
              "优先三重交集：读者问得多的 × 雷达命中的 × ima 素材厚的。",
              "（人工批阅位：WorkBuddy/站长勾选 1-2 条进下周池）", ""]
    report = "\n".join(lines) + "\n"
    _docs("weekly-latest.md").write_text(report, encoding="utf-8")
    if ima_client.creds():
        try:
            kb = ima_client.kb_id()
            folder = ima_client.ensure_folder(kb, KB_DIR["weekly"])
            ima_client.upload_md(kb, folder, f"周报-{time.strftime('%Y%m%d')}.md", report)
        except Exception as e:
            print(f"  周报入 ima 失败（仓内已留）: {str(e)[:80]}", file=sys.stderr)
    return f"ok: 周报已写 docs/weekly-latest.md（体检 {pass_n}/{len(week_rows)}）"


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "daily"
    # CI 无 TTY 时 print 全缓冲，job 被取消/超时后日志全丢——强制行缓冲
    try:
        sys.stdout.reconfigure(line_buffering=True)
        sys.stderr.reconfigure(line_buffering=True)
    except Exception:
        pass
    import socket
    socket.setdefaulttimeout(60)  # 兜底：任何未显式超时的外呼最多挂 60s，绝不拖死 job
    global DEADLINE
    DEADLINE = time.time() + 12 * 60  # 全局预算 12 分钟：宁可砍掉环节也不拖垮 job
    has_creds = ima_client.creds()
    beats = {
        "feedback": beat_feedback,
        "radar": lambda: beat_radar(),
        "weekly": beat_weekly,
    }
    run = {"daily": ["feedback", "radar"],
           "weekly": ["feedback", "radar", "weekly"],
           "radar-only": ["radar"],
           "feedback-only": ["feedback"]}.get(mode)
    if not run:
        print(f"未知模式 {mode}"); sys.exit(2)
    if not has_creds:
        print("ima 凭据缺失——radar 报告仍写仓内，feedback/ima 入库跳过（心跳继续）", file=sys.stderr)
    print(f"== autopilot {mode} @ {time.strftime('%Y-%m-%d %H:%M:%S')} ==")
    for name in run:
        t0 = time.time()
        try:
            r = beats[name]()
            print(f"[{name}] {r}（{time.time()-t0:.1f}s）")
        except Exception as e:
            print(f"[{name}] FAIL-SOFT: {str(e)[:120]}（跳过，心跳不断）")


if __name__ == "__main__":
    main()
