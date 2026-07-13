"""蓝图回流 —— 场景库变更提案识别环节(Harness P4)。

定位:
- 读某项目最新一版「To-Be 蓝图」(curated_bundles 里 kind='blueprint_design' 且 status='done' 的正文),
- 拿全部 active 的「标准场景库」(models/scene.py::StandardScene)作对照底库,
- 一次 LLM 调用,让模型对比蓝图与标准库,识别出:
    · optimize —— 蓝图里对某个已有标准场景做了实质优化(scene_code 指向已有 code),
    · new      —— 蓝图里出现了标准库尚未收录的全新场景(scene_code 为 null 或模型建议的新编码)。

产物是「变更提案」而非直接落库:识别结果交给后续审核环节(P4 审核通过后才回写 standard_scenes /
scene_changes)。因此本模块只读不写,不产生任何数据库副作用。

原则:只提「确有依据」的变更,宁缺毋滥,别为凑数硬造。解析失败 / 无蓝图 → 返回 []。

模型走 model_router 的 `scene_reflow` task(路由表里没配则回落到 router 默认规则)。
"""
from __future__ import annotations

import json
import re

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from services.model_router import model_router
from models.curated_bundle import CuratedBundle
from models.scene import StandardScene

logger = structlog.get_logger()

# 蓝图正文喂给 LLM 的字符上限:蓝图通常几千到一万余字,一万五足够覆盖正文,
# 超出取头部(蓝图结论/场景清单一般集中在前中段),避免撑爆上下文。
_MAX_BLUEPRINT_CHARS = 15000

# 合法的变更类型
_VALID_CHANGE_TYPES = {"new", "optimize"}

# 提案数量上限:宁缺毋滥,超过则截断(避免模型灌水)
_MAX_PROPOSALS = 30


_SYSTEM_PROMPT = """你是纷享销客 CRM 实施方法论专家,负责「蓝图回流」审核前的场景识别。

给你两样东西:
1. 某个已交付项目的 **To-Be 蓝图正文**(客户未来态的业务场景设计);
2. 一份 **标准场景库**(公司沉淀的通用 Core 场景,按 LTC/ITR/MCR/MPR/MTL 等域组织,每条含 域/编码/名称)。

你的任务:把蓝图里体现的业务场景,跟标准场景库逐一对照,识别出两类「场景库变更提案」:
- optimize(优化已有):蓝图里的某个场景本质上就是标准库里某条已有场景,但蓝图给出了**更好 / 更细 / 更贴合实战**的做法。
  这类要指明它对应标准库里哪一条(scene_code 填该条已有编码),summary 说清相对标准场景「优化在哪、为什么更好」。
- new(全新场景):蓝图里出现了标准场景库**完全没有收录**的场景。scene_code 留空(null),
  domain 给最贴近的域(LTC/ITR/MCR/MPR/MTL 之一,拿不准就填最接近的),summary 说清这是标准库缺失的新场景、价值是什么。

严格要求:
- 只提**确有依据**的变更 —— 蓝图正文里能读到明确支撑的才提,宁缺毋靠猜凑数。蓝图没体现的场景不要提。
- optimize 的门槛是「相对标准场景确有实质增益」,仅仅是换了措辞 / 同义表述**不算**优化,不要提。
- 一条蓝图场景要么归 optimize 要么归 new,不要重复。
- 若对照后确实没有值得回流的变更,返回空数组 []。

输出格式(严格遵守):
只输出一个 JSON 数组,不要任何解释文字、不要 markdown 代码围栏。数组每项按下面结构化格式给出
(说明/业务规则/流程/推荐字段 —— 与场景库统一格式,方便审核通过后直接沉淀):
{
  "change_type": "new" | "optimize",
  "domain": "LTC",              // new 必填(最贴近的域);optimize 可填该场景所在域或 null
  "scene_code": "LM-01" | null, // optimize 必填(指向标准库已有编码);new 填 null(或你建议的新编码)
  "name": "场景名称",           // 简洁,≤ 30 字
  "summary": "一句到两句话:optimize 说清相对标准场景的优化点;new 说清标准库没有的新场景及价值",
  "description": "场景说明:这个场景在业务里做什么、解决什么问题(2-4 句)",
  "business_rules": "关键业务规则,分条列(用换行分隔;没有可留空字符串)",
  "process": "主要流程步骤,简述(用换行或箭头;没有可留空字符串)",
  "recommended_fields": [       // 推荐字段(该场景在 CRM 里建议配置的字段);没有则给 []
    {"name": "字段名", "type": "文本/单选/日期/数字…", "note": "字段说明", "required": true}
  ]
}
description/business_rules/process/recommended_fields 都要基于蓝图正文的真实内容,读不到就留空,别硬编。
若无变更则输出 []。"""


def _format_scene_library(scenes: list[StandardScene]) -> str:
    """把 active 标准场景渲染成「按域分组」的对照底库文本。"""
    if not scenes:
        return "(标准场景库为空)"
    by_domain: dict[str, list[StandardScene]] = {}
    for sc in scenes:
        by_domain.setdefault(sc.domain or "(未分域)", []).append(sc)
    lines: list[str] = []
    for domain in sorted(by_domain.keys()):
        lines.append(f"## 域 {domain}")
        for sc in by_domain[domain]:
            lines.append(f"- [{sc.code}] {sc.name}")
    return "\n".join(lines)


def _extract_json_array(raw: str) -> list:
    """从 LLM 原始输出里健壮地解析出 JSON 数组。

    容错顺序:
      1) 直接 json.loads;
      2) 剥掉 markdown 代码围栏(```json ... ```)后再 loads;
      3) 抓第一个 '[' 到最后一个 ']' 的子串再 loads。
    全部失败返回 []。
    """
    if not raw:
        return []
    text = raw.strip()

    # 尝试 1:直接解析
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return parsed
    except Exception:
        pass

    # 尝试 2:剥代码围栏
    cleaned = text
    if cleaned.startswith("```"):
        # 去掉首行 ``` 或 ```json
        cleaned = cleaned.split("\n", 1)[-1] if "\n" in cleaned else ""
        if cleaned.rstrip().endswith("```"):
            cleaned = cleaned.rstrip()[:-3]
    cleaned = cleaned.strip()
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, list):
            return parsed
    except Exception:
        pass

    # 尝试 3:抓 [...] 子串
    i, j = text.find("["), text.rfind("]")
    if 0 <= i < j:
        try:
            parsed = json.loads(text[i:j + 1])
            if isinstance(parsed, list):
                return parsed
        except Exception:
            pass

    return []


def _normalize_proposals(
    raw_items: list,
    code_to_scene: dict[str, StandardScene],
) -> list[dict]:
    """清洗 LLM 输出的提案数组,过滤非法项 + 归一化字段。

    - change_type 必须是 new / optimize,否则丢弃;
    - name 必填(空则丢弃);
    - optimize:scene_code 必须命中标准库已有编码(否则视为无依据,丢弃);
      domain 优先取命中场景的域;
    - new:scene_code 取模型建议值或 null;domain 取模型给的域(缺省 null)。
    """
    out: list[dict] = []
    seen: set[tuple] = set()
    for item in raw_items:
        if not isinstance(item, dict):
            continue

        change_type = str(item.get("change_type") or "").strip().lower()
        if change_type not in _VALID_CHANGE_TYPES:
            continue

        name = str(item.get("name") or "").strip()
        if not name:
            continue

        summary = str(item.get("summary") or "").strip()
        raw_code = item.get("scene_code")
        scene_code = str(raw_code).strip() if raw_code not in (None, "", "null") else None
        raw_domain = item.get("domain")
        domain = str(raw_domain).strip().upper() if raw_domain not in (None, "", "null") else None

        if change_type == "optimize":
            # optimize 必须指向已有标准场景,否则无依据 —— 丢弃
            if not scene_code or scene_code not in code_to_scene:
                logger.info("scene_reflow_optimize_dropped", reason="scene_code 未命中标准库", scene_code=scene_code, name=name)
                continue
            matched = code_to_scene[scene_code]
            domain = matched.domain or domain
        else:  # new
            # new 的 scene_code 留空(即使模型给了建议编码,也不能跟已有编码冲突)
            if scene_code and scene_code in code_to_scene:
                scene_code = None

        dedup_key = (change_type, scene_code, name)
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        # 结构化内容(与场景库统一格式),审核通过后可直接沉淀成场景字段
        rec_fields = item.get("recommended_fields")
        if not isinstance(rec_fields, list):
            rec_fields = []
        content = {
            "description": str(item.get("description") or "").strip(),
            "business_rules": str(item.get("business_rules") or "").strip(),
            "process": str(item.get("process") or "").strip(),
            "recommended_fields": [
                {"name": str(f.get("name") or "").strip(), "type": str(f.get("type") or "").strip(),
                 "note": str(f.get("note") or "").strip(), "required": bool(f.get("required"))}
                for f in rec_fields if isinstance(f, dict) and str(f.get("name") or "").strip()
            ],
        }

        out.append({
            "change_type": change_type,
            "domain": domain,
            "scene_code": scene_code,
            "name": name[:300],
            "summary": summary,
            "content": content,
        })
        if len(out) >= _MAX_PROPOSALS:
            break

    return out


async def propose_scene_changes(project_id: str, session: AsyncSession) -> list[dict]:
    """读项目最新 To-Be 蓝图,对照标准场景库,用 LLM 提出场景库变更提案。

    返回 list[dict],每项:
      {"change_type": "new"|"optimize", "domain": str|None,
       "scene_code": str|None, "name": str, "summary": str}

    没有已完成蓝图 / 解析失败 → 返回 []。本函数只读,不写库。
    """
    # 1) 取该项目最新一条 status='done' 且 kind='blueprint_design' 的蓝图正文
    bp = (await session.execute(
        select(CuratedBundle)
        .where(CuratedBundle.project_id == project_id)
        .where(CuratedBundle.kind == "blueprint_design")
        .where(CuratedBundle.status == "done")
        .order_by(CuratedBundle.updated_at.desc())
    )).scalars().first()

    blueprint_md = ((bp.content_md if bp else None) or "").strip()
    if not blueprint_md:
        logger.info("scene_reflow_no_blueprint", project_id=project_id)
        return []

    if len(blueprint_md) > _MAX_BLUEPRINT_CHARS:
        blueprint_md = (
            blueprint_md[:_MAX_BLUEPRINT_CHARS]
            + f"\n\n[... 蓝图正文超长,已截断,余下 {len(bp.content_md) - _MAX_BLUEPRINT_CHARS} 字省略 ...]"
        )

    # 2) 全部 active 标准场景作对照底库
    scenes = (await session.execute(
        select(StandardScene)
        .where(StandardScene.status == "active")
        .order_by(StandardScene.domain, StandardScene.code)
    )).scalars().all()
    code_to_scene = {sc.code: sc for sc in scenes if sc.code}
    library_block = _format_scene_library(list(scenes))

    # 3) 组装 prompt + 调 LLM
    user_prompt = (
        f"【标准场景库(对照底库,共 {len(scenes)} 条 active 场景)】\n"
        f"{library_block}\n\n"
        f"【项目 To-Be 蓝图正文】\n"
        f"{blueprint_md}\n\n"
        "请对照上面两部分,严格输出场景库变更提案 JSON 数组(无变更则输出 [])。"
    )
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]

    logger.info(
        "scene_reflow_start",
        project_id=project_id,
        blueprint_chars=len(blueprint_md),
        scene_count=len(scenes),
    )

    try:
        content, model_used = await model_router.chat_with_routing(
            task="scene_reflow",
            messages=messages,
            max_tokens=4000,
            temperature=0.3,  # 识别任务偏稳定,不需要发散
        )
    except Exception as e:
        logger.warning("scene_reflow_llm_failed", project_id=project_id, error=str(e)[:200])
        return []

    raw_items = _extract_json_array(content or "")
    proposals = _normalize_proposals(raw_items, code_to_scene)

    logger.info(
        "scene_reflow_done",
        project_id=project_id,
        model=model_used,
        raw_count=len(raw_items) if isinstance(raw_items, list) else 0,
        proposal_count=len(proposals),
    )
    return proposals
