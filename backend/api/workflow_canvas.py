"""项目画布 (Workflow Canvas) API。

节点式编排视图的画布持久化 —— 把项目的"输入(资料)/输出(交付物)"摆成节点,
用户自由排布、连线。本阶段连线只是可视化依赖图,不驱动后端生成数据路由。

复用 ProjectBrief 表存储:output_kind = 'workflow_canvas',
fields 字段直接存 {"nodes": [...], "edges": [...]}。
与 stakeholder_graph 完全同构:不走 BRIEF_SCHEMAS 校验,数据形状由前端 canvas 控制。

节点实时状态(已生成/生成中/失败)**不入库** —— 前端渲染时从 /outputs/latest-by-kind
合并,这里只存布局(坐标/类型/kind/连线)。

数据契约:
{
  "nodes": [
    {
      "id": "n1",                            // string,前端生成 uuid 即可
      "type": "generation" | "material",     // 生成节点 / 资料节点
      "kind": "insight",                     // generation 用,对应 OutputKind
      "materialKind": "docs",                // material 用:docs/meetings/brief/research
      "label": "项目洞察",                    // 可选,前端一般运行时从 stage-flow 派生
      "x": 320, "y": 80                      // 画布坐标
    }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2", "label": "" }   // label 可选
  ]
}
"""
import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from models import async_session_maker
from models.project import Project
from models.project_brief import ProjectBrief
from services.auth import get_current_user
from services.project_acl import require_project_access
from services._time import iso_utc

logger = structlog.get_logger()
router = APIRouter()

OUTPUT_KIND = "workflow_canvas"


class GraphNode(BaseModel):
    id: str
    type: str                       # "generation" | "material" | "note" | "webpage" | "file"
    kind: str | None = None         # generation:OutputKind
    materialKind: str | None = None  # material:docs/meetings/brief/research
    label: str | None = None
    # 自定义输入节点内容:note→{text}、webpage→{url}、file→{docId,filename}
    data: dict | None = None
    x: float = 0
    y: float = 0


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    label: str | None = None


class GraphPayload(BaseModel):
    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []


@router.get("/{project_id}", dependencies=[Depends(require_project_access("read"))])
async def get_workflow_canvas(project_id: str):
    """读取项目画布,空项目返回空结构(前端据此生成种子图)。"""
    async with async_session_maker() as db:
        proj = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
        if not proj:
            raise HTTPException(status_code=404, detail="项目不存在")

        brief = (await db.execute(
            select(ProjectBrief).where(
                ProjectBrief.project_id == project_id,
                ProjectBrief.output_kind == OUTPUT_KIND,
            )
        )).scalar_one_or_none()

        if not brief:
            return {"nodes": [], "edges": [], "updated_at": None}

        f = brief.fields or {}
        return {
            "nodes": f.get("nodes") or [],
            "edges": f.get("edges") or [],
            "updated_at": iso_utc(brief.updated_at),
        }


@router.put("/{project_id}", dependencies=[Depends(require_project_access("write"))])
async def upsert_workflow_canvas(
    project_id: str,
    payload: GraphPayload,
    user=Depends(get_current_user),
):
    """upsert 整份画布 — 每次保存覆盖。"""
    # 校验:edge.source/target 必须指向存在的 node.id
    node_ids = {n.id for n in payload.nodes}
    for e in payload.edges:
        if e.source not in node_ids or e.target not in node_ids:
            raise HTTPException(
                status_code=400,
                detail=f"边 {e.id} 引用了不存在的节点(source={e.source}, target={e.target})",
            )

    async with async_session_maker() as db:
        proj = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
        if not proj:
            raise HTTPException(status_code=404, detail="项目不存在")

        brief = (await db.execute(
            select(ProjectBrief).where(
                ProjectBrief.project_id == project_id,
                ProjectBrief.output_kind == OUTPUT_KIND,
            )
        )).scalar_one_or_none()

        new_fields = {
            "nodes": [n.model_dump() for n in payload.nodes],
            "edges": [e.model_dump() for e in payload.edges],
        }

        if brief:
            brief.fields = new_fields
            flag_modified(brief, "fields")
            if hasattr(user, "id"):
                brief.updated_by = user.id
        else:
            brief = ProjectBrief(
                project_id=project_id,
                output_kind=OUTPUT_KIND,
                fields=new_fields,
                updated_by=getattr(user, "id", None),
            )
            db.add(brief)

        await db.commit()
        await db.refresh(brief)

        logger.info("workflow_canvas_saved", project_id=project_id,
                    node_count=len(payload.nodes), edge_count=len(payload.edges))

        return {
            "nodes": new_fields["nodes"],
            "edges": new_fields["edges"],
            "updated_at": iso_utc(brief.updated_at),
        }
