"""干系人图谱 (Stakeholder Graph) API。

复用 ProjectBrief 表存储:output_kind = 'stakeholder_graph',
fields 字段直接存 {"nodes": [...], "edges": [...]}。

不走 BRIEF_SCHEMAS 校验,数据形状由前端 canvas 控制。

数据契约:
{
  "nodes": [
    {
      "id": "n1",                       // string,前端生成 uuid 即可
      "type": "department" | "person",  // 部门或干系人
      "name": "销售部",                  // 显示名
      "title": "销售总监",                // 仅 person 用
      "dept": "销售部",                   // 仅 person 用,弱关联
      "x": 120, "y": 80                  // 画布坐标
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "n1",
      "target": "n2",
      "label": "汇报给"   // 可选
    }
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

logger = structlog.get_logger()
router = APIRouter()

OUTPUT_KIND = "stakeholder_graph"


class GraphNode(BaseModel):
    id: str
    type: str               # "department" | "person"
    name: str
    title: str | None = None
    dept: str | None = None
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


@router.get("/{project_id}", dependencies=[Depends(get_current_user)])
async def get_stakeholder_graph(project_id: str):
    """读取项目的干系人图谱,空项目返回空结构。"""
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
            "updated_at": brief.updated_at.isoformat() if brief.updated_at else None,
        }


@router.put("/{project_id}", dependencies=[Depends(get_current_user)])
async def upsert_stakeholder_graph(
    project_id: str,
    payload: GraphPayload,
    user=Depends(get_current_user),
):
    """upsert 整份图谱 — 每次保存覆盖。"""
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

        logger.info("stakeholder_graph_saved", project_id=project_id,
                    node_count=len(payload.nodes), edge_count=len(payload.edges))

        return {
            "nodes": new_fields["nodes"],
            "edges": new_fields["edges"],
            "updated_at": brief.updated_at.isoformat() if brief.updated_at else None,
        }
