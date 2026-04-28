"""API for output center: generate and retrieve CuratedBundles."""
import io
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, Query, Request


def _content_disposition(filename: str) -> str:
    ascii_fallback = filename.encode("ascii", "replace").decode("ascii").replace("?", "_")
    return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{quote(filename)}"


from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session
from models.curated_bundle import CuratedBundle
from services.auth import get_current_user, decode_access_token
from models.user import User
import jwt as _jwt


async def get_user_via_query_or_header(
    request: Request,
    token: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
) -> User:
    """View / save HTML 端点用：浏览器 new tab 拿不到 Authorization header，允许 ?token=。"""
    auth = request.headers.get("Authorization", "")
    bearer = auth.split(" ", 1)[1].strip() if auth.lower().startswith("bearer ") else None
    real_tok = bearer or token
    if not real_tok:
        raise HTTPException(401, "未登录")
    try:
        payload = decode_access_token(real_tok)
    except _jwt.ExpiredSignatureError:
        raise HTTPException(401, "登录已过期")
    except _jwt.InvalidTokenError:
        raise HTTPException(401, "无效凭证")
    user_id = payload.get("sub")
    user = await session.get(User, user_id) if user_id else None
    if not user or not user.is_active:
        raise HTTPException(401, "用户不存在或已禁用")
    return user

router = APIRouter()

KIND_TO_TASK = {
    "kickoff_pptx": "generate_kickoff_pptx",
    "kickoff_html": "generate_kickoff_html",
    "survey": "generate_survey",
    "insight": "generate_insight",
    # v2 (agentic) — 旁路验证
    "insight_v2": "generate_insight_v2",
    "survey_v2": "generate_survey_v2",
    "survey_outline_v2": "generate_survey_outline_v2",
}

KIND_TITLES = {
    "kickoff_pptx": "启动会 PPT（pptxgen）",
    "kickoff_html": "启动会 PPT（htmlppt）",
    "survey": "调研问卷",
    "insight": "项目洞察报告",
    "insight_v2": "项目洞察报告 v2 (agentic)",
    "survey_v2": "调研问卷 v2 (agentic)",
    "survey_outline_v2": "调研大纲 v2 (agentic)",
}


class GenerateRequest(BaseModel):
    kind: str
    project_id: str


def _bundle_dto(b: CuratedBundle) -> dict:
    extra = b.extra or {}
    fk = b.file_key or ""
    file_ext = fk.rsplit(".", 1)[-1].lower() if "." in fk else ""
    return {
        "id": b.id,
        "kind": b.kind,
        "project_id": b.project_id,
        "title": b.title,
        "status": b.status,
        "error": b.error,
        "has_content": bool(b.content_md),
        "has_file": bool(b.file_key),
        "file_ext": file_ext,
        "kb_calls": extra.get("generation_kb_calls") or [],
        "web_calls": extra.get("web_search_calls") or [],
        "has_industry_brief": bool(extra.get("has_industry_brief")),
        "created_at": b.created_at,
        "updated_at": b.updated_at,
        # v2 (agentic) — 旁路验证字段
        "agentic_version": extra.get("agentic_version"),
        "validity_status": extra.get("validity_status"),
        "ask_user_prompts": extra.get("ask_user_prompts") or [],
        "module_states": extra.get("module_states") or {},
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
    from tasks.output_tasks import (
        generate_kickoff_pptx, generate_kickoff_html, generate_survey, generate_insight,
        generate_insight_v2, generate_survey_v2, generate_survey_outline_v2,
    )
    task_fn = {
        "kickoff_pptx": generate_kickoff_pptx,
        "kickoff_html": generate_kickoff_html,
        "survey": generate_survey,
        "insight": generate_insight,
        "insight_v2": generate_insight_v2,
        "survey_v2": generate_survey_v2,
        "survey_outline_v2": generate_survey_outline_v2,
    }[body.kind]
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


_DECK_NAV_TEMPLATE = """
<style id="__deck_nav_css">
  body { background: #1F2937 !important; min-height: 100vh; margin: 0; padding: 24px 0 80px; }
  .slide { display: none !important; margin: 0 auto !important; }
  .slide.__active { display: block !important; }
  /* 编辑模式高亮 */
  body.__edit *[contenteditable="true"]:hover { outline: 2px dashed #FB923C; cursor: text; }
  body.__edit *[contenteditable="true"]:focus { outline: 2px solid #D96400; }
  /* nav bar */
  .__deck-nav { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 9999;
    background: rgba(31,41,55,.95); border: 1px solid #4B5563; border-radius: 12px;
    padding: 8px 14px; display: flex; align-items: center; gap: 10px;
    color: #fff; font-family: -apple-system, "Microsoft YaHei", sans-serif; font-size: 13px;
    box-shadow: 0 8px 24px rgba(0,0,0,.4); }
  .__deck-nav button { background: transparent; color: #fff; border: 1px solid #4B5563; border-radius: 6px;
    padding: 4px 10px; cursor: pointer; font-size: 12px; }
  .__deck-nav button:hover { background: #374151; }
  .__deck-nav button:disabled { opacity: .35; cursor: not-allowed; }
  .__deck-nav button.__primary { background: #D96400; border-color: #D96400; }
  .__deck-nav button.__primary:hover { background: #FB923C; border-color: #FB923C; }
  .__deck-nav .__sep { width: 1px; height: 18px; background: #4B5563; }
  .__deck-nav .__page { min-width: 56px; text-align: center; opacity: .8; }
  .__deck-nav .__saved { color: #34D399; opacity: 0; transition: opacity .3s; }
  .__deck-nav .__saved.__show { opacity: 1; }
</style>
<div class="__deck-nav" id="__deck_nav">
  <button id="__deck_prev" title="上一页 ←">←</button>
  <span class="__page" id="__deck_page">1 / 1</span>
  <button id="__deck_next" title="下一页 →">→</button>
  <span class="__sep"></span>
  <button id="__deck_edit" title="编辑文字">编辑</button>
  <button id="__deck_save" class="__primary" hidden title="保存到服务器">保存</button>
  <button id="__deck_full" title="全屏 F">⛶</button>
  <span class="__saved" id="__deck_saved">已保存 ✓</span>
</div>
<script id="__deck_nav_js">
(function(){
  const TOK = __TOKEN__;
  const SAVE_URL = __SAVE_URL__;
  const slides = Array.from(document.querySelectorAll('.slide'));
  if (slides.length === 0) {
    document.getElementById('__deck_nav').style.display = 'none';
    return;
  }
  let idx = 0, editing = false, dirty = false;
  function render() {
    slides.forEach((s, i) => s.classList.toggle('__active', i === idx));
    document.getElementById('__deck_page').textContent = (idx+1) + ' / ' + slides.length;
    document.getElementById('__deck_prev').disabled = idx === 0;
    document.getElementById('__deck_next').disabled = idx === slides.length - 1;
  }
  document.getElementById('__deck_prev').onclick = () => { if (idx>0) { idx--; render(); } };
  document.getElementById('__deck_next').onclick = () => { if (idx<slides.length-1) { idx++; render(); } };
  document.addEventListener('keydown', (e) => {
    if (e.target && (e.target.isContentEditable || /^(INPUT|TEXTAREA)$/.test(e.target.tagName))) return;
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { document.getElementById('__deck_prev').click(); }
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { document.getElementById('__deck_next').click(); e.preventDefault(); }
    if (e.key === 'f' || e.key === 'F') document.getElementById('__deck_full').click();
  });
  document.getElementById('__deck_full').onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  };
  function setEditable(on) {
    document.body.classList.toggle('__edit', on);
    slides.forEach(s => {
      s.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,td,th,span,div').forEach(el => {
        if (el.closest('.__deck-nav, script, style')) return;
        if (el.children.length > 0) return;  // 只让叶子文字节点可编辑，避免破坏布局
        const t = el.textContent || '';
        if (!t.trim()) return;
        el.contentEditable = on ? 'true' : 'false';
        if (on) el.addEventListener('input', () => { dirty = true; }, { once: false });
      });
    });
    document.getElementById('__deck_save').hidden = !on;
    document.getElementById('__deck_edit').textContent = on ? '退出编辑' : '编辑';
  }
  document.getElementById('__deck_edit').onclick = () => {
    editing = !editing;
    setEditable(editing);
  };
  document.getElementById('__deck_save').onclick = async () => {
    // 移除 deck-nav 注入，再上传
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('#__deck_nav_css, #__deck_nav, #__deck_nav_js').forEach(n => n.remove());
    clone.querySelectorAll('[contenteditable]').forEach(n => n.removeAttribute('contenteditable'));
    clone.querySelectorAll('.__active').forEach(n => n.classList.remove('__active'));
    if (!clone.classList) clone.className = '';
    clone.classList.remove('__edit');
    const html = '<!DOCTYPE html>\\n' + clone.outerHTML;
    const btn = document.getElementById('__deck_save');
    const orig = btn.textContent; btn.textContent = '保存中…'; btn.disabled = true;
    try {
      const r = await fetch(SAVE_URL + '?token=' + encodeURIComponent(TOK), {
        method: 'PUT',
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: html,
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      dirty = false;
      const tag = document.getElementById('__deck_saved');
      tag.classList.add('__show');
      setTimeout(() => tag.classList.remove('__show'), 2000);
    } catch (err) {
      alert('保存失败：' + err.message);
    } finally {
      btn.textContent = orig; btn.disabled = false;
    }
  };
  window.addEventListener('beforeunload', (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });
  render();
})();
</script>
"""


def _inject_deck_nav(html: bytes, save_url: str, token: str) -> bytes:
    """把 deck-nav CSS+JS 注入到 HTML </body> 前。"""
    import json as _json
    text = html.decode("utf-8", errors="replace")
    snippet = _DECK_NAV_TEMPLATE.replace("__TOKEN__", _json.dumps(token)).replace(
        "__SAVE_URL__", _json.dumps(save_url)
    )
    if "</body>" in text:
        text = text.replace("</body>", snippet + "\n</body>", 1)
    else:
        text += snippet
    return text.encode("utf-8")


@router.get("/{bundle_id}/view")
async def view_output(
    bundle_id: str,
    request: Request,
    token: str | None = Query(None),
    current_user: User = Depends(get_user_via_query_or_header),
    session: AsyncSession = Depends(get_session),
):
    """Inline view (no Content-Disposition: attachment). 用于 HTML 幻灯片在线播放。
    认证支持 ?token= 或 Authorization header（new tab 场景）。"""
    b = await session.get(CuratedBundle, bundle_id)
    if not b:
        raise HTTPException(404, "Bundle not found")
    if not current_user.is_admin and b.created_by != current_user.id:
        raise HTTPException(403, "Access denied")
    if b.status != "done":
        raise HTTPException(400, f"Bundle not ready (status={b.status})")

    # HTML 文件：拉回来注入 deck-nav 后吐
    if b.file_key and b.file_key.endswith(".html"):
        from config import settings
        from minio import Minio
        mc = Minio(settings.minio_endpoint, access_key=settings.minio_user, secret_key=settings.minio_password, secure=False)
        try:
            response = mc.get_object(settings.minio_bucket, b.file_key)
            data = response.read()
        except Exception as e:
            raise HTTPException(500, f"Failed to fetch file: {e}")
        # 注入 deck-nav；token 透传给前端 JS 用于保存请求
        # 优先用 query token，否则从 header 提取（保存功能要求 token 不为空）
        auth = request.headers.get("Authorization", "")
        header_tok = auth.split(" ", 1)[1].strip() if auth.lower().startswith("bearer ") else None
        active_tok = token or header_tok or ""
        save_url = f"/api/outputs/{bundle_id}/html"
        injected = _inject_deck_nav(data, save_url, active_tok)
        return StreamingResponse(
            io.BytesIO(injected),
            media_type="text/html; charset=utf-8",
            headers={"Cache-Control": "private, max-age=0, no-store"},
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


@router.put("/{bundle_id}/html")
async def save_html_output(
    bundle_id: str,
    request: Request,
    token: str | None = Query(None),
    current_user: User = Depends(get_user_via_query_or_header),
    session: AsyncSession = Depends(get_session),
):
    """编辑器内点保存：把整份 HTML 重写到 MinIO。仅对 .html 类型 bundle 有效。"""
    b = await session.get(CuratedBundle, bundle_id)
    if not b:
        raise HTTPException(404, "Bundle not found")
    if not current_user.is_admin and b.created_by != current_user.id:
        raise HTTPException(403, "Access denied")
    if not b.file_key or not b.file_key.endswith(".html"):
        raise HTTPException(400, "仅 HTML 类型 bundle 支持就地编辑")

    body = await request.body()
    if not body or len(body) > 4 * 1024 * 1024:
        raise HTTPException(400, "HTML 体积异常（空或 >4MB）")
    text = body.decode("utf-8", errors="replace")
    if "<html" not in text.lower():
        raise HTTPException(400, "提交内容不是有效 HTML")

    from config import settings
    from minio import Minio
    mc = Minio(settings.minio_endpoint, access_key=settings.minio_user, secret_key=settings.minio_password, secure=False)
    try:
        mc.put_object(
            settings.minio_bucket,
            b.file_key,
            io.BytesIO(body),
            length=len(body),
            content_type="text/html; charset=utf-8",
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to save file: {e}")
    return {"ok": True, "bytes": len(body)}


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
