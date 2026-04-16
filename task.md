# 任务跟踪

## 当前迭代：模型来源追踪（Model Attribution）

### 进行中

- [x] **model_router 返回值改造** — `chat()` 和 `chat_with_routing()` 返回 `(content, model_name)` 元组，streaming yield `(token, None)` + `(None, model_name)` 结束信号
- [x] **所有 agent 适配** — converter / slicer / challenger / kb_agent 全部接收元组，传递 model_name
- [x] **Chunk 模型加字段** — `generated_by_model` 字段，切片入库时记录分类模型名
- [x] **Challenge SSE 带模型信息** — question 事件带 question_model，result 事件带 answer_model + judge_model
- [x] **QA SSE 带模型信息** — sources 事件附带 model 字段
- [x] **前端显示模型标签** — Chunks 页(indigo badge) / Challenge 卡片(出题/回答/评判 3色badge) / QA 消息(indigo badge)

---

## 上一迭代：系统设置页面 + API Key 管理（已完成）

### 已完成

- [x] **AgentConfig 数据模型** — 单表 `agent_configs` 存储所有配置（model_registry / routing_rules / task_params / prompt_template / api_keys），用 config_type + config_key 唯一约束
- [x] **ConfigService** — DB 读写 + 60s 内存缓存 + 启动时自动播种默认值（不覆盖用户修改）
- [x] **model_router 集成** — `chat()` / `chat_with_routing()` / `chat_stream()` 运行时从 DB 读模型配置、路由规则、任务参数，fallback 到 hardcoded 默认值
- [x] **prompt builders 改 async** — 所有 `build_*_prompt` 函数从 DB 读模板，所有 agent 调用处加 `await`
- [x] **后端 CRUD API** — `/api/settings/models|routing|task-params|prompts|api-keys`，含验证（路由引用模型存在性、prompt 占位符完整性、参数范围）
- [x] **API Key 管理后端** — `_get_api_key()` 优先读 DB，回退 .env；list 接口返回脱敏值 + 来源标识
- [x] **前端 Settings 页面** — 4 个 Tab（模型管理 / 路由与参数 / 提示词 / API 密钥）
- [x] **ModelsTab** — 表格 + 内联编辑 + 新增/删除模型
- [x] **RoutingTab** — 路由规则（primary/fallback 下拉）+ 任务参数（max_tokens/temperature/timeout）
- [x] **PromptsTab** — 左侧列表 + 右侧 textarea 编辑器 + 变量提示 + 重置默认
- [x] **ApiKeysTab** — 密钥列表 + 脱敏显示 + 来源（DB/env）+ 设置/修改/删除
- [x] **侧边栏 + 路由** — Settings 页面加入导航

### 待验证

- [ ] 部署到 GCP 后验证 Settings 页面完整功能
- [ ] 验证 API Key 修改后模型调用立即生效（缓存失效机制）
- [ ] 验证 prompt 修改后下次 LLM 调用使用新模板

---

## 历史完成

### 文档转写切片修复
- [x] 定位 ReadTimeout 根因（60s 太短 + fallback 同上游雪崩）
- [x] conversion fallback 改为跨上游 mimo-v2-pro
- [x] timeout 全局提升到 180s
- [x] slicer classify_chunk 改用 chat_with_routing + fallback

### Markdown 渲染
- [x] 新建 MarkdownView 复用组件（渲染/源码切换 + 复制）
- [x] Documents / Chunks / Review / Challenge 全部使用 MarkdownView

### 知识挑战增强
- [x] Documents API 返回 original_format + conversion_status
- [x] Challenge 问题不截断，完整显示
- [x] 挑战 Q+A 持久化为 chunk 入知识库（tagged challenge）
- [x] 挑战页面内联审核（通过/拒绝）
- [x] Chunks 页面人工编辑标签（ltc_stage/industry/module/tags）
- [x] Judge 解析修复（_extract_json 健壮提取 + decision 值对齐）
- [x] 分数显示放大（text-lg + font-extrabold）
- [x] LTC 阶段新增"客户"和"订单"
- [x] 自定义阶段输入
- [x] 计划任务自动挑战（ChallengeSchedule + Celery beat）
- [x] max_tokens 全局提升到 8000（不限制推理深度）
