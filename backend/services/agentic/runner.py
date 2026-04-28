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

logger = structlog.get_logger()


# ── 共享:加载 ctx ─────────────────────────────────────────────────────────────

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
    }


async def _mark(bundle_id: str, status: str, **kwargs):
    from services.output_service import _mark_bundle
    await _mark_bundle(bundle_id, status, **kwargs)


async def _mark_conv(bundle_id: str, status: str):
    from services.output_service import _mark_conversation
    await _mark_conversation(bundle_id, status)


def _ts() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


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

        # ── Phase 2: Planner ──
        plan = plan_insight(
            project=ctx["project"],
            industry=ctx["industry"],
            brief_fields=ctx["brief_fields"],
            has_conversation=bool(ctx["transcript"]) and ctx["transcript"] != "（没有可用的访谈记录）",
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
        kb_refs = await fill_kb_gaps(plan, project_id=project_id, industry=ctx["industry"])
        run_history.append({
            "phase": "gaps_filled", "ts": _ts(),
            "detail": {fk: len(rl) for fk, rl in kb_refs.items()},
        })

        # ── Phase 4: Executor (并行) ──
        ready_modules = [m for m in plan.modules if m.status == "ready"]
        # 同步 module_spec 与 assessment(顺序保留 INSIGHT_MODULES 的逻辑顺序)
        ready_pairs = []
        for spec in INSIGHT_MODULES:
            for assess in ready_modules:
                if assess.key == spec.key:
                    ready_pairs.append((spec, assess))
                    break

        async def _run_one(spec, assess):
            content = await execute_insight_module(
                module=spec, assessment=assess,
                project=ctx["project"], industry=ctx["industry"],
                transcript=ctx["transcript"], refs=ctx["refs_raw"],
                extra_kb_refs=kb_refs,
                skill_text=ctx["skill_text"], agent_prompt=ctx["agent_prompt"],
                model=ctx["agent_model"],
            )
            return spec.key, content

        results = await asyncio.gather(*(_run_one(s, a) for s, a in ready_pairs), return_exceptions=True)
        module_contents: dict[str, str] = {}
        for r in results:
            if isinstance(r, Exception):
                logger.warning("executor_exception", error=str(r)[:200])
                continue
            mk, content = r
            module_contents[mk] = content
        run_history.append({
            "phase": "executed", "ts": _ts(),
            "detail": {"completed": list(module_contents.keys())},
        })

        # ── Phase 5: Critic ──
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

        # 拼装最终 markdown
        proj = ctx["project"]
        title_main = proj.name if proj else (ctx["industry"] or "—")
        md_blocks = []
        # 头
        md_blocks.append(f"# {title_main} · 项目洞察报告 v2 (agentic)\n")
        md_blocks.append(f"**生成日期**:{date.today().strftime('%Y年%m月%d日')}  ")
        md_blocks.append(f"**客户**:{(proj.customer if proj else '—') or '—'}  ")
        md_blocks.append(f"**行业**:{ctx['industry'] or '—'}  ")
        md_blocks.append(f"**Validity**:{validity_status}\n")

        # invalid 提示
        if validity_status == "invalid":
            md_blocks.append("---\n")
            md_blocks.append("> ⚠️ **本份报告判定为「信息不足」(invalid)**\n>")
            md_blocks.append("> 以下关键模块因关键字段缺失,未能完整生成:")
            for ms in critical_bad:
                missing = ", ".join(f["label"] for f in ms["missing_fields"]) or ms["reason"]
                md_blocks.append(f"> - **{ms['title']}**:{missing}")
            if ask_user_prompts:
                md_blocks.append(">\n> **建议补充以下信息后重新生成:**")
                for q in ask_user_prompts[:8]:
                    md_blocks.append(f"> - {q['question']}")
            md_blocks.append("\n---\n")

        # 各模块按 INSIGHT_MODULES 原始顺序输出
        for spec in INSIGHT_MODULES:
            ms = module_states.get(spec.key)
            if not ms or ms["status"] == "skipped" or ms["planner_status"] == "skipped":
                continue
            md_blocks.append(f"\n## {spec.title}\n")
            content = module_contents.get(spec.key)
            if content:
                md_blocks.append(content)
            else:
                # 区分:执行失败 vs 信息不足(planner 阶段就 blocked)vs 未运行
                if ms["status"] == "failed":
                    md_blocks.append("> _本模块**执行失败**(可能是 LLM 超时 / 异常),建议重新生成_\n")
                else:
                    missing = ", ".join(f["label"] for f in ms["missing_fields"]) or ms["reason"] or "未知"
                    md_blocks.append(f"> _本模块因信息不足未生成。缺失:{missing}_\n")
            # critic 提示(如有警告)
            if ms.get("score") and ms["score"]["overall"] != "pass":
                issues = ms["score"].get("issues", [])
                if issues:
                    md_blocks.append(f"\n> _Critic 提示:{'; '.join(issues[:3])}_\n")
            md_blocks.append("\n---")

        # 尾:运行报告(可观测)
        md_blocks.append("\n## 附录 · 运行报告\n")
        md_blocks.append(f"- 已激活模块:{len([m for m in plan.modules if m.status != 'skipped'])} / 总 {len(plan.modules)}")
        md_blocks.append(f"- KB 检索调用:{sum(len(v) for v in kb_refs.values())} 条 refs")
        md_blocks.append(f"- 待用户补充:{len(ask_user_prompts)} 项")
        if ctx["industry"] and ctx["industry"] == "manufacturing":
            md_blocks.append(f"- 行业包:smart_manufacturing 已激活")

        full_md = "\n".join(md_blocks)

        # 写回 bundle
        new_extra = dict(ctx["bundle_extra"])
        new_extra.update({
            "validity_status": validity_status,
            "module_states": module_states,
            "ask_user_prompts": ask_user_prompts,
            "run_history": run_history,
            "agentic_version": "v2",
        })
        await _mark(bundle_id, "done", content_md=full_md, extra=new_extra)
        await _mark_conv(bundle_id, "done")
        logger.info("insight_v2_generated", bundle_id=bundle_id, validity=validity_status,
                    modules_n=len(module_contents))
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
        async def _run_one_sub(sub_assessment):
            sub_spec = get_subsection(sub_assessment.key)
            if not sub_spec:
                return sub_assessment.key, ""
            content = await execute_survey_subsection(
                subsection=sub_spec,
                project=ctx["project"], industry=ctx["industry"],
                transcript=ctx["transcript"],
                already_covered=plan.already_covered,
                extra_seeds_from_pack=plan.extra_seeds_from_pack,
                skill_text=ctx["skill_text"], agent_prompt=ctx["agent_prompt"],
                model=ctx["agent_model"],
            )
            return sub_assessment.key, content

        results = await asyncio.gather(
            *(_run_one_sub(s) for s in plan.subsections if s.status == "ready"),
            return_exceptions=True,
        )
        sub_contents: dict[str, str] = {}
        for r in results:
            if isinstance(r, Exception):
                logger.warning("survey_executor_exception", error=str(r)[:200])
                continue
            sk, content = r
            sub_contents[sk] = content
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
        })
        await _mark(bundle_id, "done", content_md=full_md, file_key=docx_key, extra=new_extra)
        await _mark_conv(bundle_id, "done")
        logger.info("survey_v2_generated", bundle_id=bundle_id, validity=validity_status,
                    subsections_n=len(sub_contents))
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

        md_blocks.append("\n## 附录 · 运行报告\n")
        md_blocks.append(f"- 已生成模块:{len(module_contents)} / 总 {len(plan.modules)}")
        md_blocks.append(f"- 待用户补充:{len(ask_user_prompts)} 项")
        if pack:
            md_blocks.append(f"- 行业包:{pack.industry} 已激活(注入 {len(pack.must_visit_departments)} 必访部门 + {len(pack.default_sessions)} 默认 sessions)")
        full_md = "\n".join(md_blocks)

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
