from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # 数据库
    postgres_host: str = "postgres"
    postgres_port: int = 5432
    postgres_db: str = "kb_system"
    postgres_user: str = "kb_admin"
    postgres_password: str

    # Qdrant
    qdrant_host: str = "qdrant"
    qdrant_port: int = 6333
    qdrant_collection: str = "kb_chunks"

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # MinIO
    minio_endpoint: str = "minio:9000"
    minio_user: str = "minioadmin"
    minio_password: str
    minio_bucket: str = "kb-documents"

    # Embedding
    embedding_provider: str = "siliconflow"
    embedding_api_base: str = "https://api.siliconflow.cn/v1"
    embedding_api_key: str = ""
    embedding_model: str = "BAAI/bge-m3"

    # Rerank
    rerank_provider: str = "siliconflow"
    rerank_api_base: str = "https://api.siliconflow.cn/v1"
    rerank_api_key: str = ""
    rerank_model: str = "BAAI/bge-reranker-v2-m3"

    # 大模型 API Keys
    zhipu_api_key: str = ""
    minimax_api_key: str = ""
    xiaomi_api_key: str = ""
    dashscope_api_key: str = ""

    # 挑战配置
    challenge_auto_accept_threshold: float = 0.9
    challenge_review_threshold: float = 0.7

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def sync_database_url(self) -> str:
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
