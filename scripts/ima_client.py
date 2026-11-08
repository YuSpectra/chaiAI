#!/usr/bin/env python3
"""ima_client.py — ima 知识库直连客户端（两条回写链路的共用底座，v3.2）.

被 WorkBuddy（调用本技能）的三个脚本共用：
    interest_radar.py --save   → ima「热点选题」目录（链路 A：内容→热点）
    feedback_pull.py           → ima「网站邮箱信息」目录（链路 B：反馈→邮箱）
    autopilot.py               → 上述目录 + ima「飞轮周报」（CI 定时兜底）

凭据（优先级）:
    1. 环境变量 IMA_CLIENT_ID / IMA_API_KEY（CI Secrets）
    2. ~/.config/ima/client_id + ~/.config/ima/api_key（本机，WorkBuddy 侧）
知识库定位:
    环境变量 IMA_KB_ID（精确）；或 IMA_KB_NAME 按名匹配；都缺 → 报错并列出可用库

目录策略：**独立新建**——目标目录不存在时自动创建（ensure_folder），
目录名固定常量，两条链路各写各的目录，互不混流。

API 模式（ima.qq.com openapi，实测 2026-11）:
    get_knowledge_base_list / get_knowledge_list / create_folder
    check_repeated_names / create_media（返回 COS 临时凭证）→ COS PUT（HMAC-SHA1
    签名，host+content-length 入签）→ add_knowledge（md = media_type 7）

设计原则：仅标准库；所有调用幂等可重入（重名自动加时间戳后缀）。
"""

import hashlib
import hmac
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

IMA_BASE = "https://ima.qq.com"

# 两条链路的固定目录（独立新建，互不混流）
DIR_RADAR = "热点选题"        # 链路 A：站内兴趣 → 全网热点
DIR_FEEDBACK = "网站邮箱信息"  # 链路 B：QQ 邮箱 ← 网站反馈
DIR_WEEKLY = "飞轮周报"       # 周报沉淀


class ImaError(RuntimeError):
    pass


def creds():
    cid = os.getenv("IMA_CLIENT_ID", "").strip()
    key = os.getenv("IMA_API_KEY", "").strip()
    if not (cid and key):
        d = Path.home() / ".config/ima"
        f1, f2 = d / "client_id", d / "api_key"
        if f1.exists() and f2.exists():
            cid = cid or f1.read_text(encoding="utf-8").strip()
            key = key or f2.read_text(encoding="utf-8").strip()
    return (cid, key) if (cid and key) else None


_LAST_CALL = [0.0]


def _throttle(min_gap=0.6):
    """全局最小调用间隔：ima openapi 限流很紧，突发连打必挂。"""
    gap = time.time() - _LAST_CALL[0]
    if gap < min_gap:
        time.sleep(min_gap - gap)
    _LAST_CALL[0] = time.time()


def _post_once(path, body, timeout):
    _throttle()
    c = creds()
    if c is None:
        raise ImaError("ima 凭据缺失：设 IMA_CLIENT_ID/IMA_API_KEY 或写 ~/.config/ima/{client_id,api_key}")
    payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{IMA_BASE}/{path}", data=payload, method="POST",
        headers={"Content-Type": "application/json",
                 "ima-openapi-clientid": c[0], "ima-openapi-apikey": c[1]})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:  # 限流/权限走 403 body，需要解析出 code
        raw = e.read().decode("utf-8", "replace")
        try:
            return json.loads(raw)
        except Exception:
            raise ImaError(f"ima {path} HTTP {e.code}: {raw[:200]}")


def post(path, body, timeout=30, retries=3):
    """调 openapi；码 200001（请求频率超限）自动指数退避重试——CI 连跑多个环节很容易撞限流。"""
    delay = 5
    for attempt in range(retries):
        d = _post_once(path, body, timeout)
        code = d.get("code")
        if code == 0:
            return d.get("data") or {}
        msg = str(d.get("msg") or "")
        if code == 200001 or "频率" in msg:
            if attempt == retries - 1:
                raise ImaError(f"ima {path} 限流未恢复 code={code} msg={msg}")
            print(f"  ima 限流，{delay}s 后重试（{attempt + 1}/{retries - 1}）", file=sys.stderr)
            time.sleep(delay)
            delay *= 3
            continue
        raise ImaError(f"ima {path} code={code} msg={msg}")


def kb_id():
    kb = os.getenv("IMA_KB_ID", "").strip()
    if kb:
        return kb
    f = Path.home() / ".config/ima/kb_id"
    if f.exists():
        kb = f.read_text(encoding="utf-8").strip()
        if kb:
            return kb
    name = os.getenv("IMA_KB_NAME", "").strip()
    # openapi 已无 get_knowledge_base_list（404），改用 search_knowledge_base 空查询列举
    data = post("openapi/wiki/v1/search_knowledge_base",
                {"query": name, "query_user": True, "cursor": "", "limit": 20})
    kbs = data.get("info_list") or []
    if name:
        for it in kbs:
            if it.get("kb_name") == name:
                return it.get("kb_id")
    names = [it.get("kb_name") for it in kbs]
    raise ImaError(f"未定位知识库：设 IMA_KB_ID，或设 IMA_KB_NAME 匹配现有库 {names}")


def ensure_folder(kb, name):
    """目录独立新建：不存在则创建；返回 folder_id。

    get_knowledge_list 被限流时（code=200001）退到 search_knowledge 找目录，
    再找不到才 create_folder——2026-11-08 实测列表接口单独被限、检索/创建仍可用。
    """
    try:
        cursor = ""
        while True:
            data = post("openapi/wiki/v1/get_knowledge_list",
                        {"knowledge_base_id": kb, "folder_id": kb, "cursor": cursor, "limit": 50})
            for it in data.get("knowledge_list") or []:
                if it.get("title") == name and str(it.get("media_id", "")).startswith("folder_"):
                    return str(it["media_id"])
            cursor = data.get("next_cursor") or ""
            if not cursor:
                break
    except ImaError as e:
        if "限流" not in str(e):
            raise
        d = post("openapi/wiki/v1/search_knowledge",
                 {"knowledge_base_id": kb, "query": name, "cursor": "", "limit": 10})
        for it in d.get("info_list") or []:
            if it.get("title") == name and str(it.get("media_id", "")).startswith("folder_"):
                return str(it["media_id"])
    d2 = post("openapi/wiki/v1/create_folder",
              {"knowledge_base_id": kb, "name": name, "parent_folder_id": kb})
    fid = str(d2.get("media_id") or "")
    if not fid:
        raise ImaError(f"create_folder({name}) 未返回 media_id")
    return fid


def _cos_put(cred, data, content_type, timeout=45):
    host = f"{cred['bucket_name']}.cos.{cred['region']}.myqcloud.com"
    pathname = "/" + str(cred["cos_key"]).lstrip("/")
    key_time = f"{cred['start_time']};{cred['expired_time']}"
    sign_headers = {"content-length": str(len(data)), "host": host}
    keys = sorted(sign_headers)
    http_headers = "&".join(f"{k}={urllib.parse.quote(str(sign_headers[k]), safe='')}" for k in keys)
    http_string = f"put\n{pathname}\n\n{http_headers}\n"
    sha1 = lambda b: hashlib.sha1(b).hexdigest()
    sts = f"sha1\n{key_time}\n{sha1(http_string.encode('utf-8'))}\n"
    sign_key = hmac.new(str(cred["secret_key"]).encode(), key_time.encode(), hashlib.sha1).hexdigest()
    sig = hmac.new(sign_key.encode(), sts.encode(), hashlib.sha1).hexdigest()
    auth = (f"q-sign-algorithm=sha1&q-ak={cred['secret_id']}&q-sign-time={key_time}"
            f"&q-key-time={key_time}&q-header-list={';'.join(keys)}"
            f"&q-url-param-list=&q-signature={sig}")
    headers = {"Authorization": auth, "Content-Type": content_type}
    # 临时凭证必须带安全 token（不参与签名），否则 COS 报 InvalidAccessKeyId
    if cred.get("token"):
        headers["x-cos-security-token"] = cred["token"]
    req = urllib.request.Request(f"https://{host}{pathname}", data=data, method="PUT",
                                 headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        r.read()


def upload_md(kb, folder_id, file_name, text):
    """markdown → media_type 7；重名自动加时间戳后缀（幂等可重入）。"""
    data = post("openapi/wiki/v1/check_repeated_names",
                {"params": [{"name": file_name, "media_type": 7}],
                 "knowledge_base_id": kb, "folder_id": folder_id})
    if bool(((data.get("results") or [{}])[0]).get("is_repeated")):
        stem, _, ext = file_name.rpartition(".")
        file_name = f"{stem}_{time.strftime('%Y%m%d%H%M%S')}.{ext}"
    payload = text.encode("utf-8")
    data = post("openapi/wiki/v1/create_media",
                {"file_name": file_name, "file_size": len(payload),
                 "content_type": "text/markdown", "knowledge_base_id": kb, "file_ext": "md"})
    media_id = str(data.get("media_id") or "")
    cred = data.get("cos_credential") or {}
    if not media_id or not cred.get("cos_key"):
        raise ImaError("create_media 返回不完整（media_id/cos_credential）")
    _cos_put(cred, payload, "text/markdown")
    post("openapi/wiki/v1/add_knowledge",
         {"media_type": 7, "media_id": media_id, "title": file_name,
          "knowledge_base_id": kb, "folder_id": folder_id,
          "file_info": {"cos_key": cred.get("cos_key"), "file_size": len(payload),
                        "file_name": file_name}})
    return file_name


def save_to_dir(dir_name, file_name, text):
    """一条龙：定位库 → 确保目录（独立新建）→ 上传 md。返回 (目录, 文件名)。"""
    kb = kb_id()
    fid = ensure_folder(kb, dir_name)
    name = upload_md(kb, fid, file_name, text)
    return dir_name, name
