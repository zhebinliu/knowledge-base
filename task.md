# 任务:会议纪要「洞察」四功能 + overlay 漂移回灌

计划文件:`C:\Users\zzz\.claude\plans\compressed-pondering-ullman.md`

## 目标

会议详情页新增「洞察」tab,集中承载四件事:

1. **词云** — 这场会真正聊了什么(LLM 从转写抽关键词 + 权重)
2. **参会人发言时长条形图** — 谁在主导讨论(有说话人表头→精确解析;否则 LLM 归因)
3. **待办优先级四象限图** — 项目一套,轴为「紧急 × 必要」(复用 `project_todos`,不另起一套)
4. **与上一场会议横向对比** — 变化洞察 + 建议(异步 Celery + 前端轮询)

同时修掉一个已存在的生产 bug:overlay 漂移导致名词校正词典从未生效。

---

## 边界(不做什么)

- **不引入新依赖** —— 图表用已装 `recharts@^3.9.2`,词云自绘 canvas
- **不改导出** —— 三张新图不进 docx/md/html/PNG 导出链路
- **不动 `priority`(P0/P1/P2)** —— 象限是另一套语义,两者并存
- **不做声纹分离** —— 仓库 ASR 无 diarization,LLM 归因结果必须标注「AI 推断」
- **不顺手补 redesign 缺失的 `advice` tab** —— 超出范围,仅在注释记一笔
- **不改既有 `/todos/*` 端点的 ACL 缺口行为** —— 属独立安全修复,记入文档不本次改
- **不新建 `backend/services/meeting/insights.py` 等副本** —— 新模块只建 `meeting/backend/` 一处,避免制造新漂移源

---

## 子任务

### B5 · overlay 漂移回灌(先做,低风险独立)— 已完成

- [x] `meeting/backend/api/meeting.py` `action_polish` 补 term_hints 加载 + 传参
- [x] `meeting/backend/tasks/meeting_tasks.py` 补 term_hints 加载 + 传参
- [x] `meeting/backend/api/meeting_survey.py` 补 `time_options` / `satisfaction_questions` PATCH 字段
- [x] 验证:两份 `meeting_tasks.py` / `meeting_survey.py` 已逐字相同;`api/meeting.py` 仅剩
      两个**刻意**差异(`Query` import + 模块导出 block,后者依赖只存在于 overlay 的
      `services/meeting/module_layouts.py`,不能往下拷)

### B1 · 洞察 tab + 词云 — 已完成

- [x] DDL:`meetings` 加 `keywords` JSON 列
- [x] ORM 两副本同步
- [x] `_meeting_dto` 两副本 + 两处 list `defer`
- [x] `prompts/meeting.py` 两副本加 `KEYWORD_SYSTEM` / `KEYWORD_USER`
- [x] 新建 `meeting/backend/services/meeting/insights.py`(`extract_keywords`)
- [x] `__init__.py` **不**导出 —— 改为 API 内按路径直接 import,与 `module_export.py` 同理,
      否则非 overlay 树 import 失败、且两份 `__init__.py` 会产生新漂移
- [x] `ROUTING_RULES` 加 `meeting_keywords_extract`
- [x] 端点 `POST /{id}/actions/extract_keywords` + `PUT /{id}/keywords`(两副本)
- [x] `client.ts` 类型 + `MeetingAction` 扩值
- [x] 前端 `InsightTab` 骨架 + `KeywordCloud`(确定性螺线布局 + top-15 chip 兜底)
- [x] 两套 UI 各 3 处注册

### B2 · 发言时长 — 已完成

- [x] DDL `speaker_stats` + ORM 两副本 + DTO/defer
- [x] `prompts/meeting.py` 两副本加 `SPEAKER_ATTR_SYSTEM` / `SPEAKER_ATTR_USER`
- [x] `insights.py`:`parse_speaker_segments`(精确解析)/ `collect_speaker_candidates` /
      `extract_speaker_durations`(分窗并行 + 逐行归属归一化)
- [x] `ROUTING_RULES` 加 `meeting_speaker_attribution`
- [x] 端点 `POST /{id}/actions/extract_speaker_durations`(两副本)
- [x] 前端 `SpeakerDurationChart`(recharts 横向柱 + 「无法判断」灰柱 + 来源徽标)

### B3 · 待办四象限 — 已完成

- [x] DDL `project_todos` 加 `urgency` / `necessity` / `quadrant_source` / `quadrant_meta`
      （**不存 `quadrant` 列** —— 象限由两轴派生。计划书 §一 正文就是这么定的,
      task.md 的勾选项写成「加 quadrant 列」是笔误,以正文为准:存了就会有两处状态）
- [x] `models/project_todo.py` 加列(补 `JSON` import)
- [x] `_todo_dto` 输出两轴 + 派生 `quadrant` + `quadrant_source` + `quadrant_meta`
- [x] `TodoPatch` 加两轴(空串=清空该轴,同 `due_date` 约定);PATCH 处理置
      `quadrant_source='manual'`;清空两轴则 source 一并清掉
- [x] `prompts/meeting.py` 两副本加 `QUADRANT_SYSTEM` / `QUADRANT_USER`(已验逐字相同)
- [x] 新建 `backend/tasks/insight_tasks.py`(`classify_project_todos_quadrant`)+
      `tasks/__init__.py` 注册。**该文件只有一份,overlay 无同名副本**(新文件规则)
- [x] `classify_todos_quadrant()`(backend/api/project_todos.py):分批 ≤40 /
      并行 gather / 只认本批 id / 两轴非法或 null 一律保持未分类 / 绝不覆盖 manual
- [x] 端点 `POST /projects/{id}/todos/classify` + `GET .../classify/status/{task_id}`
      —— 两者用 `require_project_access`
- [x] 既有 `POST /projects/{id}/todos/sync` 加 `?classify=true`(默认)异步触发分类,
      返回 `classify_task_id`;仅在有新导入时触发,dispatch 失败不影响导入结果
- [x] 前端 `TodoQuadrant`(2×2 拖拽 + 未分类区 + 同步/重新分类按钮 + 判定依据折叠)
      + `InsightTab` 加 section(无 `project_id` 时降级为提示)
- [x] `client.ts`:`ProjectTodo` 补象限字段、新 `TodoPatchBody`、`classifyProjectTodosQuadrant`、
      `getClassifyQuadrantStatus`、`syncProjectTodos` 返回值补 `classify_task_id`
- [x] 验证:31 项逻辑断言全绿(见下「验证记录」)

**与计划的偏离(3 处,均已在代码注释里写明理由)**

1. **不新增 `POST /api/meeting/{id}/todos/sync`**。前端既有入口就是
   `POST /projects/{id}/todos/sync`,再加一个会议级端点等于复制一份同步逻辑。
   顺带发现 `sync_todos_for_meeting()` 在仓库里**从来没有调用方**(死代码),本次不动它。
2. 分类入参除 `only_unclassified` 外多给一个 `ids`(限定子集),便于以后只重判某几条。
3. 前端 `patchTodo` 的 body 类型抽成 `TodoPatchBody` 并让 `ProjectTodos.tsx` 复用
   —— 原先它传 `Partial<ProjectTodo>`,加了 `urgency: Urgency | null` 后类型不再成立
   (`null` 在服务端意为「本次不改」,与空串「清空」是两回事,不能用宽松类型糊过去)。

### B4 · 跨会议对比 — 已完成

- [x] DDL `comparison_insight` + ORM 两副本 + DTO/defer(B1 时已一并做完)
- [x] `prompts/meeting.py` 两副本加 `COMPARE_SYSTEM` / `COMPARE_USER`(已验逐字相同)
- [x] 新建 `meeting/backend/services/meeting/comparison.py`(`find_previous_meeting` /
      `build_comparison` / `_ground_changes` 取证 / `_sanitize_suggestions`)。**只有一份**
- [x] `insight_tasks.py` 加 `compare_meeting_previous`(soft 900 / hard 1200,
      失败时尽力把 `status='failed'` 写回,免得前端停在永远转的圈)
- [x] `ROUTING_RULES` 加 `meeting_compare_insight`(B1 时已加;task.md 原写
      `meeting_compare_previous`,改为复用已有 key,避免同一功能两个 task 名)
- [x] 端点三只(两副本各 3 处):`GET /{id}/compare-candidate`、
      `POST /{id}/compare-insight`、`GET /{id}/compare-insight/status/{task_id}`
- [x] 前端 `ComparisonPanel`(四态:无候选 / running / done / failed)+
      `InsightTab` 加对比 section;`client.ts` 三个 API 函数 + `evidence_dropped` 字段
- [x] 验证:33 项逻辑断言全绿(见下「验证记录」)

**关键设计:反幻觉取证**

对比最容易出的问题不是「答得不好」,是「编得像真的」—— 模型会拿行业常识补出
「客户追加预算」「项目已延期」这类材料里根本没有的变化。所以:

1. prompt 里强制每条 change 带 `evidence`,必须是原文摘录;「上一场有、这一场没提」
   判 `停滞` 而非 `回退`;允许如实输出「无变化」,不逼它凑数。
2. Python 侧 `_ground_changes()` 再把 evidence 拿回材料里做子串校验(去空格、取前 24 字),
   查无实据的**直接丢弃**,并把丢弃条数回传前端(`evidence_dropped`)——
   既挡幻觉,也让用户看得见「模型原本想说几条、被砍了几条」。
3. 两场都没纪要也没转写 → **不调模型**,直接返回可读的 error。

前端把 `evidence` 显式渲染在每条变化下面(斜体「原文:…」)—— 这是用户自己判断
「AI 有没有编」的唯一依据,不能藏在 tooltip 里。

### B6 · 文档同步 — 已完成

- [x] `LEARNING.md` 追加 §27(overlay 漂移复发的完整复盘 + 新文件落位规则 +
      `ROUTING_RULES` 新 key 静默兜底 + 两个反幻觉模式 + 无容器依赖时的 stub 验法)
- [x] `PROJECT_OVERVIEW.md` §6.9 能力表补四项 + 「未完成/单独立项」第三条 +
      「改会议模块代码前必读」告警块
- [x] `CHANGELOG.md` 记一条(2026-09-22,含 B5 修的生产 bug 说明)
- [x] 提交推送

---

## 验收标准

1. `python -m compileall` 两副本全绿(镜像里的语法闸门)
2. `npx tsc --noEmit` 全绿
3. 部署后容器内显式 import 新模块成功(lazy import 是健康检查盲区)
4. 两套 UI(`/` 与 `?ui=new`)下「洞察」tab 均出现且内容非空
5. `api_call_logs` 里 4 个新 task 的 `model_name` 正常,**不出现 `api.edgefn.net`**
6. 发言时长:飞书妙记式转写 → 「精确解析」;普通 `[MM:SS]` 转写 → 「LLM 推断」+ 置信度
7. 拖拽象限后刷新保持(`quadrant_source='manual'` 不被自动分类覆盖)
8. 名词校正词典修复后:加一条校正词 → 跑润色 → 输出中确实被替换

---

## 验证记录

### B3(2026-09-22)

用 stub harness 直接加载真实的 `backend/api/project_todos.py` 跑逻辑断言
(容器里的 `structlog` 等依赖本地没有,故按 CLAUDE.md 的既有做法注入 stub 模块;
`prompts/meeting.py` 用真实文件,顺带验证 `{{}}` 转义与 `.format` 占位符)。**31 项全绿**:

| 组 | 覆盖点 |
|---|---|
| 1 | `derive_quadrant` 四象限映射;任一轴为 NULL → 未分类;非法值 → None |
| 2 | 人工条目(`quadrant_source='manual'`)两轴不被覆盖;`only_unclassified` 跳过已分类;模型返回不存在的 id 被忽略;缺一轴 → 不落库;有更新才 commit |
| 3 | `only_unclassified=False` 时已分类的被重判,但人工的仍不动 |
| 4 | 全人工项目 → 不调模型、不 commit |
| 5 | `QUADRANT_USER.format()` 产出合法 JSON 骨架;system prompt 的枚举值与后端常量一致 |
| 6 | PATCH:拖到象限 → `manual`;清空两轴 → 未分类且 source 清掉;只改一轴也标 manual;不传两轴 → 不动象限字段;非法值 → 400 |

另:`python -m compileall backend meeting/backend` 全绿;`npx tsc --noEmit` 全绿;
`prompts/meeting.py` 两副本逐字相同;`api/meeting.py` 差异仍只有那 2 处刻意 hunk(165 行)。

**未覆盖**:`ids` 过滤是 SQL 侧的,本地无 DB 无法验;需部署后用真实项目跑一次。

### B4(2026-09-22)

同样用 stub harness 直接加载真实的 `meeting/backend/services/meeting/comparison.py`
(`_truncate_head_tail` 按 AST 从 `backend/services/revision_learning.py` 抽真实现执行,
不是复制粘贴)。**33 项全绿**:

| 组 | 覆盖点 |
|---|---|
| 1 | `_ground_changes` 取证:真在材料里的保留(容忍空格差异);编造的 / 过短的 / 缺 evidence 的一律丢弃;非法 trend 收敛为「无变化」;dimension 截断 |
| 2 | 空格差异容忍 |
| 3 | `_sanitize_suggestions`:空 action 丢弃;非法/缺失 priority → 「中」;最多 5 条 |
| 4 | 需求格式化 / 空需求 / 空转写 / 超长转写截断 / 纪要 JSON 原样透出 / 润色稿优先 |
| 5 | `COMPARE_USER.format()` 出合法骨架;system prompt 的 trend 与 priority 枚举与后端常量一致 |
| 6 | `build_comparison`:两场都无材料 → **不调模型**且如实报错;正常路径下编造的那条被剔除且 `evidence_dropped=1`;两场纪要都进了 prompt;空结果给出可读 error |

另:`python -m compileall backend meeting/backend` 全绿;`npx tsc --noEmit` 全绿;
五个双份文件里四个逐字相同,`api/meeting.py` 差异仍只有那 2 处刻意 hunk(165 行:1 处 `Query` import + 1 个模块导出 block;B1–B4 的新端点在两副本里逐字对称,不出现在 diff 中)。

### 部署验证清单(等有 docker 的环境执行)

```bash
docker compose exec backend python -c "import api.meeting, api.project_todos, tasks.insight_tasks"
docker compose exec backend python -c "from tasks.insight_tasks import classify_project_todos_quadrant; print(classify_project_todos_quadrant.name)"
curl -X POST localhost:8000/api/projects/<pid>/todos/classify -H "Authorization: Bearer <token>" -d '{"only_unclassified":false}'
# 查 api_call_logs:task=meeting_todo_quadrant 的 model_name 应为 minimax-m2.5(非 api.edgefn.net)

docker compose exec backend python -c "import services.meeting.comparison, services.meeting.insights"
curl localhost:8000/api/meeting/<id>/compare-candidate -H "Authorization: Bearer <token>"
curl -X POST localhost:8000/api/meeting/<id>/compare-insight -H "Authorization: Bearer <token>"
# 查 api_call_logs:task=meeting_compare_insight / meeting_speaker_attribution 的 model_name 应正常
```

**必须人工过一遍的**:

1. 挑一个**有 ≥2 场已出纪要会议**的项目,开第 2 场会议的详情页
2. 默认 UI 和 `?ui=new` **两套**下「洞察」tab 都要出现,且四块都在
3. 词云出词;发言时长的来源徽标正确(飞书妙记式转写 → 「精确解析」,录音上传 → 「AI 推断」)
4. 「待办四象限」:点「同步会议待办」→ 新待办自动带象限 → 拖一个到别象限 → **刷新后位置保持**
5. 「与上一场会议对比」:按钮旁显示将对比的上一场标题 → 点下去转 1-2 分钟 → 出变化 + 建议,
   且每条变化下面都有「原文:…」;确认没有一眼假的变化
6. 首场会议:对比块应显示「本项目没有更早的、已出纪要的会议」而不是空面板或转不停的圈
7. 无 `project_id` 的会议:四象限与对比都应降级为提示文案,不报错
8. **名词校正词典**(B5 修的那个 bug):加一条校正词 → 跑润色 → 输出里确实被替换了

---

## 已知既有问题(不在本次范围,仅记录)

- **`/todos/*` 全部端点缺项目 ACL** —— 只校验 `get_current_user`,任何登录用户可读写
  任意项目的待办。本次新加的两个 classify 端点已补 `require_project_access`,
  但既有端点行为**未改**(改了就破坏既有前端调用契约)。属独立安全修复。
- **`POST /todos/{id}/smart-assign` 复用了 `meeting_illustrations_extract` 这个 task 名**
  (`backend/api/project_todos.py`),语义不对且导致该 key 的模型配置被两处共用。
  改它会影响 smart-assign 的线上模型选择,需单独评估。
- **`sync_todos_for_meeting()` 无调用方**(死代码),会议级同步入口实际走的是项目级。
- **redesign 壳的 `LEFT_TABS` 缺 `advice`**(legacy 有)。既有差异,本次未动。
