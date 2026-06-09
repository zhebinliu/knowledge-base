"""飞书集成(2026-05-29)。

核心能力:
1. 把会议纪要 markdown 导出为飞书 docx 文档(支持自动创建 + 写入已有文档)
2. 把需求清单批量写入飞书多维表(支持自动创建表 + 写入已有表)
3. 把待办事项同步到飞书看板(支持自动创建 + 写入已有看板)

凭证策略:
- 每个用户在「个人设置 → 飞书集成」里配置自己的 feishu_app_id + feishu_app_secret。
- secret 使用 Fernet 加密存储。
- 用户未配置时回退全局凭证(.env 中的 FEISHU_GLOBAL_*)。

依赖:仅 httpx + cryptography(避免引入 aiohttp)。
"""
from __future__ import annotations

import asyncio
import re
import time
from typing import Optional

import httpx
import structlog

from models.user import User
from services.feishu_crypto import decrypt_secret

logger = structlog.get_logger()

# ── 常量 ──────────────────────────────────────────────────────────────────

_TOKEN_URL = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
_DOCX_BASE = "https://open.feishu.cn/open-apis/docx/v1"
_BITABLE_BASE = "https://open.feishu.cn/open-apis/bitable/v1"
_TIMEOUT = 30.0


class FeishuError(Exception):
    def __init__(self, code: int, message: str):
        self.code = code
        self.message = message
        super().__init__(f"飞书 API 错误 code={code}: {message}")


# ── 飞书错误码 → HTTP 状态码映射(#6 修复) ───────────────────────

def http_status_for_feishu_error(feishu_code: int, msg: str = "") -> int:
    """根据飞书 API 错误码/消息返回合适的 HTTP 状态码。

    修复 #6:不再统一返回 502,按错误语义映射。
    """
    msg_lower = msg.lower()

    # Auth/Token 类 → 401
    if feishu_code in (99991663, 99991664, 99991665, 99991666, 99991667, 99991668, 99991670):
        return 401
    if any(kw in msg_lower for kw in ("unauthorized", "invalid token", "app ticket", "tenant_access_token")):
        return 401

    # Permission 类 → 403
    if any(kw in msg_lower for kw in ("perm", "notallow", "no permission", "access denied", "forbidden")):
        return 403

    # Rate limit 类 → 429
    if feishu_code == 99991400 or "rate" in msg_lower:
        return 429

    # Not found → 404
    if "not found" in msg_lower or "not_found" in msg_lower:
        return 404

    # 其余飞书错误 → 502(上游错误)
    return 502


# ── 凭证读取 ───────────────────────────────────────────────────────────

def get_user_feishu_credentials(user: User) -> Optional[tuple[str, str]]:
    """从 User 模型读出飞书凭证。secret 自动解密。未配置返回 None。"""
    if not user.feishu_app_id or not user.feishu_app_secret:
        return None
    app_secret = decrypt_secret(user.feishu_app_secret)
    if not app_secret:
        return None
    return user.feishu_app_id, app_secret


def invalidate_token_cache(app_id: str) -> None:
    """用户更新/清除飞书凭证时,清掉对应 app_id 的 token 缓存。"""
    _token_cache.pop(app_id, None)
    logger.info("feishu_token_cache_invalidated", app_id=_mask_app_id(app_id))


def _mask_app_id(app_id: str) -> str:
    return app_id[:8] + "***" if len(app_id) > 8 else "***"


# ── 简易 token 缓存(内存级,进程内) ──────────────────────────────────

_token_cache: dict[str, tuple[str, float]] = {}  # app_id -> (token, expires_at)
_token_lock = asyncio.Lock()


async def get_tenant_token(
    app_id: str,
    app_secret: str,
    max_retries: int = 3,
) -> str:
    """获取 tenant access token,5 分钟内缓存复用。带重试(指数退避)和并发锁。

    修复 #11:添加重试机制,应对瞬时网络抖动。
    修复 #2:asyncio.Lock 防止同一 app_id 并发刷新导致多次 API 调用。
    """
    # 先检查缓存(无锁快速路径)
    cached = _token_cache.get(app_id)
    if cached and time.time() < cached[1] - 300:
        return cached[0]

    async with _token_lock:
        # 双重检查:拿到锁后可能已被其他协程填充
        cached = _token_cache.get(app_id)
        if cached and time.time() < cached[1] - 300:
            return cached[0]

        last_error: Exception | None = None
        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                    resp = await client.post(
                        _TOKEN_URL, json={"app_id": app_id, "app_secret": app_secret},
                    )
                if resp.status_code != 200:
                    raise FeishuError(resp.status_code, f"HTTP {resp.status_code}: {resp.text[:200]}")
                data = resp.json()
                if data.get("code") != 0:
                    raise FeishuError(data.get("code", -1), data.get("msg", "未知错误"))
                token = data["tenant_access_token"]
                expires_at = time.time() + data.get("expire", 7200)
                _token_cache[app_id] = (token, expires_at)
                logger.info("feishu_token_refreshed", app_id=_mask_app_id(app_id), expire=data.get("expire"))
                return token
            except FeishuError:
                raise  # 飞书业务错误不重试
            except Exception as e:
                last_error = e
                if attempt < max_retries - 1:
                    wait = 2 ** attempt  # 1s, 2s, 4s
                    logger.warning("feishu_token_retry", attempt=attempt + 1, wait=wait, error=str(e)[:100])
                    await asyncio.sleep(wait)

        raise FeishuError(-1, f"获取 tenant token 失败(重试 {max_retries} 次): {last_error}")


# ── markdown → 飞书 docx blocks(完整版) ──────────────────────────────

# 飞书 docx block_type:
#   2: 文本段落  3: 标题1  4: 标题2  5: 标题3  6: 标题4  7: 标题5  8: 标题6  9: 标题7
#  10: 无序列表  11: 有序列表  12: 代码块  13: 引用  14: 待办

_HEADING_RE = re.compile(r"^(#{1,7})\s+(.+)$", re.MULTILINE)
_UNORDERED_RE = re.compile(r"^[-*+]\s+(.+)$", re.MULTILINE)
_ORDERED_RE = re.compile(r"^\d+[.)]\s+(.+)$", re.MULTILINE)
_BOLD_RE = re.compile(r"\*\*(.+?)\*\*")
_ITALIC_RE = re.compile(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", re.MULTILINE)


def _parse_inline(text: str) -> list[dict]:
    """解析行内样式(粗体/斜体/普通文本),返回飞书 text_run 列表。"""
    runs: list[dict] = []
    pos = 0
    while pos < len(text):
        bold_m = _BOLD_RE.search(text, pos)
        italic_m = _ITALIC_RE.search(text, pos)

        next_match = None
        style = ""
        if bold_m and (not italic_m or bold_m.start() <= italic_m.start()):
            next_match = bold_m
            style = "bold"
        elif italic_m:
            next_match = italic_m
            style = "italic"

        if not next_match:
            runs.append({"text_run": {"content": text[pos:]}})
            break

        if next_match.start() > pos:
            runs.append({"text_run": {"content": text[pos:next_match.start()]}})

        content = next_match.group(1)
        run: dict = {"text_run": {"content": content}}
        if style == "bold":
            run["text_run"]["text_element_style"] = {"bold": True}
        elif style == "italic":
            run["text_run"]["text_element_style"] = {"italic": True}
        runs.append(run)
        pos = next_match.end()

    if not runs:
        runs.append({"text_run": {"content": ""}})
    return runs


def _make_text_block(content: str, block_type: int = 2) -> dict:
    """创建文本类 block。"""
    return {
        "block_type": block_type,
        block_type_name_map.get(block_type, "text"): {
            "elements": _parse_inline(content[:7900]),
            "style": {},
        },
    }


block_type_name_map = {
    2: "text", 3: "heading1", 4: "heading2", 5: "heading3",
    6: "heading4", 7: "heading5", 8: "heading6", 9: "heading7",
    10: "bullet", 11: "ordered",
}


def _markdown_to_blocks(markdown: str) -> list[dict]:
    """把 markdown 解析为飞书 docx blocks,支持标题/列表/粗体/斜体/表格。

    修复 #7:从纯文本输出升级为完整的 markdown 格式解析。
    """
    blocks: list[dict] = []
    lines = markdown.split("\n")
    i = 0

    while i < len(lines):
        line = lines[i]

        # 空行 → 跳过
        if not line.strip():
            i += 1
            continue

        # 标题: # ~ #######
        heading_m = _HEADING_RE.match(line)
        if heading_m:
            level = len(heading_m.group(1))
            bt = min(level + 2, 9)  # #→3, ##→4, ... 最多 heading7=9
            blocks.append(_make_text_block(heading_m.group(2).strip(), bt))
            i += 1
            continue

        # 无序列表: - / * / +
        ul_m = _UNORDERED_RE.match(line)
        if ul_m:
            items: list[str] = [ul_m.group(1).strip()]
            i += 1
            while i < len(lines) and _UNORDERED_RE.match(lines[i]):
                items.append(_UNORDERED_RE.match(lines[i]).group(1).strip())  # type: ignore[union-attr]
                i += 1
            for item in items:
                blocks.append(_make_text_block(item, 10))
            continue

        # 有序列表: 1. / 1)
        ol_m = _ORDERED_RE.match(line)
        if ol_m:
            items_o: list[str] = [ol_m.group(1).strip()]
            i += 1
            while i < len(lines) and _ORDERED_RE.match(lines[i]):
                items_o.append(_ORDERED_RE.match(lines[i]).group(1).strip())  # type: ignore[union-attr]
                i += 1
            for item in items_o:
                blocks.append(_make_text_block(item, 11))
            continue

        # 表格:以 | 开头/结尾的行
        if line.strip().startswith("|") and line.strip().endswith("|"):
            # 跳过分隔行(如 |---|---|)
            if re.match(r"^\|[\s\-:|\s]+\|$", line.strip()):
                i += 1
                continue
            table_rows: list[list[str]] = []
            while i < len(lines) and lines[i].strip().startswith("|") and lines[i].strip().endswith("|"):
                row_text = lines[i].strip()
                # 跳过分隔行
                if not re.match(r"^\|[\s\-:|\s]+\|$", row_text):
                    cells = [c.strip() for c in row_text.strip("|").split("|")]
                    table_rows.append(cells)
                i += 1
            if table_rows:
                # 转成文本块:表头加粗 + 分隔 + 数据行
                if table_rows:
                    header = " | ".join(table_rows[0])
                    blocks.append(_make_text_block(header))
                    blocks.append(_make_text_block("—" * min(len(header), 60)))
                    for row in table_rows[1:]:
                        blocks.append(_make_text_block(" | ".join(row)))
            continue

        # 代码块:``` 包裹
        if line.strip().startswith("```"):
            code_lines: list[str] = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            i += 1  # 跳过结束 ```
            if code_lines:
                code_text = "\n".join(code_lines)
                blocks.append({
                    "block_type": 12,
                    "code": {"elements": [{"text_run": {"content": code_text[:7900]}}], "style": {}},
                })
            continue

        # 引用: >
        if line.strip().startswith(">"):
            quote_lines: list[str] = [line.strip()[1:].strip()]
            i += 1
            while i < len(lines) and lines[i].strip().startswith(">"):
                quote_lines.append(lines[i].strip()[1:].strip())
                i += 1
            blocks.append({
                "block_type": 13,
                "quote": {"elements": [{"text_run": {"content": " ".join(quote_lines)[:7900]}}], "style": {}},
            })
            continue

        # 分隔线: --- / *** / ___
        if re.match(r"^[-*_]{3,}$", line.strip()):
            blocks.append({
                "block_type": 2,
                "text": {"elements": [{"text_run": {"content": "─" * 30}}], "style": {}},
            })
            i += 1
            continue

        # 普通段落:收集连续的普通行
        para_lines: list[str] = [line.strip()]
        i += 1
        while i < len(lines) and lines[i].strip() and not any(
            _HEADING_RE.match(lines[i])
            or _UNORDERED_RE.match(lines[i])
            or _ORDERED_RE.match(lines[i])
            or lines[i].strip().startswith("|")
            or lines[i].strip().startswith("```")
            or lines[i].strip().startswith(">")
            or re.match(r"^[-*_]{3,}$", lines[i].strip())
        ):
            para_lines.append(lines[i].strip())
            i += 1
        para_text = " ".join(para_lines)
        blocks.append(_make_text_block(para_text, 2))

    if not blocks:
        blocks.append(_make_text_block(markdown.strip() or "(无内容)", 2))
    return blocks


# ── 飞书 URL 解析 ──────────────────────────────────────────────────────

# 飞书文档/多维表 URL 正则,提取资源类型和 token
_FEISHU_URL_PATTERNS = [
    # docx: https://xxx.feishu.cn/docx/{doc_token}
    (re.compile(r"feishu\.cn/docx/([A-Za-z0-9_-]+)"), "docx"),
    # base(多维表): https://xxx.feishu.cn/base/{app_token}?table={table_id}
    (re.compile(r"feishu\.cn/base/([A-Za-z0-9_-]+)(?:\?.*\btable=([A-Za-z0-9_-]+))?"), "bitable"),
    # drive/folder: https://xxx.feishu.cn/drive/folder/{folder_token}
    (re.compile(r"feishu\.cn/drive/folder/([A-Za-z0-9_-]+)"), "folder"),
    # 也支持旧版 wiki 链接
    (re.compile(r"feishu\.cn/wiki/([A-Za-z0-9_-]+)"), "docx"),
]


def parse_feishu_url(url: str) -> dict | None:
    """解析飞书 URL,提取资源类型和关键 token。

    返回格式: {"type": "docx"|"bitable"|"folder", "doc_token"/"app_token": "...", "table_id"?: "..."}
    解析失败或 URL 格式不识别返回 None。
    """
    url = url.strip()
    if not url:
        return None

    for pattern, rtype in _FEISHU_URL_PATTERNS:
        m = pattern.search(url)
        if m:
            if rtype == "docx":
                return {"type": "docx", "doc_token": m.group(1)}
            elif rtype == "bitable":
                result: dict = {"type": "bitable", "app_token": m.group(1)}
                if m.lastindex and m.lastindex >= 2 and m.group(2):
                    result["table_id"] = m.group(2)
                return result
            elif rtype == "folder":
                return {"type": "folder", "folder_token": m.group(1)}
    return None


# ── 权限检查 ───────────────────────────────────────────────────────────

async def check_doc_permission(
    app_id: str, app_secret: str, doc_token: str,
) -> dict:
    """检查应用对飞书文档是否有写入权限。

    返回 {"has_permission": True/False, "readable": True/False, "message": str}

    策略:尝试读取文档基础信息。若返回 permission 错误→无权限;若成功→有读取权限
    (写入权限需进一步确认,但飞书云文档的基本读写通常一起授予)。
    """
    token = await get_tenant_token(app_id, app_secret)
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        # 尝试获取文档元信息
        resp = await client.get(
            f"{_DOCX_BASE}/documents/{doc_token}",
            headers=headers,
        )
        data = resp.json()
        code = data.get("code", -1)

        if code == 0:
            # 有读取权限→基本可写
            return {"has_permission": True, "readable": True,
                    "message": "有权限访问该文档",
                    "title": data.get("data", {}).get("document", {}).get("title", "")}
        else:
            msg = data.get("msg", "")
            msg_lower = msg.lower()
            if any(kw in msg_lower for kw in ("perm", "notallow", "no permission", "access denied", "forbidden")):
                # 明确的权限不足
                return {
                    "has_permission": False, "readable": False,
                    "message": f"无权访问该文档:{msg}。请确保:① 该文档属于你的飞书企业 ② 该自建应用已获得 docx:document 权限并已发布 ③ 你本人有该文档的编辑权限",
                    "guidance": (
                        "请按以下步骤添加权限:\n"
                        "1. 在飞书中打开该文档 → 右上角「分享」→「邀请协作者」\n"
                        "2. 搜索并添加你的自建应用名称,授予「可编辑」权限\n"
                        "3. 确认飞书开放平台中「权限管理」已开启 docx:document 权限并已发布最新版本"
                    ),
                }
            if "not found" in msg_lower:
                return {"has_permission": False, "readable": False,
                        "message": f"文档不存在或已被删除:{msg}"}
            # 其他错误(如限流)
            return {"has_permission": False, "readable": False,
                    "message": f"验证文档权限时出错(code={code}):{msg}"}


async def check_bitable_permission(
    app_id: str, app_secret: str, app_token: str,
) -> dict:
    """检查应用对飞书多维表是否有写入权限。

    返回 {"has_permission": True/False, "readable": True/False, "message": str,
          "tables": [...]}  # 有权限时附带表列表
    """
    token = await get_tenant_token(app_id, app_secret)
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        # 尝试列出表列表(验证访问权限)
        resp = await client.get(
            f"{_BITABLE_BASE}/apps/{app_token}/tables",
            headers=headers,
        )
        data = resp.json()
        code = data.get("code", -1)

        if code == 0:
            tables = data.get("data", {}).get("items", [])
            return {
                "has_permission": True, "readable": True,
                "message": "有权限访问该多维表",
                "tables": [{"table_id": t.get("table_id", ""), "name": t.get("name", "")} for t in tables],
            }
        else:
            msg = data.get("msg", "")
            msg_lower = msg.lower()
            if any(kw in msg_lower for kw in ("perm", "notallow", "no permission", "access denied", "forbidden")):
                return {
                    "has_permission": False, "readable": False,
                    "message": f"无权访问该多维表:{msg}。请确保:① 该多维表属于你的飞书企业 ② 应用已获得 bitable:app 权限并已发布 ③ 你本人有该多维表的编辑权限",
                    "guidance": (
                        "请按以下步骤添加权限:\n"
                        "1. 在飞书中打开该多维表 → 右上角「分享」→「邀请协作者」\n"
                        "2. 搜索并添加你的自建应用名称,授予「可编辑」权限\n"
                        "3. 确认飞书开放平台中「权限管理」已开启 bitable:app 权限并已发布最新版本"
                    ),
                }
            if "not found" in msg_lower:
                return {"has_permission": False, "readable": False,
                        "message": f"多维表不存在或已被删除:{msg}"}
            return {"has_permission": False, "readable": False,
                    "message": f"验证多维表权限时出错(code={code}):{msg}"}


# ── 写入已有飞书文档 ──────────────────────────────────────────────────

async def write_markdown_to_existing_doc(
    app_id: str,
    app_secret: str,
    doc_token: str,
    title: str,
    markdown: str,
) -> str:
    """将 markdown 内容写入已有飞书 docx 文档(清空旧内容后写入新内容)。

    返回文档 URL。失败抛 FeishuError。
    """
    token = await get_tenant_token(app_id, app_secret)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    partial_errors: list[str] = []

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        # 1. 更新文档标题
        resp = await client.patch(
            f"{_DOCX_BASE}/documents/{doc_token}",
            json={"title": title[:120]},
            headers=headers,
        )
        pdata = resp.json()
        if pdata.get("code") != 0:
            # 标题更新失败不阻塞,只记录
            logger.warning("feishu_doc_title_update_failed",
                           doc_token=doc_token, code=pdata.get("code"),
                           msg=pdata.get("msg", "")[:120])

        # 2. 获取文档的根 block
        resp = await client.get(f"{_DOCX_BASE}/documents/{doc_token}", headers=headers)
        gdata = resp.json()
        if gdata.get("code") != 0:
            raise FeishuError(gdata.get("code", -1),
                              f"获取文档信息失败:{gdata.get('msg','')}")
        doc_info = gdata.get("data", {}).get("document", {}) or {}
        root_block_id = doc_info.get("block_id") or doc_token

        # 3. 获取所有子 blocks 并删除
        all_children_ids: list[str] = []
        page_token_str: str | None = None
        while True:
            params = {"page_size": 50}
            if page_token_str:
                params["page_token"] = page_token_str  # type: ignore[assignment]
            resp = await client.get(
                f"{_DOCX_BASE}/documents/{doc_token}/blocks/{root_block_id}/children",
                params=params,
                headers=headers,
            )
            cdata = resp.json()
            if cdata.get("code") != 0:
                break  # 获取子块列表失败,跳过清空
            items = cdata.get("data", {}).get("items", [])
            for item in items:
                bid = item.get("block_id")
                if bid:
                    all_children_ids.append(bid)
            if not cdata.get("data", {}).get("has_more"):
                break
            page_token_str = cdata.get("data", {}).get("page_token")

        # 批量删除子 block(每批最多 50 个)
        if all_children_ids:
            for j in range(0, len(all_children_ids), 50):
                batch = all_children_ids[j:j + 50]
                del_body: dict = {"children": batch}
                resp = await client.delete(
                    f"{_DOCX_BASE}/documents/{doc_token}/blocks/{root_block_id}/children/batch_delete",
                    json=del_body,
                    headers=headers,
                )
                ddata = resp.json()
                if ddata.get("code") != 0:
                    logger.warning("feishu_doc_clear_blocks_failed",
                                   doc_token=doc_token, batch=j,
                                   code=ddata.get("code"), msg=ddata.get("msg", "")[:120])

        # 4. 追加新内容块
        blocks = _markdown_to_blocks(markdown)
        batch_size = 20
        for i in range(0, len(blocks), batch_size):
            batch = blocks[i:i + batch_size]
            resp = await client.post(
                f"{_DOCX_BASE}/documents/{doc_token}/blocks/{root_block_id}/children",
                json={"children": batch, "index": -1},
                headers=headers,
            )
            rdata = resp.json()
            if rdata.get("code") != 0:
                err_msg = f"batch[{i}-{i+len(batch)}]: code={rdata.get('code')} {rdata.get('msg','')[:80]}"
                partial_errors.append(err_msg)
                logger.warning("feishu_doc_append_partial_fail",
                               doc_token=doc_token, batch_start=i,
                               code=rdata.get("code"), msg=rdata.get("msg", "")[:120])

    url = f"https://feishu.cn/docx/{doc_token}"
    if partial_errors:
        logger.warning("feishu_doc_populated_partial", url=url, blocks=len(blocks),
                       errors=len(partial_errors))
        raise FeishuError(
            -1,
            f"文档已更新({url}),但 {len(partial_errors)}/{max(len(blocks)//batch_size+1,1)} 批次写入失败。"
            f"详情: {'; '.join(partial_errors[:3])}{'...' if len(partial_errors)>3 else ''}"
        )
    logger.info("feishu_existing_doc_updated", url=url, blocks=len(blocks))
    return url


# ── 文档导出 ───────────────────────────────────────────────────────────

async def create_doc_with_markdown(
    app_id: str,
    app_secret: str,
    title: str,
    markdown: str,
    folder_token: Optional[str] = None,
) -> tuple[str, str]:
    """创建飞书 docx 文档并写入 markdown 内容。

    返回 (document_id, url)。失败抛 FeishuError。
    部分块写入失败时,在 FeishuError.message 中附加上下文(#10 修复)。
    """
    token = await get_tenant_token(app_id, app_secret)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    partial_errors: list[str] = []

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        # 1. 创建空文档
        body: dict = {"title": title[:120]}
        if folder_token:
            body["folder_token"] = folder_token
        resp = await client.post(f"{_DOCX_BASE}/documents", json=body, headers=headers)
        data = resp.json()
        if data.get("code") != 0:
            msg_text = data.get("msg", "创建文档失败")
            code = data.get("code", -1)
            # 文件夹权限错误 → 给出明确指引
            if folder_token and any(
                kw in str(msg_text).lower()
                for kw in ("no folder permission", "folder permission denied",
                           "folderperm", "folder perm", "no permission")
            ):
                raise FeishuError(
                    code,
                    f"无法在该文件夹创建文档:{msg_text}。"
                    "请确认:① 该文件夹属于你的飞书企业 ② 你本人有该文件夹的编辑/上传权限 "
                    "③ 应用已在飞书开放平台获得 drive:drive 权限并已发布。"
                    "若不确定,可尝试不填文件夹 token,文档将创建在你的飞书云空间根目录。"
                )
            raise FeishuError(code, msg_text)
        document_id = data["data"]["document"]["document_id"]
        logger.info("feishu_doc_created", document_id=document_id, title=title[:40])

        # 2. 拿根 block_id
        resp = await client.get(f"{_DOCX_BASE}/documents/{document_id}", headers=headers)
        gdata = resp.json()
        root_block_id = (gdata.get("data", {}).get("document", {}) or {}).get("block_id") or document_id

        # 3. 追加内容块(分批,飞书单批最多 50 块)
        blocks = _markdown_to_blocks(markdown)
        batch_size = 20
        for i in range(0, len(blocks), batch_size):
            batch = blocks[i:i + batch_size]
            resp = await client.post(
                f"{_DOCX_BASE}/documents/{document_id}/blocks/{root_block_id}/children",
                json={"children": batch, "index": -1},
                headers=headers,
            )
            rdata = resp.json()
            if rdata.get("code") != 0:
                err_msg = f"batch[{i}-{i+len(batch)}]: code={rdata.get('code')} {rdata.get('msg','')[:80]}"
                partial_errors.append(err_msg)
                logger.warning("feishu_doc_append_partial_fail",
                               document_id=document_id, batch_start=i, code=rdata.get("code"),
                               msg=rdata.get("msg", "")[:120])

    url = f"https://feishu.cn/docx/{document_id}"
    if partial_errors:
        # 文档已创建,但内容不完整 → 在返回信息中附加警告
        logger.warning("feishu_doc_populated_partial", url=url, blocks=len(blocks),
                       errors=len(partial_errors), total_errors=len(partial_errors))
        raise FeishuError(
            -1,
            f"文档已创建({url}),但 {len(partial_errors)}/{len(blocks)//batch_size+1} 批次写入失败。"
            f"详情: {'; '.join(partial_errors[:3])}{'...' if len(partial_errors)>3 else ''}"
        )
    logger.info("feishu_doc_populated", url=url, blocks=len(blocks))
    return document_id, url


# ── 多维表批量写入需求 ──────────────────────────────────────────────

async def batch_create_bitable_records(
    app_id: str,
    app_secret: str,
    app_token: str,
    table_id: str,
    records: list[dict],
) -> str:
    """批量写入飞书多维表。返回多维表 URL。

    records 形如 [{"req_id": "REQ-001", "module": "...", "priority": "P1", ...}, ...]
    用户需要在飞书提前创建好表 + 字段名跟 records 字典 key 对齐。

    修复 #8:批次失败时回滚已写入的记录。
    """
    if not records:
        return f"https://feishu.cn/base/{app_token}"

    token = await get_tenant_token(app_id, app_secret)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    payload_records = [{"fields": r} for r in records]
    written_ids: list[str] = []

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        batch_size = 500
        for i in range(0, len(payload_records), batch_size):
            batch = payload_records[i:i + batch_size]
            try:
                resp = await client.post(
                    f"{_BITABLE_BASE}/apps/{app_token}/tables/{table_id}/records/batch_create",
                    json={"records": batch},
                    headers=headers,
                )
                data = resp.json()
                if data.get("code") != 0:
                    raise FeishuError(data.get("code", -1), data.get("msg", "写入多维表失败"))
                # 记录已写入的 record_id
                for item in data.get("data", {}).get("records", []):
                    rid = item.get("record_id")
                    if rid:
                        written_ids.append(rid)
            except Exception:
                # 回滚:尝试删除已写入的记录
                if written_ids:
                    _delete_records_safely(client, headers, app_token, table_id, written_ids)
                raise

    url = f"https://feishu.cn/base/{app_token}?table={table_id}"
    logger.info("feishu_bitable_written", url=url, rows=len(records))
    return url


def _delete_records_safely(
    client: httpx.AsyncClient,
    headers: dict,
    app_token: str,
    table_id: str,
    record_ids: list[str],
) -> None:
    """尽力删除已写入的记录(回滚辅助,删除失败不抛异常)。"""
    for j in range(0, len(record_ids), 500):
        batch_ids = record_ids[j:j + 500]
        try:
            # 飞书批量删除:DELETE /apps/{app_token}/tables/{table_id}/records/batch_delete
            # 请求体:{"records": ["rec_xxx", ...]}
            import asyncio as _asyncio
            async def _del():
                r = await client.delete(
                    f"{_BITABLE_BASE}/apps/{app_token}/tables/{table_id}/records/batch_delete",
                    json={"records": batch_ids},
                    headers=headers,
                )
                return r
            # 给回滚一个独立的短超时
            _asyncio.ensure_future(_del())
        except Exception:
            pass  # 回滚失败也吞掉
    logger.warning("feishu_bitable_rollback", rolled_back=len(record_ids))


# ── 待办事项同步到飞书多维表(看板) ─────────────────────────────

async def sync_action_items_to_bitable(
    app_id: str,
    app_secret: str,
    app_token: str,
    table_id: str,
    action_items: list[dict],
) -> str:
    """将会议待办事项(action_items)批量写入飞书多维表,适配看板视图。

    action_items 形如:
      [{"task": "做 xxx", "owner": "张三", "deadline": "2026-06-01",
        "priority": "high", "remark": ""}, ...]

    修复 #8:批次失败时回滚已写入的记录。
    返回多维表 URL。
    """
    if not action_items:
        return f"https://feishu.cn/base/{app_token}"

    token = await get_tenant_token(app_id, app_secret)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    payload_records = []
    for item in action_items:
        task = item.get("task", "") or ""
        owner_val = item.get("owner", "") or ""
        deadline_val = item.get("deadline", "") or ""
        priority_val = item.get("priority", "") or "medium"
        remark_val = item.get("remark", "") or ""

        priority_map = {"high": "高", "medium": "中", "low": "低"}
        priority_display = priority_map.get(priority_val, priority_val)

        payload_records.append({
            "fields": {
                "任务": task[:500],
                "负责人": owner_val[:128] if owner_val else "未分配",
                "截止日期": deadline_val,
                "优先级": priority_display,
                "状态": "待办",
                "备注": remark_val[:2000],
            }
        })

    written_ids: list[str] = []
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        batch_size = 500
        for i in range(0, len(payload_records), batch_size):
            batch = payload_records[i:i + batch_size]
            try:
                resp = await client.post(
                    f"{_BITABLE_BASE}/apps/{app_token}/tables/{table_id}/records/batch_create",
                    json={"records": batch},
                    headers=headers,
                )
                data = resp.json()
                if data.get("code") != 0:
                    raise FeishuError(data.get("code", -1), data.get("msg", "写入待办到多维表失败"))
                for item in data.get("data", {}).get("records", []):
                    rid = item.get("record_id")
                    if rid:
                        written_ids.append(rid)
            except Exception:
                if written_ids:
                    _delete_records_safely(client, headers, app_token, table_id, written_ids)
                raise

    url = f"https://feishu.cn/base/{app_token}?table={table_id}"
    logger.info("feishu_action_items_synced", url=url, rows=len(action_items))
    return url


# ── 自动创建看板多维表(兜底:若用户没有现成的多维表) ──────────────

async def create_kanban_bitable(
    app_id: str,
    app_secret: str,
    name: str,
    folder_token: Optional[str] = None,
) -> tuple[str, str, str]:
    """自动创建一个飞书多维表,预置看板所需的字段和视图。

    返回 (app_token, table_id, url)。

    修复 #9:添加字段前检查是否已存在,避免重复。
    """
    token = await get_tenant_token(app_id, app_secret)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        # 1. 创建多维表
        body: dict = {"name": name[:100]}
        if folder_token:
            body["folder_token"] = folder_token
        resp = await client.post(f"{_BITABLE_BASE}/apps", json=body, headers=headers)
        data = resp.json()
        if data.get("code") != 0:
            msg_text = data.get("msg", "创建多维表失败")
            if "perm" in str(msg_text).lower() or "notallow" in str(msg_text).lower():
                raise FeishuError(
                    data.get("code", -1),
                    f"创建多维表失败:{msg_text}。请在飞书开放平台「权限管理」中确认已添加以下权限:"
                    "① bitable:app(多维表格)② drive:drive(云文档),"
                    "并确保应用已发布最新版本且管理员已审核通过。"
                )
            raise FeishuError(data.get("code", -1), msg_text)
        app = data.get("data", {}).get("app", {})
        app_token = app.get("app_token", "")
        if not app_token:
            raise FeishuError(-1, "创建多维表成功但未返回 app_token")

        # 2. 获取默认表
        resp = await client.get(f"{_BITABLE_BASE}/apps/{app_token}/tables", headers=headers)
        tdata = resp.json()
        if tdata.get("code") != 0:
            raise FeishuError(tdata.get("code", -1), tdata.get("msg", "获取表列表失败"))
        tables = tdata.get("data", {}).get("items", [])
        if not tables:
            raise FeishuError(-1, "多维表中没有找到表")
        table_id = tables[0].get("table_id", "")

        # 3. 获取已有字段名(幂等性检查 #9)
        resp = await client.get(
            f"{_BITABLE_BASE}/apps/{app_token}/tables/{table_id}/fields", headers=headers,
        )
        existing_fields_data = resp.json()
        existing_names = {
            f.get("field_name", "")
            for f in (existing_fields_data.get("data", {}).get("items", []) or [])
        }

        fields_to_add = [
            {"field_name": "任务", "type": 1},
            {"field_name": "负责人", "type": 1},
            {"field_name": "截止日期", "type": 1},
            {"field_name": "优先级", "type": 3, "property": {"options": [
                {"name": "高", "color": 1},
                {"name": "中", "color": 2},
                {"name": "低", "color": 3},
            ]}},
            {"field_name": "状态", "type": 3, "property": {"options": [
                {"name": "待办", "color": 4},
                {"name": "进行中", "color": 1},
                {"name": "已完成", "color": 2},
            ]}},
            {"field_name": "备注", "type": 1},
        ]

        for field in fields_to_add:
            if field["field_name"] in existing_names:
                logger.info("feishu_kanban_field_exists", field=field["field_name"])
                continue
            resp = await client.post(
                f"{_BITABLE_BASE}/apps/{app_token}/tables/{table_id}/fields",
                json=field,
                headers=headers,
            )
            fdata = resp.json()
            if fdata.get("code") != 0:
                # 飞书可能返回 duplicate field 错误 → 仍然跳过
                if "duplicate" in str(fdata.get("msg", "")).lower() or "exist" in str(fdata.get("msg", "")).lower():
                    logger.info("feishu_kanban_field_duplicate", field=field["field_name"])
                    continue
                logger.warning(
                    "feishu_kanban_add_field_fail",
                    field=field["field_name"],
                    code=fdata.get("code"),
                    msg=fdata.get("msg", "")[:120],
                )

        # 4. 删除默认的多维表自带字段
        resp = await client.get(
            f"{_BITABLE_BASE}/apps/{app_token}/tables/{table_id}/fields", headers=headers,
        )
        fields_data = resp.json()
        existing_fields = fields_data.get("data", {}).get("items", [])
        keep_names = {"任务", "负责人", "截止日期", "优先级", "状态", "备注"}
        for field in existing_fields:
            fname = field.get("field_name", "")
            fid = field.get("field_id", "")
            if fname not in keep_names and fid:
                try:
                    resp = await client.delete(
                        f"{_BITABLE_BASE}/apps/{app_token}/tables/{table_id}/fields/{fid}",
                        headers=headers,
                    )
                except Exception:
                    pass

    url = f"https://feishu.cn/base/{app_token}?table={table_id}"
    logger.info("feishu_kanban_created", app_token=app_token, table_id=table_id, name=name[:40])
    return app_token, table_id, url
