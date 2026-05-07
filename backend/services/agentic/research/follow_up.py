"""动态追问生成 — 顾问录入答案瞬间,根据回答生成 1-3 道更深一层的追问题。

触发场景(前端 UI 决定):
- 父题已答(answer_value 非空)
- 该父题尚未挂任何 follow_up 子题(parent_item_key 链查不到)
- 顾问点了「生成追问」按钮(不每次自动跑,避免成本失控)

返回的子题:
- parent_item_key = 父题 item_key
- source = "follow_up"
- audience_roles 默认继承父题
- ltc_module_key 默认继承父题
- phase 默认 in_meeting(追问通常需要顾问引导)
"""
from __future__ import annotations

import json
import re
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from models import async_session_maker
from models.curated_bundle import CuratedBundle

logger = structlog.get_logger()


def _format_answer(item: dict, answer: Any) -> str:
    """把答案值还原成「人类可读」的描述,喂给 LLM 用。"""
    if answer is None or answer == "":
        return "(未答)"
    t = item.get("type")
    options = {o.get("value"): o.get("label") for o in (item.get("options") or [])}

    if t == "single":
        if isinstance(answer, str) and answer.startswith("__other__:"):
            return f"其他:{answer.split(':', 1)[1]}"
        return options.get(answer, str(answer))
    if t == "multi":
        if isinstance(answer, list):
            return " / ".join(options.get(v, v) for v in answer) or "(空)"
        return str(answer)
    if t == "rating":
        scale = item.get("rating_scale", 5)
        return f"{answer}/{scale}"
    if t == "node_pick":
        if isinstance(answer, list):
            return " / ".join(str(x) for x in answer) or "(空)"
    return str(answer)


def _extract_json_array(raw: str) -> list[dict]:
    """从 LLM 输出里抠出 JSON 数组。失败时返回空。"""
    fence = re.search(r"```json\s*(\[[\s\S]*?\])\s*```", raw, re.IGNORECASE)
    if fence:
        try:
            data = json.loads(fence.group(1))
            return data if isinstance(data, list) else []
        except Exception:
            pass
    # 兜底:找最后一个 [ ... ]
    i, j = raw.rfind("["), raw.rfind("]")
    if 0 <= i < j:
        try:
            data = json.loads(raw[i:j + 1])
            return data if isinstance(data, list) else []
        except Exception:
            return []
    return []


async def generate_follow_ups(
    bundle_id: str,
    parent_item_key: str,
    answer_value: Any,
    *,
    max_followups: int = 3,
) -> dict:
    """生成追问并写入 bundle.extra.questionnaire_items。

    返回 {"items": [新追问 dict, ...], "total": 当前问卷总题数}。
    若已经存在追问 / 父题不存在 / LLM 出错,返回的 items 可能为空。
    """
    from services.output_service import _llm_call
    from services.agentic.research.questionnaire_schema import (
        QuestionItem, OptionItem, ensure_sentinels, coerce_audience_roles,
    )

    async with async_session_maker() as s:
        bundle = await s.get(CuratedBundle, bundle_id)
        if not bundle:
            return {"items": [], "total": 0, "error": "bundle 不存在"}
        if bundle.kind != "survey":
            return {"items": [], "total": 0, "error": f"bundle.kind={bundle.kind},不是 survey"}

        extra = dict(bundle.extra or {})
        items: list[dict] = list(extra.get("questionnaire_items") or [])

        parent = next((it for it in items if it.get("item_key") == parent_item_key), None)
        if not parent:
            return {"items": [], "total": len(items), "error": "父题不存在"}

        # 已经有追问就别再加(避免重复触发)
        existing_followups = [it for it in items if it.get("parent_item_key") == parent_item_key]
        if existing_followups:
            return {
                "items": [],
                "total": len(items),
                "skipped_reason": f"已有 {len(existing_followups)} 道追问,跳过",
            }

        answer_text = _format_answer(parent, answer_value)
        ltc_key = parent.get("ltc_module_key", "")
        roles = parent.get("audience_roles") or ["dept_head"]

        system = """你是 MBB 风格的资深 CRM 实施咨询顾问,擅长从客户的回答里抓出「值得继续追问」的关键点。
你的任务:基于客户对一道父题的回答,生成 1-3 道高质量的追问题,帮助顾问把流程 / 痛点 / 决策机制挖深。

追问设计原则:
- 紧扣客户答案中暴露的具体场景(如选择了「阶段定义模糊」就追问「最常因为什么模糊导致的阶段错判?」)
- 尽量是开放式 text 或多选 multi(因为追问主要是会中深挖,需要客户描述具体)
- 如果父题答案表明该流程是「不适用」或「无」,不要生成追问 — 直接返回空数组
- 避免重复父题已经覆盖的内容
- 不写黑话(赋能/抓手/闭环/链路/生态)
"""

        user_prompt = f"""【父题】
- 题目:{parent.get('question', '')}
- 题型:{parent.get('type', '')}
- 客户回答:{answer_text}
- 所属 LTC 模块:{ltc_key}
- 受访角色:{', '.join(roles)}

【任务】
基于客户的回答,生成 0-{max_followups} 道追问题,深挖客户场景。
- 如果回答不值得追问(例:已经够清晰 / 选择了「不适用」),返回空数组 [] 即可
- 每道追问必须紧扣客户的具体回答内容,而不是泛泛而问

【输出格式】严格 JSON,用 ```json``` 围栏包裹:
```json
[
  {{
    "item_key": "<{parent_item_key}::followup_1 这种格式,稳定唯一>",
    "type": "single | multi | text | rating",
    "question": "<追问题正文>",
    "why": "<给顾问看的:为什么这个追问能挖出价值>",
    "options": [
      {{"value": "<英文小写>", "label": "<中文标签>"}}
    ]
  }}
]
```

约束:
- single/multi 才需要 options(最多 5 个候选,系统会自动加 __other__/__na__)
- text/rating 题 options 留 []
- rating 题加 "rating_scale": 5
- 追问数量 0-{max_followups},宁少勿滥(不要凑数)
- JSON 必须可被 json.loads 解析
"""

        try:
            raw = await _llm_call(user_prompt, system=system, max_tokens=2000, timeout=120.0)
        except Exception as e:
            logger.warning("follow_up_llm_failed", parent_key=parent_item_key, error=str(e)[:200])
            return {"items": [], "total": len(items), "error": str(e)[:120]}

        followups_raw = _extract_json_array(raw)
        if not followups_raw:
            logger.info("follow_up_empty", parent_key=parent_item_key, raw_excerpt=raw[:200])
            return {"items": [], "total": len(items), "skipped_reason": "LLM 判断无需追问"}

        # 规整每道子题
        new_items: list[dict] = []
        cleaned_roles = coerce_audience_roles(roles) or ["dept_head"]
        existing_keys = {it.get("item_key") for it in items}
        for idx, raw_item in enumerate(followups_raw[:max_followups], 1):
            if not isinstance(raw_item, dict):
                continue
            try:
                key = raw_item.get("item_key") or f"{parent_item_key}::followup_{idx}"
                # 唯一性:如冲突,加序号
                while key in existing_keys:
                    idx += 1
                    key = f"{parent_item_key}::followup_{idx}"
                raw_item["item_key"] = key
                raw_item["ltc_module_key"] = ltc_key
                raw_item["audience_roles"] = list(cleaned_roles)
                raw_item["phase"] = "in_meeting"
                raw_item["parent_item_key"] = parent_item_key
                raw_item["source"] = "follow_up"

                t = raw_item.get("type")
                if t in ("single", "multi", "node_pick"):
                    opts_raw = raw_item.get("options") or []
                    opts = [OptionItem(**o) if isinstance(o, dict) else o for o in opts_raw]
                    raw_item["options"] = [o.to_dict() for o in ensure_sentinels(opts)]
                else:
                    raw_item["options"] = []

                q = QuestionItem.from_dict(raw_item)
                d = q.to_dict()
                new_items.append(d)
                existing_keys.add(d["item_key"])
            except Exception as e:
                logger.warning("follow_up_item_parse_failed", idx=idx, error=str(e)[:120])
                continue

        if not new_items:
            return {"items": [], "total": len(items), "skipped_reason": "全部子题解析失败"}

        # 把新子题插入到父题位置之后(让 UI 自然分组)
        parent_idx = next(i for i, it in enumerate(items) if it.get("item_key") == parent_item_key)
        items[parent_idx + 1:parent_idx + 1] = new_items

        extra["questionnaire_items"] = items
        bundle.extra = extra
        flag_modified(bundle, "extra")
        await s.commit()

    logger.info("follow_up_generated",
                parent_key=parent_item_key, n=len(new_items), total=len(items))
    return {"items": new_items, "total": len(items)}
