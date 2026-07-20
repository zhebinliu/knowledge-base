"""Celery tasks for output generation (kickoff_pptx / kickoff_html / insight / survey / survey_outline / research_plan / research_report).

注：insight / survey / survey_outline / research_plan / research_report 都走 agentic runner —
旧的对话式 'insight' / 'survey' generator 已下线（v3 命名归一，详见 scripts/migrate_v3_rename.py）。
"""
import asyncio
import structlog
from tasks.convert_task import celery_app

logger = structlog.get_logger()


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="precompute_scene_coverage", bind=True, max_retries=1, soft_time_limit=200, time_limit=260)
def precompute_scene_coverage(self, bundle_id: str):
    """交付物完成后后台预算场景覆盖(缓存到 bundle.extra),前端徽标秒开。
    非场景类产物 / 命中没跑过 → 服务内快速返回 applicable=False,不调 LLM。"""
    from services.scene_coverage import bundle_scene_coverage
    from models import async_session_maker
    from models.curated_bundle import CuratedBundle

    async def _go():
        async with async_session_maker() as s:
            b = await s.get(CuratedBundle, bundle_id)
            if b and (b.content_md or "").strip():
                await bundle_scene_coverage(b, s)

    try:
        _run(_go())
    except Exception as e:  # noqa: BLE001
        logger.warning("precompute_coverage_failed", bundle_id=bundle_id, error=str(e)[:150])


@celery_app.task(name="run_scene_reflow", bind=True, track_started=True,
                 max_retries=0, soft_time_limit=300, time_limit=340)
def run_scene_reflow_task(self, project_id: str, username: str | None = None):
    """蓝图回流:后台跑 LLM 识别 + 落库(pm_pending)。前端轮询任务状态,不再同步干等 ~2 分钟。
    返回 {count};逻辑与旧同步端点一致(先清该项目在途旧提案再重建)。"""
    from services.scene_reflow import propose_scene_changes
    from models import async_session_maker
    from models.scene import SceneChangeProposal
    from models.project import Project
    from sqlalchemy import select

    async def _go():
        async with async_session_maker() as s:
            proj = await s.get(Project, project_id)
            props = await propose_scene_changes(project_id, s)
            old = (await s.execute(select(SceneChangeProposal).where(
                SceneChangeProposal.project_id == project_id,
                SceneChangeProposal.status.in_(["pm_pending", "admin_pending"]),
            ))).scalars().all()
            for o in old:
                await s.delete(o)
            for p in props:
                s.add(SceneChangeProposal(
                    project_id=project_id, project_name=proj.name if proj else None,
                    change_type=p.get("change_type", "optimize"), domain=p.get("domain"),
                    scene_code=p.get("scene_code"), name=p.get("name", ""), summary=p.get("summary"),
                    content=p.get("content") or {}, status="pm_pending", created_by=username,
                ))
            await s.commit()
            return len(props)

    n = _run(_go())
    logger.info("scene_reflow_task_done", project_id=project_id, n=n)
    return {"count": n}


@celery_app.task(name="build_proposition_network", bind=True, track_started=True,
                 max_retries=0, soft_time_limit=300, time_limit=360)
def build_proposition_network_task(self, project_id: str, username: str | None = None):
    """构建项目命题网络:逐文档 LLM 抽取 → 跨文档聚类 → 场景对齐 → 持久化。"""
    from services.proposition_extract import build_proposition_network
    from models import async_session_maker

    async def _go():
        async with async_session_maker() as s:
            return await build_proposition_network(project_id, s, created_by=username)

    result = _run(_go())
    logger.info("proposition_network_task_done", project_id=project_id,
                stats=result.get("stats") if isinstance(result, dict) else None)
    return result.get("stats") if isinstance(result, dict) else result


@celery_app.task(name="generate_kickoff_pptx", bind=True, max_retries=2, soft_time_limit=900, time_limit=1200)
def generate_kickoff_pptx(self, bundle_id: str, project_id: str):
    from services.output_service import generate_kickoff_pptx as _gen
    _run(_gen(bundle_id, project_id))


@celery_app.task(name="generate_kickoff_html", bind=True, max_retries=2, soft_time_limit=900, time_limit=1200)
def generate_kickoff_html(self, bundle_id: str, project_id: str):
    from services.output_service import generate_kickoff_html as _gen
    _run(_gen(bundle_id, project_id))


# ── agentic 生成器(insight / survey / survey_outline) ──────────────────────

@celery_app.task(name="generate_insight", bind=True, max_retries=2, soft_time_limit=900, time_limit=1200)
def generate_insight(self, bundle_id: str, project_id: str):
    from services.agentic.runner import generate_insight as _gen
    _run(_gen(bundle_id, project_id))
    # 2026-06-03:insight 完成后自动连带触发启动会 PPT 生成。
    # chain 必须 swallow 异常,否则会让已成功的 insight task 被 Celery 误标 failed/retry。
    try:
        _run(_chain_kickoff_pptx_after_insight(bundle_id, project_id))
    except Exception as e:
        logger.warning("kickoff_chain_failed_but_insight_ok",
                       insight_bundle_id=bundle_id, project_id=project_id, error=str(e))


async def _chain_kickoff_pptx_after_insight(insight_bundle_id: str, project_id: str) -> None:
    """insight 成功后自动新建 kickoff_pptx bundle 并 dispatch 生成任务。

    - 仅当 insight bundle 真正 `status='done'` 时才连带(insight 内部标 failed 时跳过)
    - 每次新建一条(与 `/api/outputs/generate` 路由的现有语义一致,前端按最新 done 展示)
    - 不去重已有 kickoff bundle —— 用户已确认「重生 insight 时总是连带重生 PPT」
    """
    from models import async_session_maker
    from models.project import Project
    from models.curated_bundle import CuratedBundle

    async with async_session_maker() as s:
        insight = await s.get(CuratedBundle, insight_bundle_id)
        if not insight or insight.status != "done":
            logger.info("kickoff_chain_skipped_insight_not_done",
                        insight_bundle_id=insight_bundle_id,
                        insight_status=(insight.status if insight else None))
            return
        proj = await s.get(Project, project_id)
        if not proj:
            logger.warning("kickoff_chain_project_missing", project_id=project_id)
            return
        bundle = CuratedBundle(
            kind="kickoff_pptx",
            project_id=project_id,
            title=f"启动会 PPT(pptxgen) · {proj.name}",
            status="pending",
            created_by=insight.created_by,                 # 归属到触发 insight 的用户
            created_by_name=insight.created_by_name or "auto",
        )
        s.add(bundle)
        await s.commit()
        await s.refresh(bundle)
        new_bid = bundle.id

    generate_kickoff_pptx.delay(new_bid, project_id)
    logger.info("kickoff_chain_dispatched",
                kickoff_bundle_id=new_bid,
                insight_bundle_id=insight_bundle_id,
                project_id=project_id)


@celery_app.task(name="generate_survey", bind=True, max_retries=2, soft_time_limit=900, time_limit=1200)
def generate_survey(self, bundle_id: str, project_id: str):
    from services.agentic.runner import generate_survey as _gen
    _run(_gen(bundle_id, project_id))


@celery_app.task(name="generate_survey_session", bind=True, max_retries=2, soft_time_limit=600, time_limit=900)
def generate_survey_session(self, bundle_id: str, project_id: str, session_id: str, extra_context: str = ""):
    """按场次手动触发生成调研问卷题目(2026-06-03)。
    参见 services/agentic/runner.generate_survey_for_session。
    extra_context (2026-06-04):用户本次重生前刚补的新内容,LLM 据此改写出题方向。
    """
    from services.agentic.runner import generate_survey_for_session as _gen
    _run(_gen(bundle_id, project_id, session_id, extra_context=extra_context or ""))


@celery_app.task(name="generate_survey_role", bind=True, max_retries=2, soft_time_limit=600, time_limit=900)
def generate_survey_role(self, bundle_id: str, project_id: str, role: str):
    """按单个角色增量生成调研问卷题目(executive / dept_head / frontline / it)。
    参见 services/agentic/runner.generate_survey_for_role。
    """
    from services.agentic.runner import generate_survey_for_role as _gen
    _run(_gen(bundle_id, project_id, role))


# 2026-06-03 outline 时间预算从 900/1200 提到 1500/1800:加了 sessions JSON 抽取的 LLM 调用后,
# 挑战循环 + 抽取 + docx 装配累积容易超原 900s soft limit
@celery_app.task(name="generate_survey_outline", bind=True, max_retries=2, soft_time_limit=1500, time_limit=1800)
def generate_survey_outline(self, bundle_id: str, project_id: str):
    from services.agentic.runner import generate_survey_outline as _gen
    _run(_gen(bundle_id, project_id))


@celery_app.task(name="generate_research_plan", bind=True, max_retries=2, soft_time_limit=600, time_limit=900)
def generate_research_plan(self, bundle_id: str, project_id: str):
    from services.agentic.runner import generate_research_plan as _gen
    _run(_gen(bundle_id, project_id))


@celery_app.task(name="extract_plan_sessions", bind=True, max_retries=1, soft_time_limit=200, time_limit=300)
def extract_plan_sessions(self, plan_bundle_id: str):
    """从 research_plan bundle 的最新 markdown 抽 plan_sessions JSON,写到 extra.plan_sessions(2026-06-03)。
    生成时机:
      - generate_research_plan 完成后自动调用一次
      - PUT /outputs/{id}/content 保存 plan markdown 后自动调用
    复用 outline_sessions_extractor;失败不抛(只 log)。"""
    from services.agentic.runner import extract_plan_sessions_async as _gen
    _run(_gen(plan_bundle_id))


@celery_app.task(name="generate_research_report", bind=True, max_retries=2, soft_time_limit=900, time_limit=1200)
def generate_research_report(self, bundle_id: str, project_id: str):
    from services.agentic.runner import generate_research_report as _gen
    _run(_gen(bundle_id, project_id))


@celery_app.task(name="generate_blueprint_design", bind=True, max_retries=2, soft_time_limit=900, time_limit=1200)
def generate_blueprint_design(self, bundle_id: str, project_id: str):
    from services.agentic.runner import generate_blueprint_design as _gen
    _run(_gen(bundle_id, project_id))


@celery_app.task(name="generate_implementation_plan", bind=True, max_retries=2, soft_time_limit=900, time_limit=1200)
def generate_implementation_plan(self, bundle_id: str, project_id: str):
    from services.agentic.runner import generate_implementation_plan as _gen
    _run(_gen(bundle_id, project_id))


@celery_app.task(name="generate_test_plan", bind=True, max_retries=2, soft_time_limit=900, time_limit=1200)
def generate_test_plan(self, bundle_id: str, project_id: str):
    from services.agentic.runner import generate_test_plan as _gen
    _run(_gen(bundle_id, project_id))


@celery_app.task(name="generate_acceptance_report", bind=True, max_retries=2, soft_time_limit=900, time_limit=1200)
def generate_acceptance_report(self, bundle_id: str, project_id: str):
    from services.agentic.runner import generate_acceptance_report as _gen
    _run(_gen(bundle_id, project_id))


# 对象字段表 / 流程建设表的内部 LLM 预算更大(主调用 720s + linter 2×600s ≈ 最坏 1920s),
# 必须给足 Celery 时间预算,否则跑 linter 时被硬杀 → bundle 永停 generating(详见 reap_stale_bundles)。
@celery_app.task(name="generate_object_field_layout", bind=True, max_retries=2, soft_time_limit=1800, time_limit=2100)
def generate_object_field_layout(self, bundle_id: str, project_id: str):
    from services.agentic.runner import generate_object_field_layout as _gen
    _run(_gen(bundle_id, project_id))


@celery_app.task(name="generate_process_setup", bind=True, max_retries=2, soft_time_limit=1800, time_limit=2100)
def generate_process_setup(self, bundle_id: str, project_id: str):
    from services.agentic.runner import generate_process_setup as _gen
    _run(_gen(bundle_id, project_id))


# ── 修订版学习(2026-06-08)─────────────────────────────────────────────────
# 用户上传修订版覆盖 AI 产出后,异步抽取「用户偏好笔记」沉淀到 bundle_revision_memories,
# 下次同 kind 生成时拼到 system prompt 顶部。失败不影响主流程(覆盖已 commit)。
@celery_app.task(
    name="analyze_bundle_revision",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    soft_time_limit=180,
    time_limit=240,
)
def analyze_bundle_revision(
    self,
    bundle_id: str,
    bundle_kind: str,
    original_md: str,
    revised_md: str,
    project_id: str | None = None,
    user_id: str | None = None,
):
    """异步分析 AI 原版 vs 用户修订版,产出偏好笔记并 INSERT 到 bundle_revision_memories。"""
    from services.revision_learning import analyze_revision
    from models import async_session_maker
    from models.bundle_revision_memory import BundleRevisionMemory

    async def _go():
        try:
            notes, model_used = await analyze_revision(original_md, revised_md, bundle_kind)
        except Exception as e:
            logger.error("analyze_bundle_revision_llm_failed",
                         bundle_id=bundle_id, kind=bundle_kind, error=str(e)[:300])
            raise

        # 边界:空 notes 或明确「无系统性偏好」的情况不入库,避免污染下次 prompt
        notes_stripped = (notes or "").strip()
        if not notes_stripped or "无显著系统性偏好" in notes_stripped or "无明确的系统性偏好" in notes_stripped:
            logger.info("analyze_bundle_revision_skip_trivial",
                        bundle_id=bundle_id, kind=bundle_kind, notes_chars=len(notes_stripped))
            return

        async with async_session_maker() as session:
            mem = BundleRevisionMemory(
                bundle_kind=bundle_kind,
                source_bundle_id=bundle_id,
                source_project_id=project_id,
                source_user_id=user_id,
                notes_md=notes_stripped,
                enabled=True,
                original_chars=len(original_md or ""),
                new_chars=len(revised_md or ""),
                llm_model=model_used,
            )
            session.add(mem)
            await session.commit()
            logger.info("analyze_bundle_revision_saved",
                        memory_id=mem.id, bundle_id=bundle_id, kind=bundle_kind,
                        model=model_used, notes_chars=len(notes_stripped))

    try:
        _run(_go())
    except Exception as e:
        # 自动重试 3 次,每次间隔 60s
        if self.request.retries < self.max_retries:
            logger.warning("analyze_bundle_revision_retry",
                           bundle_id=bundle_id, attempt=self.request.retries + 1,
                           error=str(e)[:200])
            raise self.retry(exc=e)
        # 用完重试还失败:吞掉(主流程已经 commit,不影响用户)
        logger.error("analyze_bundle_revision_giveup",
                     bundle_id=bundle_id, error=str(e)[:300])


# ── kind → 生成任务 映射(供自动重启复用)──────────────────────────────────
def _kind_to_task() -> dict:
    """bundle.kind → 对应的 Celery 生成任务,用于卡死后自动重新触发。
    必须覆盖所有走 curated_bundles 的 kind(与 outputs.api 的 KIND_TO_TASK 对齐)。"""
    return {
        "kickoff_pptx": generate_kickoff_pptx,
        "kickoff_html": generate_kickoff_html,
        "insight": generate_insight,
        "survey": generate_survey,
        "survey_outline": generate_survey_outline,
        "research_plan": generate_research_plan,
        "research_report": generate_research_report,
        "blueprint_design": generate_blueprint_design,
        "object_field_layout": generate_object_field_layout,
        "process_setup": generate_process_setup,
        "implementation_plan": generate_implementation_plan,
        "test_plan": generate_test_plan,
        "acceptance_report": generate_acceptance_report,
    }


# ── stale bundle 自动重启(beat 每 300s + 服务启动时各跑一次)──────────────────
# 卡死成因:① 生成被 Celery time_limit 硬杀(runner 的 except 来不及跑);
#           ② 部署滚动重启 celery_worker / backend,在途任务被 orphan。
# 「默认重启工作」机制:对卡死的 bundle 自动重新派发生成任务(沿用文档 process_document
#   的 requeue 思路),最多 MAX_AUTO_RESTARTS 次;超过则标 failed,前端回到空态可手动重试。
# 阈值用 updated_at(生成过程会持续写 progress 刷新 updated_at),单步最大间隔 ~12min(主 LLM 调用),
#   30min 阈值不会误杀仍在跑的任务,又比硬限 35min 后的 orphan 早点捞回来。
STALE_BUNDLE_MINUTES = 30
MAX_AUTO_RESTARTS = 3


@celery_app.task(name="recover_stale_bundles")
def recover_stale_bundles():
    return _run(_recover_stale_bundles())


async def _recover_stale_bundles(cutoff_minutes: int = STALE_BUNDLE_MINUTES,
                                 max_restarts: int = MAX_AUTO_RESTARTS) -> dict:
    """捞出卡死的 bundle:未超重启上限的自动重新派发任务,超限的标 failed。

    返回 {"restarted": n, "failed": m}。派发在 commit 之后做,确保 DB 状态先落库。
    """
    from datetime import timedelta
    from sqlalchemy import select
    from sqlalchemy.orm.attributes import flag_modified
    from models import async_session_maker
    from models.curated_bundle import CuratedBundle
    from services._time import utcnow_naive

    cutoff = utcnow_naive() - timedelta(minutes=cutoff_minutes)
    task_map = _kind_to_task()
    to_dispatch: list[tuple] = []   # (kind, bundle_id, project_id)
    restarted = failed = 0
    async with async_session_maker() as s:
        rows = (await s.execute(
            select(CuratedBundle)
            .where(CuratedBundle.status.in_(("pending", "generating")))
            .where(CuratedBundle.updated_at < cutoff)
        )).scalars().all()
        for b in rows:
            extra = dict(b.extra or {})
            count = int(extra.get("auto_restart_count", 0) or 0)
            can_restart = task_map.get(b.kind) is not None and b.project_id and count < max_restarts
            if can_restart:
                extra["auto_restart_count"] = count + 1
                extra["progress"] = {"stage": "pending", "message": f"任务中断,正在自动重启(第 {count + 1} 次)…"}
                b.extra = extra
                flag_modified(b, "extra")
                b.status = "pending"
                b.error = None
                to_dispatch.append((b.kind, b.id, b.project_id))
                restarted += 1
            else:
                extra["auto_restart_exhausted"] = True
                b.extra = extra
                flag_modified(b, "extra")
                b.status = "failed"
                b.error = ("多次自动重启仍未完成,请手动重新生成或检查素材/服务。"
                           if count >= max_restarts else
                           "生成任务中断且无法自动重启,请手动重新生成。")
                failed += 1
        if rows:
            await s.commit()
    # commit 后再派发(确保 worker 拿到的是已落库的 pending 状态)
    for kind, bid, pid in to_dispatch:
        task = task_map.get(kind)
        if task is not None:
            task.delay(bid, pid)
    if restarted or failed:
        logger.warning("recover_stale_bundles", restarted=restarted, failed=failed,
                       cutoff_minutes=cutoff_minutes)
    return {"restarted": restarted, "failed": failed}
