"""会议流程图 mermaid 确定性修复 —— 纯字符串变换,不调 LLM、不跑浏览器。

针对真实数据里观察到的 3 类 LLM 生成 bug(覆盖 100% 已知渲染失败):
  1. 保留字 `end` 用作节点 id(`g --> end([结束])` / `e --> end`)——mermaid flowchart
     里 `end` 是保留关键字,撞了就 Parse error。
  2. 菱形括号错配 `d{风险等级判定]`(`{` 开 `]` 闭)。
  3. 一个 mermaid 字段塞多张图(`flowchart ... --- flowchart ...`),需拆成多张。

修复只改「检测得到的坏 token / 坏结构」,不碰合法图 —— 把好图改坏的风险为 0,幂等。
经真实数据 113/113 子图 mermaid.parse 验证通过。

被 pipeline 生成路径(_normalize_mermaid)和定期巡检任务(sweep_meeting_mermaid)共用。
"""
import re

# mermaid 里会跟节点 id 撞车的保留字
RESERVED_WORDS = ("end", "subgraph", "click", "style", "classDef", "class", "direction")


def repair_mermaid(raw: str) -> str:
    """修单张图:去围栏 + 保留字节点 id + 菱形括号错配。不拆图(拆图见 split_mermaid_diagrams)。"""
    text = (raw or "").strip()

    # 去 markdown 围栏
    if text.startswith("```"):
        lines = text.split("\n")
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    # 去残留的 'mermaid' 语言行
    if text.lower().startswith("mermaid"):
        text = text.split("\n", 1)[-1].strip()

    # 1) 保留字用作节点 id
    for word in RESERVED_WORDS:
        safe = f"node_{word}"
        # 场景 1:节点定义 — `end([结束])` / `end[步骤]` / `end{判断?}`
        text = re.sub(rf'(?<!\w){re.escape(word)}(\d*)([\(\[\{{])', rf'{safe}\1\2', text)
        # 场景 2:连线末端引用 — `f --> end` / `f -->|是| end`
        text = re.sub(rf'(-->|--)\s*(?:\|[^\|]*\|)?\s*{re.escape(word)}(?=\s*$)', rf'\1 {safe}', text, flags=re.M)

    # 2) 菱形括号错配:`{文字]` → `{文字}`(用 (?<!\{) 排除合法的 {{六边形}})
    text = re.sub(r'(?<!\{)\{([^{}\[\]\n]+)\]', r'{\1}', text)

    return text


def split_mermaid_diagrams(raw: str) -> list[str]:
    """把「一个字段塞多张图」拆成多张:按独立的 `---` 行,或第二个 flowchart/graph 头切分。

    返回拆出来的各子图(已 strip,去空)。单图时返回单元素列表。
    """
    lines = (raw or "").split("\n")
    parts: list[list[str]] = []
    cur: list[str] = []
    for ln in lines:
        t = ln.strip()
        if t == "---":  # 独立分隔行
            if cur:
                parts.append(cur)
            cur = []
            continue
        # 又冒出一个图头,且当前块里已经有图头 → 上一张图结束
        if re.match(r'^(flowchart|graph)\b', t) and any(re.match(r'^(flowchart|graph)\b', x.strip()) for x in cur):
            parts.append(cur)
            cur = [ln]
            continue
        cur.append(ln)
    if cur:
        parts.append(cur)
    out = ["\n".join(p).strip() for p in parts]
    return [p for p in out if p]


def repair_process_flows(process_flows: dict) -> tuple[dict, dict]:
    """对一份 process_flows({"flows": [...], "version": n})做确定性修复 + 多图拆分。

    返回 (新 process_flows, stats)。stats = {changed, repaired, split, flows_before, flows_after}。
    幂等:已修好的再跑不会再变。不改顺序、保留每个 flow 的其余字段。
    """
    if not isinstance(process_flows, dict):
        return process_flows, {"changed": False, "repaired": 0, "split": 0, "flows_before": 0, "flows_after": 0}

    flows = process_flows.get("flows")
    if not isinstance(flows, list):
        return process_flows, {"changed": False, "repaired": 0, "split": 0, "flows_before": 0, "flows_after": 0}

    new_flows: list[dict] = []
    repaired = 0
    split = 0
    changed = False

    for flow in flows:
        if not isinstance(flow, dict) or not isinstance(flow.get("mermaid"), str):
            new_flows.append(flow)
            continue

        original = flow["mermaid"]
        fixed = repair_mermaid(original)
        parts = split_mermaid_diagrams(fixed)

        if len(parts) <= 1:
            merm = parts[0] if parts else fixed
            if merm != original:
                repaired += 1
                changed = True
            nf = dict(flow)
            nf["mermaid"] = merm
            new_flows.append(nf)
        else:
            # 多图拆成多个 flow,克隆元信息,flow_id / title 补序号
            split += 1
            changed = True
            base_id = str(flow.get("flow_id") or "FLOW")
            base_title = flow.get("title")
            for i, part in enumerate(parts, 1):
                nf = dict(flow)
                nf["mermaid"] = part
                nf["flow_id"] = f"{base_id}-{i}"
                if isinstance(base_title, str) and base_title:
                    nf["title"] = f"{base_title}({i}/{len(parts)})"
                new_flows.append(nf)

    new_pf = dict(process_flows)
    new_pf["flows"] = new_flows
    stats = {
        "changed": changed,
        "repaired": repaired,
        "split": split,
        "flows_before": len(flows),
        "flows_after": len(new_flows),
    }
    return new_pf, stats
