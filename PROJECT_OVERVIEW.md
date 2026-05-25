# KB System 项目全景图

> 本文档目标:**新一次 session 开始时只读这一份**,就能掌握架构 / 数据流 / 关键文件 / 决策依据,不必从零扫代码。
>
> 与其他指导文件分工:
> - [CLAUDE.md](CLAUDE.md) — 当前项目的"硬性规范"(部署 / 命令 / 不要做什么)
> - [LEARNING.md](LEARNING.md) — 累计踩坑笔记(具体陷阱 + 真因)
> - **本文** — 架构全景与决策依据(为什么这样设计 / 数据怎么流)

---

## 1. 一句话定义

KB System 是 **纷享销客 CRM 实施咨询师** 的内部知识库 + 项目工作台 + AI 输出工具。功能上做三件事:

1. **知识库**:文档上传 → 切片 → 向量化 → 检索式问答(RAG)
2. **项目工作台**:对每个客户项目,围绕 LTC(Lead-to-Cash)流程提供文档管理 / 调研 / 洞察 / 启动会 PPT 生成的全套工具
3. **AI 输出**:基于 brief + 文档 + KB + 联网检索,自动生成「项目洞察报告 / 启动会 PPT / 需求调研问卷」三类核心产物

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
| 部署 | Docker Compose,GCP `34.45.112.217` 单机 |
| 域名 | `kb.liii.in` / `kb.tokenwave.cloud` / `uat.tokenwave.cloud` / `skillhub.tokenwave.cloud`(同 IP,各自证书) |

容器清单(10 个):`frontend`(443 入口,持四张证书 + 反代 uat/skillhub) `frontend-uat` `backend` `celery_worker` `postgres` `qdrant` `redis` `minio` `skillhub-backend`(:8001 内网) `skillhub-frontend`(:80 内网)。

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
| `meeting.py` | `/api/meeting` | 会议纪要(待上线) |
| `call_logs.py` | `/api/call-logs` | API 调用日志(管理员可见) |
| `agent_settings.py` | `/api/settings` | LLM 模型 / 路由 / 任务参数 / prompts / skills / output_agents 配置 |
| `challenge.py` | `/api/challenge` | KB 知识切片对抗式审核 |
| `stakeholder_graph.py` | `/api/stakeholder-graph` | 干系人图谱编辑 |
| `export.py` | `/api/transfer` | 数据导出 |

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

### `services/agentic/` — agentic 生成流水线(insight / survey / survey_outline 走这条)

```
┌─────────────────────────────────────────────────────────────┐
│ runner.generate_insight / generate_survey /                 │
│         generate_survey_outline (Celery task entry)         │
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
│                                                             │
│  industry_packs/ — 行业 pack(智能制造等),注入行业默认数据  │
│  research/ — 调研问卷 schema + 范围分类                     │
│  skills_seed.py — 12 条原子 skill 库 + 默认关联             │
└─────────────────────────────────────────────────────────────┘
```

### `models/` — SQLAlchemy 模型(20 张表)

**核心**:
- `user` / `project` / `document` / `chunk`(基础对象)
- `curated_bundle` — 产物记录(kind ∈ {kickoff_pptx, kickoff_html, insight, survey, survey_outline})
- `project_brief` — 项目 Brief 字段(按 output_kind 唯一)
- `output_conversation` — 对话式生成历史
- `agent_config` — agent 配置(`agent_configs` 表,UniqueConstraint(config_type, config_key))

**辅助**:
- `qa_log` `api_call_log` — 调用日志
- `review_queue` — 切片审核队列
- `challenge` `challenge_run` `challenge_round` `challenge_schedule` — 挑战机制
- `coverage_gap` — KB 覆盖度缺口
- `skill` — skill 库
- `research_response` `research_ltc_module_map` — 调研录入

### `tasks/` — Celery 任务

`output_tasks.py` — 5 个产物生成 task:`generate_kickoff_pptx` / `generate_kickoff_html` / `generate_insight` / `generate_survey` / `generate_survey_outline`。`kickoff_*` 走 `services/output_service`,其他三个走 `services/agentic/runner`。

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
- `Settings` `SystemConfig` `ChangePassword` — 设置(管理员居多)

**对外门户**:
- `Login` `Register`

**元页面(无须登录)**:
- `Demo` + `demo/InsightDemo` `demo/SurveyDemo` `demo/OutlineDemo` — 产品走查演示
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

**通用**:`MarkdownView` `OutputChatPanel` `BriefDrawer` `AgenticGapFiller`(原 V2GapFiller)

**`components/console/`** — 工作台专用组件:
- `CenterWorkspace` — 中栏(6 种 view 形态)
- `CitationsPanel` — 右栏引用面板
- `FloatingChat` / `FloatingQA` — 浮动 PM 问答
- `GenerationProgressCard` — 生成进度卡(6 阶段)
- `ChallengeRoundsPanel` — 挑战回合卡
- `StakeholderCanvas` — 干系人图谱画布
- `DocChecklist` — 文档清单
- `research/ResearchWorkspace` — 调研工作区(原 ResearchV1Workspace)
- `research/ResearchQuestionnaire` — 顾问勾选式问卷

**`components/settings/`** — 系统设置 Tab(管理员)
**`components/system-config/`** — Stage Flow 编辑器等

### `api/client.ts`

axios 实例 + 全部后端 API 的 TypeScript 函数封装 + 类型定义(`OutputKind` / `CuratedBundle` / `Project` 等)。**所有跨页面 API 调用从这一个文件出**,新加端点必须在这里 export。

### `layouts/`

- `Layout.tsx` — 内部管理界面(/dashboard, /documents 等)
- `ConsoleLayout.tsx` — 对外工作台界面(/console/*)

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

### 6.8 三套 kind 列表必须同步

加新 kind 时改这三处:
- `backend/api/outputs.py` `KIND_TO_TASK` / `KIND_TITLES`
- `backend/api/stage_flow.py` `ALLOWED_KINDS` / `kind_titles`
- `frontend/src/api/client.ts` `OutputKind`

---

## 7. 数据库 schema 关键表关系

```
projects(1) ─┬─< documents(N) ─< chunks(N) ─→ qdrant.points
             │
             ├─< curated_bundles(N) ─→ output(insight/survey/...)
             │       │
             │       └─< output_conversations(对话历史)
             │
             ├─< project_briefs(N, by output_kind)
             │
             └─< research_responses(N, by survey bundle)

users(1) ─< projects.created_by, curated_bundles.created_by, ...

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

详见 [CLAUDE.md § 部署流程](CLAUDE.md)。摘要:

```bash
# 1. 同步代码
rsync -avz --delete --exclude=.git --exclude=node_modules ... ./ liu@34.45.112.217:/opt/kb-system/

# 2. 远程重建 + 重启
ssh liu@34.45.112.217 "cd /opt/kb-system && sudo docker compose build backend frontend && sudo docker compose up -d backend frontend"

# 3. (按需)跑迁移
ssh liu@34.45.112.217 "sudo docker exec kb-system-backend-1 python -m scripts.<migrate>"
```

**注意**:
- 服务器只有 9.7G 磁盘,常需要 `docker builder prune -af` 释放空间(见 LEARNING.md § 6.1)
- backend 容器是 image bake,代码改了必须 rebuild;一次性脚本可 `docker cp` 进容器免重建
- 涉及 DB 的迁移要先 `--dry-run`(但 dry-run 通过 ≠ 真跑安全,见 LEARNING.md § 6.6)

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
- JWT HttpOnly cookie 改造(改前端所有 axios)
- JWT `jti` + Redis 黑名单 revocation
- Alembic 迁移基线接入(替代 `Base.metadata.create_all + ALTER`)
- `pptx_codeexec` 独立沙箱容器
- MCP key sha256 / `feishu_app_secret` Fernet 加密(涉及数据迁移)

---

## 10. 当前状态 / 未完成项

- ✅ v3 命名归一已上线(2026-05-02 提交)
- ✅ 元页面 /ds /api /demo /help 已对齐 v3
- ✅ skills roadmap 文档已交付
- ✅ 生产 readiness P0+P1 高收益(2026-05-12,见 § 9.5)
- 🔲 `skills_seed.py:137` "Challenger 7 维度 rubric" name 仍写 7 维(实际 6),下次动 skills_seed 时一并修
- 🔲 `output_service.py:_get_brief_block` 历史 bug:`kind='kickoff_html'` 时找不到 brief(因 brief 入库归一成 kickoff_pptx 但读取没归一)
- 🔲 StatusBadge 组件统一(7 处分散)+ Loading hook(5 处)+ to_dict mixin(16 处)— P3,本轮跳过
- 🔲 GCP 服务器 9.7G 偏小,部署高频 OOM,长期需扩盘
- 🔲 `ConsoleMeeting` 即将上线但 disabled
- 🔲 上 § 9.5 末尾列的 5 个延后 P1(HttpOnly cookie / Alembic / sandbox 等)
- ✅ Skill Hub 抽出为独立仓 [zhebinliu/skillhub](https://github.com/zhebinliu/skillhub)(2026-05-19,见 § 11)
- 🔲 主 `kb-system-frontend-1` healthcheck 误报 unhealthy(预先存在,不阻塞,见 LEARNING.md § 11.5)

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
