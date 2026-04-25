"""API for output center: generate and retrieve CuratedBundles."""
import io
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, Query


def _content_disposition(filename: str) -> str:
    ascii_fallback = filename.encode("ascii", "replace").decode("ascii").replace("?", "_")
    return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{quote(filename)}"


from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session
from models.curated_bundle import CuratedBundle
from services.auth import get_current_user
from models.user import User

router = APIRouter()

KIND_TO_TASK = {
    "kickoff_pptx": "generate_kickoff_pptx",
    "survey": "generate_survey",
    "insight": "generate_insight",
}

KIND_TITLES = {
    "kickoff_pptx": "启动会 PPT",
    "survey": "调研问卷",
    "insight": "项目洞察报告",
}


class GenerateRequest(BaseModel):
    kind: str
    project_id: str


def _bundle_dto(b: CuratedBundle) -> dict:
    extra = b.extra or {}
    return {
        "id": b.id,
        "kind": b.kind,
        "project_id": b.project_id,
        "title": b.title,
        "status": b.status,
        "error": b.error,
        "has_content": bool(b.content_md),
        "has_file": bool(b.file_key),
        "kb_calls": extra.get("generation_kb_calls") or [],
        "web_calls": extra.get("web_search_calls") or [],
        "has_industry_brief": bool(extra.get("has_industry_brief")),
        "created_at": b.created_at,
        "updated_at": b.updated_at,
    }


@router.post("/generate", status_code=202)
async def generate_output(
    body: GenerateRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if body.kind not in KIND_TO_TASK:
        raise HTTPException(400, f"Invalid kind. Must be one of: {list(KIND_TO_TASK)}")

    from models.project import Project
    proj = await session.get(Project, body.project_id)
    if not proj:
        raise HTTPException(404, "Project not found")

    title = f"{KIND_TITLES[body.kind]} · {proj.name}"
    bundle = CuratedBundle(
        kind=body.kind,
        project_id=body.project_id,
        title=title,
        status="pending",
        created_by=current_user.id,
        created_by_name=current_user.username,
    )
    session.add(bundle)
    await session.commit()
    await session.refresh(bundle)

    # Fire Celery task
    from tasks.output_tasks import generate_kickoff_pptx, generate_survey, generate_insight
    task_fn = {"kickoff_pptx": generate_kickoff_pptx, "survey": generate_survey, "insight": generate_insight}[body.kind]
    task_fn.delay(bundle.id, body.project_id)

    return _bundle_dto(bundle)


@router.get("")
async def list_outputs(
    project_id: str | None = Query(None),
    kind: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(CuratedBundle)
    count_stmt = select(func.count()).select_from(CuratedBundle)

    # Non-admins see only their own outputs
    if not current_user.is_admin:
        stmt = stmt.where(CuratedBundle.created_by == current_user.id)
        count_stmt = count_stmt.where(CuratedBundle.created_by == current_user.id)

    if project_id:
        stmt = stmt.where(CuratedBundle.project_id == project_id)
        count_stmt = count_stmt.where(CuratedBundle.project_id == project_id)
    if kind:
        stmt = stmt.where(CuratedBundle.kind == kind)
        count_stmt = count_stmt.where(CuratedBundle.kind == kind)

    total = await session.scalar(count_stmt)
    rows = (await session.execute(
        stmt.order_by(CuratedBundle.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )).scalars().all()

    return {"total": total, "page": page, "page_size": page_size, "items": [_bundle_dto(b) for b in rows]}


@router.get("/{bundle_id}")
async def get_output(
    bundle_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    b = await session.get(CuratedBundle, bundle_id)
    if not b:
        raise HTTPException(404, "Bundle not found")
    if not current_user.is_admin and b.created_by != current_user.id:
        raise HTTPException(403, "Access denied")
    dto = _bundle_dto(b)
    dto["content_md"] = b.content_md
    return dto


@router.get("/{bundle_id}/download")
async def download_output(
    bundle_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    b = await session.get(CuratedBundle, bundle_id)
    if not b:
        raise HTTPException(404, "Bundle not found")
    if not current_user.is_admin and b.created_by != current_user.id:
        raise HTTPException(403, "Access denied")
    if b.status != "done":
        raise HTTPException(400, f"Bundle not ready (status={b.status})")

    if b.file_key:
        from config import settings
        from minio import Minio
        mc = Minio(settings.minio_endpoint, access_key=settings.minio_user, secret_key=settings.minio_password, secure=False)
        try:
            response = mc.get_object(settings.minio_bucket, b.file_key)
            data = response.read()
        except Exception as e:
            raise HTTPException(500, f"Failed to fetch file: {e}")

        if b.file_key.endswith(".pptx"):
            media_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            filename = f"{b.title}.pptx"
        elif b.file_key.endswith(".docx"):
            media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            filename = f"{b.title}.docx"
        elif b.file_key.endswith(".html"):
            media_type = "text/html; charset=utf-8"
            filename = f"{b.title}.html"
        else:
            media_type = "application/octet-stream"
            filename = b.title

        return StreamingResponse(
            io.BytesIO(data),
            media_type=media_type,
            headers={"Content-Disposition": _content_disposition(filename)},
        )

    elif b.content_md:
        # Download as markdown
        return StreamingResponse(
            io.BytesIO(b.content_md.encode("utf-8")),
            media_type="text/markdown",
            headers={"Content-Disposition": _content_disposition(f"{b.title}.md")},
        )
    else:
        raise HTTPException(400, "No downloadable content available")


@router.get("/{bundle_id}/view")
async def view_output(
    bundle_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Inline view (no Content-Disposition: attachment). 用于 HTML 幻灯片在线播放。"""
    b = await session.get(CuratedBundle, bundle_id)
    if not b:
        raise HTTPException(404, "Bundle not found")
    if not current_user.is_admin and b.created_by != current_user.id:
        raise HTTPException(403, "Access denied")
    if b.status != "done":
        raise HTTPException(400, f"Bundle not ready (status={b.status})")

    # HTML 文件直接回吐
    if b.file_key and b.file_key.endswith(".html"):
        from config import settings
        from minio import Minio
        mc = Minio(settings.minio_endpoint, access_key=settings.minio_user, secret_key=settings.minio_password, secure=False)
        try:
            response = mc.get_object(settings.minio_bucket, b.file_key)
            data = response.read()
        except Exception as e:
            raise HTTPException(500, f"Failed to fetch file: {e}")
        return StreamingResponse(
            io.BytesIO(data),
            media_type="text/html; charset=utf-8",
            headers={"Cache-Control": "private, max-age=60"},
        )

    # Markdown 内容包成阅读器 HTML
    if b.content_md:
        html = _markdown_reader_html(b.title, b.content_md)
        return StreamingResponse(
            io.BytesIO(html.encode("utf-8")),
            media_type="text/html; charset=utf-8",
            headers={"Cache-Control": "private, max-age=60"},
        )

    raise HTTPException(400, "No previewable content")


def _markdown_reader_html(title: str, md: str) -> str:
    """把 markdown 文本包成一个自包含、带样式的 HTML 阅读器，浏览器即开即看。"""
    import html as _h
    import json as _json
    safe_title = _h.escape(title or "输出预览")
    payload = _json.dumps(md)
    return f"""<!DOCTYPE html>
<html lang=\"zh-CN\"><head><meta charset=\"UTF-8\">
<title>{safe_title}</title>
<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">
<script src=\"https://cdn.jsdelivr.net/npm/marked/marked.min.js\"></script>
<style>
body{{font-family:"PingFang SC","Microsoft YaHei",-apple-system,Georgia,"Times New Roman",serif;background:#EAEAEA;color:#1A1A1A;margin:0;line-height:1.7;font-size:15px}}
.wrap{{max-width:780px;margin:0 auto;padding:64px 72px 96px;background:#fff;min-height:100vh;box-shadow:0 1px 3px rgba(0,0,0,.08)}}
h1{{color:#1A1A1A;font-size:26px;font-weight:700;border-bottom:2px solid #1A1A1A;padding-bottom:10px;margin-top:0;letter-spacing:.5px}}
h2{{color:#1A1A1A;font-size:18px;font-weight:700;margin-top:36px;padding-bottom:6px;border-bottom:1px solid #D1D5DB;letter-spacing:.3px}}
h3{{color:#1A1A1A;font-size:15px;font-weight:700;margin-top:22px}}
strong{{color:#1A1A1A;font-weight:700}}
p{{margin:10px 0;color:#1F2937}}
ul,ol{{padding-left:22px;color:#1F2937}}
li{{margin:4px 0}}
table{{border-collapse:collapse;width:100%;margin:14px 0;font-size:13.5px}}
th,td{{border:1px solid #4B5563;padding:8px 10px;text-align:left;vertical-align:top}}
th{{background:#1F2937;color:#fff;font-weight:600}}
tbody tr:nth-child(even){{background:#F9FAFB}}
blockquote{{border-left:3px solid #D96400;background:#FFF7ED;margin:16px 0;padding:10px 16px;color:#1F2937;font-style:italic}}
code{{background:#F3F4F6;padding:2px 6px;border-radius:3px;font-family:Menlo,Consolas,monospace;font-size:12.5px}}
pre{{background:#F9FAFB;padding:14px;border:1px solid #E5E7EB;overflow-x:auto;font-size:12.5px}}
hr{{border:none;border-top:1px solid #D1D5DB;margin:28px 0}}
.toolbar{{position:sticky;top:0;background:rgba(255,255,255,.96);backdrop-filter:blur(8px);border-bottom:1px solid #D1D5DB;padding:10px 20px;display:flex;justify-content:space-between;align-items:center;z-index:10;font-size:12px;color:#4B5563}}
.toolbar .brand{{font-weight:600;color:#1A1A1A}}
.toolbar button{{background:#1A1A1A;color:#fff;border:none;padding:6px 14px;font-size:12px;cursor:pointer;letter-spacing:.5px}}
.toolbar button:hover{{background:#374151}}
@media print{{body{{background:#fff}} .toolbar{{display:none}} .wrap{{box-shadow:none;padding:24px;max-width:none}}}}
</style>
</head>
<body>
<div class=\"toolbar\"><span class=\"brand\">{safe_title}</span><button onclick=\"window.print()\">打印 / 导出 PDF</button></div>
<div class=\"wrap\" id=\"content\">加载中…</div>
<script>
var md = {payload};
document.getElementById('content').innerHTML = (window.marked ? marked.parse(md) : md.replace(/&/g,'&amp;').replace(/</g,'&lt;'));
</script>
</body></html>"""
