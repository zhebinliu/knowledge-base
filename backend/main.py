from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
import structlog
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

# ── 全局 datetime UTC 序列化(2026-05-28) ──────────────────────────────────
# 历史欠债:整库 created_at / updated_at 都用 utcnow_naive 存(naive UTC),
# FastAPI 默认 jsonable_encoder 把 naive datetime 序列化成 "2026-...:00" 不带 Z,
# JS new Date() 当本地时间解析,在 UTC+8 服务器上前端就显示成"8 小时前"。
# 在这里 patch fastapi.encoders.ENCODERS_BY_TYPE[datetime] = utc_iso,
# 所有走 jsonable_encoder 的路径(几乎所有非 pydantic response_model 端点)立刻
# 输出 "+00:00" 后缀,前端 new Date() 就能正确解析。
# 必须在所有 api.* 模块 import 之前 patch,否则那些模块 import 时如果捕获了
# 旧 isoformat 引用会用错的。
from datetime import datetime as _dt, date as _date, timezone as _tz
from fastapi.encoders import ENCODERS_BY_TYPE as _ENC

def _utc_iso_datetime(d: _dt) -> str:
    """naive 当 UTC,有 tz 保留原 tz。"""
    if d.tzinfo is None:
        d = d.replace(tzinfo=_tz.utc)
    return d.isoformat()

_ENC[_dt] = _utc_iso_datetime
_ENC[_date] = lambda d: d.isoformat()  # 日期本来就无时区,保持

from config import settings
from api import documents, chunks, qa, challenge, review, export, agent_settings, auth, projects, users, mcp, coverage, call_logs, outputs, meeting, output_chats, briefs, stage_flow, doc_checklist, virtual_artifacts, web_suggest, stakeholder_graph, workflow_canvas, research, admin_invite_codes, admin_bundle_memories, project_stakeholders, smart_advice, template, admin_daily_report, project_gates, scenes, scene_ops
from services.auth import get_current_user
from services.rate_limit import limiter
from services.vector_store import vector_store

logger = structlog.get_logger()

# 2026-05-12 生产 readiness 改造:
# - 启动时校验 JWT secret 非默认值,不开放 /docs /openapi.json(防止泄露内部端点)
if settings.jwt_secret_key.startswith("change-me"):
    raise RuntimeError(
        "JWT_SECRET_KEY 仍是默认值!请在 .env 配置 jwt_secret_key 为随机字符串(>= 32 字符)。"
    )

_IS_PROD = settings.kb_env != "development"

# Sentry(2026-05-12):.env 配 SENTRY_DSN 时初始化错误监控,空则跳过
if settings.sentry_dsn:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            traces_sample_rate=0.1,  # 10% 采样性能,够看慢请求,不烧额度
            send_default_pii=False,  # 不上传 user email / IP 等
            integrations=[StarletteIntegration(), FastApiIntegration()],
            environment=settings.kb_env,
        )
        logger.info("sentry_initialized")
    except ImportError:
        logger.warning("sentry_sdk_not_installed_but_dsn_configured")
    except Exception as e:
        logger.error("sentry_init_failed", error=str(e))

app = FastAPI(
    title="KB System API",
    description="纷享销客 CRM 知识库管理系统",
    version="1.0.0",
    docs_url=None if _IS_PROD else "/docs",
    redoc_url=None if _IS_PROD else "/redoc",
    openapi_url=None if _IS_PROD else "/openapi.json",
)


# request_id middleware(2026-05-12):全链路追踪,客户端可传 X-Request-ID 或我们生成 uuid。
# 绑到 structlog.contextvars,各处 logger.info 自动带这个字段。
@app.middleware("http")
async def add_request_id(request, call_next):
    import uuid as _uuid
    from structlog.contextvars import bind_contextvars, clear_contextvars
    rid = request.headers.get("X-Request-ID") or _uuid.uuid4().hex[:16]
    bind_contextvars(request_id=rid)
    try:
        response = await call_next(request)
    finally:
        clear_contextvars()
    response.headers["X-Request-ID"] = rid
    return response


# ── 调用日志 middleware(2026-05-12) ─────────────────────────────────────────
# 哪个用户、什么时候、用了什么 endpoint、结果 status_code,自动写 ApiCallLog 表。
# Admin 在 /settings → 调用日志 tab 查询。
#
# 过滤策略(避免噪声 + 攻击面):
# - 跳过 OPTIONS / HEAD / 静态资源 / 高频探活(/health, /api/auth/captcha)
# - 跳过 /api/mcp(mcp.py 自己写 log_call,含 tool_name 更细)
# - 跳过 /api/call-logs(自循环)
# - 跳过匿名失败请求(401/403)——攻击者可能刷日志撑爆表
_LOG_SKIP_PREFIXES = (
    "/health",
    "/api/mcp",
    "/api/call-logs",
    "/api/auth/captcha",
    "/api/auth/me",  # 前端每次切页都打,价值低
    "/docs", "/openapi.json", "/redoc",
    "/maintenance.html",
)


@app.middleware("http")
async def log_api_calls(request, call_next):
    response = await call_next(request)
    try:
        method = request.method
        if method in ("OPTIONS", "HEAD"):
            return response
        path = request.url.path
        if any(path.startswith(p) for p in _LOG_SKIP_PREFIXES):
            return response
        # 只对 /api/* 记录
        if not path.startswith("/api/"):
            return response

        uid = getattr(request.state, "user_id", None)
        uname = getattr(request.state, "username", None)
        ttype = getattr(request.state, "token_type", "anonymous")
        status = response.status_code

        # 匿名 + 401/403:大概率是攻击 / 探测,不记
        if uid is None and status in (401, 403):
            return response

        from services.call_log_service import log_call
        # endpoint 字段:METHOD path,如 "POST /api/qa/ask"
        log_call(uid, uname, ttype, "rest", f"{method} {path}", status_code=status)
    except Exception:
        # 日志失败绝不影响正常请求
        pass
    return response

# 限流：SlowAPI 需绑定到 app.state + 注册 429 处理器
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS:固定到自有域名(2026-05-12 修复:此前 allow_origins=* 与 allow_credentials=True
# 是错误组合,允许任意第三方站点带 Bearer 跨域调 API)
_ALLOWED_ORIGINS = [
    "https://kb.liii.in",
    "https://kb.tokenwave.cloud",
    "http://localhost:5173",  # 本地 vite dev
    "http://localhost:3000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(chunks.router, prefix="/api/chunks", tags=["chunks"])
app.include_router(qa.router, prefix="/api/qa", tags=["qa"])
app.include_router(challenge.router, prefix="/api/challenge", tags=["challenge"])
app.include_router(review.router, prefix="/api/review", tags=["review"])
app.include_router(export.router, prefix="/api/transfer", tags=["transfer"])
app.include_router(agent_settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(admin_invite_codes.router, prefix="/api/admin", tags=["admin"])
app.include_router(admin_bundle_memories.router, prefix="/api/admin", tags=["admin"])
app.include_router(admin_daily_report.router, prefix="/api/admin/daily-report", tags=["admin"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(mcp.router,   prefix="/api/mcp",   tags=["mcp"])
app.include_router(coverage.router, prefix="/api/coverage", tags=["coverage"])
app.include_router(call_logs.router, prefix="/api/call-logs", tags=["call-logs"])
app.include_router(outputs.router, prefix="/api/outputs", tags=["outputs"])
app.include_router(meeting.router, prefix="/api/meeting", tags=["meeting"])
from api.feishu_credentials import router as feishu_creds_router  # 修复 #5:凭证独立路由
app.include_router(feishu_creds_router)
from api.sharedev_credentials import router as sharedev_creds_router  # 2026-05-29:项目实施 sharedev 集成
app.include_router(sharedev_creds_router)
from api.qixin_credentials import router as qixin_creds_router  # 2026-05-29:企信 IM 接入
app.include_router(qixin_creds_router)
from api.qixin import router as qixin_router  # 2026-05-29:企信 IM 消息读取
app.include_router(qixin_router)
from api.implementation import router as implementation_router  # 2026-05-29 Phase 2:单 task 生成 + zip
app.include_router(implementation_router)
app.include_router(template.router, prefix="/api/templates", tags=["templates"])
from api.markup_template import router as markup_template_router
app.include_router(markup_template_router, prefix="/api/markup-templates", tags=["markup-templates"])
app.include_router(output_chats.router, prefix="/api/output-chats", tags=["output-chats"])
from api.public_share import router as public_share_router  # 2026-06-12:交付物免登录只读公开分享
app.include_router(public_share_router, prefix="/api/public", tags=["public-share"])
from api.changelog import public_router as changelog_public_router, admin_router as changelog_admin_router  # 2026-07-03:平台更新日志
app.include_router(changelog_public_router, prefix="/api/public", tags=["public-changelog"])
app.include_router(changelog_admin_router, prefix="/api/admin", tags=["admin-changelog"])
app.include_router(briefs.router, prefix="/api/briefs", tags=["briefs"])
app.include_router(stage_flow.router, prefix="/api/settings", tags=["stage-flow"])
app.include_router(doc_checklist.router, prefix="/api/doc-checklist", tags=["doc-checklist"])
app.include_router(virtual_artifacts.router, prefix="/api/virtual", tags=["virtual-artifacts"])
app.include_router(web_suggest.router, prefix="/api/web-suggest", tags=["web-suggest"])
app.include_router(stakeholder_graph.router, prefix="/api/stakeholder-graph", tags=["stakeholder-graph"])
app.include_router(workflow_canvas.router, prefix="/api/workflow-canvas", tags=["workflow-canvas"])
app.include_router(research.router, prefix="/api/research", tags=["research"])
app.include_router(project_stakeholders.router, prefix="/api/projects/{project_id}/stakeholders", tags=["project-stakeholders"])
app.include_router(project_gates.router, prefix="/api/projects", tags=["project-gates"])  # 2026-07-13 Harness P1:项目闸门
app.include_router(scenes.router, prefix="/api", tags=["scenes"])  # 2026-07-13 Harness P3/P4:标准场景库
app.include_router(scene_ops.router, prefix="/api", tags=["scene-ops"])  # 2026-07-13 Harness P3/P4:命中 + 回流
app.include_router(smart_advice.router, prefix="/api", tags=["smart-advice"])
from api.project_todos import router as project_todos_router  # 项目待办看板(2026-06-08)
app.include_router(project_todos_router, prefix="/api", tags=["project-todos"])


@app.on_event("startup")
async def startup():
    logger.info("Starting KB System...")
    # 自动建表（幂等，生产环境安全）
    from models import Base, engine as db_engine
    from models.document import Document  # noqa: F401 — side-effect import
    from models.chunk import Chunk  # noqa: F401
    from models.challenge import Challenge  # noqa: F401
    from models.review_queue import ReviewQueue  # noqa: F401
    from models.challenge_schedule import ChallengeSchedule  # noqa: F401
    from models.agent_config import AgentConfig  # noqa: F401
    from models.user import User  # noqa: F401
    from models.project import Project  # noqa: F401
    from models.challenge_run import ChallengeRun  # noqa: F401
    from models.qa_log import Conversation, QuestionLog, AnswerFeedback  # noqa: F401
    from models.coverage_gap import CoverageGap  # noqa: F401
    from models.skill import Skill  # noqa: F401
    from models.api_call_log import ApiCallLog  # noqa: F401
    from models.curated_bundle import CuratedBundle  # noqa: F401
    from models.output_conversation import OutputConversation  # noqa: F401
    from models.project_brief import ProjectBrief  # noqa: F401
    from models.challenge_round import ChallengeRound  # noqa: F401
    from models.research_response import ResearchResponse  # noqa: F401
    from models.research_ltc_module_map import ResearchLtcModuleMap  # noqa: F401
    from models.invite_code import InviteCode  # noqa: F401
    from models.captcha_challenge import CaptchaChallenge  # noqa: F401
    from models.project_collaborator import ProjectCollaborator  # noqa: F401
    from models.meeting import Meeting, Requirement  # noqa: F401  会议纪要(2026-05-11 接入)
    from models.meeting_share import MeetingShare  # noqa: F401  会议纪要分享(2026-05-27 接入)
    from models.meeting_live_advice import MeetingLiveAdvice  # noqa: F401  现场调研实时副驾建议(2026-06-22,create_all 建 meeting_live_advice 表)
    from models.template import MeetingTemplate  # noqa: F401  会议纪要模板演化(2026-05-21 接入,create_all 建 meeting_templates 表)
    from models.markup_template import MarkupTemplate  # noqa: F401  会议纪要版面模板(2026-05-28 接入)
    from models.project_stakeholder import ProjectStakeholder  # noqa: F401  项目级干系人资产(2026-05-12)
    from models.project_smart_advice import SmartAdvice  # noqa: F401  项目智能建议(2026-05-15)
    from models.qixin_message import QixinMessage  # noqa: F401  企信 IM 消息(2026-05-29)
    from models.bundle_revision_memory import BundleRevisionMemory  # noqa: F401  修订版学习记忆(2026-06-08)
    from models.project_todo import ProjectTodo  # noqa: F401  项目待办看板(2026-06-08)
    from models.bundle_share import BundleShare  # noqa: F401  交付物公开分享(2026-06-12,create_all 建 bundle_shares 表)
    from models.changelog_entry import ChangelogEntry  # noqa: F401  平台更新日志(2026-07-03,create_all 建 changelog_entries 表)
    from models.project_stage_gate import ProjectStageGate  # noqa: F401  Harness 项目闸门(2026-07-13,create_all 建 project_stage_gates 表)
    from models.scene import StandardScene, SceneChange, SceneHitReport, SceneChangeProposal, AiCapability  # noqa: F401  标准场景库 + 命中 + 回流 + AI能力目录(2026-07-13)
    from sqlalchemy import text
    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # 建索引（幂等）
        for stmt in [
            "CREATE INDEX IF NOT EXISTS idx_chunks_ltc ON chunks(ltc_stage)",
            "CREATE INDEX IF NOT EXISTS idx_chunks_industry ON chunks(industry)",
            "CREATE INDEX IF NOT EXISTS idx_chunks_review ON chunks(review_status)",
            "CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id)",
        ]:
            await conn.execute(text(stmt))
        # 轻量迁移（幂等）：在不破坏老数据的前提下补字段
        for migration in [
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS uploader_id VARCHAR(36) REFERENCES users(id)",
            "CREATE INDEX IF NOT EXISTS idx_documents_uploader ON documents(uploader_id)",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS project_id VARCHAR(36) REFERENCES projects(id)",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_type VARCHAR(40)",
            "CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id)",
            "CREATE INDEX IF NOT EXISTS idx_documents_doctype ON documents(doc_type)",
            "ALTER TABLE chunks ADD COLUMN IF NOT EXISTS batch_id VARCHAR(36)",
            "CREATE INDEX IF NOT EXISTS idx_chunks_batch ON chunks(batch_id)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS mcp_api_key VARCHAR(64) UNIQUE",
            "ALTER TABLE projects ADD COLUMN IF NOT EXISTS industry VARCHAR(200)",
            # Harness P3/P4:项目成员角色分类(2026-07-13,create_all 不给旧表加列)
            "ALTER TABLE project_collaborators ADD COLUMN IF NOT EXISTS project_role VARCHAR(20)",
            # Harness Block5:标准场景结构化内容 + 标签(2026-07-13,给已建的 standard_scenes 补列)
            "ALTER TABLE standard_scenes ADD COLUMN IF NOT EXISTS description TEXT",
            "ALTER TABLE standard_scenes ADD COLUMN IF NOT EXISTS business_rules TEXT",
            "ALTER TABLE standard_scenes ADD COLUMN IF NOT EXISTS process TEXT",
            "ALTER TABLE standard_scenes ADD COLUMN IF NOT EXISTS recommended_fields JSONB DEFAULT '[]'::jsonb",
            "ALTER TABLE standard_scenes ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb",
            # Harness Block6:场景 AI 能力匹配 + 回流提案结构化载荷(2026-07-13)
            "ALTER TABLE standard_scenes ADD COLUMN IF NOT EXISTS ai_capabilities JSONB DEFAULT '[]'::jsonb",
            "ALTER TABLE scene_change_proposals ADD COLUMN IF NOT EXISTS content JSONB DEFAULT '{}'::jsonb",
            # 命中报告记录依据的文档(2026-07-13)
            "ALTER TABLE scene_hit_reports ADD COLUMN IF NOT EXISTS sources JSONB DEFAULT '[]'::jsonb",
            "ALTER TABLE projects ADD COLUMN IF NOT EXISTS customer_profile TEXT",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS industry VARCHAR(200)",
            "CREATE INDEX IF NOT EXISTS idx_documents_industry ON documents(industry)",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS conversion_error TEXT",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS convert_progress VARCHAR(200)",
            "ALTER TABLE challenge_rounds ADD COLUMN IF NOT EXISTS critique_raw TEXT",
            "ALTER TABLE chunks ADD COLUMN IF NOT EXISTS citation_count INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE chunks ADD COLUMN IF NOT EXISTS last_cited_at TIMESTAMP NULL",
            "CREATE INDEX IF NOT EXISTS idx_chunks_citation ON chunks(citation_count DESC, last_cited_at DESC)",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS summary TEXT",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS faq JSON",
            # 会议 Co-pilot:我方建议方案列(2026-06-22,create_all 不会给已存在的表加列)
            "ALTER TABLE meeting_live_advice ADD COLUMN IF NOT EXISTS recommendation TEXT",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS api_enabled BOOLEAN NOT NULL DEFAULT FALSE",
            "UPDATE users SET api_enabled = TRUE WHERE is_admin = TRUE",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS convert_duration_s DOUBLE PRECISION",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS slice_duration_s DOUBLE PRECISION",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS embed_duration_s DOUBLE PRECISION",
            "ALTER TABLE challenge_runs ADD COLUMN IF NOT EXISTS question_mode VARCHAR(20) NOT NULL DEFAULT 'kb_based'",
            "ALTER TABLE challenge_schedules ADD COLUMN IF NOT EXISTS question_mode VARCHAR(20) NOT NULL DEFAULT 'kb_based'",
            # Block 2 · 反馈飞轮
            "ALTER TABLE chunks ADD COLUMN IF NOT EXISTS down_votes INTEGER NOT NULL DEFAULT 0",
            "CREATE INDEX IF NOT EXISTS idx_chunks_down_votes ON chunks(down_votes DESC)",
            # Block C · 对外工作台 /console（角色分流）
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(32) NOT NULL DEFAULT 'console_user'",
            "UPDATE users SET role = 'admin' WHERE is_admin = TRUE AND role = 'console_user'",
            # B1 · 检索闸门
            "ALTER TABLE chunks ADD COLUMN IF NOT EXISTS ltc_stage_confidence DOUBLE PRECISION NULL",
            # N1 · 技能库
            # (skills table created via create_all)
            # N2 · API/MCP 调用日志
            # (api_call_logs table created via create_all)
            # C4 · curated_bundle
            # (curated_bundles table created via create_all)
            # Feature X · 废弃静态题库 → 对话式输出智能体
            "DROP TABLE IF EXISTS project_interview_answers",
            "ALTER TABLE skills DROP COLUMN IF EXISTS questions",
            # 登录安全加固 · 邀请码 + 强密码 + 验证码
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS signed_up_via_invite_code VARCHAR(32)",
            # 文档脱敏:Document.markdown_content_raw + Project.aliases
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS markdown_content_raw TEXT",
            "ALTER TABLE projects ADD COLUMN IF NOT EXISTS aliases JSON",
            # 会议纪要集成:User 级飞书凭证(2026-05-11)
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS feishu_app_id VARCHAR(128)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS feishu_app_secret VARCHAR(255)",
            # 项目实施集成:User 级 sharedev / PaaS 凭证(2026-05-29)
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS sharedev_domain VARCHAR(255)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS sharedev_certificate VARCHAR(512)",
            # 会议纪要模板演化(meeting submodule 098c283):Meeting.edited_minutes
            "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS edited_minutes JSON",
            # 会议纪要 — audio / 飞书 / KB 同步 / 干系人图谱 列补齐
            "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS audio_object_key VARCHAR(512)",
            "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS bitable_app_token VARCHAR(128)",
            "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS action_bitable_app_token VARCHAR(128)",  # 修复 #4:待办看板独立字段
            "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS feishu_url TEXT",
            "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS kb_doc_id VARCHAR(64)",
            "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS kb_url TEXT",
            "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS kb_synced_at TIMESTAMP",
            "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS stakeholder_map JSON",
            "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS stakeholder_kb_doc_id VARCHAR(64)",
            "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS stakeholder_kb_url TEXT",
            "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS stakeholder_kb_synced_at TIMESTAMP",
            "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS process_flows JSON",
            "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS illustrations JSON",
            # 会议需求 — 录音时间戳字段
            "ALTER TABLE meeting_requirements ADD COLUMN IF NOT EXISTS start_seconds FLOAT",
            "ALTER TABLE meeting_requirements ADD COLUMN IF NOT EXISTS end_seconds FLOAT",
            # 2026-05-28:细粒度 routing task 拆分 — 清掉 DB 里旧的粗粒度 key
            # 旧 key 已无代码引用,留着会让 RoutingTab 里多出无意义行
            "DELETE FROM agent_configs WHERE config_type='routing_rules' AND config_key IN "
            "('conversion','daily_qa','doc_generation','slicing_classification',"
            "'slicing_review','slicing_review_lowconf','challenge_questioning','challenge_judging','conversion_refine')",
            "DELETE FROM agent_configs WHERE config_type='task_params' AND config_key IN "
            "('conversion','daily_qa','doc_generation','slicing_classification',"
            "'slicing_review','slicing_review_lowconf','challenge_questioning','challenge_judging','conversion_refine')",
            # 2026-05-28:LLM 调用日志扩字段
            "ALTER TABLE api_call_logs ADD COLUMN IF NOT EXISTS model_name VARCHAR(64)",
            "ALTER TABLE api_call_logs ADD COLUMN IF NOT EXISTS caller_module VARCHAR(128)",
            "ALTER TABLE api_call_logs ADD COLUMN IF NOT EXISTS task VARCHAR(64)",
            "ALTER TABLE api_call_logs ADD COLUMN IF NOT EXISTS input_tokens INTEGER",
            "ALTER TABLE api_call_logs ADD COLUMN IF NOT EXISTS output_tokens INTEGER",
            "ALTER TABLE api_call_logs ADD COLUMN IF NOT EXISTS duration_ms INTEGER",
            "ALTER TABLE api_call_logs ADD COLUMN IF NOT EXISTS error_message TEXT",
            "CREATE INDEX IF NOT EXISTS idx_call_logs_call_type ON api_call_logs(call_type)",
            "CREATE INDEX IF NOT EXISTS idx_call_logs_model ON api_call_logs(model_name)",
            # 企信 IM 接入(2026-05-29):User 级凭证 + 消息表
            # qixin_messages 由 create_all 建;users 表加 3 列;app_id 用 partial unique index
            # (允许多个 NULL,只对已配置用户唯一,防同一 appId 两人配置互踢 Gateway)
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS qixin_app_id VARCHAR(128)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS qixin_app_secret VARCHAR(512)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS qixin_gateway_url VARCHAR(255)",
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_users_qixin_app_id ON users(qixin_app_id) WHERE qixin_app_id IS NOT NULL",
            # 区分群聊 / 私聊(2026-05-29 增量)
            "ALTER TABLE qixin_messages ADD COLUMN IF NOT EXISTS chat_type VARCHAR(16)",
            # 群聊 history_messages 落库去重(2026-05-29 增量)
            "ALTER TABLE qixin_messages ADD COLUMN IF NOT EXISTS gateway_message_id VARCHAR(128)",
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_qixin_msg_gid ON qixin_messages(user_id, gateway_message_id) WHERE gateway_message_id IS NOT NULL",
            # 2026-06-01:四级行业路径 "L1/L2/L3/L4" 最长 54 字符,旧 VARCHAR(50) 装不下,扩到 200。
            # ALTER COLUMN ... TYPE 在 PG 上对 VARCHAR 扩长是 metadata-only,不重写表数据,秒级完成。
            # 注意:qa_log.py 里有 industry 字段的 class 是 Conversation(__tablename__='conversations'),
            #      不是 'qa_logs' — 该模块没有 qa_logs 表(误命名容易踩,这条注释留住)。
            "ALTER TABLE projects ALTER COLUMN industry TYPE VARCHAR(200)",
            "ALTER TABLE documents ALTER COLUMN industry TYPE VARCHAR(200)",
            "ALTER TABLE output_conversations ALTER COLUMN industry TYPE VARCHAR(200)",
            "ALTER TABLE conversations ALTER COLUMN industry TYPE VARCHAR(200)",
            "ALTER TABLE coverage_gaps ALTER COLUMN industry TYPE VARCHAR(200)",
            # 项目待办看板(2026-06-09):blocked_by 自引用 + 索引
            "ALTER TABLE project_todos ADD COLUMN IF NOT EXISTS blocked_by INTEGER REFERENCES project_todos(id) ON DELETE SET NULL",
            "CREATE INDEX IF NOT EXISTS ix_project_todos_due ON project_todos(due_date) WHERE due_date IS NOT NULL",
        ]:
            await conn.execute(text(migration))
    logger.info("DB tables & indexes ready")
    # Seed initial admin (idempotent)
    from services.auth import seed_admin_if_empty
    await seed_admin_if_empty()
    # Seed agent configs from hardcoded defaults (idempotent)
    from services.config_service import config_service
    await config_service.seed_defaults()
    # Seed 标准场景库 + AI 能力目录(Harness,空表才导入 backend/seeds/*.json)
    from api.scenes import seed_scenes_if_empty, seed_ai_capabilities_if_empty
    await seed_scenes_if_empty()
    await seed_ai_capabilities_if_empty()
    # Seed atomic skills (idempotent — 已存在的 name 不覆盖,保留运营手改)
    from services.agentic.skills_seed import seed_atomic_skills, seed_default_skill_associations
    skill_seed_result = await seed_atomic_skills()
    logger.info("atomic_skills_seeded", **skill_seed_result)
    # Wire atomic skills 到 v3 三个 output kind 的默认 skill_ids
    # idempotent:已配过 skill_ids 的 kind 不覆盖,空的填默认,不存在的创建
    assoc_result = await seed_default_skill_associations()
    logger.info("skill_associations_seeded", **assoc_result)
    # Seed meeting markup templates (幂等 - 预置会议纪要版面模板 2026-05-28)
    from models import async_session_maker
    from services.markup_template_seed import seed_markup_templates
    async with async_session_maker() as seed_session:
        try:
            seed_result = await seed_markup_templates(seed_session)
            logger.info("markup_templates_seeded", **seed_result)
        except Exception:
            logger.exception("markup_templates_seed_failed")
    logger.info("atomic_skills_associations_seeded", **assoc_result)
    # Wire config service into model router
    from services.model_router import model_router
    model_router.set_config_service(config_service)
    await vector_store.ensure_collection()
    # 自动创建 MinIO bucket（幂等）
    from minio import Minio
    _mc = Minio(
        settings.minio_endpoint,
        access_key=settings.minio_user,
        secret_key=settings.minio_password,
        secure=False,
    )
    if not _mc.bucket_exists(settings.minio_bucket):
        _mc.make_bucket(settings.minio_bucket)
        logger.info("MinIO bucket created", bucket=settings.minio_bucket)
    else:
        logger.info("MinIO bucket ready", bucket=settings.minio_bucket)
    # 恢复卡死的文档任务（converting/slicing 超过 15 分钟视为任务丢失）
    from datetime import datetime, timedelta, timezone
    from models.document import Document
    from sqlalchemy import select as _select
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=15)
    async with db_engine.connect() as _conn:
        pass  # ensure engine is warm before using session
    from models import async_session_maker as _asm
    async with _asm() as _s:
        _stuck = (await _s.execute(
            _select(Document).where(
                Document.conversion_status.in_(["converting", "slicing"]),
                Document.updated_at < cutoff,
            )
        )).scalars().all()
        for _doc in _stuck:
            _doc.conversion_status = "pending"
        if _stuck:
            await _s.commit()
            from tasks.convert_task import process_document as _pd
            for _doc in _stuck:
                _pd.delay(_doc.id)
            logger.warning("stuck_documents_requeued", count=len(_stuck))
    # 卡死的 bundle 生成任务(2026-06-02):pending/generating 超过 30min 视为丢失。
    # 「默认重启工作」机制 —— 未超重启上限的自动重新派发生成任务(同文档 requeue 思路),
    # 超限才标 failed。复用 tasks.output_tasks 的共享逻辑,与 beat recover_stale_bundles 同源。
    try:
        from tasks.output_tasks import _recover_stale_bundles
        _r = await _recover_stale_bundles()
        if _r.get("restarted") or _r.get("failed"):
            logger.warning("stale_bundles_recovered_at_startup", **_r)
    except Exception:
        logger.exception("stale_bundle_recovery_failed")
    # 企信 IM SSE 连接池启动(2026-05-29):按已配置用户拉长连接
    try:
        from services.qixin_gateway.connection_manager import bootstrap_all as _qixin_boot
        await _qixin_boot()
    except Exception:
        logger.exception("qixin_bootstrap_failed")
    logger.info("Startup complete")


@app.on_event("shutdown")
async def shutdown():
    """优雅停掉企信 SSE 连接(2026-05-29)。"""
    try:
        from services.qixin_gateway.connection_manager import stop_all as _qixin_stop
        await _qixin_stop()
    except Exception:
        logger.exception("qixin_shutdown_failed")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "kb-system"}


@app.get("/health/db")
async def health_db():
    from sqlalchemy import text
    from models import engine  # 使用共享 engine（已配置 ssl=False）
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@app.get("/health/redis")
async def health_redis():
    import redis.asyncio as aioredis
    try:
        r = aioredis.from_url(settings.redis_url)
        await r.ping()
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@app.get("/health/models")
async def health_models():
    from services.model_router import model_router
    results = await model_router.test_connectivity()
    return results


@app.get("/health/worker")
async def health_worker():
    """检测 Celery Worker 存活性"""
    from tasks.convert_task import celery_app
    try:
        inspect = celery_app.control.inspect()
        active = inspect.active()
        if active is None:
            return {"status": "error", "message": "No active workers found"}
        return {
            "status": "ok",
            "active_workers": list(active.keys()),
            "stats": inspect.stats()
        }
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@app.get("/api/stats")
async def stats(_user=Depends(get_current_user)):
    """整库统计:文档/切片数、行业分布、类型分布。
    2026-05-12:加鉴权(此前公网可看,属轻量侦察面)。
    """
    from services.vector_store import vector_store
    from models.document import Document
    from models.chunk import Chunk
    from models import async_session_maker
    from models.project import DOC_TYPE_LABELS
    from prompts.ltc_taxonomy import INDUSTRY_TAGS
    from sqlalchemy import select, func, text

    async with async_session_maker() as session:
        doc_count = await session.scalar(select(func.count()).select_from(Document))
        chunk_count = await session.scalar(select(func.count()).select_from(Chunk))
        status_res = await session.execute(text("SELECT conversion_status, count(*) FROM documents GROUP BY conversion_status"))
        status_map = {r[0]: r[1] for r in status_res}

        # 行业维度：文档数 + 切片数（切片 industry 通过 Document.industry join 统计）
        industry_docs_res = await session.execute(text(
            "SELECT COALESCE(industry, 'unknown') AS k, COUNT(*) FROM documents GROUP BY k"
        ))
        industry_docs = {r[0]: r[1] for r in industry_docs_res}
        industry_chunks_res = await session.execute(text(
            "SELECT COALESCE(d.industry, 'unknown') AS k, COUNT(c.id) "
            "FROM chunks c LEFT JOIN documents d ON c.document_id = d.id GROUP BY k"
        ))
        industry_chunks = {r[0]: r[1] for r in industry_chunks_res}
        industry_keys = sorted(set(industry_docs) | set(industry_chunks))
        industry_distribution = [
            {
                "key": k,
                "label": INDUSTRY_TAGS.get(k, "未指定" if k == "unknown" else k),
                "documents": industry_docs.get(k, 0),
                "chunks": industry_chunks.get(k, 0),
            }
            for k in industry_keys
        ]

        # 文档类型分布
        doctype_res = await session.execute(text(
            "SELECT COALESCE(doc_type, 'unknown') AS k, COUNT(*) FROM documents GROUP BY k"
        ))
        doctype_distribution = [
            {
                "key": r[0],
                "label": DOC_TYPE_LABELS.get(r[0], "未指定" if r[0] == "unknown" else r[0]),
                "documents": r[1],
            }
            for r in doctype_res
        ]

    qdrant_info = await vector_store.collection_info()

    return {
        "documents": doc_count,
        "chunks": chunk_count,
        "vectors": qdrant_info.get("vectors_count", 0),
        "status_distribution": status_map,
        "industry_distribution": industry_distribution,
        "doctype_distribution": doctype_distribution,
    }


@app.get("/health/test_redis")
async def test_redis():
    import redis.asyncio as aioredis
    import uuid
    try:
        r = aioredis.from_url(settings.redis_url)
        test_key = f"diag:{uuid.uuid4()}"
        await r.set(test_key, "working", ex=10)
        val = await r.get(test_key)
        return {"status": "ok", "test_key": test_key, "value": val}
    except Exception as e:
        return {"status": "error", "detail": str(e)}
