"""行业 knowhow 二次过滤 — KB 召回 + LLM 评分 + 高分注入。

跟 insight v3 的"项目内文档喂全文"策略不同:
- insight 用项目本身的 SOW / 集成方案 / 合同(几份)→ 全文喂 LLM
- research 用跨项目沉淀的行业最佳实践 KB(量大、质量参差)→ RAG 切片召回

由于 CLAUDE.md 明确说明"行业最佳实践 KB 不准",这里:
1. 召回 top-K(默认 10)
2. LLM 0-10 评分(基于 query 上下文判断每个 chunk 的真实相关度)
3. 只保留 ≥ score_threshold(默认 7)注入 prompt
4. 同时把所有候选返回给前端,让顾问看到来源 + 评分,可手动剔除
"""
import json
import structlog
from dataclasses import dataclass, asdict

logger = structlog.get_logger()


@dataclass
class KbCandidate:
    chunk_id: str
    filename: str
    source_section: str
    content: str
    retrieval_score: float    # qdrant 余弦相似度
    ai_score: float           # LLM 0-10 相关度评分
    ai_reason: str            # LLM 给出的简短理由(给顾问看)
    query: str
    ltc_module_key: str

    def to_dict(self) -> dict:
        return asdict(self)


async def fetch_industry_knowhow(
    *,
    ltc_module_key: str,
    ltc_module_label: str,
    industry: str | None,
    extra_keywords: list[str] | None = None,
    top_k: int = 10,
    score_threshold: float = 7.0,
    model: str | None = None,
) -> list[KbCandidate]:
    """召回 + 评分,返回所有候选(包含低分,前端显示用)。

    要注入 prompt 时,调用方只取 [c for c in result if c.ai_score >= score_threshold]。
    """
    query_parts = [ltc_module_label]
    if industry:
        query_parts.append(industry)
    if extra_keywords:
        query_parts.extend(extra_keywords)
    query = " ".join(query_parts)

    candidates = await _retrieve(query, industry=industry, top_k=top_k)
    if not candidates:
        return []

    # LLM 评分(单次批量打分,降低延迟和成本)
    scored = await _score_with_llm(
        query=query,
        ltc_module_label=ltc_module_label,
        industry=industry,
        candidates=candidates,
        model=model,
    )

    # 装到 dataclass
    out: list[KbCandidate] = []
    for c, s in zip(candidates, scored):
        out.append(KbCandidate(
            chunk_id=c["chunk_id"],
            filename=c["filename"],
            source_section=c["source_section"],
            content=c["content"],
            retrieval_score=c["retrieval_score"],
            ai_score=s["score"],
            ai_reason=s["reason"],
            query=query,
            ltc_module_key=ltc_module_key,
        ))
    out.sort(key=lambda x: -x.ai_score)
    logger.info("kb_filter_done", ltc_module_key=ltc_module_key,
                total=len(out),
                high_score=sum(1 for c in out if c.ai_score >= score_threshold))
    return out


async def _retrieve(query: str, *, industry: str | None, top_k: int) -> list[dict]:
    """从 KB(全库)召回 top-K chunk。

    与 insight 不同:不限定 document_ids,因为行业 knowhow 是跨项目沉淀。
    """
    from services.embedding_service import embedding_service
    from services.vector_store import vector_store
    from sqlalchemy import select
    from models import async_session_maker
    from models.chunk import Chunk
    from models.document import Document

    try:
        qvec = await embedding_service.embed(query, use_cache=True)
        raw = await vector_store.search(qvec, top_k=top_k, industry=industry)
        if not raw and industry:
            # 行业过滤无命中 → 全库降级
            raw = await vector_store.search(qvec, top_k=top_k)
    except Exception as e:
        logger.warning("kb_filter_retrieval_failed", error=str(e)[:200])
        return []

    if not raw:
        return []

    chunk_ids = [r["id"] for r in raw]
    async with async_session_maker() as s:
        detail_rows = (await s.execute(
            select(Chunk.id, Chunk.content, Chunk.source_section,
                   Document.filename)
            .join(Document, Document.id == Chunk.document_id)
            .where(Chunk.id.in_(chunk_ids))
        )).all()
    detail_map = {r.id: r for r in detail_rows}

    out = []
    for r in raw:
        d = detail_map.get(r["id"])
        if not d:
            continue
        out.append({
            "chunk_id": r["id"],
            "filename": d.filename or "",
            "source_section": d.source_section or "",
            "content": (d.content or "")[:1000],   # 单 chunk 截到 1k char,LLM 评分够用
            "retrieval_score": float(r.get("score") or 0.0),
        })
    return out


async def _score_with_llm(
    *,
    query: str,
    ltc_module_label: str,
    industry: str | None,
    candidates: list[dict],
    model: str | None = None,
) -> list[dict]:
    """LLM 一次批量给所有候选打分。

    返回与 candidates 同序的 [{score: float, reason: str}, ...]。
    """
    if not candidates:
        return []

    from services.output_service import _llm_call

    # 拼 candidates 编号 prompt
    cand_block_lines = []
    for i, c in enumerate(candidates, 1):
        snippet = c["content"][:600]
        cand_block_lines.append(
            f"[#{i}] 来源:{c['filename']} · {c['source_section']}\n{snippet}"
        )
    cand_block = "\n\n".join(cand_block_lines)

    system = """你是 CRM 行业资深顾问。任务:针对一个具体的 LTC 模块和客户行业,
给一组从知识库召回的候选片段打"真实相关度"分(0-10)。

打分标准:
- 9-10:直接命中本模块在该行业的最佳实践,可作为 prompt 主参考
- 7-8:相关且有借鉴意义,可注入但不是核心
- 4-6:边缘相关 / 部分相关,容易误导,不建议用
- 0-3:无关 / 噪声 / 与本模块或行业不匹配

输出严格 JSON,与候选条数对齐:
{
  "scores": [
    {"id": 1, "score": <0-10 浮点>, "reason": "<≤30 字简短理由>"},
    ...
  ]
}
不要 markdown 围栏。"""

    user = f"""【目标 LTC 模块】{ltc_module_label}
【客户行业】{industry or '通用'}
【调研意图查询】{query}

【候选片段】
{cand_block}

请按上面格式给每个 #N 打分,id 必须与候选编号一致。"""

    try:
        raw = await _llm_call(user, system=system, model=model,
                              max_tokens=2000, timeout=90.0)
    except Exception as e:
        logger.warning("kb_filter_score_llm_failed", error=str(e)[:200])
        return [{"score": 0.0, "reason": "LLM 评分失败"} for _ in candidates]

    parsed = _parse_json_robust(raw)
    scores_arr = (parsed.get("scores") or []) if isinstance(parsed, dict) else []
    by_id = {int(s.get("id") or 0): s for s in scores_arr if isinstance(s, dict)}

    out = []
    for i in range(1, len(candidates) + 1):
        s = by_id.get(i) or {}
        try:
            score = float(s.get("score") or 0.0)
        except (TypeError, ValueError):
            score = 0.0
        out.append({
            "score": min(max(score, 0.0), 10.0),
            "reason": str(s.get("reason") or "")[:60],
        })
    return out


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


def render_high_score_block(candidates: list[KbCandidate], *, threshold: float = 7.0,
                             max_chunks: int = 5) -> str:
    """把高分 chunks 渲染成 prompt 注入块。给 outline / questionnaire 生成 prompt 用。"""
    selected = [c for c in candidates if c.ai_score >= threshold][:max_chunks]
    if not selected:
        return ""
    lines = ["【行业 knowhow 参考(已 LLM 二次过滤,仅保留高相关度)】"]
    for i, c in enumerate(selected, 1):
        lines.append(f"\n[K{i}] {c.filename} · {c.source_section}(相关度 {c.ai_score:.1f}/10)")
        lines.append(c.content[:500])
    return "\n".join(lines)
