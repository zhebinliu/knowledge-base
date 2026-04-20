import structlog
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct,
    Filter, FieldCondition, MatchValue,
)
from config import settings

logger = structlog.get_logger()

COLLECTION_CONFIG = {
    "collection_name": settings.qdrant_collection,
    "vectors_config": VectorParams(size=1024, distance=Distance.COSINE),
}


class VectorStore:
    def __init__(self):
        self._client = None

    @property
    def client(self) -> AsyncQdrantClient:
        if self._client is None:
            self._client = AsyncQdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)
        return self._client

    async def ensure_collection(self):
        existing = await self.client.get_collections()
        names = [c.name for c in existing.collections]
        if settings.qdrant_collection not in names:
            await self.client.create_collection(
                collection_name=settings.qdrant_collection,
                vectors_config=COLLECTION_CONFIG["vectors_config"],
            )
            logger.info("qdrant_collection_created", name=settings.qdrant_collection)

    async def upsert(self, chunk_id: str, vector: list[float], payload: dict):
        await self.client.upsert(
            collection_name=settings.qdrant_collection,
            points=[PointStruct(id=chunk_id, vector=vector, payload=payload)],
        )

    async def search(
        self,
        query_vector: list[float],
        top_k: int = 20,
        ltc_stage: str | None = None,
        industry: str | None = None,
        score_threshold: float | None = None,
    ) -> list[dict]:
        filters = []
        if ltc_stage:
            filters.append(FieldCondition(key="ltc_stage", match=MatchValue(value=ltc_stage)))
        if industry:
            filters.append(FieldCondition(key="industry", match=MatchValue(value=industry)))

        query_filter = Filter(must=filters) if filters else None

        results = await self.client.search(
            collection_name=settings.qdrant_collection,
            query_vector=query_vector,
            limit=top_k,
            query_filter=query_filter,
            score_threshold=score_threshold,
        )
        return [{"id": str(r.id), "score": r.score, "payload": r.payload} for r in results]

    async def delete(self, chunk_id: str):
        from qdrant_client.models import PointIdsList
        await self.client.delete(
            collection_name=settings.qdrant_collection,
            points_selector=PointIdsList(points=[chunk_id]),
        )

    async def collection_info(self) -> dict:
        info = await self.client.get_collection(settings.qdrant_collection)
        # vectors_count is deprecated in newer Qdrant versions; fall back to points_count
        vc = info.vectors_count if info.vectors_count is not None else info.points_count
        return {"vectors_count": vc, "points_count": info.points_count}


vector_store = VectorStore()
