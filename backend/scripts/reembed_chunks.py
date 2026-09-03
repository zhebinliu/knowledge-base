"""全量重建 Qdrant 向量索引 —— 从 PostgreSQL 的 chunks 表重新向量化。

用途:
  1. 换 embedding provider / 模型后,老向量语义不兼容,必须整体重算
  2. 迁移服务器时 qdrant 数据没搬过来(切片正文在 PG 里,不依赖 MinIO)

用法:
  docker exec kb-system-backend-1 python -m scripts.reembed_chunks
  docker exec kb-system-backend-1 python -m scripts.reembed_chunks --limit 50  # 先小批验证
  docker exec kb-system-backend-1 python -m scripts.reembed_chunks --batch 32

payload 结构与 api/chunks.py 的 upsert 保持一致,别单独改一边。
"""
import argparse
import asyncio
import sys

import structlog
from sqlalchemy import select, func

from models import async_session_maker
from models.chunk import Chunk
from services.embedding_service import embedding_service
from services.vector_store import vector_store

logger = structlog.get_logger()


def _payload(c: Chunk) -> dict:
    # 与 api/chunks.py:104 的 upsert payload 对齐
    return {
        "chunk_id": c.id,
        "document_id": c.document_id,
        "content_preview": (c.content or "")[:500],
        "ltc_stage": c.ltc_stage,
        "industry": c.industry,
        "review_status": c.review_status,
        "ltc_stage_confidence": c.ltc_stage_confidence or 0.0,
    }


async def main(batch_size: int, limit: int | None):
    await vector_store.ensure_collection()

    async with async_session_maker() as session:
        total = (await session.execute(select(func.count(Chunk.id)))).scalar_one()
        stmt = select(Chunk).order_by(Chunk.created_at)
        if limit:
            stmt = stmt.limit(limit)
        chunks = list((await session.execute(stmt)).scalars())

    target = len(chunks)
    print(f"chunks 总数={total}  本次处理={target}  批大小={batch_size}", flush=True)

    ok = 0
    failed: list[str] = []
    for i in range(0, target, batch_size):
        batch = chunks[i : i + batch_size]
        texts = [(c.content or "") for c in batch]
        try:
            vectors = await embedding_service.embed_batch(texts)
        except Exception as e:
            failed.extend(c.id for c in batch)
            print(f"  [{i + len(batch)}/{target}] embed 失败: {str(e)[:120]}", flush=True)
            continue

        for c, vec in zip(batch, vectors):
            try:
                await vector_store.upsert(c.id, vec, _payload(c))
                ok += 1
            except Exception as e:
                failed.append(c.id)
                print(f"  upsert 失败 chunk={c.id}: {str(e)[:100]}", flush=True)

        print(f"  [{min(i + batch_size, target)}/{target}] 已写入 {ok}", flush=True)

    info = await vector_store.collection_info()
    print(f"\n完成: 成功 {ok} / {target},失败 {len(failed)}", flush=True)
    print(f"collection: {info}", flush=True)
    if failed:
        print("失败的 chunk_id(前 20): " + ", ".join(failed[:20]), flush=True)
        sys.exit(1)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    # 火山 doubao-embedding-vision 的 input 上限实测是 10,给 16 会 400 Bad Request
    ap.add_argument("--batch", type=int, default=10, help="每次调 embedding 的切片数(火山上限 10)")
    ap.add_argument("--limit", type=int, default=None, help="只处理前 N 条(验证用)")
    a = ap.parse_args()
    asyncio.run(main(a.batch, a.limit))
