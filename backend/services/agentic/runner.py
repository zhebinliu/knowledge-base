"""Runner — agentic v2 的主入口。

提供两个 Celery-friendly async 函数:
- generate_insight_v2(bundle_id, project_id)
- generate_survey_v2(bundle_id, project_id)

流程(insight):
1. 读取 ctx(project / brief / conversation / agent_config)
2. plan_insight(...)  → ExecutionPlan
3. fill_kb_gaps(...) → KB 补充 refs
4. 并行 execute_insight_module(...) 填充 ready 模块
5. critique_modules(...) 打分
6. 组装 markdown,根据 critical 模块状态判定 validity
7. _mark_bundle 写回(status / content_md / extra)

extra 结构(写到 bundle.extra):
- conversation_id (旧字段保留)
- generation_kb_calls (旧字段保留: list[{query, hits}])
- validity_status: 'valid' | 'partial' | 'invalid'
- module_states: { module_key: { status, score, issues, missing_fields[] } }
- run_history: [{ phase, ts, detail }]
- ask_user_prompts: [{ field_label, question }]  (前端 banner 显示)
"""
import asyncio
import io
import structlog
from datetime import date, datetime, timezone
from sqlalchemy import select

from models import async_session_maker
from models.curated_bundle import CuratedBundle
from models.project import Project
from models.output_conversation import OutputConversation
from models.project_brief import ProjectBrief

from .insight_modules import INSIGHT_MODULES, get_module
from .survey_modules import L1_EXEC_SUBSECTION, list_subsections_for_layer, get_subsection
from .planner import plan_insight, plan_survey, fill_kb_gaps
from .executor import execute_insight_module, execute_survey_subsection
from .critic import critique_modules, critique_subsections, ModuleScore, SubsectionScore
from .challenger import (
    challenge_report, affected_modules, should_continue, build_regen_user_suffix,
)

logger = structlog.get_logger()


# ── 共享:加载 ctx ─────────────────────────────────────────────────────────────

def _format_stakeholder_graph(fields: dict | None) -> str:
    """把 canvas 画的图谱(节点+边)渲染成 markdown 文本,LLM 可读。

    输出格式:
        # 组织架构 / 干系人图谱(用户在画布上手动标注)

        ## 部门 (N)
        - 销售部
        - 渠道部
        - ...

        ## 干系人 (N)
        - 张三(销售总监)— 所属:销售部
        - 李四(IT 总监)
        - ...

        ## 关系 (N)
        - 张三 → 李四:汇报给
        - 销售部 → 渠道部:管辖
        - ...

    返回空字符串表示图谱为空(不应注入 ctx)。
    """
    if not fields:
        return ""
    nodes = fields.get("nodes") or []
    edges = fields.get("edges") or []
    if not nodes and not edges:
        return ""

    depts = [n for n in nodes if n.get("type") == "department"]
    persons = [n for n in nodes if n.get("type") == "person"]

    out: list[str] = ["# 组织架构 / 干系人图谱(用户在画布上手动标注)", ""]
    if depts:
        out.append(f"## 部门 ({len(depts)})")
        for d in depts:
            out.append(f"- {d.get('name','?')}")
        out.append("")
    if persons:
        out.append(f"## 干系人 ({len(persons)})")
        for p in persons:
            base = p.get("name","?")
            extras = []
            if p.get("title"):
                extras.append(p["title"])
            if p.get("dept"):
                extras.append(f"所属:{p['dept']}")
            if extras:
                out.append(f"- {base}({' · '.join(extras)})")
            else:
                out.append(f"- {base}")
        out.append("")
    if edges:
        # 用 id → name 映射
        name_of = {n.get("id"): n.get("name","?") for n in nodes}
        out.append(f"## 关系 ({len(edges)})")
        for e in edges:
            sname = name_of.get(e.get("source"), "?")
            tname = name_of.get(e.get("target"), "?")
            label = e.get("label") or "关联"
            out.append(f"- {sname} → {tname}:{label}")
    return "\n".join(out).strip()


def _format_user_questionnaires(brief_fields: dict | None) -> str:
    """聚合用户在「成功指标 / 风险预警」问卷里填的答案,渲染成 markdown。

    不依赖前端 prompt 定义 — 直接扫 brief.fields 里 success_metric_* / risk_alert_*
    前缀的 cell,展平 value(list / str / dict 都规范成可读字符串)。
    """
    if not brief_fields:
        return ""

    def _val_str(cell):
        v = cell.get("value") if isinstance(cell, dict) else cell
        if v in (None, "", [], {}):
            return ""
        if isinstance(v, list):
            return "、".join(str(x) for x in v if x not in (None, ""))
        return str(v)

    success_items = []
    risk_items = []
    for k, cell in (brief_fields or {}).items():
        if not k.startswith(("success_metric_", "risk_alert_")):
            continue
        s = _val_str(cell)
        if not s:
            continue
        # 移除前缀,把 key 转成更可读的标签
        if k.startswith("success_metric_"):
            label = k.replace("success_metric_", "")
            success_items.append(f"- **{label}**:{s}")
        else:
            label = k.replace("risk_alert_", "")
            risk_items.append(f"- **{label}**:{s}")

    if not success_items and not risk_items:
        return ""

    out: list[str] = ["# 用户填的项目问卷答案", ""]
    if success_items:
        out.append("## 成功指标 — 客户最关心的业务结果")
        out.extend(success_items)
        out.append("")
    if risk_items:
        out.append("## 风险预警 — 客户认可适用的典型风险")
        out.extend(risk_items)
    return "\n".join(out).strip()


async def _load_ctx(bundle_id: str, project_id: str, kind: str) -> dict:
    """读 bundle / project / brief / conversation / agent_config。

    复用 v1 的 _get_output_agent_config / _get_skill_snippets / _format_transcript /
    _format_refs / _get_brief_block,以保持与 v1 行为一致。
    """
    from services.output_service import (
        _get_project, _get_conversation, _get_output_agent_config,
        _get_skill_snippets, _format_transcript, _format_refs,
    )

    async with async_session_maker() as s:
        bundle = await s.get(CuratedBundle, bundle_id)
    extra = (bundle.extra or {}) if bundle else {}
    conv_id = extra.get("conversation_id")

    project = await _get_project(project_id) if project_id else None
    conv = await _get_conversation(conv_id) if conv_id else None
    agent_cfg = await _get_output_agent_config(kind)
    skill_text = await _get_skill_snippets(agent_cfg.get("skill_ids") or [])
    transcript = _format_transcript(conv)
    refs_text = _format_refs(conv)

    # 读取 v2 brief(如有)
    brief_fields: dict = {}
    if project_id:
        async with async_session_maker() as s:
            row = (await s.execute(
                select(ProjectBrief).where(
                    ProjectBrief.project_id == project_id,
                    ProjectBrief.output_kind == kind,
                )
            )).scalar_one_or_none()
        if row and row.fields:
            brief_fields = row.fields

    # 加载项目下的"已完成"文档(按 doc_type 索引,markdown_content 直接可读)
    # 给 planner / executor 用作首要信息源 — 实施场景下顾问主要靠这些文档
    docs_by_type: dict[str, list[dict]] = {}
    if project_id:
        from models.document import Document
        async with async_session_maker() as s:
            doc_rows = (await s.execute(
                select(
                    Document.id, Document.filename, Document.doc_type,
                    Document.summary, Document.markdown_content,
                )
                .where(Document.project_id == project_id)
                .where(Document.conversion_status == "completed")
            )).all()
        for r in doc_rows:
            if not r.doc_type:
                continue
            docs_by_type.setdefault(r.doc_type, []).append({
                "doc_id": r.id,
                "filename": r.filename,
                "summary": (r.summary or "")[:600],   # 摘要用于 prompt 概览
                "markdown": (r.markdown_content or ""),  # 全文,供按 doc_type 抽取用
            })

    # v3.1 新增:加载干系人图谱 canvas — 用户在前端画布上手画的部门/人员关系。
    # 渲染成 markdown 文本,作为合成"文档"塞进 docs_by_type['stakeholder_map'],
    # 让 executor 像对待普通上传文档一样喂给 LLM(并被编号成 D 类源)。
    if project_id:
        async with async_session_maker() as s:
            graph_row = (await s.execute(
                select(ProjectBrief).where(
                    ProjectBrief.project_id == project_id,
                    ProjectBrief.output_kind == "stakeholder_graph",
                )
            )).scalar_one_or_none()
        graph_md = _format_stakeholder_graph(graph_row.fields if graph_row else None)
        if graph_md:
            docs_by_type.setdefault("stakeholder_map", []).append({
                "doc_id": f"canvas:{project_id}",
                "filename": "组织架构 / 干系人图谱(画布)",
                "summary": graph_md[:300],
                "markdown": graph_md,
            })

    # v3.1 新增:用户填的虚拟物问卷(成功指标 / 风险预警),
    # 字段名 success_metric_* / risk_alert_*,insight_modules 没显式列出 → planner 看不见。
    # 这里聚合成 markdown 文本,合成成虚拟"上传文档"塞进 docs_by_type['user_questionnaire'],
    # 自动被 executor 编号成 D 类源喂给 LLM。
    user_q_md = _format_user_questionnaires(brief_fields)
    if user_q_md:
        docs_by_type.setdefault("user_questionnaire", []).append({
            "doc_id": f"questionnaire:{project_id}",
            "filename": "用户填的成功指标 + 风险预警问卷",
            "summary": user_q_md[:300],
            "markdown": user_q_md,
        })

    return {
        "bundle_id": bundle_id,
        "bundle_extra": extra,
        "project": project,
        "industry": (project.industry if project else None) or extra.get("industry"),
        "conv": conv,
        "transcript": transcript,
        "refs_raw": (conv.refs if conv else []) or [],
        "refs_text": refs_text,
        "brief_fields": brief_fields,
        "agent_prompt": agent_cfg.get("prompt", ""),
        "agent_model": agent_cfg.get("model"),
        "skill_text": skill_text,
        # v3 新增:按 doc_type 索引的项目文档(markdown 已转好)
        "docs_by_type": docs_by_type,
    }


async def _mark(bundle_id: str, status: str, **kwargs):
    from services.output_service import _mark_bundle
    await _mark_bundle(bundle_id, status, **kwargs)


async def _mark_conv(bundle_id: str, status: str):
    from services.output_service import _mark_conversation
    await _mark_conversation(bundle_id, status)


CHALLENGE_MAX_ROUNDS = 3       # 最多 3 轮挑战


async def _persist_challenge_round(
    *, bundle_id: str, round_idx: int, status: str,
    critique_json: dict | None, modules_regenerated: list[str] | None,
    challenger_model: str | None, regen_model: str | None,
    regen_chars: int | None, duration_ms: int | None,
    critique_raw: str | None = None,                # parse 失败时携带原始 LLM 输出
):
    """新增 / 更新一条 challenge_rounds 记录。"""
    from models.challenge_round import ChallengeRound
    async with async_session_maker() as s:
        # 一个 (bundle_id, round_idx) 对应一行 — 先查再 upsert
        existing = (await s.execute(
            select(ChallengeRound).where(
                ChallengeRound.bundle_id == bundle_id,
                ChallengeRound.round_idx == round_idx,
            )
        )).scalar_one_or_none()
        if existing:
            existing.status = status
            if critique_json is not None:
                existing.critique_json = critique_json
            if modules_regenerated is not None:
                existing.modules_regenerated = modules_regenerated
            if challenger_model:
                existing.challenger_model = challenger_model
            if regen_model:
                existing.regen_model = regen_model
            if regen_chars is not None:
                existing.regen_chars = regen_chars
            if duration_ms is not None:
                existing.duration_ms = duration_ms
            if critique_raw is not None:
                existing.critique_raw = critique_raw
        else:
            s.add(ChallengeRound(
                bundle_id=bundle_id, round_idx=round_idx, status=status,
                critique_json=critique_json,
                critique_raw=critique_raw,
                modules_regenerated=modules_regenerated,
                challenger_model=challenger_model,
                regen_model=regen_model,
                regen_chars=regen_chars,
                duration_ms=duration_ms,
            ))
        from sqlalchemy.orm.attributes import flag_modified
        if existing and critique_json is not None:
            flag_modified(existing, "critique_json")
        await s.commit()


async def _run_challenge_loop(
    *,
    bundle_id: str,
    full_md_initial: str,
    module_contents: dict,                 # 会被原地修改:重生成的模块 content 替换进去
    ready_pairs: list,                      # [(spec, assess), ...] 用于查找 spec/assess 重生成
    ctx: dict,
    kb_refs: dict,
    m9_web_refs: list,
    assemble_fn,                            # callable() → str  重新拼装 markdown
    run_history: list,
    skip_loop: bool = False,                # invalid 报告不挑
) -> dict:
    """挑战循环:
    1. challenger 评 full_md → 写 ChallengeRound
    2. 解析 issues → 找出受影响的 module_keys (severity ∈ {blocker, major})
    3. 重新跑这些模块 (executor + revision_suffix 携带挑战意见)
    4. 替换 module_contents → 重新 assemble full_md
    5. 重复直到 verdict='pass' 或 round >= MAX_ROUNDS

    Returns: {
      "final_md": str, "rounds_total": int,
      "final_verdict": str, "issues_remaining": int,
    }
    """
    import time
    if skip_loop:
        return {
            "final_md": full_md_initial, "rounds_total": 0,
            "final_verdict": "skipped_invalid", "issues_remaining": 0,
        }

    # 准备 (spec, assess) 索引,挑战循环里按 module_key 查
    by_key = {spec.key: (spec, assess) for spec, assess in ready_pairs}
    cur_md = full_md_initial
    last_critique = None
    rounds_done = 0

    for round_idx in range(CHALLENGE_MAX_ROUNDS):
        rounds_done = round_idx + 1
        round_start = time.time()

        # ── 1. 挑战 ──
        await _update_progress(
            bundle_id, stage="challenging", round_idx=round_idx,
            message=f"第 {round_idx + 1}/{CHALLENGE_MAX_ROUNDS} 轮挑战:挑战者审核报告中…",
        )
        critique, challenger_model, critique_raw = await challenge_report(
            full_md=cur_md, model=ctx.get("agent_model"),
        )
        last_critique = critique
        run_history.append({
            "phase": "challenged", "ts": _ts(),
            "detail": {"round": round_idx, "verdict": critique["verdict"],
                       "issues_n": len(critique["issues"]),
                       "parse_failed": critique_raw is not None},
        })
        # 写一条 ChallengeRound 占位 (status=critiquing → done after)
        # 解析失败时把原始 LLM 输出存到 critique_raw 字段供前端展示 + debug
        await _persist_challenge_round(
            bundle_id=bundle_id, round_idx=round_idx, status="critiquing",
            critique_json=critique, modules_regenerated=None,
            challenger_model=challenger_model, regen_model=None,
            regen_chars=None, duration_ms=None,
            critique_raw=critique_raw,
        )

        # 用挑战 summary 更新进度卡片
        verdict_label = {"pass": "✓ 无重大问题", "minor_issues": "⚠ 轻微问题",
                         "major_issues": "🚫 严重问题"}.get(critique["verdict"], "?")
        await _update_progress(
            bundle_id, stage="challenging", round_idx=round_idx,
            message=f"第 {round_idx + 1} 轮:{verdict_label} · {critique.get('summary', '')[:80]}",
        )

        # ── 2. 决定下一步 ──
        affected = affected_modules(critique)
        if not should_continue(critique, round_idx, CHALLENGE_MAX_ROUNDS) or not affected:
            await _persist_challenge_round(
                bundle_id=bundle_id, round_idx=round_idx, status="final",
                critique_json=critique, modules_regenerated=[],
                challenger_model=challenger_model, regen_model=None,
                regen_chars=None,
                duration_ms=int((time.time() - round_start) * 1000),
            )
            break

        # ── 3. 重新生成被挑出的模块 ──
        regen_keys_actual = [k for k in affected if k in by_key]
        await _update_progress(
            bundle_id, stage="regenerating", round_idx=round_idx,
            message=f"第 {round_idx + 1} 轮:正在重新生成 {len(regen_keys_actual)} 个章节 ({', '.join(regen_keys_actual[:3])}{'...' if len(regen_keys_actual) > 3 else ''})…",
            modules_in_flight=regen_keys_actual,
        )

        async def _regen_one(mk: str):
            spec, assess = by_key[mk]
            suffix = build_regen_user_suffix(mk, critique)
            try:
                result = await execute_insight_module(
                    module=spec, assessment=assess,
                    project=ctx["project"], industry=ctx["industry"],
                    transcript=ctx["transcript"], refs=ctx["refs_raw"],
                    extra_kb_refs=kb_refs,
                    skill_text=ctx["skill_text"], agent_prompt=ctx["agent_prompt"],
                    model=ctx["agent_model"],
                    docs_by_type=ctx.get("docs_by_type"),
                    web_research_refs=m9_web_refs if spec.key == "M9_industry_benchmark" else None,
                    revision_suffix=suffix,
                )
                return mk, result.get("content", "")
            except Exception as e:
                logger.warning("regen_module_failed", mk=mk, err=str(e)[:120])
                return mk, None

        regen_results = await asyncio.gather(*(_regen_one(k) for k in regen_keys_actual))
        regen_chars = 0
        for mk, content in regen_results:
            if content:
                module_contents[mk] = content
                regen_chars += len(content)

        # ── 4. 重新 assemble ──
        cur_md = assemble_fn()
        run_history.append({
            "phase": "regenerated", "ts": _ts(),
            "detail": {"round": round_idx, "modules": regen_keys_actual,
                       "regen_chars": regen_chars},
        })
        await _persist_challenge_round(
            bundle_id=bundle_id, round_idx=round_idx, status="done",
            critique_json=critique, modules_regenerated=regen_keys_actual,
            challenger_model=challenger_model, regen_model=ctx.get("agent_model"),
            regen_chars=regen_chars,
            duration_ms=int((time.time() - round_start) * 1000),
        )

    # 终了:统计未解决的 issues
    issues_remaining = 0
    final_verdict = "skipped"
    if last_critique:
        issues_remaining = len([
            it for it in last_critique.get("issues", [])
            if it.get("severity") in ("blocker", "major")
        ])
        final_verdict = last_critique.get("verdict", "?")

    return {
        "final_md": cur_md,
        "rounds_total": rounds_done,
        "final_verdict": final_verdict,
        "issues_remaining": issues_remaining,
    }


async def _update_progress(
    bundle_id: str, *,
    stage: str,
    message: str,
    round_idx: int | None = None,
    modules_in_flight: list[str] | None = None,
):
    """轻量进度写入 — 直接 patch bundle.extra.progress,前端 polling 拉到。

    stage: 'planning' | 'executing' | 'critiquing' | 'challenging' | 'regenerating' | 'finalizing'
    message: 给用户看的一句话(中文,人话不要黑话)
    round_idx: 挑战轮次(0/1/2)
    modules_in_flight: 正在生成 / 重生成的 module_keys
    """
    from sqlalchemy.orm.attributes import flag_modified
    async with async_session_maker() as s:
        b = await s.get(CuratedBundle, bundle_id)
        if not b:
            return
        extra = dict(b.extra or {})
        extra["progress"] = {
            "stage": stage,
            "message": message,
            "round_idx": round_idx,
            "modules_in_flight": modules_in_flight or [],
            "updated_at": _ts(),
        }
        b.extra = extra
        flag_modified(b, "extra")
        await s.commit()


def _ts() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


# ── v3: M9 行业最佳实践的 Web 研究融合 ────────────────────────────────────────
# KB 走 fill_kb_gaps,Web 走这个 helper;融合后注入 executor

async def _build_m9_web_refs(industry: str, project) -> tuple[list[dict], dict]:
    """对 M9 跑 Web 搜索,返回结构化 refs 列表(executor 自动编号 [W1] [W2]...)。

    Returns: (refs_list, status_dict)
      refs_list: [{title, url, domain, snippet, source}, ...]
      status_dict: {ok: bool, reason: str, queries_n: int, hits_n: int}
        - ok=False 时 reason 说明:no_provider / no_hits / exception
        前端用这个状态在报告头部显示"⚠ Web 检索失败可能影响 M9 质量"banner
    """
    status = {"ok": False, "reason": "", "queries_n": 0, "hits_n": 0}
    try:
        from services.web_search_service import web_search, has_web_search_provider
        if not await has_web_search_provider():
            status["reason"] = "no_provider"
            return [], status
        customer = project.customer if project else ""
        queries = [
            f"{industry} CRM 实施 标杆案例 最佳实践 2025",
            f"{industry} 数字化转型 失败教训 项目陷阱",
        ]
        if customer:
            queries.append(f"{customer} 企业数字化 CRM 案例")
        all_hits = []
        status["queries_n"] = min(len(queries), 3)
        for q in queries[:3]:
            hits = await web_search(q, top_k=3)
            all_hits.extend(hits)
        # 去重(按 url)
        seen = set()
        deduped = []
        for h in all_hits:
            u = h.get("url") or ""
            if u in seen:
                continue
            seen.add(u)
            domain = u.split("/")[2] if "//" in u else ""
            deduped.append({**h, "domain": domain})
        deduped = deduped[:8]
        status["hits_n"] = len(deduped)
        status["ok"] = len(deduped) > 0
        if not status["ok"]:
            status["reason"] = "no_hits"
        return deduped, status
    except Exception as e:
        status["reason"] = "exception"
        status["error"] = str(e)[:120]
        logger.warning("m9_web_refs_failed", err=str(e)[:120])
        return [], status


# ── 行业 / 方法论 名词解释库 ────────────────────────────────────────────────────
# 文档生成完会扫一遍 markdown,只列出现过的术语,追加"名词解释"附录

GLOSSARY: dict[str, str] = {
    # CRM 实施场景
    "CRM": "客户关系管理(Customer Relationship Management)",
    "ERP": "企业资源计划(Enterprise Resource Planning),如金蝶 / 用友 / SAP",
    "MES": "制造执行系统(Manufacturing Execution System),工厂车间生产管理",
    "PLM": "产品生命周期管理(Product Lifecycle Management),如达索 / 西门子",
    "OA":  "办公自动化系统(Office Automation),如泛微 / 致远 / 钉钉",
    "PRM": "伙伴关系管理(Partner Relationship Management),即「伙伴云 / 经销商门户」",
    "BOM": "物料清单(Bill of Materials),产品由哪些零部件组成",
    "CPQ": "配置-报价-定价(Configure-Price-Quote),复杂产品报价工具",
    "SFA": "销售自动化(Sales Force Automation),CRM 的核心模块之一",
    "SaaS":"软件即服务(Software as a Service)",
    "PaaS":"平台即服务(Platform as a Service)",
    # 流程缩写
    "L2C": "线索到合同(Lead to Contract),销售前端全流程",
    "O2C": "订单到现金(Order to Cash),订单履约 + 收款全流程",
    "S2C": "服务到合同(Service to Contract),售后服务转化收入",
    # 项目管理 / 测试
    "PMO": "项目管理办公室(Project Management Office)",
    "RACI":"责任分配矩阵(Responsible/Accountable/Consulted/Informed)",
    "UAT": "用户验收测试(User Acceptance Testing)",
    "SIT": "系统集成测试(System Integration Test)",
    "POC": "概念验证(Proof of Concept)",
    # 业务术语
    "Install Base": "已售设备基数,累积已交付给客户的设备清单(售后/续约的根基)",
    "KPI": "关键绩效指标(Key Performance Indicator)",
    "OKR": "目标与关键成果(Objectives and Key Results)",
    "SMART": "目标设定原则:Specific(具体)/Measurable(可量化)/Achievable(可达成)/Relevant(相关)/Time-bound(有时限)",
    "B2B": "企业对企业(Business to Business)",
    # 方法论
    "RAG": "红黄绿三色评级(Red/Amber/Green),用于项目健康度",
    "RAID":"风险/行动/议题/决策(Risks/Actions/Issues/Decisions)四件套",
    "SCQA":"咨询叙事框架:情境(Situation)→冲突(Complication)→问题(Question)→答案(Answer)",
    "MBB": "顶级战略咨询公司:McKinsey / BCG / Bain",
    "Quick Win": "快速见效:2 周内能落地、风险低、效果可见的动作",
    "Bottom line": "首行结论:文档/章节最重要的一句话,放最前",
    "Pyramid": "金字塔原理:先抛结论再展开论据的表达结构",
}


def _build_glossary_appendix(md: str) -> str:
    """扫 markdown 找出现过的术语,生成"名词解释"附录段落。空则返回空串。"""
    import re
    found = []
    seen = set()
    for term, expl in GLOSSARY.items():
        if term in seen:
            continue
        # 用单词边界匹配,避免 "OAuth" 误匹配 "OA";Install Base 这种短语直接子串匹配
        if " " in term:
            if term in md:
                found.append((term, expl))
                seen.add(term)
        else:
            # 单词:左右不能是字母数字
            if re.search(rf'(?<![A-Za-z0-9]){re.escape(term)}(?![A-Za-z0-9])', md):
                found.append((term, expl))
                seen.add(term)
    if not found:
        return ""
    lines = ["\n## 附录 · 名词解释\n"]
    lines.append("> 以下术语是 CRM 实施 / 项目管理 / 咨询行业的常用缩写,文档中按行业惯例直接使用,在此统一释义。\n")
    for term, expl in found:
        lines.append(f"- **{term}**:{expl}")
    return "\n".join(lines)


# ── 共享:信息不足拦截器(insight / outline 共用)─────────────────────────────

async def _short_circuit_invalid(
    *, bundle_id: str, project_id: str, kind_label: str,
    ctx: dict, plan, run_history: list[dict],
) -> None:
    """关键模块信息不足时调用。不跑 Executor / Critic,直接写 invalid bundle + 问卷。

    bundle.extra:
      - validity_status='invalid'
      - short_circuited=True
      - ask_user_prompts: 含 options / multi / field_label / module_title 的完整 dto
      - module_states: 各模块的 planner_status(blocked / skipped / ready 但本次未运行)
    """
    # ask_user prompts(从 plan.gap_actions 过滤出来,带 options)
    ask_user_prompts = [g.to_dict() for g in plan.gap_actions if g.action == "ask_user"]
    # 按 module 分组(给前端用)
    by_module: dict[str, list[dict]] = {}
    for p in ask_user_prompts:
        by_module.setdefault(p["module_key"], []).append(p)

    # module_states:全部模块都没跑,blocked 模块标 blocked,其他标 not_run
    module_states: dict[str, dict] = {}
    for assess in plan.modules:
        if assess.status == "skipped":
            mod_status = "skipped"
        elif assess.status == "blocked":
            mod_status = "blocked"
        else:
            mod_status = "not_run"
        module_states[assess.key] = {
            "key": assess.key,
            "title": assess.title,
            "necessity": assess.necessity,
            "status": mod_status,
            "planner_status": assess.status,
            "score": None,
            "missing_fields": [
                {"key": fk, "label": fs.label, "note": fs.note}
                for fk, fs in assess.fields.items() if fs.status == "missing"
            ],
            "reason": assess.reason,
        }

    blocked = [ms for ms in module_states.values()
               if ms["necessity"] == "critical" and ms["status"] == "blocked"]

    # 简短的 markdown(不烧 LLM token,只占位)
    proj = ctx["project"]
    title_main = proj.name if proj else (ctx["industry"] or "—")
    md = (
        f"# {title_main} · {kind_label} v2 (agentic)\n\n"
        f"**生成日期**:{date.today().strftime('%Y年%m月%d日')}  \n"
        f"**Validity**:invalid · **拦截**(未跑 LLM)\n\n"
        f"---\n\n"
        f"> ⚠️ **本次未生成 — 关键信息不足**\n>\n"
        f"> 系统检测到 **{len(blocked)}** 个关键模块缺少必要信息,为避免输出无依据的洞察 / 浪费算力,\n"
        f"> 直接拦截了本次生成。**请在下方问卷里补充信息后重新生成。**\n\n"
        f"### 信息不足的关键模块\n\n"
    )
    for ms in blocked:
        missing = ", ".join(f["label"] for f in ms["missing_fields"]) or ms["reason"]
        md += f"- **{ms['title']}**:{missing}\n"
    md += (
        f"\n### 待补充的问题清单\n\n"
        f"共 **{len(ask_user_prompts)}** 个问题,在前端「补充信息」面板里逐题作答(大部分有选项,1-3 分钟搞定)。\n"
    )

    new_extra = dict(ctx["bundle_extra"])
    new_extra.update({
        "validity_status": "invalid",
        "short_circuited": True,
        "module_states": module_states,
        "ask_user_prompts": ask_user_prompts,
        "ask_user_by_module": by_module,
        "run_history": run_history + [{"phase": "short_circuit", "ts": _ts(),
                                       "detail": {"reason": "sufficient_critical=False",
                                                  "blocked_n": len(blocked),
                                                  "ask_user_n": len(ask_user_prompts)}}],
        "agentic_version": "v2",
    })
    await _mark(bundle_id, "done", content_md=md, file_key=None, extra=new_extra)
    await _mark_conv(bundle_id, "done")
    logger.info("v2_short_circuited", bundle_id=bundle_id, kind=kind_label,
                blocked_n=len(blocked), ask_user_n=len(ask_user_prompts))


# ── Insight v2 入口 ────────────────────────────────────────────────────────────

async def generate_insight_v2(bundle_id: str, project_id: str):
    """v2 入口 — 三层 agentic 流程。失败时 status=failed,信息不足时 status=done + invalid。"""
    run_history: list[dict] = []
    try:
        await _mark(bundle_id, "generating")
        run_history.append({"phase": "started", "ts": _ts()})
        await _update_progress(bundle_id, stage="planning", message="加载项目上下文 + 生成方案规划中…")

        # ── Phase 1: 加载 ctx ──
        ctx = await _load_ctx(bundle_id, project_id, "insight_v2")
        run_history.append({
            "phase": "ctx_loaded", "ts": _ts(),
            "detail": {
                "has_project": bool(ctx["project"]),
                "industry": ctx["industry"],
                "transcript_len": len(ctx["transcript"]),
                "brief_fields_n": len(ctx["brief_fields"]),
                "refs_raw_n": len(ctx["refs_raw"]),
            },
        })

        # ── Phase 1.5(v3): 自动从文档抽取 brief 字段 ──
        # 触发条件:有上传文档 + "真实模块字段"未填够 5 个。
        # 注意:**必须排除 success_metric_* / risk_alert_* / 其他虚拟物前缀字段**,
        # 这些是用户填问卷写入的,不是模块字段,数它们会让 auto_extract 永远不触发,
        # planner 看不到文档信息 → critical 模块全 missing → short_circuit 错误拦截。
        VIRTUAL_PREFIXES = ("success_metric_", "risk_alert_", "v_")
        docs_by_type = ctx.get("docs_by_type") or {}
        real_field_count = sum(
            1 for k, v in (ctx["brief_fields"] or {}).items()
            if isinstance(v, dict) and v.get("value") not in (None, "", [])
               and not k.startswith(VIRTUAL_PREFIXES)
        )
        # 触发:任何上传文档 + 真实字段不足 5 个 → 跑抽取
        # 也兼容旧 brief_filled_count 的语义,避免回归
        if docs_by_type and real_field_count < 5:
            brief_filled_count = real_field_count
            try:
                from services.brief_service import extract_brief_draft, merge_extract_with_user_edits
                from models.project_brief import ProjectBrief
                logger.info("v3_auto_extract_start",
                            project_id=project_id, docs_n=sum(len(v) for v in docs_by_type.values()),
                            brief_filled_pre=brief_filled_count)
                draft = await extract_brief_draft(project_id, "insight_v2", model=ctx["agent_model"])
                # 合并到现有 brief(用户已编辑的字段优先保留)
                merged = merge_extract_with_user_edits(ctx["brief_fields"] or {}, draft)
                async with async_session_maker() as s:
                    row = (await s.execute(
                        select(ProjectBrief).where(
                            ProjectBrief.project_id == project_id,
                            ProjectBrief.output_kind == "insight_v2",
                        )
                    )).scalar_one_or_none()
                    if row:
                        row.fields = merged
                        from sqlalchemy.orm.attributes import flag_modified
                        flag_modified(row, "fields")
                    else:
                        s.add(ProjectBrief(project_id=project_id,
                                           output_kind="insight_v2", fields=merged))
                    await s.commit()
                ctx["brief_fields"] = merged
                post_real = sum(
                    1 for k, v in merged.items()
                    if isinstance(v, dict) and v.get("value") not in (None, "", [])
                       and not k.startswith(VIRTUAL_PREFIXES)
                )
                run_history.append({
                    "phase": "v3_auto_extract", "ts": _ts(),
                    "detail": {"docs_n": sum(len(v) for v in docs_by_type.values()),
                               "brief_filled_pre": brief_filled_count,
                               "brief_filled_post": post_real},
                })
            except Exception as e:
                logger.warning("v3_auto_extract_failed", error=str(e)[:200])

        # ── Phase 2: Planner ──
        plan = plan_insight(
            project=ctx["project"],
            industry=ctx["industry"],
            brief_fields=ctx["brief_fields"],
            has_conversation=bool(ctx["transcript"]) and ctx["transcript"] != "（没有可用的访谈记录）",
            docs_by_type=ctx.get("docs_by_type"),                  # v3.2 兜底:文档存在就标 deferred
        )
        run_history.append({
            "phase": "planned", "ts": _ts(),
            "detail": {
                "ready": [m.key for m in plan.modules if m.status == "ready"],
                "blocked": [m.key for m in plan.modules if m.status == "blocked"],
                "skipped": [m.key for m in plan.modules if m.status == "skipped"],
                "gaps_n": len(plan.gap_actions),
                "sufficient_critical": plan.sufficient_critical,
            },
        })

        # ── 拦截:关键模块信息不足 → 不跑 Executor / Critic,直接出问卷 ──
        if not plan.sufficient_critical:
            await _short_circuit_invalid(
                bundle_id=bundle_id, project_id=project_id, kind_label="项目洞察",
                ctx=ctx, plan=plan, run_history=run_history,
            )
            return

        # ── Phase 3: Gap Fill (KB 搜索) ──
        await _update_progress(bundle_id, stage="planning",
                               message=f"信息地图已规划:{len([m for m in plan.modules if m.status == 'ready'])} 个章节待生成,正在补充 KB 证据…")
        kb_refs = await fill_kb_gaps(plan, project_id=project_id, industry=ctx["industry"])
        run_history.append({
            "phase": "gaps_filled", "ts": _ts(),
            "detail": {fk: len(rl) for fk, rl in kb_refs.items()},
        })

        # ── Phase 4: Executor (并行) ──
        ready_modules = [m for m in plan.modules if m.status == "ready"]
        await _update_progress(
            bundle_id, stage="executing",
            message=f"并行生成 {len(ready_modules)} 个章节中…",
            modules_in_flight=[m.key for m in ready_modules],
        )
        # 同步 module_spec 与 assessment(顺序保留 INSIGHT_MODULES 的逻辑顺序)
        ready_pairs = []
        for spec in INSIGHT_MODULES:
            for assess in ready_modules:
                if assess.key == spec.key:
                    ready_pairs.append((spec, assess))
                    break

        # v3: M9 行业最佳实践 — 跑 web research(返回结构化 refs 供 sources_index 编号)
        m9_web_refs: list[dict] = []
        m9_web_status: dict = {"ok": False, "reason": "no_industry"}
        if ctx["industry"]:
            m9_web_refs, m9_web_status = await _build_m9_web_refs(ctx["industry"], ctx["project"])

        async def _run_one(spec, assess):
            result = await execute_insight_module(
                module=spec, assessment=assess,
                project=ctx["project"], industry=ctx["industry"],
                transcript=ctx["transcript"], refs=ctx["refs_raw"],
                extra_kb_refs=kb_refs,
                skill_text=ctx["skill_text"], agent_prompt=ctx["agent_prompt"],
                model=ctx["agent_model"],
                docs_by_type=ctx.get("docs_by_type"),                                # v3
                web_research_refs=m9_web_refs if spec.key == "M9_industry_benchmark" else None,
            )
            # result = {"content": str, "sources_index": dict}
            return spec.key, result.get("content", ""), result.get("sources_index", {})

        results = await asyncio.gather(*(_run_one(s, a) for s, a in ready_pairs), return_exceptions=True)
        module_contents: dict[str, str] = {}
        provenance: dict[str, dict] = {}      # v3:{module_key: sources_index dict}
        for r in results:
            if isinstance(r, Exception):
                logger.warning("executor_exception", error=str(r)[:200])
                continue
            mk, content, sources_idx = r
            module_contents[mk] = content
            if sources_idx:
                provenance[mk] = sources_idx
        run_history.append({
            "phase": "executed", "ts": _ts(),
            "detail": {
                "completed": list(module_contents.keys()),
                "provenance_modules_n": len(provenance),
                "total_sources": sum(len(v) for v in provenance.values()),
            },
        })

        # ── Phase 5: Critic ──
        await _update_progress(bundle_id, stage="critiquing",
                               message=f"逐模块质量打分中(共 {len(module_contents)} 个章节)…")
        scores: dict[str, ModuleScore] = await critique_modules(
            list(module_contents.items()), model=ctx["agent_model"],
        )
        run_history.append({
            "phase": "critiqued", "ts": _ts(),
            "detail": {mk: s.overall for mk, s in scores.items()},
        })

        # ── Phase 6: 组装 + Validity ──
        module_states: dict[str, dict] = {}
        for assess in plan.modules:
            score = scores.get(assess.key)
            mod_status = assess.status  # planned default
            if assess.status == "ready":
                if assess.key in module_contents:
                    # executor 成功 → 看 critic 评分
                    if score:
                        if score.overall == "pass":
                            mod_status = "done"
                        elif score.overall == "needs_rework":
                            mod_status = "done_with_warnings"
                        elif score.overall == "insufficient":
                            mod_status = "insufficient"
                    else:
                        mod_status = "done"
                else:
                    # planner 标 ready 但 executor 没产出 → 执行失败(超时 / LLM 异常 / 等)
                    mod_status = "failed"
            module_states[assess.key] = {
                "key": assess.key,
                "title": assess.title,
                "necessity": assess.necessity,
                "status": mod_status,
                "planner_status": assess.status,
                "score": score.to_dict() if score else None,
                "missing_fields": [
                    {"key": fk, "label": fs.label, "note": fs.note}
                    for fk, fs in assess.fields.items() if fs.status == "missing"
                ],
                "reason": assess.reason,
            }

        # validity 判定:
        # - 任何 critical 模块 status ∈ {blocked, insufficient} → invalid
        # - 所有 critical 都 done → valid
        # - 中间状态(done_with_warnings) → partial
        critical_states = [
            ms for ms in module_states.values()
            if ms["necessity"] == "critical" and ms["status"] != "skipped" and ms["planner_status"] != "skipped"
        ]
        critical_bad = [ms for ms in critical_states
                        if ms["status"] in ("blocked", "insufficient") or ms["planner_status"] == "blocked"]
        critical_warn = [ms for ms in critical_states if ms["status"] == "done_with_warnings"]
        if critical_bad:
            validity_status = "invalid"
        elif critical_warn:
            validity_status = "partial"
        else:
            validity_status = "valid"

        # ask_user prompts(前端 banner 用)
        ask_user_prompts = [
            {"module_key": g.module_key, "field_key": g.field_key, "question": g.detail}
            for g in plan.gap_actions if g.action == "ask_user"
        ]

        # 把拼装抽成函数 — 挑战循环每轮重生成模块后会再调一次
        def _assemble_full_md() -> str:
            proj_local = ctx["project"]
            title_local = proj_local.name if proj_local else (ctx["industry"] or "—")
            blocks = [
                f"# {title_local} · 项目洞察报告\n",
                f"**生成日期**:{date.today().strftime('%Y年%m月%d日')}  ",
                f"**客户**:{(proj_local.customer if proj_local else '—') or '—'}  ",
                f"**行业**:{ctx['industry'] or '—'}\n",
            ]
            if validity_status == "invalid":
                blocks.append("---\n")
                blocks.append("> ⚠️ **本份报告判定为「信息不足」(invalid)**\n>")
                blocks.append("> 以下关键模块因关键字段缺失,未能完整生成:")
                for ms_local in critical_bad:
                    miss = ", ".join(f["label"] for f in ms_local["missing_fields"]) or ms_local["reason"]
                    blocks.append(f"> - **{ms_local['title']}**:{miss}")
                if ask_user_prompts:
                    blocks.append(">\n> **建议补充以下信息后重新生成:**")
                    for q in ask_user_prompts[:8]:
                        blocks.append(f"> - {q['question']}")
                blocks.append("\n---\n")
            for spec_local in INSIGHT_MODULES:
                ms_local = module_states.get(spec_local.key)
                if not ms_local or ms_local["status"] == "skipped" or ms_local["planner_status"] == "skipped":
                    continue
                blocks.append(f"\n## {spec_local.title}\n")
                content_local = module_contents.get(spec_local.key)
                if content_local:
                    blocks.append(content_local)
                else:
                    if ms_local["status"] == "failed":
                        blocks.append("> _本模块**执行失败**(可能是 LLM 超时 / 异常),建议重新生成_\n")
                    else:
                        miss = ", ".join(f["label"] for f in ms_local["missing_fields"]) or ms_local["reason"] or "未知"
                        blocks.append(f"> _本模块因信息不足未生成。缺失:{miss}_\n")
                if ms_local.get("score") and ms_local["score"]["overall"] != "pass":
                    issues_local = ms_local["score"].get("issues", [])
                    if issues_local:
                        blocks.append(f"\n> _Critic 提示:{'; '.join(issues_local[:3])}_\n")
                blocks.append("\n---")
            blocks.append("\n## 附录 · 运行报告\n")
            blocks.append(f"- 已激活模块:{len([m for m in plan.modules if m.status != 'skipped'])} / 总 {len(plan.modules)}")
            blocks.append(f"- KB 检索调用:{sum(len(v) for v in kb_refs.values())} 条 refs")
            blocks.append(f"- 待用户补充:{len(ask_user_prompts)} 项")
            if ctx["industry"] and ctx["industry"] == "manufacturing":
                blocks.append(f"- 行业包:smart_manufacturing 已激活")
            full = "\n".join(blocks)
            gloss = _build_glossary_appendix(full)
            if gloss:
                full += "\n\n" + gloss
            return full

        full_md = _assemble_full_md()

        # ── Phase 7 (新): 挑战循环 (最多 3 轮,只在 valid/partial 报告上跑,invalid 不挑) ──
        challenge_summary = await _run_challenge_loop(
            bundle_id=bundle_id,
            full_md_initial=full_md,
            module_contents=module_contents,
            ready_pairs=ready_pairs,
            ctx=ctx,
            kb_refs=kb_refs,
            m9_web_refs=m9_web_refs,
            assemble_fn=_assemble_full_md,
            run_history=run_history,
            skip_loop=(validity_status == "invalid"),
        )
        full_md = challenge_summary["final_md"]

        # v3.4:挑战循环结果反向影响 validity
        # 3 轮挑战后仍 major_issues / parse_failed → validity 降级为 partial
        # (告诉用户:报告出来了,但质量未通过最严格审核,需要人工 review)
        if validity_status == "valid":
            fv = challenge_summary["final_verdict"]
            if fv in ("major_issues", "parse_failed"):
                validity_status = "partial"
                logger.info("validity_downgraded_by_challenge",
                            bundle_id=bundle_id, final_verdict=fv,
                            issues_remaining=challenge_summary["issues_remaining"])

        # 写回 bundle
        await _update_progress(bundle_id, stage="finalizing", message="拼装最终报告并入库…")
        new_extra = dict(ctx["bundle_extra"])
        new_extra.update({
            "validity_status": validity_status,
            "module_states": module_states,
            "ask_user_prompts": ask_user_prompts,
            "run_history": run_history,
            "agentic_version": "v2",
            "provenance": provenance,            # v3:{module_key: {D1/K1/W1: meta}}
            "challenge_summary": {                # v3.1 挑战循环摘要(详情见 challenge_rounds 表)
                "rounds_total": challenge_summary["rounds_total"],
                "final_verdict": challenge_summary["final_verdict"],
                "issues_remaining": challenge_summary["issues_remaining"],
            },
            "web_search_status": m9_web_status,   # v3.4 M9 web 检索结果(供前端 banner 提示)
            "progress": {                          # 完成态:进度卡片显示完成
                "stage": "done",
                "message": "✓ 报告生成完成",
                "round_idx": None,
                "modules_in_flight": [],
                "updated_at": _ts(),
            },
        })
        await _mark(bundle_id, "done", content_md=full_md, extra=new_extra)
        await _mark_conv(bundle_id, "done")
        logger.info("insight_v2_generated", bundle_id=bundle_id, validity=validity_status,
                    modules_n=len(module_contents),
                    provenance_modules=len(provenance),
                    total_sources=sum(len(v) for v in provenance.values()))
    except Exception as e:
        logger.error("insight_v2_failed", bundle_id=bundle_id, error=str(e)[:300])
        run_history.append({"phase": "failed", "ts": _ts(), "detail": str(e)[:300]})
        try:
            async with async_session_maker() as s:
                b = await s.get(CuratedBundle, bundle_id)
                if b:
                    new_extra = dict(b.extra or {})
                    new_extra["run_history"] = run_history
                    new_extra["agentic_version"] = "v2"
                    b.extra = new_extra
                    b.status = "failed"
                    b.error = str(e)[:500]
                    await s.commit()
        except Exception as e2:
            logger.error("insight_v2_failed_writeback_failed", error=str(e2)[:200])
        await _mark_conv(bundle_id, "failed")


# ── Survey v2 入口 ─────────────────────────────────────────────────────────────

async def generate_survey_v2(bundle_id: str, project_id: str):
    """v2 入口 — 双层模块化问卷。"""
    run_history: list[dict] = []
    try:
        await _mark(bundle_id, "generating")
        run_history.append({"phase": "started", "ts": _ts()})

        ctx = await _load_ctx(bundle_id, project_id, "survey_v2")
        run_history.append({
            "phase": "ctx_loaded", "ts": _ts(),
            "detail": {"industry": ctx["industry"],
                       "transcript_len": len(ctx["transcript"]),
                       "brief_fields_n": len(ctx["brief_fields"])},
        })

        # ── Plan ──
        plan = plan_survey(
            industry=ctx["industry"],
            transcript_text=ctx["transcript"],
            brief_fields=ctx["brief_fields"],
        )
        run_history.append({
            "phase": "planned", "ts": _ts(),
            "detail": {"subsections_n": len(plan.subsections),
                       "already_covered": plan.already_covered,
                       "extra_seeds_n": len(plan.extra_seeds_from_pack)},
        })

        # ── Execute (并行所有 ready 分卷) ──
        # research v1:同时收集 markdown 文本 + 结构化 questionnaire_items
        async def _run_one_sub(sub_assessment):
            sub_spec = get_subsection(sub_assessment.key)
            if not sub_spec:
                return sub_assessment.key, {"markdown": "", "questionnaire_items": []}
            result = await execute_survey_subsection(
                subsection=sub_spec,
                project=ctx["project"], industry=ctx["industry"],
                transcript=ctx["transcript"],
                already_covered=plan.already_covered,
                extra_seeds_from_pack=plan.extra_seeds_from_pack,
                skill_text=ctx["skill_text"], agent_prompt=ctx["agent_prompt"],
                model=ctx["agent_model"],
                ltc_module_key=None,    # C.3 之后接入 sub→LTC 推断
                kb_inject_block="",      # C.3 之后接入 KB 二次过滤
            )
            return sub_assessment.key, result

        results = await asyncio.gather(
            *(_run_one_sub(s) for s in plan.subsections if s.status == "ready"),
            return_exceptions=True,
        )
        sub_contents: dict[str, str] = {}
        all_questionnaire_items: list[dict] = []   # research v1
        for r in results:
            if isinstance(r, Exception):
                logger.warning("survey_executor_exception", error=str(r)[:200])
                continue
            sk, payload = r
            if isinstance(payload, dict):
                sub_contents[sk] = payload.get("markdown") or ""
                items = payload.get("questionnaire_items") or []
                if items:
                    all_questionnaire_items.extend(items)
            else:
                # 防御性:旧路径返回纯 str 时也兼容
                sub_contents[sk] = payload or ""
        run_history.append({
            "phase": "executed", "ts": _ts(),
            "detail": {"completed": list(sub_contents.keys())},
        })

        # ── Critic ──
        critic_inputs = [
            (sk, content, plan.already_covered) for sk, content in sub_contents.items()
        ]
        scores: dict[str, SubsectionScore] = await critique_subsections(
            critic_inputs, model=ctx["agent_model"],
        )
        run_history.append({
            "phase": "critiqued", "ts": _ts(),
            "detail": {sk: s.overall for sk, s in scores.items()},
        })

        # ── 组装 ──
        sub_states: dict[str, dict] = {}
        for assess in plan.subsections:
            score = scores.get(assess.key)
            sub_status = "done"
            if assess.status == "skipped":
                sub_status = "skipped"
            elif assess.key not in sub_contents:
                sub_status = "failed"
            elif score:
                if score.overall == "pass":
                    sub_status = "done"
                elif score.overall == "needs_rework":
                    sub_status = "done_with_warnings"
                elif score.overall == "insufficient":
                    sub_status = "insufficient"
            sub_states[assess.key] = {
                "key": assess.key,
                "title": assess.title,
                "layer": assess.layer,
                "target_roles": assess.target_roles,
                "status": sub_status,
                "score": score.to_dict() if score else None,
            }

        # validity:L1 全部 done + L2 至少一半 done
        l1_states = [s for s in sub_states.values() if s["layer"] == "L1"]
        l2_states = [s for s in sub_states.values() if s["layer"] == "L2"]
        l1_ok = all(s["status"] in ("done", "done_with_warnings") for s in l1_states) if l1_states else True
        l2_ok = (sum(1 for s in l2_states if s["status"] in ("done", "done_with_warnings"))
                 >= max(1, len(l2_states) // 2)) if l2_states else True
        validity_status = "valid" if (l1_ok and l2_ok) else ("partial" if l1_ok or l2_ok else "invalid")

        # 拼 markdown
        proj = ctx["project"]
        title_main = proj.name if proj else (ctx["industry"] or "—")
        md_blocks = [f"# {title_main} · 实施前调研问卷 v2 (agentic)\n"]
        md_blocks.append(f"**生成日期**:{date.today().strftime('%Y年%m月%d日')}  ")
        md_blocks.append(f"**客户**:{(proj.customer if proj else '—') or '—'}  ")
        md_blocks.append(f"**行业**:{ctx['industry'] or '—'}  ")
        md_blocks.append(f"**Validity**:{validity_status}\n")
        md_blocks.append("\n本问卷采用 **双层结构**:")
        md_blocks.append("- **L1 — 高管短卷(≤10 分钟)**:战略与痛点对齐")
        md_blocks.append("- **L2 — 模块化分卷**:按业务模块拆分,各模块责任人分别填\n")

        # L1 在前
        if l1_states:
            md_blocks.append("\n---\n")
            md_blocks.append("# Layer 1 — 高管短卷\n")
            for assess in plan.subsections:
                if assess.layer != "L1" or assess.key not in sub_contents:
                    continue
                md_blocks.append(f"\n## {assess.title}\n")
                md_blocks.append(f"_目标受众:{' / '.join(assess.target_roles)}_\n")
                md_blocks.append(sub_contents[assess.key])

        # L2 按 theme 分组
        if l2_states:
            md_blocks.append("\n---\n")
            md_blocks.append("# Layer 2 — 模块化分卷\n")
            from .survey_modules import SURVEY_THEMES
            for theme in SURVEY_THEMES:
                theme_subs = [a for a in plan.subsections
                              if a.layer == "L2" and a.key in [sub.key for sub in theme.subsections]
                              and a.key in sub_contents]
                if not theme_subs:
                    continue
                md_blocks.append(f"\n## 主题 · {theme.title}\n")
                md_blocks.append(f"_{theme.purpose}_\n")
                for assess in theme_subs:
                    md_blocks.append(f"\n### {assess.title}\n")
                    md_blocks.append(f"_目标受众:{' / '.join(assess.target_roles)}_\n")
                    md_blocks.append(sub_contents[assess.key])

        # 尾
        md_blocks.append("\n---\n## 附录 · 运行报告\n")
        md_blocks.append(f"- 分卷总数:{len(sub_states)}(已生成 {len(sub_contents)})")
        md_blocks.append(f"- 已覆盖话题(去重):{', '.join(plan.already_covered) or '无'}")
        md_blocks.append(f"- 行业包种子注入:{len(plan.extra_seeds_from_pack)} 条")
        full_md = "\n".join(md_blocks)
        glossary = _build_glossary_appendix(full_md)
        if glossary: full_md += "\n\n" + glossary

        # 生成 docx(复用 v1 的 _build_docx)
        docx_key: str | None = None
        try:
            from services.output_service import _build_docx, _minio_put
            title_doc = f"调研问卷 v2 · {title_main}"
            docx_bytes = _build_docx(title_doc, full_md)
            docx_key = f"outputs/{bundle_id}/survey_v2.docx"
            _minio_put(docx_key, docx_bytes,
                       "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        except Exception as e:
            logger.warning("survey_v2_docx_failed", error=str(e)[:120])

        new_extra = dict(ctx["bundle_extra"])
        new_extra.update({
            "validity_status": validity_status,
            "module_states": sub_states,    # 复用同一个字段名(前端通用)
            "ask_user_prompts": [],         # survey 暂不输出 ask_user
            "run_history": run_history,
            "agentic_version": "v2",
            "already_covered": plan.already_covered,
            "questionnaire_items": all_questionnaire_items,   # research v1 — 顾问录入工作区消费
        })
        await _mark(bundle_id, "done", content_md=full_md, file_key=docx_key, extra=new_extra)
        await _mark_conv(bundle_id, "done")
        logger.info("survey_v2_generated", bundle_id=bundle_id, validity=validity_status,
                    subsections_n=len(sub_contents),
                    questionnaire_items_n=len(all_questionnaire_items))
    except Exception as e:
        logger.error("survey_v2_failed", bundle_id=bundle_id, error=str(e)[:300])
        run_history.append({"phase": "failed", "ts": _ts(), "detail": str(e)[:300]})
        try:
            async with async_session_maker() as s:
                b = await s.get(CuratedBundle, bundle_id)
                if b:
                    new_extra = dict(b.extra or {})
                    new_extra["run_history"] = run_history
                    new_extra["agentic_version"] = "v2"
                    b.extra = new_extra
                    b.status = "failed"
                    b.error = str(e)[:500]
                    await s.commit()
        except Exception as e2:
            logger.error("survey_v2_failed_writeback_failed", error=str(e2)[:200])
        await _mark_conv(bundle_id, "failed")


# ── Outline v2 入口(survey_outline_v2)─────────────────────────────────────────

async def generate_outline_v2(bundle_id: str, project_id: str):
    """调研大纲 v2 入口 — 与 insight_v2 同结构,只换模块清单。

    7 个模块 (M1-M7),核心是 M3 调研日程表(9 列表格)。
    行业差异化通过 industry_pack.default_sessions / must_visit_departments / typical_customer_materials 注入。
    """
    from .outline_modules import OUTLINE_MODULES, get_outline_module
    from .industry_packs import get_pack

    run_history: list[dict] = []
    try:
        await _mark(bundle_id, "generating")
        run_history.append({"phase": "started", "ts": _ts()})

        # ── Phase 1: ctx ──
        ctx = await _load_ctx(bundle_id, project_id, "survey_outline_v2")
        run_history.append({
            "phase": "ctx_loaded", "ts": _ts(),
            "detail": {
                "industry": ctx["industry"],
                "transcript_len": len(ctx["transcript"]),
                "brief_fields_n": len(ctx["brief_fields"]),
            },
        })

        # ── Phase 1.5: SOW → LTC 字典 同义词归一(research v1 增量) ──
        # 失败不阻断主流程 — markdown 里只是少一段 LTC 章节
        ltc_map_items: list[dict] = []
        try:
            from .research.sow_mapper import map_sow_to_ltc
            ltc_map_items = await map_sow_to_ltc(
                project_id=project_id,
                docs_by_type=ctx.get("docs_by_type") or {},
                model=ctx["agent_model"],
            )
            run_history.append({
                "phase": "ltc_mapped", "ts": _ts(),
                "detail": {"items_n": len(ltc_map_items),
                           "extra_n": sum(1 for r in ltc_map_items if r.get("is_extra"))},
            })
        except Exception as e:
            logger.warning("outline_ltc_map_failed", error=str(e)[:200])

        # ── Phase 2: Planner(outline 7 个模块全部激活) ──
        from .planner import plan_outline, fill_kb_gaps
        plan = plan_outline(
            project=ctx["project"], industry=ctx["industry"],
            brief_fields=ctx["brief_fields"],
            has_conversation=bool(ctx["transcript"]) and ctx["transcript"] != "(没有可用的访谈记录)",
        )
        run_history.append({
            "phase": "planned", "ts": _ts(),
            "detail": {
                "ready": [m.key for m in plan.modules if m.status == "ready"],
                "blocked": [m.key for m in plan.modules if m.status == "blocked"],
                "gaps_n": len(plan.gap_actions),
                "sufficient_critical": plan.sufficient_critical,
            },
        })

        # ── 拦截:关键模块信息不足 → 不跑 Executor / Critic ──
        if not plan.sufficient_critical:
            await _short_circuit_invalid(
                bundle_id=bundle_id, project_id=project_id, kind_label="调研大纲",
                ctx=ctx, plan=plan, run_history=run_history,
            )
            return

        # ── Phase 3: Gap Fill(outline 大多 downgrade,KB 检索极少) ──
        kb_refs = await fill_kb_gaps(plan, project_id=project_id, industry=ctx["industry"])

        # ── Phase 4: Executor(并行) ──
        ready_modules = [m for m in plan.modules if m.status == "ready"]
        ready_pairs = []
        for spec in OUTLINE_MODULES:
            for assess in ready_modules:
                if assess.key == spec.key:
                    ready_pairs.append((spec, assess))
                    break

        # 给 executor 注入行业包的"必访部门 + 默认 sessions + 客户材料模板"
        # 我们把这些作为 agent_prompt 的"行业上下文"补丁,Executor 会渲染到 evidence_block
        pack = get_pack(ctx["industry"])
        industry_outline_brief = ""
        if pack and (pack.must_visit_departments or pack.default_sessions or pack.typical_customer_materials):
            parts = [f"### 行业大纲补丁:{pack.display_name}"]
            if pack.must_visit_departments:
                parts.append("**典型必访部门(若 brief.in_scope_departments 没列全,优先补充以下):**")
                parts.extend(f"- {d}" for d in pack.must_visit_departments)
            if pack.default_sessions:
                parts.append("\n**行业典型 sessions(给 M3 日程表参考,挑相关的纳入):**")
                for s in pack.default_sessions[:14]:
                    parts.append(f"- 议题:{s['topic']} · 方法:{s['method']} · 对象:{s['target']} · 时长:{s['duration']}")
            if pack.typical_customer_materials:
                parts.append("\n**行业典型客户准备材料(给 M4 清单参考):**")
                for cat in pack.typical_customer_materials:
                    parts.append(f"- {cat['category']}:{', '.join(cat['items'])}")
            industry_outline_brief = "\n".join(parts)

        # 拼接到原 agent_prompt 后面(如果 brief 字段也含,LLM 会 cross-check)
        enhanced_agent_prompt = (ctx["agent_prompt"] or "")
        if industry_outline_brief:
            enhanced_agent_prompt = (enhanced_agent_prompt + "\n\n" if enhanced_agent_prompt else "") + industry_outline_brief

        async def _run_one(spec, assess):
            from .executor import execute_insight_module  # 模块化报告流程通用
            content = await execute_insight_module(
                module=spec, assessment=assess,
                project=ctx["project"], industry=ctx["industry"],
                transcript=ctx["transcript"], refs=ctx["refs_raw"],
                extra_kb_refs=kb_refs,
                skill_text=ctx["skill_text"], agent_prompt=enhanced_agent_prompt,
                model=ctx["agent_model"],
            )
            return spec.key, content

        results = await asyncio.gather(*(_run_one(s, a) for s, a in ready_pairs), return_exceptions=True)
        module_contents: dict[str, str] = {}
        for r in results:
            if isinstance(r, Exception):
                logger.warning("outline_executor_exception", error=str(r)[:200])
                continue
            mk, content = r
            module_contents[mk] = content
        run_history.append({
            "phase": "executed", "ts": _ts(),
            "detail": {"completed": list(module_contents.keys())},
        })

        # ── Phase 5: Critic(复用 critique_modules) ──
        from .critic import critique_modules
        scores = await critique_modules(list(module_contents.items()), model=ctx["agent_model"])
        run_history.append({
            "phase": "critiqued", "ts": _ts(),
            "detail": {mk: s.overall for mk, s in scores.items()},
        })

        # ── Phase 6: 组装 + Validity ──
        module_states: dict[str, dict] = {}
        for assess in plan.modules:
            score = scores.get(assess.key)
            mod_status = assess.status
            if assess.status == "ready":
                if assess.key in module_contents:
                    if score:
                        if score.overall == "pass":
                            mod_status = "done"
                        elif score.overall == "needs_rework":
                            mod_status = "done_with_warnings"
                        elif score.overall == "insufficient":
                            mod_status = "insufficient"
                    else:
                        mod_status = "done"
                else:
                    # planner 标 ready 但 executor 没产出 → 执行失败
                    mod_status = "failed"
            module_states[assess.key] = {
                "key": assess.key,
                "title": assess.title,
                "necessity": assess.necessity,
                "status": mod_status,
                "planner_status": assess.status,
                "score": score.to_dict() if score else None,
                "missing_fields": [
                    {"key": fk, "label": fs.label, "note": fs.note}
                    for fk, fs in assess.fields.items() if fs.status == "missing"
                ],
                "reason": assess.reason,
            }

        critical_states = [
            ms for ms in module_states.values()
            if ms["necessity"] == "critical" and ms["status"] != "skipped"
        ]
        critical_bad = [ms for ms in critical_states
                        if ms["status"] in ("blocked", "insufficient") or ms["planner_status"] == "blocked"]
        critical_warn = [ms for ms in critical_states if ms["status"] == "done_with_warnings"]
        if critical_bad:
            validity_status = "invalid"
        elif critical_warn:
            validity_status = "partial"
        else:
            validity_status = "valid"

        ask_user_prompts = [
            {"module_key": g.module_key, "field_key": g.field_key, "question": g.detail}
            for g in plan.gap_actions if g.action == "ask_user"
        ]

        # 拼装 markdown
        proj = ctx["project"]
        title_main = proj.name if proj else (ctx["industry"] or "—")
        md_blocks = [f"# {title_main} · 调研大纲 v2 (agentic)\n"]
        md_blocks.append(f"**生成日期**:{date.today().strftime('%Y年%m月%d日')}  ")
        md_blocks.append(f"**客户**:{(proj.customer if proj else '—') or '—'}  ")
        md_blocks.append(f"**行业**:{ctx['industry'] or '—'}  ")
        md_blocks.append(f"**Validity**:{validity_status}\n")
        md_blocks.append("\n本份大纲是「调研问卷」的上游交付物 — 先定调研场次和议题,再用「调研问卷」生成对应分卷给责任人。\n")

        if validity_status == "invalid":
            md_blocks.append("---\n")
            md_blocks.append("> ⚠️ **本份大纲判定为「信息不足」(invalid)**\n>")
            md_blocks.append("> 以下关键模块因关键字段缺失,未能完整生成:")
            for ms in critical_bad:
                missing = ", ".join(f["label"] for f in ms["missing_fields"]) or ms["reason"]
                md_blocks.append(f"> - **{ms['title']}**:{missing}")
            if ask_user_prompts:
                md_blocks.append(">\n> **建议补充以下信息后重新生成:**")
                for q in ask_user_prompts[:8]:
                    md_blocks.append(f"> - {q['question']}")
            md_blocks.append("\n---\n")

        for spec in OUTLINE_MODULES:
            ms = module_states.get(spec.key)
            if not ms or ms["status"] == "skipped":
                continue
            md_blocks.append(f"\n## {spec.title}\n")
            content = module_contents.get(spec.key)
            if content:
                md_blocks.append(content)
            else:
                if ms["status"] == "failed":
                    md_blocks.append("> _本模块**执行失败**(可能是 LLM 超时 / 异常),建议重新生成_\n")
                else:
                    missing = ", ".join(f["label"] for f in ms["missing_fields"]) or ms["reason"] or "未知"
                    md_blocks.append(f"> _本模块因信息不足未生成。缺失:{missing}_\n")
            if ms.get("score") and ms["score"]["overall"] != "pass":
                issues = ms["score"].get("issues", [])
                if issues:
                    md_blocks.append(f"\n> _Critic 提示:{'; '.join(issues[:3])}_\n")
            md_blocks.append("\n---")

        # ── 追加:按 LTC 流程组织的调研主题(research v1 增量) ──
        if ltc_map_items:
            md_blocks.append("\n## 附录 · 按 LTC 流程组织的调研主题\n")
            md_blocks.append("_来源:SOW / 系统集成 / 售前材料 抽取 + 同义词归一_\n")
            from .research.sow_mapper import aggregate_by_ltc_key
            from .research.ltc_dictionary import get_module
            agg = aggregate_by_ltc_key(ltc_map_items)
            extras = agg.pop("__extra__", [])
            md_blocks.append("\n| LTC 模块 | 客户原文称呼 | 标准节点 |")
            md_blocks.append("|---|---|---|")
            for ltc_key, terms in agg.items():
                m = get_module(ltc_key)
                if not m:
                    continue
                terms_str = "、".join(terms[:5]) + (f" 等 {len(terms)} 项" if len(terms) > 5 else "")
                nodes_str = " → ".join(m.standard_nodes[:5])
                md_blocks.append(f"| {m.label} ({m.key}) | {terms_str} | {nodes_str} |")
            if extras:
                md_blocks.append("\n**SOW 中超出 LTC 字典的模块(待评估):** " +
                                 "、".join(extras[:10]) +
                                 (f" 等 {len(extras)} 项" if len(extras) > 10 else ""))

        md_blocks.append("\n## 附录 · 运行报告\n")
        md_blocks.append(f"- 已生成模块:{len(module_contents)} / 总 {len(plan.modules)}")
        md_blocks.append(f"- 待用户补充:{len(ask_user_prompts)} 项")
        if ltc_map_items:
            md_blocks.append(f"- LTC 模块映射:已识别 {len(ltc_map_items)} 项,其中 extra {sum(1 for r in ltc_map_items if r.get('is_extra'))} 项")
        if pack:
            md_blocks.append(f"- 行业包:{pack.industry} 已激活(注入 {len(pack.must_visit_departments)} 必访部门 + {len(pack.default_sessions)} 默认 sessions)")
        full_md = "\n".join(md_blocks)
        glossary = _build_glossary_appendix(full_md)
        if glossary: full_md += "\n\n" + glossary

        # 生成 docx(复用 v1 工具)
        docx_key: str | None = None
        try:
            from services.output_service import _build_docx, _minio_put
            docx_bytes = _build_docx(f"调研大纲 v2 · {title_main}", full_md)
            docx_key = f"outputs/{bundle_id}/survey_outline_v2.docx"
            _minio_put(docx_key, docx_bytes,
                       "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        except Exception as e:
            logger.warning("outline_v2_docx_failed", error=str(e)[:120])

        new_extra = dict(ctx["bundle_extra"])
        new_extra.update({
            "validity_status": validity_status,
            "module_states": module_states,
            "ask_user_prompts": ask_user_prompts,
            "run_history": run_history,
            "agentic_version": "v2",
            "ltc_module_map": ltc_map_items,    # research v1 — 前端工作区消费
        })
        await _mark(bundle_id, "done", content_md=full_md, file_key=docx_key, extra=new_extra)
        await _mark_conv(bundle_id, "done")
        logger.info("outline_v2_generated", bundle_id=bundle_id, validity=validity_status,
                    modules_n=len(module_contents))
    except Exception as e:
        logger.error("outline_v2_failed", bundle_id=bundle_id, error=str(e)[:300])
        run_history.append({"phase": "failed", "ts": _ts(), "detail": str(e)[:300]})
        try:
            async with async_session_maker() as s:
                b = await s.get(CuratedBundle, bundle_id)
                if b:
                    new_extra = dict(b.extra or {})
                    new_extra["run_history"] = run_history
                    new_extra["agentic_version"] = "v2"
                    b.extra = new_extra
                    b.status = "failed"
                    b.error = str(e)[:500]
                    await s.commit()
        except Exception as e2:
            logger.error("outline_v2_failed_writeback_failed", error=str(e2)[:200])
        await _mark_conv(bundle_id, "failed")
