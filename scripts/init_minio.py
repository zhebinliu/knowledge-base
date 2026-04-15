"""
初始化 MinIO Bucket
运行方式：python scripts/init_minio.py
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from minio import Minio
from config import settings


def init_minio():
    print(f"连接 MinIO: {settings.minio_endpoint}")
    client = Minio(
        settings.minio_endpoint,
        access_key=settings.minio_user,
        secret_key=settings.minio_password,
        secure=False,
    )

    if not client.bucket_exists(settings.minio_bucket):
        client.make_bucket(settings.minio_bucket)
        print(f"✅ Bucket '{settings.minio_bucket}' 创建成功")
    else:
        print(f"✅ Bucket '{settings.minio_bucket}' 已存在，跳过")


if __name__ == "__main__":
    init_minio()
