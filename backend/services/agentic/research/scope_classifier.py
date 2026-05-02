"""范围四分类器 — 顾问录完一个模块全部题目后,LLM 自动判断每题对应的范围分类。

四分类:
- new          需新建的流程(客户从 0 开始)
- digitize     已有线下流程,需要数字化工具
- migrate      已有流程,需搬迁到新系统
- out_of_scope 不纳入一期

策略:
- 不向受访者问(客户没法判断这个元问题)
- 顾问录完一个 ltc_module_key 全部题目后触发
- LLM 综合 (题目 + 答案 + SOW 摘要 + insight 摘要) 给每题打标
- 写入 research_responses.scope_label,scope_label_source='ai'
- 顾问可手改(写入时改 scope_label_source='manual')
"""
import json
import structlog
from sqlalchemy import select

from models import async_session_maker
from models.curated_bundle import CuratedBundle
from models.research_response import ResearchResponse
from models.project import Project

logger = structlog.get_logger()


VALID_LABELS = {"new", "digitize", "migrate", "out_of_scope"}


async def classify_scope_for_bundle(
    bundle_id: str,
    *,
    ltc_module_key: str | None = None,
    model: str | None = None,
) -> dict:
    """对一个 survey bundle 的题目-答案做范围四分类。

    ltc_module_key 不传 = 分类所有 LTC 模块。

    返回:{
      "items": [{item_key, scope_label, source}, ...],
      "skipped": int,           # 没答案的题
      "errors": list[str]
    }
    """
    async with async_session_maker() as s:
        bundle = await s.get(CuratedBundle, bundle_id)
        if not bundle:
            return {"items": [], "skipped": 0, "errors": ["bundle not found"]}
        project = await s.get(Project, bundle.project_id) if bundle.project_id else None

    extra = bundle.extra or {}
    items_all = extra.get("questionnaire_items") or []
    if not items_all:
        return {"items": [], "skipped": 0, "errors": ["no questionnaire_items"]}

    # 按 ltc_module_key 过滤
    target_items = items_all
    if ltc_module_key:
        target_items = [i for i in items_all
                        if i.get("ltc_module_key") == ltc_module_key]
    if not target_items:
        return {"items": [], "skipped": 0, "errors": ["no items for given ltc_module_key"]}

    # 拉答案
    async with async_session_maker() as s:
        rows = (await s.execute(
            select(ResearchResponse).where(ResearchResponse.bundle_id == bundle_id)
        )).scalars().all()
    answers = {r.item_key: r for r in rows}

    # 只对"已有答案"的题分类(没答案的没法判断)
    answered = [it for it in target_items if it.get("item_key") in answers
                and answers[it["item_key"]].answer_value is not None]
    skipped = len(target_items) - len(answered)
    if not answered:
        return {"items": [], "skipped": skipped, "errors": ["no answered items"]}

    # SOW / insight 摘要 — 简短,只是给 LLM 上下文
    project_summary = ""
    if project:
        project_summary = (f"客户:{project.customer or '—'};行业:{project.industry or '—'};"
                           f"项目:{project.name or '—'}")

    # LLM 批量分类
    label_map = await _classify_with_llm(
        items_with_answers=[
            {
                "item_key": it["item_key"],
                "ltc_module_key": it.get("ltc_module_key"),
                "question": it.get("question"),
                "type": it.get("type"),
                "answer": _stringify_answer(answers[it["item_key"]].answer_value, it),
            }
            for it in answered
        ],
        project_summary=project_summary,
        model=model,
    )

    # 写回 DB:scope_label_source='ai',只覆盖原本是 None 或之前是 ai 的(不覆盖 manual)
    written = []
    async with async_session_maker() as s:
        rows2 = (await s.execute(
            select(ResearchResponse).where(
                ResearchResponse.bundle_id == bundle_id,
                ResearchResponse.item_key.in_(list(label_map.keys())),
            )
        )).scalars().all()
        for r in rows2:
            label = label_map.get(r.item_key)
            if not label or label not in VALID_LABELS:
                continue
            if r.scope_label_source == "manual":
                # 顾问已经手改过,AI 不覆盖
                continue
            r.scope_label = label
            r.scope_label_source = "ai"
            written.append({
                "item_key": r.item_key,
                "scope_label": label,
                "source": "ai",
            })
        await s.commit()

    logger.info("scope_classifier_done", bundle_id=bundle_id,
                ltc_module_key=ltc_module_key, written=len(written), skipped=skipped)
    return {"items": written, "skipped": skipped, "errors": []}


async def _classify_with_llm(
    *,
    items_with_answers: list[dict],
    project_summary: str,
    model: str | None,
) -> dict[str, str]:
    """LLM 一次批量给每题分类,返回 {item_key: scope_label}。"""
    if not items_with_answers:
        return {}

    from services.output_service import _llm_call

    cand_lines = []
    for i, it in enumerate(items_with_answers, 1):
        cand_lines.append(
            f"[#{i}] item_key={it['item_key']} | LTC={it.get('ltc_module_key', '?')}\n"
            f"  问:{it.get('question', '')}\n"
            f"  答({it.get('type', '?')}):{it.get('answer', '')}"
        )
    cand_block = "\n\n".join(cand_lines)

    system = """你是 CRM 实施顾问。任务:基于客户对每道调研题的回答,判断该题对应的功能/流程
应被纳入"实施范围"的哪个分类。

四个标签(只能用这四个英文 key):
- new           客户当前完全没有此功能/流程,是从 0 新建
- digitize      客户当前有线下/纸质/Excel 流程,需做数字化工具承接
- migrate       客户当前已有数字化系统(老 CRM/ERP 模块),需搬迁到新系统
- out_of_scope  本期不纳入(可能下期、或客户明确不要、或与 SOW 不符)

判断依据:
- 客户答案揭示当前状态(已有/没有/有但散乱/有系统/无系统)→ 决定 new vs digitize vs migrate
- 客户答案揭示明确"不需要 / 暂不考虑 / 已被排除"→ out_of_scope
- 客户没答 / 答"不适用"→ 默认 new(谨慎兜底,后续顾问可改)

输出严格 JSON,不要 markdown 围栏:
{
  "items": [
    {"id": <候选编号>, "item_key": "<原 item_key>", "scope_label": "<new|digitize|migrate|out_of_scope>"},
    ...
  ]
}"""

    user = f"""【项目摘要】
{project_summary or '(暂无)'}

【已答题清单】
{cand_block}

请按上面格式给每个 #N 输出 scope_label,id 必须与候选编号一致。"""

    try:
        raw = await _llm_call(user, system=system, model=model,
                              max_tokens=3000, timeout=120.0)
    except Exception as e:
        logger.warning("scope_classifier_llm_failed", error=str(e)[:200])
        return {}

    parsed = _parse_json_robust(raw)
    items_arr = (parsed.get("items") or []) if isinstance(parsed, dict) else []
    out: dict[str, str] = {}
    for it in items_arr:
        if not isinstance(it, dict):
            continue
        key = it.get("item_key")
        label = it.get("scope_label")
        if key and label in VALID_LABELS:
            out[key] = label
    return out


def _stringify_answer(value, item: dict) -> str:
    """把答案值序列化成可读字符串给 LLM 看。"""
    if value is None:
        return "(空)"
    t = item.get("type")
    if t == "single":
        # value 是 option value;映射回 label
        opts = item.get("options") or []
        for o in opts:
            if isinstance(o, dict) and o.get("value") == value:
                return o.get("label") or str(value)
        # 形如 "__other__:xxx" 这种 other 值
        if isinstance(value, str) and value.startswith("__other__:"):
            return f"其他:{value[len('__other__:'):]}"
        return str(value)
    if t in ("multi", "node_pick"):
        if not isinstance(value, list):
            return str(value)
        opts = {o.get("value"): o.get("label", o.get("value")) for o in (item.get("options") or []) if isinstance(o, dict)}
        labels = [opts.get(v, str(v)) for v in value]
        return "、".join(labels)
    if t == "rating":
        return f"{value}/{item.get('rating_scale', 5)}"
    if t == "number":
        unit = item.get("number_unit") or ""
        return f"{value}{unit}"
    return str(value)


def _parse_json_robust(text: str) -> dict:
    if not text:
        return {}
    s = text.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[-1]
        if s.endswith("```"):
            s = s.rsplit("```", 1)[0]
    try:
        return json.loads(s)
    except Exception:
        i, j = s.find("{"), s.rfind("}")
        if 0 <= i < j:
            try:
                return json.loads(s[i:j+1])
            except Exception:
                pass
    return {}
