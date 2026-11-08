#!/usr/bin/env python3
"""interest_radar.py — 兴趣雷达：站内内容 → 全网热点 → ima「热点选题」.

自进化闭环的「输入侧灵魂」（v3.0）：网站不再等人喂选题——

    站内文章标题/posts.js ──┐
                          ├→ 提兴趣关键词 → 抓四榜(微博/知乎/抖音/头条)
    ima「网站邮箱信息」反馈 ──┘      │
                                    ↓
                     命中的热点 → ima「热点选题」目录（待写状态）
                                    ↓
                    WorkBuddy 周报时翻目录 →「用这个素材发一篇」→ 站+号双出口

与 feedback_pull.py 的分工：反馈=读者拉（被动），雷达=热点推（主动），
两流在 ima 汇成同一池选题，飞轮从「人找题」升级为「闭环自己产题」。

用法:
    python3 scripts/interest_radar.py                 # 抓四榜，匹配，打印
    python3 scripts/interest_radar.py --save          # 命中项写入 ima 入库指令流
    python3 scripts/interest_radar.py --keywords "AI,拆书"  # 手动补关键词
    python3 scripts/interest_radar.py --list-sources  # 列数据源

数据源（开源 60s API，限流 ~6s/req 防御性间隔）:
    weibo / zhihu / douyin / toutiao（各 30-50 条，含 title+link+hot_value）

设计原则：仅标准库、只读抓取（GET 热榜，绝不写任何线上内容，同 R4 精神）；
         命中判定透明可追溯（每条命中注明关键词与来源榜）。
"""

import argparse
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = {
    "weibo": "https://60s.viki.moe/v2/weibo",
    "zhihu": "https://60s.viki.moe/v2/zhihu",
    "douyin": "https://60s.viki.moe/v2/douyin",
    "toutiao": "https://60s.viki.moe/v2/toutiao",
}
FETCH_GAP = 6  # 同源请求间隔（秒），开源接口限流防御
IMA_DIR_NAME = "热点选题"

# 泛化兴趣词表：站内词 → 全网热榜匹配用扩展词（小而精，避免误命中）
TOPIC_EXPANSION = {
    "ai": ["AI", "人工智能", "大模型", "GPT", "Claude", "DeepSeek", "智能体", "AI短剧", "AIGC"],
    "拆书": ["读书", "阅读", "书单", "知识付费", "拆书"],
    "写作": ["写作", "自媒体", "内容创作", "公众号"],
    "成长": ["成长", "自律", "认知", "学习"],
}


def fetch_board(ep):
    req = urllib.request.Request(SOURCES[ep], headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as r:
        d = json.loads(r.read())
    data = d.get("data")
    if isinstance(data, dict):  # 60s 端点有的是 {news:[...]}
        data = data.get("news", [])
    return data or []


def site_keywords(site_dir):
    """从站内文章标题提取兴趣关键词。"""
    kws = set()
    posts_js = site_dir / "posts.js"
    if posts_js.exists():
        m = re.findall(r'"title":\s*"([^"]+)"', posts_js.read_text(encoding="utf-8"))
        for title in m:
            for word, family in TOPIC_EXPANSION.items():
                if word.lower() in title.lower():
                    kws.add(word)
    return kws


def feedback_keywords():
    """从 ima 反馈文件提关键词（若 WorkBuddy 已把反馈存到本地镜像）。"""
    mirror = Path.home() / ".config" / "ima" / "feedback-mirror.json"
    if mirror.exists():
        try:
            items = json.loads(mirror.read_text(encoding="utf-8"))
            return {k for k in TOPIC_EXPANSION if any(k.lower() in str(i).lower() for i in items)}
        except Exception:
            pass
    return set()


def site_titles(site_dir):
    """站内已有文章标题（相似度过滤用，写过的热点不再推）。"""
    posts_js = site_dir / "posts.js"
    if posts_js.exists():
        return re.findall(r'"title":\s*"([^"]+)"', posts_js.read_text(encoding="utf-8"))
    return []


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


def render(hits, save):
    lines = []
    lines.append(f"# 兴趣雷达 · {time.strftime('%Y-%m-%d %H:%M')} 扫描")
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
        # 链路 A 回写：ima「热点选题」目录（独立新建），直连写入
        try:
            import ima_client
            _, name = ima_client.save_to_dir(
                IMA_DIR_NAME, f"雷达-{time.strftime('%Y%m%d')}.md", txt)
            print(f"\n✓ 已回写 ima/{IMA_DIR_NAME}/{name}", file=sys.stderr)
        except Exception as e:
            print(f"\n✗ ima 回写失败（报告已在上方输出，可重跑）: {str(e)[:100]}", file=sys.stderr)
            sys.exit(1)
    return len(hits)


def main():
    ap = argparse.ArgumentParser(description="兴趣雷达：站内内容→全网热点→ima 热点选题")
    ap.add_argument("--save", action="store_true", help="输出 ima 入库指令流（stderr）")
    ap.add_argument("--keywords", default=None, help="手动补关键词（逗号分隔）")
    ap.add_argument("--site-dir", default=str(Path.home() / "my-site"), help="站点目录")
    ap.add_argument("--list-sources", action="store_true", help="只列数据源")
    args = ap.parse_args()

    if args.list_sources:
        for k, v in SOURCES.items():
            print(f"{k}: {v}")
        return

    keywords = site_keywords(Path(args.site_dir))
    keywords |= feedback_keywords()
    if args.keywords:
        keywords |= {k.strip() for k in args.keywords.split(",") if k.strip()}
    if not keywords:
        print("未提取到兴趣关键词——站内 posts.js 无文章或未配反馈镜像。")
        print("可先用 --keywords \"AI,拆书\" 手动指定再跑。")
        return

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
    hits = match(keywords, boards, site_titles=site_titles(Path(args.site_dir)))
    render(hits, args.save)


if __name__ == "__main__":
    main()
