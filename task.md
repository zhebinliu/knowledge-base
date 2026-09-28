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

### B · 对比可选具体会议 — 需求 2 — 已完成

现状:`find_previous_meeting()`(`meeting/backend/services/meeting/comparison.py:51-72`)
**写死**四个条件:同 project + `start_time` 严格更早 + 已出纪要 + `start_time DESC LIMIT 1`。
`POST /compare-insight` **不接受任何参数**;且 `_task.delay(meeting_id)` **只传了 meeting_id**,
Celery 任务内部**又重算一次** `find_previous_meeting` —— 于是 POST 返回给前端的 prev 与
实际对比对象可能不一致(两次调用之间上一场刚出了纪要)。**这次一并修掉了**。

- [x] 后端 · overlay 服务层 `meeting/backend/services/meeting/comparison.py`
  - [x] `find_comparable_meetings()` — 同项目、非自己、**已出纪要**,按 `start_time DESC`。
        **刻意不加时间约束**:用户可以拿一场更晚的会作参照
  - [x] `load_comparable_meeting()` — 按 id 取并**逐条校验**(存在 / 非自己 / 同 project / 有纪要)。
        注释里标明这是**权限与数据的唯一关口**:同 project 那条同时兜住越权,
        因为 `meeting` 本身已过 `_load_meeting_owned`(含 ACL)
  - [x] `resolve_prev_meeting()` — 统一的「传了就校验、没传退上一场」入口,返回
        `(会议, 中文错误文案)`,端点直接把它转 400。**放服务层是因为 api 有两副本**,
        逻辑放这里只维护一处
  - [x] `find_previous_meeting()` **保留** —— 未传 `prev_id` 时的兜底 + 旧任务兼容路径
  - [x] `__all__` 补齐 5 个入口;模块 docstring 从「对外两个入口」改为 4 个入口说明
- [x] 后端 · 两副本 `api/meeting.py`(改动逐字相同)
  - [x] 新增 `CompareStartBody{prev_meeting_id: Optional[int]}`;端点签名用
        `body: Optional[CompareStartBody] = None`,**不带 body 的旧调用继续可用**
  - [x] `GET /{id}/compare-candidate` 返回 `{prev, candidates[], reason}`;
        `reason` 改为**仅在 `candidates` 为空时**给(它是给「一个空下拉」配的说明)
  - [x] `POST /{id}/compare-insight` 走 `resolve_prev_meeting` 校验 → 400 带可读中文原因
  - [x] **`_task.delay(meeting_id, prev.id)` 显式传 prev_id**(修掉上面那个不一致 bug),
        并在源码里写明「任务里不能再自己算一次」的理由
  - [x] 字段名 `created_at` → **`start_time`**:原名字是错的,后端塞进去的一直是
        `Meeting.start_time`。`ComparisonPanel` 是唯一消费方且本轮同步重写,故直接改名不留兼容
- [x] 后端 · `backend/tasks/insight_tasks.py`(**仅主树**,overlay 无此文件)
  - [x] `compare_meeting_previous(self, meeting_id, prev_id=None)` —— `prev_id`
        **必须有默认值**,否则 2026-09 之前入队/在途的旧消息反序列化会 `TypeError`
  - [x] 传了 `prev_id` 走 `load_comparable_meeting`,否则回退 `find_previous_meeting`;
        **在任务里重新校验一遍** —— 任务可能比请求晚几分钟才跑,期间那场会可能被删或纪要被清
  - [x] 失败文案改为按路径区分(`miss_reason`),不再写死「没有更早的」
- [x] 后端 · prompt(两副本 `prompts/meeting.py`,改完逐字相同)
  - [x] 修**方向反转**问题:原措辞写死「上一场会议」。用户选了**更晚**的会时 before/after 语义反转。
        改为「**基准会议** → 本场会议」的统一表述,并在 system prompt 里明确
        「它可能比本场会议早,也可能晚 —— 不要假设谁先谁后,以材料里的日期为准」
  - [x] trend 五值的定义一并改成相对表述(「本场会议相对基准会议……」)
  - [x] suggestions 增加一条约束:**站在项目当前角度给建议**,不写「在基准会议之后应该……」这类
        带时间方向的表述
  - [x] **占位符名 `prev_*` 保持不动** —— 它同时是已落库 `comparison_insight` JSON 的字段名,
        改名要动存量数据。只在文件头加注释说明「`prev_` = 对比基准,不保证更早」
- [x] 前端 · `frontend/src/api/client.ts`
  - [x] 新增 `CompareMeetingRef{id,title,start_time}`;`CompareCandidate` 加 `candidates[]`
  - [x] `startCompareInsight(meetingId, prevMeetingId?)` —— 不传时 POST `{}`,
        走后端「上一场」兜底
- [x] 前端 · 新组件 `components/console/meeting/MeetingPicker.tsx`
  - [x] **没复用 `redesign/components/PillSelect.tsx`**,两个原因写在组件头:
        (a) 它只用 `rd-*` 类名,是 redesign 壳专属,而本组件要被新旧两套 UI 共用;
        (b) 它**无搜索框** —— 项目跑到中后期几十场会,纯翻列表找不着
  - [x] 搜索同时匹配**标题与日期**(「上周那场」通常只记得日子)
  - [x] 点面板外 / Esc 关闭(否则下拉会一直挂着挡下面的内容);展开时聚焦搜索框并清空上次搜索词
  - [x] 只用 tailwind 令牌(`text-ink` / `border-line` / `bg-canvas` / `text-brand`),两套 UI 通用
- [x] 前端 · `ComparisonPanel.tsx`
  - [x] 选择器:候选 >1 时给下拉,==1 时退化为静态 chip(摆一个只有一项的菜单是徒增噪音)
  - [x] 默认值用 `pickedId ?? prev?.id ?? candidates[0]?.id`
        —— **不用 `useState` 初值 + `useEffect` 同步**:candidates 是异步到的,那种写法要么闪空值,
        要么得处理「用户已选但列表还没到」的竞态
  - [x] 结果态区分「**结果基准**」(这份结果是跟谁比的)与「**换一场对比**」(下次跟谁比),
        两者不同时给琥珀色提示「已改选,点『重新对比』才会生效(下方仍是旧结果)」
  - [x] 空态文案「与上一场会议对比」→「开始对比」;`InsightTab` 的模块标题
        「与上一场会议对比」→「与其它会议对比」,desc 同步改成「自选……任意一场」
- [x] 验证:
  - [x] `python -m py_compile` 6 个改动文件全过
  - [x] `COMPARE_USER.format()` 实跑通过,11 个占位符全部被引用、无多余键;
        断言 `COMPARE_SYSTEM`/`COMPARE_USER` 中已无「上一场」字样
  - [x] `npx tsc --noEmit -p tsconfig.json` exit 0
  - [x] 两副本 `prompts/meeting.py` `git diff --no-index` **为空**;
        两副本 `api/meeting.py` 差异**仍只有那 2 处刻意 hunk**(`Query` import + 模块导出 block)
  - [ ] **待部署后实测**:选一场更晚的会议,确认 before/after 语义与 trend 方向正确
  - 注:本地未装后端依赖(`celery` 等),真正的 `import` 验证只能靠部署时 CI 的 build + 测试

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

### D · 参会人名单 + 说话人人工校正 — 需求 4(轻量阶段) — 已完成

设计上的一个关键取舍(**先说清楚,因为它决定了后面所有代码形状**):
**校正不做「就地改结果」,而是存一份「原始标签 → 最终姓名」映射 + 一份不可变的 `raw_speakers`,
每次生成时把映射重放到原始结果上。** 理由有三:
(a) 就地改的键会漂移 —— `张三`→`张三丰`→`老张` 之后,映射表的键就对不上原始结果了,重放不幂等;
(b) 重放让「重新生成」**免费地**不会吞掉人工校正 —— 生成完再套一次映射即可,不需要在生成路径里
写「如果用户改过就……」这类分支;
(c) 撤销 = 清空映射重放一次,不用存历史快照。

- [x] DDL + ORM
  - [x] `backend/main.py` 启动期 DDL 加
        `ALTER TABLE meetings ADD COLUMN IF NOT EXISTS participants JSON`
        (与既有 `keywords`/`speaker_stats` 同处,`main.py:421-423` 附近)。
        注释写明**为什么单独一列而不塞进 `speaker_stats`**:`speaker_stats` 会被「重新生成」
        整体覆盖,名单不能跟着没
  - [x] `models/meeting.py` **两副本同步**加列 + 结构注释:
        `participants {names:[str], source:"manual"|"minutes"|"stakeholders", updated_at}`。
        `source` 记「这份名单从哪来」—— 只有 `source == "manual"` 时 prompt 里才会声明
        「这是人工确认过的名单」;将来若接日历/妙记自动同步,那句话就不成立了
- [x] 名单的读写
  - [x] ~~`MeetingCreate` 加 `participants`~~ —— **刻意不做**。实测 `create_meeting` 连既有的
        `agenda` 字段都**没有落库**,再加一个字段就是死代码;而真正的创建 UI 是一对 800 行的
        新旧双份页面,为一个「在洞察 tab 原地就能改」的字段去动它,爆炸半径远大于收益。
        **创建时填名单留到后续单独立项**(见文末)
  - [x] 新增 `PUT /{meeting_id}/participants`(两副本):`ParticipantsBody{names: list[str]}`,
        入口先 `normalize_participants()` 归一,再写
        `{"names":…, "source":"manual", "updated_at": iso_utc(utcnow_naive())}`
  - [x] `_meeting_dto` 输出该字段(两副本);**list DTO 保持 defer**
        —— 列表页不显示它,且列表查询本来就 defer 了一批重字段
- [x] 喂给归因(这是准确率提升的核心)
  - [x] `insights.py::collect_speaker_candidates(..., participants=None)` —— 新名单
        **置于最前**,顺序变为「人工名单 → 干系人 → 参会人 → 待办负责人 → 需求提出人」
  - [x] 新增 `_roster_note(participants)`:名单非空时在 prompt 里显式声明「这是人工确认的名单,
        优先考虑」;同时**明确重申**「不在名单里的候选依然可能是发言人」+「线索不足时依然必须填
        『无法判断』」—— 否则模型会硬往名单上套,反而制造新的错归属
  - [x] 名单为空时 `_roster_note()` 返回空串,`SPEAKER_ATTR_USER` 渲染结果**与改动前逐字一致**
        (已断言,见验证记录)
  - [x] `normalize_participants()`:去空白、去重、丢掉空/超 20 字/含换行的名字,
        **上限 50 人**(`_MAX_PARTICIPANTS`)—— 名单直接进 prompt,不能让它无限长
- [x] 说话人人工校正(准确率的兜底 —— 无论归因多准,必须有纠错出口)
  - [x] 新增 `PATCH /{meeting_id}/speaker-stats`(两副本),`SpeakerCorrectionsBody{mapping, reset}`:
        **改名**(`说话人1` → `张三`)、**合并**(两个说话人并成一个,时长相加)底层是同一个映射
        (多个标签指向同一姓名就是合并);`reset=true` 撤销全部校正
  - [x] 无 `raw_speakers` 时直接 400(上线前生成的数据没有校正基准);
        映射里出现未知标签时 400 并**列出具体是哪些**,文案为「校正对象不存在:…。请刷新后重试」
        —— 不静默忽略,否则用户以为改成功了
  - [x] 校正后置 `speaker_stats.corrected = true` + `corrected_at`;
        前端徽标「已人工校正」是**加挂不是替换** —— 来源徽标(精确解析 / AI 推断)保留,
        因为人工只改了名字归属,**时长本身仍是推断值**,这一点不能被模糊掉
  - [x] 校正过的名字**不会被「重新生成」静默覆盖**:生成路径末尾
        `with_corrections(stats, old.get("corrections"), old.get("corrected_at"))` 重放映射;
        `corrected_at` 也**沿用旧值**,否则重生成会顺手把「人工校正于何时」改成此刻
  - [x] `apply_corrections()` 的**占比分母 = 已知 + 无法判断**(而非只除已知)——
        这样「无法判断」的占比在改动前后可比,不会因为一次改名就跳变。
        同名的多行合并时 `seconds`/`turn_count` **相加**、`labels` 取并集
  - [x] 前端 `SpeakerDurationChart.tsx` 重写(`meetingId` 成为**必填** prop;
        已 grep 确认唯一调用方是 `InsightTab.tsx:319`,无其它调用点需要跟着改)
    - [x] 行内点姓名改名(Enter 提交 / Esc 取消 / 失焦提交);
          一行改名时**该行全部原始标签一起改** —— 已合并的行否则会散架
    - [x] 勾选 ≥2 行 → 「合并所选」,并到**勾选的第一行**的名字上
          (符合直觉,也省掉再弹一个输入框问新名字)
    - [x] 行 key 用**原始标签串**(`rowKey`),不用 `name` —— 后者改名后会漂移
    - [x] 「撤销全部校正」用两步确认(按钮就地变「再点一次确认撤销」),不引 modal
    - [x] 旧数据(无 `raw_speakers`)不给校正入口,但**给出说明**
          「重新生成一次即可启用人工校正」,而不是让按钮凭空消失
    - [x] 提交只带**改动的项** —— 后端是并入语义,不会碰其余校正
  - [x] 前端 `InsightTab.tsx` 加 `RosterEditor`(名单编辑,textarea,一行一个或用「、」「,」分隔;
        打开时用当前名单重置草稿 —— 沿用上次没保存的内容会让人以为已经生效)。
        放在 `SpeakerSection` 内、图表之前,**这样空态和有结果态都有入口**
  - [x] 诚实提示:文案明说「名单只影响**下次**生成:保存后请点右上角『重新生成』才会用上」;
        `mode === 'inferred'` 且名单非空时显示「本次归因已优先考虑人工名单(N 人)」
- [x] 验证:
  - [x] `python -m py_compile` 8 个改动文件全过
  - [x] **纯函数桩测 32/32 断言通过**(临时脚本 `_check_insights.py`,验完已删):
        归一化(空白/重复/超长/换行/上限)、**候选顺序回归(空名单 == 改动前顺序)**、
        改名、合并(时长相加、labels 并集)、占比分母含 unknown、**幂等(重放两次结果相同)**、
        `with_corrections` 打标、重生成保留校正**且保留原 `corrected_at`**、reset、
        空 speakers 安全、roster note 内容
  - [x] `_check_speaker_prompt.py`(临时,已删):`SPEAKER_ATTR_USER.format(roster_note=…)` 通过;
        **空名单渲染与改动前逐字一致**
  - [x] `npx tsc --noEmit -p tsconfig.json` exit 0
  - [x] 两副本 `models/meeting.py` / `prompts/meeting.py` **SHA256 相同**;
        两副本 `api/meeting.py` 差异**仍只有那 2 处刻意 hunk**
  - 注:本地未装后端依赖,`import` 级验证只能靠部署时 CI 的 build + 测试
  - [ ] **待部署后实测**:保存名单 → 重新生成 → 归因是否确实以名单优先;
        改名/合并后刷新保持;重生成不吞校正

### E · 文档同步 — 已完成

- [x] `LEARNING.md` 追加本轮踩坑(见该文件 § 新章节)
- [x] `PROJECT_OVERVIEW.md`:会议模块能力表更新(去解释图 / 对比可选 / 参会人名单)
- [x] `CHANGELOG.md` 记一条
- [x] 提交推送

---

## 验收标准

1. `npx tsc --noEmit -p tsconfig.json` 全绿(基线:本轮开工时已确认 exit 0)
2. `python -m compileall backend meeting/backend` 全绿
3. 两副本 `models/meeting.py` / `prompts/meeting.py` / `tasks/meeting_tasks.py` diff 为空;
   `api/meeting.py` 差异**仍只有那 2 处刻意 hunk**
4. **解释图 tab 在 `/` 与 `?ui=new` 两套 UI 下都消失**,且无残留死代码 / 未使用 import
5. 对比:能选任意同项目、已出纪要的会议;选**更晚**的会议时 before/after 语义不错乱
6. 洞察:缩放比例生效且刷新后保持;各模块可折叠;待办 >6 条时自动折叠并可展开
7. 参会人名单:**洞察 tab 内可改**(创建时填名单本轮刻意未做,见 D 段与「后续单独立项」);
   名单非空时归因候选以名单为准;**名单为空时归因结果与改动前一致**
8. 说话人校正:改名 / 合并后刷新保持,徽标显示「已人工校正」,
   且「重新生成」不会静默覆盖人工结果

---

## 验证记录

| Block | 验证手段 | 结果 |
|---|---|---|
| A | `npx tsc --noEmit` + 全前端 grep `IllustrationsTab\|解释图` | exit 0;仅剩刻意保留的 `RoutingTab.tsx:35` |
| B | `py_compile` 6 文件 / `COMPARE_USER.format()` 11 占位符 / `tsc --noEmit` / 两副本 diff | 全过 |
| C | `npx tsc --noEmit` | exit 0 |
| D | `py_compile` 8 文件 / **纯函数桩测 32 断言** / prompt 渲染回归 / `tsc --noEmit` / 两副本 SHA256 | 32/32 通过;空名单渲染逐字不变;exit 0;哈希一致 |

**本地无后端依赖(无 `celery` 等),故后端「可 import」这一层只能由 CI 的测试兜住。**
本地用桩注入(手工塞 `sqlalchemy`/`structlog` 等的假模块)把 `insights.py` 的纯函数摘出来单测,
覆盖的是逻辑正确性,不是集成正确性。

**CI 实测(2026-09-29,commit `eb50ded`,MinIO 镜像修好之后的第一次真跑)**:CI Checks 两个 job 全绿
(`Run Tests` 1m11s / `Frontend tsc + build` 1m45s),`Run Tests` 报 **7 passed**。
即 `main.py` 能在容器里起来、新的 `ALTER TABLE meetings ADD COLUMN IF NOT EXISTS participants JSON`
走通 —— 这是本轮后端改动唯一一次真实集成验证。
⚠️ 但仓库现有 pytest **只有 7 个用例**,本轮新增的两个端点(`PUT /participants`、
`PATCH /speaker-stats`)**没有任何自动化覆盖**,仍属下方「待人工目视」范围。

**待人工目视(需浏览器,本地无自动化)**:
1. 两套 UI(`/` 与 `?ui=new`)下洞察 tab 缩放/折叠生效且不破版(需求 3)
2. 选一场**更晚**的会议作对比基准,确认 before/after 语义与 trend 方向正确(需求 2)
3. 保存参会人名单 → 点「重新生成」→ 确认归因确实以名单优先(需求 4)
4. 改名 / 合并发言人 → 刷新页面 → 确认保持,且「重新生成」不吞掉校正(需求 4)

---

## 部署记录

| 时间 | commit | 结果 |
|---|---|---|
| 2026-09-29 | `405148b` | ✅ 成功。`backend=true frontend=true **edge=false**`(未碰 `edge/` 与 `docker-compose.yml` → 不闪断 aihub/skillhub);`Healthy after 5s`;`celery_worker 已对齐`;`prod-live` tag = `405148b` |

部署后外部核验:

- `https://kb.sharewb.cloud/version.json` → `sha=405148b9439478b91797e0add85bccd0c2b363fc`,与 `prod-live` **一致**;首页 200
- 新增路由确实注册上(未登录返回 401;对照组 `GET /meeting/1/definitely-not-a-route-xyz` 返回 404,证明 401/404 这个判据有效):
  `GET /meeting/{id}/compare-candidate`、`POST /meeting/{id}/compare-insight`、
  `PUT /meeting/{id}/participants`、`PATCH /meeting/{id}/speaker-stats` 全部 401 ✅

> 部署日志里有一句 `docker-compose.yml 已更新(旧版备份 .prev)`,那是 `cmp -s` 发现
> **服务器上的副本与仓库不一致**而做的同步(上一次部署遗留),**不是本轮改动** ——
> 本轮 `edge=false` 已证明 `docker-compose.yml` 不在变更集里。且部署全程
> `up -d --no-deps backend frontend`,**minio 未被重建**,生产 minio 不受影响。

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
- **创建会议时就能填参会人名单** —— 本轮刻意未做(理由见 D 段:`create_meeting` 连 `agenda`
  都没落库,字段会是死代码;而创建 UI 是 800 行的双份页面)。要做需连同 `create_meeting`
  的落库一起补,并同步改 legacy / redesign 两套创建页
- **Path A 的「说话人N」→ 真人名映射** —— 飞书妙记格式转写即使解析精确,
  标签仍是匿名的,目前无任何映射机制

---

## 已知既有问题(沿用上一轮记录,本轮仍未修)

- **`quay.io/minio/minio` 也已清空(2026-09-29 发现)** —— 与本轮改动无关,
  上一次 CI(9-28 09:28)挂在同一步。诊断与三处不兼容点已留档在
  [LEARNING.md § 31](LEARNING.md)。
  - **CI 侧已修**(`eb50ded`):两个 workflow 的测试镜像改 `cgr.dev/chainguard/minio`,CI 已绿。
    注意这不只是「CI 红」——`deploy` job 要求 `needs.test.result != 'failure'`,
    此前**发布是被硬卡住的**。
  - **生产侧仍未决**:`docker-compose.yml` 与 `kanban/docker-compose.yml` 的 minio 镜像
    **仍是 `quay.io/minio/minio:latest`,已拉不到**。刻意没动 —— Chainguard 是 distroless + 非 root,
    与存量 root 属主卷 / healthcheck 的 curl / 备份脚本的 tar 三处不兼容,要配维护窗口单独做。
    现状可运行(服务器本地已有该镜像,且部署全程 `up -d --no-deps <服务名>`,服务名里没有 minio),
    但**一旦服务器丢了那个镜像或有人手工 `up -d minio`,就恢复不了**。
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
