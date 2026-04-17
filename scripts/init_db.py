"""
初始化数据库：建表
运行方式：python scripts/init_db.py
"""

import asyncio
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from sqlalchemy.ext.asyncio import create_async_engine
from models import Base
# 副作用 import：让 SQLAlchemy 注册所有模型，否则跨表外键 create_all 会失败
from models.user import User  # noqa: F401
from models.project import Project  # noqa: F401
from models.document import Document  # noqa: F401
from models.chunk import Chunk  # noqa: F401
from models.challenge import Challenge  # noqa: F401
from models.challenge_run import ChallengeRun  # noqa: F401
from models.challenge_schedule import ChallengeSchedule  # noqa: F401
from models.review_queue import ReviewQueue  # noqa: F401
from models.agent_config import AgentConfig  # noqa: F401
from config import settings


async def init_db():
    print(f"连接数据库: {settings.postgres_host}:{settings.postgres_port}/{settings.postgres_db}")
    engine = create_async_engine(settings.database_url, echo=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅ 数据库表创建成功")

    # 创建索引
    from sqlalchemy import text
    async with engine.begin() as conn:
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_chunks_ltc ON chunks(ltc_stage)"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_chunks_industry ON chunks(industry)"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_chunks_review ON chunks(review_status)"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id)"))
    print("✅ 索引创建成功")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(init_db())
