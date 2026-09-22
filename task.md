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

### B3 · 待办四象限

- [ ] DDL `project_todos` 加 `quadrant` / `quadrant_source` / `quadrant_meta` + 索引
- [ ] `models/project_todo.py` 加列(补 `JSON` import)
- [ ] `_todo_dto` / `TodoPatch` / PATCH 处理加象限字段
- [ ] `prompts/meeting.py` 两副本加 `QUADRANT_SYSTEM` / `QUADRANT_USER`
- [ ] 新建 `backend/tasks/insight_tasks.py` + `tasks/__init__.py` 注册
- [ ] `classify_todos_quadrant()`(backend/api/project_todos.py)
- [ ] 端点:classify / classify status / sync 挂分类 / meeting sync
- [ ] 前端 `InsightTab` 加四象限 section(2×2 拖拽 + 未分类区)

### B4 · 跨会议对比

- [ ] DDL `comparison` + ORM 两副本 + DTO/defer
- [ ] `prompts/meeting.py` 两副本加 `COMPARE_SYSTEM` / `COMPARE_USER`
- [ ] 新建 `meeting/backend/services/meeting/comparison.py`
- [ ] `insight_tasks.py` 加 `compare_meeting_previous`
- [ ] `ROUTING_RULES` 加 `meeting_compare_previous`
- [ ] 端点:compare-previous / comparison status / comparison candidates(两副本)
- [ ] 前端 `InsightTab` 加对比 section

### B6 · 文档同步

- [ ] `LEARNING.md` 追加本次结论
- [ ] `PROJECT_OVERVIEW.md` §6.9 能力表补四项
- [ ] `CHANGELOG.md` 记一条
- [ ] 提交推送

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
