"""原子化 Skill 种子定义 — 把方法论 / 风格 / 规则 / rubric 拆成最小可复用单元。

启动时 idempotent seed 到 skills 表(name 已存在则跳过,不覆盖运营手动改动)。
运营在 /system-config「技能库」编辑后,通过 agent_config.skill_ids 关联到具体 output
kind,生成时 _get_skill_snippets 会把启用的 skill 拼到 prompt 末尾。

设计原则:
- 每条 skill 是**独立的最小单元**,不带 stage / kind 特定约束
- skill 之间可自由组合:不同 output kind 选不同 skill 子集
- name 用中文(运营友好),全局唯一
"""
import structlog

logger = structlog.get_logger()

# 旧英文 name → 中文 name 迁移映射(防止 DB 里残留两套记录)
# seed_atomic_skills 启动时先按这个 map 改 name,UUID 不变所以
# agent_config.skill_ids 关联不会断
LEGACY_NAME_MIGRATIONS: dict[str, str] = {
    "output-style-mbb":                  "MBB 输出风格",
    "output-anti-patterns-jargon":       "禁用黑话清单",
    "output-chinese-only":               "强制中文输出",
    "citation-d-k-w-format":             "D/K/W 引用 ID 规则",
    "output-json-strict":                "严格 JSON 输出契约",
    "output-no-h1-h2-titles":            "禁止 LLM 输出 H1/H2 标题",
    "output-markdown-table-conventions": "Markdown 表格规范",
    "critic-rubric-sopact-4d":           "Critic 4 维度 rubric",
    "challenger-rubric-7d":              "Challenger 7 维度 rubric",
    "survey-question-types-v1":          "调研问卷 6 题型规范",
    "ltc-process-skeleton":              "LTC 流程骨架",
    "info-gap-handling":                 "信息缺失处理规则",
}


ATOMIC_SKILLS: list[dict] = [
    # ── 风格类(全局通用)─────────────────────────────────────
    {
        "name": "MBB 输出风格",
        "description": "金字塔原理 + 表格优先 + 克制语气",
        "prompt_snippet": """- MBB 风格(McKinsey/BCG/Bain),金字塔原理:**先抛结论,后给证据**
- 表格优先于 bullet — 多个并列项首选 markdown 表格
- 段落控制在 2-3 句,避免大段密文
- 克制语气 — 不写"我们认为/相信/坚信",只陈述事实和判断
- 关键概念用 **粗体** 强调,但不滥用""",
    },
    {
        "name": "禁用黑话清单",
        "description": "MBB 禁用黑话 + 替换建议",
        "prompt_snippet": """**禁用以下黑话**(立刻替换为具体动作):
- 赋能 → 帮助 / 提供
- 抓手 → 切入点 / 杠杆
- 闭环 → 端到端
- 链路 → 流程 / 链路
- 生态 → 协作网络
- 数字化转型 → 具体的数字化项目(如"上 CRM"/"OA 升级")
- 一站式 → 统一平台

写到这些词时,自检:能否用更具体的动作 / 工具 / 流程描述替换?""",
    },
    {
        "name": "强制中文输出",
        "description": "强制中文输出 + 英文术语对照表",
        "prompt_snippet": """**必须用简体中文**输出。常见英文术语强制替换:
- Specificity → 具体性
- Evidence → 证据
- Timeliness → 时效性
- Next Step → 下一步
- Owner → 责任人
- deadline → 截止日期
- completeness → 完整性
- consistency → 一致性
- jargon → 黑话

例外:KB / 访谈 / Brief / Web 引用 ID(D1, K1, W1)保留原格式不翻译。""",
    },
    # ── 引用规则 ─────────────────────────────────────────
    {
        "name": "D/K/W 引用 ID 规则",
        "description": "[D1][K1][W1] 引用 ID 格式约定",
        "prompt_snippet": """**每个事实陈述末尾必须用 ID 引用**,格式:
- "陕西分公司 12/15 出现 2 次商机审批超时 [D2][K3]"
- "行业典型周期 6-9 个月 [W1]"

ID 含义:
- [D1][D2]... = 项目上传文档(SOW / 集成方案 / 合同 / 交接单等)
- [K1][K2]... = 知识库切片(跨项目沉淀)
- [W1][W2]... = Web 检索结果(行业报告 / 公开数据)

**禁止**:
- 自创 [^1] [^2] 数字 footnote
- 写 "[访谈]" "[KB]" "[Brief]" 这种泛化标签 — 必须用具体 ID
- 合并写法 "[K1K3]" — 必须分开 [K1] [K3]
- 编造 ID(只能用 prompt 里 evidence_block 列出的 ID)""",
    },
    # ── 输出格式约束 ─────────────────────────────────────
    {
        "name": "严格 JSON 输出契约",
        "description": "双引号 / 无尾逗号 / 无注释 / 无围栏",
        "prompt_snippet": """JSON 输出严格规则:
1. 所有 key 用 **双引号** "key",不能用单引号
2. 所有 string value 用 **双引号** "value",不能用单引号
3. value 里有引号要用 \\" 转义
4. 最后一个元素后**不加逗号**(JSON 不支持尾随逗号)
5. **不写注释**(// 或 /* */ 都不支持)
6. 没有数据时输出 [] 或 {} 而不是省略字段
7. 第一个字符必须是 { 或 [,最后一个字符必须是 } 或 ]
8. **不要包 markdown 代码围栏**(``` 或 ```json)""",
    },
    {
        "name": "禁止 LLM 输出 H1/H2 标题",
        "description": "系统会自动注入章节标题",
        "prompt_snippet": """**禁止输出 H1 / H2 章节标题**(系统会自动注入模块标题)。
- ❌ 不要写 `# 执行摘要` 或 `## 执行摘要`
- ✅ 直接写正文内容

H3 (`###`) 及以下标题可正常使用,作为模块内部分节。""",
    },
    # ── Critic / Challenger rubric(评审类)─────────────
    {
        "name": "Critic 4 维度 rubric",
        "description": "Sopact 单模块四要素打分标准",
        "prompt_snippet": """**Sopact 四要素打分**(0-4 分,Critic 单模块评审用):

- **Specificity 具体性**:主语 / 对象 / 条件是否明确
  (不是"系统不稳定"而是"陕西分公司 12/15 出现 2 次商机审批超时")
- **Evidence 证据**:数据点是否有 [D1][K1][W1] 标注?**编造或来源不明 = 0 分**
- **Timeliness 时效性**:结论现在还能影响项目结果?(避免事后诸葛亮)
- **Next Step 下一步**:每条结论配责任人 + 截止日期?(不是"加强沟通"这种空话)

阈值:
- Specificity ≥ 3 通过 / Evidence ≥ 3 通过 / Next Step ≥ 3 通过 / Timeliness ≥ 2 通过
- 任一未通过 → overall = "needs_rework"
- 全通过 → "pass"
- 内容明显残缺(<200 字 或 全是占位符) → "insufficient" """,
    },
    {
        "name": "Challenger 7 维度 rubric",
        "description": "整文对抗式审核标准 — 包含一致性 / 完整性 / 黑话",
        "prompt_snippet": """**Challenger 7 维度**(整文挑战用,找问题导向):

1. specificity 具体性
2. evidence 证据
3. timeliness 时效性
4. next_step 下一步
5. **completeness 完整性**:是否覆盖关键场景 / 干系人 / 风险
6. **consistency 一致性**:模块之间是否自相矛盾(如 M3 健康度 RAG=red,但 M1 摘要写"整体健康")
7. **jargon 黑话**:有无 MBB 黑话(参考 output-anti-patterns-jargon)

verdict 判定:
- pass:0 blocker + 0 major + ≤ 2 minor
- minor_issues:0 blocker + 0-2 major + 任意 minor
- major_issues:任何 blocker 或 ≥ 3 major""",
    },
    # ── 调研问卷设计 ──────────────────────────────────
    {
        "name": "调研问卷 6 题型规范",
        "description": "single/multi/rating/number/text/node_pick 六题型 + 顾问勾选式录入",
        "prompt_snippet": """**调研问卷 6 题型**(顾问拿大纲口头问 + 系统选择题录入):
- 60% **single 单选** / **multi 多选** — 选项池预填,必含「其他(请说明)」+「不适用」
- 15% **rating 分级** — 1-5 量表 / RAG 三色
- 10% **number 数值** — 带单位提示("天" / "万元" / "%")
- 10% **text 短文本** — 顾问速记
- 5% **node_pick 流程节点勾选** — 用 LTC 字典 standard_nodes 预置选项

设计要点:
- 选项池**穷举度决定整个问卷成败**,顾问不能现场打字
- 每题颗粒度具体到可作答(不是"贵司销售流程如何?")
- 单分卷题量控制 8-15 题,5-10 分钟可填完""",
    },
    {
        "name": "LTC 流程骨架",
        "description": "华为 LTC 端到端 — 8 主流程 + 5 横向支撑域",
        "prompt_snippet": """**LTC(Lead-to-Cash)标准流程骨架**:

主流程(端到端):
- M01 线索管理 → M02 商机管理 → M03 报价投标 → M04 合同管理 → M05 订单管理 → M06 履约交付 → M07 应收回款 → M08 售后服务

横向支撑域:
- S01 客户管理 / S02 产品管理 / S03 渠道管理 / S04 市场活动 / S05 集成-数据-权限

调研 / 蓝图 / 实施时:
- 每个客户的 SOW 模块名先归一到这套骨架(同义词归一)
- SOW 中超出骨架的客户自定义模块,作为 "extra_modules" 单独跟踪
- 每个模块都有标准节点序列(如 M02 商机管理:商机创建 → 阶段推进 → 决策链分析 → ...)""",
    },
    # ── 信息缺失处理 ──────────────────────────────────
    {
        "name": "信息缺失处理规则",
        "description": "不编造 / 标记缺口 / 引导补访",
        "prompt_snippet": """信息缺口处理规则:
- 缺数据时**绝不编造** — 写"信息缺失,建议在 Phase 1 第一周补访"或"待客户提供"
- 缺来源时**绝不裸输出无引用的事实** — 没素材支撑就别写
- 推断性结论必须显式标注"基于行业典型 / 推断"或 [W1] 等来源
- 对关键缺口给出**具体获取动作**(如"建议向 XX 部门确认 / 上传 XX 文档")""",
    },
    # ── 表格规范 ─────────────────────────────────────
    {
        "name": "Markdown 表格规范",
        "description": "列数 / 列宽 / 引用标注 / 数值列对齐",
        "prompt_snippet": """Markdown 表格规范:
- 列标题用粗体或保持简短(不超过 6 个字)
- 列数控制在 3-7 列(超过 7 列考虑改用 bullet / 嵌套)
- 单元格内容尽量简短,长描述放表格后正文
- **每行末尾**或**关键单元格**末尾标 [D1][K1] 引用 ID
- 不要在表格 cell 里嵌套表格(MD 不支持)
- 数值列右对齐(用 `--:` 标记)""",
    },
]


async def seed_atomic_skills() -> dict:
    """idempotent seed 原子 skills 到 skills 表。

    流程:
    1. 先按 LEGACY_NAME_MIGRATIONS 把旧英文 name 改成中文 name(UUID 不变,
       agent_config.skill_ids 关联保持有效)
    2. 然后按 ATOMIC_SKILLS 列表 seed:已存在的中文 name 跳过,缺失的插入

    返回 {"inserted": N, "skipped": N, "renamed": N, "total": N}。
    """
    from sqlalchemy import select
    from models import async_session_maker
    from models.skill import Skill

    inserted = 0
    skipped = 0
    renamed = 0

    async with async_session_maker() as s:
        # ── 1. 旧英文 name → 中文 name 迁移 ──
        existing_rows = (await s.execute(select(Skill))).scalars().all()
        existing_by_name = {r.name: r for r in existing_rows}
        for old_name, new_name in LEGACY_NAME_MIGRATIONS.items():
            old_row = existing_by_name.get(old_name)
            new_row = existing_by_name.get(new_name)
            if old_row and not new_row:
                # 旧 name 存在,新 name 不存在 → 改名(保留 UUID)
                old_row.name = new_name
                renamed += 1
            elif old_row and new_row:
                # 都存在(异常,可能历史脏数据)→ 删旧的,保留新的
                # agent_config.skill_ids 引用的是 ID,如果引用了旧 ID 这里会断
                # 但实际上 LEGACY_NAME_MIGRATIONS 是单次迁移,正常不会有此分支
                logger.warning("atomic_skills_legacy_dup",
                               old=old_name, new=new_name,
                               old_id=old_row.id, new_id=new_row.id)
        if renamed > 0:
            await s.commit()

        # ── 2. seed 缺失的 skill ──
        existing_rows = (await s.execute(select(Skill.name))).scalars().all()
        existing_names = set(existing_rows)
        for sd in ATOMIC_SKILLS:
            if sd["name"] in existing_names:
                skipped += 1
                continue
            s.add(Skill(
                name=sd["name"],
                description=sd["description"],
                prompt_snippet=sd["prompt_snippet"],
            ))
            inserted += 1
        if inserted > 0:
            await s.commit()

    return {"inserted": inserted, "skipped": skipped,
            "renamed": renamed, "total": len(ATOMIC_SKILLS)}


# ── 每个 output kind 默认应该启用的 atomic skill name 列表 ─────────────────
# 反映"当前硬编码 prompt 已经隐含的方法论",首次部署时 idempotent 写入
# agent_config.skill_ids;运营手动配过的(skill_ids 非空)不覆盖
#
# 注意:critic-rubric-sopact-4d / challenger-rubric-7d 不进任何 kind 的 skill_ids,
# 因为它们是 critic.py / challenger.py 内部 system prompt 的内容,跟 output_agent
# 的 skill_ids 不是同一注入点
KIND_TO_ATOMIC_SKILLS: dict[str, list[str]] = {
    "insight_v2": [
        "MBB 输出风格",
        "禁用黑话清单",
        "强制中文输出",
        "D/K/W 引用 ID 规则",
        "禁止 LLM 输出 H1/H2 标题",
        "Markdown 表格规范",
        "信息缺失处理规则",
    ],
    "survey_outline_v2": [
        "MBB 输出风格",
        "禁用黑话清单",
        "强制中文输出",
        "D/K/W 引用 ID 规则",
        "禁止 LLM 输出 H1/H2 标题",
        "Markdown 表格规范",
        "LTC 流程骨架",
        "信息缺失处理规则",
    ],
    "survey_v2": [
        "强制中文输出",
        "调研问卷 6 题型规范",
        "严格 JSON 输出契约",
        "Markdown 表格规范",
        "LTC 流程骨架",
        "禁用黑话清单",
        "信息缺失处理规则",
    ],
}


async def seed_default_skill_associations() -> dict:
    """对 v3 三个 output kind 配置默认 skill_ids 关联,反映"已用方法论"。

    规则(idempotent):
    - agent_config(output_agent, kind) 不存在 → 创建,skill_ids = 默认列表
    - 已存在但 skill_ids 为空 → 填默认列表
    - 已存在且 skill_ids 非空 → **不动**(尊重运营手动配置)

    返回 {"created": N, "updated_empty": N, "kept": N, "skipped_no_skill": N}
    """
    from sqlalchemy import select
    from sqlalchemy.orm.attributes import flag_modified
    from models import async_session_maker
    from models.skill import Skill
    from models.agent_config import AgentConfig

    async with async_session_maker() as s:
        rows = (await s.execute(select(Skill))).scalars().all()
    skill_name_to_id = {r.name: r.id for r in rows}

    counts = {"created": 0, "updated_empty": 0, "kept": 0, "skipped_no_skill": 0}

    async with async_session_maker() as s:
        for kind, skill_names in KIND_TO_ATOMIC_SKILLS.items():
            wanted_ids = [skill_name_to_id[n] for n in skill_names if n in skill_name_to_id]
            if not wanted_ids:
                counts["skipped_no_skill"] += 1
                continue

            row = (await s.execute(
                select(AgentConfig).where(
                    AgentConfig.config_type == "output_agent",
                    AgentConfig.config_key == kind,
                )
            )).scalar_one_or_none()

            if row is None:
                s.add(AgentConfig(
                    config_type="output_agent",
                    config_key=kind,
                    config_value={"prompt": "", "skill_ids": wanted_ids, "model": None},
                    description=f"Output agent for {kind}(atomic skills auto-seeded)",
                ))
                counts["created"] += 1
                continue

            cv = dict(row.config_value or {})
            existing_skill_ids = cv.get("skill_ids") or []
            if not existing_skill_ids:
                cv["skill_ids"] = wanted_ids
                cv.setdefault("prompt", "")
                cv.setdefault("model", None)
                row.config_value = cv
                flag_modified(row, "config_value")
                counts["updated_empty"] += 1
            else:
                counts["kept"] += 1
        await s.commit()
    return counts
