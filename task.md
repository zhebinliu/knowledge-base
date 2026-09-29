# 任务日志

按轮次倒序记录。最新一轮在最上面。

---

# 轮次:转写面板新增「讲话人识别」tab(2026-09-29)

## 需求

> 会议纪要详情页的原文、AI润色 Tab 右侧增加一个讲话人识别版,格式是讲话人名 + 时间点 + 润色后的对话

即右侧转写面板从「原文 / AI润色」两档变成三档,新增一档按**说话人分段**展示,每段是「姓名 · 时间点 · 该段的润色文本」。

## 关键前提(决定了改法)

1. **每行归属今天算出来了,但被丢掉了。** `_resolve_owners`([insights.py:623-671](../knowledge-base/meeting/backend/services/meeting/insights.py#L623-L671))已经产出「逐行 → 说话人」的数组,`_segments_from_owners` 把它压成 `{name, seconds}` 的**聚合时长**,行号和起止时间**全部没落库**。`speaker_stats.speakers` 只有「每人总时长」,拿不到「第 12 分钟是谁说的」。**所以要新增一个持久化字段,不是纯前端改动。**
2. **润色文本保留了 `[MM:SS]` 标记,且与原行一一对应。** `backend/prompts/meeting.py:13-17` 明写「时间戳必须逐字保留,不得修改、删除、合并、新增」「输入多少行带 `[MM:SS]` 的内容,输出就保留多少个 `[MM:SS]` 标记」。**这使「按时间区间取润色文本」成为可行方案** —— 否则得让模型重新输出一遍带说话人的全文。
3. **归因跑在原文上**(`insights.py:750` `base = raw or polished`),但**时间戳两边一致**,所以用区间去润色文本里取段落是成立的。不改这个偏好(改了会动现有准确率,不在本需求范围)。
4. **`insights.py` 只有一份**(`meeting/backend/`,`backend/` 下不存在);但 **PATCH 端点有两份**(`backend/api/meeting.py` + `meeting/backend/api/meeting.py`),必须同步改。
5. **不存文本。** `speaker_stats` 是 JSON 列,把整份转写塞进去会让它膨胀上百 KB。只存 `{name, start_seconds, end_seconds, start_line, end_line}`,文本由前端拿区间去 `polished_transcript` 里取。副作用是用户改了润色文本,这个视图自动跟着变。

## 边界

- 不改归因算法、不改 prompt、不改 `speakers` 聚合口径、不动 API 形状(新字段在既有 JSON blob 内)。
- 不引入新依赖、不加 DB 列、不改 `Dockerfile` / `requirements.txt` / `mem_limit`。
- 旧数据(本次改动前生成的 `speaker_stats`)没有 `segments` 字段 → 前端给「重新生成一次即可」的空状态,不做兜底推算。
- 归因仍然跑在原文上(已知的取舍,不在本轮改)。

## Block G-1:后端持久化分段归属 [x]

`meeting/backend/services/meeting/insights.py`:

- 把 `_segments_from_owners` 的游走逻辑抽成**单一实现**(`_segment_runs`),再由两个薄投影分别产出时长(`{name, seconds}`)和区间(`{name, start_seconds, end_seconds, start_line, end_line}`)—— 避免两处各写一遍时长兜底规则而漂移。
- 新增 `_spans_from_turns`(路径 A:表头自带起止时间)。
- 新增 `apply_segment_corrections`:把人工校正映射到每段的名字上。**必须与 `apply_corrections` 用同一份映射**,否则时长图改了名字、这个视图还是旧名字。
- `with_corrections`:存 `raw_segments`(重放基准,与 `raw_speakers` 同构),算 `segments`。
- `extract_speaker_durations`:路径 A / B 都带上 `segments`;`_empty_speaker_stats` 补 `"segments": []`。

`backend/api/meeting.py` + `meeting/backend/api/meeting.py`(两份,`**PATCH /{id}/speaker-stats**`):

- 还原「刚生成完」形状时,把 `segments` / `raw_segments` 也摘掉并重置为原始值,否则校正态会被当成原始态喂回 `with_corrections`,重放不幂等。

## Block G-2:前端新增第三个 tab [x]

- `frontend/src/api/client.ts`:`SpeakerSegment` 接口 + `MeetingSpeakerStats` 加 `segments` / `raw_segments`。
- `frontend/src/pages/console/ConsoleMeetingDetail.tsx`:`RightTab` 加 `'speakers'`;`RIGHT_TABS` 追加一档;新增 **导出** 的 `SpeakerDialoguePanel`(redesign 壳复用,沿用 `MD_BODY_CLS` 那套「legacy 导出、redesign 导入」的先例)。
- `frontend/src/redesign/console/ConsoleMeetingDetail.tsx`:`RightTab` + `RIGHT_TABS` + 渲染分支。

**渲染与对齐规则:**

- 从 `polished_transcript` 里**扫描全文**的 `[MM:SS]` / `[HH:MM:SS]` 标记(不要求行首 —— 润色可能合并行或加 markdown 结构),切出 `{sec, text}` 序列。
- 按 `segments` 顺序**游标推进**取区间内的块(`chunk.sec < seg.end_seconds`),比「按秒查表」更稳:归因的行时间戳可能是**继承**来的(`_numbered_lines` 对没有标记的行继承上一行 ts),会出现重复值。
- 末段无 `end_seconds` → 吃到结尾;剩余未分配的块兜底追加到末段。
- 「无法判断」段用灰色弱化(与 `SpeakerDurationChart` 的 `UNKNOWN_COLOR` 一致)。
- 空状态三分支:无 `speaker_stats` / `mode === 'none'`(显示后端 `note`)/ 有 stats 但无 `segments`(旧数据,提示重新生成)。
- 对齐失败的兜底:若一段都没取到文本(典型是路径 A 的妙记导入 —— 润色不会保留「说话人 1 00:00:00」表头格式),退化成「姓名 + 时间点」清单并说明原因,**不静默显示空白**。

## 验证

- 后端:`python -c "import"` 可加载 + 本地跑 `_spans_from_owners` / `apply_segment_corrections` 的纯函数用例(不依赖 DB)。
- 前端:`npx tsc --noEmit -p tsconfig.json` exit 0。
- 双份树:确认 `insights.py` 无第二份、两个 `api/meeting.py` 的 hunk 一致。

## 落地记录(与原计划的差异)

- **抽出的公共游走叫 `_segment_runs`,不是 `_segments_from_owners`。** 它返回带 `start_seconds` / `start_line` 的原始区间,再由 `_segments_from_owners`(喂时长聚合)和 `_spans_from_owners`(喂本视图)两个投影取用。这样时长图与对话视图**不可能在切分上漂移**。
- **路径 A(妙记导入)没有单独的 `_spans_from_turns`。** 那条路 `turns` 本身就带起止时间,直接在返回值里内联构造 `segments` 即可,多加一层函数没有收益。
- **前端复用已有的 `fmtClock`**(本文件跳转条那版,line 297),只新增一个空值包装 `fmtClockOr` —— 分段起止都可能是 `null`,不能直接喂进去。
- **`SpeakerDialoguePanel` 不调任何 hook**(无 `useMemo`)。它前面有三种空状态 early return,hook 只能写在它们之前;而这段文本解析是纯字符串扫描,一次渲染只跑一遍,缓存没有收益。**这是刻意的,不是漏了。**
- **不给每段加背景色块**,只在 `bg-canvas/40` + `border-line` 上区分「无法判断」(虚线边框 + 灰色姓名)。`bg-white` 这类字面色在 redesign 深色壳里会翻车,而两者共用同一个组件。

## 验证结果

- `python -m py_compile` 三个后端文件 → OK;临时的 `_g1_check.py`(stub 掉 structlog / pipeline / model_router,按路径加载真 `insights.py`)22 条断言全过,已删。
- 前端 `npx tsc --noEmit -p tsconfig.json` → **exit 0**。
- 对齐逻辑单独跑了一遍真代码(用 esbuild 把 `parseTimedChunks` / `assignChunks` 从源文件切出来转译后 import,非重写):**14 条断言全过**,覆盖 `MM:SS`/`HH:MM:SS` 混排、标记不在行首 + markdown 结构、无标记降级、空块丢弃、左闭右开边界归属、**重复秒数不重复分配**、`null` end 吃到结尾、剩余块兜底、空段占位。临时文件已删。

---

# 轮次:说话人识别准确率优化(2026-09-29)— **方案待拍板,未开工**

## 用户诉求

> 当前的会议语音识别发言人不是很准确,请给出优化的方案

本轮只产出方案,不动代码。

## 诊断:声学信息在哪一步、以什么方式丢失

转写链路是「音频 → 文本」的**无损单行道**,声学信息被四步逐层剥光,**每一步都不可逆**:

| 步 | 位置 | 抹掉了什么 |
|---|---|---|
| ① 重采样 | `services/meeting/audio_utils.py:55-65` `ffmpeg -ac 1 -ar 16000 -f s16le` | **强制单声道降混 —— 这一条才是真正的销毁**,双麦/双通道会议麦(左右声道各对一人)的声道分离信息在这里被抹平,不可恢复。16kHz 的损失要小得多:奈奎斯特上限 8kHz 只削掉摩擦音的一部分能量,而 ASR 与声纹主要依赖 300-3400Hz 的共振峰,16k 是行业标准采样率 —— **不要把它和单声道并列**(2026-09-29 修正)。 |
| ② 硬切 | `services/meeting/asr.py:214` `pcm[i:i+640000]` | 等长 20 秒一刀,**无 VAD、无静音检测、无重叠窗口**(全链路 grep 不到任何能量/过零/VAD 逻辑)。切点落在音节中间前后两片都吐错字;片间只 `"\n".join`,无对齐无纠错;说话人切换点被物理销毁。 |
| ③ API 响应 | `services/meeting/asr.py:173` `.get("content")` | **最致命的一刀**。调的是小米 `mimo-v2.5-asr` 的 chat.completions 包装,响应里除 `content` 字符串之外的一切——说话人切换、词级时间戳、置信度——**全部丢弃**。请求体也没有任何 diarization/timestamp 开关(网关还规定 content 不能带 text part)。 |
| ④ 落库 | `services/meeting/asr.py:246-253` | 唯一留下的元数据是客户端按片号自造的 `[MM:SS]`(`seconds = i * CHUNK_SECONDS`)。即使前面侥幸留下更细的时间线索,这里也归约到 **20 秒一格**。 |

一句跨片的话被劈成两半分别识别,下游所有时间轴(需求跳转播放的 `start_seconds/end_seconds`、发言时长)的分辨率上限就是这 20 秒,而这个框里装的是**一整片多个说话人混在一起的话**。

**一个重要的利好**:原始音频**完整保留在 MinIO `meeting-audio` bucket,无生命周期清理**(仅删会议时删,`api/meeting.py:479-490`)。所以将来补 diarization **不需要重新采集**,可以回溯处理历史会议。

## 现状归因链的真实上限

`inferred` 路径(`insights.py:708-804`)准确率的天花板**不是「模型不够聪明」,而是没有物理依据**——模型只能靠口吻/业务细节掌握度/被点名回应/自称称谓四种语言学线索猜(`prompts/meeting.py:644-647`)。这是结构性的,调 prompt 改善有限。

比「猜不准」更值得先修的是三个**工程缺陷**:

### 缺陷 1:`inferred` 路径的人工校正会**静默失效**,且前端仍显示「已人工校正」⚠️

- 校正的存储形状是「不可变 `raw_speakers` + 可叠加 `corrections` 映射,每次重放」(`insights.py:371-449`),这个形状本身是对的。
- **但 `raw_speakers` 的 `name` 在 `inferred` 路径下是 LLM 每次现猜的真人名**(张三/李四)。这次猜出「张三」,用户把它校正成「张三丰」;下次重新生成时模型猜出的是「李四」→ 那条 `{张三: 张三丰}` 变成**死键,静默忽略且永不清理**(`apply_corrections` 里 `corrections.get(label, "")` 查不到就跳过)。
- 更糟的是 `with_corrections` 的 `if corr:` 只判断 dict 非空(`insights.py:443-448`),所以**校正早已失效、前端照旧显示「已人工校正 · 日期」徽标**。用户以为改对了。
- 这是**唯一一个会随使用次数增加而悄悄劣化**的问题。`parsed` 路径反而稳定(label 恒为「说话人 N」),所以「说话人N → 真人名」这个当前唯一能拿到真人名的机制只对妙记导入有效。

### 缺陷 2:人工名单超过 20 人时,尾部被 prompt 自己封杀

- `normalize_participants` 上限 **50**(`insights.py:236`),`_roster_note` 把 50 人全写进 prompt 声明「优先考虑」;
- 但 `collect_speaker_candidates` 结尾 `return out[:20]`(`insights.py:518`),`candidates` 只含前 20 人;
- 而 `SPEAKER_ATTR_SYSTEM` 铁律 1 写死「`speaker` 必须**逐字等于**候选名单中的某一项,**不允许**输出候选名单之外的人名」,`_resolve_owners` 还会把名单外的名字二次打成「无法判断」(`insights.py:650-652`)。
- 人工名单排在最前,所以**被截掉的恰好是人工名单的尾部**(第 21-50 人)。多部门大会必然踩到。

### 缺陷 3:coverage 与 confidence **反向耦合**

`confidence` 在模型没回有效值时按 coverage 反推(`insights.py:777-778`:≥0.9→high,≥0.7→medium)。而 coverage 衡量的是「多少行没落进『无法判断』」——**模型猜得越勤快、越不肯填「无法判断」,coverage 越高、置信度反而越高**,与铁律 3「错判比留空更有害」的意图直接冲突。用户看到的「置信度:高」可能是模型过度自信。

> 另:800 行硬截断(`_ATTR_MAX_WINDOWS 8 × _ATTR_LINES_PER_WINDOW 100`)实际门槛是 **4.4 小时**(一行 = 一个 20 秒片),对常规会议基本不触发,优先级低,记录备查。

## 方案分层(按杠杆排序)

### 第一层 · 换掉 ASR 的「最后一刀」——引入原生说话人分离 【最高杠杆】

**这是唯一能真正产生声学信息的一层**,其余各层都只是在没有声学信息的前提下把损失降到最小。

公开资料查到的可选供应商(两项都需注册后实测确认):

| | 阿里云百炼 Fun-ASR | 腾讯云录音文件识别 |
|---|---|---|
| 开关 | `diarization_enabled` + `speaker_count` | `speaker_diarization` + `SpeakerNumber` |
| 返回字段 | `speaker`(0 起) | `SpeakerId`(可能为 null) |
| 人数 | 按 `speaker_count` | 0-10(0=自动;非电话单声道支持 2-10 人) |
| 输入 | `audio_url`(**不支持本地文件上传**) | AudioUrl(COS)或 base64 |
| 额度 | 单次 ≤12 小时 / 2GB | 同类批量接口 |

**必须提前认清的两个代价,否则会低估改造:**

1. **不能对 20 秒片各自做分离。** 每片的说话人编号互相独立(第 1 片的 speaker 0 和第 20 片的 speaker 0 毫无关系),要得到全局一致的标签就必须**整段音频一次提交、全局聚类**。这意味着**放弃现有的 20 秒切片 + `done_chunks` 增量进度条**,改成「提交任务 → 轮询进度 → 一次性拿回结果」。**这是产品可见的回退**(流式进度条没了),需要产品侧接受,或用别的进度表达方式补偿。
2. **音频必须能被云 API 取到,而 MinIO 在内网。** 阿里云明确只收 `audio_url`,腾讯云要 COS 或 base64。500MB / 2 小时的会议录音走 base64 不现实。现实做法是把 `meeting-audio` 的对应对象生成**带签名的临时公网 URL**(经 edge 反代)或推送到对象存储。**这会带来「会议录音出网」的数据合规问题,必须先和用户确认。**

**改造面**(中等,不是改一行配置):

- ASR 是完全独立的模块,不依赖 `model_router`、不影响 LLM 路由,**切片/并发/令牌桶/回调这套骨架可保留**;
- 但 `_XIAOMI_API_BASE` / `_DEFAULT_MODEL` 是**模块常量,DB 和 `.env` 都改不了**(LLM 有 `model_registry` + `routing_rules` 运行时覆盖,ASR 没有),换供应商必须改代码 + 重新部署;
- 请求契约是 mimo 私有的(`input_audio` 必须 data URL、content 不能带 text part、提示词由网关注入),换家要重写请求构造与错误处理;
- 响应解析要从「纯文本」改成「带说话人标签 + 时间戳的结构」,进而牵动 `raw_transcript` 写入格式、`parsed` 正则、`speaker_stats` 生成、前端徽标语义;
- 现行限速契约(RPM 100 / TPM 10K / 20s 分片)是针对小米账号标定的,换家要重新标定;
- ⚠️ **`backend/` + `meeting/backend/` 双份 overlay 树必须同步改**——否则重演「名词校正词典在 prod 静默失效 3 个月」(`LEARNING.md §27.1`)。
- ⚠️ **别把新供应商的可用性当恒定**(`LEARNING.md §31.6`:外部依赖消失是常态;§29.4 记过国内机器拉境外源 ~76KB/s;§22.5 记过「官方端点 key 不通用,只有代理才通」)。选国内供应商(阿里云/腾讯云)而非境外,是这条教训的直接应用。

### 第二层 · 声纹注册 —— 把「说话人 2」变成真人名 【真正解决用户抱怨的那一层】

**关键认知:说话人分离 ≠ 说话人识别。**

即使第一层做完、DER 很低,拿到的也只是「说话人 1/2/3」——**匿名编号,不是人名**。用户说的「发言人不准确」,很大概率一半是聚类错、一半是**名字对不上**。当前系统里唯一能拿到真人名的机制是人工校正(而且只对 `parsed` 稳定,见缺陷 1)。

腾讯云在分离之外还提供 **带声纹的话者分离 + `VoicePrintEnroll`(说话人注册)**:每个人注册一条声纹 → 得到 SpeakerId → 分离时把每个语音片段与候选声纹比对,超阈值落到真人名下,匹配不上就不标。**这是腾讯会议自己的做法。**

限制(需实测确认):一个 appid 最多 1000 个说话人 ID;一个 ID 只能注册一条音频(可更新);注册音频 ≤30s、16kHz 单声道。

**这一层与上一轮已落地的「参会人名单」是天然延续**——`meetings.participants` JSON 列和 `RosterEditor` UI 已经在,名单从「给 LLM 猜人用的提示」升级成「带声纹的名册」即可。

**关键的滚雪球设计(这条是本方案里最值得做对的一点):**

> 现有的人工校正 UI 已经在产出「说话人 2 = 张三」这种标注,而原始音频又永久留在 MinIO。**把这两者接起来:第一次会议靠人校正,校正用的那段音频顺手拿去注册张三的声纹;从第二次会议起自动认人。** 声纹库是随使用越长越准的资产,而现状下人工校正反而随重新生成而失效——两相对照,高下立判。

代价:需要一条「采集注册音频」的产品流程(从历史音频里自动截取该人最长的一段、或让用户手动指定),以及一个声纹库的管理界面(注册/更新/删除/试听)。**依赖第一层先落地。**

### 第三层 · 现有链路的补齐 【不依赖换供应商,可立刻做,建议先做】

这一层在**当前架构下**就能显著改善,且全部是低风险改动:

1. **修缺陷 2(20 人截断)**——让 `candidates` 覆盖完整名单。50 个名字的 prompt 开销可以忽略,直接把上限提到与 `_MAX_PARTICIPANTS` 对齐,或让 `_roster_note` 与 `candidates` 用同一个上限。**改动最小、收益最直接。**
2. **修缺陷 1(校正静默失效)**——两条一起做:
   - `with_corrections` / `apply_corrections` 返回**实际命中的校正条数**;命中数为 0 时前端**不得**显示「已人工校正」徽标;
   - 重新生成后把**未命中的 corrections 键**回报给前端,提示「N 条校正因本次归因结果变化已失效,请检查」——**不能静默**(这个项目对「静默失败」已经有明确态度,见 `api/meeting.py:1793-1797` 对未知键 400 的注释)。
3. **修缺陷 3(confidence 反推)**——不要用 coverage 反推 confidence;模型没给有效值时退化成 `low` 或 `unknown`,并把 coverage 作为**独立展示项**而非置信度的代理。
4. **候选名单来源降级提示**——5 个来源里 4 个是 LLM 从同一份转写里抽的二手产物(`collect_speaker_candidates` docstring `insights.py:463-467` 已承认),等于「在自己上一轮的幻觉上再猜一轮」。UI 上应把「本次使用的候选名单」标注出每项来源,让用户看出这份名单有多可信。
5. **校正后的名字回填转写原文**——现状是时长图说「张三 42%」而转写原文仍写「说话人 1」,两个面板对不上(`SpeakerDurationChart` 读 `speaker_stats`,`TranscriptPanel` 裸打印原文)。纯前端展示层映射即可,不改数据。

### 不推荐 · 本地声学分离(sherpa-onnx + 3D-Speaker)

前一轮 `PROJECT_OVERVIEW.md:462` / `task.md:619-622` 已把它列为候选,本轮**建议明确不做**,理由:

- **准确率不占优**:公开实测 DER 约「不指定人数 ~50%、指定正确人数 ~26%」——**26% 的错误率并不比现在的 LLM 推断有明显优势**,却是完全不同的复杂度。
- **内存是本机真正的瓶颈,不是 CPU**:celery 容器 `mem_limit: 2g`、`--concurrency=2`,全机 7.4G **无 swap**,同机跑 11 + 13 个容器。已有先例:`LEARNING.md §22.2` 记过 2.4h 音频解码占 1.6GB → worker `SIGKILL` → 任务丢失不重试、会议卡 `processing`。声学聚类在此之上还要加 embedding 与聚类的常驻内存。
- **CPU 无配额**:全 compose grep `cpus` **零命中**,CPU 是 4 核裸竞争。2 小时会议 ONNX 推理 + 聚类会把 4 核吃满,与同机 ASR、其它 celery 任务抢核。
- **⚠️ 修正一处夸大(2026-09-29)**:网上那份 **RTF ≈1.5 是树莓派 4 上的实测**,服务器单核性能强数倍,**不能外推**——「2 小时会议要跑 3 小时」这个推算不成立,真实耗时必须实测。即便耗时可接受,**内存与「24 个容器抢 4 核」这两条依然成立**,所以结论不变。
- **工程量大**:要接「切片 → 声学 embedding → 聚类 → 对齐到 20s 分片/行区间 → 归一化」整条链,还要与现有 `parsed`/`inferred` 双路径、`raw_speakers`+`corrections` 重放形状、双份 overlay 树三者融合。这是**独立立项**,不是一个迭代能塞进去的。
- **投入产出比明确劣于第一层**:同样解决「没有声学信息」,换云 API 精度更高、不动 Dockerfile/requirements/内存上限,代价只是失去流式进度条 + 数据出网。

## 资源账:这个约束**把方案推向云端,而不是推向缩水**

关键结论:**换云 ASR 是「净减服务器资源」的方案**,不是净增。用户担心的资源限制恰恰是它的论据。

### 现状:每场 2 小时会议,这台机器要扛什么

| 项 | 量 | 说明 |
|---|---|---|
| PCM 常驻内存 | **230 MB** | `7200s × 16000Hz × 2B`。2.4h 的实测值是 276MB(`LEARNING.md §22.2`),与算式吻合 —— 这是 celery worker 在 `mem_limit: 2g` 下的**峰值占用** |
| 切片数 | 360 片 | 2.4h = 433 片 |
| 并发 / 限流 | `Semaphore(8)` + RPM/TPM 双维度令牌桶 | 小米账号硬限 RPM100 / TPM10K |
| base64 膨胀 | 每片 640KB → 877KB(×1.37) | 8 路在飞 ≈ 7MB,是带宽问题不是内存问题 |
| 总请求数 | 360 次 HTTP | 这就是 `soft_time_limit` 从 1800 提到 5400s 的原因 |
| ffmpeg 解码 | 一次全量 | 边解边降采样,流式,但不是免费 |

### 换成云 ASR 之后

| 项 | 变化 |
|---|---|
| PCM 常驻内存 | **−230 MB**(不再解码成 PCM) |
| 下载音频 | 若用 presigned URL 让云端直接拉 MinIO,连下载都省 |
| base64 | 取消 |
| 8 路并发 + 令牌桶 | 取消,改成一次提交 + 轮询 |
| 服务器 CPU | **下降**(ffmpeg 解码 + base64 编码全省) |
| 请求数 | 从 360 次降到 1 次提交 + N 次轻量轮询 |
| 新增 · 网络出网 | 一次性上传 ~100–200MB |
| 新增 · 外部依赖 | 一家国内云厂商(见下方供应商风险) |

**一句话:省内存、省 CPU、省请求数,只多花网络出网。** 代价是产品侧失去流式进度条。

### 声纹库的资源成本(阶段 2)—— 可以做到几乎为零

- 声纹**向量**:192 维 float32 = **768 字节/人**。1000 人 ≈ **0.77 MB**。
- 注册**音频**:30s × 16k × 2B = 960 KB/人。1000 人 ≈ 0.94 GB —— **这个不能长期留**。
- **正确设计:注册音频只用于生成向量,生成后立即删除,库里只留 768 字节。**

服务器成本基本为零,真正的成本在「怎么采集到那 30 秒」。

### 为什么本地方案是**不可行**而不是「成本高」

要同时动三样,而这三样正是本文档边界里明写「本轮不碰」的:

1. **镜像 +100–150MB**(onnxruntime wheel 数十 MB + pyannote-segmentation-3.0 ≈ 6MB + 3D-Speaker ERes2Net ≈ 30–100MB)。现有镜像已 2.26GB,50G 盘要装 24 个容器镜像,且**服务器自己 build**(内网源,7 天 build 缓存)。
2. **`mem_limit` 必须从 2g 调到 3–4g**(推理 + 特征 + 聚类常驻,粗估 500MB–1.5GB,须实测)。这要从 7.4G 里挤,而**全机无 swap**、24 个容器共享 —— 超了不是变慢,是内核 `SIGKILL` 杀进程、任务丢失不重试。
3. **`requirements.txt` / `Dockerfile`** 都要改。

拿一台**无 swap 的 7.4G 机器被推向 OOM 边缘**的风险,去换一个 **DER 26–50%** 的结果。结论:**不做。**

## 分阶段落地(按资源成本从低到高)

### 阶段 0 · 零资源成本,建议立刻做(约 1 天)

第三层的三个缺陷修复。**不动 Dockerfile / requirements.txt / mem_limit,schema 不变,无新依赖,内存零增量。**

- 修 20 人截断(缺陷 2)
- 修校正静默失效:返回实际命中条数 + 未命中的 corrections 键显式提示(缺陷 1)
- confidence 不再从 coverage 反推(缺陷 3)
- 候选名单标注来源;校正后的名字回填转写原文

> 这一阶段在**当前架构下**就能消掉「用户以为改对了、其实静默失效」这类**确定性错误**,与有没有声学能力无关。

### 阶段 0.5 · 零风险探测,先测再定(约半天)

两个只读测量,决定后面怎么走:

1. **`ffprobe` 现有音频的声道分布** —— 如果有可观比例的录音是**双声道且左右声道去相关**(双麦会议麦),那么单声道降混就是白丢的分离信息,改一个 `-ac` 参数就能白捡一部分,**零新增依赖**。没有这个比例的素材就作罢。
2. **实测服务器余量**(内存 / 磁盘 / CPU)—— 这是 `PROJECT_OVERVIEW.md:462` 与本文档已列的开工前检查项,现在正好一次做掉。

### 阶段 1 · 资源净下降(约 1 周)

换带 diarization 的国内云 ASR(阿里云 Fun-ASR / 腾讯云录音文件识别),整段提交、全局聚类。

- **资源账见上表:净减。**
- 前置确认:**会议录音出网到第三方的合规问题** —— 这条可能直接否掉整个阶段 1。
- 产品确认:接受放弃流式进度条(可退化为「转写中 + 已用时长」的粗粒度表达,零额外成本)。
- 工程:双份 overlay 树同步改;下游 `raw_transcript` 格式、`parsed` 正则、`speaker_stats`、前端徽标语义一并调整。

### 阶段 2 · 资源增量 ≈ 0(1–2 周)

声纹注册,把匿名编号变成人名。依赖阶段 1。

- 服务器成本:只存向量的库(1000 人 < 1MB)。
- 成本在**产品流程**:那 30 秒注册音频怎么来。
- 滚雪球设计:阶段 0 的校正 UI 已在产出标注、音频又永久留存 → 第一次靠人校正,顺手注册声纹,第二次起自动认人。

## 成本 / 收益对照

| 方案 | 改动面 | 新增依赖 | 准确率提升 | 风险 |
|---|---|---|---|---|
| 第三层 补齐 | 小(单模块 + 前端展示) | 无 | 中(修正「改对了却静默失效」「名单被封杀」这类确定性错误) | 低 |
| 第一层 换云 ASR | 中(ASR 模块重写 + 下游格式) | 新供应商账号/key | **大**(首次真正拿到声学说话人信息) | 中:进度条回退、音频出网合规、供应商可用性 |
| 第二层 声纹注册 | 中大(新增声纹库 + UI + 采集流程) | 依赖第一层 | **最大**(匿名编号 → 真人名) | 中:注册音频采集流程 |
| 本地声学分离 | 大(独立立项) | onnxruntime + 模型文件 | 小到中(DER 26-50%) | 高:内存/CPU/镜像体积/国内网络 |

## 待用户决策

1. **阶段 0 开工吗?** 零资源成本、零新依赖,且「校正静默失效」是当前的实质缺陷(用户以为改对了,其实没生效)。**建议立刻做。**
2. **阶段 0.5 的两个探测做吗?** 都是只读测量,零风险,且结论会改变阶段 1 的做法。
3. **阶段 1 的供应商选阿里云还是腾讯云?** 决定因素是注册流程 / 计费 / 是否已有账号;以及**是否接受会议录音出网到第三方**——这条必须先确认,它可能直接否掉整个阶段 1。
4. **是否接受放弃流式进度条?** 原生说话人分离要求整段提交,现有 `done_chunks` 增量进度会消失。
5. **阶段 2 的注册音频怎么采集?** 从历史音频自动截取 / 用户手动指定 / 现场录 30 秒——这是产品流程决策。

## 边界

- 本轮只出方案,**未改任何代码**。
- 不做本地声学分离(理由见上),**不碰** `Dockerfile` / `requirements.txt` / `mem_limit`。
- 阶段 0 若开工:不改 API 形状、不引入新依赖、双份树同步改、schema 不变。
- 阶段 0.5 只做只读测量,不改配置。
- 阶段 1 若开工,`mem_limit` **只减不增**(PCM 缓冲省下 230MB),不借机扩内存。

---

# 轮次:会议纪要详情页 UI 评审修复(2026-09-29)

## 背景

用户要求「从 UI/UX 角度给会议纪要详情页(`/console/meeting/:id`)提优化建议」,
产出了一份 26 条发现的评审(交付物:`C:/Users/zzz/Downloads/会议纪要详情页-UI评审.html`)。
用户确认后转入修复。本段记录修复范围。

## 关键前提(决定了改法,别再搞错)

- **生产跑的是 legacy 页**,不是 redesign。`IS_NEW_UI` = `hostname === 'uat.tokenwave.cloud' || ?ui=new`,
  但 uat 2026-07-14 已下线,所以走 `ConsoleMeetingDetail.tsx`(legacy)。
- **redesign 壳不是重写** —— `redesign/console/ConsoleMeetingDetail.tsx` 第 25-30 行把
  **所有 tab 内容组件都从 legacy 文件 import**。所以「换皮 + 换骨架」,
  改共用组件两个壳同时受益;只有 tab 切换外壳需要改两处。
- 所以本轮的修法:**共用组件改一次,外壳各改一次**。

## 边界

- 只改 `frontend/src/pages/console/ConsoleMeetingDetail.tsx` 与
  `frontend/src/redesign/console/ConsoleMeetingDetail.tsx`。
- 不动后端、不动 API 形状、不引入新依赖。
- 全局 token(`--text-muted` / `--accent`)的改动**不在本轮** —— 它影响全站,
  需要单独决策,见下面「待用户决策」。

## Block F-1:磨平「看起来存上了、其实没存」的坑 [已完成]

用户可见的最高频故障模式。两条:

- [x] **轮询冲掉草稿**(P0)
      `MinutesTab` 原来是 `useEffect(() => { setDraft(m) }, [meeting.id, meeting.meeting_minutes])`。
      会议还在 `recording`/`processing` 时详情页每 5 秒 refetch 一次,每次返回**新对象** →
      依赖变化 → 把用户正在输入的内容覆盖掉,且无提示无报错。
      改法:编辑态跳过同步(`if (editing) return`),草稿不再被服务端值冲掉。
- [x] **22 个 mutation 失败静默**(P0)
      本文件 30 个 mutation 里 22 个只有 `onSuccess`。失败时:无 toast、无内联错误、
      编辑态仍开着、按钮回到可点状态 —— 现象与「保存成功」**完全一致**。
      改法:抽出 `toastErr(action)`,22 处全部挂上,文案带具体动作
      (`保存纪要` / `保存标题` / `同步到项目` …)。
- [x] **保存按钮不判断有无改动**(P1)
      `disabled` 原来只有 `isPending`。加 `|| !dirty`,并加 `title="没有改动"` 说明为何不可点。
      `Cmd/Ctrl+S` 同样加 `&& dirty` 短路。
- [x] **退出编辑无确认,改动静默丢弃**(P1)
      「取消」按钮与 `Esc` 原来都是 `setDraft(m); setEditing(false)` —— 直接蒸发。
      改法:统一走 `cancelEdit()`,有改动先 `window.confirm`。
      用 `mRef` 取最新 `m`(Esc 的 effect 依赖数组里没有 `m`,闭包会捕获挂载那一刻的值)。
- [x] **切 tab 卸载组件丢草稿**(P1)
      `leftTab` 一切走,`MinutesTab` 卸载,`draft` 直接蒸发。
      改法:子组件通过 `onDirtyChange` 上报「编辑中且有未保存改动」,父级 `guardDirty()`
      包住 `setTopView` / `setLeftTab` / `setRightTab`。**两个壳都改了。**
      其它 tab 不涉及 —— 它们是行内保存(改一行即落库),没有可丢的中间态。
- [x] **关标签页/刷新提醒**(P1)
      `beforeunload` 监听,只在 `unsaved` 为真时挂,避免平时弹无谓的确认框。
- [x] 新增 `stableKey()` —— 按 key 排序后序列化再比较,否则键顺序不同会误判「有改动」。

**边界说明**:这里复用 `window.confirm`,是为和页面里既有的 4 处确认弹窗保持一致
(1518 / 1530 / 1860 / 2891)。统一换成产品自己的确认框是评审里的独立一条(P3),
不在本轮范围。

**验收**:`npx tsc --noEmit -p tsconfig.json` 退出 0。人工验证项见文末。

## 明确判定为产品决策、本轮不做的

- **P0-4 转写面板:唯一能改转写的 UI 是死代码**(重新核实后的准确描述)
  - **活的**是 `TranscriptPanel`(`ConsoleMeetingDetail.tsx:3177`),legacy 右侧栏渲染它,
    redesign 另有一份等价实现。**两份都是只读** —— 无编辑、无保存;
    redesign 那份多一个「触发 AI 润色」按钮,legacy 那份只显示一句「切换到操作标签可触发」。
  - **死的**是 `TranscriptTab`(同文件 `:691`,约 100 行):带编辑态、`保存转写`、
    `触发 AI 润色`。**legacy 从不渲染它(全文件仅 1 处出现,即定义处);
    redesign 在 `:27` import 了它但全文再无引用。** 两边都是死代码。
  - 后果:**用户没有任何办法手工修正转写文本** —— 说话人识别错、ASR 听错字,只能重跑。
    这也是评审把它列在 P0 的原因。
  - **本轮不接通**,理由:接通它 = 决定「转写可编辑」这个产品能力(谁能改、改了要不要
    留痕、要不要和 `corrected_speakers` 那套人工校正合并),不是实现细节。
    评审原话即「接通它,**或**明确判定为产品决策并记录」—— 现在按后半句执行:记录在案。
  - 附带说明:本轮给它内部的 `saveMut` / `polishMut` 也加了 `toastErr`
    (`保存转写` / `触发 AI 润色`)。在死代码里加不影响行为,但将来接通时就已经是对的。

## 待用户决策

- **全局 token 改动**(评审 P2/P3):
  - `--text-muted: #9CA3AF` 在白底上 2.54:1,**不达 AA**。调深会影响全站所有弱化文案。
  - `--accent: #FF8D1A` 当作**文字色**用时白底 2.31:1(不达),深色底 7.58:1(达)。
    同一个 token 无法同时服务两种底色 —— 需要拆出「accent 背景色」与「accent 文字色」两个 token。
  - 这两条是**全站级**改动,不是详情页局部。建议单独排一轮,配全局视觉走查。

## Block F-2:AI 润色 tab 的排版 [已完成]

- [x] **`prose` 是死类,润色正文渲染成无格式纯文本**
      全仓没装 `@tailwindcss/typography`(`package.json` 无该依赖),
      `tailwind.config.js:104` 是 `plugins: []` —— `prose` / `prose-sm` /
      `prose-p:my-1.5` 这些类**一个字节的 CSS 都不会生成**。
      而 `redesign.css:1065` 的 `.rd-root .prose {...}` **只定义颜色,不定义排版**;
      legacy 侧连颜色都没有。
      同时 Tailwind preflight 把 h1-h6 字号字重重置成 `inherit`、`ul/ol` 的
      `list-style` 和缩进去掉、块级 margin 归零。
      两者叠加 → **标题和正文一样大、列表没有项目符号、段落之间没有间距**。
      这条在**生产上是活的**(legacy 壳 `TranscriptPanel` 渲染的就是它)。
  - 改法:新增 `MD_BODY_CLS`(`ConsoleMeetingDetail.tsx`,导出后 redesign 复用),
    按 `CitedReportView.tsx:19` 的 arbitrary descendant 写法手写排版,零新依赖。
  - **只放排版不放颜色** —— 因为 `.rd-root` 不重定义 `--text-primary` 等 token
    (实测 redesign.css 里没有),`text-ink` 在深色壳里会解析成浅色主题的 `#1A1D2E`,
    深底深字。深色壳的配色继续由 `.rd-root .prose` 接管,所以元素上保留 `prose` 类名。
    边框一律用 `border-current`(跟随文字色),两种底色都不会错。
  - 元素上仍留 `prose`:给 `redesign.css` 的配色规则用。
  - ⚠️ **踩到的坑**:legacy 的 `TranscriptPanel` 里,同一个 div 既包润色分支(markdown)
    又包原文分支(裸 `<pre>`)。`MD_BODY_CLS` 里的 `[&_pre]:p-3` / `text-[12.5px]`
    权重是 (0,1,1),会盖过那个 `<pre>` 自己的 `p-0 m-0`(0,1,0) ——
    原文会被顶出内边距、字号缩一号。所以类只加在 `tab === 'polished'` 分支上。

**验收**:`npx tsc --noEmit` 退出 0;`npm run build` 成功,并已从产物
`dist/assets/index-*.css` 里核对生成的规则确实存在且选择器正确
(`.\[\&_li\>ul\]\:my-1 li>ul{margin-top:.25rem;…}`、`.\[\&_h1\:first-child\]\:mt-0 h1:first-child{margin-top:0}`
等)—— 光看源码看不出 Tailwind 有没有生成。

## Block F-3:滚动体系(魔数 360)[已完成]

- [x] **`maxHeight: calc(100vh - 360px)` 这个魔数**
      360 是「页头 + 元信息 + tab 栏 + 播放器」在某个状态下的实测高度。问题是这些块
      **随状态出现**:没录音就没有播放器(实际 ~300)、有录音再加一百多(实际 ~420)、
      `processing` 时还多一条进度条。写死的后果:
      - 没播放器 → 面板底边离视口底差一截,下方一块死白
      - 有播放器 → 面板底边被顶出视口,**页面和面板同时出滚动条**(矮窗口下最明显)
  - 改法:新增 `usePanelMaxHeight(deps)`(`ConsoleMeetingDetail.tsx` 导出,redesign 复用),
    实测 `视口高度 − 面板在文档里的绝对顶边 − 24`。
  - **用绝对坐标 `rect.top + scrollY` 而不是 `rect.top`** —— 后者随滚动位置变化,
    用户一滚面板高度就跟着变,会抖。
  - `deps` 由调用方传「会让面板顶边位移的状态」(视图、有没有播放器、进度条),
    这些值变化时重量一次。
  - 首帧返回 `undefined`,调用方用**原来的** `calc(100vh - 360px)` 兜底,量完再换实测值,
    避免首帧跳动 —— 即渐进增强,最坏情况退回原行为。
- [x] **`minHeight: 480` / `minHeight: 220` 会把卡片顶出视口**
      CSS 里 `min-height` **盖过** `max-height`,所以矮窗口下这个下限直接造成溢出。
      改成 `Math.min(480, paneMaxH)`(面板同理 220)。
- [x] 左右两栏共用同一个实测值,底边对齐。
- [x] 两处 hook 调用都在组件所有 early return **之前**(legacy `:3006` vs 早退 `:3010`;
      redesign `:125` vs 早退 `:129`)—— 放在早退之后是 hooks 数量变化,只在运行时炸,
      `tsc` 查不出来,所以专门核了一遍。

**验收**:`npx tsc --noEmit` 退出 0;`npm run build` 成功;两份产物的 CSS hash 未变
(内联 style 不进 CSS,符合预期),JS 里能查到新钩子。

## Block F-4:待办象限的键盘 / 触屏通路 [已完成]

- [x] **改象限过去只能靠鼠标拖拽,触屏和键盘用户完全做不到**
      两条路都断了:
      - HTML5 拖拽在**触屏浏览器上根本不触发**(规范如此,不是 bug)
      - 「移出」按钮是 `hidden … group-hover:inline`,即 `display:none` 到 hover 才现形;
        而 **`display:none` 的元素不可聚焦** → 键盘 tab 也够不到
  - 改法:chip 上加一个**原生 `<select>`**,列出 4 个象限 + 「未分类」。
    原生控件意味着键盘可聚焦、触屏能唤起系统选择器,**零新依赖**。
    拖拽保留,只是不再是唯一通路。
  - 于是「移出」按钮被下拉框的「未分类」选项取代 —— **同时改了底部那句还在教用户
    「点 chip 上的『移出』」的说明文案**,否则就是死引用。
  - `select` 加 `onDragStart={e => e.preventDefault()}` —— 否则从 select 上起手
    会被外层 `draggable` 抢成拖拽。
  - 顺手把 `grouped` 里的分区判断抽成 `zoneOf()`,和下拉框的当前值用同一个函数,
    免得两处判断不一致(原来那处是 `t.quadrant in map`,对陌生值的行为和下拉框不同)。

**验收**:`npx tsc --noEmit` 退出 0;`npm run build` 成功。

## 字号收敛:量完之后**建议不做**(等用户拍板)

评审里写的是「6 档字号收成 3 档」。真正数了一遍(legacy + redesign,含 Tailwind 类、
任意值、内联 style):

| 值 | 处数 | 实际用途 |
|---|---|---|
| 10px | 10 | chip 角标 |
| 11px | 40 | **`uppercase tracking-wider` 小节眉标** |
| 12px | 67 | 元信息、按钮 |
| 12.5px | 15 | **表格单元格** |
| 13px | 25 | **输入框 / textarea** |
| 14px(`text-sm`) | 63 | 正文 |
| 15/16/20px | 3 | 标题 |

**是 9 档,不是 6 档;而且这些档位是承重的,不是漂移** —— 眉标 11、
表格 12.5、输入框 13 是三类不同的东西,强行并成 3 档会把它们压平,
是**设计回退**而不是修复。而这是纯视觉改动、约 230 处、且我**看不到渲染结果**,
盲改一个生产页面的观感风险不划算。

**唯一真正冗余的是 12 ↔ 12.5(差 0.5px,肉眼不可辨)**,但为它改 82 处
换来的只是少一个 token,性价比也低。

→ 结论:**不做**。如果要做,建议先把尺度定成 token 写进 `tailwind.config.js`、
并在一屏内能同时看到眉标/表格/输入框的页面上走查一遍再动。

## 部署记录

- `3b7456f`(Block F-1)+ `eb4a3dc`(Block F-2)→ 2026-09-29 手动触发 `deploy-prod.yml`,
  run `36515028344`,**success**(Build & deploy on server 2m27s)。
- **产物核对**(不只看 workflow 绿):
  - `https://kb.sharewb.cloud/assets/index-DPFUg3to.css` 的 hash 与本地 `npm run build`
    产物**完全一致** —— 说明上线的是我本地验证过的那份构建。
  - 已从线上 JS 里查到本轮新增的字符串:`纪要还有未保存的改动,切走会丢失`、
    `有未保存的改动,确定放弃吗?`、`没有改动`,以及 `toastErr` 的 action 参数
    (`保存纪要` / `同步到项目` / `提取业务流程` / `删除干系人` …)。
    注意:`保存纪要失败` 这种**查不到是对的** —— 文案是 `` `${action}失败` `` 拼出来的。
  - 已从线上 CSS 里查到 `MD_BODY_CLS` 生成的规则(`li>ul`、`h1:first-child`、
    `list-style-type:disc`、`border-current`)。
  - 后端存活:`/api/auth/me` → 401(未带 token,符合预期)。
- `ca80cc6`(Block F-3 + F-4)→ 2026-09-29 手动触发 `deploy-prod.yml`,
  run `36524271543`,**success**(4m30s)。
  - **教训:不要拿 CSS hash 相等当「部署的就是我这份构建」的充分证据**。
    这次 CSS hash 仍与本地一致(`index-BtsKB29F.css`),但 **JS hash 不一致**
    (线上 `index-CoiMMoDA.js` vs 本地 `index-BRBJdgiW.js`);清空 `dist` 重建后
    本地仍是 `BRBJdgiW`,说明两边的构建产物本来就非逐字节一致(服务器在 Docker 里 build)。
    上一轮我只对上了 CSS 就写了「完全一致」,那个结论比实际证据强。
    **真正充分的证据是从线上 JS 里查到本轮新增的字符串**:
    `移动到哪个象限`(下拉框 aria-label)、`改到其它象限`(title)、
    `或用 chip 右下角的下拉框选`(改过的说明文案)、`Math.max(240`(新的实测钩子)。

## 本轮人工验证清单(部署后,待人工点)

- [ ] 会议处于 `recording`/`processing` 时进入纪要 tab → 点「编辑」→ 连续输入 30 秒
      → 输入内容不被轮询冲掉
- [ ] 断开后端 / 制造 500 → 点保存 → 出现失败 toast(而不是静默)
- [ ] 编辑后有改动 → 点另一个 tab → 弹确认框;选「取消」留在原 tab
- [ ] 编辑后有改动 → 直接关标签页 → 浏览器弹离开确认
- [ ] 未做任何改动 → 保存按钮为 disabled,`Cmd+S` 无反应
- [ ] 以上在 `?ui=new` 下同样成立(两个壳)

Block F-2 / F-3 / F-4:

- [ ] AI 润色 tab:标题明显大于正文、列表有项目符号、段落之间有间距
      (**改之前是整段无格式纯文本**)
- [ ] 原文 tab 的字号和内边距**没有**被 F-2 改动(这是我差点引入的回归点)
- [ ] 有录音的会议 → 面板底边不超出视口,页面**只有一层**滚动条
- [ ] 无录音的会议 → 面板下方没有多余的空白
- [ ] 把窗口拖到很矮(如 600px 高)→ 仍然只有面板内部滚动,页面不出现第二条滚动条
- [ ] 洞察 tab 的待办象限:**只用键盘** Tab 到 chip 上的下拉框 → 选另一个象限 → 待办真的移过去了
- [ ] 手机上打开洞察 tab → 点下拉框能唤起系统选择器并改象限
- [ ] 把某条待办选成「未分类」→ 它回到未分类区,且「重新分类」能再判它

---

# 轮次:会议模块迭代第二轮 — 去解释图 / 对比可选会议 / 洞察布局 / 参会人名单

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
