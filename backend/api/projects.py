"""项目库 API：CRUD + 项目下文档列表。"""
from datetime import date

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session
from models.document import Document
from models.project import DOC_TYPE_LABELS, DOC_TYPES, Project
from models.project_collaborator import ProjectCollaborator
from models.user import User
from prompts.ltc_taxonomy import MODULE_TAGS, INDUSTRIES
from services.auth import get_current_user
from services.project_acl import (
    require_project_access, list_accessible_project_ids,
)

logger = structlog.get_logger()
router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────

class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    customer: str | None = None
    industry: str | None = None
    modules: list[str] | None = None
    kickoff_date: date | None = None
    description: str | None = None
    customer_profile: str | None = None
    aliases: list[str] | None = None  # 客户名 / 项目名变体表 — 用于文档脱敏


class ProjectPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    customer: str | None = None
    industry: str | None = None
    modules: list[str] | None = None
    kickoff_date: date | None = None
    description: str | None = None
    customer_profile: str | None = None
    aliases: list[str] | None = None


def _project_dto(
    p: Project, doc_count: int = 0, my_role: str | None = None,
) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "customer": p.customer,
        "industry": p.industry,
        "modules": p.modules or [],
        "kickoff_date": p.kickoff_date.isoformat() if p.kickoff_date else None,
        "description": p.description,
        "customer_profile": p.customer_profile,
        "aliases": p.aliases or [],          # 文档脱敏用的别名表
        "created_by": p.created_by,
        "created_at": p.created_at,
        "updated_at": p.updated_at,
        "document_count": doc_count,
        # 当前用户对该项目的角色:owner / read_write / read / admin
        # 前端用于控制可写按钮 / 协作者管理入口
        "my_role": my_role,
    }


def _normalize_aliases(aliases: list[str] | None) -> list[str] | None:
    """清洗 alias 列表:strip / 去空 / 去重(保序)/ 长度限制(单条 <= 100,总数 <= 30)。"""
    if aliases is None:
        return None
    seen, out = set(), []
    for a in aliases:
        if not isinstance(a, str):
            continue
        s = a.strip()
        if not s or len(s) > 100:
            continue
        if s in seen:
            continue
        seen.add(s)
        out.append(s)
        if len(out) >= 30:
            break
    return out


async def _resolve_my_role(user: User, p: Project) -> str:
    """返回当前用户对该项目的角色 — owner / read_write / read / admin / none。"""
    if getattr(user, "is_admin", False):
        return "admin"
    if p.created_by == user.id:
        return "owner"
    from services.project_acl import get_user_project_access
    access = await get_user_project_access(user, p.id)
    return access or "none"


def _validate_modules(modules: list[str] | None) -> list[str] | None:
    if modules is None:
        return None
    bad = [m for m in modules if m not in MODULE_TAGS]
    if bad:
        raise HTTPException(400, f"未知模块：{bad}（合法模块见 /api/projects/meta）")
    # 去重保序
    seen, out = set(), []
    for m in modules:
        if m not in seen:
            seen.add(m); out.append(m)
    return out


def _validate_industry(industry: str | None) -> str | None:
    # 接受三种值:
    #   1. 空 → None
    #   2. 新四级行业路径 "L1/L2/L3/L4"(IndustryCascadePicker 选齐后产出)
    #   3. 旧一级枚举(manufacturing 等),向后兼容历史数据 / 文档打标
    if industry is None or industry == "":
        return None
    if len(industry) > 200:
        raise HTTPException(400, f"行业字段过长(>200 字符)：{industry[:60]}...")
    from prompts.industry_tree import is_valid_industry_path
    if "/" in industry:
        if not is_valid_industry_path(industry):
            raise HTTPException(400, f"未知四级行业路径：{industry}")
        return industry
    if industry not in INDUSTRIES:
        raise HTTPException(400, f"未知行业：{industry}")
    return industry


# ── Meta ─────────────────────────────────────────────────────────────────────

@router.get("/meta")
async def project_meta():
    """前端下拉用:合法模块 + 文档类型枚举 + 行业(一级老枚举 + 四级树)。"""
    from prompts.ltc_taxonomy import INDUSTRY_TAGS
    from prompts.industry_tree import INDUSTRY_TREE
    return {
        "modules": list(MODULE_TAGS),
        "doc_types": [{"value": v, "label": DOC_TYPE_LABELS[v]} for v in DOC_TYPES],
        # 老一级行业枚举(向后兼容,文档打标 / 已有项目仍可用)
        "industries": [{"value": k, "label": v} for k, v in INDUSTRY_TAGS.items()],
        # 新四级行业树:前端 IndustryCascadePicker 用,
        # 项目 Project.industry 字段存 "L1/L2/L3/L4" 斜杠拼接路径
        "industry_tree": INDUSTRY_TREE,
    }


# ── CRUD ─────────────────────────────────────────────────────────────────────

@router.get("")
async def list_projects(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    # 权限隔离:
    # - admin → 看到所有项目
    # - 普通用户 → 自己 owned 的 + 被加为协作者的(通过 list_accessible_project_ids 取并集)
    accessible_ids = await list_accessible_project_ids(user)  # None = 全部(admin)

    stmt = (
        select(Project, func.count(Document.id))
        .outerjoin(Document, Document.project_id == Project.id)
        .group_by(Project.id)
        .order_by(Project.created_at.desc())
    )
    if accessible_ids is not None:
        if not accessible_ids:
            # 普通用户 + 一个项目都没权限 → 直接返回空,免一次 SQL
            return []
        stmt = stmt.where(Project.id.in_(accessible_ids))

    rows = (await session.execute(stmt)).all()
    # admin 全部 my_role='admin';owner 直接判断;其他批量查 collaborator
    if user.is_admin:
        return [_project_dto(p, doc_count=cnt or 0, my_role="admin") for p, cnt in rows]
    # owner / collaborator 双源:批量取一次 collaborator 表,避免 N+1
    own_ids = {p.id for p, _ in rows if p.created_by == user.id}
    coll_role: dict[str, str] = {}
    if rows:
        coll_rows = (await session.execute(
            select(ProjectCollaborator.project_id, ProjectCollaborator.role)
            .where(ProjectCollaborator.user_id == user.id)
            .where(ProjectCollaborator.project_id.in_([p.id for p, _ in rows]))
        )).all()
        for pid, role in coll_rows:
            coll_role[pid] = role
    out = []
    for p, cnt in rows:
        my = "owner" if p.id in own_ids else coll_role.get(p.id, "none")
        out.append(_project_dto(p, doc_count=cnt or 0, my_role=my))
    return out


@router.post("", status_code=201)
async def create_project(
    body: ProjectIn,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    modules = _validate_modules(body.modules)
    industry = _validate_industry(body.industry)
    p = Project(
        name=body.name.strip(),
        customer=(body.customer or "").strip() or None,
        industry=industry,
        modules=modules,
        kickoff_date=body.kickoff_date,
        description=body.description,
        customer_profile=body.customer_profile,
        aliases=_normalize_aliases(body.aliases),
        created_by=user.id,
    )
    session.add(p)
    await session.commit()
    await session.refresh(p)
    logger.info("project_created", id=p.id, name=p.name, by=user.username)
    return _project_dto(p, doc_count=0, my_role="owner")


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_project_access("read")),
):
    p = await session.get(Project, project_id)
    if not p:
        raise HTTPException(404, "项目不存在")
    cnt = await session.scalar(
        select(func.count(Document.id)).where(Document.project_id == project_id)
    )
    role = await _resolve_my_role(user, p)
    return _project_dto(p, doc_count=cnt or 0, my_role=role)


@router.patch("/{project_id}")
async def update_project(
    project_id: str,
    body: ProjectPatch,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_project_access("write")),
):
    p = await session.get(Project, project_id)
    if not p:
        raise HTTPException(404, "项目不存在")
    if body.name is not None:
        p.name = body.name.strip()
    if body.customer is not None:
        p.customer = body.customer.strip() or None
    if body.industry is not None:
        p.industry = _validate_industry(body.industry)
    if body.modules is not None:
        p.modules = _validate_modules(body.modules)
    if body.kickoff_date is not None:
        p.kickoff_date = body.kickoff_date
    if body.description is not None:
        p.description = body.description
    if body.customer_profile is not None:
        p.customer_profile = body.customer_profile
    if "aliases" in body.model_fields_set:
        p.aliases = _normalize_aliases(body.aliases)
    await session.commit()
    await session.refresh(p)
    cnt = await session.scalar(
        select(func.count(Document.id)).where(Document.project_id == project_id)
    )
    return _project_dto(p, doc_count=cnt or 0)


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    cascade: bool = Query(False, description="true 时一并解除关联文档的 project_id（不删文档本身）"),
    purge_documents: bool = Query(False, description="true 时把关联文档一并彻底删除（含切片向量 / minio 原文件），不可恢复"),
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_project_access("owner_only")),
):
    p = await session.get(Project, project_id)
    if not p:
        raise HTTPException(404, "项目不存在")
    cnt = await session.scalar(
        select(func.count(Document.id)).where(Document.project_id == project_id)
    ) or 0
    if cnt > 0 and not (cascade or purge_documents):
        raise HTTPException(
            409,
            f"项目下还有 {cnt} 个文档；删除请加 ?purge_documents=true（连带删文档）或 ?cascade=true（仅解除关联）",
        )

    deleted_documents = 0
    if cnt > 0 and purge_documents:
        # 彻底删除关联文档:逐个清理 切片向量 + minio 原文件 + 行(复用 documents.purge_document_storage)
        from api.documents import purge_document_storage
        docs = (await session.execute(
            select(Document).where(Document.project_id == project_id)
        )).scalars().all()
        for d in docs:
            await purge_document_storage(session, d)
            deleted_documents += 1
    elif cnt > 0:
        # 仅解关联:把这些文档的 project_id 置空
        from sqlalchemy import update as sa_update
        await session.execute(
            sa_update(Document).where(Document.project_id == project_id).values(project_id=None)
        )

    # 清理会阻塞删除的关联表 —— 对 projects.id 的外键审计结果:
    #   CASCADE(自动删):project_collaborators / project_stakeholders / research_ltc_module_maps
    #   SET NULL(自动解关联):curated_bundles / research_responses
    #   NO ACTION(必须手动,否则 DELETE projects 触发 FK 违约 500):
    #     - project_smart_advice / project_briefs / conversations → 附属数据,直接删
    #     - meetings → 独立实体(会议纪要可不依附项目),仅解关联、不删(其子表 requirements/shares 不动)
    # 新增带 project_id 外键的表时,记得在这里补一处,否则删除会再次 500。
    from sqlalchemy import text as _sa_text
    for _tbl in ("project_smart_advice", "project_briefs", "conversations"):
        await session.execute(_sa_text(f"DELETE FROM {_tbl} WHERE project_id = :pid"), {"pid": project_id})
    await session.execute(
        _sa_text("UPDATE meetings SET project_id = NULL WHERE project_id = :pid"), {"pid": project_id}
    )

    await session.delete(p)
    await session.commit()
    return {
        "ok": True,
        "unlinked_documents": cnt if (cascade and not purge_documents) else 0,
        "deleted_documents": deleted_documents,
    }


# ── 转让所有者 ──────────────────────────────────────────────────────────────

class TransferOwnerBody(BaseModel):
    new_owner_user_id: str = Field(min_length=1, max_length=36)


@router.post("/{project_id}/transfer-owner")
async def transfer_owner(
    project_id: str,
    body: TransferOwnerBody,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_project_access("owner_only")),
):
    """把项目所有者转让给另一个用户。

    规则:
    - 仅当前 owner / admin 可调
    - 接手人必须是活跃用户(is_active=true)
    - 接手人不能是当前 owner(自己转给自己无意义)
    - 转让后:project.created_by = new_owner_user_id;原 owner 自动加为 read_write 协作者;
      若新 owner 已是协作者,删除其协作者记录(避免身份重叠)
    """
    # 不能由 admin 跳过 owner_only 时把自己变成新 owner — 因为 owner_only 已校,
    # admin 也是合法触发者(代客户做运维场景)。
    p = await session.get(Project, project_id)
    if not p:
        raise HTTPException(404, "项目不存在")

    new_owner = await session.get(User, body.new_owner_user_id)
    if not new_owner:
        raise HTTPException(404, "目标用户不存在")
    if not new_owner.is_active:
        raise HTTPException(400, "目标用户已禁用,不能接手")
    if p.created_by and new_owner.id == p.created_by:
        raise HTTPException(400, "该用户已是项目所有者")

    old_owner_id = p.created_by

    # 1. 如果新 owner 当前是协作者,先把它从 collaborator 表删掉(避免唯一约束冲突 + 身份重叠)
    new_owner_coll = (await session.execute(
        select(ProjectCollaborator).where(
            ProjectCollaborator.project_id == project_id,
            ProjectCollaborator.user_id == new_owner.id,
        )
    )).scalar_one_or_none()
    if new_owner_coll:
        await session.delete(new_owner_coll)

    # 2. 切换 owner
    p.created_by = new_owner.id

    # 3. 把旧 owner 加为 read_write 协作者(除非旧 owner 是 None — 历史脏数据)
    if old_owner_id and old_owner_id != new_owner.id:
        existing = (await session.execute(
            select(ProjectCollaborator).where(
                ProjectCollaborator.project_id == project_id,
                ProjectCollaborator.user_id == old_owner_id,
            )
        )).scalar_one_or_none()
        if not existing:
            session.add(ProjectCollaborator(
                project_id=project_id,
                user_id=old_owner_id,
                role="read_write",
                created_by=user.id,
            ))

    await session.commit()
    await session.refresh(p)
    logger.info("project_owner_transferred",
                project_id=project_id,
                from_user=old_owner_id,
                to_user=new_owner.id,
                by=user.username)
    cnt = await session.scalar(
        select(func.count(Document.id)).where(Document.project_id == project_id)
    )
    role = await _resolve_my_role(user, p)
    return _project_dto(p, doc_count=cnt or 0, my_role=role)


# ── Documents under project ─────────────────────────────────────────────────

@router.post("/{project_id}/generate_profile")
async def generate_customer_profile(
    project_id: str,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_project_access("write")),
):
    """LLM 一次成稿生成客户画像草稿（不入库，返回字符串，前端确认后再 PATCH 写回）。"""
    p = await session.get(Project, project_id)
    if not p:
        raise HTTPException(404, "项目不存在")

    # 拉取已关联文档摘要（最多 5 份）作为上下文
    doc_rows = (await session.execute(
        select(Document.filename, Document.summary)
        .where(Document.project_id == project_id)
        .order_by(Document.created_at.desc())
        .limit(5)
    )).all()
    doc_ctx = "\n".join(
        f"- 《{fn}》：{(s or '')[:300]}" for fn, s in doc_rows if (s or "").strip()
    )

    from services.model_router import model_router

    system = """你是资深企业咨询顾问，正在为某客户撰写"客户画像"小节，给项目交付团队对齐认知。

【输出风格】
- 用 Markdown，长度 400–700 字
- 结构：① 公司速写（行业地位、规模、阶段）② 业务模式与增长动能 ③ 组织与决策风格 ④ 数字化成熟度 ⑤ 与本项目相关的关键诉求/痛点（结合 industry / 文档摘要推断）
- 数据缺失时用"信息缺失，建议在 Phase 1 第一周补访"标注，不要编造具体数字
- 不要 emoji、不要营销话术、不要一级标题（H1）
"""
    prompt = f"""客户名称：{p.customer or '—'}
项目名称：{p.name}
行业：{p.industry or '—'}
立项日期：{p.kickoff_date.isoformat() if p.kickoff_date else '—'}
项目描述：{p.description or '—'}

{f"【已关联文档摘要】{chr(10)}{doc_ctx}" if doc_ctx else "【已关联文档】无"}

请输出客户画像 Markdown 正文，不要包含项目名称作为标题。"""
    try:
        content, _model = await model_router.chat_with_routing(
            "project_audience_profile",
            [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            max_tokens=2000,
            timeout=120.0,
        )
    except Exception as e:
        logger.error("generate_profile_failed", project_id=project_id, error=str(e)[:200])
        raise HTTPException(502, f"画像生成失败：{str(e)[:120] or type(e).__name__}")

    return {"profile": (content or "").strip()}


@router.get("/{project_id}/documents")
async def list_project_documents(
    project_id: str,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_project_access("read")),
):
    p = await session.get(Project, project_id)
    if not p:
        raise HTTPException(404, "项目不存在")
    rows = (await session.execute(
        select(Document, User.username, User.full_name)
        .outerjoin(User, Document.uploader_id == User.id)
        .where(Document.project_id == project_id)
        .order_by(Document.created_at.desc())
    )).all()
    return [
        {
            "id": d.id,
            "filename": d.filename,
            "original_format": d.original_format,
            "conversion_status": d.conversion_status,
            "doc_type": d.doc_type,
            "doc_type_label": DOC_TYPE_LABELS.get(d.doc_type) if d.doc_type else None,
            "uploader_id": d.uploader_id,
            "uploader_name": full_name or username,
            "created_at": d.created_at,
            "updated_at": d.updated_at,
        }
        for d, username, full_name in rows
    ]


# ── 项目实施交接包(2026-06-05) ────────────────────────────────────────────
# 让顾问一键打包带去 APL 工作台(http://58.87.103.20/v2/):
# - 所有 SOW 文档原件(doc_type='sow',MinIO 直读)
# - 蓝图设计 / 对象字段表 / 流程建设表 三份 bundle 的 docx(实时 _build_docx)
# - 一个 README.txt 写本次交接内容 + APL 工作台地址 + 操作指引

@router.get("/{project_id}/handoff-bundle")
async def project_handoff_bundle(
    project_id: str,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_project_access("read")),
):
    import io as _io
    import zipfile
    from datetime import datetime
    from fastapi.responses import StreamingResponse
    from models.curated_bundle import CuratedBundle
    from services.output_service import _build_docx
    from config import settings
    from urllib.parse import quote

    p = await session.get(Project, project_id)
    if not p:
        raise HTTPException(404, "项目不存在")

    # 1. SOW 文档(原件,从 MinIO 直读)
    sow_docs = (await session.scalars(
        select(Document)
        .where(Document.project_id == project_id)
        .where(Document.doc_type == "sow")
        .order_by(Document.created_at.desc())
    )).all()

    # 2. 三份产物 bundle(蓝图 / 字段表 / 流程表 — 各取最新 done)
    HANDOFF_KINDS = [
        ("blueprint_design",     "蓝图方案设计"),
        ("object_field_layout",  "对象字段表"),
        ("process_setup",        "流程建设表"),
    ]
    handoff_bundles: list[tuple[str, str, CuratedBundle]] = []  # (kind, label, bundle)
    for kind, label in HANDOFF_KINDS:
        b = (await session.scalars(
            select(CuratedBundle)
            .where(CuratedBundle.project_id == project_id)
            .where(CuratedBundle.kind == kind)
            .where(CuratedBundle.status == "done")
            .order_by(CuratedBundle.updated_at.desc())
        )).first()
        if b:
            handoff_bundles.append((kind, label, b))

    if not sow_docs and not handoff_bundles:
        raise HTTPException(
            400,
            "本项目暂无可打包的内容。请先上传 SOW 文档,或生成蓝图设计 / 对象字段表 / 流程建设表。"
        )

    # 3. 打 zip(内存里组装,小项目几 MB 量级,够用)
    buf = _io.BytesIO()
    missing_warnings: list[str] = []
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # SOW 原件
        if sow_docs:
            from minio import Minio
            mc = Minio(
                settings.minio_endpoint,
                access_key=settings.minio_user,
                secret_key=settings.minio_password,
                secure=False,
            )
            for i, d in enumerate(sow_docs, 1):
                if not d.file_path:
                    missing_warnings.append(f"SOW《{d.filename}》没有源文件,已跳过")
                    continue
                try:
                    resp = mc.get_object(settings.minio_bucket, d.file_path)
                    data = resp.read()
                    safe_name = _safe_zip_name(d.filename or f"SOW-{i}")
                    zf.writestr(f"01_SOW/{i:02d}-{safe_name}", data)
                except Exception as e:
                    logger.warning("handoff_sow_fetch_failed",
                                   doc_id=d.id, filename=d.filename, error=str(e)[:200])
                    missing_warnings.append(f"SOW《{d.filename}》读取失败:{str(e)[:80]}")
        else:
            missing_warnings.append("未上传任何 SOW 文档(项目库 → 文档管理上传后重新打包)")

        # 三份产物 docx
        prefix_map = {"blueprint_design": "02", "object_field_layout": "03", "process_setup": "04"}
        existing_kinds = {k for k, _, _ in handoff_bundles}
        for kind, label, b in handoff_bundles:
            if not b.content_md:
                missing_warnings.append(f"《{label}》没有 markdown 内容,已跳过")
                continue
            try:
                docx_bytes = _build_docx(b.title or label, b.content_md)
                fname = f"{prefix_map[kind]}_{label}.docx"
                zf.writestr(fname, docx_bytes)
            except Exception as e:
                logger.warning("handoff_docx_build_failed",
                               bundle_id=b.id, kind=kind, error=str(e)[:200])
                missing_warnings.append(f"《{label}》docx 生成失败:{str(e)[:80]}")
        for kind, label in HANDOFF_KINDS:
            if kind not in existing_kinds:
                missing_warnings.append(f"《{label}》尚未生成,本次打包未包含")

        # README 写交接说明
        readme = _build_handoff_readme(
            project_name=p.name or "",
            customer=p.customer or "",
            sow_count=len([d for d in sow_docs if d.file_path]),
            handoff_kinds=[(label, b.updated_at) for _, label, b in handoff_bundles],
            warnings=missing_warnings,
        )
        zf.writestr("README.txt", readme.encode("utf-8"))

    buf.seek(0)
    date_str = datetime.utcnow().strftime("%Y%m%d")
    zip_name = f"{p.name or '项目'}-实施交接包-{date_str}.zip"
    headers = {
        "Content-Disposition": f"attachment; filename*=UTF-8''{quote(zip_name, safe='')}",
    }
    return StreamingResponse(buf, media_type="application/zip", headers=headers)


def _safe_zip_name(name: str) -> str:
    """zip 内文件名去掉路径分隔符和危险字符。"""
    import re
    name = (name or "").strip() or "file"
    return re.sub(r'[\\/:*?"<>|]', "_", name)[:120]


def _build_handoff_readme(
    *, project_name: str, customer: str,
    sow_count: int,
    handoff_kinds: list[tuple[str, object]],
    warnings: list[str],
) -> str:
    from datetime import datetime
    lines = [
        f"项目实施交接包",
        f"========================",
        f"项目名称: {project_name}",
        f"客户名称: {customer or '—'}",
        f"打包时间: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}",
        "",
        f"包含内容",
        f"--------",
        f"01_SOW/                 — SOW 需求说明书原件 × {sow_count}",
    ]
    for label, ts in handoff_kinds:
        lines.append(f"{label} — 最新版({ts.strftime('%Y-%m-%d') if ts else '—'})")
    lines += [
        "",
        f"下一步:在 APL 工作台完成需求分析与部署",
        f"-------------------------------------------",
        f"1. 打开 http://58.87.103.20/v2/ 登录(或通过 SSO 跳转)",
        f"2. 上传本 zip 中的 SOW 文档 + 三份方案设计 docx",
        f"3. 在平台内完成需求分析 → APL / 流程 / 字段配置生成 → 部署到客户租户",
        "",
    ]
    if warnings:
        lines.append("注意事项")
        lines.append("--------")
        for w in warnings:
            lines.append(f"• {w}")
        lines.append("")
    return "\n".join(lines)


# ── 项目洞察"先看体检"端点(规则化预 plan,不调 LLM) ─────────────────────────

@router.post("/{project_id}/insight-checkup")
async def insight_checkup(
    project_id: str,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_project_access("read")),
):
    """生成前体检 — 跑 plan_insight 看每模块字段够不够、缺什么。

    100% 规则化,不调 LLM,响应 < 500ms。让 PM 在「开始生成」前知道
    哪些模块会成功 / 哪些信息不够,提前补,避免试错式生成。
    """
    from models.project_brief import ProjectBrief
    from services.agentic.planner import plan_insight

    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "项目不存在")

    # Brief 字段(若有)
    brief_row = (await session.execute(
        select(ProjectBrief).where(
            ProjectBrief.project_id == project_id,
            ProjectBrief.output_kind == "insight",
        )
    )).scalar_one_or_none()
    brief_fields = (brief_row.fields or {}) if brief_row else {}

    # docs_by_type:已完成转换的项目文档
    doc_rows = (await session.execute(
        select(Document.id, Document.filename, Document.doc_type,
               Document.summary, Document.markdown_content)
        .where(Document.project_id == project_id)
        .where(Document.conversion_status == "completed")
    )).all()
    docs_by_type: dict[str, list[dict]] = {}
    for r in doc_rows:
        if not r.doc_type:
            continue
        docs_by_type.setdefault(r.doc_type, []).append({
            "doc_id": r.id, "filename": r.filename,
            "summary": (r.summary or "")[:600],
            "markdown": (r.markdown_content or ""),
        })

    # has_conversation 简化(影响 conversation source 字段是否可解析)
    # 这里只看 OutputConversation 表是否有该项目的对话(粗略)
    from models.output_conversation import OutputConversation
    conv_count = (await session.execute(
        select(func.count(OutputConversation.id)).where(
            OutputConversation.project_id == project_id,
        )
    )).scalar() or 0
    has_conversation = conv_count > 0

    plan = plan_insight(
        project=project, industry=project.industry,
        brief_fields=brief_fields, has_conversation=has_conversation,
        docs_by_type=docs_by_type,
    )

    # 简化输出 — 给前端易消费
    docs_total = sum(len(v) for v in docs_by_type.values())
    return {
        "industry": plan.industry,
        "sufficient_critical": plan.sufficient_critical,
        "modules": [
            {
                "key": m.key,
                "title": m.title,
                "necessity": m.necessity,
                "status": m.status,         # ready / blocked / skipped
                "reason": m.reason,
                "fields": [
                    {
                        "key": fk,
                        "label": fs.label,
                        "status": fs.status,        # available / deferred / missing
                        "source": fs.source,
                        "note": fs.note,
                    }
                    for fk, fs in m.fields.items()
                ],
            }
            for m in plan.modules
        ],
        "gap_actions": [
            {
                "module_key": g.module_key,
                "field_key": g.field_key,
                "field_label": g.field_label,
                "module_title": g.module_title,
                "necessity": g.necessity,
                "action": g.action,            # kb_search / web_search / ask_user / downgrade
                "detail": g.detail,
                "required": g.required,
            }
            for g in plan.gap_actions
        ],
        "stats": {
            "ready_n": sum(1 for m in plan.modules if m.status == "ready"),
            "blocked_n": sum(1 for m in plan.modules if m.status == "blocked"),
            "skipped_n": sum(1 for m in plan.modules if m.status == "skipped"),
            "ask_user_n": sum(1 for g in plan.gap_actions if g.action == "ask_user"),
            "kb_search_n": sum(1 for g in plan.gap_actions if g.action == "kb_search"),
            "docs_total": docs_total,
            "brief_fields_n": len(brief_fields),
            "has_conversation": has_conversation,
        },
    }


# ── 协作者 CRUD ──────────────────────────────────────────────────────────────
# Owner / read_write 协作者 / admin 可加/移除/改角色;read 协作者只能列。
# 不允许把 owner 自己加为协作者(owner 关系由 Project.created_by 表达)。

from models.project_collaborator import ProjectCollaborator, VALID_ROLES, ROLE_READ_WRITE  # noqa: E402


class CollaboratorAddBody(BaseModel):
    user_id: str = Field(min_length=1, max_length=36)
    role: str = Field(default="read", pattern="^(read|read_write)$")


class CollaboratorPatchBody(BaseModel):
    role: str = Field(pattern="^(read|read_write)$")


def _collaborator_dto(c: ProjectCollaborator, u: User | None) -> dict:
    return {
        "id": c.id,
        "project_id": c.project_id,
        "user_id": c.user_id,
        "username": u.username if u else None,
        "full_name": u.full_name if u else None,
        "email": u.email if u else None,
        "role": c.role,
        "created_by": c.created_by,
        "created_at": c.created_at,
        "updated_at": c.updated_at,
    }


@router.get("/{project_id}/collaborators")
async def list_collaborators(
    project_id: str,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_project_access("read")),
):
    """返回 owner + 全部协作者(便于前端显示一张「成员」表)。"""
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "项目不存在")

    owner_user = None
    if project.created_by:
        owner_user = await session.get(User, project.created_by)

    rows = (await session.execute(
        select(ProjectCollaborator, User)
        .outerjoin(User, ProjectCollaborator.user_id == User.id)
        .where(ProjectCollaborator.project_id == project_id)
        .order_by(ProjectCollaborator.created_at.asc())
    )).all()

    return {
        "owner": {
            "user_id": project.created_by,
            "username": owner_user.username if owner_user else None,
            "full_name": owner_user.full_name if owner_user else None,
            "email": owner_user.email if owner_user else None,
        } if project.created_by else None,
        "collaborators": [_collaborator_dto(c, u) for c, u in rows],
    }


@router.post("/{project_id}/collaborators", status_code=201)
async def add_collaborator(
    project_id: str,
    body: CollaboratorAddBody,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_project_access("write")),
):
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "项目不存在")

    target = await session.get(User, body.user_id)
    if not target:
        raise HTTPException(404, "目标用户不存在")
    if not target.is_active:
        raise HTTPException(400, "目标用户已禁用,不能加为协作者")

    # 不能把 owner 自己加进 collaborators
    if project.created_by and target.id == project.created_by:
        raise HTTPException(400, "项目所有者不能加为协作者")

    # 已存在 → 直接返回(幂等)或 409?这里返回 409 让前端提示「该用户已是协作者」
    existing = (await session.execute(
        select(ProjectCollaborator).where(
            ProjectCollaborator.project_id == project_id,
            ProjectCollaborator.user_id == body.user_id,
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "该用户已经是项目协作者(可改角色,不需要重新添加)")

    coll = ProjectCollaborator(
        project_id=project_id,
        user_id=body.user_id,
        role=body.role if body.role in VALID_ROLES else "read",
        created_by=user.id,
    )
    session.add(coll)
    await session.commit()
    await session.refresh(coll)
    logger.info("collaborator_added", project_id=project_id,
                user_id=body.user_id, role=coll.role, by=user.username)
    return _collaborator_dto(coll, target)


@router.patch("/{project_id}/collaborators/{user_id}")
async def update_collaborator_role(
    project_id: str,
    user_id: str,
    body: CollaboratorPatchBody,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_project_access("write")),
):
    coll = (await session.execute(
        select(ProjectCollaborator).where(
            ProjectCollaborator.project_id == project_id,
            ProjectCollaborator.user_id == user_id,
        )
    )).scalar_one_or_none()
    if not coll:
        raise HTTPException(404, "协作者不存在")
    if body.role not in VALID_ROLES:
        raise HTTPException(400, f"非法角色 {body.role}")
    coll.role = body.role
    await session.commit()
    await session.refresh(coll)
    target = await session.get(User, user_id)
    logger.info("collaborator_role_changed", project_id=project_id,
                user_id=user_id, role=coll.role, by=user.username)
    return _collaborator_dto(coll, target)


@router.delete("/{project_id}/collaborators/{user_id}")
async def remove_collaborator(
    project_id: str,
    user_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_project_access("write")),
):
    coll = (await session.execute(
        select(ProjectCollaborator).where(
            ProjectCollaborator.project_id == project_id,
            ProjectCollaborator.user_id == user_id,
        )
    )).scalar_one_or_none()
    if not coll:
        raise HTTPException(404, "协作者不存在")
    await session.delete(coll)
    await session.commit()
    logger.info("collaborator_removed", project_id=project_id,
                user_id=user_id, by=user.username)
    return {"ok": True}


# ── 用户搜索(供「加协作者」下拉) — 任何登录用户可调,但只返回必要字段 ────────

@router.get("/_/users/search")
async def search_users(
    q: str = Query(..., min_length=1, max_length=64),
    limit: int = Query(default=10, ge=1, le=30),
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_user),
):
    """按 username / email / full_name 模糊搜活跃用户,只返回 id+username+full_name+email。"""
    from sqlalchemy import or_ as sa_or
    pattern = f"%{q.strip()}%"
    rows = (await session.execute(
        select(User)
        .where(User.is_active == True)  # noqa: E712
        .where(sa_or(
            User.username.ilike(pattern),
            User.email.ilike(pattern),
            User.full_name.ilike(pattern),
        ))
        .order_by(User.username.asc())
        .limit(limit)
    )).scalars().all()
    return [
        {
            "id": u.id, "username": u.username,
            "full_name": u.full_name, "email": u.email,
        } for u in rows
    ]
