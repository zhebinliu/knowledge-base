"""需求调研 v1 API — 顾问录入答案 + 范围分类触发 + LTC 模块映射查询 + 问卷题目 CRUD + 会前导出。

注意:大纲 / 问卷的"生成"复用现有 outputs API(POST /api/outputs/generate
        with kind=survey_outline / survey),走 runner.generate_survey_outline
        / generate_survey 这条已有路径。本路由负责:
- 顾问录入答案(upsert)
- 拉取已答
- 触发四分类
- 拉取 SOW → LTC 映射结果
- 问卷题目的「人工新增/编辑/删除」(写入 bundle.extra.questionnaire_items[])
- 会前问卷按角色导出 docx / xlsx / html(打印转 PDF)
"""
import urllib.parse
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from services._time import iso_utc
from fastapi.responses import Response, HTMLResponse
from pydantic import BaseModel, Field
from typing import Any, Literal
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from models import async_session_maker
from models.research_response import ResearchResponse
from models.research_ltc_module_map import ResearchLtcModuleMap
from models.curated_bundle import CuratedBundle
from models.project import Project
from services.auth import get_current_user

logger = structlog.get_logger()
router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class ResponseUpsertBody(BaseModel):
    bundle_id: str
    project_id: str | None = None
    item_key: str = Field(min_length=1, max_length=120)
    answer_value: Any = None
    scope_label: str | None = Field(default=None, pattern=r"^(new|digitize|migrate|out_of_scope)$")
    scope_label_source: str | None = Field(default=None, pattern=r"^(ai|manual)$")


class ResponseDto(BaseModel):
    item_key: str
    answer_value: Any
    scope_label: str | None
    scope_label_source: str | None
    updated_at: str


class ClassifyScopeBody(BaseModel):
    bundle_id: str
    ltc_module_key: str | None = None  # 不传则全部模块都分类一遍


# ── 答案录入 ────────────────────────────────────────────────────────────────

@router.post("/responses")
async def upsert_response(body: ResponseUpsertBody, user=Depends(get_current_user)):
    """顾问录入或更新一个答案。按 (bundle_id, item_key) upsert。"""
    async with async_session_maker() as s:
        # 校验 bundle 存在
        b = await s.get(CuratedBundle, body.bundle_id)
        if not b:
            raise HTTPException(404, "bundle 不存在")
        if b.project_id:
            from services.project_acl import assert_project_access
            await assert_project_access(user, b.project_id, "write")

        existing = (await s.execute(
            select(ResearchResponse).where(
                ResearchResponse.bundle_id == body.bundle_id,
                ResearchResponse.item_key == body.item_key,
            )
        )).scalar_one_or_none()

        if existing:
            if body.answer_value is not None:
                existing.answer_value = body.answer_value
            if body.scope_label is not None:
                existing.scope_label = body.scope_label
                existing.scope_label_source = body.scope_label_source or "manual"
            existing.updated_by = getattr(user, "id", None)
        else:
            row = ResearchResponse(
                bundle_id=body.bundle_id,
                project_id=body.project_id or b.project_id,
                item_key=body.item_key,
                answer_value=body.answer_value,
                scope_label=body.scope_label,
                scope_label_source=body.scope_label_source,
                updated_by=getattr(user, "id", None),
            )
            s.add(row)
        await s.commit()
    return {"ok": True}


@router.get("/responses")
async def list_responses(bundle_id: str, user=Depends(get_current_user)):
    """拉取一个 bundle 下所有顾问答案,按 item_key 索引返回。"""
    async with async_session_maker() as s:
        b = await s.get(CuratedBundle, bundle_id)
        if not b:
            raise HTTPException(404, "bundle 不存在")
        if b.project_id:
            from services.project_acl import assert_project_access
            await assert_project_access(user, b.project_id, "read")
        rows = (await s.execute(
            select(ResearchResponse).where(ResearchResponse.bundle_id == bundle_id)
        )).scalars().all()
    return {
        "items": [
            {
                "item_key": r.item_key,
                "answer_value": r.answer_value,
                "scope_label": r.scope_label,
                "scope_label_source": r.scope_label_source,
                "updated_at": iso_utc(r.updated_at),
            }
            for r in rows
        ]
    }


# ── 从项目下会议自动建议答案(2026-05-29) ──────────────────────────────────

class MeetingAutofillBody(BaseModel):
    bundle_id: str
    only_unanswered: bool = True  # 默认只对没答过的题目跑,避免覆盖顾问已录入


@router.post("/auto-fill-from-meetings")
async def auto_fill_from_meetings(body: MeetingAutofillBody, user=Depends(get_current_user)):
    """从本项目下已完成的会议(纪要 + 需求)给问卷题目生成「建议答案」。

    不直接写答案 — 顾问看到建议条后,点「采纳」前端再走 upsert_response。
    用法:进入需求调研工作区 → 顶部点「💡 从会议生成建议」→ 拿到 suggestions[] →
    每道题旁渲染建议条。
    """
    async with async_session_maker() as s:
        b = await s.get(CuratedBundle, body.bundle_id)
        if not b:
            raise HTTPException(404, "bundle 不存在")
        if b.kind != "survey":
            raise HTTPException(400, f"只能对 kind=survey 的 bundle 用此接口,当前 kind={b.kind}")
        if b.project_id:
            from services.project_acl import assert_project_access
            await assert_project_access(user, b.project_id, "write")

    from services.agentic.research.meeting_autofill import propose_answers_from_meetings
    result = await propose_answers_from_meetings(
        body.bundle_id, only_unanswered=body.only_unanswered,
    )
    return result


# ── 范围四分类触发 ────────────────────────────────────────────────────────

@router.post("/classify-scope")
async def classify_scope(body: ClassifyScopeBody, user=Depends(get_current_user)):
    async with async_session_maker() as s:
        b = await s.get(CuratedBundle, body.bundle_id)
        if not b:
            raise HTTPException(404, "bundle 不存在")
        if b.project_id:
            from services.project_acl import assert_project_access
            await assert_project_access(user, b.project_id, "write")
    """触发某个 bundle(可指定 LTC 模块)的范围四分类。

    依赖 bundle.extra.questionnaire_items 已生成 + research_responses 已有顾问答案。
    LLM 综合判断 → upsert 到 research_responses.scope_label,source='ai'。
    顾问之前手改过的(source='manual')不覆盖。
    """
    from services.agentic.research.scope_classifier import classify_scope_for_bundle
    result = await classify_scope_for_bundle(
        body.bundle_id,
        ltc_module_key=body.ltc_module_key,
    )
    return {"ok": True, **result}


# ── LTC 模块映射查询 ────────────────────────────────────────────────────────

@router.get("/ltc-module-map")
async def list_ltc_module_map(project_id: str, user=Depends(get_current_user)):
    """返回项目的 SOW → LTC 字典映射结果。前端工作区显示用。"""
    from services.project_acl import assert_project_access
    await assert_project_access(user, project_id, "read")
    async with async_session_maker() as s:
        rows = (await s.execute(
            select(ResearchLtcModuleMap)
            .where(ResearchLtcModuleMap.project_id == project_id)
            .order_by(ResearchLtcModuleMap.created_at.desc())
        )).scalars().all()
    return {
        "items": [
            {
                "id": r.id,
                "sow_term": r.sow_term,
                "mapped_ltc_key": r.mapped_ltc_key,
                "confidence": r.confidence,
                "is_extra": r.is_extra,
            }
            for r in rows
        ]
    }


# ── LTC 字典只读暴露(前端工作区渲染节点池/选项池用) ────────────────────────

@router.get("/ltc-dictionary", dependencies=[Depends(get_current_user)])
async def get_ltc_dictionary():
    """返回 LTC 字典全量。前端工作区左栏渲染模块清单 / 节点池用。"""
    from services.agentic.research.ltc_dictionary import ALL_LTC_MODULES
    return {
        "modules": [m.to_dict() for m in ALL_LTC_MODULES],
    }


# ── 问卷题目 CRUD(写入 bundle.extra.questionnaire_items) ───────────────────

class QuestionnaireItemBody(BaseModel):
    """前端提交的题目主体。LLM 生成时也会出同样字段,本接口为人工编辑的入口。"""
    bundle_id: str
    item_key: str | None = Field(default=None, max_length=120)  # 编辑/新增时若不传,后端按规则生成
    ltc_module_key: str = Field(min_length=1, max_length=80)
    audience_roles: list[str] = Field(default_factory=list)
    type: Literal["single", "multi", "rating", "number", "text", "node_pick"]
    question: str = Field(min_length=1, max_length=500)
    why: str = ""
    options: list[dict] = Field(default_factory=list)
    rating_scale: int = 5
    number_unit: str = ""
    required: bool = False
    hint: str = ""
    phase: Literal["pre_meeting", "in_meeting"] = "in_meeting"
    parent_item_key: str | None = None
    best_practice_refs: list[dict] = Field(default_factory=list)
    # 仅新增题(无 item_key)时生效:把新题插到这个 key 之后;
    # ""(空字符串)= 插到最前面;不传 / null = 追加到末尾(默认行为)
    insert_after_item_key: str | None = Field(default=None, max_length=120)


def _normalize_item(payload: dict, *, source: str) -> dict:
    """统一过 questionnaire_schema 的清洗:角色收敛 + 选项 sentinel + 序列化。"""
    from services.agentic.research.questionnaire_schema import (
        QuestionItem, OptionItem, ensure_sentinels, coerce_audience_roles,
    )
    raw = dict(payload)
    raw["audience_roles"] = coerce_audience_roles(raw.get("audience_roles")) or ["dept_head"]
    raw.setdefault("source", source)

    t = raw.get("type")
    if t in ("single", "multi", "node_pick"):
        opts = [OptionItem(**o) if isinstance(o, dict) else o for o in (raw.get("options") or [])]
        opts = ensure_sentinels(opts)
        raw["options"] = [o.to_dict() for o in opts]
    else:
        raw["options"] = []

    return QuestionItem.from_dict(raw).to_dict()


async def _load_bundle_for_edit(s, bundle_id: str, user=None, level: str = "write") -> CuratedBundle:
    b = await s.get(CuratedBundle, bundle_id)
    if not b:
        raise HTTPException(404, "bundle 不存在")
    if b.kind != "survey":
        raise HTTPException(400, f"只能编辑 kind=survey 的 bundle,当前 kind={b.kind}")
    if user and b.project_id:
        from services.project_acl import assert_project_access
        await assert_project_access(user, b.project_id, level)
    return b


@router.post("/questionnaire-items")
async def upsert_questionnaire_item(body: QuestionnaireItemBody, user=Depends(get_current_user)):
    """新增或更新一道题。
    - 不传 item_key → 视为新增,自动生成形如 `{ltc_module_key}::manual_{n}` 的稳定 key
    - 传 item_key → 视为编辑,按 item_key 替换原题(保留 sow_evidence / kb_refs 等 LLM 注入字段)
    返回写入后的完整题目对象 + 全 questionnaire_items 长度。
    """
    async with async_session_maker() as s:
        b = await _load_bundle_for_edit(s, body.bundle_id, user, "write")
        extra = dict(b.extra or {})
        items: list[dict] = list(extra.get("questionnaire_items") or [])

        payload = body.model_dump(exclude={"bundle_id"})
        existing_idx = -1
        if body.item_key:
            for i, it in enumerate(items):
                if it.get("item_key") == body.item_key:
                    existing_idx = i
                    break

        if existing_idx >= 0:
            # 编辑:保留原 LLM 注入字段(sow_evidence / kb_refs / scope_label*),只覆盖人工可改部分
            base = dict(items[existing_idx])
            # insert_after_item_key 是仅新增时用的字段,编辑分支里清掉,不污染 base
            payload_for_edit = {k: v for k, v in payload.items()
                                if v is not None and k != "insert_after_item_key"}
            base.update(payload_for_edit)
            base["item_key"] = body.item_key  # 保持稳定
            new_item = _normalize_item(base, source=base.get("source") or "manual")
            items[existing_idx] = new_item
            action = "updated"
        else:
            # 新增:自动生成 item_key
            base_key = body.item_key
            if not base_key:
                # 找出该模块下已有的人工 manual 序号
                taken = {it.get("item_key") for it in items}
                n = 1
                while f"{body.ltc_module_key}::manual_{n}" in taken:
                    n += 1
                base_key = f"{body.ltc_module_key}::manual_{n}"
            # 不要把 insert_after_item_key 字段写进题目本身
            payload_for_create = {k: v for k, v in payload.items() if k != "insert_after_item_key"}
            payload_for_create["item_key"] = base_key
            new_item = _normalize_item(payload_for_create, source="manual")

            # 按位置插入:""=插到最前;指定 key=插到该 key 之后;None/不传=追加末尾
            insert_after = body.insert_after_item_key
            if insert_after is None:
                items.append(new_item)
            elif insert_after == "":
                items.insert(0, new_item)
            else:
                target_idx = -1
                for i, it in enumerate(items):
                    if it.get("item_key") == insert_after:
                        target_idx = i
                        break
                if target_idx < 0:
                    # 找不到锚点 — 兜底追加末尾(避免 404 让顾问体验断)
                    items.append(new_item)
                else:
                    items.insert(target_idx + 1, new_item)
            action = "created"

        extra["questionnaire_items"] = items
        b.extra = extra
        flag_modified(b, "extra")
        await s.commit()

    return {"ok": True, "action": action, "item": new_item, "total": len(items)}


class FollowUpBody(BaseModel):
    bundle_id: str
    parent_item_key: str
    answer_value: Any = None
    max_followups: int = Field(default=3, ge=1, le=5)


@router.post("/follow-up")
async def generate_follow_up(body: FollowUpBody, user=Depends(get_current_user)):
    """根据父题答案动态生成追问(需求 6)。
    LLM 阅读父题 + 回答,生成 0-3 道挂在 parent_item_key 下的子题,
    parent_item_key 链路 + source='follow_up' 双重标记,前端可识别后做缩进展示。
    """
    async with async_session_maker() as s:
        b = await s.get(CuratedBundle, body.bundle_id)
        if not b:
            raise HTTPException(404, "bundle 不存在")
        if b.project_id:
            from services.project_acl import assert_project_access
            await assert_project_access(user, b.project_id, "write")
    from services.agentic.research.follow_up import generate_follow_ups
    result = await generate_follow_ups(
        bundle_id=body.bundle_id,
        parent_item_key=body.parent_item_key,
        answer_value=body.answer_value,
        max_followups=body.max_followups,
    )
    return result


@router.delete("/questionnaire-items")
async def delete_questionnaire_item(bundle_id: str, item_key: str, user=Depends(get_current_user)):
    """删除一道题(以及它的所有动态追问子题)。
    - 同时连带把 research_responses 里这些 item_key 的答案删掉(保持一致性)。
    """
    async with async_session_maker() as s:
        b = await _load_bundle_for_edit(s, bundle_id, user, "write")
        extra = dict(b.extra or {})
        items: list[dict] = list(extra.get("questionnaire_items") or [])

        # 找到所有要删的 key:本题 + 所有挂在它下面的 follow_up
        target_keys = {item_key}
        for it in items:
            if it.get("parent_item_key") == item_key:
                target_keys.add(it.get("item_key"))

        before = len(items)
        items = [it for it in items if it.get("item_key") not in target_keys]
        if len(items) == before:
            raise HTTPException(404, f"item_key={item_key} 不存在于该 bundle")

        extra["questionnaire_items"] = items
        b.extra = extra
        flag_modified(b, "extra")

        # 连带清理已录入的答案
        rows = (await s.execute(
            select(ResearchResponse).where(
                ResearchResponse.bundle_id == bundle_id,
                ResearchResponse.item_key.in_(target_keys),
            )
        )).scalars().all()
        for r in rows:
            await s.delete(r)

        await s.commit()

    return {"ok": True, "removed_keys": list(target_keys), "total": len(items)}


# ── 会前问卷按角色导出 ──────────────────────────────────────────────────────

EXPORT_FORMATS = {
    "docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"),
    "xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
    "html": ("text/html; charset=utf-8", "html"),
}


@router.get("/questionnaire/export-pre-meeting")
async def export_pre_meeting_questionnaire(
    bundle_id: str = Query(...),
    role: str = Query("all", description="executive / dept_head / frontline / it / all"),
    fmt: str = Query("docx", description="docx / xlsx / html"),
    user=Depends(get_current_user),
):
    """按角色导出会前调研问卷(纯空白模板,客户拿到从零填)。

    - phase 固定 pre_meeting(会中题不外发)
    - role='all' 导全部会前题;否则按 audience_roles 过滤
    - fmt='html' 返回可直接打开后 window.print() 转 PDF 的 HTML
    """
    from services.agentic.research.questionnaire_export import (
        export_docx, export_xlsx, export_html, filter_items, export_filename, ROLE_ALL,
    )
    from services.agentic.research.questionnaire_schema import VALID_AUDIENCE_ROLES
    from services.agentic.research.ltc_dictionary import ALL_LTC_MODULES

    if fmt not in EXPORT_FORMATS:
        raise HTTPException(400, f"不支持的格式 {fmt},允许:docx / xlsx / html")
    if role != ROLE_ALL and role not in VALID_AUDIENCE_ROLES:
        raise HTTPException(400, f"非法角色 {role},允许:{VALID_AUDIENCE_ROLES} 或 all")

    async with async_session_maker() as s:
        b = await s.get(CuratedBundle, bundle_id)
        if not b:
            raise HTTPException(404, "bundle 不存在")
        if b.kind != "survey":
            raise HTTPException(400, f"只能导出 survey 类 bundle,当前 kind={b.kind}")
        if b.project_id:
            from services.project_acl import assert_project_access
            await assert_project_access(user, b.project_id, "read")
        items_all = list((b.extra or {}).get("questionnaire_items") or [])
        # 拿项目名做文件名前缀
        project_name = ""
        if b.project_id:
            p = await s.get(Project, b.project_id)
            project_name = p.name if p else ""

    items = filter_items(items_all, role)
    ltc_label_lookup = {m.key: m.label for m in ALL_LTC_MODULES}

    if fmt == "docx":
        data = export_docx(project_name=project_name, role=role, items=items, ltc_label_lookup=ltc_label_lookup)
        media, ext = EXPORT_FORMATS["docx"]
        filename = export_filename(project_name, role, "docx")
        encoded = urllib.parse.quote(filename)
        return Response(
            content=data,
            media_type=media,
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"},
        )
    if fmt == "xlsx":
        data = export_xlsx(project_name=project_name, role=role, items=items, ltc_label_lookup=ltc_label_lookup)
        media, ext = EXPORT_FORMATS["xlsx"]
        filename = export_filename(project_name, role, "xlsx")
        encoded = urllib.parse.quote(filename)
        return Response(
            content=data,
            media_type=media,
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"},
        )
    # html: 直接渲染,前端在新窗口打开 → 用户点「打印 / 另存为 PDF」
    html = export_html(project_name=project_name, role=role, items=items, ltc_label_lookup=ltc_label_lookup)
    return HTMLResponse(content=html)
