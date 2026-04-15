"""
初始化 Qdrant Collection
运行方式：python scripts/init_qdrant.py
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

import asyncio
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Distance, VectorParams
from config import settings


async def init_qdrant():
    print(f"连接 Qdrant: {settings.qdrant_host}:{settings.qdrant_port}")
    client = AsyncQdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)

    existing = await client.get_collections()
    names = [c.name for c in existing.collections]

    if settings.qdrant_collection not in names:
        await client.create_collection(
            collection_name=settings.qdrant_collection,
            vectors_config=VectorParams(size=1024, distance=Distance.COSINE),
        )
        print(f"✅ Collection '{settings.qdrant_collection}' 创建成功")
    else:
        print(f"✅ Collection '{settings.qdrant_collection}' 已存在，跳过")

    await client.close()


if __name__ == "__main__":
    asyncio.run(init_qdrant())
