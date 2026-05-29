"""企信 IM Bot 凭证管理(2026-05-29)。

用户级独立凭证 — 每个顾问配自己的企信 Bot:
  - qixin_app_id        Bot 应用 id(全表唯一,防同 appId 互踢 Gateway)
  - qixin_app_secret    Bot 应用 secret,Fernet 加密入库
  - qixin_gateway_url   Gateway 地址,默认 https://open.fxiaoke.com,专属云才改

路径:
  GET    /api/qixin/credentials   读取配置状态(不返 secret 明文)
  PUT    /api/qixin/credentials   配置/更新(校验 appId 全表唯一)
  DELETE /api/qixin/credentials   清除

PUT/DELETE 会联动 services.qixin_gateway.connection_manager 启停 SSE 连接。
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from models.user import User
from models import get_session
from services.auth import get_current_user
from services.feishu_crypto import encrypt_secret

import structlog

logger = structlog.get_logger()

router = APIRouter(prefix="/api/qixin", tags=["qixin"])

DEFAULT_GATEWAY = "https://open.fxiaoke.com"


class QixinCredentialsIn(BaseModel):
    app_id: str = Field(min_length=4, max_length=128)
    app_secret: str = Field(min_length=8, max_length=512)
    gateway_url: str = Field(default=DEFAULT_GATEWAY, max_length=255)


@router.get("/credentials")
async def get_qixin_credentials(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """读取凭证状态。不回 secret 明文,app_id 也只返前 4 + 后 4 位作展示。"""
    db_user = await session.get(User, user.id)
    if not db_user:
        raise HTTPException(404, "用户不存在")
    configured = bool(db_user.qixin_app_id and db_user.qixin_app_secret)
    app_id_masked = None
    if db_user.qixin_app_id:
        aid = db_user.qixin_app_id
        app_id_masked = aid if len(aid) <= 8 else f"{aid[:4]}…{aid[-4:]}"
    return {
        "configured": configured,
        "app_id_masked": app_id_masked,
        "gateway_url": db_user.qixin_gateway_url or DEFAULT_GATEWAY,
    }


@router.put("/credentials")
async def put_qixin_credentials(
    body: QixinCredentialsIn,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """配置/更新当前用户企信 Bot 凭证。

    - secret Fernet 加密入库
    - app_id 校验全表唯一(409 Conflict 时给友好提示,而不是依赖 DB UniqueViolation)
    - 联动连接池:有 connection_manager 时调 restart_for_user
    """
    new_app_id = body.app_id.strip()
    new_gateway = body.gateway_url.strip() or DEFAULT_GATEWAY

    # 全表 app_id 唯一性校验(允许自己已配的同一个 app_id 不变 = 走更新分支)
    other = await session.execute(
        select(User).where(User.qixin_app_id == new_app_id, User.id != user.id)
    )
    if other.scalar_one_or_none() is not None:
        raise HTTPException(
            409,
            f"app_id {new_app_id} 已被其他用户配置。企信 Gateway 对同 appId 只保留一条活跃连接,"
            f"两人配同一个会互踢。请用各自独立 Bot 应用。",
        )

    db_user = await session.get(User, user.id)
    if not db_user:
        raise HTTPException(404, "用户不存在")
    db_user.qixin_app_id = new_app_id
    db_user.qixin_app_secret = encrypt_secret(body.app_secret.strip())
    db_user.qixin_gateway_url = new_gateway
    await session.commit()
    await session.refresh(db_user)
    logger.info("qixin_creds_updated", user=user.username, app_id=new_app_id, gateway=new_gateway)

    # 联动连接池(可选 — Block C 后再启用,这里 try/except 兜底,Block C 缺失时不影响 PUT)
    try:
        from services.qixin_gateway.connection_manager import restart_for_user
        await restart_for_user(user.id)
    except ImportError:
        logger.info("qixin_connection_manager_not_ready", note="Block C 待实现")
    except Exception as e:
        logger.error("qixin_restart_failed", user=user.username, error=str(e))

    return {"status": "ok", "configured": True, "gateway_url": new_gateway}


@router.delete("/credentials")
async def delete_qixin_credentials(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """清除企信凭证 + 断开 SSE 连接。"""
    db_user = await session.get(User, user.id)
    if not db_user:
        raise HTTPException(404, "用户不存在")
    db_user.qixin_app_id = None
    db_user.qixin_app_secret = None
    db_user.qixin_gateway_url = None
    await session.commit()
    logger.info("qixin_creds_deleted", user=user.username)

    try:
        from services.qixin_gateway.connection_manager import stop_for_user
        await stop_for_user(user.id)
    except ImportError:
        pass
    except Exception as e:
        logger.error("qixin_stop_failed", user=user.username, error=str(e))

    return {"status": "ok", "configured": False}
