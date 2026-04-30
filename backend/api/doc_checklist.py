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
    """评估虚拟产物的"填充状态"(基于该 vkey 在 virtual_artifacts.py 里定义的题目)。

    判定方式:
    - 拉到该 vkey 的 prompts(题目清单),逐个检查 brief.fields 是否有对应非空答案
    - filled_count = 已答数;total_count = 必答题量(required=True)
    - filled = (filled_count >= total_count) — 必答全答完才算 done
    """
    if vkey == "v_guided_questionnaire":
        return {"filled": False, "filled_count": 0, "total_count": 0, "kind": "insight_v2"}

    # 拉对应虚拟物的 prompts 定义(权威清单)
    from api.virtual_artifacts import SUCCESS_METRICS_PROMPTS, _build_risk_prompts
    if vkey == "v_success_metrics":
        prompts = SUCCESS_METRICS_PROMPTS
    elif vkey == "v_risk_alert":
        # 风险预警是按行业动态生成,这里只用项目 industry 拉一次清单
        async with async_session_maker() as s:
            proj = await s.get(Project, project_id)
        prompts = _build_risk_prompts(getattr(proj, "industry", None) if proj else None)
    else:
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

    required_keys = [p["field_key"] for p in prompts if p.get("required")]
    answered = 0
    for k in required_keys:
        cell = fields.get(k)
        v = cell.get("value") if isinstance(cell, dict) else cell
        if v not in (None, "", [], {}):
            answered += 1
    total = len(required_keys)
    return {
        "filled": total > 0 and answered >= total,        # 必答全答完才打勾
        "filled_count": answered,
        "total_count": total,
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
                Document.conversion_status, Document.conversion_error,
                Document.convert_progress, Document.created_at,
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
            "error": (r.conversion_error or "")[:300] if r.conversion_status in ("failed", "retrying") else None,
            "progress": r.convert_progress if r.conversion_status not in ("completed", "failed") else None,
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

    # 6. 附加参考文档(用户手动归到 doc_type='extra_reference' 的文件)
    #    + 项目里"未分类 / 不在清单 7 类"的文档(供前端"关联已有"功能选)
    extra_references = [
        {
            "doc_id": d["doc_id"],
            "filename": d["filename"],
            "status": d["status"],
            "error": d.get("error"),
            "progress": d.get("progress"),
            "uploaded_at": d["uploaded_at"],
        }
        for d in docs_by_type.get("extra_reference", [])
    ]
    # 项目里其他可被"关联进来"的候选文档:
    #   - doc_type 为空(未分类),或
    #   - doc_type 在 5 个"通用"老类 + 7 类预设之外的(本期就是除 extra_reference / 7 类 / 5 老类之外)
    # 简化:列出 doc_type 不在「当前 stage required+recommended+extra_reference」白名单的文档
    stage_white = set(req.get("required_docs", []) + req.get("recommended_docs", []) + ["extra_reference"])
    candidates_to_attach = []
    for r in doc_rows:
        if r.doc_type in stage_white:
            continue
        if r.conversion_status not in ("completed", "processing"):
            continue
        candidates_to_attach.append({
            "doc_id": r.id,
            "filename": r.filename,
            "doc_type": r.doc_type,
            "doc_type_label": DOC_TYPE_LABELS.get(r.doc_type) if r.doc_type else "未分类",
            "status": r.conversion_status,
            "uploaded_at": r.created_at.isoformat() if r.created_at else None,
        })

    # 7. 完成度
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
        "extra_references": extra_references,                # 已挂在洞察的附加参考文档
        "candidates_to_attach": candidates_to_attach,        # 项目里可被"关联"的其他文档
        "completion": completion,
    }
