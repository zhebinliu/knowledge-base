"""ShareDev / sharedev-cli 凭证管理(2026-05-29)。

用户级凭证 — 每个用户配自己的客户租户 PaaS API token:
  - sharedev_domain    客户 PaaS 域名(默认 https://www.fxiaoke.com/)
  - sharedev_certificate  API token,Fernet 加密入库

路径:
  GET    /api/sharedev/credentials  - 读取配置状态(不返 cert 明文)
  PUT    /api/sharedev/credentials  - 配置/更新
  DELETE /api/sharedev/credentials  - 清除
  POST   /api/sharedev/credentials/verify - 调 sidecar 验证凭证可用

Phase 1:verify 端点先 stub(返回 success + warning"sidecar 待 Phase 2 接入")。
Phase 2 真接 sidecar HTTP 调用。
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from models.user import User
from models import get_session
from services.auth import get_current_user
from services.feishu_crypto import encrypt_secret  # 复用 Fernet,函数名通用

import structlog

logger = structlog.get_logger()

router = APIRouter(prefix="/api/sharedev", tags=["sharedev"])


class ShareDevCredentialsIn(BaseModel):
    domain: str = Field(min_length=4, max_length=255, default="https://www.fxiaoke.com/")
    certificate: str = Field(min_length=8, max_length=512)


@router.get("/credentials")
async def get_sharedev_credentials(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """读取当前用户的 sharedev 配置状态(不返 cert 明文,只返 domain + configured 标志)。"""
    db_user = await session.get(User, user.id)
    if not db_user:
        raise HTTPException(404, "用户不存在")
    return {
        "configured": bool(db_user.sharedev_domain and db_user.sharedev_certificate),
        "domain": db_user.sharedev_domain or "https://www.fxiaoke.com/",
    }


@router.put("/credentials")
async def put_sharedev_credentials(
    body: ShareDevCredentialsIn,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """配置/更新当前用户的 sharedev 凭证。cert 加密存储。"""
    db_user = await session.get(User, user.id)
    if not db_user:
        raise HTTPException(404, "用户不存在")
    db_user.sharedev_domain = body.domain.strip()
    db_user.sharedev_certificate = encrypt_secret(body.certificate.strip())
    await session.commit()
    await session.refresh(db_user)
    logger.info("sharedev_creds_updated", user=user.username, domain=db_user.sharedev_domain)
    return {
        "status": "ok",
        "configured": True,
        "domain": db_user.sharedev_domain,
    }


@router.delete("/credentials")
async def delete_sharedev_credentials(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """清除当前用户的 sharedev 凭证。"""
    db_user = await session.get(User, user.id)
    if not db_user:
        raise HTTPException(404, "用户不存在")
    db_user.sharedev_domain = None
    db_user.sharedev_certificate = None
    await session.commit()
    logger.info("sharedev_creds_deleted", user=user.username)
    return {"status": "ok", "configured": False}


@router.post("/credentials/verify")
async def verify_sharedev_credentials(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """调 sidecar 验证凭证可用(Phase 2 接入实际 sidecar HTTP 调用)。

    Phase 1 stub:只检查凭证已配,不实际打 sharedev API。
    返回 detail 字段提示"待 Phase 2 真验证"。
    """
    db_user = await session.get(User, user.id)
    if not db_user:
        raise HTTPException(404, "用户不存在")
    if not (db_user.sharedev_domain and db_user.sharedev_certificate):
        raise HTTPException(400, "凭证未配置,请先 PUT /api/sharedev/credentials")
    # TODO(Phase 2):调 sidecar HTTP /init-workspace + /verify
    return {
        "status": "ok",
        "verified": True,
        "domain": db_user.sharedev_domain,
        "detail": "(Phase 1)凭证已加密入库;Phase 2 接入 sharedev sidecar 后再做实际租户连通性验证",
    }
