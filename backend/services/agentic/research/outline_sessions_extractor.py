"""调研大纲 M3 访谈日程表 → 结构化 sessions 数组(2026-06-03)。

generate_survey_outline 出完 markdown 后,加一步「让 LLM 把 M3 表读成 JSON」,
存到 bundle.extra.outline_sessions。下游 generate_survey 拿去给每题打 session_id,
实现「按场次分组问卷」。

为什么不直接 markdown 表格 parsing:
- LLM 输出 M3 表列数 / 时间格式不稳定(有"Week 1 周二上午"/"周二上午"/"6/4 上午"多种)
- LLM 一次读表 + 归一 + 编号,代码省心,且能识别"工作坊"/"现场观察"等非访谈场次的归类
- 失败不阻断(返回空数组),问卷生成时检测到无 sessions 走 fallback

输出 schema:
    [
      {
        "session_id": "S1",          # 稳定短 key,本 outline 内唯一
        "week": "Week 1",
        "time_slot": "周二上午",
        "duration_minutes": 60,
        "session_type": "1on1" | "集中访谈" | "工作坊" | "现场观察" | "资料收集",
        "audience_roles": ["executive" | "dept_head" | "frontline" | "it"],  # 严格 4 角色
        "participants": "总裁 + 销售 VP",        # 原文/客户方参会者描述
        "topic_summary": "高管战略对齐 1on1",   # 短议题
      },
      ...
    ]
"""
from __future__ import annotations

import json
import re
import structlog

logger = structlog.get_logger()


SYSTEM_PROMPT = """你正在从一份调研大纲中提取【调研日程表(M3)】里的所有访谈场次,把它们归一成结构化 JSON 数组,
以便下游问卷生成时按场次给每题挂标签。

规则:
1. 只读 M3 章节(标题含「调研日程」或类似);其他章节忽略
2. 每场访谈 / 工作坊 / 现场观察都要出一行,资料收集 / 贯穿型不输出(没有具体时间槽)
3. session_id 用 S1 / S2 / S3 ... 简单序号,本次输出内唯一
4. audience_roles 严格 4 选 N:
   - executive(高管 / 决策者 / 总裁 / VP / 总经理)
   - dept_head(部门负责人 / 总监 / 经理)
   - frontline(一线 / 操作 / 业务员 / 工程师)
   - it(IT / 系统管理员 / 架构师)
   把表格里的"销售总监 + 销售运营经理" → 都是 dept_head
   把"一线销售 + 总监" → 取最低一级 → frontline + dept_head(两个值)
5. duration_minutes:把"60min / 90min / 1.5h / 半天 / 全天" 归一为分钟数
   - "60min" / "1h" → 60
   - "90min" / "1.5h" → 90
   - "半天" → 180
   - "全天" → 360
   - 没明确写 → null
6. time_slot:保留原文(如 "周二上午"),不归一
7. session_type:只能从 1on1 / 集中访谈 / 工作坊 / 现场观察 / 资料收集 选;不在表里的归 "集中访谈"
8. topic_summary:短短一句议题(20 字内)

输出 — 严格的 JSON 数组,用 ```json``` 围栏包裹。不要任何其他文本/解释。如果 M3 章节缺失或无法解析,输出空数组 []。
"""


def build_user_prompt(outline_md: str) -> str:
    # 控制输入长度,M3 一般在 outline 中段;直接全文喂 ok(典型 outline ~10k 字符)
    return f"""下面是完整的调研大纲 markdown,请只提取 M3 调研日程表的场次,按 system prompt 要求输出 JSON 数组:

---
{outline_md[:30000]}
---
"""


_JSON_FENCE_RE = re.compile(r"```json\s*(\[.*?\])\s*```", re.DOTALL)


def _parse_sessions_json(raw: str) -> list[dict]:
    """从 LLM 原始输出里拆出 JSON 数组;失败返回空列表。"""
    if not raw or not raw.strip():
        return []
    m = _JSON_FENCE_RE.search(raw)
    if m:
        json_text = m.group(1)
    else:
        # 没围栏 → 试试是否直接是数组
        json_text = raw.strip()
        if not (json_text.startswith("[") and json_text.endswith("]")):
            return []
    try:
        data = json.loads(json_text)
    except Exception as e:
        logger.warning("outline_sessions_json_parse_failed", err=str(e)[:200])
        return []
    if not isinstance(data, list):
        return []
    out: list[dict] = []
    seen_ids: set[str] = set()
    for idx, raw_s in enumerate(data, 1):
        if not isinstance(raw_s, dict):
            continue
        sid = (raw_s.get("session_id") or f"S{idx}").strip() or f"S{idx}"
        # 防重复 ID
        if sid in seen_ids:
            sid = f"S{idx}"
        seen_ids.add(sid)
        roles_raw = raw_s.get("audience_roles") or []
        if not isinstance(roles_raw, list):
            roles_raw = []
        roles = [r for r in roles_raw if r in ("executive", "dept_head", "frontline", "it")]
        if not roles:
            roles = ["dept_head"]   # 兜底
        duration = raw_s.get("duration_minutes")
        if duration is not None:
            try:
                duration = int(duration)
            except Exception:
                duration = None
        out.append({
            "session_id":       sid,
            "week":             str(raw_s.get("week") or "").strip(),
            "time_slot":        str(raw_s.get("time_slot") or "").strip(),
            "duration_minutes": duration,
            "session_type":     str(raw_s.get("session_type") or "集中访谈").strip(),
            "audience_roles":   roles,
            "participants":     str(raw_s.get("participants") or "").strip(),
            "topic_summary":    str(raw_s.get("topic_summary") or "").strip(),
        })
    return out


async def extract_sessions(outline_md: str, model: str | None = None) -> list[dict]:
    """从 outline markdown 里提取访谈场次 JSON 列表。失败返回 []。"""
    if not outline_md or not outline_md.strip():
        return []
    from services.output_service import _llm_call
    try:
        raw = await _llm_call(
            build_user_prompt(outline_md),
            system=SYSTEM_PROMPT,
            model=model,
            task="output_doc_generate",
            max_tokens=4000, timeout=180.0,
        )
    except Exception as e:
        logger.warning("outline_sessions_extract_failed", err=str(e)[:200])
        return []
    sessions = _parse_sessions_json(raw or "")
    logger.info("outline_sessions_extracted", n=len(sessions))
    return sessions
