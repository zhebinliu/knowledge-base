"""SOW 模块名 → LTC 字典 同义词归一映射。

输入:project 的 SOW / 系统集成 / 售前方案 等文档全文
输出:
- list[dict] mapping items({sow_term, mapped_ltc_key, confidence, is_extra})
- 写入 research_ltc_module_maps 表(覆盖式)

策略:
1. LLM 一次性抽出 SOW 里的所有"功能模块 / 业务范围"清单
2. LLM 同时给出每条 → LTC 字典 key 的映射(超出字典则标 is_extra=true)
3. 本地 find_module_by_alias 做兜底匹配(LLM 没命中时再字符串包含一次)
4. 持久化到 DB(同 project 旧映射先删,再批量插入,避免历史包袱)
"""
import json
import structlog
from typing import Any
from sqlalchemy import select, delete

from models import async_session_maker
from models.research_ltc_module_map import ResearchLtcModuleMap
from .ltc_dictionary import ALL_LTC_MODULES, find_module_by_alias

logger = structlog.get_logger()


# 用于 prompt 的字典摘要 — 给 LLM 看可选的 mapped_ltc_key
def _dict_brief() -> str:
    lines = ["可选的 LTC 字典 key 列表(同义词归一时只能用这些 key):"]
    for m in ALL_LTC_MODULES:
        aliases = "、".join(m.aliases[:6])  # 别名只展示前 6 个,避免 prompt 过长
        lines.append(f"- {m.key}: {m.label}(常见称呼:{aliases})")
    return "\n".join(lines)


def _collect_sow_text(docs_by_type: dict[str, list[dict]], max_chars: int = 18000) -> str:
    """从 SOW / 系统集成 / 售前方案 / 售前调研 / 合同 类文档拼接全文。

    截断 max_chars 以控制 prompt 长度。这一步只为抽功能模块清单,不需要看全。
    """
    priorities = ["sow", "system_integration", "pre_sales_proposal",
                  "pre_sales_research", "contract"]
    chunks = []
    used = 0
    for dtype in priorities:
        for d in docs_by_type.get(dtype, []):
            md = (d.get("markdown") or "")[:6000]
            if not md:
                continue
            head = f"\n\n--- 文档:{d.get('filename', '')} (type={dtype}) ---\n"
            payload = head + md
            if used + len(payload) > max_chars:
                payload = payload[: max_chars - used]
            chunks.append(payload)
            used += len(payload)
            if used >= max_chars:
                break
        if used >= max_chars:
            break
    return "".join(chunks)


async def map_sow_to_ltc(
    project_id: str,
    docs_by_type: dict[str, list[dict]],
    model: str | None = None,
) -> list[dict[str, Any]]:
    """LLM 抽 SOW 模块 + 同义词归一,写入 DB,返回结果列表。

    返回 list[{sow_term, mapped_ltc_key, confidence, is_extra}]。
    """
    sow_text = _collect_sow_text(docs_by_type)
    if not sow_text.strip():
        logger.info("sow_mapper_skip_no_doc", project_id=project_id)
        return []

    from services.output_service import _llm_call

    system = """你是 CRM 实施顾问。任务:从客户给的 SOW / 集成方案 / 售前材料里
抽出所有"功能模块 / 业务范围"清单,并把每条映射到内置 LTC 字典的标准 key。

输出严格 JSON 格式,不要 markdown 围栏:
{
  "items": [
    {"sow_term": "<原文里的称呼,例:商机机会管理>",
     "mapped_ltc_key": "<字典 key,例:M02_opportunity;若超出字典留空>",
     "confidence": <0-1 浮点,你对此映射的把握度>,
     "is_extra": <true/false,字典里没有就 true>}
  ]
}

抽取规则:
- 只抽真正的"功能模块 / 业务范围",不要把"项目目标"、"实施周期"这种当作模块
- 同义词、子模块、客户特有称呼都各占一行(同一个 LTC key 可重复)
- 至少 5 项,如果文档里实在没有内容,返回空列表
- mapped_ltc_key 只能用下方列表里的 key,不要发明新 key
- confidence ≥ 0.7 才算高置信;低于 0.5 时优先标 is_extra=true 避免错配
"""

    user = f"""{_dict_brief()}

【SOW 文档原文(可能含多份)】
{sow_text}

请按上述 JSON 格式输出。"""

    try:
        raw = await _llm_call(user, system=system, model=model,
                              max_tokens=4000, timeout=120.0)
        data = _parse_json_robust(raw)
        items_raw = data.get("items") or [] if isinstance(data, dict) else []
    except Exception as e:
        logger.warning("sow_mapper_llm_failed", project_id=project_id, error=str(e)[:200])
        return []

    # 规整 + 本地兜底匹配
    valid_keys = {m.key for m in ALL_LTC_MODULES}
    out: list[dict] = []
    for it in items_raw:
        if not isinstance(it, dict):
            continue
        term = (it.get("sow_term") or "").strip()
        if not term:
            continue
        key = (it.get("mapped_ltc_key") or "").strip() or None
        conf = float(it.get("confidence") or 0.0)
        is_extra = bool(it.get("is_extra") or False)
        if key and key not in valid_keys:
            # LLM 编了个不存在的 key,降级为 extra
            key = None
            is_extra = True
        if not key and not is_extra:
            # LLM 没标 extra 但也没 key — 本地兜底
            local = find_module_by_alias(term)
            if local:
                key = local.key
                conf = max(conf, 0.5)  # 本地匹配置信度 0.5 起步
            else:
                is_extra = True
        out.append({
            "sow_term": term[:200],
            "mapped_ltc_key": key,
            "confidence": round(min(max(conf, 0.0), 1.0), 3),
            "is_extra": is_extra,
        })

    # 持久化(同 project 旧的先删,避免重跑累积脏数据)
    async with async_session_maker() as s:
        await s.execute(
            delete(ResearchLtcModuleMap).where(ResearchLtcModuleMap.project_id == project_id)
        )
        for r in out:
            s.add(ResearchLtcModuleMap(
                project_id=project_id,
                sow_term=r["sow_term"],
                mapped_ltc_key=r["mapped_ltc_key"],
                confidence=r["confidence"],
                is_extra=r["is_extra"],
            ))
        await s.commit()

    logger.info("sow_mapper_done", project_id=project_id,
                total=len(out), extra=sum(1 for r in out if r["is_extra"]))
    return out


def _parse_json_robust(text: str) -> dict:
    """LLM 经常带 markdown 围栏或前后多余文本,这里粗暴提取第一对 {...}。"""
    if not text:
        return {}
    s = text.strip()
    # 去掉常见 ```json ... ``` 围栏
    if s.startswith("```"):
        s = s.split("\n", 1)[-1]
        if s.endswith("```"):
            s = s.rsplit("```", 1)[0]
    try:
        return json.loads(s)
    except Exception:
        # 降级:找第一个 { 和最后一个 }
        i, j = s.find("{"), s.rfind("}")
        if 0 <= i < j:
            try:
                return json.loads(s[i:j+1])
            except Exception:
                pass
    return {}


def aggregate_by_ltc_key(items: list[dict]) -> dict[str, list[str]]:
    """把映射结果按 LTC key 聚合,得到 {ltc_key: [sow_term, ...]}。

    给后续 outline / questionnaire 的 prompt 用,告诉 LLM 客户的实际称呼是什么。
    """
    out: dict[str, list[str]] = {}
    for it in items:
        k = it.get("mapped_ltc_key") or "__extra__"
        out.setdefault(k, []).append(it["sow_term"])
    return out
