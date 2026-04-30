# 任务跟踪

## 新迭代:项目洞察 v3 — 文档驱动重构(2026-04-29)

### 背景
现状 v2 用「访谈 + 表单 brief」做输入,但实际项目实施场景下,顾问手里的核心资料是
**SOW / 合同 / 交接单 / 干系人图** 这种结构化文档。把文档作为洞察生成的主输入,
让 agent「先看够文档,缺啥补啥,有据可依不编造」。

### 设计文档(已确认)
- 文档清单:7 项(SOW / 系统集成 / 合同 / 交接单 ★;组织架构 / 售前方案 / 售前调研 推荐)
- 虚拟物 3 项:成功指标(引导问卷)/ 风险预警(KB 推清单)/ 引导问卷(占位)
- 三栏布局:文档清单 320px / 中报告或预览 / 右引用栏 + QA tab(默认收起)
- 信息源标注:句子级角标 [^N] + Hover + 右栏聚合,closed-corpus
- 缺信息:KB → Web 试探(用户裁决) → 对话/表单
- M9 行业最佳实践:KB(0.7) + Web(0.3) 融合,标来源
- Web search:**先做逻辑,后台留 Bocha/Tavily API key 配置入口**

### Phase 1 — 后端基础
- [x] **1.1** 后端 DOC_TYPES 扩 7 项 + 新增 3 个虚拟产物类型(成功指标 / 风险预警 / 引导问卷)
- [x] **1.2** 项目阶段→必需文档清单 配置(STAGE_DOC_REQUIREMENTS,后端 API 暴露)
- [x] **1.3** 后端 Web Search API key 配置入口(ApiKeysTab 加 bocha/tavily)

### Phase 2 — 后端文档接入 + 虚拟物
- [x] **2.1** runner.py `_load_ctx` 加 `docs_by_type` 读 markdown_content
- [x] **2.2** planner.py 加 `doc_content` source 类型 + `_resolve_field` 支持
- [x] **2.3** brief_service 按 doc_type 分类提取(DOC_TYPE_EXTRACTION_HINTS — 7 类差异化 hint)
- [x] **2.4** 虚拟物模块:成功指标问卷 + 风险预警通用清单

### Phase 3 — 引用追溯 + Web 融合
- [x] **3.1** Executor 后端给 source 编号(D1/K1/W1)+ provenance 字段写 bundle.extra
- [x] **3.2** M9 模块改 KB + Web refs 融合,每条标来源
- [x] **3.3** 新 API `POST /api/web-suggest` — 候选答案 + 来源(没配 key 灰显)

### Phase 4 — 前端三栏布局
- [x] **4.1** ConsoleProjectDetail 重构:三栏布局
- [x] **4.2** 新建 `DocChecklist` 组件(左栏)— 7 文档 + 3 虚拟物 + 上传/状态
- [x] **4.3** 中栏切换逻辑(报告 / 准备状态 / 预览 / GapFiller / VirtualForm)
- [x] **4.4** 右栏 — CitationsPanel(引用追溯)+ FloatingChat(QA 浮动窗)

### Phase 5 — 引用 + Web 抓取按钮
- [x] **5.1** `CitedReportView` 组件 — sup chip + hover tooltip + 跳右栏定位
- [x] **5.2** GapFiller 加「✨ 试试网络获取」按钮 + 候选答案选择 UI

### Phase 6 — 验证 & 部署
- [x] **6.1** Python 3.11 py_compile + tsc 通过
- [ ] **6.2** 友发钢管 / 中科时代 端到端测试
- [x] **6.3** rsync + docker rebuild + 生产验证(GH Actions deploy 成功)

### 边界
- 不动 v1 / v2 旧 stage(survey / kickoff / insight v1)
- 不破坏旧 ConsoleProjectDetail 主流程(改三栏但保留 Brief / OutputChatPanel 入口)
- DocChecklist 只在 insight_v2 stage 激活,其他 stage 暂时仍走原对话流
- M5 行业上下文之前的 industry_pack 行业字段补丁不动

### 后续待做(独立 Phase,不在本批次)
- **干系人图谱可视化 canvas**(用户 2026-04-29 提的需求):
  · 组织机构 / 干系人图谱(stakeholder_map 文档)右栏加 canvas 编辑器
  · 手动添加部门 / 干系人节点 + 拖拽关联
  · 候选库:react-flow / dagre / cytoscape
  · 数据:存到 ProjectBrief 或单独 ProjectStakeholderGraph 表
  · 跟现有 stakeholder_map.docx 上传共存(用户可选择"上传文档"或"画图")

---



## 新迭代：Console 项目管理融合（2026-04-25）

### 背景
将「输出中心」+「PM 视角」融合为「项目管理」一级菜单。项目列表 → 项目详情，详情页内置阶段推进器 / 文档侧栏 / 双模聊天。会议纪要保持独立菜单（未来支持选项目关联）。

### 阶段 → Skill 映射
| 阶段 | Skill | 启用 |
|------|------|------|
| 项目洞察 | insight | ✅ |
| 启动会 | kickoff_pptx | ✅ |
| 需求调研 | survey | ✅ |
| 方案设计 / 项目实施 / 上线测试 / 项目验收 | — | 占位 |

### Backend
- [x] B1. Project 加 `customer_profile TEXT`；幂等迁移在 main.py（无 alembic）
- [x] B2. `PATCH /api/projects/{id}` 支持改 industry / kickoff_date / customer / customer_profile / description
- [x] B3. `POST /api/projects/{id}/generate_profile`：LLM 基于 customer/industry/已关联文档摘要生成画像草稿（不入库，前端确认后 PATCH）

### Frontend
- [x] F1. 路由：删 `/console/pm`、`/console/outputs`，加 `/console/projects` + `/console/projects/:id`；ConsoleLayout 顶导更新
- [x] F2. `ConsoleProjects.tsx`：项目卡片列表（基础信息 + 3 阶段进度徽章 + 品牌色头像）
- [x] F3. `ConsoleProjectDetail.tsx` 骨架：Hero 卡 + Stage Stepper + Action Strip + 全宽 Chat
- [x] F4. `StageStepper`：横向 7 stage 圆形节点 + 连接线，状态四态（done/inflight/idle/locked）
- [x] F5. Action Strip：done → 预览/下载/重生成；inflight → loader；idle → 开始对话生成
- [x] F6. 关联文档改抽屉式（420px Drawer），点文档再开预览抽屉（叠层）
- [x] F7. 双模 Chat：Tab 切「项目问答」(QA + lockedProjectId) / 「生成 X」(OutputChatPanel)
- [x] F8. 项目基础信息编辑面板（顶部展开）：客户 / 行业 / 立项日 / 客户画像 + AI 生成草稿按钮
- [x] F9. UI 美化迭代：Hero 卡品牌色图标、严格视口高度修复输入框留白、抽屉化关联文档

### ConsoleHome 更新
- [x] H1. 卡片精简为 3 张：知识问答 / 项目管理 / 会议纪要(disabled)
- [x] H2. 顶部 3 个 StatCard：活跃项目 / 已生成交付物 / 后台进行中
- [x] H3. 增加「最近项目」+「最近生成」两个 Panel

### 设计系统更新
- [x] D1. `/ds#workspace` 新增「工作台模式」section：Hero Card / Stage Stepper / Action Strip / StatCard / Drawer Trigger / Tab Bar / Do-Don't
- [x] D2. `frontend/public/ds.md` 同步新增「工作台模式」章节，加约束规则（严格高度 / 不要常驻侧栏 / 状态四态语义）

### 验证
- [x] V1. `npx tsc --noEmit -p tsconfig.json` 通过
- [x] V2. 后端 customer_profile 列已生效（生产 DB 验证）
- [x] V3. 端到端：建项目 → 改基础信息 → 生成画像 → 点洞察 stage → 对话 → 生成 → 同 stage 看到预览
- [x] V4. 部署 + 在线 smoke（kb.tokenwave.cloud）

### 边界
- 不动 Document chunk 逻辑
- 不动 `/console/meeting` 与 `/console/qa`
- 不破坏现有 `/api/outputs/*` API 形状

---

## 新迭代：项目洞察 + 调研问卷 v2（agentic 旁路重构）（2026-04-28）

### 背景
现有 `insight` / `survey` 走"一次性 LLM 调用 + 章节硬编码"，质量不稳、信息缺口不可见、无"无效文档"概念。重新设计为**模块化 + 三层 agentic 流程（Plan → Execute → Critic）**，针对智能制造 + 纷享销客场景做差异化。

设计方案完整文档：`/Users/zhebin/.claude/plans/skill-zany-hopcroft.md`

### 关键策略：旁路并存（v2）
- **新代码不替换旧代码**，新增 kind `insight_v2` / `survey_v2`
- 新代码集中在 `backend/services/agentic/`（独立目录，不污染顶层 services）
- 现有 `generate_insight` / `generate_survey` 保留不动
- 前端在项目详情页新增 2 个 Beta 阶段供切换体验
- demo 路径加 `/demo/insight` 和 `/demo/survey` 讲解 skill 逻辑

### Phase 1 — 数据层（agentic 包）
- [x] **1.1** `backend/services/agentic/__init__.py`
- [x] **1.2** `backend/services/agentic/insight_modules.py` — 10 模块定义（476 行）
- [x] **1.3** `backend/services/agentic/survey_modules.py` — 7 主题 × 13 子模块 + L1/L2 划分（368 行）
- [x] **1.4** `backend/services/agentic/industry_packs/{__init__.py,smart_manufacturing.py}` — 行业字段包（注册表 + 智能制造包: 13 字段补丁/10 痛点/3 标杆案例/12 行业种子题）
- [x] **1.5** `backend/services/brief_service.py` — 加 `insight_v2`(15 字段) / `survey_v2`(8 字段) schema（additive only）

### Phase 2 — Agent 核心
- [x] **2.1** `backend/services/agentic/planner.py` — 规则化 plan_insight + plan_survey + fill_kb_gaps（491 行）
- [x] **2.2** `backend/services/agentic/executor.py` — execute_insight_module + execute_survey_subsection（261 行）
- [x] **2.3** `backend/services/agentic/critic.py` — Sopact rubric + survey-specific rubric（286 行）
- [x] **2.4** `backend/services/agentic/runner.py` — generate_insight_v2 / generate_survey_v2 完整流程（539 行）

### Phase 3 — 系统接入
- [x] **3.1** `backend/tasks/output_tasks.py` — 加 Celery 任务 `generate_insight_v2` / `generate_survey_v2`
- [x] **3.2** `backend/api/outputs.py` — KIND_TO_TASK / KIND_TITLES 加 v2；_bundle_dto 透出 validity_status / ask_user_prompts / module_states
- [x] **3.3** `backend/api/output_chats.py` — VALID_KINDS / KIND_TITLES 加 v2

### Phase 4 — 前端
- [x] **4.1** `frontend/src/api/client.ts` — `OutputKind` 加 v2；`CuratedBundle` 类型加 v2 字段（validity_status / module_states / ask_user_prompts / agentic_version）
- [x] **4.2** `frontend/src/pages/console/ConsoleProjectDetail.tsx` — STAGES 加 2 个 Beta 阶段（Bot 图标）；BRIEF_KINDS 加 v2；新增 V2ValidityBanner 组件
- [x] **4.3** `frontend/src/pages/demo/InsightDemo.tsx`(282 行) + `SurveyDemo.tsx`(280 行) 讲解页
- [x] **4.4** `frontend/src/App.tsx` — 加路由 `/demo/insight` + `/demo/survey`

### Phase 5 — 验证 & 部署
- [x] **5.1** Python 3.11 py_compile 全部通过（13 个改动文件 OK）
- [x] **5.2** `npx tsc --noEmit -p tsconfig.json` 通过（0 错误）
- [ ] **5.3** 用友发钢管 / 特变新能源 / 空项目跑 v2，对照 v1 结果（**待生产部署后**）
- [ ] **5.4** rsync + docker rebuild + 生产环境验证（**等用户拍板**）

### 验收标准
1. v1（`insight` / `survey`）行为完全不变，前端旧 stage 仍可用
2. v2 `insight_v2` 跑友发钢管，M5 industry_context 自动激活
3. v2 空项目跑 → bundle.extra.validity_status='invalid'，前端展示"信息不足"
4. `/demo/insight` 和 `/demo/survey` 页面可访问且讲清楚流程
5. backend import 不报错，tsc --noEmit 不报错
6. 生产环境真实账号能跑 v2，顾问能对比 v1/v2 输出质量

### 简化决策
- ❌ 不加 alembic migration：`bundle.extra` 已是 JSON
- ❌ 不建 `insight_runs` 表：历史写到 `bundle.extra.run_history`
- ❌ 本期不做 .xlsx 多 sheet 输出（保留 markdown + docx）
- ❌ 本期只做 smart_manufacturing 一个行业包

### 边界
- 不动 v1 `generate_insight` / `generate_survey` 任何代码
- 不动 `kickoff_pptx` / `kickoff_html`
- 不动 model_router / vector_store / brief_service.extract 基础设施
- AgentConfig 表不动；v2 复用 `output_agent` 配置（按 kind 注入 skill_ids）

---

## 旧迭代：访谈式产出 + 项目模式自动锁定（2026-04-25）

### 背景
- PPT/洞察 产出时项目处于早期，KB 切片少，直接丢模型会瞎编 → 改为向导式"一问一答"，答案沉淀为项目资产，下次生成复用。
- 智能问答 / PM 视角都有"通用 / 项目经理"切换；选项目进去后仍停留通用 → 应自动切 PM 且锁定该项目。

---

## Feature X：项目 Brief（自动预填 + 单页确认 → 替代逐题问答）

### 设计思路
原方案：逐题问 N 题 → 太慢。新方案：
1. **自动抽取**：用项目元数据（customer / industry / customer_profile）+ 关联文档摘要 + KB 检索结果，让 LLM 一次性抽取所有字段，每个字段带 `confidence` 和 `sources`。
2. **单页确认**：用户看到的是一页可编辑的 Brief 表单，高置信项默认折叠（"采用"），低置信项展开必填，空白项必填。**用户只编辑空白和不准的字段**——预计 80% 字段 KB 已能填出。
3. **沉淀复用**：Brief 落库为项目资产；后续重生成 / 切换 skill 复用同一份 Brief。

### X1. 数据模型
- [x] 新表 `project_briefs`（columns: id, project_id, output_kind, fields JSONB, updated_at, updated_by；UNIQUE(project_id, output_kind)）
- [x] 简化方案：skill 模型不加 `brief_schema`，直接在 `services/brief_service.py` 按 output_kind 硬编码 BRIEF_SCHEMAS（kickoff_pptx 14 字段 / insight 9 字段）
- [x] 幂等迁移在 main.py 通过 `Base.metadata.create_all`

### X2. 后端 API & 服务
- [x] `GET /api/briefs/{kind}?project_id=X` → 返回 brief 或空骨架 + schema
- [x] `POST /api/briefs/{kind}/extract` → LLM 抽取，**不入库**，返回与已有 brief 合并后的草稿
- [x] `POST /api/briefs/{kind}/extract/stream` → SSE 流式抽取，逐阶段吐进度（metadata / documents / chunks / llm）+ 最终 done 事件携带 fields
- [x] `PUT /api/briefs/{kind}` → upsert 整份 brief
- [x] `output_service._gather_inputs` 接入 brief：generate_insight / generate_kickoff_pptx prompt 拼接已确认 brief 块
- [x] 解析容错：`raw_decode` 容忍 LLM 输出尾部多余字符
- [x] 字段归一化：list 项 dict 自动拼成 "key: value · key: value" 字符串
- [x] SSE 心跳：15s ping 注释行，移除 hop-by-hop Connection 头

### X3. 前端
- [x] ConsoleProjectDetail Action Strip：BRIEF_KINDS（kickoff_pptx/insight）走 BriefDrawer，survey 保持 OutputChatPanel
- [x] 备选入口：BRIEF_KINDS 阶段额外提供「对话生成」按钮走旧 OutputChatPanel
- [x] `BriefDrawer` 组件（右侧抽屉）：
  - 自动 POST `/extract/stream`，蒙版动态 checklist（每阶段打勾 + 明细，最后"AI 生成中…"）
  - 字段按 group 分组折叠；ConfidenceDot（绿/黄/灰）+ 来源 popover
  - ListEditor / DateInput / Textarea 三态；编辑过自动打 edited_at 戳
  - 底部：「保存草稿」/「保存并生成」
- [x] `extractBriefStream` fetch + ReadableStream（带 Authorization header）替代 axios mutation
- [x] 编辑过字段不被下次 extract 覆盖（后端 merge_extract_with_user_edits 实现）
- [x] 项目详情阶段栏重做：单向 chevron 箭头 + 描线房子图标，三段式紧凑布局

---

## Feature Y：进入项目自动锁定 PM 模式 ✅ 已完成（随项目管理融合一起做了）

- [x] QA.tsx 接受 `lockedProjectId` prop，强制 persona='pm' + 隐藏"通用/PM"切换
- [x] ConsoleProjectDetail 用 `<QA lockedProjectId={id} />` 嵌入「项目问答」Tab
- [x] PM 视角原独立页已并入项目详情，无需单独同步

---

## 部署顺序
1. ~~Feature Y~~（已完成）
2. ~~X1~~ 数据模型（project_briefs 已上线，schema 改为后端硬编码不依赖 skill 表）
3. ~~X2~~ 后端 API + 流式 extract + 解析容错 + 字段归一化（已上线）
4. ~~X3~~ BriefDrawer + Action Strip + 阶段栏重做（已上线）
5. ~~端到端验证~~：实际项目走 kickoff/insight，extract 草稿正常返回、字段填充正常、生成调用 brief 成功

## 边界
- `survey` 保持原逻辑（survey 本身就是问卷，不需要 Brief）
- Brief 与 bundle 解耦：同项目多次生成 / 不同 skill 共用 Brief（按 output_kind 分别存）
- 用户编辑过的字段不被自动抽取覆盖
- 来源 chip 必须能链回原文档/切片，否则用户无法验证置信度

---

## 新迭代：需求调研 v1 — survey_v2 stage 工作台填充（2026-05-01）

### 背景
Insight v3 已达到预期。下一站是「需求调研」——把 insight 输出（关键发现、风险、干系人）+ SOW + KB 行业 knowhow 转化为可上现场的**调研大纲 + 调研问卷**，目标是产出能直通蓝图设计的结构化交付物。

### 现状盘点（实施前侦查的关键发现）
- ✅ `survey_v2` + `survey_outline_v2` 两个 sub_kind 已在 stage_flow 里预留（[stage_flow.py:36](backend/api/stage_flow.py)）
- ✅ `generate_survey_v2`（[runner.py:1107](backend/services/agentic/runner.py)）+ `generate_outline_v2`（[runner.py:1308](backend/services/agentic/runner.py)）已实现，能输出 markdown + docx
- ✅ `survey_modules.py` 已有 L1+L2 双层 7 主题分卷（c_level/biz_owner/frontline_sales/it/finance/channel_mgr/service 七角色）
- ✅ `outline_modules.py` 已有 7 模块大纲（M1-M7：目标 / 方法 / 日程表 / 材料 / 团队 / 产出 / 衔接）
- ❌ **当前输出是 markdown 文本叙述**，不是结构化"选择题 + 选项池"
- ❌ 没有 LTC 标准流程骨架（现状是 7 主题分类，需要叠加 LTC 主流程）
- ❌ 没有 SOW 模块映射 / 同义词归一
- ❌ 没有顾问录入回路 / 持久化答案
- ❌ 没有范围四分类
- ❌ KB 召回未做二次过滤
- ❌ 工作区 UI（survey_v2 stage 当前还是对话模式 ChatTabs）

### 本期方向：复用 + 增量升级（不重写已有逻辑）
- **不动**：现有 survey_modules.py / outline_modules.py / generate_survey_v2 / generate_outline_v2 的 markdown 输出能力
- **扩展**：在 runner 流程末尾追加生成**结构化 questionnaire JSON**写入 `bundle.extra.questionnaire_items[]`
- **新增子目录** `services/agentic/research/`：放 LTC 字典 / SOW 映射 / KB 二次过滤 / 范围分类，与现有模块解耦
- **新增表**：`research_response` 持久化顾问录入答案；`research_ltc_module_map` 持久化 SOW→LTC 映射
- **复用 CuratedBundle**：不另起 schema，新输出挂在 extra JSON 里

### 设计决策（已对齐）
- **入口**：嵌入项目详情页工作区，`activeStageKey === 'survey_v2'` 切换专属三栏布局（参考 InsightV3Workspace）
- **流程骨架**：内置华为 LTC 标准流程字典（8 主流程 + 5 横向支撑域），SOW 模块名走同义词归一映射；超出字典的作为 extra_modules
- **问卷形态**：顾问拿大纲口头问 + 系统选择题录入。题型 60% 单选/多选 + 15% 分级 + 10% 数值 + 10% 短文本 + 5% 流程节点勾选。**每个选项池由 LLM 基于 SOW + 行业 knowhow 预填**
- **范围四分类**（需新建 / 已有线下需数字化 / 已有需搬迁 / 不纳入）：不向受访者问，问卷填完后 LLM 综合判断 → 顾问可手改
- **KB 行业 knowhow**：CLAUDE.md 已有「文档喂全文不切片」决策针对项目内文档；行业 knowhow 跨项目，**这一期上 RAG 切片召回**，但加 LLM 二次评分（≥7 才注入），前端展示来源 + 分数让顾问可剔除
- **复用框架**：后端复用 insight v3 的 agentic 框架（planner / executor / critic / challenger / runner），目录平级 `services/agentic/research/`
- **受访者分卷**：4 卷（高管 / 部门负责人 / 一线业务 / IT），来自 insight `M4_stakeholders` + brief
- **本期不做**：调研报告（依赖回填，下一期）；docx 模板导出（下下期）

### Phase 1 — LTC 字典 + 结构化输出契约 + DB（Block A） ✅
- [x] **A.1** `backend/services/agentic/research/{__init__,ltc_dictionary}.py`：8 主 + 5 横向，13 模块,带 aliases / standard_nodes / typical_audiences / default_option_pools
- [x] **A.2** `research/questionnaire_schema.py`：QuestionItem / OptionItem，6 种题型，scope_label 四分类，ensure_sentinels 兜底逻辑，validate_answer 弱校验
- [x] **A.3** Models：`research_response`（uq bundle_id+item_key）+ `research_ltc_module_map`（idx project_id），main.py 注入 import 触发 create_all
- [x] **A.4** `ConsoleProjectDetail.tsx` 的 `V3_DOC_DRIVEN_KINDS` 增加 survey_v2 / survey_outline_v2(OutputKind 类型已包含,无需改类型)
- [x] **A.5** `backend/api/research.py`：responses upsert / list / classify-scope 占位 / ltc-module-map / ltc-dictionary 5 个端点；main.py 注册 prefix=/api/research
- [x] **验证** LTC 字典同义词归一全部命中(销售机会管理→M02 / 招议标→M03 / 渠道商→S03 等);schema 序列化往返 OK;ensure_sentinels 自动补"其他+不适用"

### Phase 2 — 大纲增强（Block B） ✅
- [x] **B.1** `research/sow_mapper.py`:LLM 抽 SOW 功能模块清单 → 同义词归一映射到 LTC 字典 → 持久化 research_ltc_module_maps 表(覆盖式);本地 find_module_by_alias 兜底匹配;低置信度自动转 is_extra
- [x] **B.2** `research/kb_filter.py`:行业 knowhow 召回(top-K=10) → LLM 0-10 批量评分 → ≥7 注入;同时返回所有候选给前端展示评分,顾问可剔除;render_high_score_block 渲染成 prompt 注入块
- [x] **B.3** `generate_outline_v2`(runner.py:1308):ctx_loaded 后并入 sow_mapper(失败不阻断);markdown 末尾追加"按 LTC 流程组织的调研主题"表格(LTC 模块 / 客户原文 / 标准节点);bundle.extra.ltc_module_map 持久化

### Phase 3 — 问卷结构化升级 + 范围分类（Block C） ✅ 主体
- [x] **C.1** `execute_survey_subsection` 输出两段式（Markdown + ```json``` 围栏）;system/user prompt 加结构化契约;返回 dict {markdown, questionnaire_items};新增参数 ltc_module_key / kb_inject_block(留 hook)
- [x] **C.1.5** `_split_markdown_and_questionnaire_json` + `_post_process_items`:JSON 围栏抽取 + sentinel 补全 + item_key 兜底 + schema 序列化往返过滤非法字段
- [x] **C.2** `generate_survey_v2` 适配 dict 返回值(向后兼容旧 str 路径);收集所有 subsection 的结构化题目 → 写入 `bundle.extra.questionnaire_items[]`(扁平数组,前端按 ltc_module_key / audience_roles 分组)
- [ ] **C.3** KB 二次过滤接入问卷 prompt(参数已留,实际接入留下期 — 当前 KB 行业 knowhow 数据质量不准)
- [x] **C.4** `research/scope_classifier.py` + API `POST /api/research/classify-scope` 接入:LLM 批量给已答题打 four-label;不覆盖 manual 改过的;_stringify_answer 把 option value 反查 label 给 LLM 看
- [x] **验证** sample LLM 输出解析:JSON 围栏抽取成功 → items 数 / type 正确;ensure_sentinels 把 3 选项补到 5(+其他+不适用)

### Phase 4 — 前端工作区（Block D） ✅ MVP
- [x] **D.1** ConsoleProjectDetail.tsx 加 `activeStageKey === 'survey_v2'` 分支 → `<ResearchV1Workspace>`,同时承载 outline + survey 两个 sub-kind
- [x] **D.2** ResearchV1Workspace.tsx 三栏:左 LTC 模块清单(SOW 命中标橙点 + 已答题数计数 + extra 列表) / 中 view 切换(preparation / outline / questionnaire) / 右占位
- [x] **D.3** PreparationView 内嵌:SOW 映射状态 + 两张 ProductCard(大纲 / 问卷,带 GenerationProgressCard inflight 显示)
- [x] **D.4** outline view 直接 MarkdownView 渲染 content_md(已包含「按 LTC 流程组织的调研主题」表格)
- [x] **D.5** ResearchQuestionnaire.tsx:按 selectedLtcKey 过滤题目;single/multi/text/rating/number/node_pick 全题型支持;自动保存(每改一次 upsert);"触发 AI 分类"按钮接 classify-scope
- [x] **D.6** ScopeBadgeEditor:四标签 dropdown 切换(new/digitize/migrate/out_of_scope) + ai/手 来源标识 + 清除分类
- [x] **后端配套** outputs.py `_bundle_dto` flat 出 questionnaire_items / ltc_module_map;前端 CuratedBundle 接口加这两字段
- [x] **类型校验** `tsc --noEmit -p tsconfig.json` 0 错误

### Phase 5 — 端到端联调 + 部署（Block E）
- [ ] **E.1** 用现有特变项目跑一遍：触发 `survey_outline_v2` → 生成大纲 → 触发 `survey_v2` → 生成问卷 → 顾问录入 → 触发 scope 分类
- [ ] **E.2** 后端 `python -c "from services.agentic.research import runner"` 验证可加载 + curl 验证 API
- [ ] **E.3** 前端 `npx tsc --noEmit` 通过
- [ ] **E.4** rsync + 远程 rebuild + 部署 + HTTPS 端到端连通测试
- [ ] **E.5** 写一份 demo 数据 / 测试用例,留给后续做调研报告（下一期）的输入

### 边界
- 本期只做大纲 + 问卷的生成 + 顾问录入,不做调研报告(下一期)
- 不动 Project 表 schema(`current_stage_key` 字段不加,stage 仍是前端 state)
- LTC 字典先按通用 CRM 行业内置一份,客户的同义词通过 aliases 表逐步沉淀
- KB 召回质量不准是已知问题,本期靠"二次评分 + 顾问可剔除"兜底
- 复用 insight 的 `CuratedBundle` 表,不另起 schema(survey_outline_v2 / survey_v2 作为 kind 区分)

### 关键文件参考(基于已有架构)
- `backend/services/agentic/insight_modules.py` — 模块定义模板
- `backend/services/agentic/runner.py` — 主流程模板
- `backend/services/agentic/planner.py` — planner 模板
- `backend/services/agentic/executor.py:_build_sources_index` — provenance 构建模板
- `backend/api/stage_flow.py:30-45` — survey_v2 stage 已预留
- `backend/api/outputs.py` — KIND_TO_TASK 待加 survey_v2 / survey_outline_v2 映射
- `frontend/src/pages/console/ConsoleProjectDetail.tsx:560` — InsightV3Workspace 三栏布局参考
- `frontend/src/components/console/CenterWorkspace.tsx` — 中栏视图切换模式参考
