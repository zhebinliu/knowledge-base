"""把 collector 的三段数据拼成一条纯文本消息(推企信群)。

约束:
- 企信 send_message 走 text 字段,不做 markdown 渲染;这里只用 emoji + 分节线 + 缩进
- 控制在 1500 字以内,避免消息过长被截断
- 数字用 fmt_num 加逗号分隔;比例/占比明确写单位
"""
from __future__ import annotations


DIVIDER = "─────────────"


def _fmt_num(n: int) -> str:
    return f"{n:,}"


def _fmt_tokens(n: int) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.2f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return str(n)


def format_workbench_section(stats: dict) -> str:
    total = stats["total"]
    new = stats["yesterday_new"]
    todos = stats["todos"]
    lines = [
        "📊 KB 工作台",
        f"  项目 {_fmt_num(total['projects'])}(昨日 +{new['projects']}) · "
        f"文档 {_fmt_num(total['documents'])}(昨日 +{new['documents']}) · "
        f"会议 {_fmt_num(total['meetings'])}(昨日 +{new['meetings']})",
        f"  待办  待处理 {todos['pending']} · 进行中 {todos['doing']} · "
        f"昨日完成 {todos['done_yesterday']} · 已过期 {todos['overdue']}",
    ]
    return "\n".join(lines)


def format_meeting_section(meetings: list[dict]) -> str:
    if not meetings:
        return "📝 昨日会议纪要\n  (昨日无新增纪要)"
    lines = [f"📝 昨日会议纪要 · 共 {len(meetings)} 场"]
    for m in meetings:
        title = m["title"]
        summary = m["summary"] or "(暂无摘要)"
        # 摘要单行:避免消息里出现连续空白破坏观感
        summary_one = " ".join(summary.split())
        lines.append(f"  • 《{title}》")
        lines.append(f"    摘要:{summary_one}")
        if m["decisions"]:
            for d in m["decisions"]:
                lines.append(f"    决策:{d}")
        if m["action_items_count"]:
            lines.append(f"    待办产出:{m['action_items_count']} 条")
    return "\n".join(lines)


def format_aihub_section(stats: dict) -> str:
    if stats.get("error"):
        return f"🤖 AI Hub\n  (采集失败:{stats['error']})"

    total_calls = stats["total_calls"]
    if total_calls == 0:
        return "🤖 AI Hub\n  (昨日无调用记录)"

    tok = stats["total_tokens"]
    lines = [
        "🤖 AI Hub",
        f"  调用 {_fmt_num(total_calls)} 次 · Token 总计 {_fmt_tokens(tok['total'])} "
        f"(prompt {_fmt_tokens(tok['prompt'])} + completion {_fmt_tokens(tok['completion'])})",
    ]

    # 模型 TOP
    if stats["by_model"]:
        lines.append("  按模型:")
        for r in stats["by_model"][:5]:
            lines.append(
                f"    · {r['model']}  {_fmt_num(r['calls'])} 次 / {_fmt_tokens(r['tokens'])} tokens"
            )

    # 异常
    err = stats["errors"]
    if err["count"]:
        top_paths = " ".join(f"{p['path']}×{p['count']}" for p in err["top_paths"])
        lines.append(f"  ⚠️ 异常 {err['count']} 次  {top_paths}")

    # 慢调用
    if stats.get("slow_calls_count"):
        lines.append(f"  🐢 慢调用(>30s) {stats['slow_calls_count']} 次")

    # TOP IP / UA(用户维度降级方案)
    if stats["top_ips"]:
        ips = " · ".join(f"{r['ip']}({r['calls']})" for r in stats["top_ips"][:3])
        lines.append(f"  TOP IP:{ips}")
    if stats["top_ua"]:
        uas = " · ".join(f"{r['ua']}({r['calls']})" for r in stats["top_ua"][:3])
        lines.append(f"  TOP UA:{uas}")

    return "\n".join(lines)


def format_daily_report(
    day_str: str,
    workbench: dict,
    meetings: list[dict],
    aihub: dict,
) -> str:
    """三段拼装。day_str 用于 header。"""
    header = f"📅 每日工作台报告 · {day_str}"
    body = "\n".join([
        header,
        DIVIDER,
        format_workbench_section(workbench),
        DIVIDER,
        format_meeting_section(meetings),
        DIVIDER,
        format_aihub_section(aihub),
    ])
    # 硬截断到 1900 字,给企信留余量(不同 IM 上限通常 2000)
    if len(body) > 1900:
        body = body[:1897] + "…"
    return body
