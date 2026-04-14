"""
初始化 MinIO：创建 kb-documents bucket 并设置访问策略
运行方式：python scripts/init_minio.py

前提：docker-compose up minio 已启动
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from minio import Minio
from minio.error import S3Error
from config import settings


def init_minio():
    print(f"连接 MinIO: {settings.minio_endpoint}")
    client = Minio(
        settings.minio_endpoint,
        access_key=settings.minio_user,
        secret_key=settings.minio_password,
        secure=False,
    )

    bucket_name = settings.minio_bucket

    # 创建 bucket
    if client.bucket_exists(bucket_name):
        print(f"⚠️  Bucket '{bucket_name}' 已存在，跳过创建")
    else:
        client.make_bucket(bucket_name)
        print(f"✅ Bucket '{bucket_name}' 创建成功")

    # 验证：列出所有 bucket
    buckets = client.list_buckets()
    print(f"\n📦 当前 Bucket 列表:")
    for bucket in buckets:
        print(f"   - {bucket.name}  (创建于 {bucket.creation_date})")

    print("\n✅ MinIO 初始化完成")


if __name__ == "__main__":
    init_minio()
