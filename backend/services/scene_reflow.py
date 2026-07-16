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
_MAX_BLUEPRINT_CHARS = 40000

# 合法的变更类型
_VALID_CHANGE_TYPES = {"new", "optimize"}

# 提案数量上限:宁缺毋滥,超过则截断(避免模型灌水)
_MAX_PROPOSALS = 30


_SYSTEM_PROMPT = """你是纷享销客 CRM 实施方法论专家,负责「蓝图回流」审核前的场景识别。

给你两样东西:
1. 某个已交付项目的 **To-Be 蓝图正文**(客户未来态的业务场景设计);
2. 一份 **标准场景库**(公司沉淀的通用 Core 场景,按 LTC/ITR/MCR/MPR/MTL 等域组织,每条含 域/编码/名称)。

你的任务:把蓝图里体现的业务场景,跟标准场景库逐一对照,识别出两类「场景库变更提案」:
- optimize(优化已有):蓝图里的某个场景对应标准库里某条已有场景,但蓝图把这个通用场景**落到了更具体的做法**——
  更细的字段 / 更明确的流程步骤 / 更具体的业务规则 / 更贴该客户实战的处理方式。
  这类指明对应标准库哪一条(scene_code 填该条已有编码),summary 说清「蓝图比标准场景细在哪、加了什么」。
- new(全新场景):蓝图里出现了标准场景库**完全没有收录**的场景。scene_code 留空(null),
  domain 给最贴近的域(LTC/ITR/MCR/MPR/MTL 之一,拿不准就填最接近的),summary 说清这是标准库缺失的新场景、价值是什么。

判定要求(**挖全,但每条都要能引蓝图原文**):
- **把蓝图写到的增量都挖出来**:蓝图里凡是把某标准场景落到了更具体的字段 / 流程 / 规则,或出现了标准库没有的场景,都提出来。一份认真做的项目蓝图**通常有几条到十几条**,别只挑一两条、别自我过滤。
- **铁律·每条必须能引原文**:每条提案都必须能从蓝图正文里**逐字摘出一段原话**填进 blueprint_evidence(20-80 字,连续原文,不许改写/拼接/编造)。这是你有没有编造的凭证——**摘不出蓝图原话的,就是没依据,不许提**。
- **严禁用常识补细节**:summary / description / 业务规则 / 流程 / 推荐字段,**只能写蓝图里明确写到的内容**。蓝图没写的具体做法(某个字段、某条规则、某项集成、某种参数),哪怕是行业惯例、哪怕听起来很合理,也**绝不许替它补上**;读不到就留空。宁可内容单薄,也不要编。
- optimize:蓝图把某标准场景落到了**具体且蓝图明确写出**的字段 / 流程 / 规则,才提,scene_code 指向该标准编码。纯换措辞、同义复述、蓝图没对应内容的,不提。
- new:只有标准库**完全没收录**、且蓝图**明确设计了**的场景才算;拿不准是不是已有就归 optimize。
- 一条蓝图场景要么 optimize 要么 new,不重复。

输出格式(严格遵守):
只输出一个 JSON 数组,不要任何解释文字、不要 markdown 代码围栏。数组每项按下面结构化格式给出
(说明/业务规则/流程/推荐字段 —— 与场景库统一格式,方便审核通过后直接沉淀):
{
  "change_type": "new" | "optimize",
  "domain": "LTC",              // new 必填(最贴近的域);optimize 可填该场景所在域或 null
  "scene_code": "LM-01" | null, // optimize 必填(指向标准库已有编码);new 填 null(或你建议的新编码)
  "name": "场景名称",           // 简洁,≤ 30 字
  "blueprint_evidence": "从蓝图正文【逐字摘录】的一段原话(20-80字),证明本提案确有蓝图依据。必须是蓝图里真实出现的连续文字,不许改写、不许拼接、不许编造;摘不出就别提这条",
  "summary": "一句到两句话:optimize 说清相对标准场景的优化点;new 说清标准库没有的新场景及价值。只依据蓝图,不补常识",
  "description": "场景说明:蓝图里这个场景做什么、解决什么问题(2-4 句,只写蓝图写到的)",
  "business_rules": "关键业务规则,分条列(用换行分隔;蓝图没写就留空字符串,别补常识)",
  "process": "主要流程步骤,简述(用换行或箭头;蓝图没写就留空字符串)",
  "recommended_fields": [       // 推荐字段:【仅限蓝图正文明确提到的字段】,蓝图没点名的字段不许自己加;没有则给 []
    {"name": "字段名", "type": "文本/单选/日期/数字…", "note": "字段说明", "required": true}
  ]
}
summary / description / business_rules / process / recommended_fields 全部只能来自蓝图正文明确写到的内容;蓝图没写的别硬编、别用常识补。
blueprint_evidence 必须是蓝图里真实出现的原文片段(逐字),这是判断你有没有编造的依据 —— 编造原文会被直接查出来。
若确实读不出任何有蓝图依据的增量,就输出 []。"""


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
    blueprint_md: str = "",
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
    norm_bp = re.sub(r"\s+", "", blueprint_md) if blueprint_md else ""
    for item in raw_items:
        if not isinstance(item, dict):
            continue

        change_type = str(item.get("change_type") or "").strip().lower()
        if change_type not in _VALID_CHANGE_TYPES:
            continue

        name = str(item.get("name") or "").strip()
        if not name:
            continue

        # 反幻觉:blueprint_evidence 必须是蓝图里真实出现的原文(去空白后子串匹配),摘不出 / 编造的直接丢弃。
        # 这是把"编造整条候选"挡在门外的硬闸——模型引不出原文,说明这条不是从蓝图读来的。
        evidence = str(item.get("blueprint_evidence") or "").strip()
        if norm_bp:
            norm_ev = re.sub(r"\s+", "", evidence)
            if len(norm_ev) < 8 or norm_ev not in norm_bp:
                logger.info("scene_reflow_evidence_unverified", name=name,
                            change_type=change_type, evidence=evidence[:80])
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
            "blueprint_evidence": evidence,
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


def _reflow_output_valid(content: str | None, finish_reason: str | None) -> bool:
    """chat_with_routing 校验器:截断(finish_reason='length')或空输出都算失败,触发回退到备用模型。
    能抓到 JSON 数组结构([ ... ])就算有效——真「无变更」时模型输出的空数组 "[]" 也算有效,不会误判触发回退。
    没有校验器时,glm-5 思考烧光 token 吐空会被静默当成「无提案」,回流永远出 0 条。"""
    if finish_reason == "length":
        return False
    c = (content or "").strip()
    return "[" in c and "]" in c


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

    # 带校验器 + 2 轮重试:校验器让空/截断输出触发主备回退(否则 glm-5 吐空会被静默当「无提案」)。
    # 每轮 chat_with_routing 内部走 primary(minimax)→ fallback(glm-5);2 轮都空才认输返回 []。
    content = ""
    model_used = ""
    for attempt in (1, 2):
        try:
            content, model_used = await model_router.chat_with_routing(
                task="scene_reflow",
                messages=messages,
                max_tokens=16000,   # 放宽后一次可产 5-15 条,每条带 description/规则/流程/字段,4000 会截断→校验器拒→空转
                temperature=0.3,  # 识别任务偏稳定,不需要发散
                validator=_reflow_output_valid,
            )
        except Exception as e:
            logger.warning("scene_reflow_llm_failed", project_id=project_id, attempt=attempt, error=str(e)[:200])
            content = ""
        if (content or "").strip():
            break
    if not (content or "").strip():
        logger.warning("scene_reflow_empty_after_retry", project_id=project_id)
        return []

    raw_items = _extract_json_array(content or "")
    proposals = _normalize_proposals(raw_items, code_to_scene, blueprint_md)

    logger.info(
        "scene_reflow_done",
        project_id=project_id,
        model=model_used,
        raw_count=len(raw_items) if isinstance(raw_items, list) else 0,
        proposal_count=len(proposals),
    )
    return proposals
