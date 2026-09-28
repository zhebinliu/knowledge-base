# 任务:会议模块迭代第二轮 — 去解释图 / 对比可选会议 / 洞察布局 / 参会人名单

上一轮(B1–B6,洞察四功能 + overlay 漂移回灌)已完成并上线,记录见 git 历史。
本轮为用户的 4 个新需求。

## 目标

1. **去掉「解释图」tab** —— 该功能下线,只摘 UI 入口
2. **「与上一场会议对比」可选具体会议** —— 现在对比对象由后端写死(本项目时间上最近的一场),
   改为用户可选任意一场同项目会议
3. **洞察 tab 布局适配页面** —— 加整体缩放 + 模块可折叠 + 待办过多自动折叠
4. **说话人识别准确率优化(轻量阶段)** —— 补上「参会人名单」这个缺失输入 + 加说话人人工校正 UI

### 需求 4 的背景(必须先理解,否则会做错方向)

**本仓库没有任何声纹/说话人分离引擎。** 全仓 `pyannote`/`whisperx`/`sherpa`/`funasr`/
`diarization` 在代码与依赖里零命中;`requirements.txt` 无 `torch`/`onnxruntime`,音频相关只有
`pydub`(转 PCM)。ASR 走**小米 mimo-v2.5-asr 外部 API**,每 20 秒切片,**只回纯文本 + `[MM:SS]`
时间标记,不携带任何说话人信息**。

所以现有说话人归属只有两条路:

| 路径 | 触发 | 原理 | 准确率 |
|---|---|---|---|
| `parsed` | 转写自带「说话人 N HH:MM:SS」表头(飞书妙记导出) | 正则解析时间戳 | 高,但标签永远是「说话人N」,**从不映射真人名** |
| `inferred` | 其余全部(**录音上传走这条**) | `minimax-m2.7` 依据**对话内容猜**每句谁说的 | 不可靠 —— 纯语言推理,无声学依据 |

`inferred` 的致命缺陷不只是「猜」,而是**候选名单本身不可靠**:模型只能从
`collect_speaker_candidates()` 给的名单里挑人,名单来源是「干系人 → 纪要 attendees →
待办负责人 → 需求提出人」,而 **attendees 是 LLM 事后从转写里抽的**,且**会议创建时根本
无处填写参会人**(`MeetingCreate` 只有 `title/project_id/agenda`)。拿一个可能错的名单去猜
说话人 = 错上加错。

**本轮(轻量阶段)做**:补上「参会人名单」这个缺失输入 + 人工校正 UI。
**本轮不做**:真正的声学声纹分离 —— 见下方「后续单独立项」。

---

## 边界(不做什么)

- **不引入任何新依赖** —— 缩放用 CSS,折叠用 React state,名单用现有 JSON 列
- **不删解释图的后端** —— 只摘 UI 入口。理由有二:
  (a) `meetings.illustrations` 列里已有生产数据,删列不可逆;
  (b) `backend/api/project_todos.py:909` 的 `smart-assign` **一直在复用
      `meeting_illustrations_extract` 这个 routing key**,删掉后端常量会连带打断 smart-assign
      (该问题已记录在「已知既有问题」,本轮仍不动)
- **不做声纹分离** —— 单独立项,本轮不碰 `Dockerfile` / `requirements.txt` / 容器 `mem_limit`
- **不改 `speaker_stats` 的 JSON 形状以外的东西** —— 人工校正只加字段,不重排既有字段
- **不动对比功能的反幻觉三道闸** —— prompt 强制 evidence / `_ground_changes` 取证 /
  无材料不调模型,三者本轮原样保留
- **不改既有 `/todos/*` 端点的 ACL 缺口** —— 仍属独立安全修复
- **不修 redesign 壳 `LEFT_TABS` 缺 `advice`** —— 既有差异,本轮不动

### 双份树(overlay)落位规则 —— 本轮每次改动都要对照

`backend/Dockerfile` 先 `COPY backend/ /app/` 再 `COPY meeting/backend/ /app/`,**后者胜**。
已实测对照(本轮开工时):

| 文件 | 状态 | 本轮怎么改 |
|---|---|---|
| `api/meeting.py` | **有差异**(2 处刻意 hunk:`Query` import + 模块导出 block) | 两副本都要改,且**必须保持差异仍只有那 2 处** |
| `models/meeting.py` | 逐字相同 | 两副本同步改,改完 diff 必须为空 |
| `prompts/meeting.py` | 逐字相同 | 同上 |
| `tasks/meeting_tasks.py` | 逐字相同 | 同上 |
| `services/meeting/insights.py` | **仅 overlay** | 只改 `meeting/backend/` 那份 |
| `services/meeting/comparison.py` | **仅 overlay** | 只改 `meeting/backend/` 那份 |
| `tasks/insight_tasks.py` | **仅 `backend/`**(overlay 无) | 只改 `backend/` 那份 |

**新文件一律只建在 overlay**(`meeting/backend/`),否则制造新漂移源。

---

## 子任务

### A · 去掉「解释图」tab — 需求 1 — 已完成

纯前端,摘干净即可。涉及点已全量 grep 确认(前端仅这两文件引用)。

- [x] `frontend/src/pages/console/ConsoleMeetingDetail.tsx`(legacy,原 3362 行 → 3124 行)
  - [x] `:55` `LeftTab` 类型删 `'illustrations'`
  - [x] `:143` `LEFT_TABS` 删该条目
  - [x] `:3017` 渲染分支删除
  - [x] `:2000-2237` `IllustrationsTab` 函数整体删除(**238 行**,用标记锚定删除:
        `// ── Tab: 解释图 ─` 到 `// ── 干系人卡片`,不依赖行号)
  - [x] import 清理:`Palette` / `Maximize2` / `Copy` / `Download` /
        `getIllustrationStyles` / `IllustrationStyle` / `IllustrationStylesResponse` /
        `MeetingIllustration` 全部删除
        —— 删组件后这些**仅**在 `IllustrationsTab` 内部使用。
        注:`tsconfig` 里 `noUnusedLocals: false`,所以留着**不会**报错,
        但仍按「不留死代码」清掉;`MermaidBlock`(`:44`)**保留**(`:1989` ProcessFlowsTab 在用)
  - [x] `:3006` 注释「最后一个 tab「解释图」」改为「洞察」
- [x] `frontend/src/redesign/console/ConsoleMeetingDetail.tsx`
  - [x] import 删 `Palette`(该文件 `Palette` **仅** tab 条目一处使用)
  - [x] import 删 `IllustrationsTab`
  - [x] `LeftTab` 类型 / `LEFT_TABS` / 渲染分支 / 注释 同步改
- [x] **保留**(刻意):`illustrations` 列、`extract_illustrations` action、
      `/illustration-styles` 端点、`meeting_illustrations_extract` routing key、
      `RoutingTab.tsx:35` 配置项、`client.ts` 的 `MeetingIllustration` 等类型
- [x] 验证:`npx tsc --noEmit` exit 0;全前端 grep `IllustrationsTab|解释图` 只剩
      `RoutingTab.tsx:35` 一处(刻意保留,理由见边界段)

### B · 对比可选具体会议 — 需求 2

现状:`find_previous_meeting()`(`meeting/backend/services/meeting/comparison.py:51-72`)
**写死**四个条件:同 project + `start_time` 严格更早 + 已出纪要 + `start_time DESC LIMIT 1`。
`POST /compare-insight` **不接受任何参数**;且 `_task.delay(meeting_id)` **只传了 meeting_id**,
Celery 任务内部**又重算一次** `find_previous_meeting` —— 于是 POST 返回给前端的 prev 与
实际对比对象可能不一致(两次调用之间上一场刚出了纪要)。**这次必须一并修掉**。

- [ ] 后端 · overlay 服务层 `meeting/backend/services/meeting/comparison.py`
  - [ ] 新增 `find_comparable_meetings(meeting, session)` — 返回同项目、非自己、
        **已出纪要**的会议列表(供前端选择器取候选),按 `start_time DESC`
  - [ ] 新增 `load_comparable_meeting(meeting, prev_id, session)` — 按 id 取,并**校验**:
        同 project / 不是自己 / 已有纪要;不满足返回 None(由 API 层转 400)
  - [ ] `find_previous_meeting()` **保留**,作为 `prev_id` 未传时的兜底(兼容已入队的旧任务)
- [ ] 后端 · 两副本 `api/meeting.py`
  - [ ] `GET /{id}/compare-candidate` 改造:除 `prev`(默认建议项,兼容既有前端)外,
        新增 `candidates: [{id,title,created_at,has_minutes}]` 列表
  - [ ] `POST /{id}/compare-insight` 加 Pydantic body `{prev_meeting_id?: int}`;传了就走
        `load_comparable_meeting` 校验(不通过 → 400 带可读中文原因)
  - [ ] **把 `prev_id` 传给 Celery**(修掉上面那个不一致 bug)
- [ ] 后端 · `backend/tasks/insight_tasks.py`
  - [ ] `compare_meeting_previous(self, meeting_id, prev_id=None)` —— **必须有默认值**,
        否则已入队的旧任务反序列化会炸
  - [ ] `:109` 的 `prev = await find_previous_meeting(...)` 改为:有 `prev_id` 走
        `load_comparable_meeting`,否则回退 `find_previous_meeting`
- [ ] 后端 · prompt(两副本 `prompts/meeting.py` `COMPARE_USER` `:765-804`)
  - [ ] **方向问题**:现模板措辞假定 prev 一定更早(「上一场会议」)。用户可能选一场**更晚**的会,
        此时 before/after 语义反转。改为中性措辞(如「基准会议 A / 当前会议 B」),
        并在 system prompt 里说明两者时间先后不固定
- [ ] 前端 · `frontend/src/api/client.ts`
  - [ ] `startCompareInsight(meetingId, prevMeetingId?)` 加参数,传 body
  - [ ] `CompareCandidate` 类型扩 `candidates` 列表
- [ ] 前端 · `ComparisonPanel.tsx`
  - [ ] 加会议选择器(候选来自上述 `candidates`;**筛选条件与后端一致**:已出纪要)
  - [ ] 「与上一场会议对比」按钮文案改为「与所选会议对比」或保留但旁边显示当前选择
  - [ ] 结果态「对比基准」chip 点击可换会议重跑
- [ ] 前端 · 会议选择器组件
  - [ ] 仓库**没有**可复用的会议选择器(已 grep 确认)。项目会议可能很多,
        `PillSelect.tsx` 无搜索框不够用 → 照 `CollaboratorsModal` 的「搜索 + 列表 + 选中」
        范式新建轻量选择器(放 `components/console/meeting/` 下)
- [ ] 验证:`tsc --noEmit`;`compileall`;两副本 `api/meeting.py` 差异仍只有 2 处 hunk

### C · 洞察 tab 缩放 + 折叠 — 需求 3 — 已完成

现状:洞察 tab 是 `<div className="space-y-4">` 纯纵向流,无固定高度;可见高度由**父级**
滚动容器决定 —— legacy `:3011` `maxHeight: calc(100vh - 360px)` /
redesign `:361` `maxHeight: calc(100dvh - 320px)`。硬编码尺寸只有词云 canvas `HEIGHT = 380`
和四象限落点 `min-h-[128px]`。

- [x] 整体缩放
  - [x] 洞察 tab 顶部加缩放控件(`−  100%  +` + 点百分比复位),范围 60%–150%,步进 10%
  - [x] 用 **CSS `zoom`**(改布局尺寸、滚动条自然正确),**未用** `transform: scale`
        (后者不参与布局,会留白且要手工补偿宽度)
  - [x] 缩放比例持久化到 `localStorage`(`kb_insight_zoom`),沿用
        `DataTable.tsx:99-118` 的写法:`typeof window` 守卫 + `try/catch`
        (隐私模式下 storage 会抛,必须静默降级)
  - [x] 读出时夹到 `[0.6, 1.5]`:存进去的值可能来自旧版本或被人手改过
- [x] 模块折叠
  - [x] `Section` 加折叠,4 个子模块共用,改一处即全生效
  - [x] 标题**整块可点**(只点箭头体验差);结构为 `h3 > button`,`aria-expanded` 跟随
        —— 反过来把 `h3`/`p` 塞进 `button` 是**无效 HTML**(流内容不能进 button)
  - [x] 折叠状态集中在容器(`CollapseCtl`),这样「全部折叠/展开」才能一次改到所有模块
  - [x] 持久化到 `localStorage`(`kb_insight_collapsed`)
- [x] 待办过多自动折叠
  - [x] `TodoQuadrant.tsx` 加常量 `COLLAPSE_AFTER = 6`;`DropZone` 超过阈值只显示前 6 条 +
        「展开全部(N)」/「收起」。四象限 + 未分类区共用 `DropZone`,一处改全生效
- [x] **额外修的一个坑(词云发糊)**:canvas 位图后备区原本是 `width * dpr`,而 CSS `zoom`
      只是把已画好的位图**拉伸** —— 放大到 150% 时文字明显发糊(等效 dpr 被除以 1.5),
      而「看清」正是这个功能的初衷。给 `KeywordCloud` 加 `scale` prop,
      后备区改为 `width * dpr * max(1, scale)`,逻辑坐标系仍是 `width × HEIGHT`,
      布局算法一行没动。**注意**:`zoom` 下 `ResizeObserver` 报的局部宽度会随 zoom 变小
      (局部宽 = 父宽 / zoom),所以 zoom 变化会触发重绘,闭环成立。
      recharts 那两张图是 SVG(矢量),缩放天然清晰,不用处理
- [x] 验证:`npx tsc --noEmit` exit 0
- [ ] **待人工目视**:两套 UI(`/` 与 `?ui=new`)下缩放/折叠生效且不破版
      —— 本地起前端或部署后确认(需浏览器,本地无自动化)

### D · 参会人名单 + 说话人人工校正 — 需求 4(轻量阶段)

- [ ] DDL + ORM
  - [ ] `backend/main.py` 启动期 DDL 加
        `ALTER TABLE meetings ADD COLUMN IF NOT EXISTS participants JSON`
        (与既有 `keywords`/`speaker_stats` 同处,`main.py:421-423` 附近)
  - [ ] `models/meeting.py` **两副本同步**加列 + 结构注释:
        `participants {names:[str], source:"manual"|"minutes"|"stakeholders", updated_at}`
- [ ] 名单的读写
  - [ ] `MeetingCreate` 加 `participants`(会议创建时可填,补上「创建时无处填参会人」的缺口)
  - [ ] 新增 `PUT /{meeting_id}/participants`(两副本)—— 人工维护名单
  - [ ] `_meeting_dto` 输出该字段(两副本);**list DTO 保持 defer**(名单不大但列表页不需要)
- [ ] 喂给归因(这是准确率提升的核心)
  - [ ] `insights.py::collect_speaker_candidates()` 目前顺序是「干系人 → 参会人 → 待办负责人 →
        需求提出人」,其中「参会人」取自 `meeting_minutes.attendees`(LLM 抽的,不可靠)。
        **改为:人工名单(`meetings.participants`)优先级最高**,置于干系人之前
  - [ ] 名单非空时,**在 prompt 里显式告知这是人工确认的名单**,并要求优先从其中归属
  - [ ] 名单为空时行为**完全不变**(保持向后兼容)
- [ ] 说话人人工校正 UI(准确率的兜底 —— 无论归因多准,必须有纠错出口)
  - [ ] 新增 `PATCH /{meeting_id}/speaker-stats`(两副本):支持
        **改名**(`说话人1` → `张三`)、**合并**(两个说话人并成一个,时长相加)
  - [ ] 校正后置 `speaker_stats.corrected = true` + `corrected_at`,
        **前端徽标从「AI 推断」改为「已人工校正」** —— 数据如实性不能因为改过就模糊
  - [ ] 校正过的名字**不能被下一次「重新生成」静默覆盖**(生成时保留人工映射,或生成前提示)
  - [ ] 前端 `SpeakerSection`/`SpeakerDurationChart` 加校正入口(行内编辑 + 合并选择)
- [ ] 验证:`tsc --noEmit`;`compileall backend meeting/backend`;
      两副本 `models/meeting.py` / `prompts/meeting.py` diff 为空;
      **名单为空时归因结果与改动前逐字一致**(回归)

### E · 文档同步

- [ ] `LEARNING.md` 追加:本轮踩坑(overlay 双份树改动清单、`zoom` vs `transform` 取舍、
      对比方向反转、speaker_stats 校正与再生成的冲突)
- [ ] `PROJECT_OVERVIEW.md`:会议模块能力表更新(去解释图 / 对比可选 / 参会人名单)
- [ ] `CHANGELOG.md` 记一条
- [ ] 提交推送

---

## 验收标准

1. `npx tsc --noEmit -p tsconfig.json` 全绿(基线:本轮开工时已确认 exit 0)
2. `python -m compileall backend meeting/backend` 全绿
3. 两副本 `models/meeting.py` / `prompts/meeting.py` / `tasks/meeting_tasks.py` diff 为空;
   `api/meeting.py` 差异**仍只有那 2 处刻意 hunk**
4. **解释图 tab 在 `/` 与 `?ui=new` 两套 UI 下都消失**,且无残留死代码 / 未使用 import
5. 对比:能选任意同项目、已出纪要的会议;选**更晚**的会议时 before/after 语义不错乱
6. 洞察:缩放比例生效且刷新后保持;各模块可折叠;待办 >6 条时自动折叠并可展开
7. 参会人名单:创建时可填、详情页可改;名单非空时归因候选以名单为准;
   **名单为空时归因结果与改动前一致**
8. 说话人校正:改名 / 合并后刷新保持,徽标显示「已人工校正」,
   且「重新生成」不会静默覆盖人工结果

---

## 验证记录

(逐块补充)

---

## 后续单独立项(本轮明确不做)

- **真正的声学声纹分离** —— 用户已确认分阶段:先做本轮轻量方案,再评估是否引入。
  若做,现实选项是 **`sherpa-onnx`**(ONNX Runtime,**不需要 torch**,模型约 100MB,
  用 pyannote 分割 + 3D-Speaker 声纹嵌入)。必须先核实:
  - 服务器 **4C/7.4G/50G**,已跑 backend + frontend + postgres + redis + minio + celery
    + edge + skillhub + aihub 一整套;磁盘余量需实测
  - celery 容器 `mem_limit: 2g`、backend `512m`(`docker-compose.yml:100,135`)——
        跑声学模型必然要调,且 celery 现为 `--concurrency=2`
  - CPU 上 2 小时会议的声学聚类耗时(异步 Celery,可接受但要实测)
  - **`torch` + `pyannote` 路线基本不可行**(镜像体积 + 内存 + GCP 已迁腾讯云,
    ghcr 拉取慢的历史包袱)
- **「参会人名单」从飞书妙记 / 日历自动同步** —— 现在只能人工维护
- **Path A 的「说话人N」→ 真人名映射** —— 飞书妙记格式转写即使解析精确,
  标签仍是匿名的,目前无任何映射机制

---

## 已知既有问题(沿用上一轮记录,本轮仍未修)

- **`/todos/*` 全部端点缺项目 ACL** —— 只校验 `get_current_user`,任何登录用户可读写
  任意项目的待办。属独立安全修复。
- **`POST /todos/{id}/smart-assign` 复用了 `meeting_illustrations_extract` 这个 task 名**
  (`backend/api/project_todos.py:909`),语义不对且导致该 key 的模型配置被两处共用。
  **本轮摘解释图 tab 时切勿删掉这个 routing key** —— 会连带打断 smart-assign。
- **`sync_todos_for_meeting()` 无调用方**(死代码)。
- **`comparison.py:290-291` 的 error 字段被前端静默忽略** —— 当所有 change 都被取证闸砍光、
  但还剩建议时,前端走「有结果」分支,用户看到「只剩建议」而看不到 error。本轮不修,
  但改对比功能时注意别把这个行为放大。
- **redesign 壳的 `LEFT_TABS` 缺 `advice`**(legacy 有)。既有差异,本轮未动。
