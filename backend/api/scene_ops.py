"""场景命中(P3)+ 蓝图回流闭环(P4)API。挂 /api。

P3 场景命中:
- POST /api/projects/{project_id}/scene-match   跑 LLM 命中,存最新报告,返回
- GET  /api/projects/{project_id}/scene-match   最新命中报告(无则 null)

P4 蓝图回流:
- POST /api/projects/{project_id}/scene-reflow      跑 LLM 识别优化/新增 → 建提案(pm_pending)
- GET  /api/projects/{project_id}/scene-proposals   项目下提案列表
- POST /api/scene-proposals/{id}/pm-confirm          PM 确认(pm_pending→admin_pending)
- POST /api/scene-proposals/{id}/approve             管理员通过 → 回写 standard_scenes + 留痕
- POST /api/scene-proposals/{id}/reject              管理员驳回
- GET  /api/scene-proposals?status=admin_pending     管理员审核队列(后台「场景库更新」页签)
"""
from datetime import datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session
from models.project import Project
from models.scene import StandardScene, SceneChange, SceneHitReport, SceneChangeProposal
from services.auth import get_current_user, require_admin
from services.project_acl import assert_project_access
from models.user import User

logger = structlog.get_logger()
router = APIRouter()


# ── P3 场景命中 ──────────────────────────────────────────────────────────────

class HitReportDto(BaseModel):
    project_id: str
    hit_count: int
    miss_count: int
    hits: list
    misses: list
    sources: list = []          # 命中依据的文档 [{kind,type,name}]
    summary: str | None = None
    report_md: str | None = None
    updated_at: datetime | None = None


def _hit_dto(r: SceneHitReport) -> HitReportDto:
    return HitReportDto(
        project_id=r.project_id, hit_count=r.hit_count, miss_count=r.miss_count,
        hits=r.hits or [], misses=r.misses or [], sources=r.sources or [],
        summary=r.summary, report_md=r.report_md, updated_at=r.updated_at,
    )


@router.post("/projects/{project_id}/scene-match", response_model=HitReportDto)
async def run_scene_match(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """对照标准场景库跑一次命中(LLM,同步),存最新报告并返回。"""
    await assert_project_access(current_user, project_id, "write")
    from services.scene_match import match_project_scenes
    result = await match_project_scenes(project_id, session)

    row = (await session.execute(
        select(SceneHitReport).where(SceneHitReport.project_id == project_id)
    )).scalar_one_or_none()
    if row is None:
        row = SceneHitReport(project_id=project_id)
        session.add(row)
    row.hit_count = result.get("hit_count", 0)
    row.miss_count = result.get("miss_count", 0)
    row.hits = result.get("hit", [])
    row.misses = result.get("miss", [])
    row.sources = result.get("sources", [])   # 命中依据文档
    row.summary = result.get("summary")
    row.report_md = result.get("report_md")
    row.created_by = current_user.username
    await session.commit()
    await session.refresh(row)
    logger.info("scene_match_done", project_id=project_id,
                hit=row.hit_count, miss=row.miss_count, by=current_user.username)
    return _hit_dto(row)


@router.get("/projects/{project_id}/scene-match", response_model=HitReportDto | None)
async def get_scene_match(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await assert_project_access(current_user, project_id, "read")
    row = (await session.execute(
        select(SceneHitReport).where(SceneHitReport.project_id == project_id)
    )).scalar_one_or_none()
    return _hit_dto(row) if row else None


@router.get("/bundles/{bundle_id}/scene-coverage")
async def bundle_coverage(
    bundle_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """交付物场景覆盖校验(闭环②):该产物正文覆盖了项目多少应覆盖场景,漏了哪些。"""
    from models.curated_bundle import CuratedBundle
    from services.scene_coverage import bundle_scene_coverage
    b = await session.get(CuratedBundle, bundle_id)
    if not b:
        raise HTTPException(404, "产物不存在")
    await assert_project_access(current_user, b.project_id, "read")
    return await bundle_scene_coverage(b, session)


@router.get("/projects/{project_id}/research-agenda")
async def research_agenda(
    project_id: str,
    domain: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """调研议程:应覆盖场景(按域/阶段)+ 每场景关键问题 + 覆盖状态。

    应覆盖 = 命中报告里活跃域的全部场景;传 domain 则只看该域;
    未跑命中时活跃域为空 → 需传 domain 或前端引导先跑命中。
    """
    await assert_project_access(current_user, project_id, "read")
    from services.scene_agenda import build_project_agenda
    return await build_project_agenda(project_id, session, domain=domain)


# ── P4 蓝图回流 ──────────────────────────────────────────────────────────────

class ProposalDto(BaseModel):
    id: int
    project_id: str
    project_name: str | None = None
    change_type: str
    domain: str | None = None
    scene_code: str | None = None
    name: str
    summary: str | None = None
    content: dict = {}
    status: str
    created_by: str | None = None
    pm_confirmed_by: str | None = None
    reviewed_by: str | None = None
    review_note: str | None = None
    created_at: datetime
    updated_at: datetime


def _prop_dto(p: SceneChangeProposal) -> ProposalDto:
    return ProposalDto(
        id=p.id, project_id=p.project_id, project_name=p.project_name,
        change_type=p.change_type, domain=p.domain, scene_code=p.scene_code,
        name=p.name, summary=p.summary, content=p.content or {}, status=p.status, created_by=p.created_by,
        pm_confirmed_by=p.pm_confirmed_by, reviewed_by=p.reviewed_by,
        review_note=p.review_note, created_at=p.created_at, updated_at=p.updated_at,
    )


class ReflowStartDto(BaseModel):
    task_id: str
    status: str = "started"


class ReflowStatusDto(BaseModel):
    state: str                       # PENDING / STARTED / SUCCESS / FAILURE
    ready: bool
    count: int | None = None
    error: str | None = None


@router.post("/projects/{project_id}/scene-reflow", response_model=ReflowStartDto)
async def run_scene_reflow(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """蓝图完成:后台异步跑 LLM 识别 → 建提案(pm_pending)。立即返回 task_id,前端轮询状态。
    识别读全文蓝图 + 产十几条富内容,一次 ~2 分钟,同步会把请求干等超时,故转异步。"""
    await assert_project_access(current_user, project_id, "write")
    proj = await session.get(Project, project_id)
    if not proj:
        raise HTTPException(404, "项目不存在")

    from tasks.output_tasks import run_scene_reflow_task
    task = run_scene_reflow_task.delay(project_id, current_user.username)
    logger.info("scene_reflow_dispatched", project_id=project_id, task_id=task.id, by=current_user.username)
    return ReflowStartDto(task_id=task.id)


@router.get("/scene-reflow/status/{task_id}", response_model=ReflowStatusDto)
async def scene_reflow_status(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """轮询回流任务状态。ready=True 时前端重新拉 scene-proposals 刷新列表。"""
    from tasks.convert_task import celery_app
    res = celery_app.AsyncResult(task_id)
    dto = ReflowStatusDto(state=res.state, ready=res.ready())
    if res.successful():
        r = res.result or {}
        dto.count = r.get("count") if isinstance(r, dict) else None
    elif res.failed():
        dto.error = str(res.result)[:200]
    return dto


@router.get("/projects/{project_id}/scene-proposals", response_model=list[ProposalDto])
async def list_project_proposals(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await assert_project_access(current_user, project_id, "read")
    rows = (await session.execute(
        select(SceneChangeProposal).where(SceneChangeProposal.project_id == project_id)
        .order_by(SceneChangeProposal.created_at.desc())
    )).scalars().all()
    return [_prop_dto(p) for p in rows]


@router.post("/scene-proposals/{proposal_id}/pm-confirm", response_model=ProposalDto)
async def pm_confirm_proposal(
    proposal_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """PM 确认(pm_pending → admin_pending)。需项目写权限(owner/读写/admin)。"""
    p = await session.get(SceneChangeProposal, proposal_id)
    if not p:
        raise HTTPException(404, "提案不存在")
    await assert_project_access(current_user, p.project_id, "write")
    if p.status != "pm_pending":
        raise HTTPException(409, f"提案当前状态为 {p.status},不可 PM 确认")
    p.status = "admin_pending"
    p.pm_confirmed_by = current_user.username
    p.pm_confirmed_at = datetime.utcnow()
    await session.commit()
    await session.refresh(p)
    logger.info("proposal_pm_confirmed", id=proposal_id, by=current_user.username)
    return _prop_dto(p)


class ReviewBody(BaseModel):
    note: str | None = None
    code: str | None = None          # 管理员指定场景编码(新增场景时)
    stage: str | None = None         # 管理员指定阶段
    stage_label: str | None = None   # 阶段显示名
    tags: list[str] | None = None    # 行业标签


@router.get("/scene-proposals", response_model=list[ProposalDto], dependencies=[Depends(require_admin)])
async def admin_list_proposals(
    status: str = Query("admin_pending"),
    session: AsyncSession = Depends(get_session),
):
    """管理员审核队列(后台「场景库更新」页签)。默认列待审核。"""
    rows = (await session.execute(
        select(SceneChangeProposal).where(SceneChangeProposal.status == status)
        .order_by(SceneChangeProposal.pm_confirmed_at.desc().nullslast(),
                  SceneChangeProposal.created_at.desc())
    )).scalars().all()
    return [_prop_dto(p) for p in rows]


@router.post("/scene-proposals/{proposal_id}/approve", response_model=ProposalDto,
             dependencies=[Depends(require_admin)])
async def approve_proposal(
    proposal_id: int,
    body: ReviewBody | None = None,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """管理员通过 → 回写标准场景库 + 写变更留痕。"""
    p = await session.get(SceneChangeProposal, proposal_id)
    if not p:
        raise HTTPException(404, "提案不存在")
    if p.status != "admin_pending":
        raise HTTPException(409, f"提案当前状态为 {p.status},不可审核")

    scene_id: int | None = None
    content = p.content or {}   # Block6 结构化内容:{description,business_rules,process,recommended_fields}
    admin_tags = (body.tags if body else None) or []
    if p.change_type == "optimize" and p.scene_code:
        scene = (await session.execute(
            select(StandardScene).where(
                StandardScene.code == p.scene_code,
                (StandardScene.domain == p.domain) if p.domain else (StandardScene.code == p.scene_code),
            )
        )).scalars().first()
        if scene:
            note = (p.summary or "").strip()
            scene.summary = ((scene.summary or "") + f"\n\n【{p.project_name or '项目'}优化】{note}").strip()
            # 优化:补空不覆盖(已有内容不动,空字段用回流内容填上)
            for f in ("description", "business_rules", "process"):
                if not (getattr(scene, f) or "").strip() and (content.get(f) or "").strip():
                    setattr(scene, f, content[f])
            if not (scene.recommended_fields or []) and content.get("recommended_fields"):
                scene.recommended_fields = content["recommended_fields"]
            if admin_tags:
                from sqlalchemy.orm.attributes import flag_modified
                merged = list(dict.fromkeys((scene.tags or []) + admin_tags))
                scene.tags = merged
                flag_modified(scene, "tags")
            scene.version = (scene.version or 1) + 1
            scene.source_project_name = p.project_name
            scene_id = scene.id
    else:
        # 新增场景:管理员可指定编码;否则自动生成(域-Pxx)
        admin_code = (body.code.strip() if body and body.code else "").strip()
        code = admin_code or p.scene_code or f"{(p.domain or 'GEN')}-P{p.id}"
        domain = p.domain or "GEN"
        exists = (await session.execute(
            select(StandardScene).where(StandardScene.domain == domain, StandardScene.code == code)
        )).scalars().first()
        if exists and admin_code:
            raise HTTPException(409, f"场景编码 {domain}/{code} 已存在")
        if exists:
            code = f"{domain}-P{p.id}"
        admin_stage = (body.stage.strip() if body and body.stage else "").strip()
        admin_stage_label = (body.stage_label.strip() if body and body.stage_label else "").strip()
        scene = StandardScene(
            domain=domain, stage=admin_stage, stage_label=admin_stage_label or None,
            code=code, name=p.name,
            summary=p.summary, source_type="project", source_project_name=p.project_name,
            status="active",
            description=content.get("description") or None,
            business_rules=content.get("business_rules") or None,
            process=content.get("process") or None,
            recommended_fields=content.get("recommended_fields") or [],
            tags=admin_tags,
        )
        session.add(scene)
        await session.flush()
        scene_id = scene.id

    session.add(SceneChange(
        scene_id=scene_id, scene_code=p.scene_code or (scene.code if scene_id else ""),
        domain=p.domain, change_type=p.change_type,
        project_id=p.project_id, project_name=p.project_name,
        summary=p.summary, created_by=current_user.username,
    ))
    p.status = "approved"
    p.reviewed_by = current_user.username
    p.reviewed_at = datetime.utcnow()
    p.review_note = body.note if body else None
    await session.commit()
    await session.refresh(p)
    logger.info("proposal_approved", id=proposal_id, change_type=p.change_type,
                scene_id=scene_id, by=current_user.username)
    return _prop_dto(p)


@router.post("/scene-proposals/{proposal_id}/reject", response_model=ProposalDto,
             dependencies=[Depends(require_admin)])
async def reject_proposal(
    proposal_id: int,
    body: ReviewBody | None = None,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    p = await session.get(SceneChangeProposal, proposal_id)
    if not p:
        raise HTTPException(404, "提案不存在")
    if p.status not in ("admin_pending", "pm_pending"):
        raise HTTPException(409, f"提案当前状态为 {p.status},不可驳回")
    p.status = "rejected"
    p.reviewed_by = current_user.username
    p.reviewed_at = datetime.utcnow()
    p.review_note = body.note if body else None
    await session.commit()
    await session.refresh(p)
    logger.info("proposal_rejected", id=proposal_id, by=current_user.username)
    return _prop_dto(p)
