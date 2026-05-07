"""调研问卷题目「最佳实践建议」生成器 — subsection 级批量 LLM 调用。

设计:
- 出题完成后,把该 subsection 的全部题目 + 候选最佳实践卡片 + 行业上下文
  一次性喂给 LLM,LLM 综合后给每题写**一段贴合的实施建议**(自然语言)。
- 输出的 advice 写入 `QuestionItem.best_practice_advice`,前端折叠区展开后
  渲染成段落 +「参考来源」脚注。
- 失败回落:advice 为空,前端不显示折叠区(`best_practice_refs` 也清空,避免
  按老风格展示弱相关卡片)。

为什么不在 _post_process_items 里逐题调?
- 每题一次 LLM 太贵(N 次/分卷)
- 整 subsection 喂给 LLM 让它一次理解所有题的语境,出来的建议更连贯
- 一个 subsection 通常 5-15 题,200K context 富余
"""
from __future__ import annotations

import json
import re
from typing import Any

import structlog

logger = structlog.get_logger()


# 候选卡片召回:从 LTC 主源 + 辅源 industry case 用宽松规则拉一批,
# 不要求 substring 命中(让 LLM 自己语义筛)
def _recall_candidates(
    ltc_module_keys: set[str],
    *,
    industry: str | None,
    max_kb: int = 18,
    max_industry: int = 6,
) -> list[dict]:
    """按 subsection 用到的所有 ltc_module_key,把对应桶的卡片全拉出来,
    + 行业 industry pack 的 cases。返回的 dict 字段对齐 BestPracticeRef:
       {title, summary, source, source_id, ltc_module_key (可选), industries}
    """
    from .best_practices import LTC_BEST_PRACTICES

    out: list[dict] = []
    seen: set[str] = set()
    for k in ltc_module_keys:
        bucket = LTC_BEST_PRACTICES.get(k) or []
        for bp in bucket:
            # 行业过滤(若卡片声明了 industries)
            if bp.industries and industry and industry not in bp.industries:
                continue
            uid = f"kb::{bp.title}"
            if uid in seen:
                continue
            seen.add(uid)
            out.append({
                "title": bp.title,
                "summary": bp.summary,
                "source": "kb",
                "source_id": bp.source_id,
                "ltc_module_key": k,
            })
            if len(out) >= max_kb:
                break
        if len(out) >= max_kb:
            break

    # 辅源:行业 cases
    if industry:
        try:
            from services.agentic.industry_packs import get_pack
            pack = get_pack(industry)
            if pack and pack.cases:
                for c in pack.cases[:max_industry]:
                    out.append({
                        "title": f"标杆案例 · {c.get('name', '')}",
                        "summary": (
                            (c.get("pattern") or "")
                            + (("  经验:" + c.get("lessons", "")) if c.get("lessons") else "")
                        )[:500],
                        "source": "industry_pack",
                        "source_id": industry,
                    })
        except Exception as e:
            logger.warning("advisor_industry_recall_failed", error=str(e)[:100])

    return out


def _format_card_for_prompt(idx: int, card: dict) -> str:
    src = card.get("source", "")
    sid = card.get("source_id", "")
    return (
        f"[K{idx}] **{card['title']}** ({src}{':' + sid if sid else ''})\n"
        f"      {card['summary']}"
    )


def _format_item_for_prompt(idx: int, item: dict) -> str:
    parts = [f"[Q{idx}] item_key={item.get('item_key', '')}",
             f"      题型: {item.get('type', '')}",
             f"      LTC 模块: {item.get('ltc_module_key', '')}",
             f"      题干: {item.get('question', '')}"]
    if item.get("why"):
        parts.append(f"      为什么问: {item['why']}")
    if item.get("hint"):
        parts.append(f"      提示: {item['hint']}")
    options = item.get("options") or []
    if options:
        opt_labels = [o.get("label", "") for o in options if not o.get("is_other") and not o.get("is_not_applicable")]
        if opt_labels:
            parts.append(f"      选项: {' / '.join(opt_labels)}")
    return "\n".join(parts)


# ── 客户名脱敏 ──────────────────────────────────────────────────────────────
# 维护一份显式的「已知客户名」黑名单 + 关键短名变体。LLM 即便没听 prompt 漏写
# 真名,这里再过一道滤,统一替换成「某同行业客户」之类的脱敏词,绝不让真实
# 客户名出现在 advice 里。
_REDACT_REPLACEMENT = "某同行业客户"

# 显式罗列(从 industry_packs/*.py 的 cases 收集 + 常见短名变体)
_REDACT_PATTERNS: list[str] = [
    # smart_manufacturing
    "友发钢管集团", "友发钢管", "友发",
    "特变新能源(特变电工)", "特变新能源", "特变电工", "特变",
    "唐山天地矿业", "天地矿业",
    # healthcare
    "百迈客生物科技(基因检测)", "百迈客生物科技", "百迈客",
    "三亚益本元(海南宜百年科技)", "三亚益本元", "海南宜百年科技", "益本元",
    # energy(部分跟 manufacturing 重复)
    "特变新能源(特变电工旗下)",
    # technology
    "北电数智(SaaS / AI 算力)", "北电数智",
    "上海凯勇 NaaS", "上海凯勇",
    "中电信人工智能(协同交付管理)", "中电信人工智能", "电信AI",
    "小鸟科技(LTC 优化)", "小鸟科技", "小鸟LTC",
    # 蓝盒外:其他知识库出现过的客户名
    "蒂业技凯",
]

# 按长度倒序匹配,避免「友发钢管」被「友发」抢先替换造成短名残留
_REDACT_PATTERNS.sort(key=len, reverse=True)


def _redact_customer_names(text: str) -> str:
    """把已知客户名替换为脱敏占位词。"""
    if not text:
        return text
    for pat in _REDACT_PATTERNS:
        if pat in text:
            text = text.replace(pat, _REDACT_REPLACEMENT)
    return text


def _extract_json(raw: str) -> dict | None:
    """从 LLM 输出抠 JSON dict {item_key: advice}。"""
    fence = re.search(r"```json\s*(\{[\s\S]*?\})\s*```", raw, re.IGNORECASE)
    if fence:
        try:
            return json.loads(fence.group(1))
        except Exception:
            pass
    i, j = raw.rfind("{"), raw.rfind("}")
    if 0 <= i < j:
        try:
            return json.loads(raw[i:j + 1])
        except Exception:
            pass
    return None


async def generate_advice_for_items(
    items: list[dict],
    *,
    industry: str | None,
    project_name: str = "",
    model: str | None = None,
) -> dict[str, str]:
    """对一批题(通常一个 subsection 的)批量生成 advice,返回 {item_key: advice}。

    失败 / 部分失败 → 返回的 dict 可能为空或不全;调用方按 dict.get() 容错使用。
    """
    if not items:
        return {}

    # 召回候选最佳实践卡片
    ltc_keys = {it.get("ltc_module_key", "") for it in items if it.get("ltc_module_key")}
    candidates = _recall_candidates(ltc_keys, industry=industry)
    if not candidates:
        logger.info("advisor_no_candidates", n_items=len(items), ltc_keys=list(ltc_keys))
        return {}

    cards_block = "\n\n".join(_format_card_for_prompt(i + 1, c) for i, c in enumerate(candidates))
    items_block = "\n\n".join(_format_item_for_prompt(i + 1, it) for i, it in enumerate(items))
    item_keys_list = [it.get("item_key", "") for it in items]

    industry_label = f"({industry})" if industry else "(行业未指定)"
    project_label = f"项目「{project_name}」" if project_name else "本项目"

    system = """你是 MBB 风格的资深 CRM 实施咨询顾问,为 {project} 设计调研问卷。
你的任务:为下面给出的每道题,基于「跨项目实施最佳实践库」**写一段贴合该题的实施建议**,
作为顾问会上跟客户讨论时的参考。

写作要求(严格遵守,违反会被拒收):
1. **必须贴合题目本身** — 直接回应题目问的内容,不能是泛泛的方法论;若题目是
   「商机阶段定义?」就讲怎么定义阶段,不要扯到客户管理上去。
2. **从最佳实践库里挑相关的来综合** — 不是照抄某一条,而是融合多条形成一段
   连贯建议。如果某条最佳实践在本题完全用不上,**忽略它**(不要为了凑数硬塞)。
3. **如果最佳实践库里所有卡片对本题都不沾边**,请输出空字符串 `""`。宁缺勿滥,
   不要硬写一段无关内容。
4. **风格**:80-180 字,1-2 段。具体、可操作。可以引用具体数字 / 节点名 / 流程
   阶段。**不写**黑话(赋能 / 抓手 / 闭环 / 链路 / 生态)。
5. **不引用最佳实践卡片的标题或代号** — 不要写「参考 [K3] 终态数据锁定 ...」
   这种,直接说做法,出处由系统自动挂在脚注。
6. **严禁提及任何具体企业名称(脱敏要求)** — 即使最佳实践库里写了真实客户名
   (例:友发钢管、特变新能源、唐山天地矿业、北电数智、百迈客、上海凯勇、
   蒂业技凯、中电信人工智能、小鸟科技、三亚益本元 等),advice 里**绝对不能**
   出现这些名字。需要引用时统一脱敏成:
   - 「某制造业头部客户」/「同行业头部客户」
   - 「某 SaaS 服务商」/「某医疗器械企业」/「某能源企业」
   - 「跨项目经验」/「行业内典型做法」
   反例(违规):「参考特变新能源一期经验...」「友发钢管集团的高奖惩政策...」
   正例(合规):「某制造业头部客户的一期经验是...」「行业内典型做法是先...」""".format(project=project_label)

    user_prompt = f"""【行业】{industry_label}

【最佳实践知识库 — 全部候选,你自己挑相关的整合】
{cards_block}

【本批题目 — 每题写一段建议】
{items_block}

【输出格式 — 严格 JSON 字典,key 是 item_key,value 是建议字符串】
用 ```json``` 围栏包裹,例:
```json
{{
  "M02_opportunity::stage_model": "建议在 CRM 配置 5-7 阶段...(具体内容 80-180 字)",
  "M01_lead::source": "(本题最佳实践库无贴合内容,留空)",
  ...
}}
```

约束:
- 必须为下列每个 item_key 都给出一项(value 可以是空串 ""):
  {json.dumps(item_keys_list, ensure_ascii=False)}
- value 是字符串(不是 list / dict / 段落数组)
- 严格 JSON 可被 json.loads 解析
"""

    try:
        from services.output_service import _llm_call
        raw = await _llm_call(user_prompt, system=system, model=model, max_tokens=4000, timeout=180.0)
    except Exception as e:
        logger.warning("advisor_llm_failed", n_items=len(items), error=str(e)[:200])
        return {}

    parsed = _extract_json(raw)
    if not isinstance(parsed, dict):
        logger.warning("advisor_parse_failed", raw_excerpt=raw[:200])
        return {}

    out: dict[str, str] = {}
    for k, v in parsed.items():
        if not isinstance(v, str):
            continue
        v = v.strip()
        if not v:
            continue
        # 防御 1:清掉 LLM 偶尔输出的卡片代号引用 — 覆盖 [K3] / (K3) / (K3) 三种括号变体
        v = re.sub(r"[\[（(]\s*K\s*\d+\s*[\]）)]", "", v)
        # 防御 2:清掉前后的多余空格 / 标点(代号被抠掉后可能留下「,」「、」等悬挂)
        v = re.sub(r"\s+([,，、。;;])", r"\1", v)  # 标点前的空格
        v = re.sub(r"[,，、]\s*[,，、]", "、", v)   # 连续逗号合并
        # 防御 3:LLM 偶尔会粘 ```json``` 残留
        v = re.sub(r"```\w*", "", v).strip()
        # 防御 4:客户名脱敏 — LLM 即便没听 prompt 漏写真名,这里再过一道滤
        v = _redact_customer_names(v)
        if v:
            out[k] = v

    logger.info("advisor_generated", n_items=len(items), n_advice=len(out))
    return out
