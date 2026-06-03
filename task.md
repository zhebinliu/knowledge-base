# 任务跟踪

## 调研问卷 按场次手动触发生成(2026-06-03)— 用户 /goal

### 目标
用户:"调研问题我希望是一场一场手动去触发生成"
- 不再强制一键全量,改为按场次一场一场手动触发
- 每场单独 LLM 调用,以"场次"为核心(参考 participants/topic_summary/interview_script),
  不复用 LTC subsection 框架,避免冲突
- 已生成 / 未生成 / 生成中 状态可见,可随时重生某场

并存策略:保留 generate_survey 一键 + generate_survey_for_role 按角色;新增按场次为第三种触发方式。

### 拆解
- [ ] **A. 后端 — 新建 session_questionnaire.py 场次为中心的题目生成器**
  - SYSTEM_PROMPT + build_user_prompt(session, all_sessions, project, industry, prior_items)
  - 喂大纲场次完整信息(participants/topic_summary/interview_script/audience_roles/duration)
  - 已有其他场次题(去重 / 避免撞车)作为 prior_items_block 注入
  - 输出 8-15 题,全部 session_id=该场;遵守原 prompt 所有约束(LTC/角色/topic_cluster/stage)
  - JSON 解析复用 executor._split_markdown_and_questionnaire_json 模式
- [ ] **B. 后端 — runner.generate_survey_for_session**
  - 进入态:bundle.extra.session_progress[session_id]='generating'
  - 拉 outline_sessions → 找 session;无 session 报错
  - 拉现有 questionnaire_items 作为 prior(传 prior_items_block)
  - 调 session_questionnaire LLM
  - 合并:删除原同 session_id 题,加入新题;其他场题保留
  - 写回 bundle.extra.questionnaire_items + session_progress
- [ ] **C. 后端 — Celery task + API endpoint**
  - tasks/output_tasks.py 加 generate_survey_session task
  - api/outputs.py 加 POST `/{bundle_id}/generate-session` body={session_id}
  - _bundle_dto 暴露 session_progress
- [ ] **D. 前端 — client.ts API + 类型**
  - 加 `generateSurveyForSession(bundleId, sessionId)`
  - CuratedBundle 加 `session_progress?: Record<string, 'generating'|'done'|'failed'>`
- [ ] **E. 前端 — ResearchWorkspace sidebar 加按场次生成按钮**
  - legacy + redesign 两份
  - 每场场次行旁边加状态徽标 + 按钮(✨ 生成 / Loader2 / CheckCircle2 重生)
  - 顶部「生成调研问卷」(一键全量)文案改为「一键生成全部」,作为备选
- [ ] **F. 验证 + 部署**
  - py_compile + tsc 全过
  - commit + push + 触发 PROD

### 边界
- 不动 generate_survey / generate_survey_for_role(并存)
- 不动 outline_sessions_extractor / executor.execute_survey_subsection
- 不动按角色 / 按主题 / 按 LTC 分组逻辑(场次按钮是新增入口)
- session_progress 是新字段,老数据为空时 sidebar 显示"未生成"

---

## 调研问卷 按场次分组(全链路打通)(2026-06-03)— 用户 /goal

### 目标
打通调研大纲 M3 日程表 ↔ 调研问卷,让顾问到了"Week 1 周二上午 销售总监 1on1"这一场,
打开问卷直接定位到这一场要问的所有题(按主题+开场→现状→痛点→期望排)。

用户决策:
- 题↔场次 = **一对一**(每题挂 1 个 session_id)
- 老问卷 / 老大纲 兼容:**走「重生才享受」** — 没 session_id 前端提示"请重新生成大纲和问卷"

### 拆解
- [x] **A. 后端 — QuestionItem 加 session_id 字段**
- [x] **B. 后端 — 大纲生成后抽 sessions JSON**(新建 outline_sessions_extractor.py + 在 generate_survey_outline phase 5 前调一次,失败不阻断)
- [x] **C. 后端 — 问卷生成喂 outline_sessions 给 LLM**(generate_survey + generate_survey_for_role 都从最新 outline bundle 拉;executor 加 outline_sessions 参数 + prompt 约束 + JSON 示例 + few-shot 同步)
- [x] **D. 后端 — _post_process_items 兜底**(session_id 不在候选 → None,前端 fallback "未挂场次")
- [x] **E. 后端 — outputs.py DTO 暴露 outline_sessions**
- [x] **F. 前端 — client.ts**(ResearchQuestionItem 加 session_id;新 OutlineSession 类型;CuratedBundle 加 outline_sessions)
- [x] **G. 前端 — ResearchQuestionnaire 按场次分组**(legacy + redesign):groupBy 扩 'session';加 selectedSession + outlineSessions props;axisItems 加 session 分支;排序在 session 模式也走 stage(opening→current_state→pain_point→aspiration);axisLabel 加 sessionLabel
- [x] **H. 前端 — ResearchWorkspace sidebar 加按场次**(legacy + redesign):GroupBy 扩 'session';加 selectedSession state;outlineSessions 从 outlineBundle 拿;sessionCounts 统计;legacy sidebar 加按场次 tab + session 列表(带「全部场次」+「未挂场次」);redesign Carousel 加按场次按钮 + chip strip;透传给 Questionnaire
- [x] **I. 验证 + 部署**
  - py_compile + tsc 全过
  - commit + push + 触发 PROD

### 边界
- 不动 outline M3 prompt 本身(M3 表保持原样,sessions JSON 走二次抽取)
- 不动按主题 / 角色 / LTC 分组逻辑(场次跟它们并列第四种)
- 老问卷 / 老大纲:fallback 显示 + 提示重生,不写迁移
- session_id 一对一映射(LLM 必须从大纲候选中选 1 个;没合适就留 null)

---

## 调研问卷 主题聚类 + 访谈阶段(2026-06-03)— 用户 /goal

### 目标
现场调研时问卷题量大(单角色 60-107 题平铺),逻辑关联题分散,顾问翻题难、客户思路反复跳跃。
加 topic_cluster + interview_stage 两字段,前端「按主题」分组,卡内按「开场→现状→痛点→期望」排,顺手加搜索框兜底定位。

### 拆解
- [x] **A. 后端 schema** `questionnaire_schema.py`
  - QuestionItem 加 `topic_cluster: str | None` + `interview_stage: InterviewStage | None`
  - `InterviewStage` Literal + `VALID_INTERVIEW_STAGES` 元组 + `INTERVIEW_STAGE_LABELS`
  - docstring + to_dict / from_dict 透传
- [x] **B. 后端 LLM prompt** `executor.py:485 execute_survey_subsection`
  - SYSTEM_PROMPT 加约束 + JSON 输出示例每题加 topic_cluster + interview_stage
  - user_prompt 加「topic_cluster 约束」+ 「interview_stage 约束」+ few-shot 示例同步
  - system prompt 加方法论提醒
- [x] **C. 后端 _post_process_items 兜底**
  - topic_cluster 缺 → ltc_dictionary.get_module().label fallback
  - interview_stage 缺/非法 → 'current_state'
- [x] **D. 前端 client.ts schema**
  - ResearchQuestionItem 加 topic_cluster / interview_stage
  - 加 ResearchInterviewStage + RESEARCH_INTERVIEW_STAGE_ORDER + RESEARCH_INTERVIEW_STAGE_LABELS export
- [x] **E. 前端 ResearchQuestionnaire**(legacy + redesign)
  - Props 加 selectedTopic / groupBy 扩 'topic'
  - axisItems / items useMemo 加 topic mode 排序(cluster + stage 顺序)
  - 顶部搜索框过滤(题干 / why / cluster 关键词)
  - QuestionsList 加 clusterStartMarkers / collapsedClusters / onToggleCluster props
  - cluster boundary 插入 ClusterDivider(sticky 可折叠 + 题数 + 完成度)
- [x] **F. 前端 ResearchWorkspace sidebar 加按主题**(legacy + redesign)
  - GroupBy 扩 'topic',加 selectedTopic state
  - legacy: GroupTabBtn 加按主题 + 列表主体加 topic 分支(cluster 列表 + 全部主题)
  - redesign: ResearchGroupCarousel 加 topic 按钮 + cluster chip strip;父算 topicClusters + 传 props
  - 把 selectedTopic 透传给 ResearchQuestionnaire
- [x] **G. 验证 + 部署**
  - py_compile 全过
  - tsc 全过(剩余报错都是预存 meeting 子模块)
  - commit + push + 触发 PROD

### 边界
- 不动 parent_item_key / phase / LTC 字典 / audience_roles
- 不动 survey_outline 大纲生成 / generate_survey_for_role(同 prompt 改造)
- 不写 DB migration;老 bundle 走 fallback(topic_cluster 用 LTC label, stage 不排)
- 用户重生问卷才能享受完整效果

---

## 调研计划(research_plan)— 客户版调研计划(2026-06-03)— 用户 /goal

### 目标
现状:**调研大纲(survey_outline)** 给我方 PM 用,7 个模块 M1-M7 含内部信息(M5 我方分工 / M6 产出物 / M7 衔接方案)。
新增 **调研计划(research_plan)**,做大纲的**对客版**:
- 内容从大纲已有章节(M1/M2/M3/M4)裁剪改写,加封皮(致客户函)+ 联系方式
- 直接转达给客户:节奏 / 客户提前准备清单
- 跟大纲一样允许**在线编辑**(复用 MarkdownEditor + PUT /api/outputs/{id}/content)
- 跟 survey_outline / survey / research_report 并列为「需求调研」阶段的第 4 个 sub_kind

### 拆解

#### A. 后端 — 新增 kind 注册
- [x] **A.1** `backend/api/outputs.py:57` KIND_TO_TASK 加 `research_plan: generate_research_plan`
- [x] **A.2** `backend/api/outputs.py:72` KIND_TITLES 加 `research_plan: "调研计划(客户版)"`
- [x] **A.3** `backend/api/outputs.py` 任务派发字典加 research_plan;import 补 generate_research_plan
- [x] **A.4** `backend/api/outputs.py` `/{bundle_id}/content` 白名单(`("insight", "survey_outline", "survey")`)加 `research_plan`
- [x] **A.5** `backend/api/stage_flow.py` DEFAULT_STAGES 的 survey 阶段 sub_kinds 加 `research_plan`(放 survey_outline 后)
- [x] **A.6** `backend/api/stage_flow.py` ALLOWED_KINDS 加 `"research_plan"`
- [x] **A.7** `backend/api/stage_flow.py:meta` _kind_label 字典加 `"research_plan": "调研计划(客户版)"`
- [x] **A.8** 惰性迁移 `_migrate_research_plan_into_survey`:DB 已有自定义 stage_flow,survey 阶段 sub_kinds 没有 research_plan → 自动追加到 survey_outline 之后;`_read()` 顺序调用 kickoff + plan 两个迁移

#### B. 后端 — 生成器
- [x] **B.1** `backend/services/agentic/runner.py` 新增 `generate_research_plan(bundle_id, project_id)`
  - 结构仿 `generate_research_report`(单次 LLM,极简流水线)
  - **强依赖**:先查最新 status=done 的 survey_outline bundle;找不到 → bundle 标 failed
  - 输入:outline.content_md + project(name / customer / kickoff_date / industry) + created_by 用户名(我方联系人)
  - LLM 走 _llm_call,task='output_doc_generate',max_tokens=8000,timeout=360
  - 写回 content_md,extra 加 `source_outline_bundle_id` + `agentic_version='v1'`
  - 注:Project 模型实际只有 created_by 不是 owner_id;实际没有 customer_contact 字段 → 在 prompt 里留空让客户自己填
- [x] **B.2** `backend/services/agentic/research/plan_generator.py`:SYSTEM_PROMPT(5 章对客模板)+ build_user_prompt(outline_md, project_meta)

#### C. 后端 — Celery task
- [x] **C.1** `backend/tasks/output_tasks.py` 加 `@celery_app.task(name="generate_research_plan", ..., soft_time_limit=600, time_limit=900)` 包裹 runner.generate_research_plan
- [x] **C.2** `backend/tasks/output_tasks.py` `_kind_to_task` 字典加 `research_plan`;顶部 docstring 同步

#### D. 前端 — API & 类型
- [x] **D.1** `frontend/src/api/client.ts` `OutputKind` 加 `'research_plan'`
- [x] **D.2** `saveOutputContent` 注释同步加 research_plan;两份 ConsoleProjectDetail 的 `BRIEF_KINDS` / `V3_DOC_DRIVEN_KINDS` 加 research_plan;两份 fallback `DEFAULT_STAGES` 的 survey 阶段 sub_kinds 加 research_plan

#### E. 前端 — ResearchWorkspace(两份:legacy + redesign)
- [x] **E.1** redesign ResearchWorkspace Props 加 `researchPlanBundle / researchPlanInflight`(命名加 prefix,避免跟 ImplementationWorkspace 的 planBundle 冲突)
- [x] **E.2** legacy ResearchWorkspace 同 E.1
- [x] **E.3** 两份 `type ResearchView` 加 `'plan'`(放 outline 后)
- [x] **E.4** 两份 useEffect 派发 activeKind:`'research_plan' → setView(researchPlanBundle ? 'plan' : 'preparation')`
- [x] **E.5** 两份顶部 ViewTab 增加「调研计划(客户版)」tab(图标 `Send`,放在调研大纲之后)
- [x] **E.6** 两份新增 view === 'plan' 分支:plan 存在 → 卡片 + 编辑按钮 + 复用 `OutlineMarkdownView`;planEditing → 复用 `OutlineEditorView`;plan 不存在但 outline 已 done → 提示点上方按钮生成;outline 也没有 → 提示先生成大纲
- [x] **E.7** 两份顶栏加「生成调研计划」按钮:条件 `outlineBundle?.status === 'done' && !researchPlanInflight`;有旧 plan 时 confirm 覆盖
- [x] **E.8** inflight 状态:planInflightId 加入 useEffect 触发跳转 preparation;planEditing 也一并 reset

#### F. 前端 — ConsoleProjectDetail(两份)派发 bundle
- [x] **F.1** `frontend/src/pages/console/ConsoleProjectDetail.tsx` `<ResearchWorkspace>` 加传 `researchPlanBundle/Inflight`
- [x] **F.2** `frontend/src/redesign/console/ConsoleProjectDetail.tsx` 同 F.1

#### G. 验证
- [x] **G.1** 后端 syntax check 全通过(`py_compile outputs.py / stage_flow.py / runner.py / plan_generator.py / output_tasks.py`)
- [x] **G.2** `_migrate_research_plan_into_survey` 4 个场景跑通(已存在 / 插到 outline 后 / 无 outline 时追加 / 无 survey 阶段不动)— 见 task A.8 验证
- [x] **G.3** 前端 `npx tsc --noEmit` 通过(剩余报错全是预存 meeting 子模块路径,跟本次改动无关)
- [ ] **G.4** 端到端 smoke(部署到 UAT 后):有 outline 的项目 → 点「生成调研计划」→ 看到 plan tab 内容 → 点编辑改一段保存 → 没 outline 的项目点生成 → bundle 标 failed,error 文案合理

### 边界
- 不动 survey_outline 现有 7 模块逻辑 / planner / critic 流水线
- 不动 outline / survey / report 任意现有数据或前端组件
- research_plan 失败时,outline 不受影响(不 chain,不 cascade)
- 不自动连带触发(用户手动按按钮),跟 survey / report 一致
- 项目列表 STAGES badge 不动(survey 阶段已存在)
- 导出格式只支持 markdown + docx(走 outputs.py 现有 `("insight", "survey_outline", "survey")` 那条分支)

---

## 项目洞察生成时自动连带启动会 PPT(2026-06-03)— 用户 /goal

### 目标
点「生成项目洞察」 → insight 完成后**自动**新建并触发 kickoff_pptx 生成(只 PPT 不 HTML;每次重生 insight 都连带重生 PPT)。

### 拆解
- [x] **A. Celery chain** `backend/tasks/output_tasks.py`
  - `generate_insight` task 跑完 `_run(_gen(...))` 后,调 `_chain_kickoff_pptx_after_insight`
  - chain helper:async 拿 insight bundle 状态,只有 `status='done'` 才创建 kickoff_pptx bundle + dispatch task
  - chain 异常 swallow(Logger warning),不能让 chain 失败误把 insight task 标 failed/retry
  - 每次新建 kickoff bundle(与 `/api/outputs/generate` 现有语义一致,前端按最新 done 展示)
- [x] **B. 验证**
  - 后端 syntax check ✓
  - 边界:insight task 抛异常 → 不 chain(`_run` 已抛);insight bundle 标 failed → chain skip;auto-restart insight → chain 也会触发(语义 OK)

### 边界
- 不动 runner / output_service,只在 Celery task 层挂钩
- 不去重「项目里已有 kickoff bundle」— 每次都新建(用户已确认「总是连带重生」)
- 自动连带不触发 kickoff_html(用户已确认仅 PPT)

---

## 启动会 PPT 并入项目洞察(2026-06-03)— 用户 /goal

### 目标
**启动会·PPT / 启动会·HTML 不再作为独立 stage**,作为「项目洞察」阶段下的 sub_kinds 并列存在(跟 insight 同 stage)。两个产物都保留,后端 kind / Celery / brief 流程不动。

### 拆解
- [x] **A. 后端默认阶段配置** `backend/api/stage_flow.py:30` DEFAULT_STAGES
  - insight 阶段:`kind=None` + `sub_kinds=[insight, kickoff_pptx, kickoff_html]`
  - 删 `kickoff` / `kickoff_html` 两个独立阶段
- [x] **B. 后端惰性迁移** `_read()`:DB 已有自定义 stage_flow 且含旧的独立 kickoff/kickoff_html 阶段时,自动迁进 insight.sub_kinds(写回 DB,只跑一次,幂等)
- [x] **C. 前端 fallback DEFAULT_STAGES** 两处同步
  - `frontend/src/pages/console/ConsoleProjectDetail.tsx:79`
  - `frontend/src/redesign/console/ConsoleProjectDetail.tsx:84`
- [x] **D. 项目列表 badge STAGES** 两处去掉 kickoff_pptx 条目
  - `frontend/src/pages/console/ConsoleProjects.tsx:11`
  - `frontend/src/redesign/console/ConsoleProjects.tsx:23`
- [x] **E. 验证**
  - 后端:`_migrate_kickoff_into_insight` 4 个场景跑通(典型迁移 / 幂等 / 仅 pptx / 防重复)
  - 前端:`npx tsc --noEmit` 跟本次改动相关 0 错误(预存在的 meeting 子模块缺失与本次无关)
  - 边界确认:中央工作区按 activeKind 分支(InsightWorkspace / BlueprintDesignWorkspace),不依赖 stage key,免动 dispatch ✓

### 边界
- 不动 `kickoff_pptx` / `kickoff_html` 的后端 kind / Celery task / brief / API 路径
- 不动已生成的 kickoff bundle 数据
- 不动后台「输出智能体」/「skill」对 kickoff_pptx 的配置(那是按 kind 而非 stage)
- 仅 UI 层和 stage_flow 配置的合并,可回退(重置默认 stage_flow 即可)

---

## 四项修复(2026-06-02)— 用户 /goal,全部做完并自测

### T1. 对象字段表「卡住」永久转圈
根因:`_generate_design_artifact` 内部 LLM 超时(主 720s + linter 2×600s ≈ 1920s 最坏)
> Celery `generate_object_field_layout/process_setup` 的 `time_limit=1200`(20min)→ 长 markdown
跑 linter 时被硬杀 → runner 的 except 来不及跑 → bundle 永停 `generating`。部署滚动重启 worker
也会 orphan 在途任务同样卡死。前端 `bundleByKind` 只认 done、`inflightByKind` 只认 pending/generating,
所以 bundle 变 `failed` 后会落到空态(带「生成」按钮)→ 天然可重试。
- [x] `backend/tasks/output_tasks.py`:两个 design 任务 `soft_time_limit=1800, time_limit=2100`(>1920)
- [x] 【默认重启工作机制】`_recover_stale_bundles`:pending/generating 且 updated_at 早于 30min 的 bundle
  自动重新派发生成任务(沿用文档 requeue 思路),最多 3 次,超限才标 failed。beat 每 300s + 服务启动各跑一次
  (替换 main.py 原「只标 failed」逻辑,两处同源)
- [x] linter 守卫:独立 ASCII 流程 > 40 直接跳过图表审校(对象字段表实测 108 处,一次 LLM 调用挂死 23h)
- [x] `backend/tasks/convert_task.py` beat 注册 recover_stale_bundles,300s 一次
- 现场确认:用户那条 object_field_layout 卡 generating 23h(linter 第 1/2 轮 108 处 ASCII)→ 已被 startup
  恢复翻掉;同项目另有一条 done(39k 字)被它遮挡,翻掉后前端回落到 done 版本正常显示
- 边界:阈值 30min > 单步最大进度间隔 ~12min(主 LLM 调用),不误杀在途任务(在跑的任务持续刷 updated_at)
- [x] GitHub Secret `DEPLOY_HOST` 同步改成新服务器 IP 34.67.136.67(换机必做,CLAUDE.md 已记)

### T2. 删一句废话文案
- [x] `frontend/src/pages/console/ConsoleProjectDetail.tsx`:删「超过 15 分钟…可耐心等待」误导段(超 15min 其实会被 kill)

### T3. 项目删除按钮(列表+详情)+ 级联删文档
现状:`DELETE /projects/{id}?cascade` 只解关联不删文档;用户要「相关文档同步删除」
- [x] `backend/api/documents.py`:抽 `purge_document_storage(session, doc)`(chunk 向量+minio+row,不 commit),`delete_document` 复用
- [x] `backend/api/projects.py`:加 `purge_documents` query 参数 → true 时逐个删关联文档再删项目;保留旧 cascade(解关联)语义
- [x] `frontend/src/api/client.ts`:`deleteProject(id, { cascade?, purgeDocuments? })`
- [x] 新建 `DeleteProjectControl`(触发按钮+确认弹窗+调用),legacy/redesign 列表卡片 + 详情页四处接入
- 边界:卡片是 `<button>`,删除控件做成同级绝对定位按钮(不嵌套);删后 invalidate ['projects']+['stage-summary'],详情页跳回列表

### T4. 新建会议页:实时录音+实时转写
方案:Web Speech API(webkitSpeechRecognition,zh-CN,continuous+interim)客户端实时转写,
onend 自动重启防断流,计时;停止后文本落 transcript 走既有 `createMeetingFromText`(零后端改动);不支持降级提示走上传
- [x] 新 hook `meeting/frontend/src/hooks/useSpeechRecorder.ts`
- [x] `ConsoleMeetingNew.tsx`(legacy+redesign)加第三 mode「实时录音」

### 部署
本地 commit+push → 触发 `Deploy PROD`(workflow_dispatch,confirm=deploy);prod 已镜像化 CI 部署。
⚠️ 旧记:SSH 直连服务器 banner 超时。**2026-06-03 重测:SSH 通**(`ssh -i ~/.ssh/id_rsa_github_deploy liu@34.67.136.67`),
可 `docker compose ps / logs / exec -T postgres psql -U kb_admin -d kb_system` 直接排查。reaper 仍是兜底机制。

---

## 新迭代:meeting-ai 项目整合(2026-05-11) — 方案 B 深度合并

### 背景
当前 `/console/meeting` 是 iframe 嵌入 `meeting.liii.in`(外部部署的 meeting-ai)。
方案 B 目标:**把 meeting-ai 的代码完整合并进 kb-system**——后端作为 router 挂上去,前端用 React+Tailwind 重写,数据库迁到 Postgres,会议数据可与 KB 项目深度联动。

### 集成蓝图(基于双向探查)

**meeting-ai 现状**
- 后端 19 endpoints + 1 WS(路径前缀 `/api/meetings`)
- 模型 2 张表:`meetings`(20+ 字段) + `requirements`(meeting_id FK)
- AI pipeline 4 阶段:TextPolisher / MinutesGenerator / RequirementExtractor / StakeholderExtractor
- ASR 3 选 1:whisper(本地大模型)/ xiaomi(MiMo-V2 Omni)/ xunfei(讯飞 WS 流式)
- 飞书:FeishuDocWriter(文档)+ FeishuBitableWriter(多维表)
- 前端 vanilla JS + Arco Design + vis-network + hash router,**必须完全重写**

**kb-system 接入点**
- 路由集中在 `backend/main.py` 末尾 include_router,无版本前缀
- 鉴权:`Depends(get_current_user)` JWT
- DB:Postgres + async SQLAlchemy,无 alembic(用 `Base.metadata.create_all` 幂等迁移)
- LLM:走 `services/model_router.py`(多 provider 统一封装)
- 异步:Celery + Redis,worker 入口 `tasks/convert_task.py`
- 文件:MinIO(bucket 由 env 注入)
- 前端:React Router v6 + TanStack Query + Tailwind,API 层在 `api/client.ts`

### 决策(已做,需要用户拍板的项打 ⚠️)

| # | 决策 | 选择 | 理由 |
|---|---|---|---|
| 1 | 路由前缀 | `/api/meeting`(单数) | 符合 kb-system `/api/<模块>` 习惯 |
| 2 | 主键 | 保留 `int autoincrement` | meeting-ai 内部 19 处用 meeting_id:int,改 UUID 改动大 |
| 3 | JSON 字段类型 | Postgres `JSONB` | 替代 SQLite TEXT,可索引可查询 |
| 4 | 多用户隔离 | `meetings.owner_id → users.id` FK | 接 JWT,默认只查 owner 自己的 |
| 5 | 项目关联 | `meetings.project_id → projects.id` FK(替代原字符串 kb_project_id) | 联通 kb-system 项目体系 |
| 6 | ASR 后端 | **只保留 xiaomi**(用户拍板砍 xunfei) | xiaomi 走 OpenAI 兼容 API 可复用 model_router;whisper 本地大依赖砍;xunfei WS 流式不要 |
| 7 | AI pipeline | 改造为走 model_router,串成 1 个 Celery task | 复用 kb-system 多 provider + 限流 |
| 8 | 文件存储 | MinIO bucket `meeting-audio` | 替代本地 uploads/ |
| 9 | WS 鉴权 | JWT(query param `?token=<jwt>`) | 替代 WS_AUTH_TOKEN 单点 token |
| 10 | KBClient 反向调用 | 改成内部 service call(直接调 kb-system service) | 不走 HTTP,事务可控 |
| 11 | 飞书集成 | **改用户级配置**(用户拍板):User 加 feishu_app_id + feishu_app_secret_encrypted,Settings.tsx 加配置区 | 每个用户用自己的飞书租户,不共享全局凭证;secret 用 Fernet 加密入库 |
| 12 | 数据迁移 | 不迁(meeting-ai 是 dev 环境) | 从零开始,简化 |
| 13 | 前端利益相关者图 | **reactflow**(已知轻量,跟 React 配套) ⚠️ | vis-network 也行但需另装 |
| 14 | iframe 处理 | 删除 ConsoleMeeting.tsx 现有 iframe,改为本地路由 | B 方案的核心要求 |
| 15 | worktree | **建议切回 main 新开 worktree** ⚠️ | 当前 `busy-noyce` 在 course 分支,集成混进去会乱;但用户没回应所以默认就在当前继续,等用户决定 |

⚠️ 项目 6 / 13 / 15 是用户可能想调整的,实施前确认。

---

### Block A — 后端基础(模型 + CRUD + 鉴权)
- [ ] **A.1** `backend/models/meeting.py`:Meeting + Requirement 模型
  - 字段对齐 meeting-ai 现状,JSON 字段改 JSONB
  - 加 `owner_id`(FK users)+ `project_id`(FK projects, nullable)
  - 删 `kb_project_id`/`kb_project_name` 字符串字段(被 project_id FK 替代)
- [ ] **A.2** `backend/api/meeting.py`:挂 19 endpoints 中的 CRUD 子集(create / from-text / list / detail / patch / delete / requirements)
  - 全部 `Depends(get_current_user)`
  - list/detail 默认按 owner_id 过滤,管理员可看全部
- [ ] **A.3** `backend/main.py` 注册 router,prefix=`/api/meeting`
- [ ] **A.4** import 触发 `Base.metadata.create_all` 建表(参考 project_briefs 模式)
- [ ] **A.5** 验证:`python -c "from models import meeting"` 不报错;curl 注册的端点返回 401

### Block B — AI Pipeline(改造为 model_router + Celery)
- [ ] **B.1** `backend/services/meeting/`(新目录)
  - `polisher.py` / `minutes.py` / `requirement.py` / `stakeholder.py`(从 meeting-ai 拷贝并改造)
  - 内部 LLM 调用全部走 `services/model_router.py`,不直接 import openai
- [ ] **B.2** prompts 迁到 `backend/prompts/meeting/`(参考现有 prompts 目录结构)
- [ ] **B.3** `backend/tasks/meeting_tasks.py`:Celery task `process_meeting(meeting_id)` 串 4 阶段
- [ ] **B.4** API 接 task:`POST /api/meeting/{id}/process` 改为触发 Celery,立即返回 202
- [ ] **B.5** 单点 actions:`/actions/polish`、`/actions/summarize`、`/actions/extract_requirements`、`/actions/extract_stakeholders` 4 个 endpoint 直接调 service 函数(同步,小数据量)
- [ ] **B.6** 验证:塞一段假 transcript 跑 process,检查 raw_transcript → minutes 全链路

### Block C — 文件上传 + ASR
- [ ] **C.1** `services/meeting/storage.py`:上传音频到 MinIO,返回 object_key
- [ ] **C.2** `POST /api/meeting/{id}/upload` 接口:multipart 上传 → MinIO,触发 ASR task
- [ ] **C.3** `services/meeting/asr/xiaomi.py`:**只迁 xiaomi**(用户拍板砍 xunfei + whisper)
  - 接口形态:`async transcribe(audio_bytes) → str`,走 OpenAI 兼容 API
  - 复用 kb-system `services/model_router` 的 client 池
- [ ] **C.4** `tasks/meeting_tasks.py` 加 `transcribe_meeting(meeting_id)`:下载 MinIO 音频 → 调 ASR → 写 raw_transcript → 自动触发 process
- [ ] **C.5** env 配置:`OPENAI_*` 已有,新增可选 `XIAOMI_OMNI_MODEL`(默认 `mimo-v2-omni`)

### Block D — WebSocket 实时录音 [**已延期 (2026-05-11)**]
用户拍板 D-Skip:暂不做 WS,前端走 MediaRecorder 录完再走 POST /upload。

延期原因:xiaomi mimo-v2-omni 是 OpenAI 兼容 chat completion 接口,不是真流式 ASR;
meeting-ai 原 WS 实现本质是"每 15-30s 缓冲一段 → 调 xiaomi → 推回",所谓"实时"是"准实时"。
upload 整段路径已经把功能闭环,等用户实际有"边开会边看转写"诉求再单做一个 Block D。

- [ ] **D.1** `backend/api/meeting_ws.py`:WS endpoint(延期)
- [ ] **D.2** WS 鉴权(延期)
- [ ] **D.3** 实时缓冲 + 增量 ASR(延期)
- [ ] **D.4** 中断恢复(延期)
- [ ] **D.5** 挂 ws router(延期)

### Block E — KB 联动 + 飞书集成(用户级凭证)
- [ ] **E.1** 替换 KBClient 为内部 service call
  - `sync-kb` 端点:直接调 `services/document_service.create_doc`,不走 HTTP
  - `sync-stakeholder-map-kb`、`sync-requirements` 同样改写
- [ ] **E.2** User 模型加字段(幂等迁移)
  - `feishu_app_id: str | None` (String 128)
  - `feishu_app_secret_encrypted: str | None` (Text, Fernet 加密后的 base64)
  - 加密密钥从 env `APP_SECRET_KEY` 派生(已有,看 settings 是否暴露,没有就新增)
- [ ] **E.3** `services/meeting/feishu/`:迁移 FeishuAuth / FeishuDocWriter / FeishuBitableWriter
  - 改 FeishuAuth 接受 (app_id, app_secret) 参数化(原版从 env 读)
  - 新增 `get_user_feishu_credentials(user_id)`:从 User 表读出并解密
- [ ] **E.4** 用户飞书凭证 API:
  - `GET /api/users/me/feishu` → 返回 `{configured: bool, app_id: str | None}`(不返 secret)
  - `PUT /api/users/me/feishu` → 接收 `{app_id, app_secret}`,加密入库
  - `DELETE /api/users/me/feishu` → 清空配置
- [ ] **E.5** 会议飞书 endpoints 接通:
  - `POST /api/meeting/{id}/export-feishu` / `/sync-requirements` / `/sync-stakeholder-map-kb`
  - 入口先读当前用户的飞书凭证,未配置返回 412 `{detail: "请先在设置中配置飞书集成"}`
- [ ] **E.6** Settings.tsx 加「飞书集成」卡片
  - 显示当前配置状态(已配置 ✓ / 未配置)
  - 输入 APP_ID + APP_SECRET → 保存(secret 始终展示 `••••••••` 占位)
  - 「清除配置」按钮
  - 帮助链接:跳飞书开放平台创建自建应用指南

### Block F — 前端 API 层 + 路由
- [ ] **F.1** `frontend/src/api/client.ts` 加 meeting 域函数:
  - `listMeetings()` / `getMeeting(id)` / `createMeeting` / `createMeetingFromText` / `patchMeeting` / `deleteMeeting`
  - `uploadAudio(id, file)` / `processMeeting(id)` / 4 个 actions
  - `syncMeetingToKB` / `exportFeishu` / `syncRequirementsBitable`
  - TS 类型:`Meeting`、`Requirement`、`MeetingMinutes`、`StakeholderMap`
- [ ] **F.2** `frontend/src/pages/console/ConsoleMeeting.tsx` 重写:**删 iframe**,改为列表页(用 TanStack Query 拉 listMeetings)
- [ ] **F.3** 新增路由 `/console/meeting/:id`,对应 `ConsoleMeetingDetail.tsx`
- [ ] **F.4** 新增路由 `/console/meeting/new/(record|upload|text)` 三种创建方式

### Block G — 前端会议列表 + 创建
- [ ] **G.1** `ConsoleMeeting.tsx` 列表:卡片或表格,显示标题 / 时间 / 状态 / 关联项目 / 操作(查看/删除)
  - 状态徽标(recording / processing / completed / failed)
  - 顶部三个新建入口:🎙️ 录音 / 📁 上传 / 📝 文本
- [ ] **G.2** `NewMeetingRecord.tsx`:MediaRecorder API + WebSocket 实时转录显示
- [ ] **G.3** `NewMeetingUpload.tsx`:文件拖拽上传 + 进度
- [ ] **G.4** `NewMeetingText.tsx`:粘贴文本 → 直接创建会议 → 自动 process

### Block H — 前端会议详情(多 tab)
- [ ] **H.1** `ConsoleMeetingDetail.tsx` 骨架:Hero(标题/时间/状态)+ Tab Bar + 内容区
- [ ] **H.2** Overview tab:基本信息编辑、关联 KB 项目(下拉 listProjects)、操作按钮(导出/同步/重跑 pipeline)
- [ ] **H.3** Transcript tab:raw + polished 双栏对照,可编辑
- [ ] **H.4** Minutes tab:summary / key_points / decisions / action_items 结构化展示 + 编辑
- [ ] **H.5** Requirements tab:表格 + priority/module 筛选 + 状态切换
- [ ] **H.6** Stakeholders tab:reactflow 渲染 stakeholder_map.{stakeholders, relations},节点可拖,双击编辑
- [ ] **H.7** Actions tab:导出飞书、同步 KB、同步多维表、单点触发 4 个 action

### Block I — 部署 + 端到端测试
- [ ] **I.1** docker-compose.yml:确认 backend / celery_worker 重启会拾取新 task
- [ ] **I.2** .env 远程同步新增变量(FEISHU_*、XUNFEI_*、ASR_ENGINE)
- [ ] **I.3** MinIO 建 bucket `meeting-audio`
- [ ] **I.4** rsync + rebuild backend + frontend + celery_worker
- [ ] **I.5** 端到端 smoke:
  - 文本创建 → 看到 process 自动跑完 → minutes/requirements 出来
  - 录音 → WS 实时转录显示 → 完成后 process
  - 关联项目 → 同步到 KB → kb-system 项目里看到这个文档
  - 飞书导出 → 收到飞书文档 URL

### 边界
- 不动 kb-system 现有任何 API(只新加 `/api/meeting/*`)
- 不动 ConsoleQA / ConsoleHome / ConsoleProjects 等模块
- 不删除 meeting-ai 项目本身(保留独立部署,作为可对照的备份,后续稳定再砍)
- meeting.liii.in 暂不下线
- 仅迁代码逻辑,不迁 meeting-ai 现有 SQLite 历史会议数据(已决策)
- 不引入 alembic(沿用 `Base.metadata.create_all` 幂等模式)
- 不动 LEARNING.md 里标记的「三处 kind 列表必须同步」逻辑(meeting 不是 output_kind,不入 KIND_TO_TASK)

### 关键技术点 / 风险
- **Postgres async session 跨 Celery worker**:LEARNING.md §convert_task 提到 worker fork 后用 NullPool,新 meeting_tasks 沿用同模式
- **MinIO 音频文件 ACL**:私有 bucket,内部 service 用 presigned URL 读
- **WebSocket 鉴权**:WS 没有 Authorization header,只能 query param 传 token,要在 ws handshake 处校验(参考 fastapi 文档)
- **reactflow 引入**:需 `npm install reactflow`,bundle 增大约 100KB
- **音频 chunk 缓冲策略**:meeting-ai 现状 10-30s 硬编码,迁过来时参数化
- **多用户隔离**:listMeetings 必须按 owner_id 过滤,否则用户能看到别人的会议(严重隐私问题)

### 节奏建议
- Block A → B → C → D → E 后端先完整可用,每个 Block 完成 commit,Block E 后第一次部署
- Block F → G → H 前端,Block H 完成后第二次部署
- Block I 整体 smoke

预计:后端 1.5 天 / 前端 1 天 / 联调部署 0.5 天 ≈ 3 天

---

## 旧迭代:4 个用户反馈点(2026-05-08)

来自一次反馈回合,4 件事独立性高,工作量差异大,做之前先排优先级。

### 现状速览(自动审计结果)

| # | 主题 | 现状 | 复杂度 |
|---|---|---|---|
| 1 | 文档转写脱敏(项目名/客户名/合同金额 → 拼音首字母) | `tasks/convert_task.py:371` 无脱敏 hook;`requirements.txt` 没 pypinyin | **大** |
| 2 | 调研大纲 tab 行右边加「生成调研问卷」快速按钮 | `ResearchWorkspace.tsx:277` 已有 `flex-1` 占位空间 | **小**(~30 分钟) |
| 3 | 项目洞察体检不响应文档变化 | `CenterWorkspace.tsx:724` query key=`['insight-checkup',pid]`,但 `DocChecklist.onUploaded` 没 invalidate 这个 key | **小**(几行代码) |
| 4 | PDF 图片型组织架构图 → 自动写入 stakeholder_graph | 视觉 OCR 已有(`converter_agent.py:227` 走小米 MiMo),但只产 markdown,不解析成 node/edge | **大** |

---

### Topic 1 · 文档转写脱敏

**用户原话**:转写时去除项目名 / 客户名 / 合同金额,客户名换成中文拼音首字母大写(中国电信 → ZGDX)

**实施步骤**(若做):
1. `pip install pypinyin` 加进 backend/requirements.txt
2. `services/redactor.py` 新建:
   - `_initials_pinyin(name)`:中文 → 拼音首字母大写(过滤标点 / 空格)
   - `redact_markdown(md, project)`:扫文本,把 project.name / project.customer 全部替换为占位符,客户名替换为拼音简写
   - 合同金额:用 regex 匹配「¥xxx 元」/「人民币 xxx 万」/「金额 xxx」类模式 → 替换为「[金额已脱敏]」
3. `tasks/convert_task.py:371` 之后插一步:若 doc 挂在项目下,跑脱敏后再写入 `markdown_content`
4. 验证:上传含「中国电信项目」「合同金额 ¥350 万」的文档 → 检查 markdown 里都被替换

**风险**:
- 客户名变体识别(「中国电信」/「电信」/「China Telecom」/「中电信」都是同一家)— 单纯 string replace 漏太多。可能需要 LLM 一次解析或维护「客户别名表」字段
- 合同金额 regex 容易过度匹配(误伤普通数字)
- 脱敏后影响后续 LLM 生成质量(LLM 看不到真名 / 真金额做行业对比时少了关键信息)
- 是否要保留原文?推荐:`Document.markdown_content_raw`(原文) + `Document.markdown_content`(脱敏版),后续生成用脱敏版
- **范围决策**:只对项目下文档脱敏?KB 共享文档不脱?

---

### Topic 2 · 调研大纲完成后加「生成调研问卷」快速按钮

**用户原话**:调研大纲生成完成后,可以在图例处增加一个生成调研问题的按钮以增加用户友好性

**实施步骤**:
1. `ResearchWorkspace.tsx:260-276` 三个 ViewTab 之后,`<div className="flex-1" />` 之前,插一个 conditional 按钮:
   - 条件:`outlineBundle?.status === 'done' && !surveyBundle && !surveyInflight`
   - 文案:「✨ 生成调研问卷」
   - 点击:复用现成 `trigger('survey')` 逻辑(已经在 PreparationView 里)
   - 视觉:跟「重新生成」按钮一致的橙色渐变 small 按钮
2. 已经在生成中:换成「生成中… 」disable 状态
3. 已生成:不显示按钮(或者改文案「重新生成调研问卷」)

**工作量**:30 分钟

---

### Topic 3 · 体检功能不动态更新

**用户原话**:项目洞察的体检功能好像不会根据最新上传的文档而动态检查

**根因**:
- `InsightCheckupDrawer` 用 `useQuery({ queryKey: ['insight-checkup', projectId], staleTime: 0 })`
- `staleTime=0` 让数据**视为已过期**,但因为 `refetchOnWindowFocus=false`,不会自动重拉
- `DocChecklist` 上传新文档后只 `invalidate(['project-docs', projectId])`,**没有 invalidate `['insight-checkup', projectId]`**

**实施步骤**:
1. `DocChecklist.tsx:71` 同时 invalidate `['insight-checkup', projectId]`
2. 文档删除 / 重传 / 类型变更 同样 invalidate
3. 或者更广义:用一个 utility `invalidateProjectQueries(projectId)` 把所有项目相关 query key 一起 invalidate(`project-docs` / `insight-checkup` / `outputs` 等)
4. 测试:上传一份新文档 → 立刻关 / 重开「先看体检」抽屉 → 看到新结果

**工作量**:15 分钟

---

### Topic 4 · PDF 图片型组织架构图 → 自动写入 stakeholder_graph

**用户原话**:对于 pdf 里图片类型的组织架构图,上传后无法识别并添加组织架构

**根因**:
- 现有视觉 OCR(`converter_agent.py:227`)只把扫描 PDF 转成 markdown 文本,产物是「销售部 | 销售总监」这种表格
- `stakeholder_graph` 是手动画的画布,没有任何「自动从文档识别 → 写入 nodes/edges」的链路
- 即便视觉 OCR 把组织图识别出来了,也没有 pipeline 把树状结构 → graph 节点 / 边

**实施步骤**(若做):
1. **视觉解析 prompt**:加一个针对组织架构图的 prompt — 让视觉 LLM 输出 JSON `{nodes: [{id, name, role, parent_id}], edges: [{src, dst, type}]}`
2. **触发条件**:文档处理完后,如果 doc_type=「组织架构图」(或文件名含「组织」/「架构」),跑这个解析
3. **写入**:把 nodes / edges 合并到 `ProjectBrief.fields[stakeholder_graph]` 里(避免覆盖人工编辑过的;用户视角是「文档解析结果作为草稿,人工再调」)
4. **UI 反馈**:解析完成后给个气泡「✨ 已从《XXX.pdf》自动识别 12 个角色 + 组织关系,点这里查看 → 手动校正后保存」
5. **失败兜底**:LLM 解析失败 / 图片无法读懂时,只 log 不写入,不阻塞文档转写主流程

**风险**:
- 视觉 LLM 对中文组织图识别的准确率波动大(尤其手写 / 模糊图片)
- 组织图位置:可能在 PDF 第 3 页中间,需要先定位「这页有组织架构」再解析
- 已有手工 stakeholder_graph 不能被覆盖
- 中英文 + 多套组织图(集团 / 子公司 / 部门)的合并策略

**工作量**:大,3-5 小时,且效果不可控(视觉 LLM 输出稳定性)

---

## 推荐节奏

按「价值/成本」比:**先做 #2 + #3**(总计 1 小时,体感改善大),作为 Block 1 部署。
**#1 + #4** 单独评估排期,每件至少需要单次完整对齐 + 试错,不建议跟其他任务混在一起做。



### 背景
当前注册完全开放(任何人 username + 6 位密码 即可注册成 console_user),登录无验证码。
需要把入口收紧到「凭邀请码注册 + 复杂密码 + 图形验证码防爬虫」。

### 用户对齐的决策
1. **邀请码**:新注册必须带邀请码;邀请码全套能力(有效期 / 次数 / 手动吊销 / 限定角色)
2. **密码**:≥10 位 + 大小写 + 数字 + 特殊字符
3. **验证码**:图形验证码(后端生成 PNG,登录 + 注册都要)

### Phase A — DB schema + migration
- [ ] **A.1** 新表 `invite_codes`:
  - `id (uuid)`, `code (str, unique 16 chars)`, `created_by (user_id fk)`,
    `max_uses (int, default 1, 0=无限)`, `used_count (int, default 0)`,
    `expires_at (datetime nullable, null=永久)`,
    `target_role (str, default 'console_user', 限 console_user/admin)`,
    `revoked (bool, default false)`, `note (str nullable)`,
    `created_at`, `updated_at`
- [ ] **A.2** 新表 `captcha_challenges`(图形验证码挑战):
  - `id (uuid)`, `code_hash (str, sha256)`, `expires_at (datetime, 5 分钟)`,
    `used (bool default false)`, `created_at`
  - 注:存 hash 不存明文,防 DB 泄漏
- [ ] **A.3** User 加字段 `signed_up_via_invite_code (str nullable)`(审计用)
- [ ] **A.4** alembic migration 文件

### Phase B — 后端
- [ ] **B.1** `services/security/password_policy.py` 新文件
  - `validate_password_strength(pwd, username) → (ok, reason)`
  - 规则:≥10 位 / 含大小写 / 含数字 / 含特殊字符 / 不等于 username
- [ ] **B.2** `services/security/captcha.py` 新文件
  - `generate_captcha() → (captcha_id, png_b64)` 用 captcha 库
  - `verify_captcha(captcha_id, answer) → bool` 一次性消费,即时失效
- [ ] **B.3** 新 endpoint `GET /api/auth/captcha`:
  - 返回 `{captcha_id, image_b64}`,前端展示
- [ ] **B.4** 改 `POST /api/auth/register`:
  - 必填 `invite_code`, `captcha_id`, `captcha_answer`
  - 验证 captcha → 验证 invite_code(存在 / 未吊销 / 未过期 / 未用尽)→ 校验密码强度
  - 通过后:邀请码 used_count + 1 / captcha 标 used / user 创建,role 取邀请码 target_role
  - 写 `signed_up_via_invite_code` 审计字段
- [ ] **B.5** 改 `POST /api/auth/login`:
  - 必填 `captcha_id`, `captcha_answer`
  - 验证 captcha → 用户名密码原逻辑
- [ ] **B.6** 改 `POST /api/auth/change-password`:
  - 加密码强度校验
- [ ] **B.7** 新 endpoints `/api/admin/invite-codes/`(需 is_admin)
  - `POST /` 创建邀请码(body: max_uses / expires_in_days / target_role / note);返回完整 code
  - `GET /` 列表(分页 + 筛选 active/expired/revoked/exhausted)
  - `POST /{id}/revoke` 吊销
  - 不允许删除(审计完整性)
- [ ] **B.8** requirements.txt 加 `captcha`(轻量,~50 行 wrapper Pillow)

### Phase C — 前端
- [ ] **C.1** `pages/Login.tsx` 改:
  - 加 captcha 控件:展示 PNG + answer 输入框 + 「换一张」刷新按钮
  - 提交时带 captcha_id + captcha_answer
  - 错误时自动刷新 captcha
- [ ] **C.2** `pages/Register.tsx` 改:
  - 加邀请码必填输入框
  - 加 captcha 控件
  - 加密码强度实时提示器(check 4 项 + 长度)
- [ ] **C.3** 新 `pages/admin/InviteCodes.tsx`:
  - 列表 table:code(支持复制) / 创建人 / 创建时间 / 过期时间 / 已用 / 限额 / 状态徽标 / 备注 / 操作(吊销)
  - 「+ 创建邀请码」按钮 → 弹窗(max_uses / expires_in_days / target_role / note)
  - 创建成功展示完整 code 一次,提示「保存好,关闭后不可再次查看完整 code」
- [ ] **C.4** 在管理员后台菜单加「邀请码管理」入口
- [ ] **C.5** `client.ts` 加 captcha / invite_codes API 函数

### 验证
- [ ] 老用户能正常登录(只是要填验证码)
- [ ] 新注册必须带邀请码,无邀请码注册返回明确报错
- [ ] 邀请码到期 / 用尽 / 被吊销时注册失败
- [ ] 密码不达标时返回明确报错(说明少哪项)
- [ ] 验证码错误返回 400 + 自动刷新
- [ ] 管理员能创建 / 列表 / 吊销邀请码
- [ ] 创建的邀请码可以注册成功一次,扣 used_count

### 部署
分两个 commit:
1. **schema + 后端**:DB 迁移 + 新 endpoints + register/login 改造(老 frontend 无 captcha 字段会断,所以前端 push 必须紧跟)
2. **前端**:captcha + 邀请码 + 后台管理页

为避免老 frontend 临时断,**用 feature flag 兼容**:register/login 当前轮先**captcha + invite_code 可选**(不传则按老逻辑跑),给前端部署窗口期;前端上线 24 小时后再改成强制(下次部署)。

---

## 老迭代:需求调研 v2 — 多维分卷 + 可编辑 + 动态追问(2026-05-07)

### 背景
当前 survey_v2 已能基于 LTC 字典 + SOW 映射生成结构化问卷,但实际顾问执行时存在 6 个痛点:
1. 调研大纲重生成时不跳页,旧大纲覆盖前不可见
2. 问卷只按 LTC 模块分组,执行调研时不便(顾问按"今天见谁"的角色维度更顺手)
3. 没区分"会前发给客户"(自填型) vs "会议中 PM 用"(深挖型)两种使用场景
4. 问卷不可编辑(顾问不能补漏 / 不能删冗余 / 不能改表达)
5. 题目缺最佳实践参考(顾问问"贵司是否有线索管理"时无法当场展示行业最佳实践)
6. 答题过程是静态的(答完一组题没有动态追问,顾问得自己想下一题)

### 6 大需求映射
| # | 需求 | 难度 | 依赖 | 优先级 |
|---|------|------|------|--------|
| 1 | 调研大纲重生成时跳回"准备"页 + 显示文档生成中 | 易 | 无 | P0 |
| 2 | 问卷按调研角色(高管/部门负责人/一线/IT)分组(替代 LTC 模块为默认视图) | 中 | A.1 audience_roles 字段强约束 | P1 |
| 3 | 区分"会前问卷"(客户自填) vs "会中问卷"(PM 深挖) | 中 | A.1 phase 字段 | P1 |
| 4 | 问卷可编辑/增/删 | 中 | C.1 CRUD API + 持久化 | P2 |
| 5 | 题目附最佳实践参考(展开看行业 case + KB 召回) | 易 | A.1 best_practice_refs 字段 | P1 |
| 6 | 实时基于答案动态追问 | 大 | C.1(题目 CRUD)+ D.1(LLM 端点)| P2 |

### Phase A: questionnaire_schema 升级(地基)
- [ ] **A.1** `services/agentic/research/questionnaire_schema.py` QuestionItem 加字段:
  - `phase: 'pre_meeting' | 'in_meeting'`(默认 in_meeting,客户能自答的标 pre_meeting)
  - `audience_roles: list[str]`(已有,但要在 LLM prompt 强约束必填)
  - `best_practice_refs: list[dict]`(每条 {industry_pack_case_name, snippet, source} 或 KB 引用)
  - `parent_item_key: str | None`(动态追问的父题 key,根题为 None)
  - `source: 'ai_generated' | 'human_added' | 'human_edited' | 'follow_up_generated'`
- [ ] **A.2** `executor.execute_survey_subsection` 的 system prompt 强约束输出 phase / audience_roles / best_practice_refs
- [ ] **A.3** `_post_process_items` 兜底:phase 缺失默认 in_meeting;audience_roles 缺失从 subsection.target_roles 兜底;best_practice_refs 缺失置 []

### Phase B: 前端工作区改造(B1+B5 先做,B2+B3 一起做)

#### B.1 — 需求 1:重生成跳准备页 + 文档生成中(P0)
- [ ] B.1.1 `ResearchV1Workspace.tsx` 监听 outline / survey 的 inflight 状态
- [ ] B.1.2 触发"重新生成"按钮 → 立即 setView('preparation')
- [ ] B.1.3 preparation 视图下增加 GenerationProgressCard 显示当前生成中的产物(已有组件,接进来即可)

#### B.5 — 需求 5:最佳实践参考折叠区(P1)
- [ ] B.5.1 `ResearchQuestionnaire.tsx` 题目下方加"参考最佳实践"折叠按钮(default 收起)
- [ ] B.5.2 展开显示 best_practice_refs 列表(每条:行业 case 名 + 简短摘要 + 出处 chip)
- [ ] B.5.3 类型定义 `frontend/src/api/client.ts` QuestionItem 加 best_practice_refs 字段

#### B.2 + B.3 — 需求 2 + 3:角色分组 + 会前/会中分卷(P1)
- [ ] B.2.1 `ResearchV1Workspace.tsx` 左栏新增"按角色"视图模式,默认选中
  - 角色清单从 outline 已识别的"分卷角色"取(高管 / 部门负责人 / 一线业务 / IT 四卷,4 卷模板已在 task.md 旧迭代里固定)
  - 兜底:若 outline 未生成,从 outline_modules.must_visit_departments 取
  - 保留"按 LTC 模块"视图作为切换备选(顶部 toggle)
- [ ] B.2.2 题目按 audience_roles 分组(一条题可能在多角色下,允许重复出现 / 或在一个角色下展示并标注"也见于 X 角色")
- [ ] B.3.1 每个角色视图内分两 tab:**会前问卷** / **会中问卷**(按 phase 字段过滤)
- [ ] B.3.2 提供"导出会前问卷.docx" / "导出会中问卷.docx" 两个独立导出按钮
- [ ] B.3.3 会前问卷的题目类型偏 single/multi/number(客户能快速勾选);会中问卷允许 text/node_pick(深度访谈)

### Phase C: 需求 4 — 问卷 CRUD(P2)
- [ ] **C.1** 后端 API:
  - `POST /api/research/questionnaire-items` 增题(写入 bundle.extra.questionnaire_items)
  - `PUT /api/research/questionnaire-items/{item_key}` 改题
  - `DELETE /api/research/questionnaire-items/{item_key}` 删题
  - 改 / 删触发 source 字段 → 'human_edited'
- [ ] **C.2** 前端 `ResearchQuestionnaire.tsx`:
  - 每题悬浮显示 编辑 / 删除 icon
  - 编辑:inline edit 题干 + 选项池(选项可加可删可改 label)
  - 删除:confirm 后调 DELETE
  - 角色页签底部加"添加题目"按钮 → 弹层(类型 / 题干 / 选项 / why / phase / 受众角色多选)

### Phase D: 需求 6 — 动态追问(P2)
- [ ] **D.1** 后端 `services/agentic/research/follow_up.py`:
  - 函数签名:`generate_follow_ups(parent_item, parent_answer, context: dict) → list[QuestionItem]`
  - LLM prompt:基于父题 + 答案 + 该角色已答记录 + 行业包,生成 1-3 条追问
  - 输出题的 `parent_item_key` 自动指向父题
  - source = 'follow_up_generated'
- [ ] **D.2** API:`POST /api/research/follow_up`
  - body: `{bundle_id, parent_item_key, parent_answer}`
  - 返回新追问列表(直接写入 bundle.extra.questionnaire_items)
- [ ] **D.3** 前端:
  - 答完一题,显示"建议追问 (N)"按钮(异步加载状态)
  - 点击后插入到当前角色列表,父题下方,缩进显示
  - 顾问可拒绝(调 DELETE 删掉追问)
  - 限制:同一根题最多 5 条追问(前端 hard cap,避免无限套娃)

### 部署节奏(每个 Block 完成 commit + push,等 GHA 部署)
1. **Block 1:Phase A + B.1 + B.5**(地基 schema + 需求 1 + 5)
2. **Block 2:B.2 + B.3**(需求 2 + 3 — 视图重构)
3. **Block 3:Phase C**(需求 4 — CRUD)
4. **Block 4:Phase D**(需求 6 — 动态追问)

### 边界
- 不动 outline 生成逻辑(outline 大纲本身已经按 LTC 流程组织,不需要改)
- 不动 LTC 字典 / SOW mapper / KB filter / scope_classifier(已有的 5 个 research/ 资源)
- 不动 critic / challenger 4 维度评分(survey 的 type_diversity 等)
- 不动其他 stage(insight / kickoff / blueprint 占位)
- 复用现有 CuratedBundle.extra.questionnaire_items 持久化路径,不另起 schema
- 同一题可在多角色下出现(audience_roles 是 list);前端可在多视图都展示,以"题目编辑后所有视图同步"为契约
- best_practice_refs 来源优先级:industry_pack.cases > industry_pack.pain_points > KB 切片召回(本期不接 Web)

### 待确认问题(实施过程中可能浮现,逐项推进时再问)
1. 角色分卷的具体清单是否固定 4 卷(高管 / 部门负责人 / 一线业务 / IT)?还是动态?
2. 编辑题目时改的是 bundle.extra 还是另起一张 research_item 表?
3. 动态追问追问的 LLM 模型是否独立选?是否计入 brief 的 token 预算?

---

## 旧迭代:项目洞察 v3 — 文档驱动重构(2026-04-29)

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

### Phase 5 — 端到端联调 + 部署（Block E） ✅
- [x] **E.1** GHA 部署路径(替代 rsync+远程 build):commit 1786236 → push origin main → workflow 25178903262 → test/build/deploy 全 success
- [x] **E.2** 容器健康:backend (healthy) + celery_worker + frontend 正常启动;`DB tables & indexes ready` 日志确认新表 create_all 成功
- [x] **E.3** API 路由探活:`/api/research/{ltc-dictionary,responses,classify-scope,ltc-module-map}` 全部 401(路由存在,未登录正常拒绝)
- [x] **E.4** 前端 tsc --noEmit 0 错误
- [ ] **E.5** 真实项目跑端到端:触发 survey_outline_v2 → 看 markdown 含 LTC 章节 → 触发 survey_v2 → 看 questionnaire_items 数 > 0 → 顾问勾选 → AI 分类(留给用户在浏览器手动验证)

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

---

## 新迭代:桌面 App 方案 1(Electron 壳子,2026-05-12)

### 背景
把 https://kb.liii.in 包成桌面应用。macOS 自用(不签名,右键-打开绕 Gatekeeper),Windows 通过 GitHub Actions 出包(SmartScreen 警告可接受)。本质是浏览器壳 + 独立窗口,后端依旧远程,壳子不引入本地存储。

### 决策
- **框架**:electron-forge(官方推,内置 dmg / squirrel / zip maker)
- **目录**:仓库根 `desktop/`,跟 `backend/` `frontend/` 平级
- **应用名**:"纷享 KB" / **Bundle ID**:`in.liii.kb`
- **加载 URL**:`https://kb.liii.in`(写死,后续要可配再说)
- **图标**:复用 `frontend/public/logo.png`(900×900,electron-forge 自动转 icns/ico)
- **不动现有 `deploy.yml`**:新建 `.github/workflows/desktop-build.yml`,触发方式 `workflow_dispatch` + tag `desktop-v*`

### 任务
- [x] **D1** `desktop/` 初始化 electron-forge webpack-typescript 模板(模板 lock 的 typescript@4.5 与新 @types/node 不兼容,升级到 ~5.5)
- [x] **D2** 主进程:`src/index.ts` loadURL https://kb.liii.in,1440×900,外链走系统浏览器,非 macOS 隐藏菜单栏
- [x] **D3** 用 `electron-icon-builder` 从 `frontend/public/logo.png` 生成 `icons/icon.{icns,ico,png}`
- [x] **D4** 本地 `npm run package` 跑通(代替 `npm start`,非交互验证);产物 `.app` 双击启动 OK
- [x] **D5** 本地 `npm run make` 出 `.dmg`(109 MB)+ `.zip`(备用)
- [x] **D6** `.github/workflows/desktop-build.yml`:双 runner,artifacts 上传,tag `desktop-v*` 推送时建 draft Release
- [x] **D7** PROJECT_OVERVIEW.md 加节 5.5 "桌面 App",deploy.yml `paths-ignore` 加 `desktop/**` 避免误触发后端 CI

### 验收
1. `cd desktop && npm start` 能弹窗加载 https://kb.liii.in
2. `cd desktop && npm run make` 生成 `.dmg`,本机装上能用
3. GitHub Actions 手动触发后,两 runner 跑绿,artifacts 含 `.dmg` 和 `.exe`

### 边界
- 不改 backend / frontend 代码
- 不引入本地数据存储(纯壳子)
- 不做自动更新(electron-updater 以后再说)
- 不做代码签名(macOS $99/年,Windows $200+/年,自用阶段不值)

---

## 新迭代:生产 readiness 修复(2026-05-12)

### 背景
两个并行审查 agent 跑完,P0 13 项 + P1 ~15 项。逐项修。原则:
- **P0 全做**(鉴权/CORS/JWT/端口/nginx/备份/sha tag)
- **P1 低风险高收益做**(timeout/限流/fallback/healthcheck/CI gate/Sentry/request_id/通知)
- **P1 高风险架构改动延后**(HttpOnly cookie / JWT revocation / Alembic / sandbox / 数据加密迁移)

### 边界
- 不改业务功能,不改 API 形状,只是加 dependencies / 加 header / 加 try-catch
- Alembic / HttpOnly cookie 单独立项(此次仅在 LEARNING 记录原因)
- 全程不分批 push,本地多个 commit,最后一次 push main 触发 1 次部署

### Phase R1: 鉴权修复(8 端点)
- [x] **R1.1** `backend/api/export.py` 加 `require_admin`
- [x] **R1.2** `backend/api/chunks.py` 整体 `get_current_user`,写端点叠 `require_admin`
- [x] **R1.3** `backend/api/review.py` 整体 `require_admin`
- [x] **R1.4** `backend/api/qa.py` `/ask` `/ask-stream` `/generate-doc` optional → required
- [x] **R1.5** `backend/api/outputs.py:561,594` write 操作的 `"read"` → `"write"`
- [x] **R1.6** `backend/api/mcp.py` tool handler 加 project 权限隔离
- [x] **R1.7** `backend/api/meeting.py` `_validate_project_link` 改 `assert_project_access`
- [x] **R1.8** `backend/api/coverage.py` 加 `get_current_user`

### Phase R2: 配置硬伤
- [x] **R2.1** `backend/main.py` CORS allow_origins 收紧
- [x] **R2.2** `backend/config.py` JWT 默认密钥启动校验(发现 `change-me-` 就 raise)
- [x] **R2.3** `docker-compose.yml` backend ports `127.0.0.1:8000:8000`
- [x] **R2.4** `frontend/nginx.conf` 加 4 个安全 header
- [x] **R2.5** `backend/main.py` `docs_url=None` / `openapi_url=None`(prod 关掉)
- [x] **R2.6** `/api/stats` 加鉴权

### Phase R3: 备份 + 部署 sha tag
- [x] **R3.1** `scripts/backup.sh`:`pg_dump | gzip` + `mc mirror minio` + `qdrant snapshot` → GCS
- [x] **R3.2** `scripts/restore.sh` 配套
- [x] **R3.3** 服务器 crontab 文档(写 PROJECT_OVERVIEW)— 实际 cron 需要在 prod 手动加
- [x] **R3.4** `deploy.yml` 用 `${{ github.sha }}` 标签 + 服务器保留 `.last-good-sha` + 失败回滚思路

### Phase R4: Celery / LLM / 限流容错
- [x] **R4.1** `backend/tasks/output_tasks.py` 全部 task 加 `soft_time_limit=600 time_limit=900`
- [x] **R4.2** `backend/services/model_router.py` LLM fallback 覆盖 5xx + timeout
- [x] **R4.3** `backend/services/rate_limit.py` key_func 改用 X-Forwarded-For

### Phase R5: 可观测性
- [x] **R5.1** request_id middleware + `structlog.contextvars` 绑定
- [x] **R5.2** Sentry(`sentry-sdk[fastapi,celery]`)+ DSN 从 .env 读,空 DSN 时跳过初始化
- [x] **R5.3** `deploy.yml` 失败时发飞书 webhook 通知(secret 注入)
- [x] **R5.4** `scripts/renew-ssl.sh` 末尾加 healthcheck.io ping

### Phase R6: 容器健康检查 + CI gate
- [x] **R6.1** `docker-compose.yml` 给每个服务加 healthcheck:
- [x] **R6.2** frontend 加 mem_limit / cpus
- [x] **R6.3** `nginx.conf` 加 `location = /health { return 200 'ok'; }`
- [x] **R6.4** `deploy.yml` 加 frontend tsc + build job 作为 gate

### Phase R7: 验证 + push
- [x] **R7.1** 全部后端文件 `python -c "import ..."` 验证可加载
- [x] **R7.2** `frontend && npx tsc --noEmit` 通过
- [x] **R7.3** `docker compose config` 验证 yaml 合法
- [x] **R7.4** PROJECT_OVERVIEW + LEARNING 更新(单独 section "生产 readiness 修复 2026-05-12")
- [ ] **R7.5** push 触发 deploy

### 明确延后(LEARNING.md 留记号)
- ⏸️ JWT HttpOnly cookie 改造(改前端所有 axios,工作量 1-2 天)
- ⏸️ JWT `jti` + Redis 黑名单 revocation
- ⏸️ Alembic 接入(基线 + 切换 startup migration,需 dry-run 验证生产数据不丢)
- ⏸️ `pptx_codeexec` 独立沙箱容器
- ⏸️ MCP key sha256 / feishu_app_secret Fernet 加密(涉及数据迁移)
- ⏸️ owner 模糊搜全部用户的 email 暴露(改 search 端点返回 username)

---

## 新项目:Skill Hub(2026-05-19)

> 目标:在 `skillhub.tokenwave.cloud` 上线一个 skill 上传 / 浏览 / 质检 / 发布的独立小站。

### 关键决策

- **代码隔离**:全部新代码放 `skillhub/` 目录(`skillhub/backend/` + `skillhub/frontend/`),不掺到现有 `backend/` `frontend/` 里。
- **数据隔离**:复用现有 postgres 实例,新建数据库 `skillhub`(独立 schema 独立用户表)。
- **运行时**:新增两个容器 `skillhub-backend`(FastAPI :8001 内网)+ `skillhub-frontend`(nginx :80 内网)。主 frontend 容器持 443 + 新加 server block 反代。
- **存储**:本地 docker volume `skillhub_storage` → 容器内 `/data/skillhub/{skill_id}/...`。直接落盘,不走 MinIO(轻量)。
- **登录**:管理员邀请码注册;首次部署用脚本自动建 admin + 给一条邀请码。
- **质检 LLM**:独立配 `SKILLHUB_LLM_*`(base_url + api_key + model),不复用主系统的 model_router。
- **域名**:`skillhub.tokenwave.cloud`,DNS 用户已配。SSL 部署后再 certbot 申。

### 任务清单

后端 `skillhub/backend/`:
- [x] 骨架(main.py / config.py / db.py / models.py / requirements.txt / Dockerfile)
- [x] 模型:`users` / `invite_codes` / `skills` / `quality_reports`
- [x] 启动时 `create_all` + bootstrap admin + 首条邀请码
- [x] 鉴权:邀请码注册 / 登录(JWT)/ `get_current_user` / `require_admin`
- [x] Skill 上传(zip / tar.gz / 多文件)+ frontmatter 解析
- [x] Skill 浏览 + 文件树 + 单文件读取 + 发布 toggle
- [x] 质检:静态规则 + LLM 评分(4 维度 × 25 = 100)+ 报告入库
- [x] 管理端:邀请码 CRUD + 用户列表

前端 `skillhub/frontend/`:
- [x] Vite + React + TS + Tailwind 脚手架,暗色 + 紫粉橙渐变 + 噪点
- [x] 路由 + 公开页(/, /explore, /skill/:id)+ 账号页(/login, /register)+ 后台(/dashboard, /dashboard/upload, /dashboard/skill/:id, /admin)
- [x] markdown 渲染 + 代码高亮 + 文件树视图
- [x] 上传组件:zip 拖拽 + 文件夹选择器(webkitdirectory)

部署:
- [x] 两个 Dockerfile + docker-compose 服务条目
- [x] `frontend/nginx.prod.conf` 加 `skillhub.tokenwave.cloud` server block + entrypoint 处理证书首次签发
- [x] `.env` 增 `SKILLHUB_*`
- [x] rsync + remote build + up -d
- [x] CREATE DATABASE skillhub
- [x] certbot 申证书 + reload nginx,切 HTTPS

验收:
- [x] admin 登录 → 生成邀请码 SH-CVPPD4OBMM(30 天)
- [x] 上传 csv-explorer 测试 zip(5 文件 / 2KB,frontmatter 自动解析 name/description/version)
- [x] LLM 质检通(MiniMax-M2.7,27.5s,76 分 good,4 维度分齐,准确指出 stats.py/anomalies.py 是 TODO 占位)
- [x] 发布到广场 → 匿名 list 看得到 → 匿名拿 SKILL.md 内容

### 二期(2026-05-19 当日)— 抽出独立仓 + 5 维静态评分

- [x] 参考 shaozhengmao/skill-quality-checker,实现 5 维静态评分 (`static_scorer.py`)
- [x] inspector 重构为 static / llm / both 三档,综合分 = 静态 40% + LLM 60%
- [x] DB schema 加 `quality_reports.mode` + `static_payload` + `llm_payload`,startup ALTER 兼容老库
- [x] 前端 ReportCard 加 ⭐ + 静态/LLM 双 tab,3 个评估按钮(快检 / 全面 / 仅 LLM)
- [x] 抽出为独立仓 [zhebinliu/skillhub](https://github.com/zhebinliu/skillhub) + 加 README / LICENSE / standalone docker-compose
- [x] 服务器迁移布局:`/opt/skillhub` clone + `/opt/kb-system/skillhub → symlink`
- [x] 修 reasoning 模型(MiniMax-M2.7)输出带 `<think>` 块的 JSON 解析问题
- [x] LLM 超时调到 180s(thinking 模型推理慢)
- [x] kb-system 仓:rm skillhub/ + .gitignore + 文档改指向新 repo



---

## 新迭代:抽出 meeting 模块为 git submodule(2026-05-19) — 指向 zhebinliu/ai-meeting

### 用户决策
- 用真正的 git submodule(深度重构),不要 skillhub 那种两仓并行
- ai-meeting 仓 main 保留(2026-04-28 的旧版独立服务),把 kb-system 当前的 meeting 代码推到新分支 `from-kb-system`

### 设计原则
- **submodule 内部目录结构 = 它在 kb-system 里的相对路径**(overlay 式)。这样 Python `from services.meeting import ...` 和前端 `./redesign/console/ConsoleMeeting` 这类 import **不用改一行**
- submodule 仍依赖 kb-system 的 `models` / `services.auth` / `services.project_acl` —— 接受现实,这只是抽**位置**,不是抽**运行时**

### 抽出文件清单(17 个)
**Backend(11 文件 + templates/):**
- backend/api/meeting.py
- backend/models/meeting.py
- backend/prompts/meeting.py
- backend/tasks/meeting_tasks.py
- backend/services/meeting/{__init__,asr,audio_utils,docx_export,feishu,kb_sync,pipeline,storage}.py
- backend/services/meeting/templates/minutes_template.docx

**Frontend(6 文件):**
- frontend/src/pages/console/ConsoleMeeting{,Detail,New}.tsx
- frontend/src/redesign/console/ConsoleMeeting{,Detail,New}.tsx

**不抽:** demo-ppt/slides/12-meeting.tsx(PPT 展示页)、ExportPreMeetingButton.tsx(归属 research)

### 集成方式
submodule 挂到 `meeting/`:
```
meeting/
  backend/api/meeting.py
  backend/models/meeting.py
  backend/prompts/meeting.py
  backend/tasks/meeting_tasks.py
  backend/services/meeting/{*.py, templates/}
  frontend/src/pages/console/...
  frontend/src/redesign/console/...
```
容器内通过**二次 COPY overlay** 让 submodule 文件落到原位置:
- backend Dockerfile: build context 改仓库根,COPY backend/ /app/ 再 COPY meeting/backend/ /app/
- frontend Dockerfile: 同理

docker-compose.yml: backend / celery_worker / frontend / frontend-uat 的 build 块都要从 `./backend` `./frontend` 改成 `context: .` + `dockerfile:` 指定

### 任务清单
- [ ] 1. /tmp 下 clone ai-meeting,切 from-kb-system 分支,清空 main 内容(只保留 .git)
- [ ] 2. 把 17 个文件按 overlay 布局放进 from-kb-system 分支 + 写 README.md + 提交推送
- [ ] 3. 本仓:`git rm` 17 个文件
- [ ] 4. 本仓:`git submodule add -b from-kb-system https://github.com/zhebinliu/ai-meeting.git meeting`
- [ ] 5. 改 backend/Dockerfile + docker-compose.yml(backend/celery_worker)
- [ ] 6. 改 frontend/Dockerfile + docker-compose.yml(frontend/frontend-uat)
- [ ] 7. 本地验证:Python import + tsc --noEmit + docker compose build
- [ ] 8. 更新 PROJECT_OVERVIEW.md + LEARNING.md
- [ ] 9. commit + push
- [ ] 10. 远程 rsync + rebuild + 端到端冒烟(meeting 创建/上传/转写/纪要)

### 已知风险
- worktree 里 `git submodule add` 行为可能不一致 —— 失败切到主仓做
- `minutes_template.docx` 是二进制 —— 确认不要走 LFS / 文本 normalize
- rsync 默认不同步 submodule 内容 —— sync-dev.sh / 部署脚本需补 submodule update
- Dockerfile build context 从 ./backend 改成 . 后镜像会变大 —— 加 .dockerignore
- LEARNING.md 第 6 条 meeting eager import —— 抽完仍生效(import 路径不变)

### 验收
- kb.liii.in/console/meeting 创建/上传/转写/纪要全流程跑通
- git submodule status 干净;ai-meeting/from-kb-system 上能看到完整代码
- `git submodule update --remote meeting` 能把后续在 ai-meeting 仓的改动带回来

---

# 项目洞察 UAT · 方案 A(Focus 单焦点)+ Pin 增强 — 2026-05-18

## 目标
把 `/redesign/console/projects/<id>?stage=insight` 工作台从 dashboard 范式改为「单焦点 + 可钉住」范式。

## 范围
- **改:** `frontend/src/redesign/console/` 下相关组件
- **不动:** prod(`frontend/src/pages/console/`)

## 设计决策(已确认)
- 默认:中央焦点卡 + 左/右栏全部抽屉化,默认收起
- Pin 增强:左栏 DocChecklist 可「钉住」展开,变回三栏
- 阶段切换:popover 下拉(替代横向 8 标签)
- 「切换项目」:点击面包屑「项目 /」跳 `/redesign/console/projects`
- sub-kind chips、action bar 移除,功能并入中央焦点卡

## Phase 1 — Header 重构
- [ ] P1.1 顶栏改单行:返回 / 面包屑 / 项目名 / 元信息 / 阶段下拉药丸 / 项目操作按钮
- [ ] P1.2 阶段切换 → popover 下拉(带 done / inflight / locked 状态)
- [ ] P1.3 移除横向阶段标签栏
- [ ] P1.4 移除 sub-kind chips 横条
- [ ] P1.5 移除 action bar(状态 + 主操作并入焦点卡)
- [ ] P1.6 Header 总高度从 ~140px 收到 ~52px

## Phase 2 — InsightWorkspace 布局重构
- [ ] P2.1 主容器 flex justify-center,中央卡 max-width 760px
- [ ] P2.2 左侧抽屉触发(垂直 tab,浮在中部固定)
- [ ] P2.3 左侧抽屉 280-300px,左滑入 / 滑出动画
- [ ] P2.4 Pin 按钮:抽屉内右上角,点后变 sidebar(三栏)
- [ ] P2.5 Pin 状态持久化:localStorage `insight_pin_left`
- [ ] P2.6 右侧 CitationsPanel 触发与左栏一致

## Phase 3 — CenterWorkspace preparation 重写
- [ ] P3.1 移除 3 个 StatCard
- [ ] P3.2 已上传文档前 6 份独立卡 → 折叠区
- [ ] P3.3 已填问卷绿色 grid → 折叠区
- [ ] P3.4 移除底部「下一步」橙色 banner
- [ ] P3.5 焦点卡:动态大标题 + 进度 + 主 CTA + 副 CTA(先看体检)
- [ ] P3.6 「准备情况详情」折叠区:必备 / 推荐 / 已填 / 已上传 — 默认全收
- [ ] P3.7 状态分支:inflight / bundle / allReady / !allReady

## Phase 4 — 测试 + 部署
- [ ] P4.1 `npx tsc --noEmit -p frontend/tsconfig.json`
- [ ] P4.2 dev 浏览器验证 4 种状态
- [ ] P4.3 rsync 同步 uat
- [ ] P4.4 rebuild + restart frontend
- [ ] P4.5 uat.tokenwave.cloud 真机验证


---

# 新迭代:企信(ShareCRM IM)接入工作台(2026-05-29)

## 背景
研究 https://github.com/scutken/openclaw-sharecrm 后确认:纷享销客企信开放 Gateway 1.3 API(`https://open.fxiaoke.com`,`appId` + `appSecret` 鉴权,下行 SSE,上行 REST)。**不引入 OpenClaw 框架,自研对接**。每用户一对独立凭证、独立连接、独立消息池。

## 决策表
| # | 决策 | 选择 | 理由 |
|---|------|------|------|
| 1 | 框架 | 自研 SSE 客户端 | 跟现有 kb_agent / agentic runner 体系一致;不引入第三方 agent 框架 |
| 2 | 隔离 | 每用户独立 Bot | 用户已确认 |
| 3 | 加密 | Fernet(`services.feishu_crypto`) | 跟 sharedev_certificate 一致 |
| 4 | appId 冲突 | PUT 凭证全表唯一校验 + 409 | 同 appId 在 Gateway 只能一条活跃连接,防互踢 |
| 5 | Phase 1 范围 | 凭证 + 连接池 + 收消息落库 + 侧边栏看历史(polling 5s) | 自动回复 / SSE 实时推送 / 手动发消息留 Phase 2 |
| 6 | HTTP 客户端 | httpx(已在 requirements) | 复用 |
| 7 | 连接挂哪儿 | FastAPI 主进程 startup hook | backend 单容器单进程,celery 不参与 |
| 8 | 群聊策略 | requireMention=true 默认 | 跟 openclaw 默认一致 |

## Block A · 数据层
- [x] A1. `models/user.py` 加 `qixin_app_id` / `qixin_app_secret` / `qixin_gateway_url` 字段
- [x] A2. 新建 `models/qixin_message.py`:`QixinMessage` 表
- [x] A3. `backend/main.py` startup hook 加 import + ALTER TABLE migrations(partial unique index 兜 app_id 唯一)
- [x] A4. 本地 py_compile 验证通过

## Block B · 凭证 API
- [x] B1. `api/qixin_credentials.py`:GET/PUT/DELETE `/api/qixin/credentials`(GET 不回 secret + app_id 也 mask;PUT 全表唯一校验返 409)
- [x] B2. main.py 注册路由
- [ ] B3. uat 部署后端到端 curl 验

## Block C · SSE 客户端 + 连接池(核心)
- [x] C1. `services/qixin_gateway/__init__.py`
- [x] C2. `services/qixin_gateway/sse_client.py`:鉴权 token + Last-Event-ID 续传 + reset 清游标立即重连 + max_lifetime 主动重连 + 指数退避抖动
- [x] C3. `services/qixin_gateway/connection_manager.py`:连接池(bootstrap_all 串行预热 200ms + start/stop/restart_for_user + _persist_message 写表)
- [x] C4. main.py startup 调 `bootstrap_all()`,shutdown 调 `stop_all()`
- [x] C5. 凭证 PUT/DELETE 时 try-import 联动连接池启停

## Block D · 消息读取 API
- [x] D1. `api/qixin.py`:`GET /api/qixin/conversations`(chat_id group + 最近一条 + count)
- [x] D2. `api/qixin.py`:`GET /api/qixin/conversations/{chat_id}/messages?limit=&before=`(时间倒序分页)
- [x] D3. main.py 注册路由

## Block E · 前端凭证配置
- [x] E1. `frontend/src/api/client.ts` 加 5 个 qixin 接口 + 类型
- [x] E2. `frontend/src/components/settings/QixinTab.tsx`(参考 ShareDevTab)
- [x] E3. 在 `pages/PersonalSettings.tsx` + `redesign/PersonalSettings.tsx` 都挂
- [x] E4. tsc 检查 qixin 相关零报错(剩余 liquid-glass-react / meeting overlay 是本地环境缺失)

## Block F · 前端全局抽屉
- [x] F1. `frontend/src/components/qixin/QixinDrawer.tsx`(浮动按钮 + 抽屉 + 5s polling + 未配引导)
- [x] F2. 在 `Layout.tsx` (/console)挂上
- [x] F3. 在 `redesign/console/ConsoleLayout.tsx` 也挂上
- [x] F4. tsc 通过

## Block G · 部署 + 端到端验证
- [ ] G1. commit + push main → 触发 deploy-uat.yml
- [ ] G2. uat 上配凭证 → 企信 Bot 发私聊 → 抽屉收到
- [ ] G3. 验收后 `gh workflow run deploy-prod.yml -f confirm=deploy`

## 关键风险 / TODO
- httpx 没现成 SSE 解析,手写 line-based(`data:` / `event:` / `id:` / `retry:` / 空行分隔)
- Gateway 1.3 协议字段(`message.content` 等)需在 C2 之前去 npm/`@openclaw-fs/sharecrm` 抓源码确认
- backend 重启 = 全部连接重建,启动时串行 + 抖动

---

## 新迭代:调研问卷按角色逐步生成 + meeting 上下文反哺(2026-06-03)

### 决策(已对齐)
- 触发:**手动按角色按钮**(executive / dept_head / frontline / it 四个)
- context 来源:① 该项目下 meeting 模块的会议纪要(只读 status=completed) ② 已生成的其他角色的题目本身
- bundle:**复用同一 survey bundle**,按角色增量 patch `questionnaire_items` + `extra.role_progress` 标进度
- **不读 research_response**(用户没选)

### 改造大图
```
[前端] ResearchWorkspace 顶栏:
  - 无 surveyBundle → 仍是「一键生成」(冷启动)
  - 有 surveyBundle → 4 个角色按钮,显示「生成 / 生成中… / 已生成→重新生成」
        ↓
[API] POST /api/outputs/{bundle_id}/generate-role  body={role}
        ↓
[Celery] generate_survey_role(bundle_id, project_id, role)
        ↓
[runner] generate_survey_for_role:
  1. _load_ctx
  2. _load_meeting_context(project_id) — 拉 meeting_minutes 摘要
  3. _summarize_existing_role_questions — 抽其他角色已有题
  4. plan_survey + filter subsections.target_roles(老→新角色映射)
  5. execute_survey_subsection(注入 meeting + 已有角色题 context)
  6. critic + merge questionnaire_items(同 role 旧题清掉 → 追加)
  7. bundle.extra.role_progress[role] = "done"
```

### 后端
- [ ] B1 runner.py 加角色映射辅助 + `_map_subsection_roles_to_audience(subsection_target_roles)` → set[str]
- [ ] B2 runner.py `_load_meeting_context(project_id) -> str`(摘 minutes summary/key_points/decisions/action_items,各限 600 字)
- [ ] B3 runner.py `_summarize_existing_role_questions(bundle_extra, exclude_role) -> str`
- [ ] B4 runner.py `generate_survey_for_role(bundle_id, project_id, role)` 主函数
- [ ] B5 同上,完成后增量 merge questionnaire_items / role_progress / run_history
- [ ] B6 executor.py `execute_survey_subsection` 加 `meeting_context` + `prior_role_questions` 可选参数
- [ ] B7 tasks/output_tasks.py 注册 Celery task `generate_survey_role`
- [ ] B8 outputs.py 新增 endpoint `POST /api/outputs/{bundle_id}/generate-role`
- [ ] B9 outputs.py `_bundle_dto` 暴露 role_progress

### 前端
- [ ] F1 api/client.ts 加 `generateSurveyForRole` + `CuratedBundle.role_progress`
- [ ] F2 ResearchWorkspace.tsx 顶栏改造为 4 角色按钮组
- [ ] F3 触发后 onRefetch 复用现有轮询
- [ ] F4 tsc 通过

### 验证
- [ ] V1 后端 import 检查
- [ ] V2 本地起栈 → 触发某角色生成 → 看 celery 日志 + DB extra.role_progress
- [ ] V3 挂 meeting → 第二角色生成时 prompt 带 meeting 摘要
- [ ] V4 部署 UAT

### 边界
- 不动 generate_survey 一键路径(冷启动还得用)
- 不动 outline / report / insight
- 不读 research_response
- meeting 只摘 minutes,不喂 transcript
- critic / challenger 不改
