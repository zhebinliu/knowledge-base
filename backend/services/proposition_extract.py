"""命题抽取 — 场景命中神经网络的核心引擎。

对项目的每份文档独立跑 LLM 抽取命题(需求/决策/约束/假设),
然后用文本匹配把命题对齐到标准场景 + 跨文档聚类同一主题。

关键约束(用户 2026-07-20 明确):
- LLM 只做单文档事实抽取,不做跨文档判断
- 命题状态由拓扑决定:出现在几份文档 → alive/weak/dead
- 跨文档对齐靠文本匹配,不靠 LLM 推理
"""
from __future__ import annotations

import asyncio
import re
from difflib import SequenceMatcher

import structlog
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from models.document import Document
from models.project import Project
from models.scene import StandardScene, SceneHitReport
from models.proposition import ProjectProposition, PropositionNetwork
from services.model_router import model_router
from services.llm_json import loads_lenient

logger = structlog.get_logger()

_MODEL_TASK = "proposition_extract"
_MAX_CHARS_PER_DOC = 12000
_EXTRACT_CONCURRENCY = 4

_EXTRACT_SYSTEM = """你是 CRM 项目文档分析专家。从给定的单份文档中抽取所有**命题**。

命题 = 一个可以判断真假/是否落地的陈述,粒度为"一个可独立讨论的功能点/决策/约束"。

## 类别
- requirement: 需求(需要某功能/某流程)
- decision: 决策(明确选定方案/排除方案)
- constraint: 约束(时间/预算/技术/范围限制)
- assumption: 假设(前提条件,可能被推翻)

## 输出格式(严格 JSON,不要围栏/解释)
{"propositions": [{"topic": "线索查重与合并", "category": "requirement", "description": "一句话描述", "detail": "该文档中的具体表述"}]}

## 规则
1. 颗粒度适中:不要太粗("需要CRM系统")也不要太细(每个字段一个)
2. 只从本文档抽取事实,不推理文档外的信息
3. topic 用简短的主题短语(≤15字),便于跨文档对齐
4. 每份文档通常产出 3-15 个命题
5. 只输出 JSON"""

_EXTRACT_USER = """【文档: {filename}】
类型: {doc_type}

{content}

请抽取命题,输出 JSON:"""


async def _extract_one_doc(doc: Document) -> list[dict]:
    """单文档命题抽取 — 纯事实提取,不做跨文档判断。"""
    content = (doc.markdown_content or "").strip()
    if not content:
        return []
    content = content[:_MAX_CHARS_PER_DOC]

    user = _EXTRACT_USER.format(
        filename=doc.filename or "未命名",
        doc_type=doc.doc_type or "unknown",
        content=content,
    )

    for attempt in (1, 2):
        try:
            resp, _model = await model_router.chat_with_routing(
                task=_MODEL_TASK,
                messages=[
                    {"role": "system", "content": _EXTRACT_SYSTEM},
                    {"role": "user", "content": user},
                ],
                temperature=0.2,
                max_tokens=4000,
            )
            parsed = loads_lenient(resp or "", None)
            if isinstance(parsed, dict) and isinstance(parsed.get("propositions"), list):
                return parsed["propositions"]
        except Exception as e:
            logger.warning("proposition_extract_fail", doc_id=doc.id, attempt=attempt, error=str(e)[:120])
    return []


def _text_similarity(a: str, b: str) -> float:
    """简单文本相似度(SequenceMatcher),用于跨文档命题对齐。"""
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _normalize_topic(topic: str) -> str:
    """标准化主题:去空格/标点/统一小写。"""
    return re.sub(r'[^\w一-鿿]', '', topic.lower())


def _group_propositions(props: list[dict]) -> dict[str, list[dict]]:
    """跨文档命题聚类 — 用文本相似度,不用 LLM。
    同一 topic_group 的命题视为"同一件事在不同文档中的提及"。"""
    groups: dict[str, list[dict]] = {}
    group_topics: list[str] = []

    for p in props:
        topic = p.get("topic", "")
        norm = _normalize_topic(topic)
        matched_group = None
        best_sim = 0.0

        for gt in group_topics:
            sim = _text_similarity(norm, _normalize_topic(gt))
            if sim > best_sim:
                best_sim = sim
                if sim >= 0.55:
                    matched_group = gt

        if matched_group:
            p["topic_group"] = matched_group
            groups[matched_group].append(p)
        else:
            p["topic_group"] = topic
            groups[topic] = [p]
            group_topics.append(topic)

    return groups


def _align_to_scenes(
    topic: str,
    description: str,
    scenes: list[dict],
) -> list[str]:
    """命题对齐到标准场景 — 用场景名称文本匹配,不用 LLM。
    返回匹配的 scene code 列表。"""
    codes = []
    topic_norm = _normalize_topic(topic)
    desc_norm = _normalize_topic(description)
    combined = topic_norm + desc_norm

    for s in scenes:
        scene_name_norm = _normalize_topic(s["name"])
        sim = max(
            _text_similarity(topic_norm, scene_name_norm),
            _text_similarity(combined, scene_name_norm),
        )
        name_keywords = set(re.findall(r'[一-鿿]{2,}', s["name"]))
        topic_keywords = set(re.findall(r'[一-鿿]{2,}', topic + (description or "")))
        keyword_overlap = len(name_keywords & topic_keywords) / max(len(name_keywords), 1)

        if sim >= 0.5 or keyword_overlap >= 0.4:
            codes.append(s["code"])

    return codes


async def build_proposition_network(
    project_id: str,
    session: AsyncSession,
    created_by: str | None = None,
) -> dict:
    """构建项目命题网络 — 主入口。

    1. 加载项目全部文档
    2. 并发抽取每份文档的命题(LLM)
    3. 跨文档聚类(文本匹配)
    4. 对齐到标准场景(文本匹配)
    5. 计算拓扑信号(alive/weak/dead)
    6. 持久化到 project_propositions + proposition_networks
    """
    project = await session.get(Project, project_id)
    if not project:
        return {"error": "项目不存在"}

    docs = (await session.execute(
        select(Document)
        .where(Document.project_id == project_id, Document.markdown_content.isnot(None))
        .order_by(Document.created_at)
    )).scalars().all()

    if not docs:
        return {"error": "项目无文档"}

    scenes_rows = (await session.execute(
        select(StandardScene)
        .where(StandardScene.status == "active")
        .order_by(StandardScene.domain, StandardScene.code)
    )).scalars().all()
    scene_list = [{"domain": s.domain, "code": s.code, "name": s.name} for s in scenes_rows]

    hit_report = (await session.execute(
        select(SceneHitReport).where(SceneHitReport.project_id == project_id)
    )).scalar_one_or_none()
    hit_codes = set()
    if hit_report and hit_report.hits:
        hit_codes = {h["code"] for h in hit_report.hits}

    sem = asyncio.Semaphore(_EXTRACT_CONCURRENCY)
    doc_results: list[tuple[Document, list[dict]]] = []

    async def _extract(d: Document):
        async with sem:
            props = await _extract_one_doc(d)
            return (d, props)

    logger.info("proposition_extract_start", project_id=project_id, doc_count=len(docs))
    results = await asyncio.gather(*[_extract(d) for d in docs])
    for d, props in results:
        if props:
            doc_results.append((d, props))
    logger.info("proposition_extract_done", project_id=project_id,
                docs_with_props=len(doc_results),
                total_props=sum(len(ps) for _, ps in doc_results))

    all_props = []
    for d, props in doc_results:
        for p in props:
            p["_doc_id"] = d.id
            p["_doc_filename"] = d.filename
            p["_doc_type"] = d.doc_type
            p["_doc_created_at"] = d.created_at.isoformat() if d.created_at else None
            all_props.append(p)

    groups = _group_propositions(all_props)

    for topic_group, members in groups.items():
        scene_codes = _align_to_scenes(
            topic_group,
            members[0].get("description", ""),
            scene_list,
        )
        for m in members:
            m["scene_codes"] = scene_codes

    await session.execute(
        delete(ProjectProposition).where(ProjectProposition.project_id == project_id)
    )

    db_props = []
    for p in all_props:
        row = ProjectProposition(
            project_id=project_id,
            document_id=p["_doc_id"],
            topic=p.get("topic", "")[:300],
            category=p.get("category", "requirement")[:40],
            description=p.get("description"),
            detail=p.get("detail"),
            topic_group=p.get("topic_group", "")[:300] or None,
            scene_codes=p.get("scene_codes", []),
        )
        session.add(row)
        db_props.append(row)

    nodes = []
    edges = []
    doc_nodes = {}
    scene_nodes = {}

    for d in docs:
        doc_nodes[d.id] = {
            "id": f"doc_{d.id[:8]}",
            "type": "document",
            "label": d.filename or "未命名",
            "doc_type": d.doc_type,
            "doc_id": d.id,
            "created_at": d.created_at.isoformat() if d.created_at else None,
        }

    prop_nodes = {}
    for topic_group, members in groups.items():
        doc_ids = list(dict.fromkeys(m["_doc_id"] for m in members))
        scene_codes = members[0].get("scene_codes", [])
        doc_count = len(doc_ids)

        if doc_count >= 3:
            health = "alive"
        elif doc_count == 2:
            health = "alive"
        elif doc_count == 1:
            first_doc = next((d for d in docs if d.id == doc_ids[0]), None)
            if first_doc and docs.index(first_doc) < len(docs) // 2:
                health = "dead"
            else:
                health = "weak"
        else:
            health = "weak"

        node_id = f"prop_{_normalize_topic(topic_group)[:20]}"
        prop_nodes[topic_group] = {
            "id": node_id,
            "type": "proposition",
            "label": topic_group,
            "category": members[0].get("category", "requirement"),
            "health": health,
            "doc_count": doc_count,
            "doc_ids": doc_ids,
            "scene_codes": scene_codes,
            "description": members[0].get("description", ""),
            "members": [
                {
                    "doc_id": m["_doc_id"],
                    "doc_filename": m["_doc_filename"],
                    "detail": m.get("detail", ""),
                }
                for m in members
            ],
        }

        for did in doc_ids:
            edges.append({
                "source": f"doc_{did[:8]}",
                "target": node_id,
                "type": "extraction",
            })

        for code in scene_codes:
            scene_key = code
            if scene_key not in scene_nodes:
                s_info = next((s for s in scene_list if s["code"] == code), None)
                if s_info:
                    scene_nodes[scene_key] = {
                        "id": f"scene_{code}",
                        "type": "scene",
                        "label": f"{code} {s_info['name']}",
                        "code": code,
                        "domain": s_info["domain"],
                        "hit": code in hit_codes,
                    }
            if scene_key in scene_nodes:
                edges.append({
                    "source": node_id,
                    "target": f"scene_{code}",
                    "type": "supports",
                    "health": health,
                })

    nodes = list(doc_nodes.values()) + list(prop_nodes.values()) + list(scene_nodes.values())

    alive_count = sum(1 for p in prop_nodes.values() if p["health"] == "alive")
    weak_count = sum(1 for p in prop_nodes.values() if p["health"] == "weak")
    dead_count = sum(1 for p in prop_nodes.values() if p["health"] == "dead")

    stats = {
        "doc_count": len(docs),
        "proposition_count": len(prop_nodes),
        "topic_groups": len(groups),
        "alive": alive_count,
        "weak": weak_count,
        "dead": dead_count,
        "scene_hits_with_evidence": len(scene_nodes),
    }

    network_data = {"nodes": nodes, "edges": edges}

    existing = (await session.execute(
        select(PropositionNetwork).where(PropositionNetwork.project_id == project_id)
    )).scalar_one_or_none()
    if existing:
        existing.stats = stats
        existing.network_data = network_data
        existing.doc_count = len(docs)
        existing.proposition_count = len(prop_nodes)
        existing.scene_hit_count = len(scene_nodes)
        existing.created_by = created_by
    else:
        session.add(PropositionNetwork(
            project_id=project_id,
            stats=stats,
            network_data=network_data,
            doc_count=len(docs),
            proposition_count=len(prop_nodes),
            scene_hit_count=len(scene_nodes),
            created_by=created_by,
        ))

    await session.commit()
    logger.info("proposition_network_built", project_id=project_id, stats=stats)

    return {
        "stats": stats,
        "network": network_data,
    }
