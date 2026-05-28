"""飞书凭证管理独立路由(#5 修复:从 /api/meeting/feishu-credentials 拆分出来)。

路径:
  GET  /api/feishu/credentials  - 读取当前用户飞书配置状态
  PUT  /api/feishu/credentials  - 配置/更新飞书凭证
  DELETE /api/feishu/credentials - 清除飞书凭证

旧的 /api/meeting/feishu-credentials 保留向后兼容(路由在 meeting.py 中)。
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from models.user import User
from models import get_session
from services.auth import get_current_user
from services.feishu_crypto import encrypt_secret

import structlog

logger = structlog.get_logger()

router = APIRouter(prefix="/api/feishu", tags=["feishu"])


class FeishuCredentialsIn(BaseModel):
    app_id: str = Field(min_length=1, max_length=128)
    app_secret: str = Field(min_length=1, max_length=255)


@router.get("/credentials")
async def get_feishu_credentials(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """读取当前用户的飞书配置状态(不返 secret)。"""
    db_user = await session.get(User, user.id)
    return {
        "configured": bool(db_user.feishu_app_id and db_user.feishu_app_secret) if db_user else False,
        "app_id": db_user.feishu_app_id if db_user else None,
    }


@router.put("/credentials")
async def put_feishu_credentials(
    body: FeishuCredentialsIn,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """配置/更新当前用户的飞书凭证。secret 加密存储。"""
    db_user = await session.get(User, user.id)
    if not db_user:
        raise HTTPException(404, "用户不存在")
    old_app_id = db_user.feishu_app_id
    db_user.feishu_app_id = body.app_id.strip()
    db_user.feishu_app_secret = encrypt_secret(body.app_secret.strip())
    await session.commit()
    await session.refresh(db_user)
    if old_app_id:
        from services.meeting.feishu import invalidate_token_cache
        invalidate_token_cache(old_app_id)
    logger.info("feishu_creds_updated", user=user.username)
    return {"status": "ok", "configured": True, "app_id": db_user.feishu_app_id}


@router.delete("/credentials")
async def delete_feishu_credentials(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """清除当前用户的飞书凭证。"""
    db_user = await session.get(User, user.id)
    if not db_user:
        raise HTTPException(404, "用户不存在")
    old_app_id = db_user.feishu_app_id
    db_user.feishu_app_id = None
    db_user.feishu_app_secret = None
    await session.commit()
    if old_app_id:
        from services.meeting.feishu import invalidate_token_cache
        invalidate_token_cache(old_app_id)
    logger.info("feishu_creds_deleted", user=user.username)
    return {"status": "ok", "configured": False}
