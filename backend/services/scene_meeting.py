"""会议 → 涉及场景 识别 + 持久化(2026-07-14 闭环③)。

复用 scene_match 里的逐场判定器 `_detect_meeting_delta`,把单场会议的场景增量
(纳入 / 移出)解析成 [{domain,code,name}] 存进 meeting_scene_deltas,供:
- 会议详情页展示「本场涉及场景」
- 项目场景命中折叠时复用(scene_match 折叠时顺带 upsert)
"""
from __future__ import annotations

import hashlib

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.meeting import Meeting
from models.meeting_scene import MeetingSceneDelta
from models.scene import StandardScene

logger = structlog.get_logger()


def minutes_fingerprint(meeting: Meeting) -> str:
    """会议纪要/转写的指纹,用于判断缓存的场景增量是否过期。"""
    from services.scene_match import _render_minutes
    body = _render_minutes(meeting.edited_minutes or meeting.meeting_minutes) \
        or (meeting.polished_transcript or meeting.raw_transcript or "")
    return hashlib.md5(body.encode("utf-8", "ignore")).hexdigest()


async def _load_scene_indexes(session: AsyncSession):
    scenes = (await session.execute(
        select(StandardScene).where(StandardScene.status == "active")
        .order_by(StandardScene.domain, StandardScene.code)
    )).scalars().all()
    scene_index: dict[tuple[str, str], dict] = {}
    code_only_index: dict[str, dict] = {}
    for s in scenes:
        item = {"domain": s.domain, "code": s.code, "name": s.name}
        scene_index[(s.domain.strip().upper(), s.code.strip().upper())] = item
        code_only_index.setdefault(s.code.strip().upper(), item)
    return scenes, scene_index, code_only_index


def _keys_to_scenes(keys: set, scene_index: dict) -> list[dict]:
    """(domain,code) keys → [{domain,code,name}],按 domain/code 稳定排序。"""
    out = [scene_index[k] for k in keys if k in scene_index]
    return sorted(out, key=lambda x: (x["domain"], x["code"]))


async def upsert_meeting_delta(
    session: AsyncSession, meeting: Meeting,
    in_scenes: list[dict], out_scenes: list[dict], detected_by: str | None,
) -> MeetingSceneDelta:
    """写入/更新某会议的场景增量(不 commit,由调用方提交)。"""
    row = (await session.execute(
        select(MeetingSceneDelta).where(MeetingSceneDelta.meeting_id == meeting.id)
    )).scalar_one_or_none()
    if row is None:
        row = MeetingSceneDelta(meeting_id=meeting.id)
        session.add(row)
    row.project_id = meeting.project_id
    row.in_scope = in_scenes
    row.out_of_scope = out_scenes
    row.minutes_hash = minutes_fingerprint(meeting)
    row.detected_by = detected_by
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(row, "in_scope")
    flag_modified(row, "out_of_scope")
    return row


async def detect_meeting_scenes(
    meeting_id: int, session: AsyncSession, detected_by: str | None = None,
) -> dict:
    """识别单场会议涉及的场景并落库,返回 {in_scope, out_of_scope, detected_at}。"""
    from services.scene_match import _detect_meeting_delta, _build_scene_catalog

    meeting = await session.get(Meeting, meeting_id)
    if meeting is None:
        return {"in_scope": [], "out_of_scope": [], "error": "meeting_not_found"}

    scenes, scene_index, code_only_index = await _load_scene_indexes(session)
    if not scenes:
        return {"in_scope": [], "out_of_scope": [], "error": "no_scenes"}

    catalog = _build_scene_catalog(scenes)
    in_keys, out_keys, had_signal = await _detect_meeting_delta(
        meeting, catalog, scene_index, code_only_index, meeting.project_id or "",
    )

    if not had_signal:
        # 两轮主备全空/失败 —— 别把空结果连同有效 minutes_hash 写进缓存(否则项目匹配缓存命中会把假 0 当真复用)。
        # 保留库里已有的判定(若有),返回它;没有就返回空 + 失败标记,让前端提示重试。
        existing = (await session.execute(
            select(MeetingSceneDelta).where(MeetingSceneDelta.meeting_id == meeting.id)
        )).scalar_one_or_none()
        logger.warning("meeting_scenes_detect_no_signal", meeting_id=meeting_id,
                       kept_existing=bool(existing))
        return {
            "meeting_id": meeting_id,
            "in_scope": existing.in_scope if existing else [],
            "out_of_scope": existing.out_of_scope if existing else [],
            "detected_at": existing.detected_at.isoformat() if existing and existing.detected_at else None,
            "had_signal": False,
            "error": "detect_failed",
        }

    in_scenes = _keys_to_scenes(in_keys, scene_index)
    out_scenes = _keys_to_scenes(out_keys, scene_index)

    row = await upsert_meeting_delta(session, meeting, in_scenes, out_scenes, detected_by)
    await session.commit()
    logger.info("meeting_scenes_detected", meeting_id=meeting_id,
                in_n=len(in_scenes), out_n=len(out_scenes), had_signal=had_signal)
    return {
        "meeting_id": meeting_id,
        "in_scope": in_scenes,
        "out_of_scope": out_scenes,
        "detected_at": row.detected_at.isoformat() if row.detected_at else None,
        "had_signal": had_signal,
    }
