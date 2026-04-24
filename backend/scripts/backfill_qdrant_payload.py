"""
一次性迁移：为现存 Qdrant 点补齐 review_status / ltc_stage_confidence payload。

只调用 qdrant `set_payload`（合并式写入），不重算向量、不删点、不动 content。
幂等：多次执行结果一致。

用法：
    docker exec kb-system-backend-1 python -m scripts.backfill_qdrant_payload
"""

import asyncio
import structlog
from sqlalchemy import select
from models import async_session_maker
from models.chunk import Chunk
from services.vector_store import vector_store
from config import settings

logger = structlog.get_logger()

BATCH_SIZE = 100


async def main():
    total = 0
    updated = 0
    async with async_session_maker() as session:
        rows = (await session.execute(
            select(Chunk.id, Chunk.review_status, Chunk.ltc_stage_confidence)
            .where(Chunk.vector_id.is_not(None))
        )).all()
    total = len(rows)
    logger.info("backfill_start", total=total)

    client = vector_store.client
    batch: list[tuple[str, dict]] = []
    for chunk_id, review_status, confidence in rows:
        payload = {
            "review_status": review_status or "auto_approved",
            "ltc_stage_confidence": float(confidence) if confidence is not None else 0.0,
        }
        batch.append((chunk_id, payload))
        if len(batch) >= BATCH_SIZE:
            await _flush(client, batch)
            updated += len(batch)
            logger.info("backfill_progress", updated=updated, total=total)
            batch = []
    if batch:
        await _flush(client, batch)
        updated += len(batch)

    logger.info("backfill_done", updated=updated, total=total)
    print(f"Backfilled {updated}/{total} Qdrant points")


async def _flush(client, batch: list[tuple[str, dict]]):
    for chunk_id, payload in batch:
        try:
            await client.set_payload(
                collection_name=settings.qdrant_collection,
                payload=payload,
                points=[chunk_id],
            )
        except Exception as e:
            logger.warning("backfill_one_failed", chunk_id=chunk_id, error=str(e)[:100])


if __name__ == "__main__":
    asyncio.run(main())
