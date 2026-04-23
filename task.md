# 任务跟踪

## 当前迭代：功能提升 + QA bug 修复（2026-04-23 第二批）

背景：Block 1 基建修完后继续做用户感知最强的功能改进。用户要求 Block A + B 一起做，再排查 QA 老返回"无内容"的 bug，部署走 commit + merge 到 main。

### QA Bug · 拒答规则过严（关键）

- [x] **Root cause**：[backend/prompts/qa.py:14](backend/prompts/qa.py:14) 的边界规则让模型只要判断"切片和问题业务域不完全对齐"就拒答，向量检索会返回 top-K 但模型被 prompt 强制拒答
- [x] 重写 prompt 边界规则：默认尽量作答，只有完全跨领域才拒答
- [x] 加启动时自动升级逻辑（`seed_defaults` 检测旧版标记字符串 → 强制替换 DB 中的 QA_PROMPT）

### Block A · 感知增强（快速收益）

- [x] **A1** 答案 thumbs up / down / 收藏 ⭐
  - 新表 `question_logs` + `answer_feedbacks`；QA 每次调用自动落日志
  - 拒答 / 点踩 → `unresolved=True` 进未解决队列
  - 点赞 / 收藏 → resolve
  - 前端 QA 每条 assistant 消息下方三按钮
- [x] **A2** Chunk 热度（citation_count + last_cited_at）
  - chunks 加两列 + 索引；QA/文档生成命中时异步自增
  - 前端 Chunks 页：🔥 徽章（≥5 次）/ 👻 未引用徽章
  - 筛选器："全部 / 热门 / 未引用"切换
- [x] **A3** 未解决问题队列
  - `question_logs.unresolved` 字段；拒答 / 点踩自动归队
  - `/api/qa/unanswered` + `/api/qa/unanswered/{id}/resolve`
  - Dashboard 卡片展示 Top 5
- [x] **A4** QA 引用跳原文
  - 响应 source 增加 `document_id` / `source_section`
  - SourcePanel 显示 section path + "看原文"链接 `/documents?doc=X#chunk-Y`

### Block B · 体验质变

- [x] **B1** QA 多轮对话
  - `/api/qa/ask`、`/ask-stream` 新增 `history` 参数；kb_agent 拼 prompt 带前 6 轮
  - 前端 submit 时构造 history payload（当前会话已完成的 user+assistant 对）
  - 对话持久化（Conversation 表 CRUD）已就绪；前端当前仍用 localStorage，同步 API 的工作为后续可选迭代
- [x] **B2** Chunk 内联编辑
  - `/api/chunks/{id}` PUT 已支持 content 字段（会触发 re-embed + Qdrant upsert）
  - 前端 Chunks 编辑面板加"修改切片内容"开关，避免误触发重嵌
  - 同批次可同时改标签 + 内容，一次性保存

### 新增 · 虚拟项目经理 persona

- [x] 新 prompt `PM_QA_PROMPT`（项目 PM 视角 + 状态/决策/风险四类回答结构）
- [x] Qdrant search 支持 `document_ids` 过滤（`MatchAny` on payload.document_id）
- [x] kb_agent 增加 `persona` / `project_id` 参数；PM 模式下先拉项目文档 ID 集合再检索
- [x] 前端 QA header 增加 persona 切换 + project 下拉；PM 模式必须选项目
- [x] 消息 / 对话记录 persona + projectId，切换对话自动恢复

### 部署

- [x] **git merge 到 main**（按用户要求本次只提交 + 合并，不 rsync）

### 后续修补（部署后发现）

- [x] **QA 多轮 prompt 污染**：history 硬塞 prompt 文本让模型看到元信息。改用真正的 user/assistant messages 数组
- [x] **QA_PROMPT 强升级**：加版本哨兵 `<!-- QA_PROMPT_VERSION:2 -->`；启动时缺哨兵就覆盖
- [x] **回答截断**：移除 kb_agent 里 `max_tokens=2000` 硬编码，走 config 默认 8000
- [x] **双等待框**：空 assistant placeholder 不渲染外壳，让 thinking indicator 独占
- [x] **路由与参数页保存按钮换行**：th `w-20` → `w-1 whitespace-nowrap`，按钮 `flex` → `inline-flex`

---

## 对外 API / MCP 扩展（2026-04-23）

- [x] MCP `ask_kb` 增加 `persona` + `project`（支持 ID 或名称）
- [x] MCP 新增 `list_projects` 工具，支持按 query 模糊过滤
- [x] MCP `search_kb` 增加可选 `project` 过滤
- [x] MCP `_resolve_project`：ID 精确 → 名称精确（大小写不敏感）→ 名称/客户模糊唯一命中
- [x] `initialize` instructions 加典型调用流程提示
- [x] REST 鉴权 `get_current_user` / `_optional` 同时接受 JWT 和 MCP API Key（`mcp_xxx`），外部脚本可直接用一把 MCP Key 走 REST `/api/qa/ask`
- [x] commit + merge main

---

## 待启动（用户确认当前批次测试通过后再做）

### #8 Chunk → 原文档定位跳转
- QA 引用面板的 `看原文` 链接已经带 `/documents?doc=X#chunk-Y`，但 Documents 页面目前不解析 hash
- 需要：Documents 详情抽屉解析 `#chunk-X`，自动滚动到对应 chunk 位置 / 高亮
- 已有数据：chunks.source_section 存 section path；后端 QA sources 已透出
- 工作量：S

### #9 文档摘要 + 自动生成 FAQ
- 文档转化完成后触发 LLM 调用：3 句话摘要 + Top 5 FAQ
- DB：`documents` 加 `summary TEXT`、`faq JSON`
- 流程：`_process_document_async` 入库完成后 append 一个摘要任务（同步或 Celery 子任务）
- 前端：文档详情页默认展示摘要 + FAQ 卡片
- 工作量：M（加一次模型调用 + UI）

---

## 历史迭代：系统质量基建（2026-04-23 第一批）

来源：Review 发现的安全/可靠性/成本改进点。CORS 按用户决定暂不动。
部署节奏：Block 1 全部完成后部署一次 + smoke test；Block 2 单独 deploy backend。

### Block 1 · 安全 + 可靠性 + 省钱

- [ ] **T1** 接口限流（slowapi）
  - 依赖：`slowapi` 加入 requirements.txt
  - 文件：`backend/main.py`（注册 limiter）、`backend/api/auth.py`、`documents.py`、`qa.py`（装饰器）
  - 规则：login 5/min，upload 30/min，QA 60/min，按 IP 粒度
  - 验收：curl 循环打 /api/auth/login 第 6 次返回 429

- [ ] **T2** Rerank 超时 30s→8s
  - 文件：`backend/services/rerank_service.py:15`
  - fallback 已在 `kb_agent.py:71` 实现（捕获异常降级到向量分数）
  - 验收：import 通过

- [ ] **T3** Embedding 缓存（Redis）
  - 方案：QA 路径加 use_cache=True，key = emb:{model}:{sha1(text)}，TTL 24h
  - 切片入库保持实时（不缓存）
  - 文件：`backend/services/embedding_service.py`（加缓存层）、`backend/agents/kb_agent.py`（调用点传 use_cache）
  - 验收：同一 question 二次调用能在 Redis 看到 key

- [ ] **T4** Celery 失败可视化
  - DB：Document 加 `conversion_error TEXT NULL`（main.py startup 自动补列）
  - 后端：`convert_task.py:127` 写错误原因
  - API：`/api/documents` 透出 conversion_error 字段
  - 前端：`ProcessingCard.tsx` 显示失败计数 + 点击看列表
  - 验收：人为失败一个文档，Dashboard 能看到错误原因

### Block 2 · 可观测性

- [ ] **T5** QA 链路耗时打点
  - 文件：`backend/agents/kb_agent.py`
  - 日志字段：embed_ms / search_ms / rerank_ms / llm_ms
  - 验收：`sudo docker compose logs backend | grep qa_timing` 能看到

### 延后（单独任务，本次不做）

- CORS 白名单（用户决定暂不动）
- MinIO TLS（内网流量，风险低；需先给 MinIO 装证书）
- 混合检索 BM25（需改 qdrant 索引结构，风险大）
- 前端 citation 点击展开（需新 API + 组件）
- 备份策略（运维动作，需服务器侧 cron + 冷备盘）

---

## 历史迭代：用户认证 + 项目库 + 挑战历史（2026-04-17）

来源：用户需求三件套——账号登录系统、项目库（含文档类型）、知识挑战历史记录。

部署节奏：每个 Block 完成后部署一次 + 端到端连通测试，全部完成做最终 smoke test。

### Block A · 用户认证系统

边界：只做账号密码登录 + 上传者记录 + SSO 字段预留（不实装）。不动现有 RBAC（只区分普通/管理员）。所有改动向后兼容（uploader_id nullable）。

- [x] **A1** User 模型（id/username/email/password_hash/full_name/is_admin/is_active/must_change_password/sso_provider/sso_subject/created_at/last_login_at）
- [x] **A2** bcrypt + PyJWT HS256；jwt_secret_key/jwt_expire_minutes 进 settings；admin 初始账号配置项
- [x] **A3** main.py startup 建 users 表 + seed_admin_if_empty（admin/ChangeMe123!，强制改密）
- [x] **A4** /api/auth/{register,login,me,change-password}
- [x] **A5** require_admin 守 /api/settings/*；delete /documents/{id} 要求登录
- [x] **A6** Document.uploader_id (nullable, FK→users.id, indexed)
- [x] **A7** /documents/upload 用 get_current_user_optional 写入 uploader_id；list 接口 LEFT JOIN users 返回 uploader_name
- [x] **A8** /login + /register 页（独立无 Layout）
- [x] **A9** axios 请求拦截自动加 Bearer；401 清 token 跳 /login；AuthContext refresh/login/register/logout
- [x] **A10** RequireAuth 路由守卫；must_change_password → /change-password；Layout 顶栏右上账号菜单（修改密码/退出）
- [x] **A11** Documents 表新增"上传者"列（带头像缩写）
- [x] **A12** /api/auth/sso/{provider}/bind 返回 501
- [x] **A-test** 注册→登录→上传→列表显示上传者 端到端通（2026-04-17 已部署 https://kb.liii.in 验证）

### Block B · 项目库 + 文档类型

边界：Project 是新增表，与现有 Document 用 nullable FK 关联（老文档保留无项目状态）。doc_type 是 nullable 枚举，老文档不强制。QA 权重调整本迭代不做（只把字段存好），后续单独迭代。

- [x] **B1** Project 模型（id/name/customer/modules(JSON list)/kickoff_date/created_by/created_at/description）
- [x] **B2** Document 加 `project_id` (nullable FK) + `doc_type` (nullable enum: requirement_research / meeting_notes / solution_design / test_case / user_manual)
- [x] **B3** /api/projects CRUD（list / get / create / update / delete + 该项目下文档数）
- [x] **B4** /api/projects/{id}/documents 返回该项目所有文档
- [x] **B5** 上传 UI：加项目下拉（含"新建项目..."选项）+ 文档类型下拉
- [x] **B6** 项目库主页（左侧菜单加入口）：项目卡片列表 + "新建项目"按钮
- [x] **B7** 项目详情页：基本信息卡 + 文档列表（点进入现有文档详情/切片视图）
- [x] **B8** 现有 Documents 列表加项目列、文档类型列、按项目筛选
- [x] **B-test** 新建项目 → 上传带项目+类型 → 项目详情列出文档 → 点击进入切片视图 端到端通

### Block C · 知识挑战历史记录

边界：复用现有 chunks 持久化（已有 batch_id），只新增 ChallengeRun 表关联。不改现有挑战流。

- [x] **C1** ChallengeRun 模型（id=batch_id / triggered_by(user_id 或 schedule_id) / triggered_by_name / trigger_type(manual/scheduled) / started_at / finished_at / target_stages(JSON) / questions_per_stage / total / passed / failed / status(running/completed/failed/cancelled) / error_message）
- [x] **C2** chunks 表新增 batch_id 字段（migration 幂等加列 + 索引）
- [x] **C3** challenger_agent.run_challenge_stream 开头创建 ChallengeRun，结束更新统计；CancelledError 标 cancelled，asyncio.shield 保 finally
- [x] **C4** Celery 定时任务复用同一逻辑（trigger_type=scheduled、triggered_by=schedule_id、triggered_by_name=schedule.name）
- [x] **C5** GET /api/challenge/runs（分页 + 自动清理 stale running 30min+）+ GET /api/challenge/runs/{id}（基本信息 + 关联问题）
- [x] **C6** 前端"挑战历史"页：列表（时间/触发方式/题数/通过率/耗时/状态）+ 抽屉详情看每题问答（含 MarkdownView）；侧边栏入口
- [x] **C-test** 手动触发挑战（带 Bearer token）→ ChallengeRun 落库 status=completed → 详情接口返回 1 个问答 → chunks.batch_id 正确关联（2026-04-17 已部署 https://kb.liii.in 验证）

### 验收

- [x] **最终部署**：rsync + rebuild backend/frontend（2026-04-17）
- [x] **最终连通测试**：登录、上传带项目和类型、项目详情、触发挑战、看历史 已通过 API 端到端验证

---

## 历史完成

### SSL/HTTPS（2026-04-17）
- [x] 域名 kb.liii.in 配置 Let's Encrypt 证书
- [x] nginx HTTP→HTTPS 强制跳转 + HSTS
- [x] cron 自动续期（webroot 模式不停服务）
- [x] 用 certbot/certbot docker 镜像绕开 Debian 12 自带 certbot 2.1 的 bug

### Prompt 约束加固（2026-04-17）
- [x] 4 个 prompt 全部加硬约束：枚举收敛、边界处理、反幻觉、反作弊
- [x] PromptsTab UI：左侧汉化名 + 右侧 Raw/预览 Tab 切换

### 模型来源追踪
- [x] model_router 返回 (content, model_name) 元组
- [x] 所有 agent 适配并向 SSE 透出 model 信息
- [x] 前端 Chunks / Challenge / QA 显示模型 badge

### 系统设置 + API Key 管理
- [x] AgentConfig 单表存所有配置 + ConfigService 缓存
- [x] 4 Tab Settings 页面（模型/路由/提示词/密钥）
- [x] API Key DB 优先 + .env 兜底，列表脱敏

### 文档转写切片
- [x] ReadTimeout 修复（180s + 跨上游 fallback）
- [x] 知识模块切片算法
- [x] LTC 阶段扩展到 9 类（含 customer/order）
- [x] Judge 解析健壮化 + decision 对齐

### Markdown 渲染
- [x] MarkdownView 复用组件
- [x] Documents / Chunks / Review / Challenge 统一使用

### 挑战 + 计划任务
- [x] 挑战 Q+A 持久化为 chunk
- [x] 内联审核 + 标签编辑
- [x] ChallengeSchedule + Celery beat 定时任务
