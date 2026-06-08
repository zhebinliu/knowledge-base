# 工作经验沉淀

> 每次开 session 先扫一眼。新踩坑 / 新结论 → 往这里追加。
> 内容按"踩坑场景 → 真因 → 此后做法"组织，不写"应该这样做"的空话。

## 1. DB 迁移脚本(高风险)

### 1.1 表名 ≠ Python 类名

- `class AgentConfig` 的 `__tablename__ = "agent_configs"`(复数带 s)
- `class CuratedBundle` → `curated_bundles`
- `class ProjectBrief` → `project_briefs`
- `class OutputConversation` → `output_conversations`
- 命名规则:`snake_case + s`,**不要从类名硬猜**

**做法**:写迁移脚本前先 `grep "__tablename__" models/`,把所有要碰的表名在脚本顶部 docstring 里列一遍。

### 1.2 列名 — 同一概念在不同表名字不同

| 表 | 存 kind 的列 |
|----|-------------|
| `curated_bundles` | `kind` |
| `project_briefs` | `output_kind` |
| `output_conversations` | `kind`(**不是** output_kind) |
| `agent_configs` | `config_key` |

历史原因:早期 `output_conversations` 用 `kind`,后建的 `project_briefs` 改了 `output_kind` 想表达"这是 output 的 kind",但旧表没 backfill 过。

**做法**:写 SQL 前对每张表 `grep "Mapped\|mapped_column" models/<table>.py` 确认列名。

### 1.3 UniqueConstraint + 启动 auto-seed = 必撞冲突

场景:`agent_configs` 上有 `UniqueConstraint(config_type, config_key)`。`main.py` 启动时 `seed_default_skill_associations()` 会按新 kind 名创建占位行;然后迁移脚本 `UPDATE config_key='insight_v2' → 'insight'` 会撞已存在的 `(output_agent, 'insight')` 行。

**做法**:涉及 UniqueConstraint 的迁移用 **MERGE 模式**:

```python
# 先 SELECT old 和 new
# - old 不存在 → skip
# - new 不存在 → 直接 UPDATE 改 key
# - 都存在 → 把 old 的 config_value 覆盖 new(运营手改值优先),然后 DELETE old
```

NOT 直接 UPDATE — 直接 UPDATE 会 IntegrityError 整个事务回滚。

### 1.4 SQLAlchemy `text("...IN :x").bindparams(x=tuple)` 不展开

- 错的:`text("WHERE k IN :kinds").bindparams(kinds=("a","b"))` → runtime 报 syntax error 或 expanding 错误
- 对的两选一:
  - 硬编码:`text("WHERE k IN ('a','b')")`(类型固定时最简)
  - 显式 expanding:`text("WHERE k IN :kinds").bindparams(bindparam("kinds", expanding=True))` 然后 execute 时 `{"kinds": ["a","b"]}`

**做法**:迁移脚本里如果 IN 列表是固定字面量,**直接硬编码到 SQL 字符串**,省掉绑定坑。

### 1.5 AST / tsc 检查不出 SQL bug

- AST 只验语法,不知 SQL 列存不存在
- tsc 只验类型,不跑代码
- 迁移脚本要么:① 在测试库 dry-run,② 让 sub-agent 对照 model 文件审查
- **永远不要"看上去对就直接跑生产"**

### 1.6 "auto-seed 先 / migration 后"的部署窗口

**问题**:新代码启动会按新 kind 名 seed,但 DB 数据(旧 `_v2` 后缀)还没 migrate。中间窗口里:
- 用户 v2 brief / v2 bundle 数据对新代码不可见
- 看起来像数据丢失(其实没丢,只是名字没归一)

**做法**:
- 部署 + 迁移要绑定执行,部署完立即跑 `docker exec ... python -m scripts.migrate_v3_rename`
- 或迁移先于代码部署(老代码兼容老 kind 名,先把数据归一,再上新代码)— 但这要求迁移脚本本身在老镜像里就有

KB-System 实践:同一个 ssh 命令里 build + up + sleep 15 + exec migrate。

---

## 2. 大块代码删除 / 重命名

### 2.1 Edit 工具半状态陷阱

场景:想删一个 200 行的 Python 函数,函数里有 f-string + 三引号字符串。Edit 只替换函数头那行,会让剩下的代码被未关闭的字符串吞掉,产生半状态。

**做法**:
- 大块删除用 **完整 old_string 包住整个块**(从开头到结束),一次 Edit 删干净
- 或读完整块用 Write 重写整个文件
- 不要分多次 Edit 渐进式删减
- AST 解析能验证有无半状态

### 2.2 跨文件 sed 替换顺序

替换 `_v2` 时:

```bash
# 顺序错了会自相吞噬
sed -e 's/survey_v2/survey/' -e 's/survey_outline_v2/survey_outline/'  # ✗ 第一步把 survey_outline_v2 → survey_outline_v2(没变,但 survey_v2 部分被吞)
```

**做法**:**长的具体串先替**。订单:`survey_outline_v2` → `generate_outline_v2` → `survey_v2` → `insight_v2` → `_v2`。

### 2.3 shell `for` 循环里别用变量传文件列表

错的:

```bash
files="a.py b.py c.py"
for f in $files; do sed ... $f; done   # 在某些 shell 里 $files 不展开,for 只迭代一次拿全字符串
```

对的:

```bash
for f in a.py b.py c.py; do sed ... "$f"; done
# 或
files=(a.py b.py c.py)
for f in "${files[@]}"; do sed ... "$f"; done
```

### 2.4 重命名后必扫的兜底关键词

清理 `_v2` 时,sed 漏的地方:
- 注释里的 `agentic v2` / `旁路验证版本` / `v2 (agentic)` 等措辞
- 用户可见 label `(新版)` `(旧版)` `新版 · 内测`
- 类型 / 函数名前缀 `V2GapPrompt` `V2ValidityBanner` `InsightV3Workspace`
- 对应 DB metadata 字段值 `agentic_version: 'v2'`(这个**保留**,是真实数据库标记,不是 UX 文案)

**做法**:批量 sed 后 grep:
```bash
grep -rn "新版\|旧版\|v2 (agentic)\|V2[A-Z]\|V[1-9]Workspace\|旁路验证"
```

---

## 3. 文档准确性

### 3.1 别从记忆写描述

我写 DesignSystem.tsx 的"V3 组件清单"时,从印象写了:
- `CenterWorkspace`: "5 种 view 形态" → 实际 6 种
- `GenerationProgressCard`: "critic" 阶段 → 代码里叫 `critiquing`
- `FloatingChat`: "复用 OutputChatPanel" → 实际嵌的是 `FloatingQA`
- `Help.tsx` 里 M5/M6/M9 模块名 → 全错位

**做法**:写文档前先 `grep` 源码确认数字 / 名字 / 引用关系。**不要相信记忆,记忆比 LLM 编造更危险**。

### 3.2 API 文档 path 要对照 router prefix + decorator

写 ApiDocs.tsx 的 workspace section 时,我猜了 `/api/projects/{id}/virtual-artifacts` 这种"看上去合理"的 path。实际是 `/api/virtual/{vkey}`,因为 `main.py: include_router(virtual_artifacts.router, prefix="/api/virtual")` 加 `@router.get("/{vkey}")`。

**做法**:写 API 文档前必须看两个文件:
1. `backend/main.py` 找 `include_router` 的 `prefix=`
2. `backend/api/<module>.py` 找 `@router.get/post/...` 的 path
拼起来才是真实路径。

### 3.3 Sub-agent audit 必须给具体 check items

模糊的"审一下我的改动" → 报告就模糊
具体的"逐条核对这 10 个 endpoint 是否在后端真实存在" → 报告就具体

**做法**:发 audit task 时,
- 列出需要验证的具体 claim(每条 ≤ 1 行)
- 给具体文件路径
- 要求每条 OK / 致命 / 一般 三档归类

---

## 4. Sub-agent 使用

### 4.1 验证 "0 references" 报告

第一轮 Block 3.1,Explore agent 报告 `_demo_diagrams.tsx` 是孤儿。我差点 rm 掉。其实 `SurveyDemo.tsx` / `InsightDemo.tsx` 都从它 import 共享图示组件 — agent 漏看了下划线前缀文件的 import。

**做法**:对"建议删除"类报告,**自己再 grep 一遍**才能动手。下划线前缀 `_xxx.tsx` 在前端常作 "shared internal" 约定,不是 draft。

### 4.2 检查 CI / cron / Dockerfile 再 "archive"

Block 3.1 第一轮想把 `scripts/init_*.py` 移到 `legacy/`。其实 `.github/workflows/deploy.yml` 在 CI 里跑 `python scripts/init_db.py` / `init_qdrant.py` / `init_minio.py`。归档了 CI 就挂。

**做法**:动 scripts/ 目录前 grep:
```bash
grep -rn "scripts/<file>" .github/ Dockerfile docker-compose.yml *.sh CHANGELOG.md
```
有命中的不能动。

---

## 5. KB-System 项目专有约定(2026-05 起)

### 5.1 v3 命名归一

- 旧:`insight` / `survey` / `kickoff_pptx` / `kickoff_html` 是对话式生成
- 中:加了 `insight_v2` / `survey_v2` / `survey_outline_v2` 走 agentic 规则化生成
- 现(2026-05-02 起):
  - 删了对话式 `insight` / `survey`(对话式只剩 `kickoff_pptx` / `kickoff_html`)
  - `_v2` 全去后缀。代码 / DB / API 现在都用 `insight` / `survey` / `survey_outline`,这三个就是 v3。
  - 用户感知层:不再有"新版 / 旧版"心智

### 5.2 三套 kind 列表必须同步

任何一个改了,另两个都要改:
- `backend/api/outputs.py:KIND_TO_TASK` / `KIND_TITLES`
- `backend/api/stage_flow.py:ALLOWED_KINDS` / `kind_titles`
- `frontend/src/api/client.ts:OutputKind`

加新 kind 时 grep 这三处都改。

### 5.3 `agentic_version` 字段保留

DB 里 `bundle.extra.agentic_version='v2'` 是 **agentic 生成器架构版本** 的内部标记,**不是用户可见的产品版本号**。
- 所有 `agentic_version === 'v2'` 的代码逻辑保留(GapFiller 触发条件等)
- 这个 'v2' 字面量不要批量改成 'v3' / 删除

### 5.4 项目洞察走文档驱动,不走切片召回

CLAUDE.md 已记录:`backend/services/agentic/executor.py` 的 `_build_sources_index` 默认 `max_chars_per_doc=30000`,文档喂全文。原因:SOW / 方案 / 合同这类核心文档不能漏关键条款。

### 5.5 Critic 4 维 / Challenger 6 维

- Critic(单模块):Specificity / Evidence / Timeliness / Next Step,任一 < 3 → needs_rework
- Challenger(整文,2026-04 已下线 timeliness 改 6 维):specificity / evidence / next_step / completeness / consistency / jargon
- skills_seed.py 里的 "Challenger 7 维度 rubric" name 是历史遗留,prompt_snippet 也写 7 维。下次动 skills_seed 时一并修(commit `7ba8629` 已改代码)

### 5.6 部署节奏

CLAUDE.md 的部署流程是 rsync + docker rebuild。涉及 DB 迁移时:

```bash
ssh ... "cd /opt/kb-system && \
  sudo docker compose build backend frontend && \
  sudo docker compose up -d backend frontend && \
  sleep 15 && \
  sudo docker exec kb-system-backend-1 python -m scripts.<migrate_xxx> --dry-run
"
# dry-run OK 后再去掉 --dry-run 跑真迁移
```

`sleep 15` 是给 backend 启动 + auto-seed 留时间。

### 5.7 复杂任务 task.md / 多 Block 流程

CLAUDE.md 已规定:≥2 个独立需求点 → 先在 task.md 拆任务清单。但本次工作量较大时另一个有用模式:

- **Block 化分阶段** + **每个 Block 完了让 sub-agent audit** + **修问题再 next**
- audit 找出过 3 个致命问题(列名错 / 唯一约束撞 / IN tuple 不展开),tsc / AST 都检查不出 — 迁移脚本必须 audit
- 单 Block 改 21+ 个文件时必须自动化(sed 批量),手工逐个 Edit 会漏

---

## 6. 部署相关坑(2026-05 实录)

### 6.1 GCP 服务器磁盘 9.7G 偏小,部署时容易满

- 现象:rsync 中途 `io_read_blocking` `child exited with status 11` — 真因是远端磁盘 100%。
- 占大头的是 docker(`/var/lib/containerd` ~4-5G + build cache ~1.5G 重建后又涨)。
- 处理顺序:
  1. `docker builder prune -af` 释放 build cache(每次构建后都涨,要常清)
  2. `docker image prune -af` 删悬空 images
  3. `journalctl --vacuum-time=1d` 删归档日志(本次清出 240M)
  4. `truncate -s 0 /var/log/google-cloud-ops-agent/**/*.log*`(本次 630M)
  5. `truncate /var/log/syslog /var/log/kern.log /var/log/auth.log` 单文件大日志
  6. `apt-get clean` 清 apt cache
- 部署前先 `df -h /` 看一眼,< 1.5G 必须先清才能跑构建。

### 6.2 docker compose build 在 image export 阶段需要 ~2G 临时空间

`exporting layers` 阶段会写到 `/var/lib/containerd/tmpmounts/` — 即使源 image / 目标 image 都很小,中间 buffer 也要 2GB。Build 在最后一步挂掉 `no space left on device` 是这个原因,跟代码无关。

### 6.3 backend 容器是 image bake,/app 不是 bind mount

改后端代码后,**rsync 到 /opt/kb-system 不会进入运行中的容器**。要么:
- 重新 `docker compose build backend && up -d backend`(慢,每次 60-120s + 占盘)
- 或一次性脚本可以 `docker cp <host_path> kb-system-backend-1:/app/<dest>`(快,免重建)

迁移脚本这种用一次的,docker cp 更合算。常驻代码改动必须 build。

### 6.4 SQLAlchemy `text(":v::jsonb")` 不识别参数

写 PG 风格 cast `:v::jsonb`,SQLAlchemy text() 解析器把 `::` 当 cast 而忽略 `:v`,运行时 `ArgumentError: this text() construct doesn't define a bound parameter named 'v'`。

**做法**:用标准 SQL `CAST(:v AS jsonb)` 代替 `:v::jsonb`。

### 6.5 asyncpg 默认推断 string bindparam 为 VARCHAR

写 jsonb 列时,直接 `:v` 绑 `json.dumps(...)` 字符串 → asyncpg 推 VARCHAR → PG 报 `column "config_value" is of type json but expression is of type character varying`。

**做法**:JSON / JSONB 列写入用 `CAST(:v AS jsonb)`。

### 6.6 dry-run 漏掉的 bug 类型

我的迁移脚本 dry-run 通过,但真跑时 #6.4 #6.5 立即炸。原因:dry-run 的 `if not dry_run` 把 UPDATE 语句完全 skip,只走 SELECT 和 SQL 字符串拼接 — JSON cast 错误得真 execute UPDATE 才能触发。

**做法**:dry-run 模式应改成"开 transaction → 真 execute → 强制 rollback",而不是"skip writes"。这样 SQL 类型错误 dry-run 也能暴露。

### 6.7 React error #310 真因排查 — useEffect 错位 vs Tiptap immediatelyRender

**症状**:进项目详情页就报 React minified error #310
("Rendered more hooks than during the previous render"),页面渲染整个崩。

**真因(2026-05 实录)**:`ConsoleProjectDetail.tsx` 的 useEffect 写在 early return 之后:

```tsx
if (!id) return null              // early return
if (isLoading) return <Loader/>    // ← 首次 render 命中,直接返回
if (!project) return <NotFound/>
if (STAGES.length === 0) return <X/>

useEffect(() => {...}, [...])     // ← 第一次 render 跳过,第二次 render 才执行
```

第一次 render(isLoading=true)只调到 N 个 hook;第二次 render(数据加载完)
走到 useEffect,调到 N+1 个 hook。React 看到本次 hook 数比上次多 → 报 #310。

**误判路径**:第一次见 #310 时,正好刚做完 Tiptap WYSIWYG 编辑器,
误以为是 Tiptap useEditor 的 immediatelyRender 引发的同步 setState。
设了 `immediatelyRender: false` 后还报 — 才意识到方向错了。
看用户截图 URL 才发现:**用户根本没碰编辑器,进项目页就崩**,跟 Tiptap 无关。

**做法**:
1. **所有 hook 必须在所有 early return 之前调用** — 这是 React Rules of Hooks
   第一条铁律。useEffect / useQuery / useState / useMutation 全要遵守。
2. derived state(基于 hook 数据计算的中间变量)如果 useEffect 依赖它们,
   也要提到 early return 之前算好。
3. **排查 #310 时先看自己代码 hook 位置**,别先怀疑第三方库。
   eslint-plugin-react-hooks 的 `react-hooks/rules-of-hooks` 规则能静态发现这种 bug,
   下次配 lint 把这条加进去强制。

**附带,关于 Tiptap**:`immediatelyRender: false` 仍然推荐(React 18 SSR / strict mode 兼容),
但跟 #310 没关系。本次保留这个配置,无害。

### 6.8 Python module 路径 `python -m scripts.xxx` 要求 scripts/ 有 __init__.py

KB-System backend/scripts/ 已有 __init__.py(空文件),所以 `python -m scripts.migrate_v3_rename` 工作。新加脚本目录时记得带 `__init__.py`。

### 6.9 seed 函数对已存在 row 不会更新 description / prompt_snippet

`skills_seed.py:seed_atomic_skills` 的 phase 2 是"已存在 name → skip 跳过"。改 skill 的内容(description / prompt_snippet)而**不改 name**时,seed 不会同步进 DB,只能手动 SQL UPDATE。

**做法**:改 skill 内容后,要么:
1. 顺便改 name(让 seed 检测为"新 skill"插入新行 — 但旧行变孤儿)
2. 直接在生产跑 SQL UPDATE
3. 改 seed 加"如果存在则比对内容,差异时 update"逻辑(更彻底,但要小心覆盖运营手改值)

KB-System 实测:2026-05 把 Challenger 7 维 → 6 维改名 + 内容,name 通过 LEGACY_NAME_MIGRATIONS 自动改了,但 description / prompt_snippet 旧 7 维内容残留,要手动 UPDATE。

### 6.10 纯文档改动已配置不触发 CI(2026-05)

`.github/workflows/deploy.yml` 加了 `paths-ignore`,以下文件改动**不**触发 CI:
- LEARNING.md / PROJECT_OVERVIEW.md / CLAUDE.md / CHANGELOG.md / task.md
- backend/services/agentic/skills_roadmap.md
- .gitignore

理由:这些是纯人类阅读文档,跟生产代码无关,没必要跑 test + build + image push + deploy 全流程(每次 ~3 分钟 + ~1GB 磁盘开销)。

**注**:`backend/prompts/**.md` 和 `frontend/public/ds.md` 不在 ignore 列表 — 它们是 LLM 提示词 / 给 AI 读的设计文档,改了影响生产,**必须**触发 deploy。

需要新增"不触发 CI"的文档时,直接在 `paths-ignore` 列表加文件名。混合 commit(文档+代码同 push)仍会触发 — paths-ignore 的语义是"全部文件都在 ignore 列表才跳过"。

### 6.11 SQL heredoc 嵌套 ssh+docker exec 容易丢字符

```bash
# 这种容易因 shell 转义吃掉换行 / 引号:
ssh ... "sudo docker exec ... psql ... <<'SQL'
UPDATE ... E'多行 prompt';
SQL
"
```

**做法**:写复杂 SQL 时,改用 Python 脚本 + sqlalchemy 的 `text(...).bindparams(...)`。bindparam 自动处理 escaping,避免 shell 转义层叠。模板:

```bash
ssh ... "sudo docker exec backend python -c \"
import asyncio
from sqlalchemy import text
from models import async_session_maker
async def f():
    async with async_session_maker() as s:
        await s.execute(text('UPDATE ... SET ... = :v WHERE id = :i').bindparams(v=..., i=...))
        await s.commit()
asyncio.run(f())
\"
"
```

---

## 7. 中文化原则(2026-05 起)

### 9.1 系统语言:全中文

所有用户可见 UI 文案、页面标题、按钮、错误提示、状态标签 **必须用中文**。新页面 / 新组件不要直接写英文 label。

### 9.2 保留原文的技术术语清单

下列保留英文/原形,不强制翻译:
- 技术协议:API / JWT / SQL / SSL / TLS / HTTP / JSON / XML / YAML / CSV
- 模型 / 框架:LLM / RAG / MCP / Celery / Redis / Qdrant / PostgreSQL / FastAPI
- 架构概念:UI / UX / SOW / RAID / SMART / RACI / LTC
- 文件格式:HTML / PPT / PPTX / PDF / DOCX / MD
- 公司专名:MBB(McKinsey/BCG/Bain) / SaaS / B2B / B2C
- 引用 ID:[D1] / [K1] / [W1](格式约定)
- 代码标识符:函数名 / 变量名 / 类型名 / table 名(改语言会破坏代码)

### 9.3 sed 批量改 JSX 文本时的坑

错的:
```bash
sed -i '' 's|>Layer<|>层|g' file.tsx   # 把 >Layer< 改成 >层(没<),后面闭合标签丢了
```

对的:
```bash
sed -i '' 's|>Layer</|>层</|g' file.tsx   # 保留 </
# 或更安全:用整段精确匹配
sed -i '' 's|<span>Layer</span>|<span>层</span>|g' file.tsx
```

**做法**:每次跨文件 sed 改 JSX 后必跑 `tsc --noEmit` 验证闭合。本次 6 处文件被 sed 模式漏 `<` 破坏过。

### 9.4 状态字段不要直接展示英文枚举值

代码内部 status 字段值用英文枚举(`done` / `inflight` / `locked`)是 OK 的(易于代码处理),但**展示给用户时必须映射为中文 label**:
- done → 已完成
- inflight → 进行中
- locked → 锁定
- idle → 待开始 / 当前

不要把 `<span>{status}</span>` 直接渲染。前端各 status 标签查表对照,/ds 页有标准对照。

---

## 8. 项目摘要

详见 [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) — 架构 / 数据流 / 关键文件 / 决策清单的全景图,首次进项目先读一遍可以省掉重读全代码的成本。

---

## 9. 待修 / 待复查

> 发现但本轮没修的小问题。后续做相关任务时顺手修。

- [skills_seed.py:137](backend/services/agentic/skills_seed.py:137) "Challenger 7 维度 rubric" 名字 + prompt 仍写 7 维(实际 6 维,timeliness 已下线)。下次动 skills_seed 时改名 + 改内容
- [output_service.py:_get_brief_block](backend/services/output_service.py) 历史 bug:`kind='kickoff_html'` 时找不到 brief(brief 入库归一成 kickoff_pptx,但读取没归一)。本次 v3 重构没修
- ApiDocs / DesignSystem 里很多文案是手写的,与代码同步靠 grep + audit;可考虑写一个 build 时校验 script(可选,投入产出比一般)

---

## 10. 生产 readiness 改造经验(2026-05-12)

### 10.1 鉴权审查模板:"匿名能调么 + 写操作校 write 不是 read"

审查每个路由文件时两条铁律:
1. **router 创建即决定 baseline**:`APIRouter()` 等于全部公开。最低门槛 `APIRouter(dependencies=[Depends(get_current_user)])`,管理类直接 `require_admin`。
2. **写操作必须 write,不能复用 read**:即使有 `assert_project_access(..., "read")` 看似"做了校验",但 PUT / PATCH / DELETE 等写操作要校 `write`。read-only 协作者可以看 = 不等于可以改。

历史漏洞:`outputs.py:561,594` 一直写 `"read"`,read-only 协作者把团队报告改了我都不知道。

### 10.2 CORS + credentials 的经典坑

`allow_origins=["*"]` + `allow_credentials=True` 是错误组合。浏览器实际拒绝 `*` + credentials,但同时也意味着**任意 origin 都能带 Authorization header 跨域请求**(走 axios fetch,不靠 cookie)。固定列出所有合法 origin 才安全。

### 10.3 启动校验 secret 必须随机

`JWT_SECRET_KEY` 默认值是 `change-me-...`,看着像占位但 .env 漏配就跑默认密钥 = 任何人能伪造任意用户 token(签名密钥是公知的)。`backend/main.py` 启动时 raise:`if settings.jwt_secret_key.startswith("change-me"): raise RuntimeError(...)`。

副作用:**部署前必须确认 prod .env 已改**,否则 backend 启动失败。这是 feature 不是 bug。

### 10.4 SlowAPI 限流走 nginx 转发要看真实 IP

默认 `get_remote_address` 在 nginx 反代后看到的全是 127.0.0.1,所有请求并到同一限流桶,限流形同虚设。改用自定义 `_real_client_ip` 优先取 `X-Forwarded-For` 首段,见 `services/rate_limit.py`。

### 10.5 LLM 调用别只重试 429

LLM 供应商抖动场景很多:超时(`httpx.TimeoutException`)/ 连接错误(`ConnectError` / `ReadError`)/ 5xx(供应商内部错)都需要重试。只重试 429 会让所有非 429 错误立即冒到 Celery 走 5 次 retry × 180s 超时 = 单文档最坏卡 15 分钟。

### 10.6 Celery task 必设 time_limit

`@celery_app.task` 默认无超时。LLM 卡死可吃满 worker 槽位(`--concurrency=2` 只 2 个槽),2 个卡死任务 = 全站生成停摆。所有 task 加 `soft_time_limit` / `time_limit`。具体值看任务性质,LLM 生成类用 900/1200s。

### 10.7 备份 / 回滚 / 监控不是"以后再说"

- **数据备份**:`scripts/backup.sh` Postgres + MinIO + Qdrant 三件套,目标 GCS bucket,7 天保留(用 GCS lifecycle 而不是脚本 prune,简单)
- **部署回滚**:镜像标签用 `sha-xxxxxxx` 不用 `:latest`,服务器保留 `.last-good-sha`,健康检查失败自动回滚
- **可观测**:`X-Request-ID` middleware 把 nginx → backend → celery 串起来,Sentry 用 `SENTRY_DSN` 空判断开关(零成本可选)
- **SSL 续期**:`renew-ssl.sh` 加 healthchecks.io ping + 证书剩余 < 7 天 webhook 告警(沉默故障最致命)

### 10.8 延后但要记着的 P1(架构改动,单独立项)

| 项 | 工作量 | 风险 |
|----|------|------|
| JWT HttpOnly cookie 改造 | 1-2 天 | 改前端所有 axios + 后端 token 取处,容易漏 |
| JWT `jti` + Redis 黑名单 revocation | 0.5 天 | 改 verify_token 解码后查黑名单 |
| Alembic 接入 + 替代 `create_all + ALTER` | 1 天 | 基线 autogenerate 不一定对齐 prod schema,需要 dry-run |
| `pptx_codeexec` 独立沙箱容器 | 0.5 天 | 新加 docker service,跨容器调用 |
| MCP key sha256 / feishu_app_secret 加密 | 0.5 天 | 涉及现有用户 MCP key 数据迁移(老用户要重新生成) |

每项都不"复杂",但**改动面广 + 影响在线用户**,所以本轮不动,单独 PR 推进。

---

## 11. 会议模块切片 ASR + 在线编辑 + 跨会议改名同步(2026-05-12)

### 11.1 长音频走切片并发,不要走 inline 一把传

mimo-v2-omni 的 chat.completions `input_audio` 字段是 base64 inline,**单次请求**对体积非常敏感。20 MB mp3 → base64 27 MB → POST body 上传超 10 分钟(`httpx.WriteTimeout`),不是 ASR 推理慢,**是上传管道撑不住**。

正确姿势(从 meeting-ai 原项目搬):
1. 收完整音频 → `pydub` 转 16 kHz / 16-bit / mono raw PCM(底层走 ffmpeg)
2. 切 20 秒一片(640 KB / 片)
3. 每片 PCM → wave 容器 → base64 → xiaomi `input_audio` chat.completions
4. `asyncio.Semaphore(8)` 并发 8 路,30 min 会议 90 片 → ~110s 全转完
5. 每片完成 `await on_chunk(idx, text)`,调用方按 index 增量写 DB,前端轮 `done_chunks/total_chunks` 出流式

代码在 `services/meeting/asr.py:transcribe_audio` + `services/meeting/audio_utils.py`。pydub 依赖 ffmpeg 系统二进制,`backend/Dockerfile` apt 加。

### 11.2 部署窗口里的 task 会丢

`docker compose recreate celery_worker` 期间,Redis 队列里的 task 如果还没被 worker 拉走,**worker 重启时直接被 ack 掉**(默认 `task_acks_late=False`)。结果:用户上传后状态卡在 `processing`,日志里完全没 `transcribe_meeting received`。

应对:部署后 SSH `docker exec backend python -c "from tasks.meeting_tasks import transcribe_meeting; transcribe_meeting.delay(<id>)"` 手动补提交。长期方案:`task_acks_late=True` + 幂等性。

### 11.3 Celery worker 必须 import 所有 model

`tasks/__init__.py` 只 import 自己定义的 task 不够,SQLAlchemy 跨表 ForeignKey 需要**目标表 metadata 也加载**。否则 commit 时报:

```
NoReferencedTableError: Foreign key 'meetings.project_id' could not find table 'projects'
```

修复:`tasks/__init__.py` 显式 import 全部 model 模块(跟 `main.py` startup 那段保持一致)。

### 11.4 改名同步要扫"自由文本字段"

`stakeholder_map` 改了名,只替换 `attendees / decisions.owner / action_items.owner` 这种结构化字段**不够**——AI 抽取的 `summary` / `key_points.content` / `requirements.description` 里也可能提到名字。`POST /api/meeting/{id}/stakeholders/rename` 扫这些自由文本字段,中英文全字边界识别(`[一-鿿]`)。

项目级 `PATCH /api/projects/{pid}/stakeholders/{sid}` 改名时,跨该 project 所有 meeting 循环调一次该端点。

### 11.5 docx 模板 cell 用 `_set_cell_text` 加 `force_size`

python-docx 直接赋值 `cell.text = "..."` 会清掉所有 paragraph 格式 + 模板预留的空段落不会自动收起,导致新内容被"顶下去"看不见。

正确做法:
1. 删 `cell.paragraphs[1:]` 所有空段(走底层 XML `_element.getparent().remove(_element)`)
2. 清 `p0` 的所有 `run`
3. 用 `p0.add_run(...)` 写第一段,后续 `cell.add_paragraph(...)`
4. 字体格式从 `p0.runs[0].font` 继承

特殊场景:模板某 cell(如「会议主题及内容」)字体本身偏大,继承会导致正文也大。`_set_cell_text` 加 `force_size: Pt | None`,强制覆盖。代码在 `services/meeting/docx_export.py`。

### 11.6 沉淀到项目级的合并策略

`POST /api/projects/{pid}/stakeholders/sync-from-meeting/{mid}`:
- **同名(忽略大小写)** → 合并到现有 record
- **alias 重叠** → 合并(把对方的 name 也加进 alias)
- **不重叠** → 新建
- 数组字段(aliases / key_points / responsibilities)累加去重
- 标量字段(role / organization / contact)空字段才覆盖
- side 当前是 `unknown` 才覆盖
- `source_meeting_ids` 累加 meeting_id

意义:同一个客户的张总在 N 个会议都被识别,沉淀到项目级只会有一条 record,所有别名 / 关键观点合并。

### 11.7 React error #310 — 路由守卫不能放 hooks 前

`Layout.tsx` / `ConsoleLayout.tsx` 加 `<Navigate to=... />` 守卫时,**必须放在所有 hooks 声明之后**。否则两次渲染 hooks 数量不一致,触发 React error #310。

正确:
```tsx
const { user } = useAuth()
const [foo, setFoo] = useState(...)  // 所有 hooks 先声明
useEffect(...)
// ...
// 守卫放在 return 前
if (user && condition) return <Navigate to="/console" replace />
return <NormalRender />
```

## 11. Skill Hub — 独立小站(2026-05-19)

> ⚠️ **业务代码已抽出本仓**,迁至 [zhebinliu/skillhub](https://github.com/zhebinliu/skillhub)。
> 本节记录的部署踩坑对独立仓也适用(都是 GCP / docker / nginx / pydantic v2 的通病)。
> kb-system 这边只剩 nginx 反代 + docker-compose 容器定义。

### 11.1 架构 = 隔离 + 复用基础设施

- 代码完全隔离:`skillhub/backend/`(FastAPI :8001 内网)+ `skillhub/frontend/`(nginx :80 内网)
- 数据隔离:复用 `postgres` 实例,新建 `skillhub` 数据库,独立用户表(`users` / `invite_codes` / `skills` / `quality_reports`)
- 网络复用:主 `frontend`(443 持证)新加 `server_name skillhub.tokenwave.cloud` 块反代到 `skillhub-frontend` + `/api/* → skillhub-backend:8001`
- 文件存储:本地 docker volume `skillhub_data` → `/data/skillhub/{uuid}/...`,不走 MinIO
- 鉴权:管理员邀请码注册(独立 JWT,`SKILLHUB_JWT_SECRET`),不和主系统 user 共享
- 质检 LLM:独立配 `SKILLHUB_LLM_*` 三件套(provider / base_url / api_key / model),不复用主系统 model_router

### 11.2 部署踩的 4 个坑

1. **pydantic-v2 Settings 不能同时 `model_config` + `class Config`**
   - 报错:`"Config" and "model_config" cannot be used together`
   - 真因:旧式 `class Config: env_prefix=...` 在 pydantic-v2 + pydantic-settings 不能跟 SettingsConfigDict 共存
   - 做法:`env_prefix` 也写进 `SettingsConfigDict(env_file=None, extra="ignore", env_prefix="SKILLHUB_")`,删掉 `class Config`

2. **`EmailStr` 需 `pydantic[email]`**
   - 报错:`ImportError: email-validator is not installed`
   - 做法:requirements.txt 里写 `pydantic[email]==2.9.2`(或单独装 email-validator)

3. **GCP 上 docker DNS `ndots:0` → asyncpg 解析失败**
   - 报错:`socket.gaierror: [Errno -2] Name or service not known` 但 `compose run` 单独 ping 又 OK
   - 真因:主 backend 早就为这个加了 `dns_opt: - ndots:5`,新容器忘了加 → 持久容器走老 resolv.conf
   - 做法:`docker-compose.yml` 每个 service 都加 `dns_opt: - ndots:5`

4. **DB 密码含 `@` 把 DSN 切坏**
   - 现象:asyncpg 报 `gaierror`(`@postgres:5432` 里的 `@` 被当 user-host 分隔符,host 解析成 `postgres:5432/skillhub` 整段)
   - 做法:用 `sqlalchemy.URL.create(...)` 显式构造 URL,不要靠字符串拼 DSN

### 11.3 nginx 部署期"证书未签发"问题

证书首次签发前,nginx 配里的 `ssl_certificate /etc/letsencrypt/live/skillhub.tokenwave.cloud/fullchain.pem` 不存在 → nginx 启动失败 → 主 frontend 容器死循环。解决方案:

- HTTPS server 块用 `=== SKILLHUB_HTTPS_START ===` / `=== SKILLHUB_HTTPS_END ===` marker 包起来
- HTTP server 块的 301 段用 `=== SKILLHUB_REDIRECT_START ===` / `END` marker
- 容器 entrypoint(`frontend/entrypoint.sh`)每次启动:
  1. **从模板 `/etc/nginx/templates/default.conf.tpl` 重新 cp 到 `default.conf`**(不能 in-place sed,否则上次裁剪结果不可逆)
  2. 检测 `$SKILLHUB_CERT` 是否存在 → 不存在剥 HTTPS 段;存在则把 redirect 段换成 301
- certbot 签完后 `docker compose restart frontend` → entrypoint 自动启用 HTTPS

### 11.4 公开页 vs 拥有者页权限差

- `/api/skills` / `/api/skills/{id}` / `/api/skills/{id}/file` 公开(只对 `is_published=true` 的 skill)
- 草稿状态 skill 只有 owner / admin 能看
- view_count 累计只在「`is_published` 且 非 owner」访问时 +1
- 上传 / publish toggle / inspect / delete 都校 `owner_id == user.id or user.is_admin`

### 11.5 frontend healthcheck unhealthy(pre-existing,不属于 skillhub)

`docker ps` 主 `kb-system-frontend-1` 长期 `unhealthy`,实际服务可用。原因:healthcheck `wget http://127.0.0.1/health` 走 80 默认 server 被 301 到 HTTPS,wget 跟随后无法验证 127.0.0.1 SSL → 退码 1。**部署前就这样**,不是 skillhub 引入。

### 11.6 抽出独立仓后的部署布局

- 业务代码在 [zhebinliu/skillhub](https://github.com/zhebinliu/skillhub)
- 服务器:`/opt/skillhub` 是新 repo clone,`/opt/kb-system/skillhub` 是 symlink → `/opt/skillhub`
- 主 `docker-compose.yml` 里的 `skillhub-backend` / `skillhub-frontend` 服务定义保留,build context 走 symlink
- 更新 skillhub 业务:`ssh ... 'cd /opt/skillhub && sudo git pull && cd /opt/kb-system && docker compose build skillhub-* && docker compose up -d --force-recreate skillhub-*'`
- nginx 反代配置(`frontend/nginx.prod.conf` 的 skillhub server block) + 容器服务定义 → **还在 kb-system 仓里改**(因为 443 端口由主 frontend 容器持有,反代是基础设施)
- kb-system rsync deploy 时,`/skillhub/` 已在 `.gitignore` 排除,不会覆盖 symlink

### 11.7 Reasoning 模型(MiniMax-M*、DeepSeek-R1、QwQ)输出带 `<think>` 块

OpenAI 兼容接口下,reasoning 模型的 `response.choices[0].message.content` 头部是 `<think>...</think>` 块,后面才是真正答案。

- **场景**:让 LLM 返回严格 JSON 评分,正则切 `{...}` 也不一定能切对(`<think>` 内可能也提到 JSON 结构,切到错位置)
- **做法**:`_safe_json` 前置一步 `re.sub(r"<think>.*?</think>\s*", "", text, flags=re.DOTALL)`
- **超时**:reasoning 模型 thinking 阶段长,默认 90s timeout 不够,改 180s(`SKILLHUB_LLM_TIMEOUT=180`)

### 11.8 双层质检设计(2026-05-19)

参考 [shaozhengmao/skill-quality-checker](https://github.com/shaozhengmao/skill-quality-checker) 5 维静态评分思路:
- **静态层**(5 维 × 20 = 100,纯 Python,秒级):问题-方案匹配度 / 完成度 / 容错性 / Description 精度 / Token 效率。基于硬性规则(YAML / shebang / exec / TODO / try/except 覆盖率 / 触发词 / 泛化词 / SKILL.md 大小)
- **LLM 层**(4 维 × 25 = 100,10-90s):格式合规 / 触发清晰 / 内容质量 / 结构组织。让 LLM 看 SKILL.md 全文 + 文件树 + 其他文本快照,给上下文级别评分
- **综合分** = 静态 40% + LLM 60%(LLM 权重高,因为它能识别内容质量,但静态分能兜底)
- DB 设计:`quality_reports.mode` (static|llm|both) + `static_payload` + `llm_payload` 两个 JSONB 字段独立存,UI 用 tab 切看

---

## 12. Meeting 模块抽 git submodule(2026-05-19)

> ⚠️ **2026-05-25 已回退**:submodule 方案已撤销,`meeting/` 改回普通子目录,合回主仓。下文是当时的设计思路与踩坑记录,**仅供历史参考**。"双仓提交流程""submodule update""init --recursive"这些操作不再适用。**仍然有效的部分**:overlay 布局(12.2)和 Dockerfile 二次 COPY(12.3),这两个架构事实保留,详见 [PROJECT_OVERVIEW § 12](PROJECT_OVERVIEW.md)。

### 12.1 为什么是 submodule 而不是 skillhub 那种 symlink+独立 compose

skillhub 当时是自带 backend/frontend/DB 的**独立服务**,直接两仓 + 服务器 symlink + 独立 compose 服务定义就行。

会议模块**没法这么干**,因为它运行时跟主 backend 紧耦合:
- meetings 表 FK 到 projects 表
- import `models.get_session` / `services.auth` / `services.project_acl`
- Celery 任务挂同一个 worker(`tasks/__init__.py` 里 eager import)
- 前端共享 layout / 路由 / api/client.ts / 主题

所以这次是 **代码归口** 抽出,**运行时仍跟主仓共生**。git submodule 把代码挂回原位置,通过 overlay 让 import 路径完全不变。

### 12.2 overlay 布局:submodule 内目录 = 主仓里的相对路径

ai-meeting 仓的 `from-kb-system` 分支用跟主仓**完全一致**的目录结构:
```
meeting/backend/api/meeting.py        ← 镜像 build 时 COPY 到 /app/api/meeting.py
meeting/backend/services/meeting/...  ← /app/services/meeting/...
meeting/frontend/src/redesign/console/ConsoleMeeting.tsx ← /app/src/redesign/console/...
```

关键诀窍:**Dockerfile 里二次 COPY**:
```dockerfile
COPY backend/ /app/
COPY meeting/backend/ /app/   # overlay 覆盖到同一个 /app/
```
这样 Python `from services.meeting import polish_transcript` / 前端 `import NewConsoleMeeting from "./redesign/console/ConsoleMeeting"` **一行都不用改**。

### 12.3 Docker build context 必须改为仓库根

原来 `docker-compose.yml` 里 `backend.build: ./backend`,build context 是 `backend/`,**看不到** `meeting/` 这个兄弟目录(`COPY ../meeting` 会被 Docker 拒掉,跨 context 严禁)。

必须改成:
```yaml
backend:
  build:
    context: .                    # 仓库根
    dockerfile: backend/Dockerfile
```

副作用:
- 镜像 build 时 docker daemon 扫描整个仓库 → **加根级 `.dockerignore`** 排除 `skillhub/` / `scripts/` / `*.md` / `node_modules` 等,否则 build 慢且镜像大
- 旧的 `backend/.dockerignore` + `frontend/.dockerignore` 在新 context 下不再生效(它们是相对 context 根的),但留着无害

### 12.4 rsync + submodule 同步

sync-dev.sh 不用改 —— `--exclude=.git` 会跳过 `meeting/.git`(submodule 的 gitlink 文件),但 meeting 下的**真实文件**会作为普通文件正常同步。服务器上 `meeting/` 就是一个普通目录,docker COPY 一切正常。

**注意**:`git pull` 之后如果 submodule pointer 变了,本地要手动 `git submodule update`,否则 `meeting/` 还是旧版,然后 rsync 把旧版推上去。**首次 clone 主仓也要 `git submodule update --init --recursive`**。

### 12.5 服务器首次部署 / 升级 submodule

服务器上 `/opt/kb-system/meeting/` 必须有内容。两种情况:
1. **走 rsync(目前的部署方式)**:本地保证 `meeting/` 已 init 了真实文件,rsync 推过去就是普通目录,服务器不需要执行 git submodule 命令
2. **走 git clone(理论上 / GitHub Actions)**:必须 `git clone --recurse-submodules` 或后接 `git submodule update --init --recursive`,否则 `meeting/` 是空目录,docker build 失败

### 12.6 改 meeting 代码的双仓提交流程

```bash
cd meeting           # 进 submodule 工作区
# 改文件
git add . && git commit -m "fix(meeting): xxx" && git push
# 此时 ai-meeting 仓 from-kb-system 分支已经更新

cd ..                # 回到主仓
git add meeting      # 主仓里 meeting 是个 gitlink,这里 add 的是新 commit hash
git commit -m "bump meeting submodule" && git push
```

忘了第二步 → 主仓 CI / 部署还会用老 commit。

### 12.7 仍然留在主仓的 meeting 注册点

submodule 只抽了**业务代码**,把代码**注册到主框架**这件事仍是主仓职责:
- `backend/main.py:8,157,197`(import + include_router + Base.metadata)
- `backend/tasks/__init__.py`(eager import meeting_tasks,LEARNING § 6 ForeignKey 解析失败那个坑还在)
- `frontend/src/App.tsx:30-32,80-82,134-136`(6 处路由 + 旧/新 UI 切换)

这些动了一定要同步改 meeting submodule 的对应文件,反过来 submodule 里改了 router prefix / model tablename 这种,主仓注册点也要跟着改。

**⚠️ DB schema 迁移也是主仓职责** —— submodule 里给 meeting 模型加字段(如 `098c283` 给
`Meeting` 加 `edited_minutes`),`Base.metadata.create_all` **不会** 给已存在的表加列。必须在
`backend/main.py` startup 的迁移 list 里补一行 `ALTER TABLE meetings ADD COLUMN IF NOT EXISTS ...`,
否则生产库缺列,ORM 每次 SELECT 带上新列 → 全表查询 500(`UndefinedColumnError`)。

踩坑实录(2026-05-21):`098c283` 在 submodule 加了 `Meeting.edited_minutes` 但没补主仓迁移,
`/api/meeting` 列表全 500。修复:① 生产库手动 `ALTER TABLE meetings ADD COLUMN IF NOT EXISTS
edited_minutes JSON` ② **必须重启 backend** —— 光加列不够,asyncpg 连接池里的旧连接 / 预编译
语句缓存不会自动感知 DDL,`docker compose restart backend` 后才生效 ③ 把 ALTER 补进 main.py
迁移 list 永久化。

CI 也兜不住这类:`deploy-meeting.yml` 只做前端 tsc 自检,后端 Docker build 不跑 Python,
backend 模型/迁移问题要到服务器 startup 或运行时才暴露。submodule 改后端模型后,主仓迁移
一定要手动跟上。

---

### 12. MiniMax 图像 API 不是 OpenAI 风格(2026-06-06)

【症状】commit `515d824` 引入「会议解释图」feature,prod 日志狂报
`image_gen_failed status=404 'Page not found' url 'api.minimax.chat/v1/images/generations'`,
整条 illustrations 链路 100% 挂掉。

【根因】Claude 写代码时按 OpenAI 风格的肌肉记忆套了 schema,但 MiniMax 自家 API 完全不同:

| 维度 | OpenAI 风格(错) | MiniMax 真实 |
|---|---|---|
| URL | `/v1/images/generations`(复数 + 斜杠) | `/v1/image_generation`(**单数 + 下划线**) |
| 尺寸 | `width: 1792, height: 1024` | `aspect_ratio: "16:9"`(枚举,不是数字) |
| 输出格式 | `response_format` 不传或 b64 | `response_format: "base64"` 或 `"url"` |
| 响应数据 | `data: [{ b64_json, url }]`(数组) | `data: { image_base64: [...], image_urls: [...] }`(对象) |
| 业务错误 | HTTP 4xx 直接抛 | **HTTP 200 也可能失败** —— 看 `base_resp.status_code == 0` 才算成功 |

【确认方式】prod 没接通时用 curl 探一下两个候选 URL 直接比对 HTTP code:
```bash
curl -s -o /dev/null -w 'HTTP %{http_code}\n' -X POST \
  'https://api.minimax.chat/v1/image_generation' -H 'Content-Type: application/json' -d '{}'
# 路径对的话返回 4xx + 业务错误 body,路径错才会 404 "Page not found"
```

【固定教训】调外部 LLM 厂商接口前,**不要 assume OpenAI schema** —— 国产厂商(MiniMax / 智谱 /
通义)即使支持 `/v1/chat/completions` 兼容路径,他们自家的图像 / 语音 / 嵌入接口往往是私有 schema。
docstring 里把 endpoint 路径写全、写明 schema 差异,下次维护就不会再用 OpenAI 直觉改。

修复见 `backend/services/model_router.py::generate_image()`,把 `base_resp.status_code` 业务码
检查也加上,1002/1008/1013 这种限流码走指数退避重试。

【第二层坑】修了 URL/schema 之后实测又撞到 `code=1004 login fail` —— 因为我们的
`settings.minimax_api_key` 实际是 **edgefn 代理的 key**(`sk-xxx` 格式),所有 chat 调用都走
`api.edgefn.net/v1` 由代理转发到 MiniMax,这个 key 不能直接拿去打 `api.minimax.chat`。而 edgefn
代理 **只转发 chat,不转发图像/视频接口**(`/v1/image_generation` 和 `/v1/images/generations`
两条路径都 404)。所以图像必须用 **MiniMax 官方直连 key**(eyJ... JWT,从
https://platform.minimaxi.com 申请),配在独立环境变量 `MINIMAX_NATIVE_API_KEY` 里。

下次接 MiniMax 的视频 / 语音 / TTS 等"非 chat"接口同理 —— 默认用 `minimax_native_api_key`,
不要用 `minimax_api_key`(代理 key)。

【调试方法学】今天踩坑暴露一个反模式:Claude 直接照 OpenAI 文档写,既没确认 endpoint 路径,
也没区分两套 key 的归属。下次新接外部 API,**三件事必须做**:
1. 拿到第一份调用代码后,curl 一发空请求看真实 4xx/404 区分"路径错"还是"鉴权错"
2. 看清楚 `settings.xxx_api_key` 是直连 key 还是代理 key,前缀(sk-/eyJ/Bearer)就是线索
3. 业务错误码独立于 HTTP code,有 `base_resp` / `error_code` 这种字段都得显式检查
