"""场景命中判定 — 用 LLM 把一个项目对照「标准场景库」逐条判命中 / 未命中。

定位:Harness 场景命中(P3)的核心服务。读标准场景库(表 `standard_scenes`,
约 147 条 active Core 场景)+ 项目上下文(元信息 + 已生成的调研 / 洞察 / 蓝图产物),
一次 LLM 大调用把每个标准场景判为 in-scope(命中)或 not(未命中),产出结构化结果 + Markdown 报告。

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
- 项目素材:Project 元信息 + curated_bundles 里 status='done' 且 kind ∈ 白名单的 content_md,
  每份截断约 6000 字,总量上限约 40000 字。
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
from models.curated_bundle import CuratedBundle
from models.document import Document
from models.meeting import Meeting
from services.model_router import model_router

logger = structlog.get_logger()

# ── 常量 ────────────────────────────────────────────────────────────────
# 参与判定的产物类型(项目在这些阶段沉淀的核心材料最能反映业务范围)
_MATERIAL_KINDS = ("insight", "survey", "research_report", "blueprint_design")
_KIND_LABELS = {
    "insight": "项目洞察",
    "survey": "调研问卷",
    "research_report": "调研报告",
    "blueprint_design": "蓝图设计",
}
_MAX_CHARS_PER_DOC = 6000      # 单份产物截断字符数
_MAX_TOTAL_CHARS = 40000       # 产物素材总量上限
_MAX_CHARS_PER_MEETING = 3500  # 单场会议纪要截断字符数(略降以容纳更多场次,重广度)
_MAX_MEETING_TOTAL_CHARS = 36000  # 会议纪要总量上限(glm-5 200k 上下文富余;让早期调研会也进得来)
_MAX_MEETINGS = 14             # 最多取最近 N 场会议(覆盖到早期调研会,场景识别靠广度)
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


def _build_material_block(bundles: list[CuratedBundle]) -> str:
    """把产物 content_md 按类型截断拼接,受单份 6000 字 / 总量 40000 字双上限约束。"""
    parts: list[str] = []
    total = 0
    for b in bundles:
        md = (getattr(b, "content_md", None) or "").strip()
        if not md:
            continue
        excerpt = md[:_MAX_CHARS_PER_DOC]
        if len(md) > _MAX_CHARS_PER_DOC:
            excerpt += f"\n…(余下 {len(md) - _MAX_CHARS_PER_DOC} 字省略)"
        label = _KIND_LABELS.get(b.kind, b.kind)
        title = getattr(b, "title", None) or label
        piece = f"【{label}:{title}】\n{excerpt}"
        if total + len(piece) > _MAX_TOTAL_CHARS:
            # 总量超限:截断当前这份后收尾,不再追加
            remain = _MAX_TOTAL_CHARS - total
            if remain > 500:
                parts.append(piece[:remain] + "\n…(素材总量达上限,后续省略)")
            break
        parts.append(piece)
        total += len(piece)
    return "\n\n".join(parts)


def _render_minutes(minutes) -> str:
    """会议纪要 JSON → 可读文本;非 dict 返回空串。用 json.dumps 保底(LLM 能直接读结构化)。"""
    if not isinstance(minutes, dict):
        return ""
    import json as _json
    try:
        return _json.dumps(minutes, ensure_ascii=False)
    except Exception:
        return ""


def _build_meeting_block(meetings: list[Meeting]) -> tuple[str, list[dict]]:
    """关联项目的会议:优先取(用户编辑过的)纪要,无纪要则退回转写。真实客户对话最能反映业务范围。

    返回 (拼接文本, sources 列表)。受单场 4000 字 / 会议总量 16000 字双上限约束。
    """
    parts: list[str] = []
    sources: list[dict] = []
    total = 0
    for mt in meetings:
        body = _render_minutes(mt.edited_minutes or mt.meeting_minutes)
        if not body.strip():
            body = (mt.polished_transcript or mt.raw_transcript or "").strip()
        if not body.strip():
            continue
        excerpt = body[:_MAX_CHARS_PER_MEETING]
        if len(body) > _MAX_CHARS_PER_MEETING:
            excerpt += f"\n…(余下 {len(body) - _MAX_CHARS_PER_MEETING} 字省略)"
        title = mt.title or "未命名会议"
        piece = f"【会议纪要:{title}】\n{excerpt}"
        if total + len(piece) > _MAX_MEETING_TOTAL_CHARS:
            break
        parts.append(piece)
        total += len(piece)
        sources.append({"kind": "meeting", "type": "会议纪要", "name": title})
    return "\n\n".join(parts), sources


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

    # 2. 读项目 + 素材(done 且 kind 在白名单的 curated_bundles)
    project = await session.get(Project, project_id)
    bundles = (await session.execute(
        select(CuratedBundle)
        .where(CuratedBundle.project_id == project_id)
        .where(CuratedBundle.status == "done")
        .where(CuratedBundle.kind.in_(_MATERIAL_KINDS))
        .order_by(CuratedBundle.created_at.desc())
    )).scalars().all()
    # 同一 kind 可能有多份 done 产物(重新生成过)——只保留每类最新一份(已按 created_at desc 排),
    # 否则命中依据里「调研报告 / 蓝图设计 / 项目洞察」会重复列,也会把同份材料重复喂给 LLM 浪费 token。
    seen_kinds: set[str] = set()
    bundles = [b for b in bundles if not (b.kind in seen_kinds or seen_kinds.add(b.kind))]

    material_block = _build_material_block(bundles)
    project_meta = _build_project_meta(project)

    # 关联本项目的会议纪要 —— 真实客户调研对话,是场景命中的一手依据
    meetings = (await session.execute(
        select(Meeting)
        .where(Meeting.project_id == project_id)
        .order_by(Meeting.created_at.desc())
        .limit(_MAX_MEETINGS)
    )).scalars().all()
    meeting_block, meeting_sources = _build_meeting_block(meetings)

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
    for b in bundles:
        if (getattr(b, "content_md", None) or "").strip():
            sources.append({"kind": "bundle", "type": _KIND_LABELS.get(b.kind, b.kind),
                            "name": b.title or _KIND_LABELS.get(b.kind, b.kind)})
    sources.extend(meeting_sources)   # 会议纪要也是命中依据

    # 3. 防御:项目无任何素材(范围文档 / 产物正文 / 会议纪要 / 元信息全空)→ 全 miss
    if (not scope_block.strip() and not material_block.strip()
            and not meeting_block.strip() and not project_meta.strip()):
        logger.info("scene_match_no_material", project_id=project_id)
        return _empty_result(scenes, "材料不足,无法判定:该项目暂无 SOW / 合同 / 调研 / 洞察 / 蓝图产物 / 会议纪要,也缺少项目描述。", sources)

    # 场景 code → 场景 dict 的索引(判定回引用)
    scene_index: dict[tuple[str, str], dict] = {}
    code_only_index: dict[str, dict] = {}
    for s in scenes:
        item = {"domain": s.domain, "code": s.code, "name": s.name}
        scene_index[(s.domain.strip().upper(), s.code.strip().upper())] = item
        code_only_index.setdefault(s.code.strip().upper(), item)  # code 兜底匹配(同 code 跨 domain 少见)

    from services.llm_json import loads_lenient
    from services.model_router import ModelOutputError

    # 4. 分批判定 —— 一次判 147 个场景会让输出超 max_tokens 截断(之前"判定失败"根因),
    #    改成每批 ≤_MATCH_CHUNK 个场景,同一份材料反复喂,逐批收集命中。
    material_context = f"""【项目上下文】
{project_meta or '(无元信息)'}

{scope_block or '【项目范围文档】(无 SOW / 合同)'}

【项目素材(截断)】
{material_block or '(无素材正文)'}

【会议纪要(截断)】
{meeting_block or '(无会议纪要)'}"""
    system_prompt = (
        "你是纷享销客 CRM 实施资深顾问,判定项目业务范围命中了「标准场景库」中的哪些标准场景。\n"
        "规则:\n"
        "1. 只有当项目材料(范围文档 SOW/合同、调研、洞察、蓝图、会议纪要、元信息)明确涉及或强相关某标准场景时,才判命中;材料没提到、无法佐证的一律不命中。\n"
        "2. 宁缺毋滥:不确定就不命中。\n"
        "3. 严格输出 JSON,不要解释文字、不要代码围栏。"
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
                    temperature=0.2, max_tokens=4000, validator=_json_valid,
                )
                parsed = loads_lenient(content or "", None)
                if isinstance(parsed, dict):
                    return parsed
            except (ModelOutputError, Exception) as e:  # noqa: BLE001
                logger.warning("scene_match_batch_invalid", project_id=project_id,
                               attempt=attempt, error=str(e)[:150])
        return None

    hit_keys: set[tuple[str, str]] = set()
    any_ok = False
    for i in range(0, len(scenes), _MATCH_CHUNK):
        parsed = await _classify(scenes[i:i + _MATCH_CHUNK])
        if parsed is None:
            continue
        any_ok = True
        raw_hits = parsed.get("hits")
        if not isinstance(raw_hits, list):
            continue
        for h in raw_hits:
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
            code_u = code_v.strip().upper()
            domain_u = domain_v.strip().upper()
            if not code_u:
                continue
            if (domain_u, code_u) in scene_index:
                hit_keys.add((domain_u, code_u))
            elif code_u in code_only_index:  # domain 对不上时按 code 兜底
                it = code_only_index[code_u]
                hit_keys.add((it["domain"].strip().upper(), it["code"].strip().upper()))

    if not any_ok:
        return _empty_result(scenes, "判定失败:模型未返回可解析的结果,请稍后重试。", sources)

    # 5. 组装 hit / miss(以场景库为准,保证顺序稳定、内容可信)
    hit: list[dict] = []
    miss: list[dict] = []
    for s in scenes:
        key = (s.domain.strip().upper(), s.code.strip().upper())
        item = {"domain": s.domain, "code": s.code, "name": s.name}
        (hit if key in hit_keys else miss).append(item)

    hit_domains = sorted({h["domain"] for h in hit})
    summary = f"共命中 {len(hit)} 个标准场景(覆盖 {'、'.join(hit_domains) or '—'}),{len(miss)} 个未命中。"

    return {
        "hit": hit,
        "miss": miss,
        "hit_count": len(hit),
        "miss_count": len(miss),
        "summary": summary,
        "sources": sources,
        "report_md": _build_report_md(hit, miss, summary, len(scenes)),
    }
