"""API for output center: generate and retrieve CuratedBundles."""
import io
import structlog
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File, Form

from services._time import iso_utc, utcnow_naive

logger = structlog.get_logger()


def _content_disposition(filename: str) -> str:
    """RFC 5987 filename*=UTF-8'' 单独使用 — 所有 2012 年后的浏览器都支持,
    去掉 ASCII fallback 避免某些 Chrome 版本错误优先 fallback 把中文替换成 _。
    quote 用 safe='' 把所有非 unreserved 字符都百分号编码,符合 RFC 5987 attr-char 限制。"""
    return f"attachment; filename*=UTF-8''{quote(filename, safe='')}"


from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session
from models.curated_bundle import CuratedBundle
from models.challenge_round import ChallengeRound
from models.bundle_share import BundleShare
from services.auth import get_current_user, decode_access_token
from services.project_acl import assert_project_access
from models.user import User
import jwt as _jwt
import secrets

# 「客户向」交付物白名单 — 仅这些 kind 可生成免登录公开分享链接(对外可见)。
# 内部/工程类(object_field_layout / process_setup / implementation_plan / insight /
# research_report / kickoff_pptx / sharedev 等)一律不可公开分享。
PUBLIC_SHAREABLE_KINDS = {
    "kickoff_html",       # 启动会 PPT(HTML 在线播放)
    "research_plan",      # 调研计划(客户版)
    "survey_outline",     # 调研大纲
    "blueprint_design",   # 蓝图设计
    "test_plan",          # 测试计划
    "acceptance_report",  # 项目验收报告
}


async def get_user_via_query_or_header(
    request: Request,
    token: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
) -> User:
    """View / save HTML 端点用：浏览器 new tab 拿不到 Authorization header，允许 ?token=。"""
    auth = request.headers.get("Authorization", "")
    bearer = auth.split(" ", 1)[1].strip() if auth.lower().startswith("bearer ") else None
    real_tok = bearer or token
    if not real_tok:
        raise HTTPException(401, "未登录")
    try:
        payload = decode_access_token(real_tok)
    except _jwt.ExpiredSignatureError:
        raise HTTPException(401, "登录已过期")
    except _jwt.InvalidTokenError:
        raise HTTPException(401, "无效凭证")
    user_id = payload.get("sub")
    user = await session.get(User, user_id) if user_id else None
    if not user or not user.is_active:
        raise HTTPException(401, "用户不存在或已禁用")
    return user

router = APIRouter()


def _current_trace_id() -> str | None:
    """读 main.py request_id middleware 已 bind 到 structlog contextvars 的 request_id。

    在 generate API 创建 bundle 时塞到 extra.trace_id,Celery 任务起来后再从 bundle 读出
    rebind,这样异步任务链路里所有 logger.info/error 都自动带这个 trace_id。
    """
    try:
        from structlog.contextvars import get_contextvars
        return get_contextvars().get("request_id")
    except Exception:
        return None


KIND_TO_TASK = {
    "kickoff_pptx": "generate_kickoff_pptx",
    "kickoff_html": "generate_kickoff_html",
    "insight": "generate_insight",
    "survey": "generate_survey",
    "survey_outline": "generate_survey_outline",
    "research_plan": "generate_research_plan",
    "research_report": "generate_research_report",
    "blueprint_design": "generate_blueprint_design",
    "object_field_layout": "generate_object_field_layout",
    "process_setup": "generate_process_setup",
    "implementation_plan": "generate_implementation_plan",
    "test_plan": "generate_test_plan",
    "acceptance_report": "generate_acceptance_report",
}

# 所有 markdown 类 bundle kind — 走 content_md 字段,前端预览框可在线编辑 / 上传修订版。
# 二进制 kind(kickoff_pptx / kickoff_html)走自己的 PUT /html 路径,不在此列。
# PUT /{id}/content(在线编辑)+ POST /{id}/markdown-override(上传修订版)共用此白名单,
# 都触发修订学习 analyze_bundle_revision。
_EDITABLE_MARKDOWN_KINDS = {
    "insight", "survey", "survey_outline", "research_plan", "research_report",
    "blueprint_design", "object_field_layout", "process_setup",
    "implementation_plan", "test_plan", "acceptance_report",
}

KIND_TITLES = {
    "kickoff_pptx": "启动会 PPT（pptxgen）",
    "kickoff_html": "启动会 PPT（htmlppt）",
    "insight": "项目洞察报告",
    "survey": "调研问卷",
    "survey_outline": "调研大纲",
    "research_plan": "调研计划(客户版)",
    "research_report": "调研报告",
    "blueprint_design": "蓝图设计",
    "object_field_layout": "对象字段表(含布局)",
    "process_setup": "流程建设表",
    "implementation_plan": "实施任务清单",
    "test_plan": "测试计划",
    "acceptance_report": "项目验收报告",
}


class GenerateRequest(BaseModel):
    kind: str
    project_id: str


class GenerateRoleRequest(BaseModel):
    """按单个角色增量生成调研问卷题目。"""
    role: str   # executive / dept_head / frontline / it


class GenerateSessionRequest(BaseModel):
    """按单个场次手动触发生成调研问卷题目(2026-06-03)。
    extra_context (2026-06-04):用户本次重生前刚提供的补充内容(新会议纪要 / 新文档摘要 /
    客户反馈 等),LLM 据此结合现有上下文重新出题。空字符串等同于不补充。"""
    session_id: str
    extra_context: str | None = None


def _bundle_dto(b: CuratedBundle) -> dict:
    extra = b.extra or {}
    fk = b.file_key or ""
    file_ext = fk.rsplit(".", 1)[-1].lower() if "." in fk else ""
    return {
        "id": b.id,
        "kind": b.kind,
        "project_id": b.project_id,
        "title": b.title,
        "status": b.status,
        "error": b.error,
        # 2026-06-05:trace_id 从触发请求的 X-Request-ID 继承,贯穿 API → bundle → Celery 日志 → 错误提示;
        # 用户看到 failed 时把 trace_id 给后台,grep 一下能拉出全部 log。
        "trace_id": extra.get("trace_id"),
        "has_content": bool(b.content_md),
        "has_file": bool(b.file_key),
        "file_ext": file_ext,
        "kb_calls": extra.get("generation_kb_calls") or [],
        "web_calls": extra.get("web_search_calls") or [],
        "has_industry_brief": bool(extra.get("has_industry_brief")),
        "created_at": b.created_at,
        "updated_at": b.updated_at,
        # agentic — 生成器元数据(用于 GapFiller 触发等)
        "agentic_version": extra.get("agentic_version"),
        "validity_status": extra.get("validity_status"),
        "ask_user_prompts": extra.get("ask_user_prompts") or [],
        "module_states": extra.get("module_states") or {},
        "short_circuited": bool(extra.get("short_circuited")),
        "provenance": extra.get("provenance") or {},     # v3: {module_key: {D1/K1/W1: meta}}
        "progress": extra.get("progress") or None,       # v3.1: 进度卡片 (生成中显示)
        "challenge_summary": extra.get("challenge_summary") or None,  # v3.1: 挑战循环结果摘要
        # 按角色逐步生成进度(2026-06-03):仅 survey kind 有,值是 {executive,dept_head,frontline,it} → status
        "role_progress": extra.get("role_progress") or {},
        "web_search_status": extra.get("web_search_status") or None,  # v3.4: M9 web 检索结果状态
        # research — 需求调研工作区前端消费
        "questionnaire_items": extra.get("questionnaire_items") or [],
        "ltc_module_map": extra.get("ltc_module_map") or [],
        "outline_sessions": extra.get("outline_sessions") or [],   # 2026-06-03 大纲 M3 场次结构化
        "plan_sessions":    extra.get("plan_sessions") or [],      # 2026-06-03 计划 markdown 抽出来的对客版场次
        "session_progress": extra.get("session_progress") or {},   # 2026-06-03 按场次触发进度


        # implementation — 项目实施工作台前端消费(implementation_plan kind)
        "implementation_tasks": extra.get("tasks") or [],
    }


async def enqueue_generation(
    *, user: User, project_id: str, kind: str, session: AsyncSession
) -> CuratedBundle:
    """创建 pending bundle + fire 对应 Celery 生成任务,返回 bundle。

    HTTP `POST /generate` 与 MCP `generate_output` 工具共用此函数,避免
    KIND_TO_TASK → task 映射在两处重复硬编码(§6.8 漂移源)。
    **调用方负责 write 权限校验**(本函数不校权限)。
    """
    if kind not in KIND_TO_TASK:
        raise HTTPException(400, f"Invalid kind. Must be one of: {list(KIND_TO_TASK)}")

    from models.project import Project
    proj = await session.get(Project, project_id)
    if not proj:
        raise HTTPException(404, "Project not found")

    title = f"{KIND_TITLES[kind]} · {proj.name}"
    bundle = CuratedBundle(
        kind=kind,
        project_id=project_id,
        title=title,
        status="pending",
        created_by=user.id,
        created_by_name=user.username,
        extra={"trace_id": _current_trace_id()},
    )
    session.add(bundle)
    await session.commit()
    await session.refresh(bundle)

    # Fire Celery task
    # 注意:这个字典必须覆盖 KIND_TO_TASK 的全部 key,缺一个就 KeyError 500
    from tasks.output_tasks import (
        generate_kickoff_pptx, generate_kickoff_html,
        generate_insight, generate_survey, generate_survey_outline,
        generate_research_plan, generate_research_report, generate_blueprint_design,
        generate_object_field_layout, generate_process_setup,
        generate_implementation_plan, generate_test_plan, generate_acceptance_report,
    )
    task_fn = {
        "kickoff_pptx": generate_kickoff_pptx,
        "kickoff_html": generate_kickoff_html,
        "insight": generate_insight,
        "survey": generate_survey,
        "survey_outline": generate_survey_outline,
        "research_plan": generate_research_plan,
        "research_report": generate_research_report,
        "blueprint_design": generate_blueprint_design,
        "object_field_layout": generate_object_field_layout,
        "process_setup": generate_process_setup,
        "implementation_plan": generate_implementation_plan,
        "test_plan": generate_test_plan,
        "acceptance_report": generate_acceptance_report,
    }[kind]
    task_fn.delay(bundle.id, project_id)
    return bundle


@router.post("/generate", status_code=202)
async def generate_output(
    body: GenerateRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await assert_project_access(current_user, body.project_id, "write")
    bundle = await enqueue_generation(
        user=current_user, project_id=body.project_id, kind=body.kind, session=session
    )
    return _bundle_dto(bundle)


_VALID_SURVEY_ROLES = ("executive", "dept_head", "frontline", "it")


@router.post("/{bundle_id}/generate-role", status_code=202)
async def generate_survey_role(
    bundle_id: str,
    body: GenerateRoleRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """按单个角色增量生成调研问卷题目(2026-06-03)。

    仅 kind=='survey' 的 bundle 可调。bundle 不存在或角色非法返回 4xx;
    其余直接 fire Celery generate_survey_role,前端按既有 bundle 轮询机制
    通过 extra.role_progress 看进度。
    """
    if body.role not in _VALID_SURVEY_ROLES:
        raise HTTPException(400, f"Invalid role. Must be one of: {list(_VALID_SURVEY_ROLES)}")
    bundle = await session.get(CuratedBundle, bundle_id)
    if not bundle:
        raise HTTPException(404, "Bundle not found")
    if bundle.kind != "survey":
        raise HTTPException(400, f"bundle.kind={bundle.kind!r}, only survey supports per-role generation")
    if not bundle.project_id:
        raise HTTPException(400, "Bundle has no project_id")

    from services.project_acl import assert_project_access
    await assert_project_access(current_user, bundle.project_id, "write")

    # 立即把 role_progress[role] = 'generating' 写回(让前端轮询即时可见)
    # 顺手刷新 trace_id 为本次触发的 request_id,跟新一轮 celery 日志对齐
    extra = dict(bundle.extra or {})
    rp = dict(extra.get("role_progress") or {})
    rp[body.role] = "generating"
    extra["role_progress"] = rp
    extra["trace_id"] = _current_trace_id()
    bundle.extra = extra
    await session.commit()
    await session.refresh(bundle)

    # fire celery
    from tasks.output_tasks import generate_survey_role as _task
    _task.delay(bundle.id, bundle.project_id, body.role)

    logger.info("survey_role_dispatched",
                bundle_id=bundle_id, role=body.role,
                project_id=bundle.project_id, user_id=current_user.id)
    return _bundle_dto(bundle)


@router.post("/{bundle_id}/items/{item_key}/regenerate")
async def regenerate_survey_item(
    bundle_id: str,
    item_key: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """单题手动重新生成(2026-06-03)。

    同步调 LLM(约 5-15s,nginx proxy_read_timeout 180s 足够);成功后写回 bundle
    并返回更新后的 bundle DTO。保留 item_key / session_id / topic_cluster /
    interview_stage / audience_roles / ltc_module_key / phase / type 不变,
    只改 question / why / options / hint / rating_scale / number_unit。
    """
    from sqlalchemy.orm.attributes import flag_modified as _flag

    bundle = await session.get(CuratedBundle, bundle_id)
    if not bundle:
        raise HTTPException(404, "Bundle not found")
    if bundle.kind != "survey":
        raise HTTPException(400, f"bundle.kind={bundle.kind!r}, only survey supports item regeneration")
    if not bundle.project_id:
        raise HTTPException(400, "Bundle has no project_id")

    from services.project_acl import assert_project_access
    await assert_project_access(current_user, bundle.project_id, "write")

    extra = dict(bundle.extra or {})
    items: list[dict] = list(extra.get("questionnaire_items") or [])
    idx = next((i for i, it in enumerate(items) if it.get("item_key") == item_key), -1)
    if idx < 0:
        raise HTTPException(404, f"item_key={item_key} not found in bundle.extra.questionnaire_items")
    original = items[idx]

    # 加载 sessions(优先 plan_sessions,fallback outline_sessions)以便给 LLM 上下文
    from sqlalchemy import select as _select
    target_session: dict | None = None
    other_items_in_session: list[dict] = []
    sid = (original.get("session_id") or "").strip()
    if sid:
        sessions: list[dict] = []
        try:
            plan_rows = (await session.execute(
                _select(CuratedBundle)
                .where(CuratedBundle.project_id == bundle.project_id)
                .where(CuratedBundle.kind == "research_plan")
                .where(CuratedBundle.status == "done")
                .order_by(CuratedBundle.created_at.desc())
                .limit(1)
            )).scalars().all()
            if plan_rows:
                sessions = list((plan_rows[0].extra or {}).get("plan_sessions") or [])
            if not sessions:
                outline_rows = (await session.execute(
                    _select(CuratedBundle)
                    .where(CuratedBundle.project_id == bundle.project_id)
                    .where(CuratedBundle.kind == "survey_outline")
                    .where(CuratedBundle.status == "done")
                    .order_by(CuratedBundle.created_at.desc())
                    .limit(1)
                )).scalars().all()
                if outline_rows:
                    sessions = list((outline_rows[0].extra or {}).get("outline_sessions") or [])
        except Exception as e:
            logger.warning("regenerate_item_load_sessions_failed", error=str(e)[:200])
        target_session = next((s for s in sessions if s.get("session_id") == sid), None)
        other_items_in_session = [it for it in items if it.get("session_id") == sid]

    # 调 LLM 改写
    from services.agentic.research.single_q_regenerator import regenerate_item as _regen
    # 选 model:沿用 survey 的 agent_config
    from services.output_service import _get_output_agent_config
    agent_cfg = await _get_output_agent_config("survey")
    model = agent_cfg.get("model")
    new_item = await _regen(
        item=original,
        session=target_session,
        other_items_in_session=other_items_in_session,
        model=model,
    )
    if not new_item:
        raise HTTPException(502, "LLM 改写失败或返回无效内容,请重试")

    # 替换 + 持久化
    items[idx] = new_item
    extra["questionnaire_items"] = items
    bundle.extra = extra
    _flag(bundle, "extra")
    await session.commit()
    await session.refresh(bundle)

    logger.info("survey_item_regenerated",
                bundle_id=bundle_id, item_key=item_key,
                project_id=bundle.project_id, user_id=current_user.id)
    return _bundle_dto(bundle)


@router.post("/{bundle_id}/generate-session", status_code=202)
async def generate_survey_session(
    bundle_id: str,
    body: GenerateSessionRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """按单个场次手动触发生成调研问卷题目(2026-06-03)。

    body={session_id};仅 kind=='survey' 的 bundle 可调。
    立即把 session_progress[session_id]='generating' 写回 + fire celery。
    前端按 bundle 轮询机制通过 extra.session_progress 看进度。
    """
    if not (body.session_id or "").strip():
        raise HTTPException(400, "session_id is required")
    bundle = await session.get(CuratedBundle, bundle_id)
    if not bundle:
        raise HTTPException(404, "Bundle not found")
    if bundle.kind != "survey":
        raise HTTPException(400, f"bundle.kind={bundle.kind!r}, only survey supports per-session generation")
    if not bundle.project_id:
        raise HTTPException(400, "Bundle has no project_id")

    from services.project_acl import assert_project_access
    await assert_project_access(current_user, bundle.project_id, "write")

    # 立即写 session_progress[session_id]='generating' 让前端立即可见
    # 顺手刷新 trace_id 为本次触发的 request_id,跟新一轮 celery 日志对齐
    extra = dict(bundle.extra or {})
    sp = dict(extra.get("session_progress") or {})
    sp[body.session_id] = "generating"
    extra["session_progress"] = sp
    extra["trace_id"] = _current_trace_id()
    bundle.extra = extra
    from sqlalchemy.orm.attributes import flag_modified as _flag
    _flag(bundle, "extra")
    await session.commit()
    await session.refresh(bundle)

    from tasks.output_tasks import generate_survey_session as _task
    _task.delay(bundle.id, bundle.project_id, body.session_id, (body.extra_context or "").strip())

    logger.info("survey_session_dispatched",
                bundle_id=bundle_id, session_id=body.session_id,
                project_id=bundle.project_id, user_id=current_user.id,
                extra_chars=len((body.extra_context or "").strip()))
    return _bundle_dto(bundle)


@router.get("")
async def list_outputs(
    project_id: str | None = Query(None),
    kind: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(CuratedBundle)
    count_stmt = select(func.count()).select_from(CuratedBundle)

    # 权限隔离改为按项目级权限:
    # - admin 看所有
    # - 非 admin 看自己有权限的项目的所有 bundle(不再按 bundle.created_by 过滤,
    #   这样协作者能看到队友创的 bundle)
    if not current_user.is_admin:
        from services.project_acl import list_accessible_project_ids
        accessible_ids = await list_accessible_project_ids(current_user)
        if not accessible_ids:
            return {"total": 0, "page": page, "page_size": page_size, "items": []}
        stmt = stmt.where(CuratedBundle.project_id.in_(accessible_ids))
        count_stmt = count_stmt.where(CuratedBundle.project_id.in_(accessible_ids))

    if project_id:
        # 即便上面已经过滤,显式 project_id 也再校一次(返回 404 比 200+空列表更清晰)
        if not current_user.is_admin:
            from services.project_acl import assert_project_access
            await assert_project_access(current_user, project_id, "read")
        stmt = stmt.where(CuratedBundle.project_id == project_id)
        count_stmt = count_stmt.where(CuratedBundle.project_id == project_id)
    if kind:
        stmt = stmt.where(CuratedBundle.kind == kind)
        count_stmt = count_stmt.where(CuratedBundle.kind == kind)

    total = await session.scalar(count_stmt)
    rows = (await session.execute(
        stmt.order_by(CuratedBundle.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )).scalars().all()

    return {"total": total, "page": page, "page_size": page_size, "items": [_bundle_dto(b) for b in rows]}


@router.get("/stage-summary")
async def stage_summary(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """轻量阶段状态汇总:返回所有可见项目下每个 (project_id, kind, status) 的去重三元组。

    列表页 / 工作台首页的阶段徽章用它判定「已生成 / 生成中 / 未开始」。
    不分页 —— 否则项目一多,老项目的 bundle 会被全局最近 N 条挤掉,徽章误回落成「未开始」。
    只取三个字段,数据量 = 项目数 × kind 数 × 状态数,极小。"""
    stmt = select(
        CuratedBundle.project_id, CuratedBundle.kind, CuratedBundle.status
    ).distinct()

    if not current_user.is_admin:
        from services.project_acl import list_accessible_project_ids
        accessible_ids = await list_accessible_project_ids(current_user)
        if not accessible_ids:
            return {"items": []}
        stmt = stmt.where(CuratedBundle.project_id.in_(accessible_ids))

    rows = (await session.execute(stmt)).all()
    return {"items": [
        {"project_id": pid, "kind": kind, "status": status}
        for (pid, kind, status) in rows
    ]}


@router.get("/latest-by-kind")
async def latest_bundle_by_kind(
    project_id: str = Query(...),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """项目详情页 chip 专用:返回该项目下每个 kind 的最新 done + inflight bundle。

    chip(已生成 / 生成中 / 未开始)只看 done 和 pending/generating,彻底跟 failed
    bundle 数量脱钩。背景:2026-06-05 事故 — 同款 bug 让 research_report 短时间
    积累 18 条 failed,把 list_outputs(分页 page_size=20)第一页打爆,导致前端按
    kind 找 done 时全找不到,chip 全显示「尚未生成」。

    返回结构:
      { "<kind>": {
          "done":     bundle_dto | null,    # 最近一条成功 — chip 「已生成交付物」
          "inflight": bundle_dto | null,    # 最近一条 pending/generating — chip 「正在生成中…」
          "failed":   bundle_dto | null,    # 最近一条失败 — 若 updated_at 比 done 新,前端显示「最近一次失败 · trace=xxx」
      } }

    每个 (project_id, kind) 三档分别取 updated_at 最新一条。failed 暴露的目的:
    用户点了重试但失败,前端能在 chip 状态行显示「最近一次生成失败」+ trace_id 一键复制,
    便于把 trace 给后台 grep 日志。这是 2026-06-05 用户直接要求的能力。

    不分页 — 每个项目 kind 数固定(<20),每种最多 3 条返回,数据量极小。
    """
    # 权限沿用项目级
    if not current_user.is_admin:
        from services.project_acl import assert_project_access
        await assert_project_access(current_user, project_id, "read")

    # 一把拉该项目所有 done / inflight / failed bundle,内存里按 kind 分桶取每档最新
    rows = (await session.execute(
        select(CuratedBundle)
        .where(CuratedBundle.project_id == project_id)
        .where(CuratedBundle.status.in_(["done", "pending", "generating", "failed"]))
        .order_by(CuratedBundle.updated_at.desc())
    )).scalars().all()

    out: dict[str, dict] = {}
    for b in rows:
        slot = out.setdefault(b.kind, {"done": None, "inflight": None, "failed": None})
        if b.status == "done" and slot["done"] is None:
            slot["done"] = _bundle_dto(b)
        elif b.status in ("pending", "generating") and slot["inflight"] is None:
            slot["inflight"] = _bundle_dto(b)
        elif b.status == "failed" and slot["failed"] is None:
            slot["failed"] = _bundle_dto(b)
    return out


@router.get("/{bundle_id}")
async def get_output(
    bundle_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    b = await session.get(CuratedBundle, bundle_id)
    if not b:
        raise HTTPException(404, "Bundle not found")
    # 权限改为项目级 — bundle 所属 project 必须可访问
    if b.project_id and not current_user.is_admin:
        from services.project_acl import assert_project_access
        await assert_project_access(current_user, b.project_id, "read")
    dto = _bundle_dto(b)
    dto["content_md"] = b.content_md
    return dto


@router.get("/{bundle_id}/challenges")
async def list_challenge_rounds(
    bundle_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """挑战回合详情(每轮 critique JSON + 重生成的模块)。前端工作台「挑战回合」面板用。"""
    b = await session.get(CuratedBundle, bundle_id)
    if not b:
        raise HTTPException(404, "Bundle not found")
    if b.project_id and not current_user.is_admin:
        from services.project_acl import assert_project_access
        await assert_project_access(current_user, b.project_id, "read")
    rows = (await session.execute(
        select(ChallengeRound)
        .where(ChallengeRound.bundle_id == bundle_id)
        .order_by(ChallengeRound.round_idx)
    )).scalars().all()
    return {
        "bundle_id": bundle_id,
        "rounds": [
            {
                "id": r.id,
                "round_idx": r.round_idx,
                "status": r.status,
                "critique": r.critique_json,             # 完整 JSON
                "critique_raw": r.critique_raw,           # parse 失败时的原始 LLM 输出
                "modules_regenerated": r.modules_regenerated or [],
                "challenger_model": r.challenger_model,
                "regen_model": r.regen_model,
                "regen_chars": r.regen_chars,
                "duration_ms": r.duration_ms,
                "created_at": iso_utc(r.created_at),
            }
            for r in rows
        ],
    }


def _safe_filename(stem: str) -> str:
    """文件名净化:把 Windows / Mac 都不喜欢的字符换掉,去掉前后空格。
    保留中文,把 · / \\ : * ? " < > | 换成 -,合并连续空格 / 横线。
    """
    import re as _re
    s = _re.sub(r"[·/\\:*?\"<>|]+", "-", stem)
    s = _re.sub(r"\s+", " ", s).strip(" -")
    return s or "download"


async def _resolve_download_filename(b: CuratedBundle, session: AsyncSession, ext: str) -> str:
    """统一的文件名:'{客户/项目名}-{产物中文名}-{YYYYMMDD}.{ext}'。"""
    from datetime import datetime
    from models.project import Project
    proj_name = ""
    if b.project_id:
        proj = await session.get(Project, b.project_id)
        if proj:
            proj_name = proj.name or ""
    kind_label = KIND_TITLES.get(b.kind, b.kind)
    date_str = (b.updated_at or b.created_at or datetime.utcnow()).strftime("%Y%m%d")
    parts = [p for p in [proj_name, kind_label, date_str] if p]
    return f"{_safe_filename('-'.join(parts))}.{ext}"


@router.get("/{bundle_id}/download")
async def download_output(
    bundle_id: str,
    format: str | None = Query(None, regex="^(md|docx)$"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    b = await session.get(CuratedBundle, bundle_id)
    if not b:
        raise HTTPException(404, "Bundle not found")
    if b.project_id and not current_user.is_admin:
        from services.project_acl import assert_project_access
        await assert_project_access(current_user, b.project_id, "read")
    if False:  # legacy guard removed
        raise HTTPException(403, "Access denied")
    if b.status != "done":
        raise HTTPException(400, f"Bundle not ready (status={b.status})")

    # PPT / HTML 走 MinIO 原文件;docx 也走 MinIO 缓存(若已有)。
    # 但 insight / outline / survey 即使有 file_key=docx,旧 _build_docx 没渲染表格,
    # 所以默认强制重新生成,确保新版式生效;用户可显式 ?format=md 拿原始 markdown。
    if b.file_key and b.file_key.endswith((".pptx", ".html")):
        from config import settings
        from minio import Minio
        mc = Minio(settings.minio_endpoint, access_key=settings.minio_user, secret_key=settings.minio_password, secure=False)
        try:
            response = mc.get_object(settings.minio_bucket, b.file_key)
            data = response.read()
        except Exception as e:
            raise HTTPException(500, f"Failed to fetch file: {e}")
        if b.file_key.endswith(".pptx"):
            media_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            ext = "pptx"
        else:
            media_type = "text/html; charset=utf-8"
            ext = "html"
        filename = await _resolve_download_filename(b, session, ext)
        return StreamingResponse(io.BytesIO(data), media_type=media_type,
                                 headers={"Content-Disposition": _content_disposition(filename)})

    if not b.content_md:
        raise HTTPException(400, "No downloadable content available")

    # 报告类(insight / survey / survey_outline / research_plan / research_report):默认 docx,允许 ?format=md
    if format == "md":
        filename = await _resolve_download_filename(b, session, "md")
        return StreamingResponse(
            io.BytesIO(b.content_md.encode("utf-8")),
            media_type="text/markdown",
            headers={"Content-Disposition": _content_disposition(filename)},
        )

    # 默认:按需生成 docx(每次重新渲染,_build_docx 有更新会立即生效)
    from services.output_service import _build_docx
    docx_bytes = _build_docx(b.title or "导出", b.content_md)
    filename = await _resolve_download_filename(b, session, "docx")
    return StreamingResponse(
        io.BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": _content_disposition(filename)},
    )


_DECK_NAV_TEMPLATE = """
<style id="__deck_nav_css">
  body { background: #1F2937 !important; min-height: 100vh; margin: 0; padding: 24px 0 80px; }
  .slide { display: none !important; margin: 0 auto !important; }
  .slide.__active { display: block !important; }
  /* 编辑模式高亮 */
  body.__edit *[contenteditable="true"]:hover { outline: 2px dashed #FB923C; cursor: text; }
  body.__edit *[contenteditable="true"]:focus { outline: 2px solid #D96400; }
  /* nav bar */
  .__deck-nav { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 9999;
    background: rgba(31,41,55,.95); border: 1px solid #4B5563; border-radius: 12px;
    padding: 8px 14px; display: flex; align-items: center; gap: 10px;
    color: #fff; font-family: -apple-system, "Microsoft YaHei", sans-serif; font-size: 13px;
    box-shadow: 0 8px 24px rgba(0,0,0,.4); }
  .__deck-nav button { background: transparent; color: #fff; border: 1px solid #4B5563; border-radius: 6px;
    padding: 4px 10px; cursor: pointer; font-size: 12px; }
  .__deck-nav button:hover { background: #374151; }
  .__deck-nav button:disabled { opacity: .35; cursor: not-allowed; }
  .__deck-nav button.__primary { background: #D96400; border-color: #D96400; }
  .__deck-nav button.__primary:hover { background: #FB923C; border-color: #FB923C; }
  .__deck-nav .__sep { width: 1px; height: 18px; background: #4B5563; }
  .__deck-nav .__page { min-width: 56px; text-align: center; opacity: .8; }
  .__deck-nav .__saved { color: #34D399; opacity: 0; transition: opacity .3s; }
  .__deck-nav .__saved.__show { opacity: 1; }
</style>
<div class="__deck-nav" id="__deck_nav">
  <button id="__deck_prev" title="上一页 ←">←</button>
  <span class="__page" id="__deck_page">1 / 1</span>
  <button id="__deck_next" title="下一页 →">→</button>
  <span class="__sep"></span>
  <button id="__deck_edit" title="编辑文字">编辑</button>
  <button id="__deck_save" class="__primary" hidden title="保存到服务器">保存</button>
  <button id="__deck_full" title="全屏 F">⛶</button>
  <span class="__saved" id="__deck_saved">已保存 ✓</span>
</div>
<script id="__deck_nav_js">
(function(){
  const TOK = __TOKEN__;
  const SAVE_URL = __SAVE_URL__;
  const slides = Array.from(document.querySelectorAll('.slide'));
  if (slides.length === 0) {
    document.getElementById('__deck_nav').style.display = 'none';
    return;
  }
  let idx = 0, editing = false, dirty = false;
  function render() {
    slides.forEach((s, i) => s.classList.toggle('__active', i === idx));
    document.getElementById('__deck_page').textContent = (idx+1) + ' / ' + slides.length;
    document.getElementById('__deck_prev').disabled = idx === 0;
    document.getElementById('__deck_next').disabled = idx === slides.length - 1;
  }
  document.getElementById('__deck_prev').onclick = () => { if (idx>0) { idx--; render(); } };
  document.getElementById('__deck_next').onclick = () => { if (idx<slides.length-1) { idx++; render(); } };
  document.addEventListener('keydown', (e) => {
    if (e.target && (e.target.isContentEditable || /^(INPUT|TEXTAREA)$/.test(e.target.tagName))) return;
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { document.getElementById('__deck_prev').click(); }
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { document.getElementById('__deck_next').click(); e.preventDefault(); }
    if (e.key === 'f' || e.key === 'F') document.getElementById('__deck_full').click();
  });
  document.getElementById('__deck_full').onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  };
  function setEditable(on) {
    document.body.classList.toggle('__edit', on);
    slides.forEach(s => {
      s.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,td,th,span,div').forEach(el => {
        if (el.closest('.__deck-nav, script, style')) return;
        if (el.children.length > 0) return;  // 只让叶子文字节点可编辑，避免破坏布局
        const t = el.textContent || '';
        if (!t.trim()) return;
        el.contentEditable = on ? 'true' : 'false';
        if (on) el.addEventListener('input', () => { dirty = true; }, { once: false });
      });
    });
    document.getElementById('__deck_save').hidden = !on;
    document.getElementById('__deck_edit').textContent = on ? '退出编辑' : '编辑';
  }
  document.getElementById('__deck_edit').onclick = () => {
    editing = !editing;
    setEditable(editing);
  };
  document.getElementById('__deck_save').onclick = async () => {
    // 移除 deck-nav 注入，再上传
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('#__deck_nav_css, #__deck_nav, #__deck_nav_js').forEach(n => n.remove());
    clone.querySelectorAll('[contenteditable]').forEach(n => n.removeAttribute('contenteditable'));
    clone.querySelectorAll('.__active').forEach(n => n.classList.remove('__active'));
    if (!clone.classList) clone.className = '';
    clone.classList.remove('__edit');
    const html = '<!DOCTYPE html>\\n' + clone.outerHTML;
    const btn = document.getElementById('__deck_save');
    const orig = btn.textContent; btn.textContent = '保存中…'; btn.disabled = true;
    try {
      const r = await fetch(SAVE_URL + '?token=' + encodeURIComponent(TOK), {
        method: 'PUT',
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: html,
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      dirty = false;
      const tag = document.getElementById('__deck_saved');
      tag.classList.add('__show');
      setTimeout(() => tag.classList.remove('__show'), 2000);
    } catch (err) {
      alert('保存失败：' + err.message);
    } finally {
      btn.textContent = orig; btn.disabled = false;
    }
  };
  window.addEventListener('beforeunload', (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });
  render();
})();
</script>
"""


def _inject_deck_nav(html: bytes, save_url: str, token: str) -> bytes:
    """把 deck-nav CSS+JS 注入到 HTML </body> 前。"""
    import json as _json
    text = html.decode("utf-8", errors="replace")
    snippet = _DECK_NAV_TEMPLATE.replace("__TOKEN__", _json.dumps(token)).replace(
        "__SAVE_URL__", _json.dumps(save_url)
    )
    if "</body>" in text:
        text = text.replace("</body>", snippet + "\n</body>", 1)
    else:
        text += snippet
    return text.encode("utf-8")


@router.get("/{bundle_id}/view")
async def view_output(
    bundle_id: str,
    request: Request,
    token: str | None = Query(None),
    current_user: User = Depends(get_user_via_query_or_header),
    session: AsyncSession = Depends(get_session),
):
    """Inline view (no Content-Disposition: attachment). 用于 HTML 幻灯片在线播放。
    认证支持 ?token= 或 Authorization header（new tab 场景）。"""
    b = await session.get(CuratedBundle, bundle_id)
    if not b:
        raise HTTPException(404, "Bundle not found")
    if b.project_id and not current_user.is_admin:
        from services.project_acl import assert_project_access
        await assert_project_access(current_user, b.project_id, "read")
    if False:  # legacy guard removed
        raise HTTPException(403, "Access denied")
    if b.status != "done":
        raise HTTPException(400, f"Bundle not ready (status={b.status})")

    # HTML 文件：拉回来注入 deck-nav 后吐
    if b.file_key and b.file_key.endswith(".html"):
        from config import settings
        from minio import Minio
        mc = Minio(settings.minio_endpoint, access_key=settings.minio_user, secret_key=settings.minio_password, secure=False)
        try:
            response = mc.get_object(settings.minio_bucket, b.file_key)
            data = response.read()
        except Exception as e:
            raise HTTPException(500, f"Failed to fetch file: {e}")
        # 注入 deck-nav；token 透传给前端 JS 用于保存请求
        # 优先用 query token，否则从 header 提取（保存功能要求 token 不为空）
        auth = request.headers.get("Authorization", "")
        header_tok = auth.split(" ", 1)[1].strip() if auth.lower().startswith("bearer ") else None
        active_tok = token or header_tok or ""
        save_url = f"/api/outputs/{bundle_id}/html"
        injected = _inject_deck_nav(data, save_url, active_tok)
        return StreamingResponse(
            io.BytesIO(injected),
            media_type="text/html; charset=utf-8",
            headers={"Cache-Control": "private, max-age=0, no-store"},
        )

    # Markdown 内容包成阅读器 HTML
    if b.content_md:
        html = _markdown_reader_html(b.title, b.content_md)
        return StreamingResponse(
            io.BytesIO(html.encode("utf-8")),
            media_type="text/html; charset=utf-8",
            headers={"Cache-Control": "private, max-age=60"},
        )

    raise HTTPException(400, "No previewable content")


# ── 公开分享(免登录只读) ──────────────────────────────────────────────────
_DECK_NAV_READONLY = """
<style id="__deck_nav_css">
  body { background:#1F2937 !important; min-height:100vh; margin:0; padding:24px 0 80px; }
  .slide { display:none !important; margin:0 auto !important; }
  .slide.__active { display:block !important; }
  .__deck-nav { position:fixed; bottom:16px; left:50%; transform:translateX(-50%); z-index:9999;
    background:rgba(31,41,55,.95); border:1px solid #4B5563; border-radius:12px;
    padding:8px 14px; display:flex; align-items:center; gap:10px;
    color:#fff; font-family:-apple-system,"Microsoft YaHei",sans-serif; font-size:13px;
    box-shadow:0 8px 24px rgba(0,0,0,.4); }
  .__deck-nav button { background:transparent; color:#fff; border:1px solid #4B5563; border-radius:6px;
    padding:4px 10px; cursor:pointer; font-size:12px; }
  .__deck-nav button:hover { background:#374151; }
  .__deck-nav button:disabled { opacity:.35; cursor:not-allowed; }
  .__deck-nav .__sep { width:1px; height:18px; background:#4B5563; }
  .__deck-nav .__page { min-width:56px; text-align:center; opacity:.8; }
</style>
<div class="__deck-nav" id="__deck_nav">
  <button id="__deck_prev" title="上一页 ←">←</button>
  <span class="__page" id="__deck_page">1 / 1</span>
  <button id="__deck_next" title="下一页 →">→</button>
  <span class="__sep"></span>
  <button id="__deck_full" title="全屏 F">⛶</button>
</div>
<script id="__deck_nav_js">
(function(){
  var slides = Array.from(document.querySelectorAll('.slide'));
  if (slides.length === 0) { document.getElementById('__deck_nav').style.display='none'; return; }
  var idx = 0;
  function render(){
    slides.forEach(function(s,i){ s.classList.toggle('__active', i===idx); });
    document.getElementById('__deck_page').textContent = (idx+1)+' / '+slides.length;
    document.getElementById('__deck_prev').disabled = idx===0;
    document.getElementById('__deck_next').disabled = idx===slides.length-1;
  }
  document.getElementById('__deck_prev').onclick = function(){ if(idx>0){idx--;render();} };
  document.getElementById('__deck_next').onclick = function(){ if(idx<slides.length-1){idx++;render();} };
  document.getElementById('__deck_full').onclick = function(){
    if(document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen();
  };
  document.addEventListener('keydown', function(e){
    if(e.key==='ArrowLeft'||e.key==='PageUp') document.getElementById('__deck_prev').click();
    if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' '){ document.getElementById('__deck_next').click(); e.preventDefault(); }
    if(e.key==='f'||e.key==='F') document.getElementById('__deck_full').click();
  });
  render();
})();
</script>
"""


def _inject_deck_nav_readonly(html: bytes) -> bytes:
    """只读版 deck-nav(仅翻页 / 全屏,无编辑 / 保存)— 用于公开分享页。"""
    text = html.decode("utf-8", errors="replace")
    if "</body>" in text:
        text = text.replace("</body>", _DECK_NAV_READONLY + "\n</body>", 1)
    else:
        text += _DECK_NAV_READONLY
    return text.encode("utf-8")


class ShareInfo(BaseModel):
    shared: bool
    share_path: str | None = None   # 形如 /api/public/share/{token},前端拼 origin


async def _load_bundle_for_share(bundle_id: str, user: User, session: AsyncSession) -> CuratedBundle:
    b = await session.get(CuratedBundle, bundle_id)
    if not b:
        raise HTTPException(404, "Bundle not found")
    if b.project_id and not user.is_admin:
        await assert_project_access(user, b.project_id, "read")
    return b


@router.post("/{bundle_id}/share", response_model=ShareInfo)
async def create_bundle_share(
    bundle_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """为「客户向」交付物生成 / 重启免登录只读分享链接。"""
    b = await _load_bundle_for_share(bundle_id, current_user, session)
    if b.kind not in PUBLIC_SHAREABLE_KINDS:
        raise HTTPException(403, f"「{KIND_TITLES.get(b.kind, b.kind)}」不支持公开分享")
    if b.status != "done":
        raise HTTPException(400, "交付物尚未生成完成,无法分享")
    share = (await session.execute(
        select(BundleShare).where(BundleShare.bundle_id == bundle_id)
    )).scalar_one_or_none()
    if share:
        share.enabled = True   # 之前关过 → 重新打开(token 不变)
    else:
        share = BundleShare(
            bundle_id=bundle_id,
            share_token=secrets.token_urlsafe(24),
            enabled=True,
            created_by=current_user.id,
        )
        session.add(share)
    await session.commit()
    logger.info("bundle_share_created", bundle_id=bundle_id, kind=b.kind, by=current_user.id)
    return ShareInfo(shared=True, share_path=f"/api/public/share/{share.share_token}")


@router.get("/{bundle_id}/share", response_model=ShareInfo)
async def get_bundle_share(
    bundle_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """查询某交付物当前分享状态(前端打开分享面板时拉)。"""
    await _load_bundle_for_share(bundle_id, current_user, session)
    share = (await session.execute(
        select(BundleShare).where(BundleShare.bundle_id == bundle_id, BundleShare.enabled == True)
    )).scalar_one_or_none()
    if not share:
        return ShareInfo(shared=False)
    return ShareInfo(shared=True, share_path=f"/api/public/share/{share.share_token}")


@router.delete("/{bundle_id}/share", response_model=ShareInfo)
async def revoke_bundle_share(
    bundle_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """关闭分享:已发出的公开链接立即失效(记录保留,可再次开启)。"""
    await _load_bundle_for_share(bundle_id, current_user, session)
    share = (await session.execute(
        select(BundleShare).where(BundleShare.bundle_id == bundle_id)
    )).scalar_one_or_none()
    if share and share.enabled:
        share.enabled = False
        await session.commit()
        logger.info("bundle_share_revoked", bundle_id=bundle_id, by=current_user.id)
    return ShareInfo(shared=False)


class UpdateContentBody(BaseModel):
    content_md: str


@router.put("/{bundle_id}/content")
async def save_content_md(
    bundle_id: str,
    body: UpdateContentBody,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """编辑器内点保存:把 markdown 正文写回 bundle.content_md。

    白名单:`_EDITABLE_MARKDOWN_KINDS`(全部 markdown 类 bundle)。
    kickoff_pptx / kickoff_html 走 PUT /{id}/html(HTML 文件)。

    权限:created_by 或 admin 可改 — 跟 HTML 编辑端点一致。
    不维护 provenance — 用户改了角标后可能与原 provenance 对不上,
    这是主动编辑代价,前端 CitationsPanel 仍按 bundle.provenance 渲染。
    不存历史 — 覆盖式更新;想要旧版可重生成。

    2026-06-09:在线编辑保存也触发修订学习(原先只有 POST /markdown-override 触发),
    跟上传修订版语义一致 — 都把"用户偏好"沉淀到 bundle_revision_memories,下次生成自动应用。
    """
    b = await session.get(CuratedBundle, bundle_id)
    if not b:
        raise HTTPException(404, "Bundle not found")
    if b.project_id and not current_user.is_admin:
        from services.project_acl import assert_project_access
        # 写操作:必须 write 权限,read-only 协作者不能改报告(2026-05-12 修复:此前误写 "read")
        await assert_project_access(current_user, b.project_id, "write")
    if b.kind not in _EDITABLE_MARKDOWN_KINDS:
        raise HTTPException(400, f"产物类型 {b.kind} 不支持 markdown 编辑")
    if b.status != "done":
        raise HTTPException(400, f"产物状态 {b.status} 不支持编辑(需先生成完成)")

    md = (body.content_md or "").strip()
    if not md:
        raise HTTPException(400, "正文不能为空")
    if len(md) > 4 * 1024 * 1024:
        raise HTTPException(400, f"正文体积异常({len(md)} 字节,上限 4MB)")

    # 备份原 markdown,后面 enqueue 修订学习时用
    original_md_for_learning = b.content_md or ""
    original_chars = len(original_md_for_learning)
    new_chars = len(md)

    b.content_md = md
    await session.commit()

    # 在线编辑保存 → 智能建议过期
    if b.project_id:
        try:
            from services.smart_advice import mark_stale
            await mark_stale(b.project_id)
        except Exception as _e:
            logger.warning("smart_advice_mark_stale_failed", project_id=b.project_id, error=str(_e)[:200])

    # 2026-06-03 research_plan 保存后异步抽 plan_sessions
    # (用户编辑日程表行后,下游问卷按场次生成会拿新的 plan_sessions)
    if b.kind == "research_plan":
        try:
            from tasks.output_tasks import extract_plan_sessions as _t
            _t.delay(bundle_id)
        except Exception as _e:
            logger.warning("plan_sessions_dispatch_failed", bundle_id=bundle_id, error=str(_e)[:200])

    # 2026-06-09:在线编辑也触发修订学习(失败不阻断主流程,原版/新版 < 50 字符跳过)
    if original_chars >= 50 and new_chars >= 50 and original_md_for_learning != md:
        try:
            from tasks.output_tasks import analyze_bundle_revision
            analyze_bundle_revision.delay(
                bundle_id=bundle_id,
                bundle_kind=b.kind,
                original_md=original_md_for_learning,
                revised_md=md,
                project_id=b.project_id,
                user_id=str(getattr(current_user, "id", "") or "") or None,
            )
            logger.info("revision_learning_enqueued_from_edit", bundle_id=bundle_id, kind=b.kind)
        except Exception as _e:
            logger.warning("revision_learning_enqueue_failed_from_edit",
                           bundle_id=bundle_id, kind=b.kind, error=str(_e)[:200])

    return {"ok": True, "bytes": len(md.encode("utf-8"))}


# 允许人工修订上传覆盖的 kind 白名单 — 跟在线编辑 PUT /content 用同一套白名单。
# 2026-06-09 之前只放开方案设计三件套 + 调研报告;现在全部 markdown 类 bundle 都允许。
_OVERRIDABLE_KINDS = _EDITABLE_MARKDOWN_KINDS

# 上传体积上限:4 MB(跟 PUT /content 对齐)
_MARKDOWN_OVERRIDE_MAX_BYTES = 4 * 1024 * 1024


class OverrideMarkdownBody(BaseModel):
    """粘贴形态:直接给 markdown 文本。"""
    content_md: str


@router.post("/{bundle_id}/markdown-override")
async def override_bundle_markdown(
    bundle_id: str,
    request: Request,
    # 文件上传形态(.md / .docx)— Optional,因为也支持 JSON body 粘贴
    file: UploadFile | None = File(None),
    source_label: str | None = Form(None),  # 可选:前端标注来源 "upload-md" / "upload-docx" / "paste"
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """用户人工修订完蓝图 / 对象字段表 / 流程建设表 / 调研报告后,
    上传修订版 markdown 覆盖 bundle.content_md。

    覆盖后下游产物(对象字段表 / 流程建设表)再次生成时,
    `_generate_design_artifact` 会从 DB query 最新的上游 bundle,
    自动以修订版作为 [B1] 主输入。

    输入形态(根据 Content-Type 自动分支):
    - **multipart/form-data**:`file` 字段,接 .md / .markdown / .txt(UTF-8)/ .docx
    - **application/json**:`{"content_md": "..."}` 粘贴文本

    .docx 走 `docx_to_markdown`(结构化转换,确定性不走 LLM):标题样式→`#`、段落空行
    分隔、列表→`-`/`1.`、表格→标准 GFM 表。不做图片 / mermaid 还原 —— 要保留这些直接传 .md。

    权限:created_by 或 admin 或 project write 权限。
    白名单 kind:`research_report` / `blueprint_design` / `object_field_layout` / `process_setup`。
    在 `bundle.extra["user_modified"]` 记录修订元数据(时间 / user_id / source / 原长 / 新长),
    历史不归档(覆盖式),想看历史只能重生成或 git/备份。
    """
    b = await session.get(CuratedBundle, bundle_id)
    if not b:
        raise HTTPException(404, "Bundle not found")

    # 权限:跟 PUT /content 一致 — admin 直通,否则 project write
    if b.project_id and not current_user.is_admin:
        from services.project_acl import assert_project_access
        await assert_project_access(current_user, b.project_id, "write")

    # kind 白名单
    if b.kind not in _OVERRIDABLE_KINDS:
        raise HTTPException(
            400,
            f"产物类型 {b.kind} 不支持人工修订上传(仅 {', '.join(sorted(_OVERRIDABLE_KINDS))})"
        )

    # 状态校验 — 必须已经生成完成,才允许"覆盖"语义
    if b.status != "done":
        raise HTTPException(400, f"产物状态 {b.status} 不支持覆盖(需先生成完成 status=done)")

    # ── 取出 markdown ──────────────────────────────────────────────
    md: str
    source: str  # 给 extra.user_modified 用

    content_type = (request.headers.get("content-type") or "").lower()
    if file is not None:
        # multipart 形态
        filename = (file.filename or "").lower()
        raw = await file.read()
        if not raw:
            raise HTTPException(400, "上传文件为空")
        if len(raw) > _MARKDOWN_OVERRIDE_MAX_BYTES:
            raise HTTPException(400, f"上传文件体积异常({len(raw)} 字节,上限 4MB)")

        if filename.endswith((".md", ".markdown", ".txt")):
            try:
                md = raw.decode("utf-8")
            except UnicodeDecodeError as e:
                raise HTTPException(400, f"文件不是 UTF-8 编码:{e}")
            source = source_label or "upload-md"
        elif filename.endswith(".docx"):
            # 结构化 docx → markdown(标题/段落空行/GFM 表),确定性不走 LLM。
            # 不用旧的 extract_text_from_docx(拍平单换行纯文本)—— 那个会被 GFM
            # 把单换行吃成空格、散落的 `|` 当垃圾,排版崩成一坨。
            try:
                from agents.converter_agent import docx_to_markdown
                md = docx_to_markdown(raw)
            except Exception as e:
                logger.warning("override_docx_parse_failed", bundle_id=bundle_id, error=str(e)[:200])
                raise HTTPException(400, f"无法解析 docx 文件:{str(e)[:120]}")
            if not md.strip():
                raise HTTPException(400, "docx 解析后内容为空(可能是扫描件 / 空文档)")
            source = source_label or "upload-docx"
        elif filename.endswith((".doc", ".pptx", ".ppt", ".pdf", ".xlsx", ".xls")):
            raise HTTPException(400, f"暂不支持 {filename.rsplit('.', 1)[-1]} 格式,请转成 .md 或 .docx 后再传")
        else:
            raise HTTPException(400, f"不支持的文件类型(文件名 {filename!r}),仅接 .md / .markdown / .txt / .docx")
    elif "application/json" in content_type:
        # JSON 粘贴形态
        try:
            payload = await request.json()
        except Exception as e:
            raise HTTPException(400, f"请求体不是合法 JSON:{e}")
        try:
            body = OverrideMarkdownBody(**(payload or {}))
        except Exception as e:
            raise HTTPException(400, f"请求体格式错误:{e}")
        md = body.content_md or ""
        source = source_label or "paste"
    else:
        raise HTTPException(
            400,
            "请提供 multipart 文件(file=...)或 JSON body({content_md: ...})"
        )

    # ── 内容校验 ──────────────────────────────────────────────────
    md = md.strip()
    if not md:
        raise HTTPException(400, "修订内容为空")
    if len(md.encode("utf-8")) > _MARKDOWN_OVERRIDE_MAX_BYTES:
        raise HTTPException(400, f"修订内容超过 4MB(实际 {len(md.encode('utf-8'))} 字节)")

    # ── 覆盖 + 记修订元数据 ───────────────────────────────────────
    # 在覆盖前先把原文备份出来,后面 enqueue 修订学习任务要用
    original_md_for_learning = b.content_md or ""
    original_chars = len(original_md_for_learning)
    new_chars = len(md)
    b.content_md = md

    # extra.user_modified — 累加历史(最多保留最近 5 次),前端可读出来展示
    extra = dict(b.extra or {})
    history = list(extra.get("user_modified_history") or [])
    history.append({
        "ts": iso_utc(utcnow_naive()),
        "user_id": str(getattr(current_user, "id", "") or ""),
        "username": getattr(current_user, "username", None) or getattr(current_user, "email", None),
        "source": source,
        "original_chars": original_chars,
        "new_chars": new_chars,
    })
    extra["user_modified_history"] = history[-5:]  # 只留最近 5 次,避免 extra 无限膨胀
    extra["user_modified_latest"] = history[-1]
    b.extra = extra
    # SQLAlchemy 检测 JSON 字段变化要 flag_modified,否则 commit 不会持久化嵌套字段
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(b, "extra")

    await session.commit()

    # 智能建议过期(跟 PUT /content 一致)
    if b.project_id:
        try:
            from services.smart_advice import mark_stale
            await mark_stale(b.project_id)
        except Exception as _e:
            logger.warning("smart_advice_mark_stale_failed_override", project_id=b.project_id, error=str(_e)[:200])

    logger.info(
        "bundle_markdown_override",
        bundle_id=bundle_id,
        kind=b.kind,
        source=source,
        original_chars=original_chars,
        new_chars=new_chars,
        user=str(getattr(current_user, "username", "")),
    )

    # ── 修订学习:异步抽取「用户偏好笔记」沉淀到 bundle_revision_memories(2026-06-08)
    # 失败不影响主流程(覆盖已 commit)。原版字符数 < 50 跳过(几乎没差异不值得 LLM 调用)。
    if original_chars >= 50 and new_chars >= 50:
        try:
            from tasks.output_tasks import analyze_bundle_revision
            analyze_bundle_revision.delay(
                bundle_id=bundle_id,
                bundle_kind=b.kind,
                original_md=original_md_for_learning,
                revised_md=md,
                project_id=b.project_id,
                user_id=str(getattr(current_user, "id", "") or "") or None,
            )
            logger.info("revision_learning_enqueued", bundle_id=bundle_id, kind=b.kind)
        except Exception as _e:
            logger.warning("revision_learning_enqueue_failed",
                           bundle_id=bundle_id, kind=b.kind, error=str(_e)[:200])

    return {
        "ok": True,
        "bundle_id": bundle_id,
        "kind": b.kind,
        "source": source,
        "original_chars": original_chars,
        "new_chars": new_chars,
        "modified_at": history[-1]["ts"],
    }


@router.put("/{bundle_id}/html")
async def save_html_output(
    bundle_id: str,
    request: Request,
    token: str | None = Query(None),
    current_user: User = Depends(get_user_via_query_or_header),
    session: AsyncSession = Depends(get_session),
):
    """编辑器内点保存：把整份 HTML 重写到 MinIO。仅对 .html 类型 bundle 有效。"""
    b = await session.get(CuratedBundle, bundle_id)
    if not b:
        raise HTTPException(404, "Bundle not found")
    if b.project_id and not current_user.is_admin:
        from services.project_acl import assert_project_access
        # 写操作:必须 write 权限(2026-05-12 修复:此前误写 "read")
        await assert_project_access(current_user, b.project_id, "write")
    if not b.file_key or not b.file_key.endswith(".html"):
        raise HTTPException(400, "仅 HTML 类型 bundle 支持就地编辑")

    body = await request.body()
    if not body or len(body) > 4 * 1024 * 1024:
        raise HTTPException(400, "HTML 体积异常（空或 >4MB）")
    text = body.decode("utf-8", errors="replace")
    if "<html" not in text.lower():
        raise HTTPException(400, "提交内容不是有效 HTML")

    from config import settings
    from minio import Minio
    mc = Minio(settings.minio_endpoint, access_key=settings.minio_user, secret_key=settings.minio_password, secure=False)
    try:
        mc.put_object(
            settings.minio_bucket,
            b.file_key,
            io.BytesIO(body),
            length=len(body),
            content_type="text/html; charset=utf-8",
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to save file: {e}")

    # 在线编辑保存 → 智能建议过期
    if b.project_id:
        try:
            from services.smart_advice import mark_stale
            await mark_stale(b.project_id)
        except Exception as _e:
            logger.warning("smart_advice_mark_stale_failed", project_id=b.project_id, error=str(_e)[:200])

    return {"ok": True, "bytes": len(body)}


def _markdown_reader_html(title: str, md: str) -> str:
    """把 markdown 文本包成一个自包含、带样式的 HTML 阅读器，浏览器即开即看。"""
    import html as _h
    import json as _json
    safe_title = _h.escape(title or "输出预览")
    payload = _json.dumps(md)
    return f"""<!DOCTYPE html>
<html lang=\"zh-CN\"><head><meta charset=\"UTF-8\">
<title>{safe_title}</title>
<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">
<script src=\"https://cdn.jsdelivr.net/npm/marked/marked.min.js\"></script>
<style>
body{{font-family:"PingFang SC","Microsoft YaHei",-apple-system,Georgia,"Times New Roman",serif;background:#EAEAEA;color:#1A1A1A;margin:0;line-height:1.7;font-size:15px}}
.wrap{{max-width:780px;margin:0 auto;padding:64px 72px 96px;background:#fff;min-height:100vh;box-shadow:0 1px 3px rgba(0,0,0,.08)}}
h1{{color:#1A1A1A;font-size:26px;font-weight:700;border-bottom:2px solid #1A1A1A;padding-bottom:10px;margin-top:0;letter-spacing:.5px}}
h2{{color:#1A1A1A;font-size:18px;font-weight:700;margin-top:36px;padding-bottom:6px;border-bottom:1px solid #D1D5DB;letter-spacing:.3px}}
h3{{color:#1A1A1A;font-size:15px;font-weight:700;margin-top:22px}}
strong{{color:#1A1A1A;font-weight:700}}
p{{margin:10px 0;color:#1F2937}}
ul,ol{{padding-left:22px;color:#1F2937}}
li{{margin:4px 0}}
table{{border-collapse:collapse;width:100%;margin:14px 0;font-size:13.5px}}
th,td{{border:1px solid #4B5563;padding:8px 10px;text-align:left;vertical-align:top}}
th{{background:#1F2937;color:#fff;font-weight:600}}
tbody tr:nth-child(even){{background:#F9FAFB}}
blockquote{{border-left:3px solid #D96400;background:#FFF7ED;margin:16px 0;padding:10px 16px;color:#1F2937;font-style:italic}}
code{{background:#F3F4F6;padding:2px 6px;border-radius:3px;font-family:Menlo,Consolas,monospace;font-size:12.5px}}
pre{{background:#F9FAFB;padding:14px;border:1px solid #E5E7EB;overflow-x:auto;font-size:12.5px}}
hr{{border:none;border-top:1px solid #D1D5DB;margin:28px 0}}
.toolbar{{position:sticky;top:0;background:rgba(255,255,255,.96);backdrop-filter:blur(8px);border-bottom:1px solid #D1D5DB;padding:10px 20px;display:flex;justify-content:space-between;align-items:center;z-index:10;font-size:12px;color:#4B5563}}
.toolbar .brand{{font-weight:600;color:#1A1A1A}}
.toolbar button{{background:#1A1A1A;color:#fff;border:none;padding:6px 14px;font-size:12px;cursor:pointer;letter-spacing:.5px}}
.toolbar button:hover{{background:#374151}}
@media print{{body{{background:#fff}} .toolbar{{display:none}} .wrap{{box-shadow:none;padding:24px;max-width:none}}}}
</style>
</head>
<body>
<div class=\"toolbar\"><span class=\"brand\">{safe_title}</span><button onclick=\"window.print()\">打印 / 导出 PDF</button></div>
<div class=\"wrap\" id=\"content\">加载中…</div>
<script>
var md = {payload};
document.getElementById('content').innerHTML = (window.marked ? marked.parse(md) : md.replace(/&/g,'&amp;').replace(/</g,'&lt;'));
</script>
</body></html>"""
