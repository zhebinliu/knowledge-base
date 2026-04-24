"""Core generation logic for CuratedBundle outputs (kickoff_pptx / survey / insight).

对话式访谈流程：CuratedBundle.extra.conversation_id 指向 OutputConversation。
生成器读取完整对话记录 + 访谈过程中检索到的 refs，作为主要素材；
project_id 可能为 None（行业作用域）。
"""
import io
import structlog
from datetime import date
from config import settings
from models import async_session_maker
from models.curated_bundle import CuratedBundle
from models.project import Project
from models.output_conversation import OutputConversation
from models.agent_config import AgentConfig
from sqlalchemy import select

logger = structlog.get_logger()


async def _get_project(project_id: str) -> Project | None:
    if not project_id:
        return None
    async with async_session_maker() as s:
        return await s.get(Project, project_id)


async def _get_conversation(conv_id: str) -> OutputConversation | None:
    if not conv_id:
        return None
    async with async_session_maker() as s:
        return await s.get(OutputConversation, conv_id)


async def _get_output_agent_config(key: str) -> dict:
    async with async_session_maker() as s:
        row = (await s.execute(
            select(AgentConfig).where(
                AgentConfig.config_type == "output_agent",
                AgentConfig.config_key == key,
            )
        )).scalar_one_or_none()
    if row and isinstance(row.config_value, dict):
        return {
            "prompt": row.config_value.get("prompt", ""),
            "skill_ids": row.config_value.get("skill_ids", []),
            "model": row.config_value.get("model"),
        }
    return {"prompt": "", "skill_ids": [], "model": None}


async def _get_skill_snippets(skill_ids: list[str]) -> str:
    if not skill_ids:
        return ""
    from models.skill import Skill
    async with async_session_maker() as s:
        rows = (await s.execute(select(Skill).where(Skill.id.in_(skill_ids)))).scalars().all()
    return "\n\n".join(f"### 技能：{r.name}\n{r.prompt_snippet}" for r in rows)


def _format_transcript(conv: OutputConversation | None) -> str:
    if not conv or not conv.messages:
        return "（没有可用的访谈记录）"
    lines = []
    for m in conv.messages:
        role = m.get("role")
        if role == "user":
            content = (m.get("content") or "").strip()
            if not content or content.startswith("（请开场"):
                continue
            lines.append(f"**用户**：{content}")
        elif role == "assistant":
            content = (m.get("content") or "").strip()
            if content:
                lines.append(f"**顾问**：{content}")
    return "\n\n".join(lines) if lines else "（没有可用的访谈记录）"


def _format_refs(conv: OutputConversation | None) -> str:
    if not conv or not conv.refs:
        return ""
    # 去重（按 chunk_id）
    seen = set()
    lines = []
    for r in conv.refs:
        cid = r.get("chunk_id")
        if cid in seen:
            continue
        seen.add(cid)
        header = f"[{r.get('filename') or '未知文档'}" + (f" · {r['source_section']}" if r.get("source_section") else "") + "]"
        lines.append(f"{header}\n{(r.get('content') or '')[:400]}")
    return "\n\n".join(lines[:20])


async def _llm_call(prompt: str, system: str = "", model: str | None = None) -> str:
    from services.model_router import model_router
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    if model:
        content, _ = await model_router.chat(model, messages, max_tokens=8000)
    else:
        content, _ = await model_router.chat_with_routing("doc_generation", messages, max_tokens=8000)
    return content


async def _mark_bundle(bundle_id: str, status: str, **kwargs):
    async with async_session_maker() as s:
        b = await s.get(CuratedBundle, bundle_id)
        if b:
            b.status = status
            for k, v in kwargs.items():
                setattr(b, k, v)
            await s.commit()


async def _mark_conversation(bundle_id: str, status: str):
    async with async_session_maker() as s:
        bundle = await s.get(CuratedBundle, bundle_id)
        if not bundle or not bundle.extra:
            return
        conv_id = bundle.extra.get("conversation_id")
        if not conv_id:
            return
        conv = await s.get(OutputConversation, conv_id)
        if conv:
            conv.status = status
            await s.commit()


async def _gather_inputs(bundle_id: str, project_id: str, kind: str) -> dict:
    """统一拉取对话 / 项目 / 智能体配置。"""
    async with async_session_maker() as s:
        bundle = await s.get(CuratedBundle, bundle_id)
    conv_id = (bundle.extra or {}).get("conversation_id") if bundle and bundle.extra else None
    industry_override = (bundle.extra or {}).get("industry") if bundle and bundle.extra else None
    conv = await _get_conversation(conv_id) if conv_id else None
    proj = await _get_project(project_id) if project_id else None
    agent_cfg = await _get_output_agent_config(kind)
    skill_text = await _get_skill_snippets(agent_cfg["skill_ids"])
    transcript = _format_transcript(conv)
    refs_text = _format_refs(conv)
    return {
        "project": proj,
        "industry": (proj.industry if proj else None) or industry_override,
        "conv": conv,
        "agent_prompt": agent_cfg["prompt"],
        "agent_model": agent_cfg["model"],
        "skill_text": skill_text,
        "transcript": transcript,
        "refs_text": refs_text,
    }


# ── Survey ────────────────────────────────────────────────────────────────────

SURVEY_SYSTEM = """你是一位资深的 CRM 实施顾问，擅长设计系统调研问卷。
基于用户访谈记录和知识库片段，生成专业的问题清单。
要求：
1. 每个大类至少 3 题，最多 8 题
2. 问题要具体可回答，避免宽泛
3. 格式：## 一、业务流程类\\n- 问题…\\n## 二、角色权限类\\n…
4. 五大类：业务流程 / 角色权限 / 数据与集成 / 风险与约束 / 进度与资源"""


async def generate_survey(bundle_id: str, project_id: str):
    try:
        await _mark_bundle(bundle_id, "generating")
        ctx = await _gather_inputs(bundle_id, project_id, "survey")
        proj = ctx["project"]
        scope_line = f"项目：{proj.name}，客户：{proj.customer or '—'}" if proj else f"行业：{ctx['industry'] or '—'}"

        prompt = f"""{scope_line}
行业：{ctx['industry'] or '未填写'}

【访谈记录（主要依据）】
{ctx['transcript']}

{f"【知识库佐证】{chr(10)}{ctx['refs_text']}" if ctx['refs_text'] else ""}

{f"【方法论/风格要求】{chr(10)}{ctx['agent_prompt']}" if ctx['agent_prompt'] else ""}

{f"【启用技能】{chr(10)}{ctx['skill_text']}" if ctx['skill_text'] else ""}

请基于上述访谈记录生成详细的实施调研问卷，按五大类组织，返回 Markdown 格式。访谈未覆盖的维度请标"待补充"而不要编造。"""

        md = await _llm_call(prompt, system=SURVEY_SYSTEM, model=ctx["agent_model"])

        docx_key: str | None = None
        try:
            title = f"调研问卷 · {proj.name if proj else (ctx['industry'] or '—')}"
            docx_bytes = _build_docx(title, md)
            docx_key = f"outputs/{bundle_id}/survey.docx"
            _minio_put(docx_key, docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        except Exception as e:
            logger.warning("survey_docx_failed", error=str(e)[:100])

        await _mark_bundle(bundle_id, "done", content_md=md, file_key=docx_key)
        await _mark_conversation(bundle_id, "done")
        logger.info("survey_generated", bundle_id=bundle_id, project_id=project_id)
    except Exception as e:
        logger.error("survey_failed", bundle_id=bundle_id, error=str(e)[:200])
        await _mark_bundle(bundle_id, "failed", error=str(e)[:500])
        await _mark_conversation(bundle_id, "failed")


# ── Insight ───────────────────────────────────────────────────────────────────

INSIGHT_SYSTEM = """你是一位资深 CRM 实施顾问兼 PMO 专家，擅长将访谈记录提炼为高管可用的项目洞察报告。
每个章节要有明确结论、量化指标（若访谈提到）、数据出处。访谈未覆盖的请标"待补充"而不要编造。"""

INSIGHT_SECTIONS = [
    ("项目概览", "基于访谈，梳理项目的整体情况：目标、范围、关键干系人、当前阶段。"),
    ("关键决策点", "梳理已做出的关键决策和待决策事项。"),
    ("风险矩阵", "识别主要风险（技术/业务/组织/进度），评估影响与可能性，并提出应对策略。表格形式。"),
    ("下一步建议", "3–5 条可执行的具体建议，每条注明 Owner 和时间预期。"),
]


async def generate_insight(bundle_id: str, project_id: str):
    try:
        await _mark_bundle(bundle_id, "generating")
        ctx = await _gather_inputs(bundle_id, project_id, "insight")
        proj = ctx["project"]
        scope_line = f"项目名称：{proj.name}，客户：{proj.customer or '—'}" if proj else f"行业：{ctx['industry'] or '—'}"

        sections = []
        for title, question in INSIGHT_SECTIONS:
            prompt = f"""{scope_line}
行业：{ctx['industry'] or '—'}

【访谈记录（主要依据）】
{ctx['transcript']}

{f"【知识库佐证】{chr(10)}{ctx['refs_text']}" if ctx['refs_text'] else ""}

{f"【方法论】{chr(10)}{ctx['agent_prompt']}" if ctx['agent_prompt'] else ""}

{f"【启用技能】{chr(10)}{ctx['skill_text']}" if ctx['skill_text'] else ""}

问题：{question}

请给出 200–500 字的结构化回答，Markdown 格式。访谈未覆盖的标"待补充"。"""
            answer = await _llm_call(prompt, system=INSIGHT_SYSTEM, model=ctx["agent_model"])
            sections.append(f"## {title}\n\n{answer}")

        report_date = date.today().strftime("%Y年%m月%d日")
        header_name = proj.name if proj else (ctx["industry"] or "—")
        md = (
            f"# {header_name} · 项目洞察报告\n\n"
            f"**生成日期**：{report_date}  \n"
            f"**客户**：{(proj.customer if proj else '—') or '—'}  \n"
            f"**行业**：{ctx['industry'] or '—'}\n\n---\n\n"
            + "\n\n---\n\n".join(sections)
        )

        await _mark_bundle(bundle_id, "done", content_md=md)
        await _mark_conversation(bundle_id, "done")
        logger.info("insight_generated", bundle_id=bundle_id, project_id=project_id)
    except Exception as e:
        logger.error("insight_failed", bundle_id=bundle_id, error=str(e)[:200])
        await _mark_bundle(bundle_id, "failed", error=str(e)[:500])
        await _mark_conversation(bundle_id, "failed")


# ── Kickoff PPTX ──────────────────────────────────────────────────────────────

PPTX_SYSTEM = """你是一位专业的 CRM 实施顾问，基于访谈记录为启动会生成 PPT 内容大纲。
每张幻灯片按如下格式输出（严格遵守）：
===SLIDE===
标题：<幻灯片标题>
要点：
- <要点1>
- <要点2>
- <要点3>
===END===
生成 6 张幻灯片：封面、项目概况、LTC 阶段时间线、关键里程碑与交付物、风险与应对、下一步行动。
访谈未覆盖的标题请用"待补充：<提示>"，不要编造内容。"""


async def generate_kickoff_pptx(bundle_id: str, project_id: str):
    try:
        await _mark_bundle(bundle_id, "generating")
        ctx = await _gather_inputs(bundle_id, project_id, "kickoff_pptx")
        proj = ctx["project"]

        if proj:
            customer = proj.customer or ""
            kickoff_date_str = proj.kickoff_date.strftime("%Y年%m月%d日") if proj.kickoff_date else "待定"
            scope_block = f"""项目名称：{proj.name}
客户：{customer or "未填写"}
行业：{ctx['industry'] or "未填写"}
启动日期：{kickoff_date_str}
实施模块：{", ".join(proj.modules or []) or "未填写"}
项目描述：{proj.description or "无"}"""
            title_name = proj.name
        else:
            customer = ""
            kickoff_date_str = "待定"
            scope_block = f"行业：{ctx['industry'] or '—'}\n（没有具体项目信息，按行业共性展开）"
            title_name = ctx["industry"] or "行业启动会"

        prompt = f"""{scope_block}

【访谈记录（主要依据）】
{ctx['transcript']}

{f"【知识库佐证】{chr(10)}{ctx['refs_text']}" if ctx['refs_text'] else ""}

{f"【方法论/风格要求】{chr(10)}{ctx['agent_prompt']}" if ctx['agent_prompt'] else ""}

{f"【启用技能（PPT 骨架 / 版式 / 文案规范）】{chr(10)}{ctx['skill_text']}" if ctx['skill_text'] else ""}

请按格式生成 6 张幻灯片的内容。"""

        raw = await _llm_call(prompt, system=PPTX_SYSTEM, model=ctx["agent_model"])
        slides = _parse_slide_content(raw)

        pptx_bytes = _build_pptx(title_name, customer, kickoff_date_str, slides)
        pptx_key = f"outputs/{bundle_id}/kickoff.pptx"
        _minio_put(pptx_key, pptx_bytes, "application/vnd.openxmlformats-officedocument.presentationml.presentation")

        md_lines = [f"# 启动会 PPT · {title_name}\n"]
        for s in slides:
            md_lines.append(f"## {s['title']}\n")
            for pt in s.get("points", []):
                md_lines.append(f"- {pt}")
            md_lines.append("")
        md = "\n".join(md_lines)

        await _mark_bundle(bundle_id, "done", content_md=md, file_key=pptx_key)
        await _mark_conversation(bundle_id, "done")
        logger.info("pptx_generated", bundle_id=bundle_id, project_id=project_id)
    except Exception as e:
        logger.error("pptx_failed", bundle_id=bundle_id, error=str(e)[:200])
        await _mark_bundle(bundle_id, "failed", error=str(e)[:500])
        await _mark_conversation(bundle_id, "failed")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_slide_content(raw: str) -> list[dict]:
    slides = []
    for block in raw.split("===SLIDE==="):
        block = block.strip()
        if "===END===" in block:
            block = block.split("===END===")[0].strip()
        if not block:
            continue
        title = ""
        points = []
        for line in block.splitlines():
            line = line.strip()
            if line.startswith("标题："):
                title = line[3:].strip()
            elif line.startswith("- "):
                points.append(line[2:].strip())
        if title:
            slides.append({"title": title, "points": points})
    if not slides:
        slides = [{"title": "启动会", "points": ["内容解析异常，请重新生成"]}]
    return slides[:8]


def _build_pptx(project_name: str, customer: str | None, kickoff_date: str, slides: list[dict]) -> bytes:
    """16:9 版式：
    - 封面：左侧品牌色竖条 + 大标题 + 客户/日期副标 + 右下角角标
    - 内页：顶部 4pt 橙色细条 + 页头标题 + 左橙色块装饰 + 两栏要点（>4 条时）+ 右下页码 + 底部细线
    """
    from pptx import Presentation
    from pptx.util import Inches, Pt, Emu
    from pptx.dml.color import RGBColor
    from pptx.enum.shapes import MSO_SHAPE
    from pptx.enum.text import PP_ALIGN

    prs = Presentation()
    prs.slide_width = Inches(13.33)
    prs.slide_height = Inches(7.5)
    SW, SH = prs.slide_width, prs.slide_height

    BRAND = RGBColor(0xD9, 0x64, 0x00)       # 主橙
    BRAND_LIGHT = RGBColor(0xFF, 0x8D, 0x1A) # 亮橙
    INK = RGBColor(0x1F, 0x29, 0x37)         # 主文字
    INK_2 = RGBColor(0x4B, 0x55, 0x63)       # 次文字
    MUTED = RGBColor(0x9C, 0xA3, 0xAF)
    BG_TINT = RGBColor(0xFA, 0xFA, 0xFA)
    LINE = RGBColor(0xE5, 0xE7, 0xEB)
    WHITE = RGBColor(0xFF, 0xFF, 0xFF)

    blank_layout = prs.slide_layouts[6]
    total = len(slides)

    def _no_line(shp):
        try:
            shp.line.fill.background()
        except Exception:
            pass

    def _fill(shp, color):
        shp.fill.solid(); shp.fill.fore_color.rgb = color
        _no_line(shp)

    def _add_rect(slide, x, y, w, h, color):
        s = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, w, h)
        _fill(s, color)
        return s

    def _add_text(slide, x, y, w, h, text, size, color, bold=False, align=None, font_name="微软雅黑"):
        tb = slide.shapes.add_textbox(x, y, w, h)
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_right = Inches(0.05)
        tf.margin_top = tf.margin_bottom = Inches(0.02)
        p = tf.paragraphs[0]
        if align is not None: p.alignment = align
        r = p.add_run(); r.text = text
        r.font.size = Pt(size); r.font.bold = bold
        r.font.color.rgb = color
        r.font.name = font_name
        return tf

    for i, slide_data in enumerate(slides):
        slide = prs.slides.add_slide(blank_layout)

        if i == 0:
            # 封面：白底 + 左侧宽品牌色竖条
            _add_rect(slide, 0, 0, Inches(4.2), SH, BRAND)
            # 装饰小方块
            _add_rect(slide, Inches(3.9), Inches(0.9), Inches(0.3), Inches(0.3), BRAND_LIGHT)
            _add_rect(slide, Inches(3.9), Inches(6.3), Inches(0.3), Inches(0.3), BRAND_LIGHT)

            # 左上品牌标
            _add_text(slide, Inches(0.7), Inches(0.6), Inches(3.3), Inches(0.4),
                      "KICKOFF DECK", 12, WHITE, bold=True)

            # 大标题（右侧白底区）
            _add_text(slide, Inches(4.7), Inches(2.3), Inches(8.2), Inches(1.6),
                      slide_data["title"], 40, INK, bold=True)
            # 橙色短横线
            _add_rect(slide, Inches(4.7), Inches(3.95), Inches(0.8), Emu(50800), BRAND)
            # 副标
            sub = f"{customer or project_name}"
            _add_text(slide, Inches(4.7), Inches(4.2), Inches(8.2), Inches(0.5),
                      sub, 20, INK_2)
            _add_text(slide, Inches(4.7), Inches(4.8), Inches(8.2), Inches(0.4),
                      f"启动会 · {kickoff_date}", 14, MUTED)

            # 左下脚标
            _add_text(slide, Inches(0.7), Inches(6.7), Inches(3.3), Inches(0.3),
                      "Fenxiao CRM · LTC 实施方法论", 10, WHITE)
            continue

        # 内页
        # 顶部细条
        _add_rect(slide, 0, 0, SW, Inches(0.08), BRAND)
        # 页头标题
        _add_text(slide, Inches(0.7), Inches(0.35), Inches(11.9), Inches(0.7),
                  slide_data["title"], 26, INK, bold=True)
        # 标题下橙色短粗线
        _add_rect(slide, Inches(0.7), Inches(1.05), Inches(0.6), Emu(50800), BRAND)
        # 页脚细线
        _add_rect(slide, Inches(0.7), Inches(7.1), Inches(11.9), Emu(9525), LINE)
        # 页码
        _add_text(slide, Inches(12.2), Inches(7.15), Inches(1.0), Inches(0.3),
                  f"{i} / {total - 1}", 10, MUTED, align=PP_ALIGN.RIGHT)
        # 页脚左侧项目信息
        _add_text(slide, Inches(0.7), Inches(7.15), Inches(10), Inches(0.3),
                  f"{customer or project_name} · 启动会", 10, MUTED)

        points = slide_data.get("points") or []
        if not points:
            continue

        # 两栏分布（>4 条时）
        top = Inches(1.55)
        body_h = Inches(5.3)
        if len(points) > 4:
            half = (len(points) + 1) // 2
            cols = [points[:half], points[half:]]
            col_w = Inches(5.7)
            col_x = [Inches(0.7), Inches(7.0)]
        else:
            cols = [points]
            col_w = Inches(11.9)
            col_x = [Inches(0.7)]

        for ci, col_points in enumerate(cols):
            box = slide.shapes.add_textbox(col_x[ci], top, col_w, body_h)
            tf = box.text_frame; tf.word_wrap = True
            tf.margin_left = Inches(0.1); tf.margin_top = Inches(0.05)
            for j, pt in enumerate(col_points):
                para = tf.paragraphs[0] if j == 0 else tf.add_paragraph()
                # 橙色圆点 + 文本
                r1 = para.add_run(); r1.text = "●  "
                r1.font.size = Pt(12); r1.font.color.rgb = BRAND
                r1.font.name = "微软雅黑"
                r2 = para.add_run(); r2.text = pt
                r2.font.size = Pt(16); r2.font.color.rgb = INK
                r2.font.name = "微软雅黑"
                para.space_after = Pt(10)
                para.line_spacing = 1.35

    buf = io.BytesIO(); prs.save(buf)
    return buf.getvalue()


def _build_docx(title: str, md: str) -> bytes:
    from docx import Document as DocxDoc

    doc = DocxDoc()
    doc.add_heading(title, level=0)
    for line in md.splitlines():
        line = line.rstrip()
        if line.startswith("## "):
            doc.add_heading(line[3:], level=2)
        elif line.startswith("# "):
            doc.add_heading(line[2:], level=1)
        elif line.startswith("- "):
            doc.add_paragraph(line[2:], style="List Bullet")
        elif line:
            doc.add_paragraph(line)
    buf = io.BytesIO(); doc.save(buf)
    return buf.getvalue()


def _minio_put(key: str, data: bytes, content_type: str):
    from minio import Minio
    mc = Minio(settings.minio_endpoint, access_key=settings.minio_user, secret_key=settings.minio_password, secure=False)
    mc.put_object(settings.minio_bucket, key, io.BytesIO(data), len(data), content_type=content_type)
