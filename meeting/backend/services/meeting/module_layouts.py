"""会议模块导出 HTML 排版模板 — 2026-07。

每个模块 3 套排版，返回自包含的内联 CSS HTML 字符串。
排版 ID 即为函数名后缀，注册表 LAYOUTS_BY_MODULE 控制每个模块暴露哪些排版。
"""

from __future__ import annotations

# ── 排版注册表 ─────────────────────────────────────────────────────────────

LAYOUTS_BY_MODULE: dict[str, list[dict[str, str]]] = {
    "advice": [
        {"id": "compact_list", "name": "清单式", "description": "按类别分组的简洁列表，每条一句话，适合快速浏览"},
        {"id": "card_grid", "name": "卡片网格", "description": "双列卡片完整展示建议、问法和推荐方案"},
        {"id": "question_focused", "name": "问题导向式", "description": "突出引导客户的确认问法，按类别分区展示"},
    ],
    "requirements": [
        {"id": "standard_table", "name": "标准表格", "description": "统一大表展示全部需求字段，适合导入其他系统"},
        {"id": "grouped_by_priority", "name": "按优先级分组", "description": "P0/P1/P2/P3 四个优先级分区，各有彩色标题栏"},
        {"id": "grouped_by_module", "name": "按模块分组", "description": "按业务模块分区，快速定位各模块需求分布"},
    ],
    "process_flows": [
        {"id": "flow_with_diagram", "name": "流程图+详情", "description": "完整展示流程图(Mermaid)与描述、出处"},
        {"id": "grouped_by_category", "name": "按类别分组", "description": "业务流程/工作流/审批流/操作步骤 分区展示"},
        {"id": "compact_summary", "name": "精简摘要", "description": "仅标题+类别+摘要，不含流程图，适合管理层汇报"},
    ],
    "stakeholders": [
        {"id": "name_card_grid", "name": "名片网格", "description": "三列卡片网格，展示姓名/角色/立场/关键观点，底部附关系列表"},
        {"id": "grouped_by_side", "name": "按立场分组", "description": "我方/客户/合作方/未知 四大立场分区"},
        {"id": "relation_focused", "name": "关系视图", "description": "协作关系列表在前，干系人简表在后，突出汇报关系"},
    ],
}

# ── 共享 CSS 基础 ──────────────────────────────────────────────────────────

_BASE_CSS = """
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans SC", "Helvetica Neue", sans-serif;
  font-size: 14px; line-height: 1.6; color: #1a1a2e; background: #ffffff;
  padding: 32px 40px; max-width: 1200px; margin: 0 auto;
}
h1 { font-size: 24px; font-weight: 700; margin-bottom: 6px; color: #111; }
h2 { font-size: 18px; font-weight: 600; margin: 24px 0 12px; color: #333; border-bottom: 2px solid #FF8D1A; padding-bottom: 6px; }
h3 { font-size: 15px; font-weight: 600; margin: 16px 0 8px; color: #555; }
.subtitle { font-size: 13px; color: #888; margin-bottom: 20px; }
table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
th { background: #FFF4E6; text-align: left; padding: 8px 10px; font-weight: 600; border: 1px solid #e5e7eb; color: #555; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
td { padding: 8px 10px; border: 1px solid #e5e7eb; vertical-align: top; }
tr:nth-child(even) td { background: #fafafa; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.p0 { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
.p1 { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
.p2 { background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }
.p3 { background: #f3f4f6; color: #6b7280; border: 1px solid #e5e7eb; }
.cat-clarification { background: #dbeafe; color: #1e40af; }
.cat-ambiguity { background: #fef3c7; color: #92400e; }
.cat-gap { background: #fee2e2; color: #991b1b; }
.cat-industry { background: #ede9fe; color: #5b21b6; }
.cat-consensus { background: #d1fae5; color: #065f46; }
.side-internal { background: #dbeafe; color: #1e40af; }
.side-customer { background: #d1fae5; color: #065f46; }
.side-vendor { background: #ede9fe; color: #5b21b6; }
.side-unknown { background: #f3f4f6; color: #6b7280; }
blockquote { border-left: 3px solid #FF8D1A; padding: 8px 14px; margin: 10px 0; background: #fff8f0; color: #666; font-style: italic; font-size: 13px; }
pre.mermaid { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 12px 0; overflow-x: auto; text-align: center; }
.card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; background: #fff; }
.card-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.card-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.section-header { display: flex; align-items: center; gap: 8px; margin: 20px 0 10px; }
.color-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #aaa; text-align: center; }
.timestamp { font-family: monospace; font-size: 11px; color: #D96400; background: #fff4e6; padding: 1px 6px; border-radius: 3px; }
.priority-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
.priority-dot.high { background: #dc2626; }
.priority-dot.medium { background: #d97706; }
.priority-dot.low { background: #9ca3af; }
.label-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 4px; }
.chip { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; border: 1px solid #e5e7eb; background: #f9fafb; color: #555; }
"""


def _html_wrap(title: str, body: str, extra_head: str = "") -> str:
    """将 body HTML 包装为完整自包含 HTML 文档。"""
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{_esc(title)}</title>
<style>{_BASE_CSS}</style>
{extra_head}
</head>
<body>
<h1>{_esc(title)}</h1>
{body}
<div class="footer">由 KB 知识库系统生成 · {_esc(title)}</div>
</body>
</html>"""


def _esc(s: str) -> str:
    """HTML 转义。"""
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def _fmt_ts(seconds: float | None) -> str:
    """秒数 → MM:SS 字符串。"""
    if seconds is None:
        return ""
    m = int(seconds // 60)
    s = int(seconds % 60)
    return f"{m:02d}:{s:02d}"


def _ts_badge(seconds: float | None) -> str:
    """时间戳 HTML 片段。"""
    t = _fmt_ts(seconds)
    if not t:
        return ""
    return f'<span class="timestamp">{_esc(t)}</span>'


# ═══════════════════════════════════════════════════════════════════════════
# Co-pilot 建议 (advice) 排版
# ═══════════════════════════════════════════════════════════════════════════

CAT_COLORS = {
    "clarification": "#2563eb",
    "ambiguity": "#d97706",
    "gap": "#dc2626",
    "industry": "#7c3aed",
    "consensus": "#059669",
}

CAT_LABELS = {
    "clarification": "需进一步明确",
    "ambiguity": "歧义点",
    "gap": "可能遗漏",
    "industry": "行业专属问题",
    "consensus": "已达成共识",
}

PRIORITY_LABELS = {"high": "高优", "medium": "中优", "low": "低优"}


def _build_advice_html_compact_list(items: list[dict], meeting_title: str) -> str:
    """清单式:按类别分组的简洁列表。"""
    grouped: dict[str, list[dict]] = {}
    for a in items:
        cat = a.get("category", "clarification")
        grouped.setdefault(cat, []).append(a)

    parts = []
    for cat in ["clarification", "ambiguity", "gap", "industry", "consensus"]:
        group = grouped.get(cat, [])
        if not group:
            continue
        color = CAT_COLORS.get(cat, "#6b7280")
        label = CAT_LABELS.get(cat, cat)
        parts.append(f'<h2 style="border-color:{color}">{_esc(label)} ({len(group)})</h2>')
        for a in group:
            priority_class = f"priority-dot {a.get('priority', 'medium')}"
            ts_badge = _ts_badge(a.get("source_ts"))
            parts.append(f"""<div class="card" style="margin-bottom:10px">
<div class="label-row">
  <span class="{priority_class}"></span>
  <strong>{_esc(a.get('title', ''))}</strong>
  {ts_badge}
</div>
<div style="font-size:13px;color:#555;margin-top:4px">{_esc(a.get('question') or '')}</div>
</div>""")

    return _html_wrap(f"Co-pilot 建议 · {meeting_title} (清单式)", "\n".join(parts))


def _build_advice_html_card_grid(items: list[dict], meeting_title: str) -> str:
    """卡片网格:双列完整卡片。"""
    cards = []
    for a in items:
        cat = a.get("category", "clarification")
        cat_cls = f"cat-{cat}"
        cat_label = CAT_LABELS.get(cat, cat)
        priority_class = f"priority-dot {a.get('priority', 'medium')}"
        ts_badge = _ts_badge(a.get("source_ts"))
        cards.append(f"""<div class="card">
<div class="label-row">
  <span class="{priority_class}"></span>
  <span class="badge {cat_cls}">{_esc(cat_label)}</span>
  {ts_badge}
</div>
<div style="font-weight:600;margin:6px 0 4px">{_esc(a.get('title', ''))}</div>
{('<div style="background:#fff8f0;border-left:3px solid #FF8D1A;padding:6px 10px;margin:6px 0;font-size:13px">💬 ' + _esc(a['question']) + '</div>') if a.get('question') else ''}
{('<details style="margin-top:6px"><summary style="font-size:12px;color:#888;cursor:pointer">💡 建议</summary><div style="font-size:13px;color:#555;margin-top:4px;white-space:pre-wrap">' + _esc(a['recommendation']) + '</div></details>') if a.get('recommendation') else ''}
{('<blockquote style="font-size:12px">' + _esc(a['source_quote']) + '</blockquote>') if a.get('source_quote') else ''}
</div>""")

    body = f'<div class="subtitle">共 {len(items)} 条建议</div>\n<div class="card-grid">\n' + "\n".join(cards) + "\n</div>"
    return _html_wrap(f"Co-pilot 建议 · {meeting_title} (卡片网格)", body)


def _build_advice_html_question_focused(items: list[dict], meeting_title: str) -> str:
    """问题导向式:突出引导问法，按类别分区。"""
    grouped: dict[str, list[dict]] = {}
    for a in items:
        cat = a.get("category", "clarification")
        grouped.setdefault(cat, []).append(a)

    parts = []
    for cat in ["clarification", "ambiguity", "gap", "industry", "consensus"]:
        group = grouped.get(cat, [])
        if not group:
            continue
        color = CAT_COLORS.get(cat, "#6b7280")
        label = CAT_LABELS.get(cat, cat)
        parts.append(f'<h2 style="border-color:{color}">{_esc(label)}</h2>')
        for a in group:
            ts_badge = _ts_badge(a.get("source_ts"))
            parts.append(f"""<div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:12px;background:#fff">
<div style="font-size:16px;font-weight:600;color:#D96400;margin-bottom:8px">💬 {_esc(a.get('question') or a.get('title', ''))}</div>
<div style="font-size:13px;color:#555;margin-bottom:6px">📌 {_esc(a.get('title', ''))}</div>
{('<div style="font-size:13px;color:#666;white-space:pre-wrap;margin-top:8px;padding:10px;background:#f9fafb;border-radius:6px">' + _esc(a['recommendation']) + '</div>') if a.get('recommendation') else ''}
<div class="label-row" style="margin-top:8px">
  <span class="badge cat-{cat}">{_esc(label)}</span>
  {ts_badge}
  <span class="chip">{_esc(PRIORITY_LABELS.get(a.get('priority', 'medium'), a.get('priority', 'medium')))}</span>
</div>
</div>""")

    return _html_wrap(f"Co-pilot 建议 · {meeting_title} (问题导向式)", "\n".join(parts))


# ═══════════════════════════════════════════════════════════════════════════
# 需求清单 (requirements) 排版
# ═══════════════════════════════════════════════════════════════════════════

PRIORITY_CLASSES = {"P0": "p0", "P1": "p1", "P2": "p2", "P3": "p3"}


def _render_req_table(reqs: list[dict], cols: list[str] | None = None) -> str:
    """渲染需求表格。cols 可选 ['req_id','module','description','priority','time','speaker']。"""
    if cols is None:
        cols = ["req_id", "module", "description", "priority", "time", "speaker"]
    col_labels = {"req_id": "编号", "module": "模块", "description": "需求描述", "priority": "优先级", "time": "时间", "speaker": "提出人"}
    rows_html = []
    for r in reqs:
        cells = []
        for c in cols:
            if c == "priority":
                p = r.get("priority", "P2")
                cls = PRIORITY_CLASSES.get(p, "p2")
                cells.append(f'<td style="text-align:center"><span class="badge {cls}">{_esc(p)}</span></td>')
            elif c == "time":
                start = r.get("start_seconds")
                end = r.get("end_seconds")
                t = ""
                if start is not None:
                    t = _fmt_ts(start)
                    if end is not None:
                        t += f" - {_fmt_ts(end)}"
                cells.append(f"<td>{_esc(t) or '—'}</td>")
            elif c == "module":
                m = r.get("module", "")
                cells.append(f"<td>{('<span class="chip">' + _esc(m) + '</span>') if m else '—'}</td>")
            else:
                val = r.get(c, "")
                cells.append(f"<td>{_esc(str(val)) if val else '—'}</td>")
        rows_html.append("<tr>" + "".join(cells) + "</tr>")

    header = "<tr>" + "".join(f"<th>{_esc(col_labels.get(c, c))}</th>" for c in cols) + "</tr>"
    return f"<table>{header}<tbody>{''.join(rows_html)}</tbody></table>"


def _build_requirements_html_standard_table(reqs: list[dict], meeting_title: str) -> str:
    """标准表格:统一大表。"""
    body = f'<div class="subtitle">共 {len(reqs)} 条需求</div>\n{_render_req_table(reqs)}'
    return _html_wrap(f"需求清单 · {meeting_title} (标准表格)", body)


def _build_requirements_html_grouped_by_priority(reqs: list[dict], meeting_title: str) -> str:
    """按优先级分组。"""
    grouped: dict[str, list[dict]] = {"P0": [], "P1": [], "P2": [], "P3": []}
    for r in reqs:
        p = r.get("priority", "P2")
        grouped.setdefault(p, []).append(r)

    parts = [f'<div class="subtitle">共 {len(reqs)} 条需求</div>']
    for p in ["P0", "P1", "P2", "P3"]:
        group = grouped.get(p, [])
        if not group:
            continue
        cls = PRIORITY_CLASSES.get(p, "p2")
        parts.append(f'<h2><span class="badge {cls}" style="font-size:14px;padding:4px 12px">{p} · {len(group)} 条</span></h2>')
        parts.append(_render_req_table(group))
    return _html_wrap(f"需求清单 · {meeting_title} (按优先级)", "\n".join(parts))


def _build_requirements_html_grouped_by_module(reqs: list[dict], meeting_title: str) -> str:
    """按模块分组。"""
    grouped: dict[str, list[dict]] = {}
    for r in reqs:
        m = r.get("module") or "未分类"
        grouped.setdefault(m, []).append(r)

    parts = [f'<div class="subtitle">共 {len(reqs)} 条需求，{len(grouped)} 个模块</div>']
    for mod in sorted(grouped.keys()):
        group = grouped[mod]
        parts.append(f"<h2>{_esc(mod)} ({len(group)})</h2>")
        parts.append(_render_req_table(group, ["req_id", "description", "priority", "time", "speaker"]))
    return _html_wrap(f"需求清单 · {meeting_title} (按模块)", "\n".join(parts))


# ═══════════════════════════════════════════════════════════════════════════
# 业务流程 (process_flows) 排版
# ═══════════════════════════════════════════════════════════════════════════

FLOW_CAT_CLASSES = {
    "业务流程": "cat-clarification",
    "工作流": "cat-industry",
    "审批流": "cat-ambiguity",
    "操作步骤": "cat-consensus",
}

_MERMAID_CDN_SCRIPT = """<script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
mermaid.initialize({ startOnLoad: true, theme: 'default', securityLevel: 'loose' });
</script>"""


def _build_flows_html_flow_with_diagram(flows: list[dict], meeting_title: str) -> str:
    """流程图+详情:完整展示。"""
    parts = [f'<div class="subtitle">共 {len(flows)} 个流程</div>']
    for f in flows:
        cat = f.get("category", "业务流程")
        cat_cls = FLOW_CAT_CLASSES.get(cat, "")
        ts_badge = _ts_badge(f.get("start_seconds"))
        parts.append(f"""<div class="card" style="margin-bottom:16px">
<div class="label-row">
  <span class="badge {cat_cls}">{_esc(cat)}</span>
  <span style="font-size:11px;color:#888">{_esc(f.get('flow_id', ''))}</span>
  {ts_badge}
</div>
<h3 style="margin:8px 0;border:none;padding:0">{_esc(f.get('title', ''))}</h3>
{('<p style="font-size:13px;color:#555;margin:8px 0">' + _esc(f['summary']) + '</p>') if f.get('summary') else ''}
{('<p style="font-size:13px;color:#666;margin:8px 0;white-space:pre-wrap">' + _esc(f['description']) + '</p>') if f.get('description') else ''}
{('<blockquote>' + _esc(f['source']) + (' — ' + _esc(f['speaker']) if f.get('speaker') else '') + '</blockquote>') if f.get('source') else ''}
{('<pre class="mermaid">' + _esc(f['mermaid']) + '</pre>') if f.get('mermaid') else ''}
</div>""")
    return _html_wrap(f"业务流程 · {meeting_title} (流程图+详情)", "\n".join(parts), _MERMAID_CDN_SCRIPT)


def _build_flows_html_grouped_by_category(flows: list[dict], meeting_title: str) -> str:
    """按类别分组。"""
    grouped: dict[str, list[dict]] = {}
    for f in flows:
        cat = f.get("category", "业务流程")
        grouped.setdefault(cat, []).append(f)

    parts = [f'<div class="subtitle">共 {len(flows)} 个流程</div>']
    for cat in ["业务流程", "工作流", "审批流", "操作步骤"]:
        group = grouped.get(cat, [])
        if not group:
            continue
        cat_cls = FLOW_CAT_CLASSES.get(cat, "")
        parts.append(f'<h2><span class="badge {cat_cls}">{_esc(cat)} ({len(group)})</span></h2>')
        for f in group:
            ts_badge = _ts_badge(f.get("start_seconds"))
            parts.append(f"""<div class="card" style="margin-bottom:10px">
<div class="label-row">
  <span style="font-size:11px;color:#888">{_esc(f.get('flow_id', ''))}</span>
  {ts_badge}
</div>
<h3 style="margin:4px 0;border:none;padding:0;font-size:15px">{_esc(f.get('title', ''))}</h3>
{('<p style="font-size:13px;color:#555">' + _esc(f['summary']) + '</p>') if f.get('summary') else ''}
{('<pre class="mermaid">' + _esc(f['mermaid']) + '</pre>') if f.get('mermaid') else ''}
</div>""")
    return _html_wrap(f"业务流程 · {meeting_title} (按类别)", "\n".join(parts), _MERMAID_CDN_SCRIPT)


def _build_flows_html_compact_summary(flows: list[dict], meeting_title: str) -> str:
    """精简摘要:仅标题+类别+摘要，无流程图。"""
    parts = [f'<div class="subtitle">共 {len(flows)} 个流程</div>']
    for f in flows:
        cat = f.get("category", "业务流程")
        cat_cls = FLOW_CAT_CLASSES.get(cat, "")
        parts.append(f"""<div class="card" style="margin-bottom:8px;padding:10px 14px">
<div style="display:flex;align-items:center;gap:8px">
  <span class="badge {cat_cls}">{_esc(cat)}</span>
  <strong style="font-size:14px">{_esc(f.get('title', ''))}</strong>
  <span style="font-size:11px;color:#aaa;margin-left:auto">{_esc(f.get('flow_id', ''))}</span>
</div>
{('<p style="font-size:13px;color:#555;margin-top:6px">' + _esc(f['summary']) + '</p>') if f.get('summary') else ''}
</div>""")
    return _html_wrap(f"业务流程 · {meeting_title} (精简摘要)", "\n".join(parts))


# ═══════════════════════════════════════════════════════════════════════════
# 干系人 (stakeholders) 排版
# ═══════════════════════════════════════════════════════════════════════════

SIDE_LABELS = {"internal": "我方", "customer": "客户", "vendor": "合作方", "unknown": "未知"}


def _build_stakeholder_card(s: dict) -> str:
    """单张干系人卡片 HTML。"""
    side = s.get("side", "unknown")
    side_cls = f"side-{side}"
    side_label = SIDE_LABELS.get(side, side)
    aliases = s.get("aliases") or []
    key_points = s.get("key_points") or []
    responsibilities = s.get("responsibilities") or []

    return f"""<div class="card">
<div class="label-row">
  <strong style="font-size:15px">{_esc(s.get('name', ''))}</strong>
  <span class="badge {side_cls}">{_esc(side_label)}</span>
</div>
{('<div style="font-size:13px;color:#555">' + _esc(s['role']) + '</div>') if s.get('role') else ''}
{('<div style="font-size:12px;color:#888">' + _esc(s['organization']) + '</div>') if s.get('organization') else ''}
{('<div style="font-size:12px;color:#888;margin-top:4px">昵称: ' + '、'.join(_esc(a) for a in aliases) + '</div>') if aliases else ''}
{('<div style="font-size:12px;color:#555;margin-top:6px"><span style="color:#888">职责:</span> ' + '、'.join(_esc(r) for r in responsibilities) + '</div>') if responsibilities else ''}
{('<ul style="font-size:12px;color:#555;margin-top:6px;padding-left:18px">' + ''.join('<li style="margin:2px 0">' + _esc(kp) + '</li>' for kp in key_points) + '</ul>') if key_points else ''}
</div>"""


def _build_relations_html(relations: list[dict]) -> str:
    """关系列表 HTML。"""
    if not relations:
        return ""
    rows = []
    for r in relations:
        rows.append(f"""<tr>
<td><strong>{_esc(r.get('from', ''))}</strong></td>
<td style="text-align:center;color:#888">→</td>
<td><strong>{_esc(r.get('to', ''))}</strong></td>
<td>{_esc(r.get('type') or '—')}</td>
<td style="font-size:12px;color:#888">{_esc(r.get('description') or '')}</td>
</tr>""")
    return f"""<h2>协作关系 ({len(relations)})</h2>
<table>
<thead><tr><th>来源</th><th></th><th>目标</th><th>关系类型</th><th>描述</th></tr></thead>
<tbody>{''.join(rows)}</tbody>
</table>"""


def _build_stakeholders_html_name_card_grid(stakeholders: list[dict], relations: list[dict], meeting_title: str) -> str:
    """名片网格:三列卡片+关系列表。"""
    cards = "\n".join(_build_stakeholder_card(s) for s in stakeholders)
    body = f'<div class="subtitle">共 {len(stakeholders)} 个干系人'
    if relations:
        body += f' · {len(relations)} 条协作关系'
    body += '</div>\n<div class="card-grid-3">\n' + cards + '\n</div>\n' + _build_relations_html(relations)
    return _html_wrap(f"干系人 · {meeting_title} (名片网格)", body)


def _build_stakeholders_html_grouped_by_side(stakeholders: list[dict], relations: list[dict], meeting_title: str) -> str:
    """按立场分组。"""
    grouped: dict[str, list[dict]] = {}
    for s in stakeholders:
        side = s.get("side", "unknown")
        grouped.setdefault(side, []).append(s)

    parts = [f'<div class="subtitle">共 {len(stakeholders)} 个干系人</div>']
    for side in ["internal", "customer", "vendor", "unknown"]:
        group = grouped.get(side, [])
        if not group:
            continue
        side_cls = f"side-{side}"
        side_label = SIDE_LABELS.get(side, side)
        parts.append(f'<h2><span class="badge {side_cls}" style="font-size:14px;padding:4px 12px">{_esc(side_label)} ({len(group)})</span></h2>')
        parts.append('<div class="card-grid-3">')
        parts.append("\n".join(_build_stakeholder_card(s) for s in group))
        parts.append('</div>')

    parts.append(_build_relations_html(relations))
    return _html_wrap(f"干系人 · {meeting_title} (按立场)", "\n".join(parts))


def _build_stakeholders_html_relation_focused(stakeholders: list[dict], relations: list[dict], meeting_title: str) -> str:
    """关系视图:关系列表在前，干系人简表在后。"""
    body = f'<div class="subtitle">共 {len(stakeholders)} 个干系人 · {len(relations)} 条关系</div>\n'
    body += _build_relations_html(relations)

    # 干系人简表
    rows = []
    for s in stakeholders:
        side = s.get("side", "unknown")
        side_cls = f"side-{side}"
        side_label = SIDE_LABELS.get(side, side)
        rows.append(f"""<tr>
<td><strong>{_esc(s.get('name', ''))}</strong></td>
<td>{_esc(s.get('role') or '—')}</td>
<td><span class="badge {side_cls}">{_esc(side_label)}</span></td>
<td>{_esc(s.get('organization') or '—')}</td>
</tr>""")

    body += f"""<h2>干系人列表 ({len(stakeholders)})</h2>
<table>
<thead><tr><th>姓名</th><th>角色</th><th>立场</th><th>组织</th></tr></thead>
<tbody>{''.join(rows)}</tbody>
</table>"""
    return _html_wrap(f"干系人 · {meeting_title} (关系视图)", body)


# ── HTML 生成器调度表 ──────────────────────────────────────────────────────

_HTML_BUILDERS: dict[str, dict[str, callable]] = {
    "advice": {
        "compact_list": _build_advice_html_compact_list,
        "card_grid": _build_advice_html_card_grid,
        "question_focused": _build_advice_html_question_focused,
    },
    "requirements": {
        "standard_table": _build_requirements_html_standard_table,
        "grouped_by_priority": _build_requirements_html_grouped_by_priority,
        "grouped_by_module": _build_requirements_html_grouped_by_module,
    },
    "process_flows": {
        "flow_with_diagram": _build_flows_html_flow_with_diagram,
        "grouped_by_category": _build_flows_html_grouped_by_category,
        "compact_summary": _build_flows_html_compact_summary,
    },
    "stakeholders": {
        "name_card_grid": _build_stakeholders_html_name_card_grid,
        "grouped_by_side": _build_stakeholders_html_grouped_by_side,
        "relation_focused": _build_stakeholders_html_relation_focused,
    },
}


def generate_html(module: str, layout_id: str, data: dict, meeting_title: str) -> str:
    """根据模块和排版 ID 生成自包含 HTML 字符串。"""
    builders = _HTML_BUILDERS.get(module)
    if not builders:
        raise ValueError(f"未知模块: {module}")
    builder = builders.get(layout_id)
    if not builder:
        raise ValueError(f"未知排版: {module}/{layout_id}")

    if module == "stakeholders":
        return builder(data.get("stakeholders", []), data.get("relations", []), meeting_title)
    elif module in ("advice", "requirements"):
        items = data.get("items", [])
        return builder(items, meeting_title)
    elif module == "process_flows":
        items = data.get("flows", [])
        return builder(items, meeting_title)

    raise ValueError(f"模块 {module} 不支持 HTML 生成")
