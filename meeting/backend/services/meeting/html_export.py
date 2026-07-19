"""会议纪要 HTML 导出 — 参考 deepseek_html 布局风格。

调用方: `/api/meeting/{id}/export-html` 端点。

生成带内联样式的独立 HTML 文件，可直接在浏览器中打开，布局包含:
  - Hero 标题区(渐变背景)
  - 参会人员条
  - 摘要卡片
  - 议题块(分组讨论内容)
  - 待办项表格
  - 页脚
"""
from __future__ import annotations

import json
from typing import Any

import structlog

logger = structlog.get_logger()

_CSS = """
*{margin:0;padding:0;box-sizing:border-box}
body{background:#eef2f5;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;padding:2rem 1rem;color:#1e2a3e}
.meeting-container{max-width:1100px;margin:0 auto;background:white;border-radius:28px;box-shadow:0 20px 35px -12px rgba(0,0,0,0.1);overflow:hidden}
.hero{background:linear-gradient(135deg,#1a3a5c 0%,#2a5f7e 100%);padding:2rem 2.2rem 1.8rem;color:white;border-bottom:5px solid #ffb347}
.hero h1{font-size:1.9rem;font-weight:600;letter-spacing:-0.3px;margin-bottom:0.3rem}
.hero .subhead{font-size:1rem;opacity:0.9;margin-bottom:1rem;border-left:3px solid #ffb347;padding-left:1rem}
.meta-grid{display:flex;flex-wrap:wrap;gap:1.5rem;margin-top:0.5rem;background:rgba(255,255,255,0.12);padding:0.7rem 1rem;border-radius:20px;font-size:0.9rem;backdrop-filter:blur(2px)}
.meta-grid .meta-item{display:flex;align-items:center;gap:0.3rem}
.attendees{background:#f8fafc;padding:0.7rem 2rem;border-bottom:1px solid #e2edf2;font-size:0.85rem;color:#2c5a7a;font-weight:500;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center}
.content{padding:1.8rem 2rem 2.2rem}
.summary-card{background:#fef7e8;border-left:6px solid #ffb347;padding:1.2rem 1.5rem;border-radius:20px;margin-bottom:2rem;box-shadow:0 2px 5px rgba(0,0,0,0.02)}
.summary-card p{font-size:1rem;line-height:1.5;color:#2c3e2f}
.section-title{font-size:1.4rem;font-weight:600;color:#1a5a7e;border-left:5px solid #ffb347;padding-left:1rem;margin:1.8rem 0 1rem 0}
.topic-block{background:#fff;border-radius:20px;border:1px solid #e9edf2;margin-bottom:1.5rem;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,0.02)}
.topic-header{background:#f9fbfd;padding:0.9rem 1.5rem;font-weight:700;font-size:1.05rem;color:#1e4663;border-bottom:1px solid #eef2f8;display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap}
.topic-header .tag{background:#eef2ff;font-size:0.7rem;font-weight:500;padding:0.2rem 0.7rem;border-radius:40px;color:#1b4a6e}
.topic-body{padding:1rem 1.5rem 1.2rem}
.topic-body ul,.topic-body p{margin-bottom:0.6rem;line-height:1.6}
.topic-body li{margin-left:1.5rem;margin-bottom:0.35rem}
.highlight{background:#fef3e2;padding:0.1rem 0.3rem;border-radius:6px;font-weight:500;color:#bc6f00}
.todo-table-wrapper{background:#fefcf5;border-radius:24px;border:1px solid #f0e5d2;overflow-x:auto;margin:1rem 0 0.5rem}
.todo-table{width:100%;border-collapse:collapse;font-size:0.9rem}
.todo-table th{background:#eef2f0;text-align:left;padding:0.8rem 1rem;font-weight:600;color:#2c4e6e;border-bottom:1px solid #dce5e5}
.todo-table td{padding:0.8rem 1rem;border-bottom:1px solid #e9ecef;vertical-align:top}
.todo-table tr:last-child td{border-bottom:none}
.assignee{background:#eaf4ff;display:inline-block;padding:0.15rem 0.8rem;border-radius:40px;font-size:0.8rem;font-weight:500;color:#1f6392}
.tag.green{background:#e6f7f0;color:#1e7b4b}
.tag.orange{background:#fff0e0;color:#c26b1a}
.tag.blue{background:#e9f4ff;color:#2b6e9e}
.tag.red{background:#ffe6e5;color:#bc4e2c}
.insight-box{background:#f0f6fa;border-radius:12px;padding:0.5rem 1rem;margin-top:6px}
.warn-box{background:#fef3e2;border-radius:12px;padding:0.5rem 1rem;margin-top:6px}
.footer-note{font-size:0.75rem;text-align:right;color:#8ba0b0;margin-top:1.5rem;border-top:1px solid #e9edf2;padding-top:1rem}
.flow-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.8rem;margin:0.8rem 0}
.flow-step{background:#f6faff;border-radius:16px;padding:0.8rem 1rem;border:1px solid #e2ecf5;text-align:center;font-size:0.9rem;font-weight:600;color:#1a4d5e}
.flow-step span{display:block;font-weight:400;font-size:0.8rem;color:#3a6b8c;margin-top:4px}
@media(max-width:768px){.flow-grid{grid-template-columns:1fr}.content{padding:1.2rem}.hero{padding:1.4rem}}
"""

TAG_COLORS = ["blue", "green", "orange", "red"]


def _escape(text: str) -> str:
    """HTML 实体转义。"""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def _render_attendees(attendees: list[str]) -> str:
    """渲染参会人员条。"""
    if not attendees:
        return ""
    names = "、".join(str(a) for a in attendees if a)
    return f"""<div class="attendees">
        <span>👥 参会人员：</span>
        <span>{_escape(names)}</span>
    </div>"""


def _render_summary(summary: str) -> str:
    """渲染会议摘要卡片。"""
    if not summary or not summary.strip():
        return ""
    return f"""<div class="summary-card">
        <p>📌 <strong>会议摘要</strong>：{_escape(summary.strip())}</p>
    </div>"""


def _render_key_points(key_points: list[dict]) -> str:
    """渲染议题讨论内容。每个 key_point 作为一个 topic-block。"""
    if not key_points:
        return ""

    blocks: list[str] = []
    for i, kp in enumerate(key_points):
        if not isinstance(kp, dict):
            continue
        topic = (kp.get("topic") or "").strip()
        content = (kp.get("content") or "").strip()
        if not topic and not content:
            continue

        tag_idx = i % len(TAG_COLORS)
        tag_class = TAG_COLORS[tag_idx]
        tag_label = {"blue": "议题讨论", "green": "决议事项", "orange": "过程资产", "red": "重点关注"}[tag_class] if i < 4 else "议题讨论"

        # 保留内容中的 markdown 换行为 <br>
        content_html = _escape(content).replace("\n", "<br>")

        blocks.append(f"""<div class="topic-block">
        <div class="topic-header">
            <span>📌 {_escape(topic)}</span>
            <span class="tag {tag_class}">{tag_label}</span>
        </div>
        <div class="topic-body">
            <p>{content_html}</p>
        </div>
    </div>""")

    if not blocks:
        return ""
    return "\n".join(blocks)


def _render_decisions(decisions: list[dict]) -> str:
    """渲染决议事项。"""
    if not decisions:
        return ""

    items: list[str] = []
    for d in decisions:
        if not isinstance(d, dict):
            continue
        c = (d.get("content") or "").strip()
        o = (d.get("owner") or "").strip()
        line = f"<li>{_escape(c)}"
        if o:
            line += f"（负责人：<span class=\"highlight\">{_escape(o)}</span>）"
        line += "</li>"
        items.append(line)

    if not items:
        return ""

    return f"""<div class="section-title">✅ 决议事项</div>
    <div class="topic-block">
        <div class="topic-header">
            <span>📌 本次会议决议</span>
            <span class="tag green">决议</span>
        </div>
        <div class="topic-body">
            <ul>
                {"\n".join(items)}
            </ul>
        </div>
    </div>"""


def _render_action_items_table(action_items: list[dict]) -> str:
    """渲染待办项表格。"""
    if not action_items:
        return ""

    rows: list[str] = []
    for idx, a in enumerate(action_items, start=1):
        if not isinstance(a, dict):
            continue
        task = (a.get("task") or "").strip()
        owner = (a.get("owner") or "").strip()
        deadline = (a.get("deadline") or "").strip()
        if deadline:
            task_display = f"{task}（截止：{deadline}）"
        else:
            task_display = task
        rows.append(f"""<tr>
            <td>{_escape(task_display)}</td>
            <td><span class="assignee">{_escape(owner)}</span></td>
        </tr>""")

    if not rows:
        return ""

    return f"""<div class="section-title">📋 待办事项 &amp; 责任人</div>
    <div class="todo-table-wrapper">
        <table class="todo-table">
            <thead>
                <tr><th style="width:58%">📌 待办内容</th><th>👤 负责人</th></tr>
            </thead>
            <tbody>
                {"\n".join(rows)}
            </tbody>
        </table>
    </div>"""


def _render_meta_items(
    meeting_title: str,
    meeting_time: str,
    meeting_location: str,
    meeting_host: str,
    meeting_recorder: str,
    meeting_format: str,
    organizer: str,
) -> str:
    """渲染 Hero 区 meta 信息条。"""
    parts: list[str] = []
    if meeting_time:
        parts.append(f'<div class="meta-item">📅 会议时间：{_escape(meeting_time)}</div>')
    if meeting_location:
        parts.append(f'<div class="meta-item">📍 地点：{_escape(meeting_location)}</div>')
    if meeting_host:
        parts.append(f'<div class="meta-item">🎤 主持：{_escape(meeting_host)}</div>')
    if meeting_recorder:
        parts.append(f'<div class="meta-item">✍️ 记录：{_escape(meeting_recorder)}</div>')
    if meeting_format:
        parts.append(f'<div class="meta-item">📋 形式：{_escape(meeting_format)}</div>')
    if organizer:
        parts.append(f'<div class="meta-item">📢 召集：{_escape(organizer)}</div>')
    if not parts:
        return ""
    return f"""<div class="meta-grid">
        {"\n".join(parts)}
    </div>"""


def render_minutes_html(
    meeting_title: str,
    minutes: dict[str, Any],
    fallback_time: str = "",
) -> str:
    """根据 minutes 数据生成完整 HTML 字符串。

    参数:
        meeting_title: 会议标题(来自 Meeting.title)
        minutes: meeting_minutes 字典
        fallback_time: 兜底时间字符串

    返回:
        完整 HTML 字符串。
    """
    m_title = (minutes.get("meeting_title") or meeting_title or "会议纪要").strip()
    m_time = (minutes.get("meeting_time") or fallback_time or "").strip()
    m_location = (minutes.get("meeting_location") or "").strip()
    m_host = (minutes.get("meeting_host") or "").strip()
    m_recorder = (minutes.get("meeting_recorder") or "").strip()
    m_format = (minutes.get("meeting_format") or "").strip()
    m_organizer = (minutes.get("organizer") or "").strip()

    attendees = minutes.get("attendees") or []
    if isinstance(attendees, list):
        attendees_list = [str(a) for a in attendees if a]
    else:
        attendees_list = [str(attendees)] if attendees else []

    summary = (minutes.get("summary") or "").strip()
    key_points = minutes.get("key_points") or []
    decisions = minutes.get("decisions") or []
    action_items = minutes.get("action_items") or []

    # 副标题：取前几个议题主题拼接
    subhead_parts = []
    if key_points:
        for kp in key_points[:3]:
            if isinstance(kp, dict) and kp.get("topic"):
                subhead_parts.append(kp["topic"].strip())
    subhead = " · ".join(subhead_parts) if subhead_parts else "会议纪要"

    meta_html = _render_meta_items(
        meeting_title=m_title,
        meeting_time=m_time,
        meeting_location=m_location,
        meeting_host=m_host,
        meeting_recorder=m_recorder,
        meeting_format=m_format,
        organizer=m_organizer,
    )
    attendees_html = _render_attendees(attendees_list)
    summary_html = _render_summary(summary)
    key_points_html = _render_key_points(key_points)
    decisions_html = _render_decisions(decisions)
    todo_html = _render_action_items_table(action_items)

    # 会议记录人/格式等附加信息
    extra_bits = []
    if m_recorder:
        extra_bits.append(f"记录人：{m_recorder}")
    if m_format:
        extra_bits.append(f"会议形式：{m_format}")
    footer_text = " · ".join(extra_bits) if extra_bits else ""

    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
    <title>会议纪要：{_escape(m_title)}</title>
    <style>
{_CSS}
    </style>
</head>
<body>
<div class="meeting-container">
    <div class="hero">
        <h1>🧠 {_escape(m_title)}</h1>
        <div class="subhead">{_escape(subhead)}</div>
        {meta_html}
    </div>
    {attendees_html}
    <div class="content">
        {summary_html}
        {key_points_html}
        {decisions_html}
        {todo_html}
        <div class="footer-note">
            📌 {_escape(footer_text) if footer_text else "会议纪要 · AI 自动生成"}
        </div>
    </div>
</div>
</body>
</html>"""

    logger.info("minutes_html_rendered", title=m_title[:40], html_bytes=len(html))
    return html
