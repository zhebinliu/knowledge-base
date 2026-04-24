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


async def _llm_call(prompt: str, system: str = "", model: str | None = None, max_tokens: int = 8000) -> str:
    from services.model_router import model_router
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    if model:
        content, _ = await model_router.chat(model, messages, max_tokens=max_tokens)
    else:
        content, _ = await model_router.chat_with_routing("doc_generation", messages, max_tokens=max_tokens)
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


# ── Kickoff PPTX（HTML 交付物，Claude 风格） ─────────────────────────────────

HTML_PPTX_SYSTEM = """你是一位 MBB 风格咨询顾问，负责为 CRM 实施项目的启动会生成【可直接交付给甲方高层】的幻灯片。
输出形态：一个完整自包含的 HTML 文件字符串，绝对不要 ```html 代码块围栏，直接从 <!DOCTYPE html> 开始。

【硬性规范】
- 16:9，每页固定 1280×720 像素，使用 <section class="slide"> 容器。
- 所有样式写在顶部 <style>，不引用外部 CSS/JS/图片，不使用 emoji。
- 字体栈："PingFang SC","Microsoft YaHei",-apple-system,"Helvetica Neue",sans-serif
- 色板（严格只用这几个）：主橙 #D96400，亮橙 #FB923C，墨黑 #1F2937，次灰 #4B5563，弱灰 #9CA3AF，分隔线 #E5E7EB，背景米白 #FAFAFA，纯白 #FFFFFF
- 12 栅格，边距 64px，默认行高 1.5。
- 多页之间用 CSS page-break 分页，便于浏览器打印 PDF：每个 .slide 设置 page-break-after: always。
- body 背景 #FAFAFA，slide 背景 #FFFFFF，阴影 0 4px 24px rgba(0,0,0,.06)。
- slide 设 overflow:hidden，宽 1280px 高 720px，居中 margin:24px auto。

【字号层级】封面主标 52px / 副标 22px；页面标题 32px；小节标题 20px；正文 16px；图注/页脚 12px。

【必须包含的页（按顺序，缺失信息用"[待确认]"而不是编造）】
1. 封面：客户名 + "启动会" + 日期；左侧品牌色竖条；右下角"Fenxiao CRM · LTC 实施方法论"脚标
2. 议程：6 条编号目录，右侧橙色数字
3. 现状与挑战：左 2×2 矩阵（业务痛点×系统约束）+ 右摘要文案
4. 项目目标：3 条 SMART 目标卡片，每条含指标
5. 范围边界：In-scope / Out-of-scope 双列对照表
6. 方法论：LTC 阶段 chevron 流（机会→合同→交付→回款），当前阶段深橙，其他浅灰
7. 实施路径：甘特条（至少 4 阶段，双周粒度），行高 28px，橙条 + 里程碑菱形
8. 团队与治理：RACI 表（甲方 / 乙方 / 联合），单元格用 ● / ○ / 空
9. 风险与应对：表格（风险 | 影响 | 可能性 | 应对策略），影响/可能性用 高/中/低 彩色标签
10. 资源与投入：人天分布柱状条 + 关键角色卡
11. 下一步 Next Step：本周 / 下周 Action Items，每条含 Owner + deadline + 橙色圆点

【视觉元件实现提示】
- chevron 用 clip-path: polygon(0 0, calc(100% - 20px) 0, 100% 50%, calc(100% - 20px) 100%, 0 100%, 20px 50%);
- 2×2 矩阵用 grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr;
- 甘特条用 position:relative + absolute 定位的彩色 div
- RACI 表用纯 table + border-collapse

【文案规范】
- 每页标题必须是结论句（"基于现状诊断，优先打通三大主数据"），不是描述句（"现状分析"）
- 不要咨询黑话（赋能/抓手/闭环/生态/链路）
- 每个主张至少 1 个数字（若访谈没有数据，标 [待确认]）

【输出】直接输出完整 HTML 字符串，不要任何解释、不要 markdown 围栏、不要前后语。从 <!DOCTYPE html> 起到 </html> 止。"""


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

请生成完整的启动会 HTML 幻灯片（11 页）。直接输出 HTML 字符串。"""

        html_raw = await _llm_call(prompt, system=HTML_PPTX_SYSTEM, model=ctx["agent_model"], max_tokens=16000)
        html = _strip_html_fences(html_raw)
        if not html.lstrip().lower().startswith("<!doctype") and "<html" not in html.lower():
            html = _fallback_html(title_name, customer, kickoff_date_str, html_raw)

        html_key = f"outputs/{bundle_id}/kickoff.html"
        _minio_put(html_key, html.encode("utf-8"), "text/html; charset=utf-8")

        # 同时保留 markdown 便于预览
        md = f"# {customer or title_name} · 启动会 PPT\n\n" \
             f"**生成日期**：{date.today().strftime('%Y-%m-%d')}  \n" \
             f"**客户**：{customer or '—'}  \n" \
             f"**行业**：{ctx['industry'] or '—'}\n\n" \
             f"> HTML 幻灯片已生成，点击下载后浏览器打开，使用「打印 → 另存为 PDF」可导出 PDF。"

        await _mark_bundle(bundle_id, "done", content_md=md, file_key=html_key)
        await _mark_conversation(bundle_id, "done")
        logger.info("pptx_generated", bundle_id=bundle_id, project_id=project_id, format="html",
                    size=len(html))
    except Exception as e:
        logger.error("pptx_failed", bundle_id=bundle_id, error=str(e)[:200])
        await _mark_bundle(bundle_id, "failed", error=str(e)[:500])
        await _mark_conversation(bundle_id, "failed")


def _strip_html_fences(raw: str) -> str:
    """剥掉模型可能输出的 ```html / ``` 围栏。"""
    s = raw.strip()
    if s.startswith("```"):
        # 去掉首行围栏
        first_nl = s.find("\n")
        if first_nl >= 0:
            s = s[first_nl + 1:]
        if s.endswith("```"):
            s = s[:-3]
    return s.strip()


def _fallback_html(title: str, customer: str, kickoff_date: str, raw: str) -> str:
    """模型没吐正确 HTML 时的兜底：把原文塞进一个简单壳里，至少可下载。"""
    import html as _h
    body = _h.escape(raw)
    return f"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>{_h.escape(customer or title)} 启动会</title>
<style>body{{font-family:"PingFang SC","Microsoft YaHei",sans-serif;background:#FAFAFA;color:#1F2937;padding:48px;line-height:1.7}}
h1{{color:#D96400}} pre{{white-space:pre-wrap;background:#fff;padding:24px;border-radius:8px;border:1px solid #E5E7EB}}</style>
</head><body><h1>{_h.escape(customer or title)} 启动会</h1><p>日期：{_h.escape(kickoff_date)}</p>
<p style="color:#9CA3AF;font-size:12px">（HTML 解析失败，以下为模型原始输出）</p>
<pre>{body}</pre></body></html>"""


# ── Helpers ───────────────────────────────────────────────────────────────────



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
