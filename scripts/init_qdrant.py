"""
初始化 Qdrant：创建 kb_chunks collection
运行方式：python scripts/init_qdrant.py

前提：docker-compose up qdrant 已启动
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from qdrant_client import QdrantClient
from qdrant_client.models import (
    VectorParams,
    Distance,
    PayloadSchemaType,
    HnswConfigDiff,
)
from config import settings


def init_qdrant():
    print(f"连接 Qdrant: {settings.qdrant_host}:{settings.qdrant_port}")
    client = QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)

    collection_name = settings.qdrant_collection

    # 检查是否已存在
    existing = [c.name for c in client.get_collections().collections]
    if collection_name in existing:
        print(f"⚠️  Collection '{collection_name}' 已存在，跳过创建")
    else:
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(
                size=1024,          # bge-m3 输出维度
                distance=Distance.COSINE,
            ),
            hnsw_config=HnswConfigDiff(
                m=16,               # 每层最大连接数，越大精度越高（内存也更大）
                ef_construct=200,   # 构建时搜索宽度
            ),
        )
        print(f"✅ Collection '{collection_name}' 创建成功（1024 维，余弦距离）")

    # 创建 Payload 索引，加速过滤检索
    payload_indexes = [
        ("ltc_stage", PayloadSchemaType.KEYWORD),
        ("industry", PayloadSchemaType.KEYWORD),
        ("document_id", PayloadSchemaType.KEYWORD),
        ("chunk_id", PayloadSchemaType.KEYWORD),
    ]

    for field_name, field_type in payload_indexes:
        try:
            client.create_payload_index(
                collection_name=collection_name,
                field_name=field_name,
                field_schema=field_type,
            )
            print(f"✅ Payload 索引创建成功: {field_name} ({field_type})")
        except Exception as e:
            # 索引已存在时会报错，忽略
            print(f"   索引 '{field_name}' 可能已存在: {e}")

    # 验证
    info = client.get_collection(collection_name)
    print(f"\n📊 Collection 信息:")
    print(f"   名称:    {info.config.params.vectors.size} 维向量")
    print(f"   距离:    {info.config.params.vectors.distance}")
    print(f"   向量数:  {info.vectors_count}")
    print("\n✅ Qdrant 初始化完成")


if __name__ == "__main__":
    init_qdrant()
