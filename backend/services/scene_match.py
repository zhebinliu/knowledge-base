"""场景命中判定 — 用 LLM 把一个项目对照「标准场景库」逐条判命中 / 未命中。

定位:Harness 场景命中(P3)的核心服务。读标准场景库(表 `standard_scenes`,约 147 条 active Core 场景)
+ 项目【范围证据】:合同/SOW(界定范围)+ 会议纪要(真实调研),判每个标准场景 in-scope / not。
不用下游产物(蓝图/洞察/调研报告)—— 那是命中的结果,拿来当依据会循环论证、且过全导致整域误命中。

对外只暴露一个入口:

    async def match_project_scenes(project_id: str, session: AsyncSession) -> dict

返回:
    {
        "hit":        [{"domain","code","name"}, ...],   # 命中场景
        "miss":       [{"domain","code","name"}, ...],   # 未命中场景
        "hit_count":  int,
        "miss_count": int,
        "summary":    str,                                # LLM 给的一句整体结论
        "report_md":  str,                                # 分 domain 呈现的 Markdown 报告
    }

设计要点:
- 场景库紧凑喂给 LLM(每条只给 domain / code / name),约 147 条不占多少 token。
- 两段判定:① 文档基线(合同/SOW + 元信息)一次判定得初始命中集(t=0);
  ② 会议逐场判「场景增量」{in_scope, out_of_scope},并发检测、再按时间从旧到新折叠
  (并集纳入、差集剔除),晚会可取消早会的场景。单场聚焦更准、小 prompt 不截断。
- LLM 只回「命中的场景 code 列表」+ 一句 summary(严格 JSON),未列出的即判未命中 ——
  比让模型逐条回 147 个 verdict 更省 token、更抗截断。
- 解析健壮:复用全后端共享的 services.llm_json.loads_lenient(去围栏 / 注释 / 尾随逗号 / 最长平衡块兜底)。
- 防御:项目无任何素材时,直接返回全部 miss + summary 说明「材料不足,无法判定」,不空跑 LLM。
"""
from __future__ import annotations

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.project import Project
from models.scene import StandardScene
from models.document import Document
from models.meeting import Meeting
from services.model_router import model_router

logger = structlog.get_logger()

# ── 常量 ────────────────────────────────────────────────────────────────
_MAX_CHARS_PER_MEETING = 3500  # 逐场判增量时,单场会议纪要喂给 LLM 的字符上限
_MAX_MEETINGS = 30            # 参与折叠的会议上限(按时间全量折叠,一般项目远小于此)
_MODEL_TASK = "scene_match"    # model_router 路由 task 名
_MATCH_CHUNK = 30              # 每批判定的场景数(避免一次判 147 个导致输出截断)


# ── 工具:健壮 JSON 解析 ─────────────────────────────────────────────────

def _json_valid(content: str | None, finish_reason: str | None) -> bool:
    """chat_with_routing 校验器:截断(finish_reason='length')或解析不出 dict 都算失败,触发回退。"""
    from services.llm_json import loads_lenient
    if finish_reason == "length":
        return False
    return isinstance(loads_lenient(content or "", None), dict)


# ── 素材拼装 ─────────────────────────────────────────────────────────────

def _build_project_meta(project: Project | None) -> str:
    """把项目元信息拼成一段紧凑文本。project 为 None 时返回空串。"""
    if project is None:
        return ""
    modules = project.modules
    if isinstance(modules, (list, tuple)):
        modules_txt = "、".join(str(m) for m in modules if m) or "未指定"
    else:
        modules_txt = str(modules) if modules else "未指定"
    lines = [
        f"项目名称:{project.name or '未命名'}",
        f"客户:{project.customer or '未指定'}",
        f"行业:{project.industry or '未指定'}",
        f"涉及模块:{modules_txt}",
    ]
    if (project.description or "").strip():
        lines.append(f"项目描述:{project.description.strip()}")
    if (project.customer_profile or "").strip():
        lines.append(f"客户画像:{project.customer_profile.strip()}")
    return "\n".join(lines)


def _minutes_text_leaves(obj, out: list[str], budget: int = 8000) -> None:
    """递归抽取 minutes 结构里的所有文本叶子(丢掉 JSON 键/括号/嵌套开销),供紧凑渲染。"""
    if sum(len(x) for x in out) > budget:
        return
    if isinstance(obj, str):
        t = obj.strip()
        if t:
            out.append(t)
    elif isinstance(obj, dict):
        for v in obj.values():
            _minutes_text_leaves(v, out, budget)
    elif isinstance(obj, list):
        for v in obj:
            _minutes_text_leaves(v, out, budget)


def _render_minutes(minutes) -> str:
    """会议纪要 JSON → 紧凑纯文本(只留文本叶子,去掉 json.dumps 的键/括号开销,大幅省 token)。"""
    if not isinstance(minutes, dict):
        return ""
    out: list[str] = []
    _minutes_text_leaves(minutes, out)
    return " / ".join(out)


def _resolve_one(h, scene_index: dict, code_only_index: dict) -> tuple[str, str] | None:
    """把 LLM 回的一条命中(dict{domain,code} 或 'LTC/LM-01' 字符串)解析成场景库 key。查无 → None。"""
    domain_v = code_v = ""
    if isinstance(h, dict):
        domain_v = str(h.get("domain") or "").strip()
        code_v = str(h.get("code") or "").strip()
    elif isinstance(h, str):
        token = h.strip()
        for sep in ("/", "::", "|", " "):
            if sep in token:
                domain_v, _, code_v = token.partition(sep)
                break
        else:
            code_v = token
    code_u, domain_u = code_v.strip().upper(), domain_v.strip().upper()
    if not code_u:
        return None
    if (domain_u, code_u) in scene_index:
        return (domain_u, code_u)
    if code_u in code_only_index:  # domain 对不上时按 code 兜底
        it = code_only_index[code_u]
        return (it["domain"].strip().upper(), it["code"].strip().upper())
    return None


def _resolve_codes(lst, scene_index: dict, code_only_index: dict) -> set:
    out: set = set()
    if isinstance(lst, list):
        for h in lst:
            k = _resolve_one(h, scene_index, code_only_index)
            if k:
                out.add(k)
    return out


# 逐场会议判「场景增量」的 system prompt —— 只标本场明确定性的,治「松」;区分纳入/取消,治「时序」
_MEETING_DELTA_SYSTEM = (
    "你是纷享销客 CRM 实施资深顾问。下面给你【标准场景库】和【某一场会议的纪要】。\n"
    "场景库是【细粒度】的:一个大域下有几十个细分场景,每个对应一个具体业务动作。\n"
    "判断这一场会议给项目业务范围带来的【场景增量】,分两类:\n"
    "- in_scope:本场会议中,客户明确讨论并确认【要做 / 已在做 / 纳入本次 CRM 项目】的【具体】业务,对应命中的细分场景。\n"
    "- out_of_scope:本场会议中,客户明确表示【不做 / 取消 / 本期不上 / 移出本次范围】的业务,对应要剔除的细分场景。\n"
    "严格要求:\n"
    "1. 逐个场景独立判断,要有【针对该细分场景本身】的明确对话依据;仅提到所属大域、一带而过、举例、背景介绍、别项目的事,都不算。\n"
    "2. 【严禁整域命中】:不能因为本场聊了某个大域,就把该域下一片场景都放进 in_scope。单场会议通常只明确定性少数几个场景。\n"
    "3. 宁缺毋滥:拿不准就 in/out 都不放。\n"
    "4. 只能用场景库里给出的 code。\n"
    "5. 严格输出 JSON,不要解释、不要代码围栏。"
)


async def _detect_meeting_delta(
    meeting: Meeting, catalog: str, scene_index: dict, code_only_index: dict, project_id: str,
) -> tuple[set, set, bool]:
    """单场会议 → (纳入场景 keys, 剔除场景 keys, 是否有信号)。聚焦单场,更准且不截断。"""
    from services.llm_json import loads_lenient
    body = _render_minutes(meeting.edited_minutes or meeting.meeting_minutes)
    if not body.strip():
        body = (meeting.polished_transcript or meeting.raw_transcript or "").strip()
    if not body.strip():
        return set(), set(), False
    body = body[:_MAX_CHARS_PER_MEETING]
    user = (
        "【标准场景库】\n" + catalog
        + f"\n\n【本场会议纪要 · {meeting.title or '未命名会议'}】\n" + body
        + '\n\n【输出 — 严格 JSON】\n{"in_scope": ["LM-01"], "out_of_scope": []}\n'
        "in_scope=本场明确纳入的场景 code;out_of_scope=本场明确取消/不做的场景 code;都用场景库原 code,没有就给空数组。"
    )
    for attempt in (1, 2):
        try:
            content, _m = await model_router.chat_with_routing(
                task=_MODEL_TASK,
                messages=[{"role": "system", "content": _MEETING_DELTA_SYSTEM},
                          {"role": "user", "content": user}],
                temperature=0.1, max_tokens=2000, validator=_json_valid,
            )
            parsed = loads_lenient(content or "", None)
            if isinstance(parsed, dict):
                in_keys = _resolve_codes(parsed.get("in_scope"), scene_index, code_only_index)
                out_keys = _resolve_codes(parsed.get("out_of_scope"), scene_index, code_only_index)
                return in_keys, out_keys, True
        except Exception as e:  # noqa: BLE001
            logger.warning("scene_meeting_delta_fail", project_id=project_id,
                           meeting_id=meeting.id, attempt=attempt, error=str(e)[:150])
    return set(), set(), False


def _build_scene_catalog(scenes: list[StandardScene]) -> str:
    """把标准场景库紧凑列成清单,按 domain 分组,便于 LLM 定位与回引 code。"""
    by_domain: dict[str, list[StandardScene]] = {}
    for s in scenes:
        by_domain.setdefault(s.domain, []).append(s)
    blocks: list[str] = []
    for domain, items in by_domain.items():
        rows = "\n".join(f"- {s.code} | {s.name}" for s in items)
        blocks.append(f"### {domain}(共 {len(items)} 条)\n{rows}")
    return "\n\n".join(blocks)


# ── 报告拼装 ─────────────────────────────────────────────────────────────

def _build_report_md(
    hit: list[dict], miss: list[dict], summary: str, total: int
) -> str:
    """命中场景按 domain 分组 Markdown 呈现;未命中给数量小结(总数 + 分 domain)。"""
    lines: list[str] = ["# 标准场景命中报告", ""]
    lines.append(f"**命中 {len(hit)} / 未命中 {len(miss)}(标准场景共 {total})**")
    lines.append("")
    if summary:
        lines.append(f"> {summary}")
        lines.append("")

    # 命中:按 domain 分组
    lines.append("## 命中场景")
    lines.append("")
    if hit:
        hit_by_domain: dict[str, list[dict]] = {}
        for h in hit:
            hit_by_domain.setdefault(h["domain"], []).append(h)
        for domain, items in hit_by_domain.items():
            lines.append(f"### {domain}(命中 {len(items)} 条)")
            for it in items:
                lines.append(f"- `{it['code']}` {it['name']}")
            lines.append("")
    else:
        lines.append("_无命中场景。_")
        lines.append("")

    # 未命中:数量小结
    lines.append("## 未命中场景")
    lines.append("")
    lines.append(f"共 {len(miss)} 个场景未命中。")
    if miss:
        miss_by_domain: dict[str, int] = {}
        for m in miss:
            miss_by_domain[m["domain"]] = miss_by_domain.get(m["domain"], 0) + 1
        counts = "、".join(f"{d} {c} 条" for d, c in miss_by_domain.items())
        lines.append("")
        lines.append(f"分布:{counts}。")
    return "\n".join(lines).strip()


def _empty_result(scenes: list[StandardScene], summary: str, sources: list | None = None) -> dict:
    """无素材 / 无场景等兜底:全部判未命中。"""
    miss = [{"domain": s.domain, "code": s.code, "name": s.name} for s in scenes]
    return {
        "hit": [],
        "miss": miss,
        "hit_count": 0,
        "miss_count": len(miss),
        "summary": summary,
        "sources": sources or [],
        "report_md": _build_report_md([], miss, summary, len(scenes)),
    }


# ── 主入口 ───────────────────────────────────────────────────────────────

async def match_project_scenes(project_id: str, session: AsyncSession) -> dict:
    """把一个项目对照标准场景库做命中 / 未命中判定,返回结构化结果 + Markdown 报告。

    参数:
        project_id: 项目 ID(projects.id)
        session:    调用方传入的 AsyncSession
    返回:见模块 docstring 顶部的 dict 结构。
    """
    # 1. 读全部 active 标准场景(约 147 条)
    scenes = (await session.execute(
        select(StandardScene)
        .where(StandardScene.status == "active")
        .order_by(StandardScene.domain, StandardScene.code)
    )).scalars().all()

    if not scenes:
        logger.warning("scene_match_no_scenes", project_id=project_id)
        return _empty_result([], "标准场景库为空,无法判定。")

    # 2. 读项目 —— 命中依据只用「合同/SOW 界定的范围 + 会议调研」,不用下游产物
    #    (蓝图/洞察/调研报告):那些是命中的【结果】,拿来当依据会循环论证,且蓝图这类过于全面
    #    会把整个大域的细分场景全判命中(整域误命中)。用户 2026-07-14 决策。
    project = await session.get(Project, project_id)
    project_meta = _build_project_meta(project)

    # 关联本项目的会议纪要 —— 按时间从旧到新,逐场判增量后折叠(晚会可取消早会的场景)
    meetings = (await session.execute(
        select(Meeting)
        .where(Meeting.project_id == project_id)
        .order_by(Meeting.created_at.asc())
        .limit(_MAX_MEETINGS)
    )).scalars().all()

    # 2b. 范围文档:SOW 优先,SOW 缺失时用合同兜底(用户 2026-07-13)
    #     SOW/合同界定项目范围,是场景命中最直接的依据。
    scope_doc = (await session.execute(
        select(Document).where(
            Document.project_id == project_id, Document.doc_type == "sow",
            Document.markdown_content.isnot(None),
        ).limit(1)
    )).scalars().first()
    scope_label = "SOW"
    if scope_doc is None:
        scope_doc = (await session.execute(
            select(Document).where(
                Document.project_id == project_id, Document.doc_type == "contract",
                Document.markdown_content.isnot(None),
            ).limit(1)
        )).scalars().first()
        scope_label = "合同(项目无 SOW,用合同界定范围)"
    scope_block = ""
    if scope_doc and (scope_doc.markdown_content or "").strip():
        scope_block = f"【项目范围文档 · {scope_label}】\n{scope_doc.markdown_content.strip()[:14000]}"

    # 命中依据的文档清单(透明:让人知道这次判定基于哪些材料)
    sources: list[dict] = []
    if scope_doc and scope_block.strip():
        sources.append({"kind": "scope", "type": scope_label, "name": scope_doc.filename})
    # 会议纪要的 sources 在折叠后按「实际贡献了增量的会议」追加(见下)

    # 3. 防御:项目无任何素材(范围文档 / 会议纪要 / 元信息全空)→ 全 miss
    has_meeting_content = any(
        (_render_minutes(m.edited_minutes or m.meeting_minutes) or m.polished_transcript or m.raw_transcript or "").strip()
        for m in meetings
    )
    if (not scope_block.strip() and not has_meeting_content and not project_meta.strip()):
        logger.info("scene_match_no_material", project_id=project_id)
        return _empty_result(scenes, "材料不足,无法判定:该项目暂无 SOW / 合同 / 会议纪要,也缺少项目描述。", sources)

    # 场景 code → 场景 dict 的索引(判定回引用)
    scene_index: dict[tuple[str, str], dict] = {}
    code_only_index: dict[str, dict] = {}
    for s in scenes:
        item = {"domain": s.domain, "code": s.code, "name": s.name}
        scene_index[(s.domain.strip().upper(), s.code.strip().upper())] = item
        code_only_index.setdefault(s.code.strip().upper(), item)  # code 兜底匹配(同 code 跨 domain 少见)

    from services.llm_json import loads_lenient
    from services.model_router import ModelOutputError

    # 4. 基线判定(范围文档:SOW/合同 + 项目元信息)—— 会议不在这里,留到下面按时间逐场折叠。
    #    一次判 147 个场景会让输出超 max_tokens 截断,改成每批 ≤_MATCH_CHUNK 个场景反复喂材料。
    material_context = f"""【项目上下文】
{project_meta or '(无元信息)'}

{scope_block or '【项目范围文档】(无 SOW / 合同)'}"""
    system_prompt = (
        "你是纷享销客 CRM 实施资深顾问,依据【合同/SOW 范围文档 + 项目元信息】判定项目业务范围命中了「标准场景库」中的哪些标准场景。\n"
        "场景库是【细粒度】的:一个大域(如 LTC 线索到回款)下有几十个细分场景,每个对应一个具体业务动作。\n"
        "规则:\n"
        "1. 逐个场景【独立】判断。命中要求范围文档里有【针对该细分场景本身】的明确依据(具体业务动作 / 需求 / 流程节点 / 字段),"
        "而不是该场景所属的大域被提到。\n"
        "2. 【严禁整域命中】:绝不能因为项目做了某个大域,就把该域下所有细分场景都判命中。"
        "一个项目通常只覆盖某域里的一部分场景。例:客户做标准直销、不走招投标,则招标/投标类场景一律不命中。\n"
        "3. 宁缺毋滥:不确定、仅背景提及、举例、别项目的事,一律不命中。真实项目单域命中率通常远低于 100%。\n"
        "4. 严格输出 JSON,不要解释文字、不要代码围栏。"
    )

    async def _classify(batch: list) -> dict | None:
        user = (
            material_context
            + "\n\n【待判定的标准场景(只判这一批)】\n" + _build_scene_catalog(batch)
            + '\n\n【输出 —— 严格 JSON】\n{"hits": [{"domain": "LTC", "code": "LM-01"}]}\n'
            + "只列命中的场景;domain/code 照抄场景库原值;无命中则 hits 为 []。"
        )
        for attempt in (1, 2):
            try:
                content, _m = await model_router.chat_with_routing(
                    task=_MODEL_TASK,
                    messages=[{"role": "system", "content": system_prompt},
                              {"role": "user", "content": user}],
                    temperature=0.2, max_tokens=5000, validator=_json_valid,
                )
                parsed = loads_lenient(content or "", None)
                if isinstance(parsed, dict):
                    return parsed
            except (ModelOutputError, Exception) as e:  # noqa: BLE001
                logger.warning("scene_match_batch_invalid", project_id=project_id,
                               attempt=attempt, error=str(e)[:150])
        return None

    # 4a. 文档基线命中(t=0):合同/SOW 范围文档 + 项目元信息
    doc_hit_keys: set[tuple[str, str]] = set()
    any_ok = False
    doc_ran = bool(scope_block.strip() or project_meta.strip())
    if doc_ran:
        for i in range(0, len(scenes), _MATCH_CHUNK):
            parsed = await _classify(scenes[i:i + _MATCH_CHUNK])
            if parsed is None:
                continue
            any_ok = True
            for h in (parsed.get("hits") or []):
                k = _resolve_one(h, scene_index, code_only_index)
                if k:
                    doc_hit_keys.add(k)

    # 4b. 会议增量:每场独立判定(并发),再按时间从旧到新折叠 —— 检测无序、折叠有序。
    #     纳入并集、剔除差集,晚会可取消早会的场景;单场聚焦更准(治「松」)、小 prompt 不截断。
    catalog_full = _build_scene_catalog(scenes)
    deltas: list = []
    if meetings:
        import asyncio
        sem = asyncio.Semaphore(6)   # 限并发,别一次打太多 LLM 调用

        async def _bounded(m):
            async with sem:
                return await _detect_meeting_delta(m, catalog_full, scene_index, code_only_index, project_id)
        deltas = await asyncio.gather(*[_bounded(m) for m in meetings])
    meeting_ok = False
    state = set(doc_hit_keys)
    added_total = removed_total = 0
    for m, (in_keys, out_keys, had_signal) in zip(meetings, deltas):
        if had_signal:
            meeting_ok = True
        if in_keys or out_keys:
            added_total += len(in_keys - state)
            removed_total += len(out_keys & state)
            state |= in_keys
            state -= out_keys
            sources.append({"kind": "meeting", "type": "会议纪要", "name": m.title or "未命名会议"})
    hit_keys = state

    if not any_ok and not meeting_ok:
        return _empty_result(scenes, "判定失败:模型未返回可解析的结果,请稍后重试。", sources)

    # 5. 组装 hit / miss(以场景库为准,保证顺序稳定、内容可信)
    hit: list[dict] = []
    miss: list[dict] = []
    for s in scenes:
        key = (s.domain.strip().upper(), s.code.strip().upper())
        item = {"domain": s.domain, "code": s.code, "name": s.name}
        (hit if key in hit_keys else miss).append(item)

    hit_domains = sorted({h["domain"] for h in hit})
    fold_note = f";会议时序折叠 +{added_total}/−{removed_total}" if (added_total or removed_total) else ""
    summary = f"共命中 {len(hit)} 个标准场景(覆盖 {'、'.join(hit_domains) or '—'}),{len(miss)} 个未命中{fold_note}。"

    return {
        "hit": hit,
        "miss": miss,
        "hit_count": len(hit),
        "miss_count": len(miss),
        "summary": summary,
        "sources": sources,
        "report_md": _build_report_md(hit, miss, summary, len(scenes)),
    }
