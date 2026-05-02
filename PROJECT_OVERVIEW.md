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
| 域名 | `kb.liii.in` / `kb.tokenwave.cloud`(同 IP,各自证书) |

容器清单(7 个):`frontend` `backend` `celery_worker` `postgres` `qdrant` `redis` `minio`。

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

## 10. 当前状态 / 未完成项

- ✅ v3 命名归一已上线(2026-05-02 提交)
- ✅ 元页面 /ds /api /demo /help 已对齐 v3
- ✅ skills roadmap 文档已交付
- 🔲 `skills_seed.py:137` "Challenger 7 维度 rubric" name 仍写 7 维(实际 6),下次动 skills_seed 时一并修
- 🔲 `output_service.py:_get_brief_block` 历史 bug:`kind='kickoff_html'` 时找不到 brief(因 brief 入库归一成 kickoff_pptx 但读取没归一)
- 🔲 StatusBadge 组件统一(7 处分散)+ Loading hook(5 处)+ to_dict mixin(16 处)— P3,本轮跳过
- 🔲 GCP 服务器 9.7G 偏小,部署高频 OOM,长期需扩盘
- 🔲 `ConsoleMeeting` 即将上线但 disabled
