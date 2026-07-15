"""项目闸门(HITL 人工确认闸门)API。

2026-07-13 · 落地方案 v2 P1。挂在 /api/projects 前缀下:
- GET  /api/projects/{project_id}/gates                    列出所有闸门 + 当前状态
- POST /api/projects/{project_id}/gates/{gate_key}/confirm 一键确认放行
- POST /api/projects/{project_id}/gates/{gate_key}/reopen  撤销确认(改回未确认)

硬闸的下游拦截在 `api/outputs.py::enqueue_generation`,本文件只负责状态读写。
"""
from datetime import datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session
from models.project import Project
from models.project_stage_gate import ProjectStageGate
from services.auth import get_current_user
from services.project_acl import assert_project_access
from models.user import User

logger = structlog.get_logger()
router = APIRouter()


# ── 闸门定义(P1 两道硬闸)──────────────────────────────────────────────────────
# key:闸门标识;label:人看的名字;guards_stage:它守在哪个下游阶段前面;
# desc:确认时给用户的一句话说明;
# evidence_kind/label:这道闸门确认的「依据交付物」——必须先生成(done)才能确认(2026-07-15)。
GATE_DEFS: list[dict] = [
    {
        "key": "asis",
        "label": "调研事实",
        "guards_stage": "design",
        "evidence_kind": "research_report",
        "evidence_label": "调研报告",
        "desc": "确认「调研报告」沉淀的业务现状(As-Is)属实后,方可进入方案设计。",
    },
    {
        "key": "tobe",
        "label": "方案定稿",
        "guards_stage": "implement",
        "evidence_kind": "blueprint_design",
        "evidence_label": "蓝图设计",
        "desc": "确认「蓝图设计」等方案产物(目标业务态 To-Be)已定稿后,方可进入项目实施。",
    },
]
GATE_KEYS = {g["key"] for g in GATE_DEFS}
GATE_LABELS = {g["key"]: g["label"] for g in GATE_DEFS}


class ConfirmBody(BaseModel):
    note: str | None = None


class GateDto(BaseModel):
    key: str
    label: str
    guards_stage: str
    desc: str
    status: str                    # 'open' | 'confirmed'
    confirmed_by: str | None = None
    confirmed_at: datetime | None = None
    note: str | None = None
    # 依据交付物(2026-07-15):确认前必须先生成 done
    evidence_kind: str | None = None
    evidence_label: str | None = None
    evidence_ready: bool = False
    evidence_title: str | None = None


async def _latest_done_evidence(session: AsyncSession, project_id: str, kind: str | None):
    """该项目某类交付物的最新 done bundle(闸门依据)。无 → None。"""
    if not kind:
        return None
    from models.curated_bundle import CuratedBundle
    return (await session.execute(
        select(CuratedBundle)
        .where(CuratedBundle.project_id == project_id,
               CuratedBundle.kind == kind, CuratedBundle.status == "done")
        .order_by(CuratedBundle.updated_at.desc())
    )).scalars().first()


async def _load_map(session: AsyncSession, project_id: str) -> dict[str, ProjectStageGate]:
    rows = (await session.execute(
        select(ProjectStageGate).where(ProjectStageGate.project_id == project_id)
    )).scalars().all()
    return {r.gate_key: r for r in rows}


async def is_gate_confirmed(session: AsyncSession, project_id: str, gate_key: str) -> bool:
    """供 outputs.py 硬闸拦截调用:该项目的某闸门是否已确认。"""
    row = (await session.execute(
        select(ProjectStageGate).where(
            ProjectStageGate.project_id == project_id,
            ProjectStageGate.gate_key == gate_key,
        )
    )).scalar_one_or_none()
    return bool(row and row.status == "confirmed")


@router.get("/{project_id}/gates", response_model=list[GateDto])
async def list_gates(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """列出项目所有闸门及当前状态(缺行视为 open)。"""
    await assert_project_access(current_user, project_id, "read")
    existing = await _load_map(session, project_id)
    out: list[GateDto] = []
    for g in GATE_DEFS:
        row = existing.get(g["key"])
        ev = await _latest_done_evidence(session, project_id, g.get("evidence_kind"))
        out.append(GateDto(
            key=g["key"], label=g["label"], guards_stage=g["guards_stage"], desc=g["desc"],
            status=row.status if row else "open",
            confirmed_by=row.confirmed_by if row else None,
            confirmed_at=row.confirmed_at if row else None,
            note=row.note if row else None,
            evidence_kind=g.get("evidence_kind"), evidence_label=g.get("evidence_label"),
            evidence_ready=ev is not None, evidence_title=getattr(ev, "title", None),
        ))
    return out


@router.post("/{project_id}/gates/{gate_key}/confirm", response_model=GateDto)
async def confirm_gate(
    project_id: str,
    gate_key: str,
    body: ConfirmBody | None = None,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """一键确认放行某闸门。"""
    if gate_key not in GATE_KEYS:
        raise HTTPException(400, f"未知闸门:{gate_key}(允许:{', '.join(sorted(GATE_KEYS))})")
    await assert_project_access(current_user, project_id, "write")
    if not await session.get(Project, project_id):
        raise HTTPException(404, "Project not found")

    # 依据交付物必须已生成(done)才能确认 —— 闸门确认得有据(2026-07-15)
    gdef = next(d for d in GATE_DEFS if d["key"] == gate_key)
    if gdef.get("evidence_kind"):
        ev = await _latest_done_evidence(session, project_id, gdef["evidence_kind"])
        if ev is None:
            raise HTTPException(
                409, f"「{gdef['evidence_label']}」尚未生成,不能确认「{gdef['label']}」——请先生成{gdef['evidence_label']}。")

    row = (await session.execute(
        select(ProjectStageGate).where(
            ProjectStageGate.project_id == project_id,
            ProjectStageGate.gate_key == gate_key,
        )
    )).scalar_one_or_none()
    now = datetime.utcnow()
    note = (body.note if body else None) or None
    if row:
        row.status = "confirmed"
        row.confirmed_by = current_user.username
        row.confirmed_at = now
        row.note = note
    else:
        row = ProjectStageGate(
            project_id=project_id, gate_key=gate_key, status="confirmed",
            confirmed_by=current_user.username, confirmed_at=now, note=note,
        )
        session.add(row)
    await session.commit()
    await session.refresh(row)
    logger.info("gate_confirmed", project_id=project_id, gate_key=gate_key, by=current_user.username)
    g = GATE_LABELS.get(gate_key, gate_key)
    meta = next(d for d in GATE_DEFS if d["key"] == gate_key)
    return GateDto(
        key=gate_key, label=g, guards_stage=meta["guards_stage"], desc=meta["desc"],
        status=row.status, confirmed_by=row.confirmed_by, confirmed_at=row.confirmed_at, note=row.note,
    )


@router.post("/{project_id}/gates/{gate_key}/reopen", response_model=GateDto)
async def reopen_gate(
    project_id: str,
    gate_key: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """撤销确认,把闸门改回未确认(范围变更时用)。"""
    if gate_key not in GATE_KEYS:
        raise HTTPException(400, f"未知闸门:{gate_key}")
    await assert_project_access(current_user, project_id, "write")
    row = (await session.execute(
        select(ProjectStageGate).where(
            ProjectStageGate.project_id == project_id,
            ProjectStageGate.gate_key == gate_key,
        )
    )).scalar_one_or_none()
    if row:
        row.status = "open"
        row.confirmed_by = None
        row.confirmed_at = None
        await session.commit()
        await session.refresh(row)
    logger.info("gate_reopened", project_id=project_id, gate_key=gate_key, by=current_user.username)
    meta = next(d for d in GATE_DEFS if d["key"] == gate_key)
    return GateDto(
        key=gate_key, label=meta["label"], guards_stage=meta["guards_stage"], desc=meta["desc"],
        status="open", confirmed_by=None, confirmed_at=None,
        note=row.note if row else None,
    )
