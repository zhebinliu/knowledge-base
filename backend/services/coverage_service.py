"""知识覆盖缺口聚合服务。

Challenge 失败 / 负反馈触发时调用 upsert_gap：按 (ltc_stage, industry) 合并，
维持每条 gap 最多 10 个代表性样题 / 关键词，避免 JSON 膨胀。
"""
from datetime import datetime, timezone
import re
import structlog
from sqlalchemy import select
from models import async_session_maker
from models.coverage_gap import CoverageGap

logger = structlog.get_logger()

_KEYWORD_PATTERN = re.compile(r"[\u4e00-\u9fff]{2,}|[A-Za-z]{3,}")
_STOP_WORDS = {
    "如何", "怎么", "什么", "哪些", "是否", "可以", "需要", "应该", "进行",
    "how", "what", "why", "when", "does", "this", "that", "with", "from",
}
_MAX_KEEP = 10


def _extract_keywords(text: str, limit: int = 5) -> list[str]:
    if not text:
        return []
    tokens = _KEYWORD_PATTERN.findall(text)
    seen = []
    for t in tokens:
        low = t.lower()
        if low in _STOP_WORDS:
            continue
        if t not in seen:
            seen.append(t)
        if len(seen) >= limit:
            break
    return seen


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def upsert_gap(
    ltc_stage: str | None,
    industry: str | None,
    question: str,
) -> str | None:
    """同 (ltc_stage, industry) 再次失败 → fail_count+1、合并 keywords、刷新 last_seen_at。失败不抛错。"""
    if not ltc_stage and not industry:
        return None
    try:
        async with async_session_maker() as session:
            row = (await session.execute(
                select(CoverageGap).where(
                    CoverageGap.ltc_stage == ltc_stage,
                    CoverageGap.industry == industry,
                )
            )).scalars().first()

            kws = _extract_keywords(question)
            q_preview = (question or "").strip()[:200]

            if row is None:
                row = CoverageGap(
                    ltc_stage=ltc_stage,
                    industry=industry,
                    keywords=kws,
                    sample_questions=[q_preview] if q_preview else [],
                    fail_count=1,
                    last_seen_at=_utcnow(),
                )
                session.add(row)
            else:
                row.fail_count = (row.fail_count or 0) + 1
                row.last_seen_at = _utcnow()
                merged_kws = list(row.keywords or [])
                for k in kws:
                    if k not in merged_kws:
                        merged_kws.append(k)
                row.keywords = merged_kws[-_MAX_KEEP:]
                if q_preview:
                    samples = list(row.sample_questions or [])
                    if q_preview not in samples:
                        samples.append(q_preview)
                    row.sample_questions = samples[-_MAX_KEEP:]
            await session.commit()
            return row.id
    except Exception as e:
        logger.warning("coverage_gap_upsert_failed", error=str(e)[:200])
        return None
