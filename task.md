# 任务跟踪

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
