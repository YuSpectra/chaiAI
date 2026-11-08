#!/usr/bin/env python3
"""interest_radar.py — 兴趣雷达：站内内容 → 全网热点 → ima「热点选题」.

自进化闭环的「输入侧灵魂」（v3.0）：网站不再等人喂选题——

    站内文章标题/posts.js 或 assets/js/data.js ──┐
                                                ├→ 兴趣关键词 → 抓四榜(微博/知乎/抖音/头条)
    ima「网站邮箱信息」反馈 ─────────────────────┘      │
                                                        ↓
                                         命中的热点 → ima「热点选题」目录（待写状态）
                                                        ↓
                            WorkBuddy 周报时翻目录 →「用这个素材发一篇」→ 站+号双出口

与 feedback_pull.py 的分工：反馈=读者拉（被动），雷达=热点推（主动），
两流在 ima 汇成同一池选题，飞轮从「人找题」升级为「闭环自己产题」。

用法:
    python3 scripts/interest_radar.py                 # 抓四榜，匹配，打印
    python3 scripts/interest_radar.py --save          # 命中项写入 ima「热点选题」
    python3 scripts/interest_radar.py --list-topics   # 查看当前关注的主题族
    python3 scripts/interest_radar.py --keywords "道德经,职场"  # 手动补关键词
    python3 scripts/interest_radar.py --list-sources  # 列数据源

    RSI_SITE_DIR  可选，指定站点根目录（含 assets/js/data.js 或 posts.js）
    RSI_RADAR_TOPICS  可选，逗号分隔，覆盖默认主题族

数据源（开源 60s API，限流 ~6s/req 防御性间隔）:
    weibo / zhihu / douyin / toutiao（各 30-50 条，含 title+link+hot_value）

设计原则：仅标准库、只读抓取（GET 热榜，绝不写任何线上内容，同 R4 精神）；
         命中判定透明可追溯（每条命中注明关键词与来源榜）。
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE_HOSTS = ("https://60s.viki.moe", "https://60s.b23.run")
SOURCES = {
    ep: f"{SOURCE_HOSTS[0]}/v2/{ep}"
    for ep in ("weibo", "zhihu", "douyin", "toutiao")
}
FETCH_GAP = 6  # 同源请求间隔（秒），开源接口限流防御
IMA_DIR_NAME = "热点选题"
DATA_JS_REL = "assets/js/data.js"

# 站长固定关注的主题族（观子喻知）。改这里即可改方向：
#   键 = 报告里显示的命中词；值 = 用来匹配热榜标题的扩展词。
#   建议 3-5 族、每族 5-12 词；词越具体命中越少。
TOPIC_EXPANSION = {
    "心学": ["王阳明", "阳明", "心学", "龙场悟道", "知行合一", "致良知", "心即理",
             "此心不动", "道德经", "庄子", "论语", "东方哲学", "向内求"],
    "ai": ["AI", "人工智能", "大模型", "GPT", "Claude", "DeepSeek", "智能体",
            "AIGC", "AI焦虑", "AI时代", "被AI取代", "人机"],
    "读书": ["读书", "阅读", "书单", "拆书", "写作", "自媒体", "内容创作",
             "公众号", "表达", "笔记"],
    "成长": ["成长", "自律", "认知", "焦虑", "内耗", "情绪", "迷茫",
             "职场", "自我成长", "精神内耗"],
}
DEFAULT_TOPICS = "心学,ai,读书,成长"


def topics():
    """固定主题族：环境变量可覆盖，否则用 DEFAULT_TOPICS。"""
    raw = os.environ.get("RSI_RADAR_TOPICS", "").strip() or DEFAULT_TOPICS
    return {k.strip() for k in raw.split(",") if k.strip()}


def locate_site_dir(explicit=None):
    """找站点根目录：显式参数 > RSI_SITE_DIR > 脚本所在仓根 > cwd > ~/my-site。

    兼容两类站点：技能原生站（posts.js）与本静态站（assets/js/data.js）。
    CI 里 checkout 到仓根，脚本所在仓根即站点根，能直接读到 data.js。
    """
    cands = [explicit, os.environ.get("RSI_SITE_DIR"), ROOT, Path.cwd(),
             Path.home() / "my-site"]
    for c in cands:
        if not c:
            continue
        p = Path(c).expanduser()
        if (p / DATA_JS_REL).is_file() or (p / "posts.js").is_file():
            return p
    return Path(explicit or Path.home() / "my-site")


def _notes_meta(site_dir):
    """从 assets/js/data.js 的 window.NOTES 段取 (文章标题列表, 全部元数据文本)。

    只读 title/category/excerpt/tags，不读正文，避免正文里的一句闲话把主题族全点亮。
    """
    f = site_dir / DATA_JS_REL
    if not f.is_file():
        return [], ""
    try:
        src = f.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return [], ""
    i = src.find("window.NOTES")
    if i < 0:
        return [], ""
    seg = src[i:]
    j = seg.find("window.LETTERS")
    if j > 0:
        seg = seg[:j]
    titles = re.findall(r"\btitle\s*:\s*['\"]([^'\"]+)['\"]", seg)
    fields = list(titles)
    fields += re.findall(r"(?:category|excerpt)\s*:\s*['\"]([^'\"]+)['\"]", seg)
    for grp in re.findall(r"tags\s*:\s*\[([^\]]*)\]", seg):
        fields += re.findall(r"['\"]([^'\"]+)['\"]", grp)
    return titles, " ".join(fields)


def site_keywords(site_dir):
    """站内内容 → 主题族：posts.js 标题 + data.js 的 NOTES 元信息都能提词。"""
    texts = []
    posts_js = site_dir / "posts.js"
    if posts_js.exists():
        texts += re.findall(r'"title":\s*"([^"]+)"',
                            posts_js.read_text(encoding="utf-8", errors="ignore"))
    _, meta = _notes_meta(site_dir)
    if meta:
        texts.append(meta)
    joined = " ".join(texts).lower()
    return {k for k, family in TOPIC_EXPANSION.items()
            if any(p.lower() in joined for p in family)}


def feedback_keywords():
    """从 ima 反馈本地镜像提关键词（若 WorkBuddy 已把反馈存到本地镜像）。"""
    mirror = Path.home() / ".config" / "ima" / "feedback-mirror.json"
    if mirror.exists():
        try:
            items = json.loads(mirror.read_text(encoding="utf-8"))
            joined = str(items).lower()
            return {k for k, family in TOPIC_EXPANSION.items()
                    if any(p.lower() in joined for p in family)}
        except Exception:
            pass
    return set()


def site_titles(site_dir):
    """站内已有文章标题（相似度过滤用，写过的热点不再推）。"""
    titles = []
    posts_js = site_dir / "posts.js"
    if posts_js.exists():
        titles += re.findall(r'"title":\s*"([^"]+)"',
                             posts_js.read_text(encoding="utf-8", errors="ignore"))
    titles += _notes_meta(site_dir)[0]
    return titles


def _board_items(raw):
    d = json.loads(raw)
    data = d.get("data")
    if isinstance(data, dict):  # 有的端点是 {news:[...]} / {data:[...]}
        data = data.get("news") or data.get("data") or []
    return data or []


def fetch_board(ep):
    """单榜抓取：主域名 → 公共镜像，每站再试 urllib → curl。

    本机代理下 Python urllib 常 SSL 握手超时但 curl 能通；CI 直连则反之。
    全挂才抛错，单榜失败由调用方跳过（R3 抖动口径）。
    """
    last = None
    for host in SOURCE_HOSTS:
        url = f"{host}/v2/{ep}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=15) as r:
                data = _board_items(r.read())
            if data:
                return data
            last = RuntimeError("返回空数据")
        except Exception as e:
            last = e
        try:
            raw = subprocess.check_output(
                ["curl", "-sS", "--max-time", "20", url],
                timeout=25, stderr=subprocess.DEVNULL)
            data = _board_items(raw)
            if data:
                return data
        except Exception as e:
            last = e
    raise last or RuntimeError("没有可用数据源")

def similarity(a, b):
    """粗粒度相似度：2-gram 重合率（Jaccard），>0.35 视为写过同题。"""
    def grams(s):
        s = re.sub(r"[^\w\u4e00-\u9fff]", "", s.lower())
        return {s[i:i+2] for i in range(len(s) - 1)} or {s}
    ga, gb = grams(a), grams(b)
    return len(ga & gb) / len(ga | gb)


def match(keywords, boards, site_titles=()):
    """命中 + 降噪：相似度过滤（写过的不再推）+ 热度加权排序。"""
    raw = []
    for ep, items in boards.items():
        for it in items:
            title = it.get("title", "")
            for kw in keywords:
                pats = TOPIC_EXPANSION.get(kw, [kw])
                if any(p.lower() in title.lower() for p in pats):
                    raw.append({
                        "kw": kw, "board": ep, "title": title,
                        "link": it.get("link", ""), "hot": it.get("hot_value", 0),
                    })
                    break
    # 降噪 1：与站内已有文章标题相似度过高 → 写过，不再推
    hits = [h for h in raw
            if not any(similarity(h["title"], t) > 0.35 for t in site_titles)]
    # 降噪 2：热度加权排序（知乎热榜 hot=0 时按板面出现序兜底，不挤占前排）
    hits.sort(key=lambda h: -h["hot"])
    return hits


def render(hits, save, keywords=()):
    lines = []
    lines.append(f"# 兴趣雷达 · {time.strftime('%Y-%m-%d %H:%M')} 扫描")
    lines.append("")
    lines.append(f"关注方向：{', '.join(sorted(keywords))}")
    lines.append("")
    lines.append(f"四榜扫描共命中 **{len(hits)}** 条与站内兴趣相关的热点：")
    lines.append("")
    for h in hits[:30]:
        lines.append(f"- [{h['board']}] {h['title']}（热度 {h['hot']}｜命中词: {h['kw']}）")
    lines.append("")
    lines.append("## 下一步")
    lines.append("")
    lines.append("对 WorkBuddy 说：「从 ima「热点选题」目录挑一条，用站内相关文章做素材支撑，发一篇到网站+公众号」")
    lines.append("")
    txt = "\n".join(lines)
    print(txt)
    if save:
        # 链路 A 回写：ima「热点选题」目录；同名报告已存在则跳过，避免重复副本
        try:
            import ima_client
            _, name = ima_client.save_to_dir(
                IMA_DIR_NAME, f"雷达-{time.strftime('%Y%m%d')}.md", txt,
                on_duplicate="skip")
            if name:
                print(f"\n✓ 已回写 ima/{IMA_DIR_NAME}/{name}", file=sys.stderr)
            else:
                print(f"\n✓ 今日雷达已在 ima/{IMA_DIR_NAME}，跳过重复入库", file=sys.stderr)
        except Exception as e:
            print(f"\n✗ ima 回写失败（报告已在上方输出，可重跑）: {str(e)[:100]}", file=sys.stderr)
            sys.exit(1)
    return len(hits)


def main():
    ap = argparse.ArgumentParser(description="兴趣雷达：站内内容→全网热点→ima 热点选题")
    ap.add_argument("--save", action="store_true", help="命中项写入 ima 热点选题")
    ap.add_argument("--keywords", default=None, help="手动补关键词（逗号分隔）")
    ap.add_argument("--site-dir", default=None, help="站点根目录（默认自动定位）")
    ap.add_argument("--list-sources", action="store_true", help="只列数据源")
    ap.add_argument("--list-topics", action="store_true", help="只列当前关注的主题族与扩展词")
    args = ap.parse_args()

    if args.list_sources:
        for k in SOURCES:
            print(f"{k}: " + " / ".join(f"{h}/v2/{k}" for h in SOURCE_HOSTS))
        return
    if args.list_topics:
        for k, family in TOPIC_EXPANSION.items():
            print(f"{k}: {', '.join(family)}")
        return

    site_dir = locate_site_dir(args.site_dir)
    print(f"站点目录：{site_dir}", file=sys.stderr)
    keywords = topics() | site_keywords(site_dir) | feedback_keywords()
    if args.keywords:
        keywords |= {k.strip() for k in args.keywords.split(",") if k.strip()}

    print(f"兴趣关键词（{len(keywords)}）: {', '.join(sorted(keywords))}", file=sys.stderr)
    boards = {}
    for i, ep in enumerate(SOURCES):
        if i:
            time.sleep(FETCH_GAP)
        try:
            boards[ep] = fetch_board(ep)
            print(f"✓ {ep} {len(boards[ep])} 条", file=sys.stderr)
        except Exception as e:
            print(f"✗ {ep} 拉取失败: {str(e)[:60]}（跳过，不算故障——R3 抖动口径）", file=sys.stderr)
    hits = match(keywords, boards, site_titles=site_titles(site_dir))
    render(hits, args.save, keywords)


if __name__ == "__main__":
    main()
