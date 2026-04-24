"""知识覆盖缺口 API — Block 2 反馈飞轮的读取端。

数据由 Challenge fail 和（后续）负反馈回溯聚合写入；本路由只做读取 + 简单清理。
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session
from models.coverage_gap import CoverageGap
from prompts.ltc_taxonomy import INDUSTRY_TAGS, LTC_STAGES

router = APIRouter()


def _stage_label(key: str | None) -> str | None:
    if not key:
        return None
    meta = LTC_STAGES.get(key) if isinstance(LTC_STAGES, dict) else None
    if isinstance(meta, dict):
        return meta.get("name") or key
    return key


def _industry_label(key: str | None) -> str | None:
    if not key:
        return None
    return INDUSTRY_TAGS.get(key, key)


@router.get("/gaps")
async def list_gaps(
    limit: int = 20,
    session: AsyncSession = Depends(get_session),
):
    """Top N 覆盖缺口，按 fail_count 降序。"""
    limit = max(1, min(limit, 100))
    total = await session.scalar(select(func.count()).select_from(CoverageGap)) or 0
    rows = (await session.execute(
        select(CoverageGap)
        .order_by(desc(CoverageGap.fail_count), desc(CoverageGap.last_seen_at))
        .limit(limit)
    )).scalars().all()
    return {
        "total": total,
        "items": [
            {
                "id": g.id,
                "ltc_stage": g.ltc_stage,
                "ltc_stage_label": _stage_label(g.ltc_stage),
                "industry": g.industry,
                "industry_label": _industry_label(g.industry),
                "fail_count": g.fail_count,
                "keywords": g.keywords or [],
                "sample_questions": g.sample_questions or [],
                "last_seen_at": g.last_seen_at,
                "created_at": g.created_at,
            }
            for g in rows
        ],
    }
