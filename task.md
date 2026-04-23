# 任务跟踪

## 当前迭代：系统质量提升（2026-04-23 起）

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
