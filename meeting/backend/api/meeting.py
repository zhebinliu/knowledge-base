"""会议纪要 API — Block A CRUD 基础(2026-05-11)。

源自 meeting-ai 项目 routes/meeting.py 的迁移。Block A 范围:
  - 会议 CRUD(创建空白 / 文本创建 / 列表 / 详情 / 更新 / 删除)
  - 关联 KB 项目(替代原 kb_project_id 字符串)
  - 干系人图谱直写(占位,后续 Block B 接入自动提取)
  - 列出会议的需求(只读,Block B 接入自动提取)

后续 Block:
  - B(AI pipeline + Celery):POST /{id}/process + /actions/*
  - C(文件上传 + ASR):POST /{id}/upload
  - D(WebSocket):/ws/recording/{id}
  - E(KB / 飞书):/sync-kb / /export-feishu / /sync-requirements
"""
from datetime import datetime
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select, delete as sql_delete
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session
from models.meeting import Meeting, Requirement
from models.meeting_share import MeetingShare
from models.project import Project
from models.project_collaborator import ProjectCollaborator
from models.user import User
from services.auth import get_current_user, get_current_user_for_media

logger = structlog.get_logger()
router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────

class MeetingCreate(BaseModel):
    title: str = Field(default="未命名会议", max_length=256)
    project_id: Optional[str] = None


class MeetingFromText(BaseModel):
    title: str = Field(default="未命名会议", max_length=256)
    transcript: str = Field(min_length=1, max_length=200000)
    project_id: Optional[str] = None


class MeetingPatch(BaseModel):
    title: Optional[str] = None
    end_time: Optional[datetime] = None
    raw_transcript: Optional[str] = None
    polished_transcript: Optional[str] = None
    meeting_minutes: Optional[dict] = None
    status: Optional[str] = None
    total_chunks: Optional[int] = None
    done_chunks: Optional[int] = None


class ProjectLink(BaseModel):
    project_id: Optional[str] = None  # null 表示解除关联


class StakeholderMapIn(BaseModel):
    stakeholder_map: dict  # {stakeholders: [...], relations: [...], version?: int}


class ProcessFlowsIn(BaseModel):
    process_flows: dict  # {flows: [...], version?: int}


# ── DTO ──────────────────────────────────────────────────────────────────────

def _meeting_dto(m: Meeting, project_name: Optional[str] = None) -> dict:
    return {
        "id": m.id,
        "title": m.title,
        "owner_id": m.owner_id,
        "project_id": m.project_id,
        "project_name": project_name,
        "start_time": m.start_time,
        "end_time": m.end_time,
        "created_at": m.created_at,
        "raw_transcript": m.raw_transcript or "",
        "polished_transcript": m.polished_transcript or "",
        "meeting_minutes": m.meeting_minutes,
        "status": m.status,
        "asr_engine": m.asr_engine,
        "total_chunks": m.total_chunks,
        "done_chunks": m.done_chunks,
        "audio_object_key": m.audio_object_key,
        "feishu_url": m.feishu_url,
        "bitable_app_token": m.bitable_app_token,
        "kb_doc_id": m.kb_doc_id,
        "kb_url": m.kb_url,
        "kb_synced_at": m.kb_synced_at,
        "edited_minutes": m.edited_minutes,
        "stakeholder_map": m.stakeholder_map,
        "stakeholder_kb_doc_id": m.stakeholder_kb_doc_id,
        "stakeholder_kb_url": m.stakeholder_kb_url,
        "stakeholder_kb_synced_at": m.stakeholder_kb_synced_at,
        "process_flows": m.process_flows,
        "illustrations": m.illustrations,
    }


def _requirement_dto(r: Requirement) -> dict:
    return {
        "id": r.id,
        "meeting_id": r.meeting_id,
        "req_id": r.req_id,
        "module": r.module,
        "description": r.description,
        "priority": r.priority,
        "source": r.source,
        "speaker": r.speaker,
        "status": r.status,
        "created_at": r.created_at,
        "start_seconds": r.start_seconds,
        "end_seconds": r.end_seconds,
    }


# ── 权限辅助 ───────────────────────────────────────────────────────────────

async def _load_meeting_owned(
    meeting_id: int, session: AsyncSession, user: User
) -> Meeting:
    """加载会议并校验访问权限。
    - admin 看全部
    - 会议 owner 看自己的
    - 2026-05-12 加:会议绑定了 project 时,该 project 的协作者也可访问
      (顾问、运营常常需要看 / 编辑别人主持的会议)
    - 2026-05-27 加:被 owner 通过 MeetingShare 显式分享的用户也可访问
    """
    m = await session.get(Meeting, meeting_id)
    if not m:
        raise HTTPException(404, "会议不存在")
    if user.is_admin or m.owner_id == user.id:
        return m
    # 项目协作者权限
    if m.project_id:
        from services.project_acl import get_user_project_access
        access = await get_user_project_access(user, m.project_id)
        if access is not None:  # owner / read_write / read 都允许进会议详情
            return m
    # 显式分享权限
    share = (await session.execute(
        select(MeetingShare).where(
            MeetingShare.meeting_id == meeting_id,
            MeetingShare.user_id == user.id,
        )
    )).scalar_one_or_none()
    if share:
        return m
    raise HTTPException(403, "无权访问该会议")


async def _validate_project_link(
    session: AsyncSession, project_id: Optional[str], user: User
) -> Optional[str]:
    """校验项目存在且当前用户有 write 权限。返回 project_id(或 None)。

    2026-05-12 修复:此前只校项目存在,任意登录用户可把 meeting 绑到他人项目然后
    跑 AI pipeline 读他人项目数据并写回。现在调用 project_acl 做权限隔离。
    """
    if not project_id:
        return None
    p = await session.get(Project, project_id)
    if not p:
        raise HTTPException(400, "关联的项目不存在")
    from services.project_acl import assert_project_access
    await assert_project_access(user, project_id, "write")
    return project_id


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("")
async def create_meeting(
    body: MeetingCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """创建空白会议(占位,后续配合 WS 录音或 upload)。"""
    project_id = await _validate_project_link(session, body.project_id, user)
    m = Meeting(
        title=body.title,
        owner_id=user.id,
        project_id=project_id,
        status="recording",
    )
    session.add(m)
    await session.commit()
    await session.refresh(m)
    logger.info("meeting_created", meeting_id=m.id, user=user.username)
    return _meeting_dto(m)


@router.post("/from-text")
async def create_from_text(
    body: MeetingFromText,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """从文本直接创建会议,跳过 ASR。raw_transcript 立即填好。

    Block B 接通后,这里会同步触发 process Celery task;当前仅落库返回。
    """
    project_id = await _validate_project_link(session, body.project_id, user)
    m = Meeting(
        title=body.title,
        owner_id=user.id,
        project_id=project_id,
        raw_transcript=body.transcript,
        status="processing",  # 后续 Block B 完成后真正变 processing → completed
        asr_engine="text",
    )
    session.add(m)
    await session.commit()
    await session.refresh(m)
    logger.info("meeting_from_text", meeting_id=m.id, length=len(body.transcript))
    # 自动触发 AI pipeline(异步)
    from tasks.meeting_tasks import process_meeting as _task
    _task.delay(m.id)
    return _meeting_dto(m)


@router.get("")
async def list_meetings(
    project_id: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """列出当前用户能访问的会议(admin 看全部)。按 created_at 倒序。

    可见性:
    - 自己创建的(owner_id = user.id)
    - 我所属的项目里的会议(我是 owner / read_write / read 协作者)
    - 被显式分享给我的会议

    可选过滤:?project_id=<id> 只返回挂在该项目下的会议(配合项目详情页用)。
    非 admin 用户传无权访问的 project_id 时,会被现有可见性过滤掉,返回空数组。
    """
    stmt = select(Meeting).order_by(Meeting.created_at.desc())
    if project_id:
        stmt = stmt.where(Meeting.project_id == project_id)
    if not user.is_admin:
        from sqlalchemy import or_ as sa_or
        # 项目协作者口子:owned projects + collaborator projects
        owned_pids = (await session.execute(
            select(Project.id).where(Project.created_by == user.id)
        )).scalars().all()
        coll_pids = (await session.execute(
            select(ProjectCollaborator.project_id).where(
                ProjectCollaborator.user_id == user.id
            )
        )).scalars().all()
        accessible_pids = list(set(owned_pids) | set(coll_pids))
        # 显式分享口子
        shared_mids = (await session.execute(
            select(MeetingShare.meeting_id).where(MeetingShare.user_id == user.id)
        )).scalars().all()
        conds = [Meeting.owner_id == user.id]
        if accessible_pids:
            conds.append(Meeting.project_id.in_(accessible_pids))
        if shared_mids:
            conds.append(Meeting.id.in_(shared_mids))
        stmt = stmt.where(sa_or(*conds))
    rows = (await session.scalars(stmt)).all()

    # 一次性查所有相关 project 的名字
    project_ids = {m.project_id for m in rows if m.project_id}
    project_names: dict[str, str] = {}
    if project_ids:
        projects = (await session.scalars(
            select(Project).where(Project.id.in_(project_ids))
        )).all()
        project_names = {p.id: p.name for p in projects}

    return [_meeting_dto(m, project_names.get(m.project_id)) for m in rows]


@router.get("/illustration-styles")
async def list_illustration_styles():
    """返回可用的配图风格列表。"""
    from prompts.illustration_styles import CONTENT_STYLES, STYLE_GROUPS, DEFAULT_STYLE
    return {
        "styles": CONTENT_STYLES,
        "groups": STYLE_GROUPS,
        "default": DEFAULT_STYLE,
    }


@router.get("/{meeting_id}")
async def get_meeting(
    meeting_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """获取会议详情(含 requirements)。"""
    m = await _load_meeting_owned(meeting_id, session, user)

    # join project name
    project_name = None
    if m.project_id:
        p = await session.get(Project, m.project_id)
        project_name = p.name if p else None

    # 关联需求
    reqs = (await session.scalars(
        select(Requirement).where(Requirement.meeting_id == m.id).order_by(Requirement.id)
    )).all()

    dto = _meeting_dto(m, project_name)
    dto["requirements"] = [_requirement_dto(r) for r in reqs]
    return dto


@router.patch("/{meeting_id}")
async def patch_meeting(
    meeting_id: int,
    body: MeetingPatch,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """部分更新会议。"""
    m = await _load_meeting_owned(meeting_id, session, user)
    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(m, key, value)
    await session.commit()
    await session.refresh(m)
    return _meeting_dto(m)


@router.delete("/{meeting_id}")
async def delete_meeting(
    meeting_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """删除会议(级联删除 requirements,由 FK ondelete=CASCADE 处理)。"""
    m = await _load_meeting_owned(meeting_id, session, user)
    audio_key = m.audio_object_key
    # 显式删 requirements,避免 DB 未强制 FK 级联时遗漏
    await session.execute(sql_delete(Requirement).where(Requirement.meeting_id == m.id))
    await session.delete(m)
    await session.commit()
    # 同步删 MinIO 音频(失败不阻塞)
    if audio_key:
        try:
            from services.meeting.storage import delete_audio
            delete_audio(audio_key)
        except Exception as e:
            logger.warning("meeting_audio_cleanup_failed", key=audio_key, error=str(e)[:120])
    logger.info("meeting_deleted", meeting_id=meeting_id, user=user.username)
    return {"status": "ok"}


@router.get("/{meeting_id}/requirements")
async def list_meeting_requirements(
    meeting_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """列出某会议的所有需求。"""
    m = await _load_meeting_owned(meeting_id, session, user)
    reqs = (await session.scalars(
        select(Requirement).where(Requirement.meeting_id == m.id).order_by(Requirement.id)
    )).all()
    return [_requirement_dto(r) for r in reqs]


@router.put("/{meeting_id}/project")
async def link_project(
    meeting_id: int,
    body: ProjectLink,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """关联或解除 KB 项目。"""
    m = await _load_meeting_owned(meeting_id, session, user)
    m.project_id = await _validate_project_link(session, body.project_id, user)
    await session.commit()
    await session.refresh(m)
    project_name = None
    if m.project_id:
        p = await session.get(Project, m.project_id)
        project_name = p.name if p else None
    return _meeting_dto(m, project_name)


@router.put("/{meeting_id}/stakeholder-map")
async def put_stakeholder_map(
    meeting_id: int,
    body: StakeholderMapIn,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """直接覆盖 stakeholder_map(用于前端手动编辑后保存)。"""
    m = await _load_meeting_owned(meeting_id, session, user)
    m.stakeholder_map = body.stakeholder_map
    await session.commit()
    await session.refresh(m)
    return _meeting_dto(m)


@router.put("/{meeting_id}/process-flows")
async def put_process_flows(
    meeting_id: int,
    body: ProcessFlowsIn,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """直接覆盖 process_flows(用于前端手动编辑后保存)。"""
    m = await _load_meeting_owned(meeting_id, session, user)
    m.process_flows = body.process_flows
    await session.commit()
    await session.refresh(m)
    return _meeting_dto(m)


class EditedMinutesPut(BaseModel):
    """保存前端编辑后的会议纪要。"""
    edited_minutes: dict


@router.put("/{meeting_id}/edited-minutes")
async def put_edited_minutes(
    meeting_id: int,
    body: EditedMinutesPut,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """保存用户手动编辑后的会议纪要，用于模板演化。"""
    m = await _load_meeting_owned(meeting_id, session, user)
    m.edited_minutes = body.edited_minutes
    await session.commit()
    await session.refresh(m)
    return {"status": "ok", "edited_minutes": m.edited_minutes}


# 2026-05-12:单条 requirement 编辑 + 改名同步

class RequirementPatch(BaseModel):
    """单条需求 PATCH:仅传需要改的字段。"""
    module: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None  # P0/P1/P2/P3
    source: Optional[str] = None
    speaker: Optional[str] = None
    status: Optional[str] = None
    start_seconds: Optional[float] = None
    end_seconds: Optional[float] = None


@router.patch("/{meeting_id}/requirements/{req_id}")
async def patch_requirement(
    meeting_id: int,
    req_id: int,
    body: RequirementPatch,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """更新单条需求字段。"""
    await _load_meeting_owned(meeting_id, session, user)
    r = await session.get(Requirement, req_id)
    if not r or r.meeting_id != meeting_id:
        raise HTTPException(404, "需求不存在或不属于该会议")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(r, k, v)
    await session.commit()
    await session.refresh(r)
    return _requirement_dto(r)


class RequirementCreate(BaseModel):
    """新增需求(2026-05-12 加)。"""
    module: str = ""
    description: str = ""
    priority: str = "P2"
    source: Optional[str] = None
    speaker: Optional[str] = None
    status: str = "待确认"
    start_seconds: Optional[float] = None
    end_seconds: Optional[float] = None


@router.post("/{meeting_id}/requirements", status_code=201)
async def create_requirement(
    meeting_id: int,
    body: RequirementCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """手动新增一条需求。"""
    await _load_meeting_owned(meeting_id, session, user)
    # 生成 req_id:取当前 max + 1
    existing = (await session.scalars(
        select(Requirement).where(Requirement.meeting_id == meeting_id)
    )).all()
    next_idx = len(existing) + 1
    r = Requirement(
        meeting_id=meeting_id,
        req_id=f"REQ-{next_idx:03d}",
        module=body.module,
        description=body.description,
        priority=body.priority,
        source=body.source,
        speaker=body.speaker,
        status=body.status,
        start_seconds=body.start_seconds,
        end_seconds=body.end_seconds,
    )
    session.add(r)
    await session.commit()
    await session.refresh(r)
    return _requirement_dto(r)


@router.delete("/{meeting_id}/requirements/{req_id}", status_code=204)
async def delete_requirement(
    meeting_id: int,
    req_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """删除单条需求。"""
    await _load_meeting_owned(meeting_id, session, user)
    r = await session.get(Requirement, req_id)
    if not r or r.meeting_id != meeting_id:
        raise HTTPException(404, "需求不存在或不属于该会议")
    await session.delete(r)
    await session.commit()
    return None


class StakeholderRenamePayload(BaseModel):
    """改名同步:把 minutes / requirements 里 old_name(及别名)的引用换成 new_name。"""
    old_name: str
    new_name: str
    old_aliases: list[str] = []  # 旧别名也一起替换(可选)


@router.post("/{meeting_id}/stakeholders/rename")
async def rename_stakeholder_references(
    meeting_id: int,
    body: StakeholderRenamePayload,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """把改了名的干系人引用同步到 meeting_minutes 各字段 + requirements.speaker。

    匹配规则:对 old_name + 所有 old_aliases 做精确字符串替换(全字匹配)。
    "全字"指:仅当目标字段值与匹配项完全相等、或被「、」「,」「;」「 」分隔
    时才替换,避免把"张总"误改成"新名总"。
    """
    m = await _load_meeting_owned(meeting_id, session, user)
    candidates = {body.old_name, *body.old_aliases}
    candidates.discard("")
    if not candidates or not body.new_name.strip():
        return {"replaced_in_minutes": 0, "replaced_in_requirements": 0}

    def _replace_exact(text: str | None) -> tuple[str | None, int]:
        if not text:
            return text, 0
        replaced = 0
        for cand in candidates:
            # 全字匹配:cand 前后必须是分隔符或字符串边界
            import re
            pattern = r"(?<![\w一-鿿])" + re.escape(cand) + r"(?![\w一-鿿])"
            new_text, n = re.subn(pattern, body.new_name, text)
            text = new_text
            replaced += n
        return text, replaced

    # 1) meeting_minutes 各字段
    mm = dict(m.meeting_minutes or {})
    minutes_replaced = 0

    # a. 元信息单字段(string)
    for key in ("meeting_host", "meeting_recorder", "organizer", "summary"):
        v = mm.get(key)
        if isinstance(v, str):
            new_v, n = _replace_exact(v)
            if n:
                mm[key] = new_v
                minutes_replaced += n

    # b. attendees 数组
    if isinstance(mm.get("attendees"), list):
        new_attendees = []
        for s in mm["attendees"]:
            if isinstance(s, str):
                new_s, n = _replace_exact(s)
                minutes_replaced += n
                new_attendees.append(new_s)
            else:
                new_attendees.append(s)
        mm["attendees"] = new_attendees

    # c. key_points[] 的 topic / content(自由文本里可能提及名字)
    if isinstance(mm.get("key_points"), list):
        for item in mm["key_points"]:
            if isinstance(item, dict):
                for k in ("topic", "content"):
                    if isinstance(item.get(k), str):
                        new_v, n = _replace_exact(item[k])
                        if n:
                            item[k] = new_v
                            minutes_replaced += n

    # d. decisions[] / action_items[] / unresolved[] 所有文本字段 + owner
    text_fields = {
        "decisions": ("content", "owner"),
        "action_items": ("task", "owner", "remark", "deadline"),
        "unresolved": ("issue", "owner", "reason", "remark"),
    }
    for arr_key, fields in text_fields.items():
        arr = mm.get(arr_key)
        if not isinstance(arr, list):
            continue
        for item in arr:
            if not isinstance(item, dict):
                continue
            for f in fields:
                if isinstance(item.get(f), str):
                    new_v, n = _replace_exact(item[f])
                    if n:
                        item[f] = new_v
                        minutes_replaced += n

    if minutes_replaced:
        m.meeting_minutes = mm

    # 2) requirements:speaker + description + source + module
    reqs = (await session.scalars(
        select(Requirement).where(Requirement.meeting_id == meeting_id)
    )).all()
    req_replaced = 0
    for r in reqs:
        for attr in ("speaker", "description", "source", "module"):
            v = getattr(r, attr, None)
            if isinstance(v, str):
                new_v, n = _replace_exact(v)
                if n:
                    setattr(r, attr, new_v)
                    req_replaced += n

    await session.commit()
    logger.info("stakeholder_renamed",
                meeting_id=meeting_id,
                old=body.old_name, new=body.new_name,
                minutes=minutes_replaced, requirements=req_replaced)
    return {"replaced_in_minutes": minutes_replaced, "replaced_in_requirements": req_replaced}


# ── 音频上传 + ASR(Block C) ───────────────────────────────────────────

# ── 上传限制常量 ──────────────────────────────────────────────────
# 500MB 可覆盖绝大多数会议录音（128kbps MP3 ≈ 8 小时，16kHz WAV ≈ 4 小时）
_MAX_UPLOAD_MB = 500
_MAX_UPLOAD_BYTES = _MAX_UPLOAD_MB * 1024 * 1024


@router.post("/upload", status_code=202)
async def upload_audio_meeting(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    project_id: Optional[str] = Form(None),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """上传音频文件创建会议。后台异步:ASR → AI pipeline。

    大文件采用流式上传到 MinIO（不全部读入内存）。
    成功返回 meeting_id,前端轮询 GET /{id} 拿状态。
    """
    from services.meeting.storage import upload_audio, upload_audio_stream
    from tasks.meeting_tasks import transcribe_meeting as _task

    file_size = file.size  # FastAPI 从 multipart part headers 解析，通常可用

    # 1. 空文件检查
    if file_size is not None and file_size == 0:
        raise HTTPException(400, "上传文件为空")

    # 2. 大小限制检查（优先用已知 size，不读文件）
    if file_size is not None and file_size > _MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"音频文件超过 {_MAX_UPLOAD_MB} MB 限制")

    pid = await _validate_project_link(session, project_id, user)
    derived_title = title or (file.filename or "录音会议")
    m = Meeting(
        title=derived_title,
        owner_id=user.id,
        project_id=pid,
        status="recording",
        asr_engine="xiaomi",
    )
    session.add(m)
    await session.commit()
    await session.refresh(m)

    # 3. 上传到 MinIO
    try:
        if file_size is not None:
            # ★ 已知大小：流式上传，大文件不占内存
            object_key = upload_audio_stream(
                m.id,
                file.filename or "audio.bin",
                file.file,
                file_size,
                content_type=file.content_type or "audio/mpeg",
            )
            bytes_uploaded = file_size
        else:
            # 兜底：chunked transfer 等边缘场景，回退到读内存方式
            content = await file.read()
            if not content:
                raise HTTPException(400, "上传文件为空")
            if len(content) > _MAX_UPLOAD_BYTES:
                raise HTTPException(413, f"音频文件超过 {_MAX_UPLOAD_MB} MB 限制")
            object_key = upload_audio(
                m.id,
                file.filename or "audio.bin",
                content,
                content_type=file.content_type or "audio/mpeg",
            )
            bytes_uploaded = len(content)
    except HTTPException:
        m.status = "failed"
        await session.commit()
        raise
    except Exception as e:
        logger.exception("meeting_upload_minio_failed", meeting_id=m.id, error=str(e)[:200])
        m.status = "failed"
        await session.commit()
        raise HTTPException(500, "上传到对象存储失败")

    m.audio_object_key = object_key
    m.status = "processing"  # 排队等 ASR
    await session.commit()

    # 触发 ASR Celery task
    _task.delay(m.id)
    logger.info("meeting_upload_dispatched", meeting_id=m.id, bytes=bytes_uploaded, key=object_key)
    return {"meeting_id": m.id, "status": "accepted", "object_key": object_key}


# ── 半实时录音:边录边传(2026-06-22 Block D,段长由前端控制,默认 10s) ──────────
# 流程:前端 POST /recording 建会 → 每段独立 webm POST /{id}/audio-chunk(即时转写,
#       同步返回该段文本,前端拼到实时稿)→ 停止 POST /{id}/finalize(拼整段音频 + 跑 pipeline)。
# 单条录音的分段按 wall-clock 顺序到达(每段 ~10s),不并发,故直接累加 raw_transcript 无 race。

@router.post("/recording", status_code=201)
async def create_recording_meeting(
    body: MeetingCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """新建一个空的录音会议(半实时边录边传用),返回 meeting_id。"""
    pid = await _validate_project_link(session, body.project_id, user)
    m = Meeting(
        title=body.title or "录音会议",
        owner_id=user.id,
        project_id=pid,
        status="recording",
        asr_engine="xiaomi",
        total_chunks=0,
        done_chunks=0,
        raw_transcript="",
    )
    session.add(m)
    await session.commit()
    await session.refresh(m)
    logger.info("meeting_recording_created", meeting_id=m.id, user=user.username)
    return {"meeting_id": m.id, "status": m.status}


@router.post("/{meeting_id}/audio-chunk", status_code=200)
async def upload_audio_chunk(
    meeting_id: int,
    file: UploadFile = File(...),
    seq: int = Form(...),
    start_ms: int = Form(0),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """半实时:上传一个录音分段(独立可解码 webm),即时转写并追加到 raw_transcript。
    同步返回这一段的转写文本,前端直接拼到实时稿,无需轮询。单段失败只丢这一段、不中断录音。
    """
    from services.meeting.storage import put_segment
    from services.meeting.asr import transcribe_segment

    m = await _load_meeting_owned(meeting_id, session, user)
    content = await file.read()
    if not content:
        return {"seq": seq, "text": "", "done_chunks": m.done_chunks or 0}

    # 1. 存这一段(finalize 时拼成整段音频供回放;失败不阻断转写)
    try:
        put_segment(meeting_id, seq, content, content_type=file.content_type or "audio/webm")
    except Exception as e:
        logger.warning("audio_chunk_minio_failed", meeting_id=meeting_id, seq=seq, error=str(e)[:160])

    # 2. 转写这一段
    try:
        text = await transcribe_segment(content, filename=file.filename or f"seg-{seq}.webm")
    except Exception as e:
        logger.exception("audio_chunk_asr_failed", meeting_id=meeting_id, seq=seq, error=str(e)[:160])
        text = ""

    # 3. 加会议级 [MM:SS] 时间戳前缀(按 start_ms)+ 顺序累加到 raw_transcript
    line = ""
    if text:
        secs = max(0, int(start_ms) // 1000)
        mm, ss = divmod(secs, 60)
        line = f"[{mm:02d}:{ss:02d}] {text}"
    m.total_chunks = (m.total_chunks or 0) + 1
    m.done_chunks = (m.done_chunks or 0) + 1
    if line:
        m.raw_transcript = ((m.raw_transcript or "") + ("\n" if m.raw_transcript else "") + line)
    await session.commit()
    return {"seq": seq, "text": text, "done_chunks": m.done_chunks}


@router.post("/{meeting_id}/finalize", status_code=202)
async def finalize_recording(
    meeting_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """半实时录音停止:收尾。空转写 → failed;否则 status=processing 并派发
    finalize_recording_meeting(拼整段音频 + 跑 AI pipeline)。"""
    from services._time import utcnow_naive

    m = await _load_meeting_owned(meeting_id, session, user)
    m.end_time = utcnow_naive()
    if not (m.raw_transcript or "").strip():
        m.status = "failed"
        await session.commit()
        logger.warning("meeting_finalize_empty_transcript", meeting_id=meeting_id)
        return {"meeting_id": meeting_id, "status": "failed", "reason": "empty_transcript"}
    m.status = "processing"
    await session.commit()

    from tasks.meeting_tasks import finalize_recording_meeting as _task
    _task.delay(meeting_id)
    logger.info("meeting_finalize_dispatched", meeting_id=meeting_id, user=user.username)
    return {"meeting_id": meeting_id, "status": "processing"}


# ── 现场调研实时副驾(2026-06-22) ──────────────────────────────────────────

@router.post("/{meeting_id}/live-advice", status_code=200)
async def run_live_advice(
    meeting_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """跑一轮实时调研建议分析(基于截至目前转写),返回当前 open 建议(4 类)。"""
    await _load_meeting_owned(meeting_id, session, user)
    from services.meeting.live_advice import generate_live_advice
    return await generate_live_advice(meeting_id)


@router.get("/{meeting_id}/live-advice", status_code=200)
async def get_live_advice_endpoint(
    meeting_id: int,
    include_resolved: bool = False,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """只读当前 open 建议(不跑 LLM,前端轮询用);include_resolved 时附带已完成清单。"""
    await _load_meeting_owned(meeting_id, session, user)
    from services.meeting.live_advice import get_live_advice
    return await get_live_advice(meeting_id, include_resolved=include_resolved)


@router.post("/{meeting_id}/live-advice/{advice_id}/dismiss", status_code=200)
async def dismiss_live_advice(
    meeting_id: int,
    advice_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """顾问手动删除(忽略)一条建议。"""
    await _load_meeting_owned(meeting_id, session, user)
    from services.meeting.live_advice import dismiss_advice
    if not await dismiss_advice(meeting_id, advice_id):
        raise HTTPException(404, "建议不存在")
    return {"ok": True}


@router.post("/{meeting_id}/live-advice/{advice_id}/resolve", status_code=200)
async def resolve_live_advice(
    meeting_id: int,
    advice_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """顾问手动标记一条建议为已完成(成果)。"""
    await _load_meeting_owned(meeting_id, session, user)
    from services.meeting.live_advice import resolve_advice
    if not await resolve_advice(meeting_id, advice_id):
        raise HTTPException(404, "建议不存在")
    return {"ok": True}


# ── AI Pipeline 触发(Block B) ──────────────────────────────────────────

@router.post("/{meeting_id}/process", status_code=202)
async def process_meeting(
    meeting_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """触发 AI pipeline(异步,通过 Celery)。立即返回 202。

    Pipeline:polish → minutes/requirements(并行)→ stakeholders。
    完成后 status 切到 completed,前端轮询 GET /{id} 取结果。
    """
    m = await _load_meeting_owned(meeting_id, session, user)
    if not m.raw_transcript or not m.raw_transcript.strip():
        raise HTTPException(400, "无 raw_transcript,无法触发 pipeline")
    m.status = "processing"
    await session.commit()

    from tasks.meeting_tasks import process_meeting as _task
    _task.delay(meeting_id)
    logger.info("meeting_process_dispatched", meeting_id=meeting_id, user=user.username)
    return {"status": "accepted", "meeting_id": meeting_id}


# ── 单点 actions(同步,小数据量) ──────────────────────────────────────

@router.post("/{meeting_id}/actions/polish")
async def action_polish(
    meeting_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """仅润色 raw_transcript,写回 polished_transcript。"""
    from services.meeting import polish_transcript
    m = await _load_meeting_owned(meeting_id, session, user)
    if not m.raw_transcript:
        raise HTTPException(400, "无 raw_transcript")
    polished = await polish_transcript(m.raw_transcript)
    m.polished_transcript = polished
    await session.commit()
    return {"polished_transcript": polished}


@router.post("/{meeting_id}/actions/summarize")
async def action_summarize(
    meeting_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """仅生成纪要。优先用 polished_transcript,fallback raw。"""
    from models.template import MeetingTemplate
    from services.ai.template_evolver import _template_to_dict
    from services.meeting import generate_minutes
    m = await _load_meeting_owned(meeting_id, session, user)
    text = m.polished_transcript or m.raw_transcript
    if not text:
        raise HTTPException(400, "无可用 transcript")

    # 读活跃模板
    template_dict: dict | None = None
    tpl = (await session.execute(
        select(MeetingTemplate).where(MeetingTemplate.is_active == True).limit(1)  # noqa: E712
    )).scalar_one_or_none()
    if tpl:
        template_dict = _template_to_dict(tpl)

    minutes = await generate_minutes(text, meeting_title=m.title or "", template_dict=template_dict)
    m.meeting_minutes = minutes
    # 重新生成出实质纪要 → 把之前可能的 failed 状态恢复成 completed(关闭"失败→重生"闭环)
    if minutes and (minutes.get("summary") or minutes.get("key_points")):
        m.status = "completed"
    await session.commit()
    return {"meeting_minutes": minutes}


@router.get("/{meeting_id}/export-docx")
async def export_meeting_docx(
    meeting_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """按「纷享销客 CRM 实施纪要模板」生成 docx。2026-05-12。

    返回 application/vnd.openxmlformats-officedocument.wordprocessingml.document
    流,前端 a[download] 即可下载。
    """
    from fastapi.responses import Response
    from urllib.parse import quote
    from services.meeting.docx_export import render_minutes_docx

    m = await _load_meeting_owned(meeting_id, session, user)
    if not m.meeting_minutes:
        raise HTTPException(400, "纪要尚未生成,无法导出")

    # 兜底字段:模板缺会议时间时尝试用 meeting.start_time
    fallback_time = ""
    if m.start_time:
        fallback_time = m.start_time.strftime("%Y年%m月%d日 %H:%M")
        if m.end_time:
            fallback_time += "~" + m.end_time.strftime("%H:%M")

    try:
        docx_bytes = render_minutes_docx(
            meeting_title=m.title,
            minutes=m.meeting_minutes,
            fallback_time=fallback_time,
        )
    except Exception as e:
        logger.exception("export_minutes_docx_failed", meeting_id=meeting_id, error=str(e)[:200])
        raise HTTPException(500, f"生成 docx 失败:{e}")

    # 文件名：UTF-8 的 filename*= 为主，ASCII fallback filename= 为辅
    safe_name = quote(f"{m.title or '会议纪要'}.docx")
    # 从标题提取纯 ASCII 字符作为 fallback（中文标题会被 strip 掉则用默认值）
    ascii_name = "".join(c for c in (m.title or '') if ord(c) < 128 and c not in '\\/:*?"<>|')
    if not ascii_name.strip():
        ascii_name = "meeting_minutes"
    ascii_name = (ascii_name.strip()[:50] or "meeting_minutes") + ".docx"
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": (
                f"attachment; filename={quote(ascii_name)}; "
                f"filename*=UTF-8''{safe_name}"
            ),
            "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
    )


@router.post("/{meeting_id}/actions/extract_requirements")
async def action_extract_requirements(
    meeting_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """仅提取需求(覆盖式重建)。"""
    from services.meeting import extract_requirements
    from services.model_router import ModelOutputError
    m = await _load_meeting_owned(meeting_id, session, user)
    text = m.polished_transcript or m.raw_transcript
    if not text:
        raise HTTPException(400, "无可用 transcript")
    try:
        raw_reqs = await extract_requirements(text)
    except ModelOutputError as e:
        # 主备模型输出均被截断 / 无法解析 → 暴露为可见错误(前端 axios 拦截器统一弹 toast),
        # 不再静默落空需求清单(此前用户表现:点「重新提取」无反应、列表仍空)。
        raise HTTPException(503, "需求抽取失败:AI 输出被截断或无法解析,已自动重试主备模型仍未成功,请稍后重试") from e
    # 覆盖式重建
    await session.execute(sql_delete(Requirement).where(Requirement.meeting_id == meeting_id))
    out: list[dict] = []
    for r in raw_reqs:
        rec = Requirement(
            meeting_id=meeting_id,
            req_id=r.get("req_id") or "REQ-001",
            module=r.get("module") or "",
            description=r.get("description") or "",
            priority=r.get("priority") or "P2",
            source=r.get("source"),
            speaker=r.get("speaker"),
            status=r.get("status") or "待确认",
        )
        session.add(rec)
        out.append(r)
    await session.commit()
    return {"requirements": out}


@router.post("/{meeting_id}/actions/extract_stakeholders")
async def action_extract_stakeholders(
    meeting_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """仅提取干系人图谱。"""
    from services.meeting import extract_stakeholders
    m = await _load_meeting_owned(meeting_id, session, user)
    text = m.polished_transcript or m.raw_transcript
    if not text:
        raise HTTPException(400, "无可用 transcript")
    smap = await extract_stakeholders(
        meeting_id=m.id,
        meeting_title=m.title or "",
        transcript=text,
        minutes=m.meeting_minutes if isinstance(m.meeting_minutes, dict) else None,
    )
    m.stakeholder_map = smap
    await session.commit()
    return {"stakeholder_map": smap}


@router.post("/{meeting_id}/actions/extract_process_flows")
async def action_extract_process_flows(
    meeting_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """仅识别业务流程并生成 Mermaid 流程图(覆盖式)。"""
    from services.meeting import extract_process_flows
    from services.model_router import ModelOutputError
    m = await _load_meeting_owned(meeting_id, session, user)
    text = m.polished_transcript or m.raw_transcript
    if not text:
        raise HTTPException(400, "无可用 transcript")
    try:
        flows = await extract_process_flows(text)
    except ModelOutputError as e:
        # 同 action_extract_requirements:截断 / 坏 JSON 抛错可见,不再静默落空流程图。
        raise HTTPException(503, "业务流程识别失败:AI 输出被截断或无法解析,已自动重试主备模型仍未成功,请稍后重试") from e
    m.process_flows = flows
    await session.commit()
    return {"process_flows": flows}


@router.post("/{meeting_id}/actions/extract_illustrations")
async def action_extract_illustrations(
    meeting_id: int,
    body: dict | None = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """从会议内容生成配图(覆盖式)。可选 body: {"style_id": "..."}。"""
    import time as _time
    import structlog
    _log = structlog.get_logger()
    from services.meeting import extract_illustrations

    style_id = (body or {}).get("style_id", "auto")
    _log.info("extract_illustrations_endpoint_hit", meeting_id=meeting_id, user_id=user.id, style_id=style_id)
    m = await _load_meeting_owned(meeting_id, session, user)
    text = m.polished_transcript or m.raw_transcript
    if not text:
        raise HTTPException(400, "无可用 transcript")

    _log.info("extract_illustrations_start", meeting_id=meeting_id, text_chars=len(text), style_id=style_id)
    t0 = _time.monotonic()
    try:
        illustrations = await extract_illustrations(
            text,
            m.meeting_minutes if isinstance(m.meeting_minutes, dict) else None,
            style_id=style_id,
        )
    except Exception as e:
        _log.error("extract_illustrations_unhandled", meeting_id=meeting_id, error=str(e)[:300])
        raise HTTPException(500, f"解释图生成失败: {str(e)[:200]}")
    elapsed = _time.monotonic() - t0

    count = len(illustrations.get("illustrations", []))
    with_image = sum(1 for i in illustrations.get("illustrations", []) if i.get("image_url"))
    _log.info("extract_illustrations_done", meeting_id=meeting_id,
              elapsed_s=round(elapsed, 1), total=count, with_image=with_image)

    m.illustrations = illustrations
    await session.commit()
    return {"illustrations": illustrations}


# ── KB 同步(Block E.1) ────────────────────────────────────────────────

@router.post("/{meeting_id}/sync-kb")
async def sync_to_kb(
    meeting_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """把会议纪要同步到 kb-system 知识库(写入 Document 表)。

    要求会议已经处理完成(meeting_minutes 非空)。每次调用都创建一份**新**的
    Document,旧的不动 — 保留历史版本。
    """
    from services.meeting.kb_sync import sync_minutes_to_kb
    m = await _load_meeting_owned(meeting_id, session, user)
    if not m.meeting_minutes:
        raise HTTPException(400, "会议纪要尚未生成,请先触发 process")
    doc_id, url = await sync_minutes_to_kb(session, m, uploader_id=user.id)
    await session.commit()
    return {"status": "ok", "kb_doc_id": doc_id, "kb_url": url}


@router.post("/{meeting_id}/sync-stakeholder-map-kb")
async def sync_stakeholders_to_kb_endpoint(
    meeting_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """把干系人图谱同步到 kb-system 知识库。"""
    from services.meeting.kb_sync import sync_stakeholders_to_kb
    m = await _load_meeting_owned(meeting_id, session, user)
    if not m.stakeholder_map:
        raise HTTPException(400, "干系人图谱尚未生成,请先触发 extract_stakeholders")
    doc_id, url = await sync_stakeholders_to_kb(session, m, uploader_id=user.id)
    await session.commit()
    return {"status": "ok", "kb_doc_id": doc_id, "kb_url": url}


# ── 飞书凭证管理(Block E.4) ──────────────────────────────────────────

class FeishuCredentialsIn(BaseModel):
    app_id: str = Field(min_length=1, max_length=128)
    app_secret: str = Field(min_length=1, max_length=255)


@router.get("/feishu-credentials")
async def get_feishu_credentials(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """读取当前用户的飞书配置状态(不返 secret)。"""
    # 从 handler 自己的 session 加载，确保读到最新数据
    db_user = await session.get(User, user.id)
    return {
        "configured": bool(db_user.feishu_app_id and db_user.feishu_app_secret) if db_user else False,
        "app_id": db_user.feishu_app_id if db_user else None,
    }


@router.put("/feishu-credentials")
async def put_feishu_credentials(
    body: FeishuCredentialsIn,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """配置/更新当前用户的飞书凭证。secret 加密存储。"""
    from services.feishu_crypto import encrypt_secret
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


@router.delete("/feishu-credentials")
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
    # 清除凭证后同时清 token 缓存,防止残留
    if old_app_id:
        from services.meeting.feishu import invalidate_token_cache
        invalidate_token_cache(old_app_id)
    return {"status": "ok", "configured": False}


# ── 飞书会议导出 + 多维表同步(Block E.5) ─────────────────────────────

class BitableSyncIn(BaseModel):
    bitable_app_token: str = Field(default="", max_length=128)
    table_id: str = Field(default="", max_length=64)
    bitable_url: str | None = Field(default=None, max_length=512)


class BitableActionSyncIn(BaseModel):
    bitable_app_token: str = Field(default="", max_length=128)
    table_id: str = Field(default="", max_length=64)
    bitable_url: str | None = Field(default=None, max_length=512)


class FeishuFolderExportIn(BaseModel):
    folder_token: str | None = Field(default=None, max_length=128)
    existing_doc_url: str | None = Field(default=None, max_length=512)


class KanbanCreateIn(BaseModel):
    folder_token: str | None = Field(default=None, max_length=128)


class FeishuUrlCheckIn(BaseModel):
    url: str = Field(min_length=1, max_length=512)


def _require_feishu(user: User) -> tuple[str, str]:
    """获取飞书凭证:优先用户个人配置,未配置时回退全局配置,都没有则抛 412。

    返回 (app_id, app_secret),secret 已解密。
    """
    from services.meeting.feishu import get_user_feishu_credentials
    from services.feishu_crypto import decrypt_secret
    from config import settings

    # 1) 优先用户个人凭证
    creds = get_user_feishu_credentials(user)
    if creds:
        app_id, app_secret = creds
        decrypted = decrypt_secret(app_secret) or ""
        if decrypted:
            return app_id, decrypted

    # 2) 回退全局凭证
    global_id = settings.feishu_global_app_id.strip()
    global_secret = settings.feishu_global_app_secret.strip()
    if global_id and global_secret:
        return global_id, global_secret

    raise HTTPException(412, "请先在「个人设置 → 飞书集成」中配置飞书凭证")


@router.post("/{meeting_id}/check-feishu-url")
async def check_feishu_url(
    meeting_id: int,
    body: FeishuUrlCheckIn,
    user: User = Depends(get_current_user),
):
    """解析飞书 URL 并检查权限。

    支持飞书文档(docx)和多维表(base) URL。
    返回资源类型、权限状态、表列表(多维表时)等。
    """
    from services.meeting.feishu import (
        parse_feishu_url, check_doc_permission, check_bitable_permission, FeishuError,
    )

    app_id, app_secret = _require_feishu(user)
    parsed = parse_feishu_url(body.url)
    if not parsed:
        raise HTTPException(400, "无法解析该 URL。请提供飞书文档(docx)或多维表(base)的链接。")

    rtype = parsed["type"]
    try:
        if rtype == "docx":
            result = await check_doc_permission(app_id, app_secret, parsed["doc_token"])
            return {"type": "docx", "doc_token": parsed["doc_token"], **result}
        elif rtype == "bitable":
            result = await check_bitable_permission(app_id, app_secret, parsed["app_token"])
            resp = {"type": "bitable", "app_token": parsed["app_token"], **result}
            if parsed.get("table_id"):
                resp["table_id"] = parsed["table_id"]
            return resp
        elif rtype == "folder":
            return {
                "type": "folder", "folder_token": parsed["folder_token"],
                "has_permission": True, "readable": True,
                "message": "文件夹 token 已提取,将在创建文档时验证权限",
            }
        else:
            raise HTTPException(400, f"不支持的资源类型:{rtype}")
    except FeishuError as e:
        from services.meeting.feishu import http_status_for_feishu_error
        raise HTTPException(http_status_for_feishu_error(e.code, e.message), f"飞书 API 失败:{e.message}")


@router.post("/{meeting_id}/export-feishu")
async def export_to_feishu(
    meeting_id: int,
    body: FeishuFolderExportIn = FeishuFolderExportIn(),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """把会议纪要导出为飞书 docx 文档。

    支持两种模式:
    - 自动创建:不传 existing_doc_url 即可,可选 folder_token 指定目标文件夹
    - 写入已有文档:传 existing_doc_url(飞书 docx 链接),系统会清空旧内容后写入新纪要
    """
    from services.meeting.feishu import (
        create_doc_with_markdown, write_markdown_to_existing_doc,
        parse_feishu_url, FeishuError,
    )
    from services.meeting.kb_sync import render_minutes_markdown

    app_id, app_secret = _require_feishu(user)
    m = await _load_meeting_owned(meeting_id, session, user)
    if not m.meeting_minutes:
        raise HTTPException(400, "会议纪要尚未生成,请先触发 process")

    markdown = render_minutes_markdown(m)
    title = f"{m.title or '未命名会议'} - 会议纪要"

    # ── 路径2:写入已有文档 ──
    if body.existing_doc_url and body.existing_doc_url.strip():
        parsed = parse_feishu_url(body.existing_doc_url.strip())
        if not parsed or parsed.get("type") != "docx":
            raise HTTPException(400, "无法解析该文档 URL。请提供飞书 docx 链接(如 https://xxx.feishu.cn/docx/XXX)")
        doc_token = parsed["doc_token"]
        try:
            url = await write_markdown_to_existing_doc(
                app_id, app_secret, doc_token, title, markdown,
            )
        except FeishuError as e:
            from services.meeting.feishu import http_status_for_feishu_error
            raise HTTPException(http_status_for_feishu_error(e.code, e.message), f"飞书 API 失败:{e.message}")
        m.feishu_url = url
        await session.commit()
        return {"status": "ok", "url": url, "document_id": doc_token, "mode": "existing"}

    # ── 路径1:自动创建新文档 ──
    try:
        doc_id, url = await create_doc_with_markdown(
            app_id, app_secret, title, markdown,
            folder_token=body.folder_token,
        )
    except FeishuError as e:
        from services.meeting.feishu import http_status_for_feishu_error
        raise HTTPException(http_status_for_feishu_error(e.code, e.message), f"飞书 API 失败:{e.message}")

    m.feishu_url = url
    await session.commit()
    return {"status": "ok", "url": url, "document_id": doc_id, "mode": "auto"}


@router.post("/{meeting_id}/sync-requirements")
async def sync_requirements_to_bitable(
    meeting_id: int,
    body: BitableSyncIn,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """把会议提取出的需求清单批量写入飞书多维表。

    支持两种模式:
    - 手动输入:传入 bitable_app_token + table_id(需预先创建好表,字段对齐)
    - URL 导入:传入 bitable_url(飞书多维表链接),自动解析 token 并校验权限后写入。
      若 URL 中不含 table_id 参数,从多维表中选择第一个表写入。

    字段名需跟 records 字典 key 对齐:
    req_id / module / description / priority / source / speaker / status
    """
    from services.meeting.feishu import (
        batch_create_bitable_records, parse_feishu_url,
        check_bitable_permission, FeishuError,
    )

    app_id, app_secret = _require_feishu(user)
    m = await _load_meeting_owned(meeting_id, session, user)
    reqs = (await session.scalars(
        select(Requirement).where(Requirement.meeting_id == m.id).order_by(Requirement.id)
    )).all()
    if not reqs:
        raise HTTPException(400, "该会议没有需求记录")

    records = [
        {
            "req_id": r.req_id,
            "module": r.module,
            "description": r.description,
            "priority": r.priority,
            "source": r.source or "",
            "speaker": r.speaker or "",
            "status": r.status,
        }
        for r in reqs
    ]

    app_token = body.bitable_app_token.strip()
    table_id = body.table_id.strip()

    # ── 路径2:URL 导入 ──
    if body.bitable_url and body.bitable_url.strip():
        parsed = parse_feishu_url(body.bitable_url.strip())
        if not parsed or parsed.get("type") != "bitable":
            raise HTTPException(400, "无法解析该多维表 URL。请提供飞书多维表链接(如 https://xxx.feishu.cn/base/XXX)")
        app_token = parsed["app_token"]
        # 优先使用 body 中明确指定的 table_id(来自前端下拉选择),其次用 URL 中的
        table_id = table_id or parsed.get("table_id", "")
        # 若仍无 table_id,取第一个表
        if not table_id:
            try:
                perm = await check_bitable_permission(app_id, app_secret, app_token)
            except FeishuError as e:
                from services.meeting.feishu import http_status_for_feishu_error
                raise HTTPException(http_status_for_feishu_error(e.code, e.message), f"飞书 API 失败:{e.message}")
            if not perm.get("has_permission"):
                raise HTTPException(403, perm.get("message", "无权访问该多维表"))
            tables = perm.get("tables", [])
            if not tables:
                raise HTTPException(400, "该多维表中没有表格,请先在飞书中创建一个数据表")
            table_id = tables[0]["table_id"]

    if not app_token or not table_id:
        raise HTTPException(400, "请提供多维表 app_token 和 table_id,或有效的多维表 URL")

    try:
        url = await batch_create_bitable_records(
            app_id, app_secret, app_token, table_id, records
        )
    except FeishuError as e:
        from services.meeting.feishu import http_status_for_feishu_error
        raise HTTPException(http_status_for_feishu_error(e.code, e.message), f"飞书多维表 API 失败:{e.message}")

    m.bitable_app_token = app_token
    await session.commit()
    return {"status": "ok", "url": url, "rows": len(records)}


@router.post("/{meeting_id}/sync-action-items")
async def sync_action_items_to_bitable(
    meeting_id: int,
    body: BitableActionSyncIn,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """把会议纪要中的待办事项(action_items)写入飞书多维表看板。

    支持两种模式:
    - 手动输入:传入 bitable_app_token + table_id
    - URL 导入:传入 bitable_url(飞书多维表链接),自动解析 token 并校验权限后写入

    待办从 meeting.meeting_minutes.action_items 提取,每条包含:
    task / owner / deadline / priority / remark

    看板视图按"状态"字段分组:待办 / 进行中 / 已完成
    """
    from services.meeting.feishu import (
        sync_action_items_to_bitable as _sync, parse_feishu_url,
        check_bitable_permission, FeishuError,
    )

    app_id, app_secret = _require_feishu(user)
    m = await _load_meeting_owned(meeting_id, session, user)
    if not m.meeting_minutes:
        raise HTTPException(400, "会议纪要尚未生成,请先触发 process")

    minutes = m.meeting_minutes or {}
    action_items = minutes.get("action_items") or []
    if not action_items:
        raise HTTPException(400, "会议纪要中没有待办事项")

    app_token = body.bitable_app_token.strip()
    table_id = body.table_id.strip()

    # ── 路径2:URL 导入 ──
    if body.bitable_url and body.bitable_url.strip():
        parsed = parse_feishu_url(body.bitable_url.strip())
        if not parsed or parsed.get("type") != "bitable":
            raise HTTPException(400, "无法解析该多维表 URL。请提供飞书多维表链接(如 https://xxx.feishu.cn/base/XXX)")
        app_token = parsed["app_token"]
        # 优先使用 body 中明确指定的 table_id(来自前端下拉选择),其次用 URL 中的
        table_id = table_id or parsed.get("table_id", "")
        if not table_id:
            try:
                perm = await check_bitable_permission(app_id, app_secret, app_token)
            except FeishuError as e:
                from services.meeting.feishu import http_status_for_feishu_error
                raise HTTPException(http_status_for_feishu_error(e.code, e.message), f"飞书 API 失败:{e.message}")
            if not perm.get("has_permission"):
                raise HTTPException(403, perm.get("message", "无权访问该多维表"))
            tables = perm.get("tables", [])
            if not tables:
                raise HTTPException(400, "该多维表中没有表格,请先在飞书中创建一个数据表")
            table_id = tables[0]["table_id"]

    if not app_token or not table_id:
        raise HTTPException(400, "请提供多维表 app_token 和 table_id,或有效的多维表 URL")

    try:
        url = await _sync(app_id, app_secret, app_token, table_id, action_items)
    except FeishuError as e:
        from services.meeting.feishu import http_status_for_feishu_error
        raise HTTPException(http_status_for_feishu_error(e.code, e.message), f"飞书多维表 API 失败:{e.message}")

    m.action_bitable_app_token = app_token  # 修复 #4:使用独立字段
    await session.commit()
    return {"status": "ok", "url": url, "rows": len(action_items)}


@router.post("/{meeting_id}/create-action-kanban")
async def create_action_kanban(
    meeting_id: int,
    body: KanbanCreateIn = KanbanCreateIn(),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """自动创建一个飞书多维表,预置看板字段,用于存放会议待办。

    返回 {app_token, table_id, url},前端可继续调用 sync-action-items 写入数据。

    可选 folder_token:指定创建到哪个飞书云空间文件夹。
    """
    from services.meeting.feishu import create_kanban_bitable, FeishuError

    app_id, app_secret = _require_feishu(user)
    m = await _load_meeting_owned(meeting_id, session, user)
    name = f"会议待办-{m.title or '未命名'}"
    try:
        app_token, table_id, url = await create_kanban_bitable(
            app_id, app_secret, name, folder_token=body.folder_token,
        )
    except FeishuError as e:
        from services.meeting.feishu import http_status_for_feishu_error
        raise HTTPException(http_status_for_feishu_error(e.code, e.message), f"创建看板失败:{e.message}")

    m.action_bitable_app_token = app_token  # 修复 #4:使用独立字段
    await session.commit()
    return {
        "status": "ok",
        "app_token": app_token,
        "table_id": table_id,
        "url": url,
    }


# ── 音频在线播放(2026-05-21) ─────────────────────────────────────────

@router.get("/{meeting_id}/audio")
async def stream_audio(
    meeting_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user_for_media),
):
    """流式返回会议录音文件,支持 Range 请求(用于 HTML5 <audio> 拖拽播放)。

    鉴权支持 ?token=JWT 查询参数,因为浏览器 <audio> 元素无法携带 Authorization 头。
    """
    from fastapi.responses import StreamingResponse
    from services.meeting.storage import _client, _bucket_name

    m = await _load_meeting_owned(meeting_id, session, user)
    if not m.audio_object_key:
        raise HTTPException(404, "该会议无录音文件")

    try:
        mc = _client()
        bucket = _bucket_name()
        stat = mc.stat_object(bucket, m.audio_object_key)
        file_size = stat.size
        content_type = stat.content_type or "audio/mpeg"
    except Exception as e:
        logger.warning("audio_stat_failed", key=m.audio_object_key, error=str(e)[:120])
        raise HTTPException(500, "无法读取录音文件")

    if file_size <= 0:
        raise HTTPException(404, "音频文件为空")

    # ── Range 请求解析 ─────────────────────────────────────────────
    range_header = request.headers.get("Range", "")
    is_range = bool(range_header)
    start, end = 0, file_size - 1

    if is_range:
        range_val = range_header.replace("bytes=", "").strip()
        try:
            if range_val.startswith("-"):
                suffix = int(range_val[1:])
                start = max(0, file_size - suffix)
            else:
                parts = range_val.split("-", 1)
                start = int(parts[0])
                end = int(parts[1]) if parts[1].strip() else file_size - 1
        except (ValueError, IndexError):
            is_range = False

        if is_range:
            if start >= file_size:
                raise HTTPException(416, f"Range 起始位置 {start} 超出文件大小 {file_size}")
            end = min(end, file_size - 1)

    # ── 流式生成器 ────────────────────────────────────────────────
    if is_range:
        content_length = end - start + 1

        def _iter_range():
            try:
                resp = mc.get_object(bucket, m.audio_object_key, offset=start, length=content_length)
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    yield chunk
                resp.close()
                resp.release_conn()
            except Exception as e:
                logger.warning("audio_stream_error", key=m.audio_object_key, error=str(e)[:120])

        return StreamingResponse(
            _iter_range(),
            status_code=206,
            media_type=content_type,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Content-Length": str(content_length),
                "Accept-Ranges": "bytes",
                "Cache-Control": "no-cache",
            },
        )

    # 无 Range → 全量流式返回
    def _iter():
        try:
            resp = mc.get_object(bucket, m.audio_object_key)
            while True:
                chunk = resp.read(65536)
                if not chunk:
                    break
                yield chunk
            resp.close()
            resp.release_conn()
        except Exception as e:
            logger.warning("audio_stream_error", key=m.audio_object_key, error=str(e)[:120])

    return StreamingResponse(
        _iter(),
        status_code=200,
        media_type=content_type,
        headers={
            "Content-Length": str(file_size),
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache",
        },
    )


# ── 会议智能问答(2026-05-21) ─────────────────────────────────────────

class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


@router.post("/{meeting_id}/chat")
async def chat_with_meeting(
    meeting_id: int,
    body: ChatRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """基于会议内容的智能问答(RAG 风格)。

    把会议的 transcript + minutes + requirements + stakeholders 打包进
    system prompt,让 LLM 基于上下文回答用户问题。
    """
    import json as _json
    from services.model_router import model_router

    m = await _load_meeting_owned(meeting_id, session, user)

    # 组装上下文
    context_parts: list[str] = []
    if m.raw_transcript:
        context_parts.append(f"=== 会议转写(润色后) ===\n{(m.polished_transcript or m.raw_transcript)[:8000]}")
    if m.meeting_minutes:
        context_parts.append(f"=== 会议纪要 ===\n{_json.dumps(m.meeting_minutes, ensure_ascii=False, indent=2)[:4000]}")
    if m.stakeholder_map:
        context_parts.append(f"=== 干系人图谱 ===\n{_json.dumps(m.stakeholder_map, ensure_ascii=False, indent=2)[:2000]}")

    reqs = (await session.scalars(
        select(Requirement).where(Requirement.meeting_id == m.id).order_by(Requirement.id)
    )).all()
    if reqs:
        # default=str:_requirement_dto 里的 created_at 是 datetime,标准 json 不识别,
        # 2026-05-28 修:之前漏掉这个会让整个 endpoint 在 context 组装阶段崩,
        # 异常逃出下面的 try/except,FastAPI 走默认 handler 返回 plain text 500
        reqs_text = _json.dumps(
            [_requirement_dto(r) for r in reqs],
            ensure_ascii=False, indent=2, default=str,
        )
        context_parts.append(f"=== 需求清单 ===\n{reqs_text[:3000]}")

    context = "\n\n".join(context_parts)

    if not context.strip():
        raise HTTPException(400, "该会议尚无内容,无法问答")

    system_prompt = (
        "你是一个专业的会议助手。请根据以下会议内容回答用户的问题。\n"
        "规则:\n"
        "1. 只依据提供的会议内容作答,不要编造信息\n"
        "2. 如果会议内容中找不到相关信息,坦诚说明\n"
        "3. 回答要简洁、有条理,使用中文\n"
        "4. 引用具体内容时注明出处(如「根据会议纪要的决议事项...」)\n"
        "5. 当提到待办/需求时,若有时间标记(如 [MM:SS]),请一并标注\n"
        "\n"
        f"{context}"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": body.question},
    ]

    try:
        answer, model = await model_router.chat_with_routing(
            task="meeting_qa_answer",
            messages=messages,
            temperature=0.3,
            max_tokens=4000,
        )
    except Exception as e:
        logger.exception("meeting_chat_failed", meeting_id=meeting_id, error=str(e)[:200])
        raise HTTPException(500, f"AI 问答失败:{e}")

    logger.info("meeting_chat_done", meeting_id=meeting_id, model=model, q_len=len(body.question))
    return {"answer": answer.strip(), "model": model}


# 兼容旧 ingest webhook(避免老调用方报 404)
@router.post("/ingest")
async def ingest_meeting():
    """Webhook for meeting transcript ingestion — deprecated,使用 POST /from-text 代替。"""
    raise HTTPException(410, "已迁移:请使用 POST /api/meeting/from-text")


# ── 会议分享(2026-05-27) ────────────────────────────────────────────────────

class ShareAddBody(BaseModel):
    """新增分享对象 — 一次可批量加多个用户。"""
    user_ids: list[str] = Field(default_factory=list, max_length=50)


def _share_dto(s: MeetingShare, u: User | None) -> dict:
    return {
        "id": s.id,
        "meeting_id": s.meeting_id,
        "user_id": s.user_id,
        "username": u.username if u else None,
        "full_name": u.full_name if u else None,
        "email": u.email if u else None,
        "created_by": s.created_by,
        "created_at": s.created_at,
    }


def _user_brief(u: User | None) -> dict | None:
    if not u:
        return None
    return {
        "user_id": u.id,
        "username": u.username,
        "full_name": u.full_name,
        "email": u.email,
    }


async def _assert_can_manage_shares(m: Meeting, user: User) -> None:
    """谁能改 share:owner / admin / 项目 write 协作者(项目协作者也常常需要把会议
    分享给项目外的同事)。"""
    if user.is_admin or m.owner_id == user.id:
        return
    if m.project_id:
        from services.project_acl import get_user_project_access
        access = await get_user_project_access(user, m.project_id)
        if access in ("owner", "read_write"):
            return
    raise HTTPException(403, "无权管理该会议的分享")


@router.get("/{meeting_id}/shares")
async def list_meeting_shares(
    meeting_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """列出当前会议的分享对象,以及(若绑定了项目)项目成员快照。

    返回:
      {
        "owner": {user_id, username, full_name, email} | null,
        "project": {id, name} | null,
        "project_members": [{user_id, username, full_name, email, role}],  # 项目协作者(自动可见)
        "shares": [{id, user_id, username, full_name, email, created_by, created_at}]
      }
    """
    m = await _load_meeting_owned(meeting_id, session, user)

    # owner
    owner_user = await session.get(User, m.owner_id) if m.owner_id else None

    # project + 项目成员
    project_dto = None
    project_members: list[dict] = []
    if m.project_id:
        p = await session.get(Project, m.project_id)
        if p:
            project_dto = {"id": p.id, "name": p.name}
            # owner of project
            powner = await session.get(User, p.created_by) if p.created_by else None
            if powner:
                project_members.append({
                    **_user_brief(powner),  # type: ignore[arg-type]
                    "role": "owner",
                })
            # collaborators
            coll_rows = (await session.execute(
                select(ProjectCollaborator, User)
                .outerjoin(User, ProjectCollaborator.user_id == User.id)
                .where(ProjectCollaborator.project_id == m.project_id)
                .order_by(ProjectCollaborator.created_at.asc())
            )).all()
            for c, u in coll_rows:
                if not u:
                    continue
                project_members.append({**_user_brief(u), "role": c.role})  # type: ignore[arg-type]

    # 显式 share 列表
    share_rows = (await session.execute(
        select(MeetingShare, User)
        .outerjoin(User, MeetingShare.user_id == User.id)
        .where(MeetingShare.meeting_id == meeting_id)
        .order_by(MeetingShare.created_at.asc())
    )).all()
    shares = [_share_dto(s, u) for s, u in share_rows]

    return {
        "owner": _user_brief(owner_user),
        "project": project_dto,
        "project_members": project_members,
        "shares": shares,
    }


@router.post("/{meeting_id}/shares", status_code=201)
async def add_meeting_shares(
    meeting_id: int,
    body: ShareAddBody,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """把会议分享给一批用户(幂等:已存在的跳过)。

    禁止:
    - 把 owner 自己加进 share 表
    - 加不存在或已禁用的用户
    返回新增成功的 share 列表(已存在的不会重复返回,但也不报错)。
    """
    m = await _load_meeting_owned(meeting_id, session, user)
    await _assert_can_manage_shares(m, user)

    if not body.user_ids:
        return []

    # 去重 + 过滤 owner
    target_ids = [uid for uid in {*body.user_ids} if uid and uid != m.owner_id]
    if not target_ids:
        return []

    # 校验用户存在 + 活跃
    users = (await session.scalars(
        select(User).where(User.id.in_(target_ids))
    )).all()
    user_by_id = {u.id: u for u in users}
    missing = [uid for uid in target_ids if uid not in user_by_id]
    if missing:
        raise HTTPException(400, f"用户不存在:{missing[0]}")
    inactive = [u.id for u in users if not getattr(u, "is_active", True)]
    if inactive:
        raise HTTPException(400, "目标用户已禁用,不能分享")

    # 已存在的跳过
    existing_ids = (await session.execute(
        select(MeetingShare.user_id).where(
            MeetingShare.meeting_id == meeting_id,
            MeetingShare.user_id.in_(target_ids),
        )
    )).scalars().all()
    new_ids = [uid for uid in target_ids if uid not in set(existing_ids)]

    created: list[MeetingShare] = []
    for uid in new_ids:
        s = MeetingShare(
            meeting_id=meeting_id,
            user_id=uid,
            created_by=user.id,
        )
        session.add(s)
        created.append(s)
    await session.commit()
    for s in created:
        await session.refresh(s)

    logger.info(
        "meeting_shared",
        meeting_id=meeting_id,
        added=[s.user_id for s in created],
        by=user.username,
    )
    return [_share_dto(s, user_by_id.get(s.user_id)) for s in created]


@router.delete("/{meeting_id}/shares/{user_id}", status_code=204)
async def remove_meeting_share(
    meeting_id: int,
    user_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """取消单个用户对该会议的分享。"""
    m = await _load_meeting_owned(meeting_id, session, user)
    await _assert_can_manage_shares(m, user)

    s = (await session.execute(
        select(MeetingShare).where(
            MeetingShare.meeting_id == meeting_id,
            MeetingShare.user_id == user_id,
        )
    )).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "该用户未被分享")
    await session.delete(s)
    await session.commit()
    logger.info(
        "meeting_share_revoked",
        meeting_id=meeting_id,
        user_id=user_id,
        by=user.username,
    )
    return None
