"""飞书集成 minimal MVP(2026-05-11)。

源自 meeting-ai/services/feishu/ 的精简迁移,只保留两个核心能力:
1. 把会议纪要 markdown 导出为飞书 docx 文档
2. 把需求清单批量写入飞书多维表(用户预先创建好表)

凭证策略:每个用户在「系统设置 → 飞书集成」里配置自己的 feishu_app_id + feishu_app_secret。
不复用全局凭证(用户拍板,2026-05-11)。

依赖:仅 httpx(避免引入 aiohttp / cryptography)。
"""
from __future__ import annotations

import time
from typing import Optional

import httpx
import structlog

from models.user import User

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


# ── 凭证读取 ───────────────────────────────────────────────────────────

def get_user_feishu_credentials(user: User) -> Optional[tuple[str, str]]:
    """从 User 模型读出飞书凭证。未配置返回 None。"""
    if not user.feishu_app_id or not user.feishu_app_secret:
        return None
    return user.feishu_app_id, user.feishu_app_secret


# ── 简易 token 缓存(内存级,进程内)──────────────────────────────────

_token_cache: dict[str, tuple[str, float]] = {}  # app_id -> (token, expires_at)


async def get_tenant_token(app_id: str, app_secret: str) -> str:
    """获取 tenant access token,5 分钟内缓存复用。"""
    cached = _token_cache.get(app_id)
    if cached and time.time() < cached[1] - 300:  # 5 分钟提前刷新
        return cached[0]

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(_TOKEN_URL, json={"app_id": app_id, "app_secret": app_secret})
        if resp.status_code != 200:
            raise FeishuError(resp.status_code, f"HTTP {resp.status_code}: {resp.text[:200]}")
        data = resp.json()
        if data.get("code") != 0:
            raise FeishuError(data.get("code", -1), data.get("msg", "未知错误"))
        token = data["tenant_access_token"]
        expires_at = time.time() + data.get("expire", 7200)
        _token_cache[app_id] = (token, expires_at)
        logger.info("feishu_token_refreshed", app_id=app_id[:8] + "***", expire=data.get("expire"))
        return token


# ── markdown → 飞书 docx blocks(简化版) ──────────────────────────────

def _markdown_to_blocks(markdown: str) -> list[dict]:
    """把 markdown 按段落拆成飞书 text blocks(简化:不解析 # / 表格 / 列表格式)。

    飞书 docx 的 block_type:
      - 2: 文本段落
      - 3-9: 标题 1-7(我们简化只用 2)
    """
    blocks: list[dict] = []
    # 按双换行拆段
    paragraphs = [p.strip() for p in markdown.split("\n\n") if p.strip()]
    if not paragraphs:
        # 兜底:单段
        paragraphs = [markdown.strip() or "(无内容)"]

    for para in paragraphs:
        # 单段过长(飞书 docx 单 text 元素限制 8000 字)→ 截断
        text = para[:7900]
        blocks.append({
            "block_type": 2,
            "text": {
                "elements": [
                    {"text_run": {"content": text}}
                ]
            },
        })
    return blocks


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
    """
    token = await get_tenant_token(app_id, app_secret)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        # 1. 创建空文档
        body: dict = {"title": title[:120]}
        if folder_token:
            body["folder_token"] = folder_token
        resp = await client.post(f"{_DOCX_BASE}/documents", json=body, headers=headers)
        data = resp.json()
        if data.get("code") != 0:
            raise FeishuError(data.get("code", -1), data.get("msg", "创建文档失败"))
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
                logger.warning(
                    "feishu_doc_append_partial_fail",
                    document_id=document_id, code=rdata.get("code"), msg=rdata.get("msg", "")[:120],
                )
                # 部分失败不阻断,文档已经创建了

    url = f"https://feishu.cn/docx/{document_id}"
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
    """
    if not records:
        return f"https://feishu.cn/base/{app_token}"

    token = await get_tenant_token(app_id, app_secret)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # 转成飞书要求的 records 格式:[{fields: {...}}, ...]
    payload_records = [{"fields": r} for r in records]

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        # 飞书 batch_create 单次最多 1000 条
        batch_size = 500
        for i in range(0, len(payload_records), batch_size):
            batch = payload_records[i:i + batch_size]
            resp = await client.post(
                f"{_BITABLE_BASE}/apps/{app_token}/tables/{table_id}/records/batch_create",
                json={"records": batch},
                headers=headers,
            )
            data = resp.json()
            if data.get("code") != 0:
                raise FeishuError(data.get("code", -1), data.get("msg", "写入多维表失败"))

    url = f"https://feishu.cn/base/{app_token}?table={table_id}"
    logger.info("feishu_bitable_written", url=url, rows=len(records))
    return url


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

    飞书多维表的字段建议(key 对齐):
      - 文本字段: 任务(task)、负责人(owner)、截止日期(deadline)、备注(remark)
      - 单选字段: 优先级(priority)=高/中/低、状态(status)=待办/进行中/已完成
      - 如用户已在飞书侧将表格配置为看板视图,按"状态"分组即可形成看板

    返回多维表 URL。
    """
    if not action_items:
        return f"https://feishu.cn/base/{app_token}"

    token = await get_tenant_token(app_id, app_secret)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # 转成飞书 records 格式
    payload_records = []
    for item in action_items:
        task = item.get("task", "") or ""
        owner_val = item.get("owner", "") or ""
        deadline_val = item.get("deadline", "") or ""
        priority_val = item.get("priority", "") or "medium"
        remark_val = item.get("remark", "") or ""

        # 优先级映射: high→高, medium→中, low→低
        priority_map = {"high": "高", "medium": "中", "low": "低"}
        priority_display = priority_map.get(priority_val, priority_val)

        payload_records.append({
            "fields": {
                "任务": task[:500],
                "负责人": owner_val[:128] if owner_val else "未分配",
                "截止日期": deadline_val,
                "优先级": priority_display,
                "状态": "待办",  # 新建的待办默认状态
                "备注": remark_val[:2000],
            }
        })

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        batch_size = 500
        for i in range(0, len(payload_records), batch_size):
            batch = payload_records[i:i + batch_size]
            resp = await client.post(
                f"{_BITABLE_BASE}/apps/{app_token}/tables/{table_id}/records/batch_create",
                json={"records": batch},
                headers=headers,
            )
            data = resp.json()
            if data.get("code") != 0:
                raise FeishuError(data.get("code", -1), data.get("msg", "写入待办到多维表失败"))

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

    表字段:
      - 任务(文本)、负责人(文本)、截止日期(文本)、优先级(单选)、状态(单选)、备注(多行文本)

    自动创建看板视图,按"状态"字段分组。
    """
    token = await get_tenant_token(app_id, app_secret)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        # 1. 创建多维表
        body: dict = {"name": name[:100]}
        if folder_token:
            body["folder_token"] = folder_token
        resp = await client.post(
            f"{_BITABLE_BASE}/apps",
            json=body,
            headers=headers,
        )
        data = resp.json()
        if data.get("code") != 0:
            raise FeishuError(data.get("code", -1), data.get("msg", "创建多维表失败"))
        app = data.get("data", {}).get("app", {})
        app_token = app.get("app_token", "")
        if not app_token:
            raise FeishuError(-1, "创建多维表成功但未返回 app_token")

        # 2. 获取默认表(飞书创建多维表时会自动创建一个默认表)
        resp = await client.get(
            f"{_BITABLE_BASE}/apps/{app_token}/tables",
            headers=headers,
        )
        tdata = resp.json()
        if tdata.get("code") != 0:
            raise FeishuError(tdata.get("code", -1), tdata.get("msg", "获取表列表失败"))
        tables = tdata.get("data", {}).get("items", [])
        if not tables:
            raise FeishuError(-1, "多维表中没有找到表")
        table_id = tables[0].get("table_id", "")

        # 3. 添加字段: 任务(文本)、负责人(文本)、截止日期(文本)、优先级(单选)、状态(单选)、备注(多行文本)
        fields_to_add = [
            {"field_name": "任务", "type": 1},       # 1 = 文本
            {"field_name": "负责人", "type": 1},     # 1 = 文本
            {"field_name": "截止日期", "type": 1},   # 1 = 文本
            {"field_name": "优先级", "type": 3, "property": {"options": [
                {"name": "高", "color": 1},
                {"name": "中", "color": 2},
                {"name": "低", "color": 3},
            ]}},                                    # 3 = 单选
            {"field_name": "状态", "type": 3, "property": {"options": [
                {"name": "待办", "color": 4},
                {"name": "进行中", "color": 1},
                {"name": "已完成", "color": 2},
            ]}},                                    # 3 = 单选
            {"field_name": "备注", "type": 1},       # 1 = 文本(多行)
        ]

        for field in fields_to_add:
            resp = await client.post(
                f"{_BITABLE_BASE}/apps/{app_token}/tables/{table_id}/fields",
                json=field,
                headers=headers,
            )
            fdata = resp.json()
            if fdata.get("code") != 0:
                logger.warning(
                    "feishu_kanban_add_field_fail",
                    field=field["field_name"],
                    code=fdata.get("code"),
                    msg=fdata.get("msg", "")[:120],
                )

        # 4. 删除默认的多维表自带字段(飞书会默认创建一些字段)
        # 先获取所有字段
        resp = await client.get(
            f"{_BITABLE_BASE}/apps/{app_token}/tables/{table_id}/fields",
            headers=headers,
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
                    pass  # 删除默认字段失败不阻断

    url = f"https://feishu.cn/base/{app_token}?table={table_id}"
    logger.info("feishu_kanban_created", app_token=app_token, table_id=table_id, name=name[:40])
    return app_token, table_id, url
