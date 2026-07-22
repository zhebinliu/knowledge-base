# 系统完整功能清单

> 采集时间：2026-07-22
> 采集方式：`backend/main.py` 路由注册 + 47 个 router 的 AST 解析 + `frontend/src/App.tsx` 路由表 + Celery 任务注册表
> 口径：**代码实际实现的能力**，不是产品规划。标注 `beta` 的表示流程已通但未打磨。
> 配套文档：[数据库完整配置清单](DATABASE_SCHEMA.md) · [项目全景图](../PROJECT_OVERVIEW.md)

---

## 0. 一句话定位

**纷享销客 CRM 实施项目的全流程 AI 交付平台**：把「知识库 + 会议 + 项目」三条数据流喂给 LLM，自动产出实施顾问在六个阶段需要的 13 类交付物，并通过标准场景库做质量校验和知识回流。

---

## 1. 系统形态

| 维度 | 现状 |
| --- | --- |
| 后端 | FastAPI + Celery，Python 3.11，**323 个 REST 接口**（47 个 router） |
| 前端 | React + TS + Vite + Tailwind，**两套 UI 并存**（legacy / redesign，由 `IS_NEW_UI` 开关切换） |
| 异步 | Celery worker + beat，**31 个注册任务**、4 条定时调度 |
| 存储 | PostgreSQL 52 表 + Qdrant 向量库 + Redis + MinIO |
| 对外入口 | `kb.tokenwave.cloud`（edge nginx 统一持证反代） |
| 健康检查 | `/health`、`/health/db`、`/health/redis`、`/health/models`、`/health/worker`、`/api/stats` |

### 1.1 三个功能面

| 面 | 路由前缀 | 面向 | 说明 |
| --- | --- | --- | --- |
| **顾问工作台** | `/console/*` | 实施顾问 / PM | 项目、会议、待办、问卷——日常干活的地方 |
| **知识库后台** | `/`（根布局） | 管理员 | 文档、切片、审核、挑战、场景库、系统配置 |
| **公开页** | `/survey/:token`、`/api/public/*` | 客户 / 外部 | 免登录问卷填写、交付物只读分享、更新日志 |

---

## 2. 权限模型

### 2.1 三层校验

| 层级 | 实现 | 覆盖 |
| --- | --- | --- |
| **全局管理员** | `Depends(require_admin)` 挂在 router 上 | `users` / `review` / `export` / `agent_settings` / `call_logs` / `admin_daily_report` |
| **模块白名单** | `require_module("<name>")`，读 `users.allowed_modules` | `chunks` / `challenge` / `coverage`（复用 `review` 模块位） |
| **项目级 ACL** | `require_project_access`，查 `project_collaborators` | `projects` / `doc_checklist` 等按项目隔离的接口 |

### 2.2 项目角色双轨

- `project_collaborators.role` —— **权限角色**：读 / 读写 / 管理
- `project_collaborators.project_role` —— **业务角色**：`pm` / `consultant` / `customer`（指派 PM 时自动清掉其他人的 pm，保证单 PM）

### 2.3 认证方式

| 方式 | 入口 | 说明 |
| --- | --- | --- |
| 用户名密码 | `POST /api/auth/login` | JWT，7 天有效，`POST /refresh` 免密续期 |
| 图形验证码 | `GET /api/auth/captcha` | 注册/登录防刷，落 `captcha_challenges` |
| 邀请码注册 | `POST /api/auth/register` | 邀请码决定注册后的 `target_role` |
| MCP API Key | `POST /api/auth/mcp-key` | 需管理员开 `api_enabled`，key 仅生成时可见一次 |
| SSO | `POST /api/auth/sso/{provider}/bind` | ⚠️ **占位未实装**，只声明了契约 |
| 首登强制改密 | `must_change_password` 标志 | 管理员建号后强制 |

---

## 3. 核心业务主线：项目交付六阶段

系统的骨架是一条可配置的阶段流水线（`GET/PUT /api/settings/stage-flow`，管理员可改，支持 reset 回内置默认）。

| # | 阶段 | key | 交付物（bundle kind） | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 项目洞察 | `insight` | `insight` 洞察报告 · `kickoff_pptx` 启动会 PPT · `kickoff_html` 启动会 HTML | GA |
| 2 | 需求调研 | `survey` | `survey_outline` 调研大纲 · `research_plan` 调研计划(客户版) · `survey` 调研问卷 · `research_report` 调研报告 | GA |
| 3 | 方案设计 | `design` | `blueprint_design` 蓝图设计 · `object_field_layout` 对象字段表(含布局) · `process_setup` 流程建设表 | GA |
| 4 | 项目实施 | `implement` | `implementation_plan` 实施任务清单 | **beta** |
| 5 | 上线测试 | `test` | `test_plan` 测试计划 | **beta** |
| 6 | 项目验收 | `acceptance` | `acceptance_report` 项目验收报告 | **beta** |

**共 13 类交付物**，每类对应一个 Celery 任务（`KIND_TO_TASK` 映射）。其中 11 类是 Markdown（可在线编辑 + 上传修订版），2 类是二进制（PPTX / HTML，走独立保存路径）。

### 3.1 每类交付物的生命周期

```
生成前体检 → 异步生成 → 自我挑战(可选) → 场景覆盖校验 → 在线编辑/上传修订 → 修订学习 → 分享/导出
   ↓             ↓            ↓                ↓                  ↓              ↓
insight-      Celery      challenge_       scene-coverage    content_md     bundle_revision
checkup       task        rounds                                            _memories
```

| 环节 | 接口 | 说明 |
| --- | --- | --- |
| 生成前体检 | `POST /api/projects/{id}/insight-checkup` | 跑 `plan_insight`，检查每个模块字段够不够、缺什么 |
| 触发生成 | `POST /api/outputs/generate` | 派发 Celery，返回 bundle id |
| 阶段汇总 | `GET /api/outputs/stage-summary` | 全项目 (project, kind, status) 三元组，做阶段看板 |
| 最新态 | `GET /api/outputs/latest-by-kind` | 项目详情页 chip 用，每 kind 的最新 done + 进行中 |
| 挑战回合 | `GET /api/outputs/{id}/challenges` | 每轮 critique JSON + 重生成模块，工作台面板用 |
| 场景覆盖 | `GET /api/bundles/{id}/scene-coverage` | 正文覆盖了多少应覆盖场景、漏了哪些 |
| 在线编辑 | `PUT /api/outputs/{id}/content` | 写回 `content_md`，触发修订学习 |
| 上传修订版 | `POST /api/outputs/{id}/markdown-override` | 顾问人工改完整份传回，同样触发学习 |
| HTML 保存 | `PUT /api/outputs/{id}/html` | 仅 `.html` bundle，整份重写 MinIO |
| 下载 / 预览 | `GET /api/outputs/{id}/download` · `/view` | `/view` 无 attachment 头，HTML 幻灯片可在线播放 |
| 公开分享 | `POST/GET/DELETE /api/outputs/{id}/share` | 仅「客户向」kind 允许，生成免登录只读链接 |

### 3.2 卡死自愈

Celery beat 每 5 分钟跑 `recover_stale_bundles`：卡在 `running` 的 bundle 自动重启，超过重试上限才标 `failed`。

---

## 4. 功能模块清单

### 4.1 知识库（文档 → 切片 → 向量）

| 能力 | 接口 / 任务 | 说明 |
| --- | --- | --- |
| 文档上传 | `POST /api/documents/upload` | 异步转换：`process_document` |
| 格式转换 | `converter_agent` | 多格式 → Markdown，记录 `conversion_quality_score` 和分阶段耗时 |
| 在线改正文 | `PUT /api/documents/{id}/markdown` | 前端预览框直接编辑提取结果 |
| 文档类型推断 | `POST /api/documents/batch-infer-type` → `infer_doc_types_batch` | 批量补 `doc_type`（A/B/C/D 类） |
| 智能切片 | `slicer_agent` → `reslice_document` | 打 LTC 阶段标签 + 置信度、行业、模块 |
| 向量化 | `embedding_service` → Qdrant `kb_chunks` | 1024 维 Cosine |
| 切片管理 | `GET/PUT/PATCH /api/chunks/*` | 需 `chunks` 模块权限 |
| 审核队列 | `GET /api/review/queue` + approve / reject / batch-approve | 仅管理员 |
| 覆盖缺口 | `GET /api/coverage/gaps` | 按 `fail_count` 降序，Top N |
| 知识导出 | `POST /api/transfer/export` | 仅管理员 |

> **产品决策**：项目洞察阶段**文档喂全文不走切片召回**（`max_chars_per_doc=30000`）。切片体系服务于问答和挑战，不服务于洞察生成。

### 4.2 智能问答

| 能力 | 接口 | 说明 |
| --- | --- | --- |
| 单轮问答 | `POST /api/qa/ask` | |
| 流式问答 | `POST /api/qa/ask-stream` | SSE |
| 生成文档 | `POST /api/qa/generate-doc` | 问答结果直接成文 |
| 会话管理 | `GET/POST/PATCH/DELETE /api/qa/conversations` | 按 persona / 项目 / LTC 阶段 / 行业过滤 |
| 答案反馈 | `POST /api/qa/feedback` | 好评/差评 → `answer_feedbacks`，差评回写 `chunks.down_votes` |
| 未解决追踪 | `GET /api/qa/unanswered` + `/resolve` | `question_logs.unresolved` 驱动 `coverage_gaps` |
| 重排 | `rerank_service` | 召回后重排 |

### 4.3 知识挑战（KB 自检）

自动出题 → 自动回答 → LLM 裁判打分，找出知识库薄弱点。

| 能力 | 接口 / 任务 | 说明 |
| --- | --- | --- |
| 流式跑一轮 | `POST /api/challenge/run-stream` | SSE 实时吐进度 |
| 批次历史 | `GET /api/challenge/runs` · `/runs/{id}` | |
| 定时挑战 | `GET/POST/PUT/DELETE /api/challenge/schedules` + `/toggle` | cron 表达式配置 |
| 调度执行 | beat `run_scheduled_challenges`（每 60 秒检查） | |
| 缺口视图 | `GET /api/challenge/gaps` | |
| 出题模式 | `question_mode`：`kb_based` / 其他 | 默认基于知识库出题 |

### 4.4 项目管理

| 能力 | 接口 | 说明 |
| --- | --- | --- |
| 项目 CRUD | `/api/projects` | 含行业四级树 + 模块枚举（`GET /meta`） |
| 客户画像生成 | `POST /{id}/generate_profile` | LLM 一次成稿，不入库，前端确认后 PATCH 写回 |
| 所有权转让 | `POST /{id}/transfer-owner` | |
| 协作者管理 | `GET/POST/PATCH/DELETE /{id}/collaborators` | 含 `project-role` 单独设置接口 |
| 用户搜索 | `GET /api/projects/_/users/search` | 按 username/email/full_name 模糊搜 |
| 交接包 | `GET /{id}/handoff-bundle` | 项目交接一键打包 |
| 文档清单 | `GET /api/doc-checklist/{project_id}` | 该阶段应有哪些文档 + 已上传状态 + 虚拟物状态 |
| 阶段闸门 | `GET /{id}/gates` + `/confirm` + `/reopen` | 阶段准入确认，范围变更可 reopen |
| 干系人 | `/api/projects/{id}/stakeholders/*` | 含 `sync-from-meeting/{meeting_id}` 从会议合并 |
| 干系人图谱 | `GET/PUT /api/stakeholder-graph/{project_id}` | 整份 upsert |
| 流程画布 | `GET/PUT /api/workflow-canvas/{project_id}` | 整份 upsert，空项目返回种子图 |
| 智能建议 | `GET /{id}/smart-advice` + `/refresh` | 靠 `inputs_hash` 判断是否需重算，`is_stale` 标记 |
| 项目简报 | `/api/briefs/{kind}` + `/extract` + `/extract/stream` | LLM 抽取草稿，与已有 brief 合并保留用户编辑 |
| 虚拟物补齐 | `GET/POST /api/virtual/{vkey}` | 缺文档时用问答形式补信息，合并进 brief.fields |
| Web 搜索补充 | `POST /api/web-suggest` | 跑 Web 搜索返回 1-3 条候选，用户裁决 |

### 4.5 待办看板

| 能力 | 接口 | 说明 |
| --- | --- | --- |
| 项目待办 | `GET/POST /api/projects/{id}/todos` | |
| 从会议同步 | `POST /api/projects/{id}/todos/sync` | 会议 action_items → 待办 |
| 跨项目视图 | `GET /api/todos/overdue` · `/api/todos/my` | 逾期 / 我的 |
| 批量操作 | `PATCH /api/todos/batch` | |
| 依赖阻塞 | `blocked_by` 自引用外键 | 待办之间可串依赖 |
| **AI 智能分配** | `POST /api/todos/{id}/smart-assign` | 从源会议 transcript 分析最佳负责人 |

### 4.6 会议模块（55 个接口，最大单模块）

#### 录制与转写

| 能力 | 接口 | 说明 |
| --- | --- | --- |
| 空白会议 | `POST /api/meeting` | 占位，配合后续录音 |
| 从文本创建 | `POST /api/meeting/from-text` | 跳过 ASR，直接填 `raw_transcript` |
| 音频上传 | `POST /api/meeting/upload` | 异步 ASR → AI pipeline |
| **半实时录音** | `POST /recording` → `POST /{id}/audio-chunk` → `POST /{id}/finalize` | 边录边传，每段独立可解码 webm，即时转写追加 |
| 音频回放 | `GET /{id}/audio` | 支持 Range 请求，HTML5 `<audio>` 可拖拽 |
| Webhook | `POST /api/meeting/ingest` | ⚠️ **已废弃**，用 `/from-text` 代替 |

#### 会中实时能力

| 能力 | 接口 | 说明 |
| --- | --- | --- |
| 实时调研建议 | `POST /{id}/live-advice`（跑一轮）· `GET`（轮询只读） | 4 类建议，基于截至目前的转写 |
| 建议处置 | `/dismiss` · `/resolve` · `/pend` | pend = 待定，下次同项目调研自动带出来问 |
| 实时纪要 | `POST /{id}/live-minutes`（跑）· `GET`（轮询） | |
| 备忘随笔 | `PUT /{id}/memo` | 录制中 auto-save |

#### 会后 AI 加工（每项都可单独重跑，覆盖式）

| 能力 | 接口 |
| --- | --- |
| 全量 pipeline | `POST /{id}/process`（异步 202） |
| 仅润色 | `POST /{id}/actions/polish` |
| 仅生成纪要 | `POST /{id}/actions/summarize` |
| 规整纪要 | `POST /{id}/actions/generate-summary`（结合 agenda + memo + live_minutes + transcript） |
| 提取需求 | `POST /{id}/actions/extract_requirements` |
| 提取干系人 | `POST /{id}/actions/extract_stakeholders` |
| 业务流程图 | `POST /{id}/actions/extract_process_flows`（Mermaid） |
| 生成配图 | `POST /{id}/actions/extract_illustrations`（可选 `style_id`，风格列表见 `GET /illustration-styles`） |

#### 需求管理

`GET /{id}/requirements` · `POST` 手动新增 · `PATCH /{req_id}` 改单条 · `DELETE /{req_id}`
需求带 `start_seconds` / `end_seconds`，可定位回音频原位置。

#### 干系人改名同步

`POST /{id}/stakeholders/rename` —— 改一个人的名字，同步刷新 `meeting_minutes` 各字段 + `requirements.speaker`。项目级改名（`PATCH /projects/{id}/stakeholders/{sid}`）会同步到该项目所有会议。

#### 导出与同步

| 目标 | 接口 |
| --- | --- |
| DOCX | `GET /{id}/export-docx`（纷享销客 CRM 实施纪要模板） |
| HTML | `GET /{id}/export-html` |
| 知识库 | `POST /{id}/sync-kb` · `POST /{id}/sync-stakeholder-map-kb` |
| 飞书文档 | `POST /{id}/export-feishu`（先 `POST /check-feishu-url` 验权限） |
| 飞书多维表 | `POST /{id}/sync-requirements` · `/sync-action-items` · `/create-action-kanban`（自动建表预置字段） |

#### 会议问答与分享

- `POST /{id}/chat` —— 基于会议内容的 RAG 问答
- `GET/POST/DELETE /{id}/shares` —— 分享给指定用户（幂等），列表带项目成员快照

#### 纪要模板（两套）

| 类型 | 接口前缀 | 能力 |
| --- | --- | --- |
| **内容模板** `meeting_templates` | `/api/templates` | 版本化、单活跃、`POST /evolve` **从人工编辑过的纪要自演化** |
| **版面模板** `meeting_markup_templates` | `/api/markup-templates` | 上传 .md/.docx/图片自动解析、占位符说明、渲染预览、导出 DOCX / MD |

#### 名词校正词典

`/api/term-corrections`（含 `batch-import`）—— 按用户维度的 ASR / 术语纠错表，`(user_id, wrong_term)` 唯一。

### 4.7 会议问卷（组织 + 满意度）

一个问卷对象走三态：

```
time_poll（约时间） --finalize--> attendance（确认出席） --switch-satisfaction--> 满意度问卷
```

| 能力 | 接口 |
| --- | --- |
| 管理端 CRUD | `/api/meeting/surveys` |
| 确定时间 | `POST /{id}/finalize` |
| 切满意度 | `POST /{id}/switch-satisfaction` |
| 统计看板 | `GET /{id}/stats` |
| **免登录填写** | `GET /api/public/survey/{share_token}` · `POST /respond` · `GET /results`（需 `results_visible`） |

> 路由注册顺序有坑：`meeting_survey_router` **必须先于** `meeting.router` 注册，否则 `/{meeting_id}` 通配符会拦截 `/surveys`（main.py:180 有注释说明）。

### 4.8 需求调研工作区

| 能力 | 接口 | 说明 |
| --- | --- | --- |
| 答案录入 | `POST/GET /api/research/responses` | 按 `(bundle_id, item_key)` upsert |
| **从会议自动填** | `POST /api/research/auto-fill-from-meetings` | 用已完成会议的纪要 + 需求生成「建议答案」 |
| 题目增删改 | `POST/DELETE /api/research/questionnaire-items` | |
| **动态追问** | `POST /api/research/follow-up` | 根据父题答案生成子题 |
| 范围分类 | `POST /api/research/classify-scope` | 标 `scope_label` |
| SOW→LTC 映射 | `GET /api/research/ltc-module-map` | SOW 术语映射到标准 LTC 模块，带置信度和 `is_extra` 标记 |
| LTC 字典 | `GET /api/research/ltc-dictionary` | 前端左栏模块清单 |
| 会前问卷导出 | `GET /api/research/questionnaire/export-pre-meeting` | 按角色导出空白模板给客户 |
| 按角色生成 | `POST /api/outputs/{id}/generate-role` | executive / dept_head / frontline / it |
| 按场次生成 | `POST /api/outputs/{id}/generate-session` | 可带 `extra_context` 补充新纪要/新反馈重新出题 |
| 单题重生成 | `POST /api/outputs/{id}/items/{item_key}/regenerate` | |

### 4.9 标准场景库与知识回流（闭环）

这是系统的**质量校验骨架**：147 个标准场景，跨项目沉淀。

#### 场景库管理

| 能力 | 接口 | 权限 |
| --- | --- | --- |
| 域概览 | `GET /api/scenes/domains` | 全员 |
| 列表 / 详情 | `GET /api/scenes` · `/{id}` | 全员 |
| 新增 / 编辑 | `POST /api/scenes` · `PATCH /{id}` | 管理员（写 `SceneChange('edit')` 留痕 + bump version） |
| Excel 批量导入 | `GET /import-template` + `POST /import` | 管理员，编码重复则更新 |
| 阶段枚举 | `GET /api/scenes/stages` | 审核时选阶段用 |
| 变更历史 | `GET /api/scenes/{id}/changes` · `GET /api/scene-changes` | |
| **AI 能力匹配** | `GET /api/ai-capabilities` + `POST /api/scenes/ai-match` | 从纷享已预研 AI 能力目录自动推荐并落库 |
| **调研问题生成** | `POST /api/scenes/{id}/gen-questions`（单个，不落库）· `POST /api/scenes/gen-questions`（批量落库） | 管理员，支持只补空 / overwrite |

#### 项目侧闭环

```
① 场景命中     POST /api/projects/{id}/scene-match       → scene_hit_reports
② 交付物校验   GET  /api/bundles/{id}/scene-coverage     → 该产物漏了哪些应覆盖场景
③ 会议涉及     POST /api/meetings/{id}/scenes/detect     → 这场会碰了哪些场景
④ 调研议程     GET  /api/projects/{id}/research-agenda   → 应覆盖场景 + 关键问题 + 覆盖状态
⑤ 蓝图回流     POST /api/projects/{id}/scene-reflow      → 异步识别新场景，建提案
```

#### 提案两级审批

```
scene-reflow 产出 → pm_pending --PM confirm--> admin_pending --admin approve--> 回写标准场景库 + 留痕
                                                             --admin reject--> 关闭
```

- `POST /api/scene-proposals/{id}/pm-confirm` —— 需项目写权限
- `GET /api/scene-proposals` —— 管理员审核队列
- `POST /{id}/approve` / `/reject` —— 管理员终审

#### 命题网络

`POST /api/projects/{id}/proposition-network`（异步，轮询 `/status/{task_id}`）—— LLM 从项目文档抽命题 → 聚类 → 对齐标准场景，生成「场景 ↔ 命题 ↔ 文档」三层证据链可视化。前端独立全屏页 `/console/projects/:id/network`。

### 4.10 修订学习（自进化）

顾问人工改完交付物 → `analyze_bundle_revision` 异步对比原文/改后 → 提炼「修订要点」存 `bundle_revision_memories` → 下次生成同类交付物时作为 few-shot 喂给 LLM。

| 能力 | 接口 |
| --- | --- |
| 记忆库列表 | `GET /api/admin/bundle-memories` |
| 分类角标 | `GET /api/admin/bundle-memories/kinds` |
| 启用/停用 | `PATCH /{memory_id}`（`enabled` 开关） |
| 删除 | `DELETE /{memory_id}` |
| 前端页 | `/bundle-memories` |

同类机制在会议侧是 `POST /api/templates/evolve`（纪要模板从人工编辑结果自演化）。

### 4.11 系统配置（30 个接口，全管理员）

| 配置项 | 接口前缀 | 说明 |
| --- | --- | --- |
| 模型注册表 | `/api/settings/models` | 增删改可用模型 |
| **任务路由** | `/api/settings/routing/{task}` | 每个 AI 任务用哪个模型——`model_router` 的核心 |
| API Keys | `/api/settings/api-keys` | 值 masked 返回，删除即回退到 `.env` |
| 任务参数 | `/api/settings/task-params/{task}` | 温度 / max_tokens 等 |
| **提示词** | `/api/settings/prompts/{key}` + `/reset` | 线上改 prompt，可单条重置为硬编码默认 |
| Embedding | `/api/settings/embedding` | 支持局部更新 |
| Rerank | `/api/settings/rerank` | |
| 输出 Agent | `/api/settings/output-agents/{key}` | |
| 技能片段 | `/api/settings/skills` | `skills` 表，供交付物生成拼装 prompt |
| 阶段流程 | `/api/settings/stage-flow` + `/reset` + `/meta` | 六阶段可配置 |
| 种子数据 | `POST /api/settings/seed` | |
| 缓存失效 | `POST /api/settings/cache/invalidate` | |

### 4.12 运营与审计

| 能力 | 接口 | 说明 |
| --- | --- | --- |
| 调用流水 | `GET /api/call-logs` | 90 730 行，含 token 数 / 耗时 / 错误 |
| LLM 统计 | `GET /api/call-logs/llm/stats` | 按 model_name 汇总，过去 N 小时 |
| 用户管理 | `/api/users`（增删改 + 重置密码） | |
| 邀请码 | `/api/admin/invite-codes` + `/revoke` | |
| **每日简报** | `POST /api/admin/daily-report/preview`（dry-run）· `/send-now` | beat 每天北京 9:00 自动推企信群 |
| 更新日志 | `/api/admin/changelog`（含 publish/unpublish）+ `/api/public/changelog` | 前台可见的版本公告 |

---

## 5. AI 引擎层

### 5.1 Agent

| Agent | 文件 | 职责 |
| --- | --- | --- |
| `converter_agent` | agents/converter_agent.py | 文档格式 → Markdown |
| `slicer_agent` | agents/slicer_agent.py | 智能切片 + LTC 阶段打标 |
| `kb_agent` | agents/kb_agent.py | 知识库问答 |
| `challenger_agent` | agents/challenger_agent.py | 出题 / 答题 / 裁判 |
| `output_chat` | agents/output_chat.py | 交付物对话式生成 |

### 5.2 Agentic 编排（`services/agentic/`）

| 组件 | 职责 |
| --- | --- |
| `planner.py` | 拆解生成计划（`plan_insight` 等） |
| `executor.py` | 执行，`_build_sources_index` 组装证据（洞察阶段全文喂，30k 字符/文档） |
| `critic.py` | 自我批判 |
| `challenger.py` | 对抗式质检 → `challenge_rounds` |
| `runner.py` | 总调度 |
| `insight_modules.py` / `survey_modules.py` / `outline_modules.py` | 各交付物的模块化拆分 |
| `industry_packs/` | 行业知识包 |
| `research/` | 调研专用编排 |
| `skills_seed.py` | 技能片段种子 |

### 5.3 服务层要点

| 服务 | 作用 |
| --- | --- |
| `model_router.py` | 按 task 路由到不同模型，配置来自 `agent_configs` |
| `embedding_service.py` / `rerank_service.py` | 向量化 + 重排 |
| `vector_store.py` | Qdrant 封装 |
| `scene_match.py` / `scene_ai_match.py` / `scene_coverage.py` / `scene_reflow.py` / `scene_questions.py` / `scene_agenda.py` / `scene_brief.py` / `scene_meeting.py` | 场景库八件套 |
| `proposition_extract.py` | 命题抽取 |
| `revision_learning.py` | 修订学习 |
| `smart_advice.py` | 项目智能建议 |
| `web_search_service.py` | Web 搜索补充 |
| `pptx_codeexec.py` | PPTX 代码执行生成 |
| `redactor.py` | 敏感信息脱敏 |
| `feishu_crypto.py` | 飞书凭证加解密 |
| `project_acl.py` | 项目级权限 |
| `rate_limit.py` | slowapi 限流 |
| `daily_report/` · `meeting/` · `qixin_gateway/` · `sharedev/` · `security/` · `ai/` | 子包 |

---

## 6. 异步任务清单（31 个）

### 6.1 定时调度（Celery beat）

| 任务 | 频率 | 作用 |
| --- | --- | --- |
| `run_scheduled_challenges` | 每 60 秒 | 检查是否有到点的挑战计划 |
| `recover_stale_bundles` | 每 5 分钟 | 卡死 bundle 自动重启 |
| `sweep_meeting_mermaid` | 每小时 | 确定性修复会议流程图里渲染失败的 mermaid（幂等） |
| `send_daily_report` | 每天 09:00（北京） | 推送每日简报到企信群 |

### 6.2 按需触发

**文档类**：`process_document` · `reslice_document` · `infer_doc_types_batch`

**会议类**：`transcribe_meeting` · `process_meeting` · `finalize_recording_meeting` · `extract_plan_sessions`

**交付物生成（13 个）**：`generate_insight` · `generate_kickoff_pptx` · `generate_kickoff_html` · `generate_survey_outline` · `generate_research_plan` · `generate_survey` · `generate_research_report` · `generate_blueprint_design` · `generate_object_field_layout` · `generate_process_setup` · `generate_implementation_plan` · `generate_test_plan` · `generate_acceptance_report`

**调研细粒度**：`generate_survey_role` · `generate_survey_session`

**场景 / 命题**：`precompute_scene_coverage` · `run_scene_reflow` · `build_proposition_network`

**学习 / 运维**：`analyze_bundle_revision` · `preview_daily_report`

---

## 7. 外部集成

| 集成 | 接口前缀 | 能力 | 凭证存储 |
| --- | --- | --- | --- |
| **飞书** | `/api/feishu/credentials`（也在 `/api/meeting/feishu-credentials` 重复暴露一份） | 导出文档、需求同步多维表、行动项看板自动建表 | `users.feishu_app_secret`（加密写入，⚠️ 列本身是明文 varchar） |
| **企信 IM** | `/api/qixin/*` | 会话列表、消息流、手动发消息、每日简报推群 | `users.qixin_app_secret` |
| **sharedev** | `/api/sharedev/credentials` + `/verify` | 租户配置生成（Phase 2 接 sidecar） | `users.sharedev_certificate` |
| **实施配置生成** | `/api/implementation/bundles/{id}/tasks/{tid}/generate-config` · `/tenant-config-zip` | 单 task 用 sharedev skill 生成 XML，整包下载 tenant-config.zip | — |
| **MCP** | `POST /api/mcp`（JSON-RPC 单入口） | **14 个工具**，见下 | `users.mcp_api_key` |
| **Web 搜索** | `POST /api/web-suggest` | 生成时补充外部信息 | — |

### 7.1 MCP 工具清单（`kb-system-mcp` v1.0.0）

| 工具 | 作用 |
| --- | --- |
| `ask_kb` / `search_kb` | 知识库问答 / 检索 |
| `list_projects` / `get_project_status` | 项目列表与状态 |
| `list_outputs` / `get_output` / `generate_output` | 交付物读取与触发生成 |
| `list_documents` / `get_document` | 文档 |
| `get_brief` | 项目简报 |
| `list_meetings` / `get_meeting` / `create_meeting_from_text` | 会议 |
| `get_smart_advice` | 项目智能建议 |

---

## 8. 免登录公开能力

| 能力 | 接口 | 门禁 |
| --- | --- | --- |
| 交付物只读分享 | `GET /api/public/share/{token}` | `bundle_shares.enabled` + 仅「客户向」kind |
| 问卷填写 | `GET /api/public/survey/{token}` · `POST /respond` | `meeting_surveys.share_token` |
| 问卷结果 | `GET /api/public/survey/{token}/results` | 需 `results_visible=true` |
| 更新日志 | `GET /api/public/changelog` · `/latest` · `/{id}` | 仅 `is_published` |

---

## 9. 前端页面地图

### 9.1 顾问工作台 `/console`

| 路由 | 页面 |
| --- | --- |
| `/console` | 工作台首页（非管理员自动跳 `/console/meeting`） |
| `/console/qa` | 智能问答 |
| `/console/projects` · `/projects/:id` | 项目列表 / 详情 |
| `/console/projects/:id/todos` | 待办看板 |
| `/console/projects/:id/canvas` | 流程画布（懒加载） |
| `/console/projects/:id/network` | 命题网络全屏页 |
| `/console/meeting` · `/meeting/new` · `/meeting/:id` | 会议列表 / 新建 / 详情 |
| `/console/meeting/templates` | 纪要模板管理 |
| `/console/meeting/term-corrections` | 名词校正词典 |
| `/console/meeting/surveys` · `/surveys/:id` | 会议问卷 |

### 9.2 知识库后台（根布局，管理员）

**工作区**：`/` 总览 · `/projects` 项目库 · `/documents` 文档管理 · `/chunks` 知识库 · `/qa` 智能问答 · `/review` 审核队列 · `/challenge` 知识挑战（`/challenge/history` 历史）· `/scenes` 场景库中心

**系统**：`/personal-settings` 个人设置 · `/system-config` 系统配置 · `/settings` 系统设置 · `/invite-codes` 邀请码 · `/bundle-memories` 修订学习记忆库

### 9.3 公开 / 辅助页

`/login` · `/register` · `/change-password` · `/survey/:share_token` 问卷填写 · `/api` API 文档 · `/help` 帮助 · `/ds` 设计系统 · `/demo`（`/demo/insight`、`/demo/survey`、`/demo/outline`）· `/redesign/*` 新 UI 独立预览壳

---

## 10. 已知功能层面的问题

1. **两套 UI 并存** —— `IS_NEW_UI` 开关下几乎每个页面都有 legacy / redesign 两个实现，维护成本翻倍。
2. **飞书凭证接口重复暴露** —— `/api/feishu/credentials` 和 `/api/meeting/feishu-credentials` 是同一份逻辑的两个入口。
3. **SSO 未实装** —— `POST /api/auth/sso/{provider}/bind` 只是契约占位，`users.sso_provider` / `sso_subject` 列空置。
4. **`POST /api/meeting/ingest` 已废弃** —— 代码注释明确标 deprecated，但路由仍在。
5. **实施 / 测试 / 验收三阶段是 beta** —— 流程通了但未打磨，`sub_kinds` 都是空列表。
6. **路由注册顺序隐式依赖** —— `meeting_survey_router` 必须先于 `meeting.router`，靠注释维系，无测试保护。
7. **`challenge_rounds`（bundle 自我批判）和 `challenges`（KB 知识挑战）命名撞车** —— 两个完全无关的功能，新人极易混淆。

---

## 附录：323 个接口全清单

按 router 模块分组，格式：`方法 路径 — 说明`，`[权限]` 标注 router 级依赖。

### `documents` — 文档管理（9）

- `POST /api/documents/upload`
- `GET /api/documents`
- `GET /api/documents/{doc_id}`
- `GET /api/documents/{doc_id}/status`
- `GET /api/documents/{doc_id}/chunks`
- `PATCH /api/documents/{doc_id}` — 更新文档的项目归属和/或文档类型。
- `PUT /api/documents/{doc_id}/markdown` — 覆盖式更新文档的 markdown_content(用户在前端预览框里直接编辑提取后的 md)。
- `DELETE /api/documents/{doc_id}`
- `POST /api/documents/batch-infer-type` — 对 completed 且 doc_type 为空的文档批量补推断文档类型（异步 Celery 任务）。

### `chunks` — 知识切片（4）  `[require_module("chunks")]`

- `GET /api/chunks`
- `GET /api/chunks/{chunk_id}`
- `PUT /api/chunks/{chunk_id}`
- `PATCH /api/chunks/{chunk_id}/tags`

### `qa` — 智能问答（11）

- `POST /api/qa/ask`
- `POST /api/qa/ask-stream` — SSE streaming endpoint. Events: data: {...}
- `POST /api/qa/generate-doc`
- `GET /api/qa/conversations`
- `POST /api/qa/conversations`
- `GET /api/qa/conversations/{conv_id}`
- `PATCH /api/qa/conversations/{conv_id}`
- `DELETE /api/qa/conversations/{conv_id}`
- `POST /api/qa/feedback`
- `GET /api/qa/unanswered`
- `POST /api/qa/unanswered/{qlog_id}/resolve`

### `challenge` — 知识挑战（9）  `[require_module("challenge")]`

- `POST /api/challenge/run-stream` — SSE streaming challenge endpoint.
- `GET /api/challenge/runs`
- `GET /api/challenge/runs/{run_id}`
- `GET /api/challenge/schedules`
- `POST /api/challenge/schedules`
- `PUT /api/challenge/schedules/{schedule_id}`
- `DELETE /api/challenge/schedules/{schedule_id}`
- `POST /api/challenge/schedules/{schedule_id}/toggle`
- `GET /api/challenge/gaps`

### `review` — 审核队列（4）  `[require_admin]`

- `GET /api/review/queue`
- `POST /api/review/{review_id}/approve`
- `POST /api/review/{review_id}/reject`
- `POST /api/review/batch-approve` — 批量通过：缺省通过所有 pending 条，或按 review_ids 指定。返回实际通过条数。

### `export` — 知识导出（2）  `[require_admin]`

- `POST /api/transfer/export`
- `GET /api/transfer/logs`

### `agent_settings` — 系统配置（模型/提示词/技能）（30）  `[require_admin]`

- `GET /api/settings/models`
- `PUT /api/settings/models/{key}`
- `POST /api/settings/models`
- `DELETE /api/settings/models/{key}`
- `GET /api/settings/routing`
- `PUT /api/settings/routing/{task}`
- `DELETE /api/settings/routing/{task}`
- `GET /api/settings/api-keys` — List all API keys with masked values.
- `PUT /api/settings/api-keys/{key}`
- `DELETE /api/settings/api-keys/{key}` — Remove DB override, falling back to .env value.
- `GET /api/settings/task-params`
- `PUT /api/settings/task-params/{task}`
- `GET /api/settings/prompts`
- `GET /api/settings/prompts/{key}`
- `PUT /api/settings/prompts/{key}`
- `POST /api/settings/prompts/{key}/reset` — Reset a single prompt to its hardcoded default.
- `POST /api/settings/seed`
- `POST /api/settings/cache/invalidate`
- `GET /api/settings/skills`
- `POST /api/settings/skills`
- `PUT /api/settings/skills/{skill_id}`
- `DELETE /api/settings/skills/{skill_id}`
- `GET /api/settings/output-agents`
- `PUT /api/settings/output-agents/{key}`
- `GET /api/settings/embedding` — 读 embedding 配置;api_key 返回 masked,api_base / model 明文。
- `PUT /api/settings/embedding` — 支持局部更新:只传要改的字段。
- `DELETE /api/settings/embedding/{key}` — 删 DB 覆盖,回退到 .env 取值。
- `GET /api/settings/rerank`
- `PUT /api/settings/rerank`
- `DELETE /api/settings/rerank/{key}`

### `auth` — 认证（10）

- `GET /api/auth/captcha` — 生成新的图形验证码挑战。返回 captcha_id + base64 PNG data URL。
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/change-password`
- `POST /api/auth/refresh` — 用当前有效 token 换一个新的 7 天 token（无需重新输密码）。
- `POST /api/auth/mcp-key` — 生成（或轮换）当前用户的 MCP API Key。返回完整 key，仅本次可见。需管理员授权 api_enabled。
- `GET /api/auth/mcp-key` — 返回当前 MCP Key 是否已设置（脱敏）。
- `DELETE /api/auth/mcp-key` — 撤销当前用户的 MCP API Key。
- `POST /api/auth/sso/{provider}/bind` — SSO 绑定占位：仅声明契约，未实装。

### `admin_invite_codes` — 邀请码（3）

- `POST /api/admin/invite-codes`
- `GET /api/admin/invite-codes`
- `POST /api/admin/invite-codes/{ic_id}/revoke`

### `admin_bundle_memories` — 修订学习记忆库（4）

- `GET /api/admin/bundle-memories`
- `GET /api/admin/bundle-memories/kinds` — 每个 kind 的启用/停用计数,给前端 tab 做角标。
- `PATCH /api/admin/bundle-memories/{memory_id}`
- `DELETE /api/admin/bundle-memories/{memory_id}`

### `admin_daily_report` — 每日简报（2）  `[require_admin]`

- `POST /api/admin/daily-report/preview` — dry-run:组装文本,不推群。返回 {day, chars, preview, chat_id, bot_user_id}。
- `POST /api/admin/daily-report/send-now` — 立刻推群。返回 {day, sent, message_id?, error?, preview, ...}。

### `projects` — 项目管理（17）  `[require_project_access]`

- `GET /api/projects/meta` — 前端下拉用:合法模块 + 文档类型枚举 + 行业(一级老枚举 + 四级树)。
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/{project_id}`
- `PATCH /api/projects/{project_id}`
- `DELETE /api/projects/{project_id}`
- `POST /api/projects/{project_id}/transfer-owner` — 把项目所有者转让给另一个用户。
- `POST /api/projects/{project_id}/generate_profile` — LLM 一次成稿生成客户画像草稿（不入库，返回字符串，前端确认后再 PATCH 写回）。
- `GET /api/projects/{project_id}/documents`
- `GET /api/projects/{project_id}/handoff-bundle`
- `POST /api/projects/{project_id}/insight-checkup` — 生成前体检 — 跑 plan_insight 看每模块字段够不够、缺什么。
- `GET /api/projects/{project_id}/collaborators` — 返回 owner + 全部协作者(便于前端显示一张「成员」表)。
- `POST /api/projects/{project_id}/collaborators`
- `PATCH /api/projects/{project_id}/collaborators/{user_id}`
- `PATCH /api/projects/{project_id}/collaborators/{user_id}/project-role` — 设置成员的项目角色分类(pm/consultant/customer)。指派 pm 时清掉其他协作者的 pm(单 PM)。
- `DELETE /api/projects/{project_id}/collaborators/{user_id}`
- `GET /api/projects/_/users/search` — 按 username / email / full_name 模糊搜活跃用户,只返回 id+username+full_name+email。

### `users` — 用户管理（5）  `[require_admin]`

- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/{user_id}`
- `POST /api/users/{user_id}/reset-password`
- `DELETE /api/users/{user_id}`

### `mcp` — MCP 网关（1）

- `POST /api/mcp`

### `coverage` — 覆盖缺口（1）  `[require_module("review")]`

- `GET /api/coverage/gaps` — Top N 覆盖缺口，按 fail_count 降序。

### `call_logs` — 调用流水（2）  `[require_admin]`

- `GET /api/call-logs`
- `GET /api/call-logs/llm/stats` — LLM 调用统计:按 model_name 汇总,过去 N 小时。

### `outputs` — 交付物生成（17）

- `POST /api/outputs/generate`
- `POST /api/outputs/{bundle_id}/generate-role` — 按单个角色增量生成调研问卷题目(2026-06-03)。
- `POST /api/outputs/{bundle_id}/items/{item_key}/regenerate` — 单题手动重新生成(2026-06-03)。
- `POST /api/outputs/{bundle_id}/generate-session` — 按单个场次手动触发生成调研问卷题目(2026-06-03)。
- `GET /api/outputs`
- `GET /api/outputs/stage-summary` — 轻量阶段状态汇总:返回所有可见项目下每个 (project_id, kind, status) 的去重三元组。
- `GET /api/outputs/latest-by-kind` — 项目详情页 chip 专用:返回该项目下每个 kind 的最新 done + inflight bundle。
- `GET /api/outputs/{bundle_id}`
- `GET /api/outputs/{bundle_id}/challenges` — 挑战回合详情(每轮 critique JSON + 重生成的模块)。前端工作台「挑战回合」面板用。
- `GET /api/outputs/{bundle_id}/download`
- `GET /api/outputs/{bundle_id}/view` — Inline view (no Content-Disposition: attachment). 用于 HTML 幻灯片在线播放。
- `POST /api/outputs/{bundle_id}/share` — 为「客户向」交付物生成 / 重启免登录只读分享链接。
- `GET /api/outputs/{bundle_id}/share` — 查询某交付物当前分享状态(前端打开分享面板时拉)。
- `DELETE /api/outputs/{bundle_id}/share` — 关闭分享:已发出的公开链接立即失效(记录保留,可再次开启)。
- `PUT /api/outputs/{bundle_id}/content` — 编辑器内点保存:把 markdown 正文写回 bundle.content_md。
- `POST /api/outputs/{bundle_id}/markdown-override` — 用户人工修订完蓝图 / 对象字段表 / 流程建设表 / 调研报告后,
- `PUT /api/outputs/{bundle_id}/html` — 编辑器内点保存：把整份 HTML 重写到 MinIO。仅对 .html 类型 bundle 有效。

### `meeting_survey` — 会议问卷（管理端）（8）

- `GET /api/meeting/surveys`
- `POST /api/meeting/surveys`
- `GET /api/meeting/surveys/{survey_id}`
- `PUT /api/meeting/surveys/{survey_id}`
- `DELETE /api/meeting/surveys/{survey_id}`
- `POST /api/meeting/surveys/{survey_id}/finalize` — 确定会议时间,从 time_poll 切换为 attendance 模式。
- `POST /api/meeting/surveys/{survey_id}/switch-satisfaction` — 会议结束后切换为满意度问卷模式。
- `GET /api/meeting/surveys/{survey_id}/stats` — 返回问卷统计数据(看板用)。

### `public_survey` — 会议问卷（公开）（3）

- `GET /api/public/survey/{share_token}` — 获取问卷信息(免登录)。
- `POST /api/public/survey/{share_token}/respond` — 提交问卷回答(免登录)。
- `GET /api/public/survey/{share_token}/results` — 查看公开结果(需 results_visible=True)。

### `meeting` — 会议（55）

- `POST /api/meeting` — 创建空白会议(占位,后续配合 WS 录音或 upload)。
- `POST /api/meeting/from-text` — 从文本直接创建会议,跳过 ASR。raw_transcript 立即填好。
- `GET /api/meeting` — 列出当前用户能访问的会议(admin 看全部)。按 created_at 倒序。
- `GET /api/meeting/page` — 分页 + 多条件筛选的会议列表(列表页用)。返回 {items,total,page,page_size,uploaders}。
- `GET /api/meeting/illustration-styles` — 返回可用的配图风格列表。
- `GET /api/meeting/{meeting_id}` — 获取会议详情(含 requirements)。
- `PATCH /api/meeting/{meeting_id}` — 部分更新会议。
- `DELETE /api/meeting/{meeting_id}` — 删除会议(级联删除 requirements,由 FK ondelete=CASCADE 处理)。
- `GET /api/meeting/{meeting_id}/requirements` — 列出某会议的所有需求。
- `PUT /api/meeting/{meeting_id}/project` — 关联或解除 KB 项目。
- `PUT /api/meeting/{meeting_id}/stakeholder-map` — 直接覆盖 stakeholder_map(用于前端手动编辑后保存)。
- `PUT /api/meeting/{meeting_id}/process-flows` — 直接覆盖 process_flows(用于前端手动编辑后保存)。
- `PUT /api/meeting/{meeting_id}/edited-minutes` — 保存用户手动编辑后的会议纪要，用于模板演化。
- `PATCH /api/meeting/{meeting_id}/requirements/{req_id}` — 更新单条需求字段。
- `POST /api/meeting/{meeting_id}/requirements` — 手动新增一条需求。
- `DELETE /api/meeting/{meeting_id}/requirements/{req_id}` — 删除单条需求。
- `POST /api/meeting/{meeting_id}/stakeholders/rename` — 把改了名的干系人引用同步到 meeting_minutes 各字段 + requirements.speaker。
- `POST /api/meeting/upload` — 上传音频文件创建会议。后台异步:ASR → AI pipeline。
- `POST /api/meeting/recording` — 新建一个空的录音会议(半实时边录边传用),返回 meeting_id。
- `POST /api/meeting/{meeting_id}/audio-chunk` — 半实时:上传一个录音分段(独立可解码 webm),即时转写并追加到 raw_transcript。
- `POST /api/meeting/{meeting_id}/finalize` — 半实时录音停止:收尾。空转写 → failed;否则 status=processing 并派发
- `POST /api/meeting/{meeting_id}/live-advice` — 跑一轮实时调研建议分析(基于截至目前转写),返回当前 open 建议(4 类)。
- `GET /api/meeting/{meeting_id}/live-advice` — 只读当前 open 建议(不跑 LLM,前端轮询用);include_resolved 时附带已完成清单。
- `POST /api/meeting/{meeting_id}/live-advice/{advice_id}/dismiss` — 顾问手动删除(忽略)一条建议。
- `POST /api/meeting/{meeting_id}/live-advice/{advice_id}/resolve` — 顾问手动标记一条建议为已完成(成果)。
- `POST /api/meeting/{meeting_id}/live-advice/{advice_id}/pend` — 顾问把一条建议标为「待定」—— 存着,下次同项目调研自动带出来问。
- `PUT /api/meeting/{meeting_id}/memo` — 录制中保存用户备忘随笔(auto-save)。
- `POST /api/meeting/{meeting_id}/live-minutes` — 跑一轮实时纪要提取(基于截至目前转写),返回当前 live_minutes。
- `GET /api/meeting/{meeting_id}/live-minutes` — 只读:返回当前 live_minutes + agenda + memo(不跑 LLM,前端轮询用)。
- `POST /api/meeting/{meeting_id}/actions/generate-summary` — 生成规整会议纪要:结合 agenda + memo + live_minutes + transcript,输出结构化纪要。
- `POST /api/meeting/{meeting_id}/process` — 触发 AI pipeline(异步,通过 Celery)。立即返回 202。
- `POST /api/meeting/{meeting_id}/actions/polish` — 仅润色 raw_transcript,写回 polished_transcript。
- `POST /api/meeting/{meeting_id}/actions/summarize` — 仅生成纪要。优先用 polished_transcript,fallback raw。
- `GET /api/meeting/{meeting_id}/export-docx` — 按「纷享销客 CRM 实施纪要模板」生成 docx。2026-05-12。
- `GET /api/meeting/{meeting_id}/export-html` — 导出会议纪要 HTML（参考 deepseek_html 布局风格）。
- `POST /api/meeting/{meeting_id}/actions/extract_requirements` — 仅提取需求(覆盖式重建)。
- `POST /api/meeting/{meeting_id}/actions/extract_stakeholders` — 仅提取干系人图谱。
- `POST /api/meeting/{meeting_id}/actions/extract_process_flows` — 仅识别业务流程并生成 Mermaid 流程图(覆盖式)。
- `POST /api/meeting/{meeting_id}/actions/extract_illustrations` — 从会议内容生成配图(覆盖式)。可选 body: {"style_id": "..."}。
- `POST /api/meeting/{meeting_id}/sync-kb` — 把会议纪要同步到 kb-system 知识库(写入 Document 表)。
- `POST /api/meeting/{meeting_id}/sync-stakeholder-map-kb` — 把干系人图谱同步到 kb-system 知识库。
- `GET /api/meeting/feishu-credentials` — 读取当前用户的飞书配置状态(不返 secret)。
- `PUT /api/meeting/feishu-credentials` — 配置/更新当前用户的飞书凭证。secret 加密存储。
- `DELETE /api/meeting/feishu-credentials` — 清除当前用户的飞书凭证。
- `POST /api/meeting/{meeting_id}/check-feishu-url` — 解析飞书 URL 并检查权限。
- `POST /api/meeting/{meeting_id}/export-feishu` — 把会议纪要导出为飞书 docx 文档。
- `POST /api/meeting/{meeting_id}/sync-requirements` — 把会议提取出的需求清单批量写入飞书多维表。
- `POST /api/meeting/{meeting_id}/sync-action-items` — 把会议纪要中的待办事项(action_items)写入飞书多维表看板。
- `POST /api/meeting/{meeting_id}/create-action-kanban` — 自动创建一个飞书多维表,预置看板字段,用于存放会议待办。
- `GET /api/meeting/{meeting_id}/audio` — 流式返回会议录音文件,支持 Range 请求(用于 HTML5 <audio> 拖拽播放)。
- `POST /api/meeting/{meeting_id}/chat` — 基于会议内容的智能问答(RAG 风格)。
- `POST /api/meeting/ingest` — Webhook for meeting transcript ingestion — deprecated,使用 POST /from-text 代替。
- `GET /api/meeting/{meeting_id}/shares` — 列出当前会议的分享对象,以及(若绑定了项目)项目成员快照。
- `POST /api/meeting/{meeting_id}/shares` — 把会议分享给一批用户(幂等:已存在的跳过)。
- `DELETE /api/meeting/{meeting_id}/shares/{user_id}` — 取消单个用户对该会议的分享。

### `feishu_credentials` — 飞书凭证（3）

- `GET /api/feishu/credentials` — 读取当前用户的飞书配置状态(不返 secret)。
- `PUT /api/feishu/credentials` — 配置/更新当前用户的飞书凭证。secret 加密存储。
- `DELETE /api/feishu/credentials` — 清除当前用户的飞书凭证。

### `sharedev_credentials` — sharedev 凭证（4）

- `GET /api/sharedev/credentials` — 读取当前用户的 sharedev 配置状态(不返 cert 明文,只返 domain + configured 标志)。
- `PUT /api/sharedev/credentials` — 配置/更新当前用户的 sharedev 凭证。cert 加密存储。
- `DELETE /api/sharedev/credentials` — 清除当前用户的 sharedev 凭证。
- `POST /api/sharedev/credentials/verify` — 调 sidecar 验证凭证可用(Phase 2 接入实际 sidecar HTTP 调用)。

### `qixin_credentials` — 企信凭证（3）

- `GET /api/qixin/credentials` — 读取凭证状态。不回 secret 明文,app_id 也只返前 4 + 后 4 位作展示。
- `PUT /api/qixin/credentials` — 配置/更新当前用户企信 Bot 凭证。
- `DELETE /api/qixin/credentials` — 清除企信凭证 + 断开 SSE 连接。

### `qixin` — 企信消息（3）

- `GET /api/qixin/conversations` — 当前用户的企信会话列表。
- `GET /api/qixin/conversations/{chat_id}/messages` — 单会话消息流(时间倒序)。
- `POST /api/qixin/conversations/{chat_id}/send` — 手动发消息到指定企信会话(2026-05-29)。

### `implementation` — 实施配置生成（2）

- `POST /api/implementation/bundles/{bundle_id}/tasks/{task_id}/generate-config` — 对单个 task 触发 LLM 用对应 sharedev skill 生成 xml 配置文件内容。
- `GET /api/implementation/bundles/{bundle_id}/tenant-config-zip` — 把 bundle 里所有已生成 config 的 task 打包成 tenant-config.zip 流式下载。

### `template` — 纪要内容模板（6）

- `GET /api/templates` — 列出所有模板，按版本降序。
- `GET /api/templates/active` — 返回当前活跃模板，若无则返回空 dict。
- `GET /api/templates/{template_id}` — 按 ID 获取单个模板。
- `POST /api/templates` — 手动创建新模板（不自动激活）。
- `POST /api/templates/{template_id}/activate` — 激活某模板（会去激活其他所有模板）。
- `POST /api/templates/evolve` — 后台触发模板演化。

### `markup_template` — 纪要版面模板（10）

- `GET /api/markup-templates` — 列出所有版面模板（按更新时间倒序）。
- `GET /api/markup-templates/placeholders` — 返回可用占位符说明，供前端展示。
- `GET /api/markup-templates/{template_id}` — 按 ID 获取单个模板。
- `POST /api/markup-templates` — 手动创建模板（输入 Markdown）。
- `POST /api/markup-templates/upload` — 上传模板文件（.md / .docx / 图片），自动解析为 Markdown 并保存。
- `PATCH /api/markup-templates/{template_id}` — 更新模板名称、描述或内容。
- `DELETE /api/markup-templates/{template_id}` — 删除模板（内置模板不可删除）。
- `POST /api/markup-templates/{template_id}/render` — 用指定模板渲染某场会议的数据，返回渲染后 Markdown。
- `POST /api/markup-templates/{template_id}/export-docx` — 用指定模板渲染会议数据并导出为 DOCX 文件。
- `POST /api/markup-templates/{template_id}/export-md` — 用指定模板渲染会议数据并导出为 Markdown 文件。

### `output_chats` — 交付物对话（5）

- `POST /api/output-chats`
- `POST /api/output-chats/{conv_id}/message`
- `GET /api/output-chats/{conv_id}`
- `POST /api/output-chats/{conv_id}/generate`
- `GET /api/output-chats`

### `public_share` — 交付物公开分享（1）

- `GET /api/public/share/{token}`

### `changelog` — 更新日志（9）

- `GET /api/public/changelog`
- `GET /api/public/changelog/latest`
- `GET /api/public/changelog/{entry_id}`
- `GET /api/admin/changelog`
- `POST /api/admin/changelog`
- `PUT /api/admin/changelog/{entry_id}`
- `DELETE /api/admin/changelog/{entry_id}`
- `POST /api/admin/changelog/{entry_id}/publish`
- `POST /api/admin/changelog/{entry_id}/unpublish`

### `briefs` — 项目简报（4）

- `GET /api/briefs/{kind}`
- `POST /api/briefs/{kind}/extract` — LLM 抽取草稿（不入库）。前端拿到后与已有 brief 合并（保留用户已编辑字段）展示。
- `POST /api/briefs/{kind}/extract/stream` — SSE 流式抽取：逐阶段吐进度，最终事件携带 merged fields。
- `PUT /api/briefs/{kind}`

### `stage_flow` — 阶段流程配置（4）

- `GET /api/settings/stage-flow` — 读取项目流程配置。所有登录用户可读(前台 ConsoleProjectDetail 也要用)。
- `PUT /api/settings/stage-flow` — 全量替换。仅管理员。
- `POST /api/settings/stage-flow/reset` — 重置为内置默认(物理删除自定义配置,下次 GET 走硬编码默认)。
- `GET /api/settings/stage-flow/meta` — 返回元信息:可选的 icon / kind 列表。前端编辑器下拉用。

### `doc_checklist` — 文档清单（1）  `[require_project_access]`

- `GET /api/doc-checklist/{project_id}` — 返回该项目在指定 stage 下的文档清单 + 已上传状态 + 虚拟物状态。

### `virtual_artifacts` — 虚拟物补齐（2）

- `GET /api/virtual/{vkey}` — 返回虚拟物的「问题清单 + 当前已填值」。前端用 V2GapFiller 渲染。
- `POST /api/virtual/{vkey}/submit` — 合并答案到 brief.fields。不触发生成,只入库。

### `web_suggest` — Web 搜索建议（1）

- `POST /api/web-suggest` — 跑 Web 搜索,返回 1-3 条候选答案给用户裁决。

### `stakeholder_graph` — 干系人图谱（2）

- `GET /api/stakeholder-graph/{project_id}` — 读取项目的干系人图谱,空项目返回空结构。
- `PUT /api/stakeholder-graph/{project_id}` — upsert 整份图谱 — 每次保存覆盖。

### `workflow_canvas` — 流程画布（2）

- `GET /api/workflow-canvas/{project_id}` — 读取项目画布,空项目返回空结构(前端据此生成种子图)。
- `PUT /api/workflow-canvas/{project_id}` — upsert 整份画布 — 每次保存覆盖。

### `research` — 调研工作区（10）

- `POST /api/research/responses` — 顾问录入或更新一个答案。按 (bundle_id, item_key) upsert。
- `GET /api/research/responses` — 拉取一个 bundle 下所有顾问答案,按 item_key 索引返回。
- `POST /api/research/auto-fill-from-meetings` — 从本项目下已完成的会议(纪要 + 需求)给问卷题目生成「建议答案」。
- `POST /api/research/classify-scope`
- `GET /api/research/ltc-module-map` — 返回项目的 SOW → LTC 字典映射结果。前端工作区显示用。
- `GET /api/research/ltc-dictionary` — 返回 LTC 字典全量。前端工作区左栏渲染模块清单 / 节点池用。
- `POST /api/research/questionnaire-items` — 新增或更新一道题。
- `POST /api/research/follow-up` — 根据父题答案动态生成追问(需求 6)。
- `DELETE /api/research/questionnaire-items` — 删除一道题(以及它的所有动态追问子题)。
- `GET /api/research/questionnaire/export-pre-meeting` — 按角色导出会前调研问卷(纯空白模板,客户拿到从零填)。

### `project_stakeholders` — 项目干系人（5）

- `GET /api/projects/{project_id}/stakeholders`
- `POST /api/projects/{project_id}/stakeholders`
- `PATCH /api/projects/{project_id}/stakeholders/{stakeholder_id}` — 编辑人物。如果改了 name,同步到该 project 所有 meeting 的引用。
- `DELETE /api/projects/{project_id}/stakeholders/{stakeholder_id}`
- `POST /api/projects/{project_id}/stakeholders/sync-from-meeting/{meeting_id}` — 把 meeting.stakeholder_map.stakeholders 合并到 project_stakeholders。

### `project_gates` — 阶段闸门（3）

- `GET /api/projects/{project_id}/gates` — 列出项目所有闸门及当前状态(缺行视为 open)。
- `POST /api/projects/{project_id}/gates/{gate_key}/confirm` — 一键确认放行某闸门。
- `POST /api/projects/{project_id}/gates/{gate_key}/reopen` — 撤销确认,把闸门改回未确认(范围变更时用)。

### `scenes` — 标准场景库（14）

- `GET /api/scenes/domains` — 各域场景数(概览卡)。
- `GET /api/scenes` — 列出场景(可按域 / 关键词过滤)。
- `GET /api/scenes/import-template` — 下载场景导入 Excel 模板(管理员)。
- `POST /api/scenes` — 手动新增单个场景(管理员)。
- `POST /api/scenes/import` — 从 Excel 批量导入场景(管理员)。编码重复则更新已有场景。
- `GET /api/scenes/stages` — 返回已有的不重复 (domain, stage, stage_label) 列表,供审核时选择阶段。
- `GET /api/scenes/{scene_id}`
- `PATCH /api/scenes/{scene_id}` — 编辑场景内容/标签(仅管理员)。保存写 SceneChange('edit') 留痕并 bump version。
- `GET /api/scenes/{scene_id}/changes`
- `GET /api/scene-changes` — 全库最近变更历史。
- `GET /api/ai-capabilities` — 纷享已预研 AI 能力目录(场景 AI 能力匹配用)。
- `POST /api/scenes/ai-match` — AI 自动匹配:给场景(可按域)从 AI 能力目录里推荐并落库匹配。仅管理员。
- `POST /api/scenes/{scene_id}/gen-questions` — 单场景生成关键调研问题(不落库,前端填入可编辑区)。仅管理员。
- `POST /api/scenes/gen-questions` — 批量生成关键调研问题并落库(可按域;默认只补空,overwrite 全量重写)。仅管理员。

### `scene_ops` — 场景命中与回流（11）

- `POST /api/projects/{project_id}/scene-match` — 对照标准场景库跑一次命中(LLM,同步),存最新报告并返回。
- `GET /api/projects/{project_id}/scene-match`
- `GET /api/bundles/{bundle_id}/scene-coverage` — 交付物场景覆盖校验(闭环②):该产物正文覆盖了项目多少应覆盖场景,漏了哪些。
- `GET /api/projects/{project_id}/research-agenda` — 调研议程:应覆盖场景(按域/阶段)+ 每场景关键问题 + 覆盖状态。
- `POST /api/projects/{project_id}/scene-reflow` — 蓝图完成:后台异步跑 LLM 识别 → 建提案(pm_pending)。立即返回 task_id,前端轮询状态。
- `GET /api/scene-reflow/status/{task_id}` — 轮询回流任务状态。ready=True 时前端重新拉 scene-proposals 刷新列表。
- `GET /api/projects/{project_id}/scene-proposals`
- `POST /api/scene-proposals/{proposal_id}/pm-confirm` — PM 确认(pm_pending → admin_pending)。需项目写权限(owner/读写/admin)。
- `GET /api/scene-proposals` — 管理员审核队列(后台「场景库更新」页签)。默认列待审核。
- `POST /api/scene-proposals/{proposal_id}/approve` — 管理员通过 → 回写标准场景库 + 写变更留痕。
- `POST /api/scene-proposals/{proposal_id}/reject`

### `meeting_scenes` — 会议涉及场景（2）

- `GET /api/meetings/{meeting_id}/scenes`
- `POST /api/meetings/{meeting_id}/scenes/detect`

### `proposition_network` — 命题网络（3）

- `POST /api/projects/{project_id}/proposition-network` — 异步构建项目命题网络(LLM 抽取 + 聚类 + 场景对齐)。
- `GET /api/projects/{project_id}/proposition-network/status/{task_id}` — 轮询命题网络构建状态。
- `GET /api/projects/{project_id}/proposition-network` — 获取项目最新命题网络数据(用于前端可视化)。

### `smart_advice` — 项目智能建议（2）

- `GET /api/projects/{project_id}/smart-advice` — 获取项目智能建议。
- `POST /api/projects/{project_id}/smart-advice/refresh` — 强制重新生成建议(用户手动点刷新按钮)。

### `project_todos` — 待办看板（9）

- `GET /api/projects/{project_id}/todos`
- `GET /api/todos/overdue` — 跨项目查询逾期待办。
- `GET /api/todos/my` — 跨项目按负责人筛选待办。
- `POST /api/projects/{project_id}/todos`
- `POST /api/projects/{project_id}/todos/sync`
- `PATCH /api/todos/{todo_id}`
- `PATCH /api/todos/batch` — 批量更新待办。
- `DELETE /api/todos/{todo_id}`
- `POST /api/todos/{todo_id}/smart-assign` — AI 智能分配：从源会议 transcript 分析最佳负责人。

### `term_correction` — 名词校正词典（5）

- `GET /api/term-corrections` — 列出当前用户的所有名词校正记录。
- `POST /api/term-corrections` — 新增一条名词校正。
- `PUT /api/term-corrections/{term_id}` — 更新一条名词校正。
- `DELETE /api/term-corrections/{term_id}` — 删除一条名词校正。
- `POST /api/term-corrections/batch-import` — 批量导入名词校正。
