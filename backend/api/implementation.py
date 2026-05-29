"""项目实施工作台 API(2026-05-29 Phase 2)。

路径:
  POST /api/implementation/bundles/{bundle_id}/tasks/{task_id}/generate-config
       → 对单个 task 用对应 sharedev skill 生成 tenant-config 文件内容,
         结果写回 bundle.extra.tasks[i].config = {file_path, file_content, generated_at}
  GET  /api/implementation/bundles/{bundle_id}/tenant-config-zip
       → 把 bundle 里所有已生成 config 的 task 打包成 tenant-config.zip 下载

Phase 2 只接 5 个配置类 skill(object/field/validation-rule/layout/layout-rule)。
"""
from __future__ import annotations

import io
import zipfile
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from models import async_session_maker
from models.curated_bundle import CuratedBundle
from services.auth import get_current_user

logger = structlog.get_logger()
router = APIRouter(prefix="/api/implementation", tags=["implementation"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _load_bundle_with_access(bundle_id: str, user, level: str = "write") -> CuratedBundle:
    """加载 implementation_plan bundle 并校验项目权限。"""
    async with async_session_maker() as s:
        b = await s.get(CuratedBundle, bundle_id)
    if not b:
        raise HTTPException(404, "bundle 不存在")
    if b.kind != "implementation_plan":
        raise HTTPException(400, f"bundle kind 必须是 implementation_plan,当前 {b.kind!r}")
    if b.project_id:
        from services.project_acl import assert_project_access
        await assert_project_access(user, b.project_id, level)
    return b


def _find_task(tasks: list[dict], task_id: str) -> tuple[int, dict] | None:
    for i, t in enumerate(tasks):
        if isinstance(t, dict) and t.get("task_id") == task_id:
            return i, t
    return None


@router.post("/bundles/{bundle_id}/tasks/{task_id}/generate-config")
async def generate_task_config(bundle_id: str, task_id: str, user=Depends(get_current_user)):
    """对单个 task 触发 LLM 用对应 sharedev skill 生成 xml 配置文件内容。

    成功后写入 bundle.extra.tasks[i].config = {ok, file_path, file_content, generated_at}
    + 改 task.status = 'configured'。
    """
    b = await _load_bundle_with_access(bundle_id, user, "write")
    extra = dict(b.extra or {})
    tasks: list[dict] = list(extra.get("tasks") or [])
    found = _find_task(tasks, task_id)
    if not found:
        raise HTTPException(404, f"task {task_id!r} 不在 bundle.extra.tasks 中")
    idx, task = found

    # 拉素材:本项目最近的调研报告 + 蓝图设计
    research_report_excerpt = ""
    blueprint_excerpt = ""
    if b.project_id:
        async with async_session_maker() as s:
            rr = (await s.execute(
                select(CuratedBundle)
                .where(CuratedBundle.project_id == b.project_id)
                .where(CuratedBundle.kind == "research_report")
                .where(CuratedBundle.status == "done")
                .order_by(CuratedBundle.updated_at.desc())
            )).scalars().first()
            if rr and rr.content_md:
                research_report_excerpt = rr.content_md
            bp = (await s.execute(
                select(CuratedBundle)
                .where(CuratedBundle.project_id == b.project_id)
                .where(CuratedBundle.kind == "blueprint_design")
                .where(CuratedBundle.status == "done")
                .order_by(CuratedBundle.updated_at.desc())
            )).scalars().first()
            if bp and bp.content_md:
                blueprint_excerpt = bp.content_md

    project_meta = ""
    if b.project_id:
        from models.project import Project
        async with async_session_maker() as s:
            p = await s.get(Project, b.project_id)
        if p:
            parts = [f"项目名:{p.name or '未命名'}"]
            if p.customer:
                parts.append(f"客户:{p.customer}")
            if p.industry:
                parts.append(f"行业:{p.industry}")
            project_meta = "\n".join(parts)

    # 同项目已生成的其他 task 配置(作为 API Name 冲突上下文)
    other_tasks_context = _build_other_tasks_context(tasks, exclude_task_id=task_id)

    # LLM 生成
    from services.agentic.research.sharedev_config_generator import generate_config_for_task
    result = await generate_config_for_task(
        task=task,
        project_meta=project_meta,
        research_report_excerpt=research_report_excerpt,
        blueprint_excerpt=blueprint_excerpt,
        other_tasks_context=other_tasks_context,
    )

    # 写回 bundle.extra.tasks[idx]
    async with async_session_maker() as s:
        b2 = await s.get(CuratedBundle, bundle_id)
        extra2 = dict(b2.extra or {})
        tasks2: list[dict] = list(extra2.get("tasks") or [])
        if idx >= len(tasks2) or tasks2[idx].get("task_id") != task_id:
            # 并发安全:重新定位
            found2 = _find_task(tasks2, task_id)
            if not found2:
                raise HTTPException(409, "并发冲突,task 已被改动,请重试")
            idx, _ = found2
        t = dict(tasks2[idx])
        t["config"] = {
            "ok": result["ok"],
            "file_path": result["file_path"],
            "file_content": result["file_content"],
            "raw_chars": result.get("raw_chars", 0),
            "error": result.get("error"),
            "generated_at": _now_iso(),
            "generated_by": getattr(user, "username", None),
        }
        if result["ok"]:
            t["status"] = "configured"
        else:
            t["status"] = "failed"
        tasks2[idx] = t
        extra2["tasks"] = tasks2
        from sqlalchemy.orm.attributes import flag_modified
        b2.extra = extra2
        flag_modified(b2, "extra")
        await s.commit()

    logger.info("sharedev_task_config_generated", bundle_id=bundle_id, task_id=task_id,
                ok=result["ok"], skill=task.get("sharedev_skill"))
    return {
        "ok": result["ok"],
        "task_id": task_id,
        "file_path": result["file_path"],
        "file_content": result["file_content"][:5000] if result["file_content"] else None,
        "error": result.get("error"),
    }


def _build_other_tasks_context(tasks: list[dict], exclude_task_id: str) -> str:
    """把已经生成 config 的其他 task 简列出来作为冲突检查上下文。"""
    lines: list[str] = []
    for t in tasks:
        if not isinstance(t, dict):
            continue
        if t.get("task_id") == exclude_task_id:
            continue
        cfg = t.get("config")
        if not (isinstance(cfg, dict) and cfg.get("ok") and cfg.get("file_path")):
            continue
        skill = t.get("sharedev_skill", "?")
        obj = t.get("object_api_name") or "?"
        api = t.get("api_name") or "?"
        lines.append(f"- {t.get('task_id')} ({skill}): {obj}.{api} → {cfg['file_path']}")
    if not lines:
        return ""
    return "\n".join(lines[:50])


@router.get("/bundles/{bundle_id}/tenant-config-zip")
async def download_tenant_config_zip(bundle_id: str, user=Depends(get_current_user)):
    """把 bundle 里所有已生成 config 的 task 打包成 tenant-config.zip 流式下载。

    解压目录结构 = sharedev push 期望的 `tenant-config/` 树形,
    本地 `cd tenant-config && sharedev object-dev object push --all` 即可推到客户租户。
    """
    b = await _load_bundle_with_access(bundle_id, user, "read")
    tasks: list[dict] = list((b.extra or {}).get("tasks") or [])

    buf = io.BytesIO()
    n_written = 0
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # 顶层加一个 README,告诉用户怎么用
        zf.writestr(
            "README.md",
            _build_zip_readme(b, tasks),
        )
        for t in tasks:
            if not isinstance(t, dict):
                continue
            cfg = t.get("config")
            if not (isinstance(cfg, dict) and cfg.get("ok") and cfg.get("file_path") and cfg.get("file_content")):
                continue
            zf.writestr(cfg["file_path"], cfg["file_content"])
            n_written += 1

    buf.seek(0)
    safe_title = (b.title or f"implementation-{bundle_id}").replace("/", "_").replace(" ", "_")
    filename = f"{safe_title}-tenant-config.zip"
    logger.info("sharedev_tenant_config_zip", bundle_id=bundle_id, files=n_written)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Files-Written": str(n_written),
        },
    )


def _build_zip_readme(bundle: CuratedBundle, tasks: list[dict]) -> str:
    n_total = sum(1 for t in tasks if isinstance(t, dict))
    n_configured = sum(
        1 for t in tasks
        if isinstance(t, dict) and isinstance(t.get("config"), dict)
        and t["config"].get("ok")
    )
    return f"""# {bundle.title or '实施任务清单'} — tenant-config 包

生成时间:{_now_iso()}
任务总数:{n_total}
已生成配置:{n_configured}
本项目 bundle id:{bundle.id}

## 怎么用

```bash
# 1. 解压
unzip {bundle.title or 'tenant-config'}.zip
cd tenant-config

# 2. 用 sharedev push 推到客户租户(前提:本地已装 @share-crm/sharedev-cli + 配 .sharedev/settings.json)
sharedev object-dev object push --all
sharedev object-dev field push --all
```

## 包结构

- `tenant-config/objects/<ObjectApiName>/<ObjectApiName>.object-meta.xml`
- `tenant-config/objects/<ObjectApiName>/fields/<fieldApiName>.field-meta.xml`
- `tenant-config/objects/<ObjectApiName>/validation-rules/<ruleApiName>.validation-rule-meta.xml`
- `tenant-config/objects/<ObjectApiName>/layouts/<layoutApiName>.layout-meta.xml`
- `tenant-config/objects/<ObjectApiName>/layout-rules/<ruleApiName>.layout-rule-meta.xml`

## 注意

- xml 由 LLM 生成,**强烈建议先 `sharedev compile` / `sharedev analyze` 在本地校验**
  再推到客户租户,避免错误配置直接进生产环境
- APL Groovy / PWC 组件**未包含**在本包(留 Phase 3 上线)
"""
