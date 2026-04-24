"""Core generation logic for CuratedBundle outputs (kickoff_pptx / survey / insight)."""
import asyncio
import io
import structlog
from datetime import date
from config import settings
from models import async_session_maker
from models.curated_bundle import CuratedBundle
from models.project import Project
from models.chunk import Chunk
from models.agent_config import AgentConfig
from sqlalchemy import select

logger = structlog.get_logger()


async def _get_project(project_id: str) -> Project | None:
    async with async_session_maker() as s:
        return await s.get(Project, project_id)


async def _get_project_chunks(project_id: str, top_n: int = 80) -> list[dict]:
    """Fetch approved chunks for a project, ordered by citation_count desc."""
    from models.document import Document
    async with async_session_maker() as s:
        rows = (await s.execute(
            select(Chunk.id, Chunk.content, Chunk.ltc_stage, Chunk.industry, Chunk.citation_count)
            .join(Document, Document.id == Chunk.document_id)
            .where(
                Document.project_id == project_id,
                Chunk.review_status.in_(["auto_approved", "approved"]),
            )
            .order_by(Chunk.citation_count.desc(), Chunk.id)
            .limit(top_n)
        )).all()
    return [{"id": r.id, "content": r.content, "ltc_stage": r.ltc_stage or "通用", "citation_count": r.citation_count or 0} for r in rows]


async def _get_output_agent_config(key: str) -> dict:
    """Returns {"prompt": str, "skill_ids": [...], "model": str|None}."""
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


async def _get_interview_answers(project_id: str, kind: str) -> list[dict]:
    """返回 [{question_text, answer, stage}]；按 question_key 插入顺序排。"""
    from models.project_interview import ProjectInterviewAnswer
    async with async_session_maker() as s:
        rows = (await s.execute(
            select(ProjectInterviewAnswer).where(
                ProjectInterviewAnswer.project_id == project_id,
                ProjectInterviewAnswer.output_kind == kind,
            ).order_by(ProjectInterviewAnswer.updated_at.asc())
        )).scalars().all()
    return [{"question_text": r.question_text, "answer": r.answer, "question_key": r.question_key} for r in rows if (r.answer or "").strip()]


def _format_answers(answers: list[dict]) -> str:
    if not answers:
        return ""
    lines = []
    for a in answers:
        lines.append(f"**Q：{a['question_text']}**\nA：{a['answer']}")
    return "\n\n".join(lines)


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


# ── Survey ────────────────────────────────────────────────────────────────────

SURVEY_SYSTEM = """你是一位资深的纷享销客 CRM 实施顾问，擅长设计系统调研问卷。
根据项目知识库内容，为实施调研生成专业的问题清单。
要求：
1. 每个大类至少 3 题，最多 8 题
2. 问题要具体可回答，避免宽泛
3. 格式：## 一、业务流程类\\n- 问题…\\n## 二、角色权限类\\n…
4. 五大类：业务流程 / 角色权限 / 数据与集成 / 风险与约束 / 进度与资源"""


async def generate_survey(bundle_id: str, project_id: str):
    try:
        await _mark_bundle(bundle_id, "generating")
        proj = await _get_project(project_id)
        if not proj:
            await _mark_bundle(bundle_id, "failed", error="项目不存在")
            return

        chunks = await _get_project_chunks(project_id, top_n=60)
        agent_cfg = await _get_output_agent_config("survey")
        agent_prompt = agent_cfg["prompt"]
        agent_model = agent_cfg["model"]
        skill_text = await _get_skill_snippets(agent_cfg["skill_ids"])

        if not chunks:
            chunks_text = "（暂无已审核的知识切片，请上传并处理文档后再试）"
        else:
            # Sample representative chunks across stages
            by_stage: dict[str, list[str]] = {}
            for c in chunks:
                by_stage.setdefault(c["ltc_stage"], []).append(c["content"][:400])
            sample_lines = []
            for stage, contents in by_stage.items():
                for content in contents[:5]:
                    sample_lines.append(f"[{stage}] {content}")
            chunks_text = "\n\n".join(sample_lines[:40])

        prompt = f"""项目名称：{proj.name}
客户：{proj.customer or "未填写"}
行业：{proj.industry or "未填写"}
模块：{", ".join(proj.modules or []) or "未填写"}

知识库参考内容（部分）：
{chunks_text}

{f"额外要求：{agent_prompt}" if agent_prompt else ""}

{f"启用的技能参考：{chr(10)}{skill_text}" if skill_text else ""}

请生成详细的实施调研问卷，按五大类组织，返回 Markdown 格式。"""

        md = await _llm_call(prompt, system=SURVEY_SYSTEM, model=agent_model)

        # Build docx
        docx_key: str | None = None
        try:
            docx_bytes = _build_docx(f"调研问卷 · {proj.name}", md)
            docx_key = f"outputs/{bundle_id}/survey.docx"
            _minio_put(docx_key, docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        except Exception as e:
            logger.warning("survey_docx_failed", error=str(e)[:100])

        await _mark_bundle(bundle_id, "done", content_md=md, file_key=docx_key)
        logger.info("survey_generated", bundle_id=bundle_id, project_id=project_id)
    except Exception as e:
        logger.error("survey_failed", bundle_id=bundle_id, error=str(e)[:200])
        await _mark_bundle(bundle_id, "failed", error=str(e)[:500])


# ── Insight ───────────────────────────────────────────────────────────────────

INSIGHT_QUESTIONS = [
    ("项目概览", "请基于知识库内容，描述该项目的整体情况：目标、范围、关键干系人、当前阶段。"),
    ("关键决策点", "梳理该项目在实施过程中已做出的关键决策，以及待决策的重要事项。"),
    ("风险矩阵", "识别该项目的主要风险（技术/业务/组织/进度），评估影响与可能性，并提出应对策略。"),
    ("下一步建议", "基于知识库内容，为项目下一步提供 3–5 条可执行的具体建议。"),
]


async def generate_insight(bundle_id: str, project_id: str):
    try:
        await _mark_bundle(bundle_id, "generating")
        proj = await _get_project(project_id)
        if not proj:
            await _mark_bundle(bundle_id, "failed", error="项目不存在")
            return

        chunks = await _get_project_chunks(project_id, top_n=10)  # 佐证少量即可；主料是访谈
        agent_cfg = await _get_output_agent_config("insight")
        agent_prompt = agent_cfg["prompt"]
        agent_model = agent_cfg["model"]
        skill_text = await _get_skill_snippets(agent_cfg["skill_ids"])
        answers = await _get_interview_answers(project_id, "insight")
        answers_text = _format_answers(answers)

        chunks_text = "\n\n".join(
            f"[{c['ltc_stage']}] {c['content'][:300]}" for c in chunks[:10]
        ) if chunks else ""

        sections = []
        for title, question in INSIGHT_QUESTIONS:
            prompt = f"""项目名称：{proj.name}，客户：{proj.customer or "未知"}，行业：{proj.industry or "未知"}

【访谈记录（主要依据）】
{answers_text or "（未进行访谈）"}

{f"【知识库佐证（辅助参考）】{chr(10)}{chunks_text}" if chunks_text else ""}

{f"【方法论/风格要求】{chr(10)}{agent_prompt}" if agent_prompt else ""}

{f"【启用技能】{chr(10)}{skill_text}" if skill_text else ""}

问题：{question}

请基于访谈记录给出详细、结构化的回答（200–500字），使用 Markdown 格式。若访谈未涵盖该维度，请注明"访谈未覆盖"而不要编造。"""
            answer = await _llm_call(prompt, model=agent_model)
            sections.append(f"## {title}\n\n{answer}")

        report_date = date.today().strftime("%Y年%m月%d日")
        md = f"# {proj.name} · 项目洞察报告\n\n**生成日期**：{report_date}  \n**客户**：{proj.customer or '—'}  \n**行业**：{proj.industry or '—'}\n\n---\n\n" + "\n\n---\n\n".join(sections)

        await _mark_bundle(bundle_id, "done", content_md=md)
        logger.info("insight_generated", bundle_id=bundle_id, project_id=project_id)
    except Exception as e:
        logger.error("insight_failed", bundle_id=bundle_id, error=str(e)[:200])
        await _mark_bundle(bundle_id, "failed", error=str(e)[:500])


# ── Kickoff PPTX ──────────────────────────────────────────────────────────────

PPTX_SYSTEM = """你是一位专业的 CRM 实施顾问，需要为启动会生成 PPT 内容大纲。
每张幻灯片按如下格式输出（严格遵守）：
===SLIDE===
标题：<幻灯片标题>
要点：
- <要点1>
- <要点2>
- <要点3>
===END===
生成 6 张幻灯片：封面、项目概况、LTC 阶段时间线、关键里程碑与交付物、风险与应对、下一步行动"""


async def generate_kickoff_pptx(bundle_id: str, project_id: str):
    try:
        await _mark_bundle(bundle_id, "generating")
        proj = await _get_project(project_id)
        if not proj:
            await _mark_bundle(bundle_id, "failed", error="项目不存在")
            return

        chunks = await _get_project_chunks(project_id, top_n=10)
        agent_cfg = await _get_output_agent_config("kickoff_pptx")
        agent_prompt = agent_cfg["prompt"]
        agent_model = agent_cfg["model"]
        skill_text = await _get_skill_snippets(agent_cfg["skill_ids"])
        answers = await _get_interview_answers(project_id, "kickoff_pptx")
        answers_text = _format_answers(answers)

        chunks_text = "\n\n".join(f"[{c['ltc_stage']}] {c['content'][:300]}" for c in chunks[:10]) if chunks else ""

        kickoff_date_str = proj.kickoff_date.strftime("%Y年%m月%d日") if proj.kickoff_date else "待定"
        prompt = f"""项目名称：{proj.name}
客户：{proj.customer or "未填写"}
行业：{proj.industry or "未填写"}
启动日期：{kickoff_date_str}
实施模块：{", ".join(proj.modules or []) or "未填写"}
项目描述：{proj.description or "无"}

【访谈记录（主要依据）】
{answers_text or "（未进行访谈）"}

{f"【知识库佐证（辅助）】{chr(10)}{chunks_text}" if chunks_text else ""}

{f"【方法论/风格要求】{chr(10)}{agent_prompt}" if agent_prompt else ""}

{f"【启用技能】{chr(10)}{skill_text}" if skill_text else ""}

请基于访谈记录按格式生成 6 张幻灯片的内容。访谈未覆盖的部分标注"待补充"，不要编造。"""

        raw = await _llm_call(prompt, system=PPTX_SYSTEM, model=agent_model)
        slides = _parse_slide_content(raw)

        pptx_bytes = _build_pptx(proj.name, proj.customer, kickoff_date_str, slides)
        pptx_key = f"outputs/{bundle_id}/kickoff.pptx"
        _minio_put(pptx_key, pptx_bytes, "application/vnd.openxmlformats-officedocument.presentationml.presentation")

        # Also save text summary as content_md
        md_lines = [f"# 启动会 PPT · {proj.name}\n"]
        for s in slides:
            md_lines.append(f"## {s['title']}\n")
            for pt in s.get("points", []):
                md_lines.append(f"- {pt}")
            md_lines.append("")
        md = "\n".join(md_lines)

        await _mark_bundle(bundle_id, "done", content_md=md, file_key=pptx_key)
        logger.info("pptx_generated", bundle_id=bundle_id, project_id=project_id)
    except Exception as e:
        logger.error("pptx_failed", bundle_id=bundle_id, error=str(e)[:200])
        await _mark_bundle(bundle_id, "failed", error=str(e)[:500])


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
    # Fallback: if parsing fails, create a single slide
    if not slides:
        slides = [{"title": "启动会", "points": ["内容解析异常，请重新生成"]}]
    return slides[:8]


def _build_pptx(project_name: str, customer: str | None, kickoff_date: str, slides: list[dict]) -> bytes:
    from pptx import Presentation
    from pptx.util import Inches, Pt, Emu
    from pptx.dml.color import RGBColor
    from pptx.enum.text import PP_ALIGN

    prs = Presentation()
    prs.slide_width = Inches(13.33)
    prs.slide_height = Inches(7.5)

    BRAND_ORANGE = RGBColor(0xFF, 0x8D, 0x1A)
    DARK = RGBColor(0x1F, 0x29, 0x37)
    WHITE = RGBColor(0xFF, 0xFF, 0xFF)

    blank_layout = prs.slide_layouts[6]  # Blank

    for i, slide_data in enumerate(slides):
        slide = prs.slides.add_slide(blank_layout)

        # Background
        bg = slide.background.fill
        if i == 0:
            bg.solid()
            bg.fore_color.rgb = BRAND_ORANGE
        else:
            bg.solid()
            bg.fore_color.rgb = WHITE

        # Header bar (non-cover slides)
        if i > 0:
            bar = slide.shapes.add_shape(
                1,  # MSO_SHAPE_TYPE.RECTANGLE
                Inches(0), Inches(0), prs.slide_width, Inches(0.9),
            )
            bar.fill.solid()
            bar.fill.fore_color.rgb = BRAND_ORANGE
            bar.line.fill.background()

        # Title
        title_top = Inches(0) if i == 0 else Inches(0)
        title_tf = slide.shapes.add_textbox(
            Inches(0.7), Inches(2.5) if i == 0 else Inches(0.15),
            Inches(11.9), Inches(1.2) if i == 0 else Inches(0.65),
        ).text_frame
        title_tf.word_wrap = True
        p = title_tf.paragraphs[0]
        run = p.add_run()
        run.text = slide_data["title"]
        run.font.size = Pt(32) if i == 0 else Pt(24)
        run.font.bold = True
        run.font.color.rgb = WHITE if i == 0 else WHITE

        # Subtitle for cover
        if i == 0:
            sub_tf = slide.shapes.add_textbox(
                Inches(0.7), Inches(3.8), Inches(11), Inches(0.8),
            ).text_frame
            p2 = sub_tf.paragraphs[0]
            run2 = p2.add_run()
            run2.text = f"{customer or ''}  ·  启动会  ·  {kickoff_date}"
            run2.font.size = Pt(18)
            run2.font.color.rgb = WHITE

        # Bullet points
        if slide_data.get("points") and i > 0:
            content_tf = slide.shapes.add_textbox(
                Inches(0.7), Inches(1.2), Inches(11.9), Inches(5.8),
            ).text_frame
            content_tf.word_wrap = True
            for j, pt in enumerate(slide_data["points"]):
                if j == 0:
                    para = content_tf.paragraphs[0]
                else:
                    para = content_tf.add_paragraph()
                run = para.add_run()
                run.text = f"• {pt}"
                run.font.size = Pt(18)
                run.font.color.rgb = DARK
                para.space_after = Pt(8)

    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()


def _build_docx(title: str, md: str) -> bytes:
    from docx import Document as DocxDoc
    from docx.shared import Pt, RGBColor as DocxRGB

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

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _minio_put(key: str, data: bytes, content_type: str):
    from minio import Minio
    mc = Minio(settings.minio_endpoint, access_key=settings.minio_user, secret_key=settings.minio_password, secure=False)
    mc.put_object(settings.minio_bucket, key, io.BytesIO(data), len(data), content_type=content_type)
