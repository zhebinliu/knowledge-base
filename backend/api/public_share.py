"""交付物公开分享 — 免登录只读访问(2026-06-12)。

GET /api/public/share/{token}
  校验 share_token 存在 + enabled + bundle.status==done + kind 在白名单
  → 返回自包含只读 HTML(markdown 阅读器 / 只读 deck-nav)。

安全:
- 只认 share_token,只返回那一个 bundle,无目录遍历 / 无列表 / 无下载 / 无编辑。
- kind 白名单二次校验(纵深防御,即便有人绕过创建端点)。
- X-Robots-Tag: noindex 避免分享链接被搜索引擎收录。
"""
import io
import structlog
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session
from models.curated_bundle import CuratedBundle
from models.bundle_share import BundleShare
from api.outputs import (
    PUBLIC_SHAREABLE_KINDS,
    _markdown_reader_html,
    _inject_deck_nav_readonly,
)

router = APIRouter()
logger = structlog.get_logger()

_NOINDEX = {"X-Robots-Tag": "noindex, nofollow"}


@router.get("/share/{token}")
async def public_view_share(token: str, session: AsyncSession = Depends(get_session)):
    share = (await session.execute(
        select(BundleShare).where(
            BundleShare.share_token == token,
            BundleShare.enabled == True,  # noqa: E712
        )
    )).scalar_one_or_none()
    if not share:
        raise HTTPException(404, "分享链接不存在或已关闭")

    b = await session.get(CuratedBundle, share.bundle_id)
    if not b or b.status != "done":
        raise HTTPException(404, "内容不可用")
    if b.kind not in PUBLIC_SHAREABLE_KINDS:
        raise HTTPException(403, "该类型交付物不支持公开分享")

    # HTML 幻灯片:MinIO 拉回,注入「只读」deck-nav(无编辑 / 保存)
    if b.file_key and b.file_key.endswith(".html"):
        from config import settings
        from minio import Minio
        mc = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_user,
            secret_key=settings.minio_password,
            secure=False,
        )
        try:
            data = mc.get_object(settings.minio_bucket, b.file_key).read()
        except Exception as e:
            raise HTTPException(500, f"读取失败: {e}")
        html = _inject_deck_nav_readonly(data)
        return StreamingResponse(
            io.BytesIO(html),
            media_type="text/html; charset=utf-8",
            headers={"Cache-Control": "private, max-age=0, no-store", **_NOINDEX},
        )

    # markdown:阅读器 HTML(只有「打印 / 导出 PDF」按钮,无下载原文件 / 无编辑)
    if b.content_md:
        html = _markdown_reader_html(b.title, b.content_md)
        return StreamingResponse(
            io.BytesIO(html.encode("utf-8")),
            media_type="text/html; charset=utf-8",
            headers={"Cache-Control": "private, max-age=60", **_NOINDEX},
        )

    raise HTTPException(400, "无可预览内容")
