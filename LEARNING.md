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

## 6. 待修 / 待复查

> 发现但本轮没修的小问题。后续做相关任务时顺手修。

- [skills_seed.py:137](backend/services/agentic/skills_seed.py:137) "Challenger 7 维度 rubric" 名字 + prompt 仍写 7 维(实际 6 维,timeliness 已下线)。下次动 skills_seed 时改名 + 改内容
- [output_service.py:_get_brief_block](backend/services/output_service.py) 历史 bug:`kind='kickoff_html'` 时找不到 brief(brief 入库归一成 kickoff_pptx,但读取没归一)。本次 v3 重构没修
- ApiDocs / DesignSystem 里很多文案是手写的,与代码同步靠 grep + audit;可考虑写一个 build 时校验 script(可选,投入产出比一般)
