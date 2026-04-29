"""文档清单(DocChecklist)API。

给前台「项目详情页 → 文档清单工作区」用,一个请求拿到:
- 当前 stage 需要哪些文档(必需 / 推荐)
- 项目已上传的文档(按 doc_type 分组)
- 虚拟产物(成功指标 / 风险预警)的填充状态
- 完成度统计

读取硬编码 STAGE_DOC_REQUIREMENTS(暂不做后台动态配置)。
"""

import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from models import async_session_maker
from models.project import (
    Project,
    DOC_TYPE_LABELS,
    VIRTUAL_ARTIFACT_LABELS,
    VIRTUAL_ARTIFACT_DESCRIPTIONS,
    STAGE_DOC_REQUIREMENTS,
)
from models.document import Document
from models.project_brief import ProjectBrief
from services.auth import get_current_user

logger = structlog.get_logger()
router = APIRouter()


def _empty_completion() -> dict:
    return {
        "required": 0, "required_total": 0,
        "recommended": 0, "recommended_total": 0,
        "virtual_required": 0, "virtual_required_total": 0,
        "virtual_recommended": 0, "virtual_recommended_total": 0,
        "all_required_done": False,    # 必需文档 + 必需虚拟物 是否全齐
    }


async def _virtual_status(project_id: str, vkey: str) -> dict:
    """评估虚拟产物的"填充状态"。

    暂时简化判定:
    - v_success_metrics:看 brief.fields 里是否有非空的 success_metrics 字段
    - v_risk_alert:看 brief.fields 里是否有非空的 risks_acknowledged 字段
    - v_guided_questionnaire:占位,默认 not_filled
    """
    if vkey == "v_guided_questionnaire":
        return {"filled": False, "filled_count": 0, "total_count": 0, "kind": "insight_v2"}

    # 读 insight_v2 的 brief 看相关字段
    async with async_session_maker() as s:
        row = (await s.execute(
            select(ProjectBrief).where(
                ProjectBrief.project_id == project_id,
                ProjectBrief.output_kind == "insight_v2",
            )
        )).scalar_one_or_none()
    fields = (row.fields if row else {}) or {}

    # 字段映射
    KEY_MAP = {
        "v_success_metrics": ["success_metrics", "smart_goals"],
        "v_risk_alert":      ["risks_acknowledged", "risks"],
    }
    relevant_keys = KEY_MAP.get(vkey, [])
    filled = 0
    for k in relevant_keys:
        cell = fields.get(k)
        if isinstance(cell, dict):
            v = cell.get("value")
        else:
            v = cell
        if v not in (None, "", []):
            filled += 1
    return {
        "filled": filled > 0,
        "filled_count": filled,
        "total_count": len(relevant_keys),
        "kind": "insight_v2",
    }


@router.get("/{project_id}", dependencies=[Depends(get_current_user)])
async def get_doc_checklist(project_id: str, stage: str = "insight_v2"):
    """返回该项目在指定 stage 下的文档清单 + 已上传状态 + 虚拟物状态。

    Query 参数:
        stage: 阶段 key(默认 insight_v2)
    """
    # 1. 校验项目存在
    async with async_session_maker() as s:
        proj = await s.get(Project, project_id)
    if not proj:
        raise HTTPException(404, "项目不存在")

    # 2. 拿 stage 需求
    req = STAGE_DOC_REQUIREMENTS.get(stage)
    if not req:
        # 该 stage 没配清单,返回空结构
        return {
            "stage": stage,
            "stage_has_checklist": False,
            "required_docs": [],
            "recommended_docs": [],
            "virtual_required": [],
            "virtual_recommended": [],
            "completion": _empty_completion(),
        }

    # 3. 拉项目下所有已 completed 文档
    async with async_session_maker() as s:
        doc_rows = (await s.execute(
            select(
                Document.id, Document.filename, Document.doc_type,
                Document.conversion_status, Document.created_at,
            )
            .where(Document.project_id == project_id)
        )).all()

    # 4. 按 doc_type 分组
    docs_by_type: dict[str, list[dict]] = {}
    for r in doc_rows:
        if not r.doc_type:
            continue
        docs_by_type.setdefault(r.doc_type, []).append({
            "doc_id": r.id,
            "filename": r.filename,
            "status": r.conversion_status,
            "uploaded_at": r.created_at.isoformat() if r.created_at else None,
        })

    def _render_doc_slot(doc_type: str, necessity: str) -> dict:
        uploaded = docs_by_type.get(doc_type, [])
        return {
            "doc_type": doc_type,
            "label": DOC_TYPE_LABELS.get(doc_type, doc_type),
            "necessity": necessity,                 # required | recommended
            "uploaded": len(uploaded) > 0,
            "uploaded_count": len(uploaded),
            "documents": uploaded,                  # 可能多份
            "kind": "doc",
        }

    required_docs    = [_render_doc_slot(dt, "required")    for dt in req.get("required_docs",    [])]
    recommended_docs = [_render_doc_slot(dt, "recommended") for dt in req.get("recommended_docs", [])]

    # 5. 虚拟物状态
    async def _render_virtual_slot(vkey: str, necessity: str) -> dict:
        st = await _virtual_status(project_id, vkey)
        return {
            "key": vkey,
            "label": VIRTUAL_ARTIFACT_LABELS.get(vkey, vkey),
            "description": VIRTUAL_ARTIFACT_DESCRIPTIONS.get(vkey, ""),
            "necessity": necessity,
            "filled": st["filled"],
            "filled_count": st["filled_count"],
            "total_count": st["total_count"],
            "kind": "virtual",
        }

    virtual_required    = [await _render_virtual_slot(k, "required")    for k in req.get("virtual_required",    [])]
    virtual_recommended = [await _render_virtual_slot(k, "recommended") for k in req.get("virtual_recommended", [])]

    # 6. 完成度
    req_done   = sum(1 for d in required_docs    if d["uploaded"])
    rec_done   = sum(1 for d in recommended_docs if d["uploaded"])
    vreq_done  = sum(1 for v in virtual_required    if v["filled"])
    vrec_done  = sum(1 for v in virtual_recommended if v["filled"])

    completion = {
        "required":              req_done,
        "required_total":        len(required_docs),
        "recommended":           rec_done,
        "recommended_total":     len(recommended_docs),
        "virtual_required":      vreq_done,
        "virtual_required_total":len(virtual_required),
        "virtual_recommended":   vrec_done,
        "virtual_recommended_total": len(virtual_recommended),
        "all_required_done": (req_done == len(required_docs)) and (vreq_done == len(virtual_required)),
    }

    return {
        "stage": stage,
        "stage_has_checklist": True,
        "required_docs": required_docs,
        "recommended_docs": recommended_docs,
        "virtual_required": virtual_required,
        "virtual_recommended": virtual_recommended,
        "completion": completion,
    }
