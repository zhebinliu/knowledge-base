"""Planner — agentic 流程的第一步,产出 ExecutionPlan。

输入: project + brief + transcript + 行业包
输出:
- 各模块的 evidence 评估(哪些字段有 / 哪些缺 / 来自哪)
- gap_actions: 缺信息时的获取动作(kb_search / ask_user / downgrade)
- sufficient_critical: 关键模块是否都能至少触发执行

设计:
- 规则化优先(检查 brief/metadata/industry_pack 是否有值)
- LLM 兜底:对 source 包含 "conversation" 的字段,让 LLM 从 transcript 中提取或判断"有/无"
- 输出是结构化数据,Executor / Critic 直接用
"""
import json
import structlog
from dataclasses import dataclass, field, asdict
from typing import Literal, Any

from .insight_modules import (
    INSIGHT_MODULES, ModuleSpec, FieldSpec,
    list_modules_for_industry,
)
from .survey_modules import (
    L1_EXEC_SUBSECTION, SURVEY_THEMES, SubsectionSpec,
    list_subsections_for_layer,
)
from .industry_packs import get_pack

logger = structlog.get_logger()


# ── 数据结构 ────────────────────────────────────────────────────────────────────

FieldStatus = Literal["available", "deferred", "missing"]
ModuleStatus = Literal["planned", "ready", "skipped", "blocked"]


@dataclass
class FieldState:
    key: str
    label: str
    status: FieldStatus            # available=已找到值;deferred=executor 需从 transcript 提取;missing=确实缺
    source: str | None = None      # "brief" / "metadata" / "industry_pack" / "conversation" / etc
    value: Any = None              # 已知值(rule-based 填的)或 None
    note: str = ""                 # 简要说明(如"来自 Brief.budget_range")

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ModuleAssessment:
    key: str
    title: str
    necessity: str                 # critical | optional
    status: ModuleStatus           # ready=可执行;blocked=关键 required 字段缺失;skipped=行业不匹配
    fields: dict[str, FieldState]  # field_key → FieldState
    reason: str = ""               # status 解释

    def to_dict(self) -> dict:
        return {
            "key": self.key,
            "title": self.title,
            "necessity": self.necessity,
            "status": self.status,
            "fields": {k: v.to_dict() for k, v in self.fields.items()},
            "reason": self.reason,
        }


@dataclass
class GapAction:
    module_key: str
    field_key: str
    action: Literal["kb_search", "web_search", "ask_user", "downgrade"]
    detail: str                    # query / question / 说明
    # 给前端 V2GapFiller 用的元数据(action='ask_user' 时使用)
    field_label: str = ""          # 字段中文标签
    field_type: str = "text"       # text / list / number / date(决定怎么序列化提交)
    options: list = field(default_factory=list)  # 选项 chip 列表;空表示纯开放题
    multi: bool = False            # 单选 vs 多选(配合 type=list 用)
    required: bool = False         # 是否 critical 必填(前端高亮)
    module_title: str = ""         # 模块中文标题(前端分组显示)
    necessity: str = ""            # critical | optional

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ExecutionPlan:
    industry: str | None
    modules: list[ModuleAssessment]
    gap_actions: list[GapAction]
    sufficient_critical: bool      # 关键模块是否都 ready

    def to_dict(self) -> dict:
        return {
            "industry": self.industry,
            "modules": [m.to_dict() for m in self.modules],
            "gap_actions": [g.to_dict() for g in self.gap_actions],
            "sufficient_critical": self.sufficient_critical,
        }


# ── 规则化字段检查 ─────────────────────────────────────────────────────────────

def _brief_value(brief_fields: dict, key: str) -> Any:
    """从 brief.fields 取 value(兼容裸值或 {value, ...} 结构)。"""
    if not brief_fields:
        return None
    cell = brief_fields.get(key)
    if cell is None:
        return None
    if isinstance(cell, dict):
        v = cell.get("value")
    else:
        v = cell
    if v is None:
        return None
    if isinstance(v, str) and not v.strip():
        return None
    if isinstance(v, list) and not v:
        return None
    return v


def _metadata_value(project, key: str) -> Any:
    """从 Project 模型字段取值(name / customer / industry / modules / kickoff_date / description)。"""
    if project is None:
        return None
    # 字段映射: insight_modules 字段 → Project 字段
    PROJECT_KEYS = {
        "module_list": ("modules", lambda v: v if v else None),
        "industry_label": ("industry", lambda v: v),
        "customer_name": ("customer", lambda v: v),
        "kickoff_date_field": ("kickoff_date", lambda v: v.isoformat() if v else None),
        "project_description": ("description", lambda v: v),
        "customer_profile": ("customer_profile", lambda v: v),
        # M2.timeline 也可能从 kickoff_date 推
        "timeline": ("kickoff_date", lambda v: f"启动 {v.isoformat()}" if v else None),
    }
    if key in PROJECT_KEYS:
        attr, transform = PROJECT_KEYS[key]
        raw = getattr(project, attr, None)
        return transform(raw)
    return None


def _industry_pack_value(industry: str | None, key: str) -> Any:
    """从行业包的 field_patches 取值(只返回 label/ask 提示,不是真实数据值)。

    注意:industry_pack 提供的是"模板/提示",不是项目特有数据。所以即便命中,
    也只能算"deferred"(executor 还需要 conversation 验证),不能算 "available"。
    """
    pack = get_pack(industry)
    if not pack:
        return None
    return pack.field_patches.get(key)


def _resolve_field(
    field_spec: FieldSpec,
    *,
    brief_fields: dict,
    project,
    industry: str | None,
    has_conversation: bool,
    docs_by_type: dict | None = None,            # v3.2: 上传文档兜底
) -> FieldState:
    """按 source_priority 顺序,确定该字段的 status / source / value。"""
    for src in field_spec.source_priority:
        if src == "brief":
            v = _brief_value(brief_fields, field_spec.key)
            if v is not None:
                return FieldState(
                    key=field_spec.key, label=field_spec.label,
                    status="available", source="brief", value=v,
                    note=f"来自 Brief.{field_spec.key}",
                )
        elif src == "metadata":
            v = _metadata_value(project, field_spec.key)
            if v is not None:
                return FieldState(
                    key=field_spec.key, label=field_spec.label,
                    status="available", source="metadata", value=v,
                    note=f"来自 Project metadata",
                )
        elif src == "industry_pack":
            patch = _industry_pack_value(industry, field_spec.key)
            if patch:
                # 行业包只提供模板提示,不算真实可用数据 → deferred
                return FieldState(
                    key=field_spec.key, label=field_spec.label,
                    status="deferred", source="industry_pack",
                    value=None, note=f"行业模板:{patch.get('ask', '')[:80]}",
                )
        elif src == "conversation":
            if has_conversation:
                return FieldState(
                    key=field_spec.key, label=field_spec.label,
                    status="deferred", source="conversation",
                    value=None, note="executor 将从访谈记录提取",
                )
        elif src == "kb_search":
            # KB 搜索动作放到 gap_actions 里,planner 阶段不实际执行
            continue
        elif src == "compute":
            # 计算依赖在 critic 后做(M1.overall_rag 依赖 M3 的结果)
            return FieldState(
                key=field_spec.key, label=field_spec.label,
                status="deferred", source="compute",
                value=None, note=f"由 {field_spec.compute_from} 计算",
            )

    # v3.2 兜底:所有声明的 source 都 miss,但项目里有上传文档 →
    # 标 deferred 让 executor 直接从文档全文里抽 (executor 已经会喂 docs_by_type 给 LLM)。
    # 这是关键修复 — 之前 planner 只看 brief / metadata 等结构化 source,
    # 看不见用户上传的 9 份文档,导致字段全 missing → 关键模块全 blocked → short_circuit 拦截。
    if docs_by_type and any(docs_by_type.values()):
        n_docs = sum(len(v) for v in docs_by_type.values())
        return FieldState(
            key=field_spec.key, label=field_spec.label,
            status="deferred", source="docs",
            value=None,
            note=f"将由 executor 从 {n_docs} 份上传文档全文抽取",
        )

    # 所有 source 都 miss + 也没有文档 → 真 missing
    return FieldState(
        key=field_spec.key, label=field_spec.label,
        status="missing", source=None, value=None,
        note="所有 source 均未命中",
    )


# ── Insight Planner ────────────────────────────────────────────────────────────

def _plan_modules_generic(
    *,
    all_modules: list,
    active_modules: list,
    project,
    industry: str | None,
    brief_fields: dict,
    has_conversation: bool,
    docs_by_type: dict | None = None,           # v3.2:文档兜底
) -> ExecutionPlan:
    """通用模块计划 helper(insight / outline 共用)。

    all_modules: 所有声明的模块(用来标 skipped)
    active_modules: 本次激活的模块(已经按行业过滤好)
    """
    skipped_keys = {m.key for m in all_modules} - {m.key for m in active_modules}

    assessments: list[ModuleAssessment] = []
    gap_actions: list[GapAction] = []

    # 处理激活模块
    for module in active_modules:
        field_states: dict[str, FieldState] = {}
        any_required_missing = False
        for fs in module.fields:
            state = _resolve_field(
                fs, brief_fields=brief_fields, project=project,
                industry=industry, has_conversation=has_conversation,
                docs_by_type=docs_by_type,
            )
            field_states[fs.key] = state

            if state.status == "missing":
                # 触发 gap action
                if fs.gap_action == "kb_search":
                    gap_actions.append(GapAction(
                        module_key=module.key, field_key=fs.key,
                        action="kb_search", detail=fs.kb_query_hint or fs.label,
                        field_label=fs.label, field_type=fs.type,
                        required=fs.required, module_title=module.title, necessity=module.necessity,
                    ))
                elif fs.gap_action == "web_search":
                    gap_actions.append(GapAction(
                        module_key=module.key, field_key=fs.key,
                        action="web_search", detail=fs.kb_query_hint or fs.label,
                        field_label=fs.label, field_type=fs.type,
                        required=fs.required, module_title=module.title, necessity=module.necessity,
                    ))
                elif fs.gap_action == "ask_user":
                    gap_actions.append(GapAction(
                        module_key=module.key, field_key=fs.key,
                        action="ask_user", detail=fs.user_question or fs.label,
                        field_label=fs.label, field_type=fs.type,
                        options=list(fs.options), multi=fs.multi,
                        required=fs.required, module_title=module.title, necessity=module.necessity,
                    ))
                    if fs.required:
                        any_required_missing = True
                elif fs.gap_action == "downgrade":
                    if fs.required:
                        any_required_missing = True

        status: ModuleStatus = "blocked" if (module.necessity == "critical" and any_required_missing) else "ready"
        # optional 模块即便缺 required,也只标 ready(executor 会标"信息缺失")
        if module.necessity == "optional" and any_required_missing:
            status = "ready"  # 让 executor 自己标信息缺失

        reason = ""
        if status == "blocked":
            missing_required = [fs.label for fs in module.fields
                                if fs.required and field_states[fs.key].status == "missing"
                                and fs.gap_action in ("ask_user", "downgrade")]
            reason = f"关键 required 字段缺失:{', '.join(missing_required)}"

        assessments.append(ModuleAssessment(
            key=module.key, title=module.title, necessity=module.necessity,
            status=status, fields=field_states, reason=reason,
        ))

    # 处理 skipped 模块(行业不匹配)
    for sk in skipped_keys:
        m_lookup = next((mm for mm in all_modules if mm.key == sk), None)
        if m_lookup:
            assessments.append(ModuleAssessment(
                key=m_lookup.key, title=m_lookup.title, necessity=m_lookup.necessity,
                status="skipped", fields={},
                reason=f"行业 {industry or '未指定'} 不在 {m_lookup.industry_filter} 内",
            ))

    sufficient = all(
        a.status == "ready"
        for a in assessments
        if a.necessity == "critical" and a.status != "skipped"
    )

    plan = ExecutionPlan(
        industry=industry, modules=assessments,
        gap_actions=gap_actions, sufficient_critical=sufficient,
    )
    return plan


def plan_insight(
    *,
    project,
    industry: str | None,
    brief_fields: dict,
    has_conversation: bool,
    docs_by_type: dict | None = None,
) -> ExecutionPlan:
    """Insight v2 规则化 planner: 按 industry 过滤模块,按 source_priority 解析字段。"""
    active = list_modules_for_industry(industry)
    plan = _plan_modules_generic(
        all_modules=INSIGHT_MODULES, active_modules=active,
        project=project, industry=industry,
        brief_fields=brief_fields, has_conversation=has_conversation,
        docs_by_type=docs_by_type,
    )
    logger.info("insight_plan_built",
                industry=industry,
                ready_n=sum(1 for a in plan.modules if a.status == "ready"),
                blocked_n=sum(1 for a in plan.modules if a.status == "blocked"),
                skipped_n=sum(1 for a in plan.modules if a.status == "skipped"),
                gaps_n=len(plan.gap_actions),
                sufficient=plan.sufficient_critical)
    return plan


def plan_outline(
    *,
    project,
    industry: str | None,
    brief_fields: dict,
    has_conversation: bool,
) -> ExecutionPlan:
    """Outline v2 规则化 planner: 7 个模块全部激活,行业差异化在 industry_pack 的 default sessions 里。"""
    from .outline_modules import OUTLINE_MODULES
    plan = _plan_modules_generic(
        all_modules=OUTLINE_MODULES, active_modules=list(OUTLINE_MODULES),
        project=project, industry=industry,
        brief_fields=brief_fields, has_conversation=has_conversation,
    )
    logger.info("outline_plan_built",
                industry=industry,
                ready_n=sum(1 for a in plan.modules if a.status == "ready"),
                blocked_n=sum(1 for a in plan.modules if a.status == "blocked"),
                gaps_n=len(plan.gap_actions),
                sufficient=plan.sufficient_critical)
    return plan


# ── Survey Planner ─────────────────────────────────────────────────────────────

@dataclass
class SubsectionAssessment:
    key: str
    title: str
    layer: str                     # L1 | L2
    target_roles: list[str]
    status: Literal["ready", "skipped"]
    must_cover: list[str]
    seeds_count: int               # 种子题目数量(含行业包补充)
    reason: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class SurveyPlan:
    industry: str | None
    subsections: list[SubsectionAssessment]
    already_covered: list[str]     # 访谈中已经覆盖的话题(避免重复问)
    extra_seeds_from_pack: list[dict]

    def to_dict(self) -> dict:
        return {
            "industry": self.industry,
            "subsections": [s.to_dict() for s in self.subsections],
            "already_covered": self.already_covered,
            "extra_seeds_from_pack": self.extra_seeds_from_pack,
        }


def plan_survey(
    *,
    industry: str | None,
    transcript_text: str,
    brief_fields: dict,
    layers: tuple[str, ...] = ("L1", "L2"),
) -> SurveyPlan:
    """Survey planner: 选定要生成的分卷 + 标注已覆盖话题(去重) + 注入行业包种子。

    简化:已覆盖话题用关键词匹配 transcript(粗粒度)。LLM 真实判定留给 executor。
    """
    pack = get_pack(industry)

    subsections: list[SubsectionAssessment] = []
    for layer in layers:
        for sub in list_subsections_for_layer(layer, industry):  # type: ignore[arg-type]
            seeds_count = len(sub.question_seeds)
            if pack and layer == "L2":
                # 行业包的种子按 theme 关联到对应分卷
                # 简单策略: 如果 pack seed 的 theme 与该 sub 所属 theme 一致,就 +1
                # (执行时 executor 会真正注入)
                pass
            subsections.append(SubsectionAssessment(
                key=sub.key, title=sub.title, layer=sub.layer,
                target_roles=list(sub.target_roles), status="ready",
                must_cover=list(sub.must_cover), seeds_count=seeds_count,
            ))

    # 粗粒度已覆盖话题判定(关键词匹配)
    already_covered = []
    transcript_lower = (transcript_text or "").lower()
    KEYWORDS_TO_TOPIC = {
        "组织架构": "组织架构", "汇报": "组织架构",
        "kpi": "KPI", "考核": "KPI",
        "线索": "线索", "商机": "商机",
        "回款": "回款", "应收": "应收",
        "bom": "BOM", "报价": "报价",
        "经销商": "经销商", "渠道": "经销商",
        "erp": "ERP 集成",
        "install base": "Install Base", "已售设备": "Install Base",
        "工单": "服务工单", "维保": "服务工单",
        "合规": "合规", "权限": "权限",
        "预算": "预算", "人天": "预算",
    }
    for kw, topic in KEYWORDS_TO_TOPIC.items():
        if kw in transcript_lower and topic not in already_covered:
            already_covered.append(topic)

    extra_seeds = pack.extra_question_seeds if pack else []

    plan = SurveyPlan(
        industry=industry,
        subsections=subsections,
        already_covered=already_covered,
        extra_seeds_from_pack=extra_seeds,
    )
    logger.info("survey_plan_built",
                industry=industry,
                subsections_n=len(subsections),
                already_covered=already_covered,
                extra_seeds_n=len(extra_seeds))
    return plan


# ── Gap Fill: KB 搜索 ──────────────────────────────────────────────────────────

async def fill_kb_gaps(
    plan: ExecutionPlan,
    *,
    project_id: str | None,
    industry: str | None,
) -> dict[str, list[dict]]:
    """跑所有 kb_search gap actions,返回 {field_key: [refs...]}。

    refs 格式与 OutputConversation.refs 一致,可直接拼接给 executor。
    """
    from services.embedding_service import embedding_service
    from services.vector_store import vector_store
    from sqlalchemy import select
    from models import async_session_maker
    from models.chunk import Chunk
    from models.document import Document

    out: dict[str, list[dict]] = {}
    kb_gaps = [g for g in plan.gap_actions if g.action == "kb_search"]
    if not kb_gaps:
        return out

    # 拿项目的文档 IDs(项目作用域)
    doc_ids: list[str] | None = None
    if project_id:
        async with async_session_maker() as s:
            rows = (await s.execute(
                select(Document.id).where(Document.project_id == project_id)
            )).all()
        doc_ids = [r[0] for r in rows] or None

    for gap in kb_gaps:
        try:
            qvec = await embedding_service.embed(gap.detail, use_cache=True)
            raw = await vector_store.search(
                qvec, top_k=5, industry=industry, document_ids=doc_ids,
            )
            if not raw and doc_ids:
                # 项目内无命中 → 全库降级一次
                raw = await vector_store.search(qvec, top_k=5)
            refs = []
            chunk_ids = [r["id"] for r in raw]
            if chunk_ids:
                async with async_session_maker() as s:
                    detail_rows = (await s.execute(
                        select(Chunk.id, Chunk.content, Chunk.source_section,
                               Document.filename, Document.id.label("doc_id"))
                        .join(Document, Document.id == Chunk.document_id)
                        .where(Chunk.id.in_(chunk_ids))
                    )).all()
                detail_map = {r.id: r for r in detail_rows}
                for r in raw:
                    d = detail_map.get(r["id"])
                    if not d:
                        continue
                    refs.append({
                        "chunk_id": r["id"],
                        "filename": d.filename or "",
                        "source_section": d.source_section or "",
                        "content": (d.content or "")[:600],
                        "query": gap.detail,
                        "for_module": gap.module_key,
                        "for_field": gap.field_key,
                    })
            out[gap.field_key] = refs
            logger.info("kb_gap_filled", field=gap.field_key, hits=len(refs), query=gap.detail[:60])
        except Exception as e:
            logger.warning("kb_gap_failed", field=gap.field_key, error=str(e)[:120])
            out[gap.field_key] = []
    return out
