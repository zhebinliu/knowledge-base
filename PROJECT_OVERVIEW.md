# KB System 项目全景图

> 本文档目标:**新一次 session 开始时只读这一份**,就能掌握架构 / 数据流 / 关键文件 / 决策依据,不必从零扫代码。
>
> 最后更新:2026-06-04(kind 13 个,新增 redesign/ 暗色 UI 体系)
>
> 与其他指导文件分工:
> - [CLAUDE.md](CLAUDE.md) — 当前项目的"硬性规范"(部署 / 命令 / 不要做什么)
> - [LEARNING.md](LEARNING.md) — 累计踩坑笔记(具体陷阱 + 真因)
> - **本文** — 架构全景与决策依据(为什么这样设计 / 数据怎么流)

---

## 1. 一句话定义

KB System 是 **纷享销客 CRM 实施咨询师** 的内部知识库 + 项目工作台 + AI 输出工具。功能上做三件事:

1. **知识库**:文档上传 → 切片 → 向量化 → 检索式问答(RAG)
2. **项目工作台**:对每个客户项目,沿 LTC(Lead-to-Cash)全链路提供文档管理 / 调研 / 洞察 / 方案设计 / 实施 / 测试 / 验收的全套工具,会议纪要、企信 IM 通讯都拉到了同一工作台
3. **AI 输出**:基于 brief + 文档 + KB + 联网检索 + 会议纪要,自动生成 **13 个 kind** 的产物 —— 启动会 PPT / 洞察报告 / 调研大纲 / 调研计划(客户版) / 调研问卷 / 调研报告 / 蓝图设计 / 对象字段表 / 流程建设表 / 实施任务清单 / 测试计划 / 项目验收报告(其中实施任务清单的每条 task 还能再单独生成 sharedev `tenant-config/*.xml`)

---

## 2. 技术栈与运行时

| 层 | 技术 |
|----|------|
| 前端 | React 18 + TypeScript + Vite + TailwindCSS + TanStack Query + react-router-dom |
| 后端 | Python 3.11 + FastAPI 0.115 + SQLAlchemy 2.0 (async) + asyncpg |
| Worker | Celery 5.4 + Redis broker |
| 向量库 | Qdrant 1.12 |
| 关系库 | PostgreSQL 16 |
| 对象存储 | MinIO 7.2(S3 协议) |
| 部署 | Docker Compose,GCP `34.67.136.67` 单机 |
| 团队看板 | Plane v1.3.1,独立 compose `/opt/kanban` |
| 域名 | `kb.liii.in` / `kb.tokenwave.cloud` / `uat.tokenwave.cloud` / `skillhub.tokenwave.cloud` / `aihub.tokenwave.cloud` / `kanban.tokenwave.cloud`(同 IP,各自证书) |

主栈容器清单(10 个):`frontend`(443 入口,持多域名证书 + 反代 uat/skillhub/aihub/kanban) `frontend-uat` `backend` `celery_worker` `postgres` `qdrant` `redis` `minio` `skillhub-backend`(:8001 内网) `skillhub-frontend`(:80 内网)。

`kanban.tokenwave.cloud` 是独立 Plane 栈:`/opt/kanban/docker-compose.yml` 启动 `web/api/worker/beat-worker/migrator/admin/space/live/plane-db/plane-redis/plane-mq/plane-minio/proxy`。主 `frontend` nginx 持 HTTPS 证书,反代到 Plane 自带 Caddy `plane-proxy:80`(external network `kb-system_default` 别名),不要再指向旧的 `planka:1337`。

> **前端双 UI 体系**:经典 UI(`pages/` + `components/`)+ 暗色重构版(`redesign/`,2026-06)共存。路由层根据 `/redesign/*` 前缀分流。

---

## 3. 架构总览

```
                 ┌─────────────────────────────────────┐
                 │    nginx (443) — frontend container  │
                 │    /api/* → reverse proxy to backend │
                 └──────────────┬──────────────────────┘
                                │
              ┌─────────────────┼──────────────────┐
              │                 │                  │
        ┌─────▼────┐      ┌─────▼─────┐     ┌─────▼─────┐
        │ FastAPI  │      │  Celery   │     │  MinIO    │
        │ backend  │◄────►│  worker   │     │  (S3)     │
        └─────┬────┘      └─────┬─────┘     └───────────┘
              │                 │
        ┌─────┼──────────┬──────┴──────┐
        │     │          │             │
   ┌────▼─┐ ┌─▼────┐ ┌───▼────┐  ┌────▼────┐
   │PG db │ │Redis │ │Qdrant  │  │ MinIO   │
   │      │ │broker│ │vectors │  │ (alt)   │
   └──────┘ └──────┘ └────────┘  └─────────┘
```

**关键流向:**

- **文档上传**:用户 → nginx → backend `/api/documents` → 落 MinIO(原文)+ PG(metadata)+ Celery 任务排队
- **文档处理(异步)**:celery_worker 拉任务 → PyMuPDF/python-docx 抽文本 → LLM 切片 → 写 PG `chunks` 表 + Qdrant 向量
- **RAG 问答**:用户提问 → backend `/api/qa/ask` → Qdrant 检索 + rerank → LLM 生成 → 返回答案 + 引用
- **agentic 生成(insight / survey / survey_outline)**:用户点"开始生成" → backend 入 bundle 记录 → Celery `generate_insight` 等任务 → `services/agentic/runner.py` 跑 Plan → Execute → Critic → Challenger 流水线 → 写 markdown + 引用 metadata 到 bundle

---

## 4. 后端目录速览(`backend/`)

### `api/` — FastAPI 路由(每个文件一组路由,在 `main.py` 里 `include_router` 注册)

| 文件 | 路由前缀 | 职责 |
|------|---------|------|
| `auth.py` | `/api/auth` | 登录 / 注册 / JWT |
| `users.py` | `/api/users` | 用户管理(管理员) |
| `documents.py` | `/api/documents` | 文档上传 / 列表 / 删除 / markdown 预览 |
| `chunks.py` | `/api/chunks` | 知识切片管理 / 编辑 / 重审 |
| `review.py` | `/api/review` | 切片审核队列(挑战流程) |
| `qa.py` | `/api/qa` | RAG 问答(同步 + 流式) |
| `mcp.py` | `/api/mcp` | MCP Streamable HTTP server(对外 AI 工具调用) |
| `projects.py` | `/api/projects` | 项目 CRUD + insight-checkup |
| `outputs.py` | `/api/outputs` | 产物生成入口(`POST /generate`) + bundle CRUD |
| `output_chats.py` | `/api/output-chats` | 对话式生成(只剩 kickoff_pptx / kickoff_html) |
| `briefs.py` | `/api/briefs` | Brief 字段 LLM 抽取 + 编辑保存 |
| `stage_flow.py` | `/api/settings/stage-flow` | 项目阶段栏动态配置 |
| `research.py` | `/api/research` | 调研答案录入 + LTC 字典 |
| `virtual_artifacts.py` | `/api/virtual` | 虚拟物(干系人图谱 / 成功度量表 / 引导问卷) |
| `doc_checklist.py` | `/api/doc-checklist` | 文档清单(必传 / 推荐) |
| `web_suggest.py` | `/api/web-suggest` | GapFiller 用 web 检索建议 |
| `coverage.py` | `/api/coverage` | KB 覆盖度评估 |
| `meeting.py` | `/api/meeting` | 会议纪要(已上线,纪要 / 需求 / 干系人 / 转写 全部可编辑) |
| `call_logs.py` | `/api/call-logs` | API 调用日志(管理员可见) |
| `agent_settings.py` | `/api/settings` | LLM 模型 / 路由 / 任务参数 / prompts / skills / output_agents 配置 |
| `challenge.py` | `/api/challenge` | KB 知识切片对抗式审核 |
| `stakeholder_graph.py` | `/api/stakeholder-graph` | 干系人图谱编辑 |
| `project_stakeholders.py` | `/api/projects/{id}/stakeholders` | 项目级干系人 CRUD + `sync-from-meeting` 合并 |
| `smart_advice.py` | `/api/projects/{id}/smart-advice` | 项目智能建议(综合 brief / outputs / docs → LLM,懒生成 + 标 stale) |
| `export.py` | `/api/transfer` | 数据导出 |
| `admin_invite_codes.py` | `/api/admin/invite-codes` | 邀请码 CRUD(管理员;配合 captcha 用) |
| `feishu_credentials.py` | `/api/feishu` | 飞书 App Secret 凭证(Fernet 加密入库,见 `services/feishu_crypto.py`) |
| `qixin_credentials.py` | `/api/qixin/credentials` 等 | 企信 Bot 凭证(per-user) |
| `qixin.py` | `/api/qixin` | 企信 IM 会话 + 消息(只读 + 手动发,Phase 1) |
| `sharedev_credentials.py` | `/api/sharedev` | sharedev sidecar 凭证(Phase 2 接) |
| `implementation.py` | `/api/implementation` | 单 task → tenant-config xml/Groovy 生成 + zip 下载 |
| `template.py` | `/api/templates` | 会议纪要 模板(`meeting_templates`,2026-05-21) |
| `markup_template.py` | `/api/markup-templates` | 会议纪要 版面模板(`markup_templates`,2026-05-28) |

### `services/` — 业务逻辑

| 文件 | 职责 |
|------|------|
| `auth.py` | JWT / 密码哈希 / 鉴权依赖项 |
| `vector_store.py` | Qdrant client 封装 |
| `embedding_service.py` | 嵌入向量生成(qwen3 / 其他模型) |
| `rerank_service.py` | RAG 检索后 rerank |
| `web_search_service.py` | 联网检索抽象(支持多 provider) |
| `model_router.py` | 任务级 LLM 路由(insight 用 opus / qa 用 qwen 等) |
| `rate_limit.py` | API 调用 rate limit |
| `output_service.py` | 启动会 PPT(pptxgen / html)生成主体 |
| `brief_service.py` | Brief schema 定义 + LLM 抽取 |
| `coverage_service.py` | KB 覆盖度计算 |
| `call_log_service.py` | 调用日志写入 |
| `config_service.py` | 配置读写抽象 |
| `pptx_codeexec.py` | LLM 生成的 python-pptx 脚本沙箱执行 |
| `project_acl.py` | 统一 project 端点的权限校验(read / write / owner_only) |
| `redactor.py` | 文档脱敏 — 双字段保留(markdown_content_raw + 脱敏后 markdown_content) |
| `smart_advice.py` | 项目智能建议 LLM 生成 + cache(inputs_hash + 懒生成 + mark_stale) |
| `llm_json.py` | LLM JSON 健壮解析共用 — strip 围栏 / 去注释 / 去尾随逗号 / 平衡括号 |
| `feishu_crypto.py` | 飞书 App Secret 加解密(Fernet,key 从 Settings.fernet_key) |
| `_time.py` | 统一 naive UTC datetime 工具(收敛各文件自定义的 `_utcnow`) |
| `markup_template_seed.py` | 预置会议纪要版面模板种子(startup 幂等) |
| `security/captcha.py` `security/invite_code.py` `security/password_policy.py` | 注册 / 登录的图形验证码 / 邀请码 / 密码强度策略 |
| `qixin_gateway/` | 企信 IM SSE 客户端 + 每用户连接池(`sse_client.py` + `connection_manager.py`,主进程 lifespan 起停) |
| `sharedev/skill_loader.py` | 加载 `prompts/sharedev/skills/*` 的 SKILL.md + references + assets,拼 LLM system prompt(17 个 skill) |

### `services/agentic/` — agentic 生成流水线

两条路径:**v2 多模块流水线**(insight / survey / survey_outline)和 **单次大调用流水线**(research_plan / research_report / blueprint_design / object_field_layout / process_setup / implementation_plan / test_plan / acceptance_report)。

```
┌─────────────────────────────────────────────────────────────┐
│ A. v2 多模块流水线(planner → executor → critic → challenger)│
│   runner.generate_insight / generate_survey /               │
│           generate_survey_outline (Celery task entry)       │
│                            │                                │
│      ┌─────────────────────┼─────────────────────┐         │
│      ▼                     ▼                     ▼         │
│  planner.py           executor.py           critic.py       │
│  (拆模块 + 决定         (逐模块写)        (单模块四要素打分) │
│   信息源 + 评估         读 brief / docs   if needs_rework→   │
│   是否能写)            / KB / web         触发当前模块重写)  │
│                            │                                │
│                            ▼                                │
│                     challenger.py                           │
│                  (整文 6 维度对抗式)                         │
│                  if major_issues → 全文重生成                │
│                                                             │
│  insight_modules.py / outline_modules.py / survey_modules.py│
│  (10 / 7 / N 个模块的声明式 spec — FieldSpec + prompt)      │
│  industry_packs/ — 行业 pack(智能制造等),注入行业默认数据  │
│  skills_seed.py — 12 条原子 skill 库 + 默认关联             │
│                                                             │
│ B. 单次 Opus 大调用流水线(research/ 下的 8 个 generator)    │
│   runner.generate_research_plan / generate_research_report /  │
│         generate_blueprint_design /                            │
│         generate_object_field_layout / generate_process_setup /  │
│         generate_implementation_plan / generate_test_plan /      │
│         generate_acceptance_report                          │
│   读「前序 bundle + 项目素材」→ 一次大调用 → 出 markdown    │
│   + 结构化 extra(tasks JSON 等)。不走 planner-critic-     │
│   challenger,因为产物章节结构性强、上下文压缩比例已经够高。   │
│                                                             │
│  research/blueprint_generator.py — 蓝图设计(7 章)         │
│  research/object_field_layout_generator.py — 对象字段表    │
│  research/process_setup_generator.py — 流程建设表          │
│  research/implementation_plan_generator.py — 实施任务清单   │
│       (markdown + tasks JSON,每条 task 关联 sharedev skill)│
│  research/sharedev_config_generator.py — 单 task → xml/Groovy │
│  research/test_plan_generator.py — 测试计划(5 章)         │
│  research/acceptance_report_generator.py — 项目验收(5 章)  │
│  research/report_generator.py — 调研报告                   │
│  research/plan_generator.py — 调研计划(客户版,2026-06 加) │
│                                                             │
│  research/ 公共件:questionnaire_schema / scope_classifier /│
│  meeting_autofill / sow_mapper / best_practice_advisor /    │
│  best_practices / kb_filter / follow_up / ltc_dictionary /  │
│  questionnaire_export / single_q_regenerator /              │
│  session_questionnaire / outline_sessions_extractor         │
└─────────────────────────────────────────────────────────────┘
```

### `models/` — SQLAlchemy 模型

**核心**:
- `user` / `project` / `document` / `chunk`(基础对象)
- `curated_bundle` — 产物记录(kind 见 § 6.8,12 个)
- `project_brief` — 项目 Brief 字段(按 output_kind 唯一)
- `output_conversation` — 对话式生成历史
- `agent_config` — agent 配置(`agent_configs` 表,UniqueConstraint(config_type, config_key))

**辅助**:
- `qa_log` `api_call_log` — 调用日志。注意 `qa_log` model 仍叫这名,但 **DB 表已重命名为 `conversations`**(2026-06-01,`eefc941`)
- `review_queue` — 切片审核队列
- `challenge` `challenge_run` `challenge_round` `challenge_schedule` — 挑战机制
- `coverage_gap` — KB 覆盖度缺口
- `skill` — skill 库
- `research_response` `research_ltc_module_map` — 调研录入
- `project_collaborator` — 项目协作者(owner / read_write / read,§ 6.10 会议详情走这个)
- `project_stakeholder` — 项目级干系人资产(供跨会议合并 + 全局编辑)
- `project_smart_advice` — 项目智能建议 cache(inputs_hash + LLM 生成结果 + is_stale)
- `invite_code` — 注册邀请码
- `captcha_challenge` — 图形验证码一次性消费记录
- `qixin_message` — 企信 IM 收到的消息(per-user 过滤,见 § 6.10)
- `meeting_template` / `markup_template` — 会议纪要模板 / 版面模板(2026-05-21 / 2026-05-28)
- `meeting_share` — 会议纪要分享记录(2026-05-27)
- 会议域:`meeting` / `meeting_stakeholder` / `meeting_requirement` 等在 `meeting/backend/models/` 下,Docker overlay 后路径一致

### `tasks/` — Celery 任务

`output_tasks.py` 当前 13 个产物生成 task + 2 个运维 task:
- v2 多模块流水线:`generate_insight` / `generate_survey` / `generate_survey_outline` / `generate_survey_role`(按角色增量,2026-06-03) / `generate_survey_session`(按场次增量)
- 单次大调用流水线:`generate_research_plan` / `generate_research_report` / `generate_blueprint_design` / `generate_object_field_layout`(soft 1800s) / `generate_process_setup`(soft 1800s) / `generate_implementation_plan` / `generate_test_plan` / `generate_acceptance_report`
- 启动会:`generate_kickoff_pptx` / `generate_kickoff_html`(走 `services/output_service`),其中 insight 完成后通过 `_chain_kickoff_pptx_after_insight` 自动连带生成(2026-06-03)
- 运维:`recover_stale_bundles`(beat 每 300s + 启动跑一次,自动重启 ≥ 30min 无更新的卡死 bundle,最多 3 次)

`convert_task.py` — 文档转写 / 切片 / 嵌入 / Qdrant 写入(异步) + redactor 脱敏。`_kind_to_task()` 是 kind → task 的反查表,跟 `outputs.py` 的 `KIND_TO_TASK`(13 个)必须一一对齐。

### `prompts/` — 提示词模板(可在 /system-config 编辑覆盖)

包含:`challenge` / `conversion` / `ltc_taxonomy` / `qa` / `slicing` 五大类。

### `scripts/`(后端目录里)— 一次性运维脚本

- `backfill_qdrant_payload.py` — 一次性回填 Qdrant payload
- `migrate_v3_rename.py` — v3 命名归一迁移(2026-05-02)

### 项目根 `scripts/` — 部署 / 初始化脚本(CI 用)

- `bootstrap.py` `init_db.py` `init_qdrant.py` `init_minio.py` — 首次部署初始化(GitHub Actions deploy.yml 调用)
- `sync-dev.sh` — 本地 fswatch + rsync 同步到 GCP
- `init-ssl.sh` `renew-ssl.sh` — Let's Encrypt 证书

---

## 5. 前端目录速览(`frontend/src/`)

### `pages/` — 顶层路由页

**普通用户**:
- `Dashboard` — 总览
- `Documents` `Chunks` — 文档 / 切片管理
- `QA` — 知识问答
- `Projects` / `ProjectDetail` — 项目列表 / 详情(老版,准备退役)
- `Review` — 切片审核
- `Challenge` / `ChallengeHistory` — 知识挑战
- `Settings` `SystemConfig` `PersonalSettings` `ChangePassword` — 设置(管理员 + 个人)
- `InviteCodes` — 邀请码管理(管理员)

**对外门户**:
- `Login` `Register`

**元页面(无须登录)**:
- `Demo` + `demo/InsightDemo` `demo/SurveyDemo` `demo/OutlineDemo` — 产品走查演示
- `DemoPPT` + `demo-ppt/` — 启动会 PPT 在线演示(23 slides + 编辑 overlay)
- `DesignSystem` (`/ds`) — 设计规范
- `ApiDocs` (`/api`) — API 文档
- `Help` (`/help`) — 用户操作手册

**新工作台(`console/*`)** — v3 主战场:
- `ConsoleHome` — 工作台首页
- `ConsoleProjects` — 项目列表
- `ConsoleProjectDetail` — **项目详情**(三栏工作区,近 1200 行,核心)
- `ConsoleQA` — 知识问答(对外简化版)
- `ConsoleMeeting` — 会议纪要(disabled,即将上线)

### `components/` — 复用组件

**通用**:`MarkdownView` `OutputChatPanel` `BriefDrawer` `AgenticGapFiller`(原 V2GapFiller) `DeleteProjectControl` `IndustryCascadePicker` `Toaster` `UploadOptionsModal`

**`components/markdown/`** — 新建于 2026-06-02:
- `ReportMarkdown` — **全项目唯一的报告 markdown 渲染核心**。把 7 处分散写法收敛到一处:`cleanReportMarkdown`(strip SECTION marker + 修表格分隔行列数 + 裸 mermaid 提升)、mermaid → SVG、`[x](#cite-mod-ref)` chip。**主题不收敛**,各调用方仍用自己的 `components`/`className` 保留样式

**`components/console/`** — 工作台专用组件:
- `CenterWorkspace` — 中栏(多种 view 形态,蓝图 / 对象字段 / 流程建设各自独立 workspace)
- `CitationsPanel` — 右栏引用面板
- `CitedReportView` — 报告 + mermaid 真渲染 + 蓝图引用跳证据(2026-06-01 接 mermaid)
- `FloatingChat` / `FloatingQA` — 浮动 PM 问答
- `GenerationProgressCard` — 生成进度卡(2026-06-01 升级:实时进度 + 阶段时间线 + 已耗时)
- `ChallengeRoundsPanel` — 挑战回合卡
- `StakeholderCanvas` — 干系人图谱画布
- `ProjectStakeholdersDrawer` — 项目级干系人 Drawer(改名 → 跨该项目所有 meeting 同步)
- `ProjectMeetingsDrawer` — 项目卡片「关联会议」入口(2026-06-02)
- `CollaboratorsModal` — 协作者管理
- `MarkdownEditor` — 在线编辑(纪要 / 需求 / 转写)
- `SmartAdviceBanner` — 顶部智能建议条
- `DocChecklist` — 文档清单
- `research/ResearchWorkspace` — 调研工作区(原 ResearchV1Workspace),调研问卷按角色逐步生成
- `research/ResearchQuestionnaire` — 顾问勾选式问卷
- `implementation/ImplementationWorkspace` — **项目实施工作台**(2026-05-29):三栏(左 task 清单按 sharedev skill 分组 / 中 task 详情 + 报告 / 右 凭证+部署面板);Phase 2 起单 task 可生成 xml/Groovy + 下载 tenant-config zip

**`components/qixin/`** — 新建于 2026-05-29:
- `QixinDrawer` — 全局企信 IM 侧抽屉。右下浮动按钮 + 400px 抽屉(左会话列表 / 右消息流),5s 轮询拉新;挂在 `/console` 和 `/redesign/console` 两边,未配置凭证引导去 `/personal-settings`

**`components/settings/`** — 系统设置 Tab(管理员 + 个人设置):
- 新增 `QixinTab` `ShareDevTab`(分别配企信 Bot 凭证和 sharedev sidecar 凭证)
- 飞书 / 邀请码等也都在这里

**`components/system-config/`** — Stage Flow 编辑器等(支持新的 sub_kinds 形态)

### `api/client.ts`

axios 实例 + 全部后端 API 的 TypeScript 函数封装 + 类型定义(`OutputKind` / `CuratedBundle` / `Project` 等)。**所有跨页面 API 调用从这一个文件出**,新加端点必须在这里 export。

### `layouts/`

- `Layout.tsx` — 内部管理界面(/dashboard, /documents 等)
- `ConsoleLayout.tsx` — 对外工作台界面(/console/*)

### `redesign/` — 暗色重构版 UI(2026-06 新增)

> 与经典 `pages/` + `components/` 并行的第二套前端,路由走 `/redesign/*`。采用暗色主题 + 动效组件(`GlowCard` / `MeshOrb` / `StreamingText` 等)。核心功能与经典 UI 对等,但视觉/交互完全重写。

**顶层页面**(直接在 `redesign/` 下):
- `RedesignShell.tsx` — 入口壳(路由分发 + 全局状态)
- `Layout.tsx` — 暗色主题 Layout
- `Projects.tsx` / `ProjectDetail.tsx` / `QA.tsx` / `ChallengeHistory.tsx` / `Review.tsx` / `Settings.tsx` / `SystemConfig.tsx` / `PersonalSettings.tsx`
- `AgenticGapFiller.tsx` — 暗色版 GapFiller

**`redesign/console/`** — 暗色版工作台(对等经典 `components/console/`):
- `ConsoleLayout.tsx` / `ConsoleHome.tsx` / `ConsoleProjects.tsx` — 控制台框架
- `ConsoleProjectDetail.tsx` — **核心页面,86KB**,三栏工作区暗色重写
- `CenterWorkspace.tsx` — 中栏(49KB,所有产物 view 形态)
- `BriefDrawer.tsx` / `DocChecklist.tsx` / `CitationsPanel.tsx` — 面板组件
- `GenerationProgressCard.tsx` / `ChallengeRoundsPanel.tsx` — 进度/挑战
- `CollaboratorsModal.tsx` / `ProjectMeetingsDrawer.tsx` / `ProjectStakeholdersDrawer.tsx` — 协作
- `FloatingChat.tsx` / `OutputChatPanel.tsx` — 对话式交互
- `GlobalSearchModal.tsx` — **全局搜索**(暗色版新增能力)
- `InsightReportDark.tsx` — 洞察报告暗色专用渲染
- `research/` — 调研工作区(暗色版)

**`redesign/pages/`** — 暗色版元页面:
- `Dashboard.tsx` / `Documents.tsx` / `Projects.tsx` / `QA.tsx` — 管理页
- `Insight.tsx` / `Survey.tsx` — 产物演示页
- `ConsoleHome.tsx` — 工作台首页

**`redesign/components/`** — 暗色通用组件:
- `CountUp.tsx` / `GlowButton.tsx` / `GlowCard.tsx` / `MeshOrb.tsx` / `PillSelect.tsx` / `StaggerList.tsx` / `StreamingText.tsx`

---

## 5.5 桌面 App(`desktop/`)

Electron 7.x 壳子,本质上是 BrowserWindow 加载 `https://kb.liii.in`。**不内置后端,不存本地数据,网络断了就用不了。** 提供独立窗口图标、外链走系统浏览器、Dock/任务栏入口。

| 文件 | 作用 |
|----|----|
| `src/index.ts` | 主进程:创建 1440×900 窗口,`loadURL('https://kb.liii.in')`,外链 host 不同则 `shell.openExternal` |
| `forge.config.ts` | electron-forge 配置:`appBundleId: in.liii.kb`,macOS 出 `.dmg`+`.zip`,Windows 出 squirrel `.exe`,Linux 出 `.deb`+`.rpm` |
| `icons/icon.{icns,ico,png}` | 多平台图标,从 `frontend/public/logo.png` 用 `electron-icon-builder` 生成 |
| `.github/workflows/desktop-build.yml`(根) | 双 runner(macos-latest + windows-latest)出包,tag `desktop-v*` 推送时建 Release |

**关键命令**(在 `desktop/` 下):
- `npm start` — 本地开发,弹窗加载远程站点
- `npm run package` — 出 `.app` 但不打安装器(`out/纷享 KB-darwin-arm64/`)
- `npm run make` — 出完整安装器(`out/make/*.dmg`、`out/make/zip/...`)

**未签名**:macOS 第一次打开要"右键 → 打开"绕 Gatekeeper;Windows 会弹 SmartScreen 警告。后续需要分发给客户再考虑买证书。

---

## 6. 关键产品决策(已确认,勿轻易回退)

### 6.1 项目洞察走文档驱动,不走切片召回(2026-04-29)

`services/agentic/executor.py` 的 `_build_sources_index` 默认 `max_chars_per_doc=30000`,核心文档(SOW / 方案 / 合同 / 交接单)整篇喂给 LLM,不切片。原因:这类文档中关键条款是绑定的,切片会丢上下文。详见 [CLAUDE.md](CLAUDE.md)。

### 6.2 v3 命名归一(2026-05-02)

代码 / DB / 用户感知层全部统一:`insight` / `survey` / `survey_outline`(无后缀)。旧 conversational `insight` / `survey` 已下线归档。`agentic_version='v2'` DB 字段保留(是生成器架构版本标记,不是用户层版本)。详见 [LEARNING.md § 5.1](LEARNING.md)。

### 6.3 Critic + Challenger 双层评审

agentic 生成流水线必须过两道审:
- **Critic**(单模块):4 维度(Specificity / Evidence / Timeliness / Next Step),任一 < 3 → 当模块 needs_rework 重写
- **Challenger**(整文,6 维度,2026-04 已下线 timeliness):specificity / evidence / next_step / completeness / consistency / jargon,verdict=major_issues → 全文重生成

**意义**:把同行评审 / 反方辩护内化为系统能力,产物质量明显高于裸 LLM 输出。代价是慢(2-5 分钟/份)。

### 6.4 顾问勾选式录入,不发问卷给客户填(2026-04)

需求调研工作流是 **顾问主导引导式访谈 + 当场屏上勾选**,不是发问卷给客户填字。系统按 LTC 流程出大纲 + 6 题型问卷,选项池预填,顾问只点选不打字。详见 [skills_seed.py](backend/services/agentic/skills_seed.py) 的「调研问卷 6 题型规范」。

### 6.5 三栏工作区 = 项目详情页主形态

左文档清单 / 中工作区(报告 / 预览 / GapFiller / 虚拟物画布)/ 右引用面板。`ConsoleProjectDetail` 是核心容器,通过 `centerView` state 在 6 种形态间切换。详见 [/ds 的 V3 Composed Components 段](frontend/src/pages/DesignSystem.tsx)。

### 6.6 Skill 库 = 6 大能力域 × N 条原子 skill

灵感来源 uxcel skill graph 2.0。当前 12 条 skill 分布在:业务洞察 / 领域知识 / 调研发现 / 输出表达 / 证据引用 / 质量评审。完整 roadmap 见 [skills_roadmap.md](backend/services/agentic/skills_roadmap.md)。

### 6.7 Stage Flow 动态配置

项目阶段栏(insight / kickoff / survey / 等)由 `agent_configs(config_type='stage_flow')` 配置,管理员通过 `/api/settings/stage-flow` 改,前端实时拉。代码层有 `DEFAULT_STAGES` 兜底。

### 6.9 会议模块全链路(2026-05-12 完成)

> 📦 **代码组织**:会议模块代码在 `meeting/` 子目录,Dockerfile 用 `COPY meeting/backend/` overlay 把它落到镜像里的原路径 —— **Python / TS 的 import 路径与主仓一致**,详见 [§ 12 Meeting 模块 overlay 布局](#12-meeting-模块-overlay-布局)。(历史:2026-05-19 曾抽出为独立仓的 git submodule,2026-05-25 合并回主仓)

`meeting/backend/api/meeting.py` + `meeting/backend/services/meeting/` + `meeting/frontend/src/redesign/console/ConsoleMeetingDetail.tsx`,以下能力**已上线**:

| 能力 | 实现 |
|---|---|
| **音频上传 → 切片 ASR** | mp3/m4a → pydub/ffmpeg 转 16kHz PCM → 切 20s/片 → `asyncio.Semaphore(8)` 并发调 xiaomi mimo-v2-omni → on_chunk 回调增量写 `done_chunks/raw_transcript` → 前端轮询展示流式进度条 + 转写预览 |
| **实时录音** | **浏览器 MediaRecorder 录音 → 停止后上传 → 后端走同一 ASR 链路**(2026-06-02,`634896d`)。**不是逐字实时转写,但多人质量稳。** 弃用此前的 Web Speech 路线(单人听写引擎,多人会议挂)。Hook 是 `meeting/frontend/src/hooks/useMediaRecorder.ts` |
| **纪要生成失败显式标 failed** | LLM JSON 解析失败 → bundle.status='failed' + 显示「失败→重新生成」(方案 A,2026-06-02 `ab8b3d`)。JSON 解析改用 `services/llm_json.py::loads_lenient`(吃尾随逗号 / 围栏 / 注释,见 `259d82d`) |
| **AI pipeline** | polish(润色)→ minutes / requirements / stakeholders 并发(`services/meeting/pipeline.py`)|
| **纪要 schema 模板对齐** | 12 字段(7 元信息 + summary + attendees + key_points + decisions + action_items + unresolved),对齐「02003 纷享销客实施纪要模板」|
| **docx 导出** | `services/meeting/docx_export.py` 用 python-docx 套模板 + 切片填空,GET `/api/meeting/{id}/export-docx`|
| **在线编辑(全输出物)** | 纪要(MetaCell 元信息 + summary + key_points/decisions/action_items/unresolved 增删改)/ 需求(行级 PATCH + 新增/删除)/ 干系人卡片(姓名+昵称+角色+立场+组织+职责+关键观点)/ 转写(双栏 textarea) |
| **改名同步** | 干系人改名 → `POST /api/meeting/{id}/stakeholders/rename` 全字匹配替换 minutes 所有文本字段 + requirements 所有字段。中英文边界识别 |
| **项目级干系人资产** | 新表 `project_stakeholders`,GET/POST/PATCH/DELETE + `sync-from-meeting` 合并(name / alias 重叠 → 合并 + 累加;不重叠 → 新建)。ConsoleProjectDetail 顶部「干系人」Drawer 编辑,改名 → 跨该项目所有 meeting 自动同步 |
| **协作者权限** | `_load_meeting_owned` 支持 project.collaborator(owner/read_write/read 都能进会议详情)|
| **快捷键 + Toast** | 编辑模式 `Cmd+S` 保存 / `Esc` 取消;全局 `components/Toaster.tsx`(纯 CustomEvent,无依赖)+ axios 拦截器 401 走 refresh / 其他错误自动 toast |
| **会议列表搜索过滤** | `ConsoleMeeting` 顶部加搜索框 + 状态 chip(全部 / 处理中 / 完成 / 失败 / 录制中,带计数) |

**未完成 / 单独立项**:
- meeting 级 `relations` 可视化(项目级已有 `StakeholderCanvas`,meeting 级 relations 当前只渲染为列表;后续可在 `sync-from-meeting` 把 relations 一起搬到 stakeholder_graph 节点)
- 跨**项目** 干系人合并(同一人在 N 个项目都出现 → 全局视图)

---

### 6.10 LTC 全阶段链补完(方案设计 / 实施 / 测试 / 验收,2026-05-29 起)

调研报告之后的整条链路全部上线,每条 generator 都读"前序产物 + 项目素材"一次 Opus 大调用出 markdown。**章节结构强、不需要 planner-critic-challenger**(对比 § 6.3,这是有意识的取舍)。

| 阶段 | kind | generator | 输入(前序 bundle) |
|---|---|---|---|
| 调研收尾 - 计划 | `research_plan` | `research/plan_generator.py` | 调研大纲 + 项目素材 |
| 调研收尾 - 报告 | `research_report` | `research/report_generator.py` | 调研问卷 + 项目素材 |
| 方案设计 - 蓝图 | `blueprint_design` | `research/blueprint_generator.py` | research_report 优先 |
| 方案设计 - 对象字段表 | `object_field_layout` | `research/object_field_layout_generator.py` | blueprint + research_report |
| 方案设计 - 流程建设表 | `process_setup` | `research/process_setup_generator.py` | blueprint + research_report |
| 项目实施 | `implementation_plan` | `research/implementation_plan_generator.py` | research_report + blueprint;产出 markdown + `tasks[]` JSON |
| 上线测试 | `test_plan` | `research/test_plan_generator.py` | 上面三者 |
| 项目验收 | `acceptance_report` | `research/acceptance_report_generator.py` | 上面四者 |

蓝图相关有一套额外能力:
- **mermaid 真渲染**(`ac2a49b`)+ ASCII→mermaid linter(`d8c3859` / `d9b4704` / `ab18031`):LLM 出 ASCII box 流程时自动补救为 mermaid
- **PaaS 设计规范注入 prompt**(`ed80012`):蓝图生成默认知道纷享 PaaS 字段类型 / 对象元 / 布局规范
- **蓝图引用可点跳证据**(`c03cc65`)

### 6.11 项目实施工作台(2026-05-29)

`backend/api/implementation.py` + `backend/services/sharedev/` + `frontend/.../implementation/ImplementationWorkspace.tsx`。**目的**:把"实施任务清单 markdown"再变成可操作的 task 工作台,每条 task 关联一个 **sharedev skill**,一键生成对应 `tenant-config/*.xml` / `.groovy` 并打 zip 下载到客户租户。

- **17 个 sharedev skill** 落在 `backend/prompts/sharedev/skills/<skill-id>/{SKILL.md, references/, assets/}`,`services/sharedev/skill_loader.py` 用 `lru_cache` 加载拼成 LLM system prompt
- **Phase 1**(`f2f43c0`):内嵌 sharedev skill 工作流,占位骨架 + 凭证管理(`api/sharedev_credentials.py` + `components/settings/ShareDevTab.tsx`)
- **Phase 2**(`708fae1`):`research/sharedev_config_generator.py` 接 5 个配置类 skill(`sharedev-object` / `sharedev-field` / `sharedev-validation-rule` / `sharedev-layout` / `sharedev-layout-rule`),单 task → xml,可下载 tenant-config zip
- **Phase 3 留待**:APL / PWC 全套(代码类产物要单独的 prompt 工程 + 评审环节)

### 6.12 企信 IM 接入(qixin,2026-05-29)

把企信(纷享内部 IM)消息流引入工作台。每用户独立 Bot,在主进程 lifespan 内拉起一个 SSE 连接收消息;消息按 user_id 严格隔离落 `qixin_messages`,前端用 `QixinDrawer` 5s 轮询拉。

| 文件 | 职责 |
|---|---|
| `services/qixin_gateway/sse_client.py` | 单 Bot SSE 长连接(连/重连/Last-Event-ID 续传/`max_lifetime` 主动重连),协议参考 openclaw-sharecrm |
| `services/qixin_gateway/connection_manager.py` | 按 user_id 维护连接池,`bootstrap_all` / `stop_all` 挂在 `main.py` lifespan |
| `api/qixin_credentials.py` | 每用户 Bot 凭证 CRUD(`/api/qixin/credentials` 等) |
| `api/qixin.py` | `GET /conversations` / `GET /conversations/{chat_id}/messages` / `POST send`(发消息不依赖 SSE 在线,_pool 空时用临时 client 直发,`3eb1191`) |
| `models/qixin_message.py` | 持久化消息(group/private,@ 前最近 10 条作 history_messages 落库给 RAG 用) |
| `components/qixin/QixinDrawer.tsx` | 全局侧抽屉(挂在 console 和 redesign/console) |
| `components/settings/QixinTab.tsx` | 凭证配置 + Bot 状态 |

**RAG 自动回复**(`f6c62ee`):群聊 @Bot 时按 Bot 主用户的权限隔离文档跑 RAG → 自动发回。

### 6.8 三套 kind 列表必须同步 + sub_kinds 形态

当前 13 个 kind:`kickoff_pptx` / `kickoff_html` / `insight` / `survey` / `survey_outline` / `research_plan` / `research_report` / `blueprint_design` / `object_field_layout` / `process_setup` / `implementation_plan` / `test_plan` / `acceptance_report`。

加新 kind 时改这三处:
- `backend/api/outputs.py` `KIND_TO_TASK` / `KIND_TITLES`
- `backend/api/stage_flow.py` `ALLOWED_KINDS` / `kind_titles` / `DEFAULT_STAGES`
- `frontend/src/api/client.ts` `OutputKind`

还要在 `backend/tasks/output_tasks.py::_kind_to_task()` 加任务映射(卡死自动重启时用),以及在 `runner.py` 注册具体的 generate 函数。

**Stage Flow 已演化成 sub_kinds 形态**(2026-06-03,`eddd7ab`):一个 stage 可挂多个 sub_kind,中央工作区按 `activeKind` 切产物。当前 `DEFAULT_STAGES`:

| stage key | label | sub_kinds |
|---|---|---|
| `insight` | 项目洞察 | `insight` / `kickoff_pptx` / `kickoff_html` |
| `survey` | 需求调研 | `survey_outline` / `research_plan` / `survey` / `research_report` |
| `design` | 方案设计 | `blueprint_design` / `object_field_layout` / `process_setup` |
| `implement` | 项目实施(beta) | `implementation_plan` |
| `test` | 上线测试(beta) | `test_plan` |
| `acceptance` | 项目验收(beta) | `acceptance_report` |

老配置(独立 kickoff 阶段)由 `_migrate_kickoff_into_insight` 惰性迁移并入 insight。**改 stage 配置时,任何 sub_kind 的 kind 必须在 `ALLOWED_KINDS` 集合里**,否则保存会 400。

---

## 7. 数据库 schema 关键表关系

```
projects(1) ─┬─< documents(N) ─< chunks(N) ─→ qdrant.points
             │
             ├─< curated_bundles(N) ─→ output(13 个 kind)
             │       │
             │       └─< output_conversations(对话历史)
             │
             ├─< project_briefs(N, by output_kind)
             ├─< project_collaborators(N, role∈owner/read_write/read)
             ├─< project_stakeholders(N,跨 meeting 合并 + 改名同步)
             ├─< project_smart_advice(1,LLM 智能建议 + inputs_hash + is_stale)
             ├─< meetings(N) ─< meeting_stakeholders / meeting_requirements
             └─< research_responses(N, by survey bundle)

users(1) ─┬─< projects.created_by, curated_bundles.created_by, ...
          ├─< qixin_credentials(每用户 Bot 凭证)
          ├─< qixin_messages(收到的消息,按 user_id 严格隔离)
          ├─< feishu_credentials(飞书 App Secret,Fernet 加密)
          └─< sharedev_credentials(sharedev sidecar 凭证)

invite_codes — 注册邀请码 / captcha_challenges — 图形验证码一次性消费

agent_configs (config_type, config_key) UNIQUE — 配置中心:
  - 'output_agent' / kind → {prompt, skill_ids, model}
  - 'stage_flow' / 'default' → {stages: [...]}
  - 'model' / model_key → ...
  - 'routing' / task → ...
  - 'task_params' / task → ...
  - 'prompt' / key → 模板内容
  - 'api_key' / provider → 凭证(密文)

skills(1) ─→ 被 agent_configs.config_value['skill_ids'] 引用(by uuid)
```

**关键 UNIQUE / 索引**:
- `agent_configs(config_type, config_key)` UNIQUE — 改 config_key 时要小心冲突,见 [LEARNING.md § 1.3](LEARNING.md)
- `project_briefs(project_id, output_kind)` UNIQUE
- `research_responses(bundle_id, item_key)` UNIQUE
- `curated_bundles_archive_legacy` / `project_briefs_archive_legacy` / `output_conversations_archive_legacy` — v3 迁移归档表,保留 30 天

---

## 8. 部署流程

**只走 GitHub Actions** —— 服务器拉 ghcr.io 镜像,不在本地编译。详见 [CLAUDE.md § 部署流程](CLAUDE.md)。摘要:

```bash
# UAT 自动:push main 触发 deploy-uat.yml(只重启 frontend-uat)
git push origin main

# PROD 手动:触发 deploy-prod.yml(全栈滚动重启 + 健康检查 + 回滚)
gh workflow run deploy-prod.yml --ref main -f confirm=deploy
gh run watch <run-id>           # 跟运行直到结束

# DB 迁移仍可手动 ssh(workflow 不跑 alembic)
ssh -i ~/.ssh/id_rsa_github_deploy liu@34.45.112.217 \
    "sudo docker exec kb-system-backend-1 python -m scripts.<migrate>"
```

**注意**:
- 服务器只有 9.7G 磁盘,GitHub Actions 构建在 GitHub runner 做,服务器只 `docker pull` —— 不再需要本地 `docker builder prune`(但拉新版本后老镜像可能堆积,定期 `docker image prune -a`)
- 镜像版本通过 ghcr 标签管控,部署可回滚(deploy-prod.yml 自带 `.last-good-sha` / `.prev-good-sha`)
- 涉及 DB 的迁移要先 `--dry-run`(但 dry-run 通过 ≠ 真跑安全,见 LEARNING.md § 6.6)
- **换服务器时**:除了改本仓 IP 硬编码,还要在 GitHub Settings → Secrets 改 `DEPLOY_HOST`(workflow 通过 `secrets.DEPLOY_HOST` 注入,不在仓库代码里)

---

## 9. 调试常用入口

| 场景 | 命令 |
|------|------|
| 看 backend 日志 | `ssh ... sudo docker logs -f kb-system-backend-1` |
| 看 celery worker 日志 | `ssh ... sudo docker logs -f kb-system-celery_worker-1` |
| 进 PG | `ssh ... sudo docker exec -it kb-system-postgres-1 psql -U kb_admin -d kb_system` |
| 进 backend 容器 shell | `ssh ... sudo docker exec -it kb-system-backend-1 bash` |
| 看磁盘 | `ssh ... df -h /` |
| 重启某个服务 | `ssh ... sudo docker compose restart backend` |

---

## 9.5 生产 readiness 改造(2026-05-12)

经全面审查,完成 P0 全部 + P1 高收益项:

**鉴权 / 权限隔离**
- `/api/transfer/export` / `/api/chunks/*` / `/api/review/*` / `/api/coverage/gaps` 全部加 `Depends(get_current_user)` 或 `require_admin`
- `/api/qa/ask` `/ask-stream` `/generate-doc` 不再支持匿名(此前匿名可刷 LLM 配额)
- `/api/outputs/{id}/content` `/html` 写操作改 `"write"` 权限(此前误写 `"read"`,read-only 协作者可改报告)
- `/api/mcp` 所有 8 个 tool handler 加 project 权限隔离,`_resolve_project_for(user, ref)` 取代 `_resolve_project(ref)`,非 admin 自动 404 无权项目
- `/api/meeting` `_validate_project_link` 校 `write` 权限(此前只校项目存在)

**配置 / 部署**
- CORS allow_origins 收紧到自有 4 个域名,告别 `["*"]` + `allow_credentials=True` 错配
- 启动时校验 `JWT_SECRET_KEY` 非默认值,默认 raise(`KB_ENV=development` 时跳过)
- `/docs` `/openapi.json` 在生产关掉(`KB_ENV=production`)
- backend `docker-compose ports` 改 `127.0.0.1:8000:8000`,公网走 nginx
- nginx 加 4 个安全 header:CSP / X-Content-Type-Options / X-Frame-Options / Referrer-Policy / Permissions-Policy
- nginx 加 `/health` 端点(给 frontend healthcheck 用)

**备份 / 回滚**
- `scripts/backup.sh` Postgres pg_dump + MinIO tar + Qdrant snapshot → GCS bucket(配 cron 0 4 * * *)
- `scripts/restore.sh` 配套还原(交互式二次确认)
- `deploy.yml` 用 `sha-${SHORT_SHA}` 标签取代 `:latest`,服务器保留 `.last-good-sha` + `.prev-good-sha`,健康检查失败自动回滚
- `deploy.yml` 失败时 webhook 通知(`DEPLOY_WEBHOOK_URL`)

**可靠性**
- Celery 所有 task 加 `soft_time_limit` / `time_limit`(insight/survey 900/1200s,meeting 1500/1800s,document 900/1200s),不再单卡死任务吃满 worker
- `model_router._call_chat` LLM 调用扩展重试覆盖 5xx + `TimeoutException` / `ConnectError` / `ReadError`
- `services/rate_limit.py` key_func 改用 X-Forwarded-For 首段,SlowAPI 不再把所有请求并到一个限流桶

**可观测性**
- `main.py` 加 request_id middleware:`X-Request-ID` 头部透传,绑到 structlog.contextvars(各处日志自动带这个字段)
- Sentry SDK 接入,`SENTRY_DSN` 空时跳过初始化(零成本可选)
- `renew-ssl.sh` 加 healthchecks.io ping + 证书剩余 < 7 天时 webhook 告警

**CI**
- `deploy.yml` 加 `frontend-check` job(`tsc --noEmit` + `npm run build`)作为合并 gate
- 容器 healthcheck:frontend(wget /health)、celery_worker(celery inspect ping)、qdrant(/healthz)、redis(redis-cli ping)、minio(/minio/health/live)
- frontend 加 `mem_limit: 256m`

**部署前必检 ⚠️**(主要给 admin):
1. 生产 `.env` 的 `JWT_SECRET_KEY` 必须不是 `change-me-...` 否则 backend 启动 raise
2. 备份脚本要部署后人手配 cron:`0 4 * * * /opt/kb-system/scripts/backup.sh >> /var/log/kb-backup.log 2>&1`
3. 先在 GCS 建 bucket(`gs://kb-system-backup`)+ 配 lifecycle 7 天保留 + 给 GCE 服务账号加 Storage Object Admin
4. 想接 Sentry,在 .env 配 `SENTRY_DSN=...`

**延后单独立项的 P1**(LEARNING.md 留记号):
- ✅ feishu/qixin/sharedev secret Fernet 加密入库(2026-05-29,`services/feishu_crypto.py` + deploy-prod.yml 自动注入 FERNET_KEY)
- JWT HttpOnly cookie 改造(改前端所有 axios)
- JWT `jti` + Redis 黑名单 revocation
- Alembic 迁移基线接入(替代 `Base.metadata.create_all + ALTER`)
- `pptx_codeexec` 独立沙箱容器
- MCP key sha256 哈希存储(当前仍明文)

---

## 10. 当前状态 / 未完成项

- ✅ v3 命名归一已上线(2026-05-02 提交)
- ✅ 元页面 /ds /api /demo /help 已对齐 v3
- ✅ skills roadmap 文档已交付
- ✅ 生产 readiness P0+P1 高收益(2026-05-12,见 § 9.5)
- ✅ Skill Hub 抽出为独立仓 [zhebinliu/skillhub](https://github.com/zhebinliu/skillhub)(2026-05-19,见 § 11)
- ✅ 会议模块全链路上线(纪要 / 需求 / 干系人 / 转写编辑 / docx 导出 / 实时录音浏览器化,见 § 6.9)
- ✅ LTC 全阶段链补完:调研报告 → 蓝图 → 对象字段表 / 流程建设表 → 实施任务清单 → 测试计划 → 验收报告(2026-05-29 → 2026-06-01,见 § 6.10)
- ✅ 项目实施工作台 Phase 1+2(2026-05-29,见 § 6.11)
- ✅ 企信 IM Phase 1:每用户 Bot + SSE 收消息 + 手动发 + 群聊 @Bot RAG 自动回复(2026-05-29,见 § 6.12)
- ✅ 调研问卷按角色逐步生成(executive / dept_head / frontline / it,2026-06-03 `610d058`)
- ✅ 启动会 PPT/HTML 并入项目洞察阶段作 sub_kinds + 洞察生成完成自动连带启动会 PPT(2026-06-03)
- ✅ 7 个报告渲染器收敛到 `components/markdown/ReportMarkdown`(2026-06-02)
- ✅ 生成进度卡升级:实时进度 + 阶段时间线 + 已耗时(2026-06-01)
- ✅ 卡死 bundle 自动重启 + linter 流程过多守卫(2026-06-02,task `recover_stale_bundles`)
- ✅ 调研计划(客户版)kind `research_plan` 上线(2026-06,`plan_generator.py`)
- ✅ 调研问卷按场次手动触发生成(`generate_survey_session`,2026-06)
- ✅ 暗色重构版 UI `redesign/` 全面铺开(2026-06,ConsoleProjectDetail 86KB + CenterWorkspace 49KB)
- ✅ 全局搜索 `GlobalSearchModal`(暗色版新增,2026-06)
- ✅ 会议纪要分享功能(`meeting_share` 模型,2026-05-27)
- ✅ `skills_seed.py` "7 维度" 名称已通过 `LEGACY_NAME_MIGRATIONS` 迁移链自动修正为 "6 维度 rubric"(2026-06)
- ✅ `output_service.py:_get_brief_block` kickoff_html bug 已修复:第 260 行 `canonical_kind = "kickoff_pptx" if kind == "kickoff_html" else kind`(2026-06)
- ✅ `ALLOWED_KINDS` 补全 `object_field_layout` / `process_setup`(2026-06)
- 🔲 StatusBadge 组件统一(7 处分散)+ Loading hook(5 处)+ to_dict mixin(16 处)— P3,本轮跳过
- 🔲 GCP 服务器 9.7G 偏小,部署高频 OOM,长期需扩盘
- 🔲 sharedev Phase 3(APL / PWC 全套 generator)— 代码类产物要单独 prompt 工程 + 评审环节
- 🔲 meeting 级 `relations` 可视化(项目级已有 `StakeholderCanvas`,见 § 6.9)
- 🔲 跨项目干系人合并(全局视图)
- 🔲 § 9.5 末尾列的 4 个延后 P1(HttpOnly cookie / Alembic / sandbox / MCP key sha256)
- 🔲 主 `kb-system-frontend-1` healthcheck 误报 unhealthy(预先存在,不阻塞,见 LEARNING.md § 11.5)
- ✅ JSON 健壮解析收敛:challenger.py 死代码已删、smart_advice.py 改用 `llm_json.loads_lenient`(2026-06)
- 🔲 暗色版 `redesign/` 与经典 UI 功能对齐完善(部分页面仍有差异)
- 🔲 `redesign/` 与经典 `pages/` 长期合并为单一版本(去重)

---

## 11. Skill Hub — 已抽出为独立仓库

> ⚠️ **代码不在本仓**。skillhub 业务代码全部移到 [github.com/zhebinliu/skillhub](https://github.com/zhebinliu/skillhub)。
> kb-system 这边仅保留 nginx 反代 + docker-compose 容器定义这两块"入口基础设施"。

### 11.1 域名 + 容器

- **域名**:`skillhub.tokenwave.cloud`(独立证书,管理员邀请码登录)
- **容器**(在主 `docker-compose.yml` 里定义,build context 指向 `./skillhub/` symlink → `/opt/skillhub`):
  - `skillhub-backend`:FastAPI :8001 内网,384MB 限
  - `skillhub-frontend`:nginx + React dist :80 内网,128MB 限
- **入口**:主 `frontend` 容器 nginx 持 443,server block `skillhub.tokenwave.cloud` 反代 `/api/* → skillhub-backend:8001`,其余 → `skillhub-frontend:80`
- **DB**:复用 postgres 实例的独立 `skillhub` database,独立用户表

### 11.2 服务器部署布局

```
/opt/skillhub               ← git clone https://github.com/zhebinliu/skillhub.git
/opt/kb-system/skillhub     → symlink → /opt/skillhub
/opt/kb-system/docker-compose.yml  build: ./skillhub/{backend,frontend}
/opt/kb-system/.env         共享(SKILLHUB_* 段)
```

更新 skillhub:
```bash
ssh ... 'cd /opt/skillhub && sudo git pull && cd /opt/kb-system && \
         sudo docker compose build skillhub-backend skillhub-frontend && \
         sudo docker compose up -d --force-recreate skillhub-backend skillhub-frontend'
```

更新 nginx 反代 / docker-compose 服务定义 / 主入口证书 → 还在 kb-system 仓里改。

### 11.3 功能要点

详见 [skillhub README](https://github.com/zhebinliu/skillhub#readme)。摘要:

- 邀请码注册 + JWT 登录,独立 users
- 上传(zip / tar.gz / webkitdirectory),50MB 上限
- 文件树 + markdown 渲染 + 代码高亮
- 草稿默认,手动 publish
- **双层质检**:5 维静态启发式(秒级)+ 4 维 LLM 上下文评分(10-90s),综合分 = 静态 40% + LLM 60%
- 后台:邀请码 CRUD + 用户列表

### 11.4 数据库

`skillhub` 库:`users` / `invite_codes` / `skills` / `quality_reports`(后者支持 mode=static|llm|both,启动时自动 ALTER 补列)。

文件落在 docker volume `skillhub_data`:`/data/skillhub/{uuid}/...`

### 11.5 启动凭证(部署后必改)

- 初始 admin:`liu@zheb.in` / `Skillhub2026!`(env `SKILLHUB_BOOTSTRAP_ADMIN_*`,可改)
- 启动时自动生成第一条邀请码,写 backend 日志

---

## 12. Meeting 模块 overlay 布局

> **历史**:2026-05-19 抽为独立仓 [zhebinliu/ai-meeting](https://github.com/zhebinliu/ai-meeting) 的 git submodule;2026-05-25 合并回主仓,`meeting/` 改为普通目录。**Docker overlay 架构保留**(下文 12.2 仍生效),只是 git 层面不再是 submodule。

会议模块的业务代码集中放在 `meeting/` 子目录,Dockerfile 用 overlay 方式把它叠到主镜像的原路径 —— Python / TS 的 import 路径与主仓代码一致。

### 12.1 目录布局(overlay 映射)

`meeting/` 下的文件路径 = 它们在镜像里的相对路径:

```
meeting/
├── backend/
│   ├── api/meeting.py                  → /app/api/meeting.py
│   ├── models/meeting.py               → /app/models/meeting.py
│   ├── prompts/meeting.py              → /app/prompts/meeting.py
│   ├── tasks/meeting_tasks.py          → /app/tasks/meeting_tasks.py
│   └── services/meeting/{*.py,templates/}
└── frontend/src/
    ├── pages/console/ConsoleMeeting{,Detail,New}.tsx     (旧 UI)
    └── redesign/console/ConsoleMeeting{,Detail,New}.tsx  (新 UI)
```

Docker 镜像里 overlay 后,文件落到原路径 —— Python / TS 的 import 不用改一行。

### 12.2 Docker 集成

- **build context = 仓库根**(2026-05-19 起改的,沿用)
- `backend/Dockerfile`:`COPY backend/ /app/` 然后 `COPY meeting/backend/ /app/`(overlay 覆盖到同一个 `/app/`)
- `frontend/Dockerfile` builder 阶段同理:`COPY frontend/ /app/` 然后 `COPY meeting/frontend/ /app/`
- 仓库根 `.dockerignore` 接管所有忽略规则(旧的 `backend/.dockerignore` / `frontend/.dockerignore` 在新 context 下不再生效但留作记录)

### 12.3 开发流程

直接在主仓改 `meeting/` 下的文件,跟改 `backend/` / `frontend/` 没区别。`scripts/sync-dev.sh` rsync 到服务器,远端 `docker compose build` 时 overlay COPY 生效。

### 12.4 主仓里的会议注册点

会议业务代码在 `meeting/`,但**把代码注册到主框架**的胶水仍散落在主仓:
- `backend/main.py:8,157,197` 的 meeting 路由注册 / `Base.metadata` 注册
- `backend/tasks/__init__.py` 的 `from tasks import meeting_tasks` eager import
- `frontend/src/App.tsx:30-32,80-82,134-136` 的会议路由
- `frontend/src/pages/demo-ppt/slides/12-meeting.tsx`(demo PPT 展示页)
- `frontend/src/components/console/research/ExportPreMeetingButton.tsx`(research 模块导出按钮)

改 `meeting/` 下的 router prefix / model tablename 这种,主仓注册点要跟着同步。

---

## 13. 修订学习记忆系统(2026-06-08)

让 AI 从用户的人工修订中学习偏好,下次生成同类产物自动应用。

### 数据流

```
[用户上传修订版]
  POST /api/outputs/{id}/markdown-override(已有,4 类 bundle:蓝图/对象字段表/流程建设表/调研报告)
  ↓ commit content_md
  ↓ analyze_bundle_revision.delay(...)  ← 异步 enqueue,不阻塞
[Celery worker @ tasks/output_tasks.py]
  ↓ services/revision_learning.py::analyze_revision()
  ↓ LLM(model_router task=revision_learning,primary minimax-m2.7 / fallback glm-5)
  ↓ 产出 3-5 条「用户偏好...」 markdown bullet
  ↓ INSERT bundle_revision_memories
[下次同 kind bundle 生成]
  ↓ services/agentic/runner.py 3 处入口:
  ↓   generate_research_report() / generate_blueprint_design() / _generate_design_artifact()
  ↓ fetch_revision_memories_block(kind) → SELECT enabled=true ORDER BY DESC LIMIT 10
  ↓ prepend 到 SYSTEM_PROMPT 顶部(上限 4000 字符避免膨胀)
  ↓ LLM 拿到历史偏好生成更精准产物
[管理后台 /bundle-memories(admin only)]
  - 4 个 kind tab + 启用/总数角标
  - 单条:启停 / 编辑 / 删除
  - 数据查 GET /api/admin/bundle-memories ; toggle 用 PATCH ; 删除 DELETE
```

### scope 决策

- **全局 + bundle kind 隔离**(不按 user / project 隔离)— 公司方法论沉淀场景下复用价值最大
- 决策依据 + 候选对比详见 [LEARNING.md §13](LEARNING.md)

### 关键文件

| 文件 | 作用 |
|---|---|
| `backend/models/bundle_revision_memory.py` | DB 表 schema + 复合索引 |
| `backend/services/revision_learning.py` | LLM 抽笔记 + fetch 拼接 helper |
| `backend/api/admin_bundle_memories.py` | admin CRUD endpoint |
| `backend/tasks/output_tasks.py::analyze_bundle_revision` | Celery 异步任务 |
| `backend/api/outputs.py::override_bundle_markdown` | endpoint hook(commit 后 enqueue) |
| `backend/services/agentic/runner.py` | 3 处注入点(research_report / blueprint_design / _generate_design_artifact) |
| `frontend/src/pages/BundleMemoriesAdmin.tsx` | admin 管理页面(legacy) |
| `frontend/src/api/client.ts` | api client(listBundleMemories 等) |

### 失败容错

三道防线,任意失败都不影响主流程:
1. **enqueue 失败**:catch 异常只 log warning,主 commit 已成功
2. **LLM 任务失败**:Celery `max_retries=3 default_retry_delay=60`,3 次都失败吞掉
3. **fetch 失败**:返回空串,生成时不注入但流程继续

### 边界

- 原文 / 修订文 < 50 字符不触发学习(噪声)
- LLM 输出空 / 包含「无显著系统性偏好」不入库
- LLM 输出 > 3000 字符截断(防异常)
- 注入 10 条 / 4000 字符上限(防 prompt 膨胀)

### 不在范围

- kickoff_pptx / kickoff_html 等文件类不支持(本就没有上传修订入口)
- redesign 版前端管理页面未做(legacy 完整,后端 API 复用)
- 不接 RAG / few-shot / 自动评估 — V2 再说
