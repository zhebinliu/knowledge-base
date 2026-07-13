"""会议纪要 Celery tasks:process_meeting + transcribe(Block C 接入)。

模式参考 output_tasks.py:同步 task 内用独立事件循环驱动 async 业务函数。
"""
import asyncio
from datetime import datetime

import structlog
from sqlalchemy import select, delete as sql_delete

from tasks.convert_task import celery_app

logger = structlog.get_logger()


def _run(coro):
    """同步运行异步函数。每次调用创建独立事件循环。"""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


async def _process_meeting_async(meeting_id: int):
    """执行 AI pipeline 并写回 DB。状态机:processing → completed/failed。"""
    from models import async_session_maker
    from models.meeting import Meeting, Requirement
    from models.template import MeetingTemplate
    from models.term_correction import TermCorrection
    from services._time import utcnow_naive
    from services.ai.template_evolver import _template_to_dict
    from services.meeting import run_full_pipeline

    async with async_session_maker() as session:
        meeting = await session.get(Meeting, meeting_id)
        if not meeting:
            logger.error("meeting_not_found_for_processing", meeting_id=meeting_id)
            return
        if not meeting.raw_transcript or not meeting.raw_transcript.strip():
            logger.warning("meeting_skip_empty_transcript", meeting_id=meeting_id)
            meeting.status = "failed"
            await session.commit()
            return

        # 状态机进入 processing
        meeting.status = "processing"
        await session.commit()

        raw = meeting.raw_transcript
        title = meeting.title or ""

        # 读取活跃模板
        template_dict: dict | None = None
        try:
            tpl = (await session.execute(
                select(MeetingTemplate)
                .where(MeetingTemplate.is_active == True)  # noqa: E712
                .limit(1)
            )).scalar_one_or_none()
            if tpl:
                template_dict = _template_to_dict(tpl)
        except Exception:
            logger.warning("failed_to_load_template", exc_info=True)

        # 读取用户的名词校正清单
        term_hints = ""
        try:
            terms = (await session.execute(
                select(TermCorrection).where(TermCorrection.user_id == meeting.owner_id)
            )).scalars().all()
            if terms:
                lines = [f"- 「{t.wrong_term}」→ 应为「{t.correct_term}」" for t in terms]
                term_hints = "## 专属名词校正清单\n以下是用户提供的名词校正对照,润色时必须将左边的错误词替换为右边的正确名称:\n" + "\n".join(lines)
        except Exception:
            logger.warning("failed_to_load_term_corrections", exc_info=True)

    # 跑 pipeline(脱离 session,避免 LLM 长时间持有连接)
    try:
        # 文字来源(asr_engine="text")跳过润色，直接使用原文进入后续阶段
        result = await run_full_pipeline(
            raw_transcript=raw,
            meeting_id=meeting_id,
            meeting_title=title,
            kb_docs=None,  # Block E 接 KB 联动后,这里读 project_id 拉 KB 文档
            template_dict=template_dict,
            skip_polish=(meeting.asr_engine == "text"),
            term_hints=term_hints,
        )
    except Exception as e:
        logger.exception("meeting_pipeline_unhandled", meeting_id=meeting_id, error=str(e)[:200])
        async with async_session_maker() as session:
            m = await session.get(Meeting, meeting_id)
            if m:
                m.status = "failed"
                await session.commit()
        return

    # 写回 DB
    async with async_session_maker() as session:
        m = await session.get(Meeting, meeting_id)
        if not m:
            return
        stage_errors = result.get("stage_errors") or []
        m.polished_transcript = result.get("polished_transcript") or ""
        m.stakeholder_map = result.get("stakeholder_map") or {}
        m.process_flows = result.get("process_flows") or {"flows": [], "version": 1}
        # 纪要(核心交付物)生成失败(模型 403/429/超时/解析失败)→ 标 failed + 纪要置空,
        # 前端显示「失败 + 重新生成」而非静默空表;用户一键重跑(POST /{id}/process)。
        if "minutes" in stage_errors:
            m.meeting_minutes = None
            m.status = "failed"
        else:
            m.meeting_minutes = result.get("meeting_minutes") or {}
            m.status = "completed"
        m.end_time = utcnow_naive()

        # 重建需求清单(覆盖式)
        await session.execute(sql_delete(Requirement).where(Requirement.meeting_id == meeting_id))
        for raw_req in result.get("requirements", []):
            session.add(Requirement(
                meeting_id=meeting_id,
                req_id=raw_req.get("req_id") or "REQ-001",
                module=raw_req.get("module") or "",
                description=raw_req.get("description") or "",
                priority=raw_req.get("priority") or "P2",
                source=raw_req.get("source"),
                speaker=raw_req.get("speaker"),
                status=raw_req.get("status") or "待确认",
                start_seconds=raw_req.get("start_seconds"),
                end_seconds=raw_req.get("end_seconds"),
            ))
        await session.commit()
        logger.info("meeting_processed", meeting_id=meeting_id, status=m.status)


@celery_app.task(name="process_meeting", bind=True, max_retries=1, soft_time_limit=1500, time_limit=1800)
def process_meeting(self, meeting_id: int):
    """会议 AI pipeline:polish → minutes/requirements → stakeholders。"""
    _run(_process_meeting_async(meeting_id))


# ── ASR transcribe(Block C) ────────────────────────────────────────────

async def _transcribe_meeting_async(meeting_id: int):
    """MinIO 下载音频 → 切片并发 xiaomi ASR(边出边写 raw_transcript / done_chunks)
    → 全部完成自动触发 process。

    2026-05-12 改造:走 services.meeting.asr.transcribe_audio 切片版,每片完成
    后增量更新 DB,前端可实时看到流式输出。
    """
    from models import async_session_maker
    from models.meeting import Meeting
    from services.meeting.storage import download_audio
    from services.meeting.asr import transcribe_audio, CHUNK_SIZE_BYTES
    from services.meeting.audio_utils import convert_to_pcm
    from services.meeting.asr import _format_from_filename

    async with async_session_maker() as session:
        meeting = await session.get(Meeting, meeting_id)
        if not meeting:
            logger.error("meeting_not_found_for_transcribe", meeting_id=meeting_id)
            return
        if not meeting.audio_object_key:
            logger.warning("meeting_no_audio_key", meeting_id=meeting_id)
            meeting.status = "failed"
            await session.commit()
            return
        meeting.status = "processing"
        meeting.asr_engine = "xiaomi"
        meeting.done_chunks = 0
        meeting.total_chunks = 0
        meeting.raw_transcript = ""
        await session.commit()
        object_key = meeting.audio_object_key
        filename = object_key.split("/")[-1]

    try:
        audio_bytes = download_audio(object_key)

        # 先转 PCM + 算切片数,写 total_chunks(给前端 progress bar 用)
        pcm = convert_to_pcm(audio_bytes, source_format=_format_from_filename(filename))
        total_chunks = (len(pcm) + CHUNK_SIZE_BYTES - 1) // CHUNK_SIZE_BYTES
        async with async_session_maker() as session:
            m = await session.get(Meeting, meeting_id)
            if m:
                m.total_chunks = total_chunks
                await session.commit()
        logger.info("meeting_chunks_planned", meeting_id=meeting_id, total=total_chunks)

        # 每片完成时,按 index 落位 + 增量写 DB,前端轮询拿到流式 transcript
        parts: list[str] = [""] * total_chunks

        async def _on_chunk(idx: int, text: str) -> None:
            seconds = idx * 20  # CHUNK_SECONDS
            mm, ss = divmod(seconds, 60)
            parts[idx] = f"[{mm:02d}:{ss:02d}] {text}" if text else ""
            async with async_session_maker() as session:
                m = await session.get(Meeting, meeting_id)
                if not m:
                    return
                m.done_chunks = (m.done_chunks or 0) + 1
                # 按 index 顺序拼接(空片留空,保留顺序结构)
                m.raw_transcript = "\n".join(p for p in parts if p)
                await session.commit()

        # 注:transcribe_audio 内部会再转一次 PCM,小冗余;为了 total_chunks 提前
        # 拿到,这里先转一次。后续可优化让 transcribe_audio 接受 pcm bytes 直入。
        transcript = await transcribe_audio(audio_bytes, filename=filename, on_chunk=_on_chunk)
    except Exception as e:
        logger.exception("meeting_transcribe_failed", meeting_id=meeting_id, error=str(e)[:200])
        async with async_session_maker() as session:
            m = await session.get(Meeting, meeting_id)
            if m:
                m.status = "failed"
                await session.commit()
        return

    async with async_session_maker() as session:
        m = await session.get(Meeting, meeting_id)
        if not m:
            return
        # 用最终拼接结果做最后一次覆盖(避免片间隔时序问题)
        m.raw_transcript = transcript
        await session.commit()
        logger.info("meeting_transcribed", meeting_id=meeting_id, chars=len(transcript))

    # 自动触发后续 AI pipeline
    await _process_meeting_async(meeting_id)


@celery_app.task(name="transcribe_meeting", bind=True, max_retries=1, soft_time_limit=1800, time_limit=2100)
def transcribe_meeting(self, meeting_id: int):
    """ASR 转写 + 自动触发后续 AI pipeline。"""
    _run(_transcribe_meeting_async(meeting_id))


# ── 半实时录音 finalize(边录边传,2026-06-22 Block D) ──────────────────────

async def _finalize_recording_async(meeting_id: int):
    """半实时录音停止后:把各段音频拼成整段 wav 供回放(失败不阻断)→ 跑 AI pipeline。

    转写稿在录音过程中已由 audio-chunk 端点逐段累积进 raw_transcript,这里不再 ASR,
    只补一个可回放的整段音频,然后复用 _process_meeting_async 跑润色 / 纪要 / 需求等。
    """
    from models import async_session_maker
    from models.meeting import Meeting
    from services.meeting.storage import list_segments, download_audio, upload_audio
    from services.meeting.audio_utils import convert_to_pcm, pcm_to_wav

    # 拼接各段 → 整段 wav(纯为回放;失败只是没回放音频,不影响纪要)
    try:
        seg_keys = list_segments(meeting_id)
        if seg_keys:
            pcm_all = bytearray()
            for k in seg_keys:
                try:
                    pcm_all += convert_to_pcm(download_audio(k), source_format="webm")
                except Exception as e:
                    logger.warning("finalize_seg_decode_failed", meeting_id=meeting_id, key=k, error=str(e)[:120])
            if pcm_all:
                wav = pcm_to_wav(bytes(pcm_all))
                key = upload_audio(meeting_id, "录音.wav", wav, content_type="audio/wav")
                async with async_session_maker() as session:
                    m = await session.get(Meeting, meeting_id)
                    if m:
                        m.audio_object_key = key
                        await session.commit()
                logger.info("finalize_audio_concat_done", meeting_id=meeting_id, segs=len(seg_keys), wav_bytes=len(wav))
    except Exception as e:
        logger.warning("finalize_concat_failed", meeting_id=meeting_id, error=str(e)[:160])

    # 并行上传可能让 raw_transcript 行按「到达」而非「时间」顺序排,按 [MM:SS] 重排,保证纪要输入有序
    import re as _re
    async with async_session_maker() as session:
        m = await session.get(Meeting, meeting_id)
        if m and m.raw_transcript and "\n" in m.raw_transcript:
            def _ts_key(ln: str) -> int:
                mt = _re.match(r"\s*\[(\d+):(\d+)\]", ln)
                return int(mt.group(1)) * 60 + int(mt.group(2)) if mt else 0
            lines = [ln for ln in m.raw_transcript.split("\n") if ln.strip()]
            m.raw_transcript = "\n".join(sorted(lines, key=_ts_key))
            await session.commit()

    # 跑后续 AI pipeline(读已累积的 raw_transcript)
    await _process_meeting_async(meeting_id)


@celery_app.task(name="finalize_recording_meeting", bind=True, max_retries=1, soft_time_limit=1500, time_limit=1800)
def finalize_recording_meeting(self, meeting_id: int):
    """半实时录音收尾:拼接整段音频 + 跑 AI pipeline。"""
    _run(_finalize_recording_async(meeting_id))


# ── 流程图 mermaid 定期巡检 + 修复 ──────────────────────────────────────────
async def _sweep_meeting_mermaid_async(limit: int | None = None) -> dict:
    """扫描所有有 process_flows 的会议,确定性修复坏 mermaid(保留字/菱形括号/多图拆分)。

    幂等:已修好的再跑不产生改动。纯字符串变换,不调 LLM。
    """
    from models import async_session_maker
    from models.meeting import Meeting
    from services.meeting.mermaid_repair import repair_process_flows
    from sqlalchemy import select
    from sqlalchemy.orm.attributes import flag_modified

    scanned = fixed_meetings = repaired = split = 0
    async with async_session_maker() as session:
        stmt = select(Meeting).where(Meeting.process_flows.isnot(None))
        if limit:
            stmt = stmt.limit(limit)
        meetings = (await session.execute(stmt)).scalars().all()
        for m in meetings:
            scanned += 1
            pf = m.process_flows
            if not pf:
                continue
            new_pf, st = repair_process_flows(pf)
            if st["changed"]:
                m.process_flows = new_pf
                flag_modified(m, "process_flows")  # JSON 列:确保 ORM 标脏
                fixed_meetings += 1
                repaired += st["repaired"]
                split += st["split"]
                logger.info(
                    "meeting_mermaid_repaired",
                    meeting_id=m.id, repaired=st["repaired"], split=st["split"],
                    flows_before=st["flows_before"], flows_after=st["flows_after"],
                )
        if fixed_meetings:
            await session.commit()

    result = {"scanned": scanned, "fixed_meetings": fixed_meetings, "repaired": repaired, "split": split}
    logger.info("sweep_meeting_mermaid_done", **result)
    return result


@celery_app.task(name="sweep_meeting_mermaid", bind=True, max_retries=1, soft_time_limit=600, time_limit=900)
def sweep_meeting_mermaid(self):
    """定期巡检:修复会议流程图里渲染失败的 mermaid(beat 每小时触发,见 convert_task.beat_schedule)。"""
    return _run(_sweep_meeting_mermaid_async())
