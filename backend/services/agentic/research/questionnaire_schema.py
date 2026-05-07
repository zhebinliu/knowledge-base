"""结构化调研问卷数据契约。

存储位置:`CuratedBundle.extra.questionnaire_items[]`(survey kind 的 bundle)
顾问录入答案存到 `research_response` 表,按 (bundle_id, item_key) 找回。

设计原则:
- 选择题为主(顾问拿大纲口头问 + 系统勾选)
- 单选/多选必含"其他(开放)"+"不适用",避免选项不全
- 范围四分类(scope_label)单独标注,LLM 自动判断 + 顾问可改
"""
from dataclasses import dataclass, field, asdict
from typing import Literal, Any


# 题型 — 与 task.md 对齐
QuestionType = Literal[
    "single",      # 单选(60% 主力题型之一)
    "multi",       # 多选
    "rating",      # 1-5 分级量表 / RAG 三色
    "number",      # 数值/范围(10%)
    "text",        # 短文本(10%,顾问速记)
    "node_pick",   # 流程节点勾选 — 用 LTC standard_nodes 池(5%)
]


# 范围四分类 — 不向受访者问,LLM 综合判断 + 顾问可手改
ScopeLabel = Literal[
    "new",          # 需新建的流程
    "digitize",     # 已有线下流程,需要数字化工具
    "migrate",      # 已有流程,需搬迁
    "out_of_scope", # 不纳入一期
]

ScopeLabelSource = Literal["ai", "manual"]


# 调研阶段 — 区分会前自填问卷 vs 会中深挖问题
QuestionPhase = Literal[
    "pre_meeting",   # 会前发给客户自填(高频闭合题为主)
    "in_meeting",    # 会中由 PM 主导(开放追问 / 节点勾选 / 复杂场景)
]

# 受访角色 — 严格枚举,保证「按角色分卷」正确分组
AudienceRole = Literal[
    "executive",     # 高管 / 决策者
    "dept_head",     # 部门负责人 / 业务主管
    "frontline",     # 一线执行者 / 操作者
    "it",            # IT / 系统管理员
]

# 题目来源 — 用于区分 AI 生成、人工新增、动态追问
QuestionSource = Literal[
    "ai",            # 由 LLM 基于 SOW + LTC 字典生成
    "manual",        # 顾问手动新增
    "follow_up",     # 由「动态追问」根据答案实时生成
]

VALID_AUDIENCE_ROLES = ("executive", "dept_head", "frontline", "it")
AUDIENCE_ROLE_LABELS = {
    "executive": "高管",
    "dept_head": "部门负责人",
    "frontline": "一线",
    "it": "IT",
}

# 老 LTC 字典的 9 种角色 → 严格 4 角色的映射
# (老角色仍保留在 ltc_dictionary 里供其他用途;问卷分卷统一收敛到 4 选)
LEGACY_AUDIENCE_ROLE_MAP: dict[str, str] = {
    "c_level":         "executive",
    "biz_owner":       "dept_head",
    "frontline_sales": "frontline",
    "frontline_ops":   "frontline",
    "service":         "frontline",
    "finance":         "dept_head",
    "channel_mgr":     "dept_head",
    "marketing":       "dept_head",
    "it":              "it",
}


def coerce_audience_roles(roles: list[str] | None) -> list[str]:
    """把任意来源(LLM / LTC 字典)的角色列表收敛到严格 4 角色。
    - 已经合法的直接保留
    - 老角色(c_level / biz_owner ...)走 LEGACY_AUDIENCE_ROLE_MAP
    - 其他完全不识别的丢弃
    - 去重保序
    """
    valid = set(VALID_AUDIENCE_ROLES)
    out: list[str] = []
    seen: set[str] = set()
    for r in (roles or []):
        if not isinstance(r, str):
            continue
        target: str | None = None
        if r in valid:
            target = r
        elif r in LEGACY_AUDIENCE_ROLE_MAP:
            target = LEGACY_AUDIENCE_ROLE_MAP[r]
        if target and target not in seen:
            out.append(target)
            seen.add(target)
    return out


@dataclass
class BestPracticeRef:
    """问题伴随的最佳实践参考 — 比如问「贵司是否有线索管理」时,展示行业内的标准做法。

    title:摘要标题(列表态显示)
    summary:一句话提炼(展开时主体内容)
    source:来自哪里(industry_pack / kb / ltc_dictionary / manual)
    source_id:对应 industry pack 名 / kb chunk_id 等(用于点击跳转)
    """
    title: str
    summary: str = ""
    source: str = "industry_pack"
    source_id: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class OptionItem:
    """单个候选选项。

    value:稳定标识,顾问勾选时存这个(用于跨题统计)
    label:显示文案
    is_other:是否"其他(开放文本)"特殊选项,前端勾选后弹文本框
    is_not_applicable:是否"不适用"特殊选项
    """
    value: str
    label: str
    is_other: bool = False
    is_not_applicable: bool = False

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class QuestionItem:
    """单道题目。

    item_key:稳定唯一标识(例:M02_opportunity::stage_model)
                跨大纲/问卷/答案三处都用这个 key 串联
    ltc_module_key:挂在哪个 LTC 模块下(用于按模块聚合 + 范围分类)
    audience_roles:适用受访者角色(分卷依据)
    type:题型
    question:题干(顾问口头问的内容)
    why:为什么问(给顾问看,不展示给客户)
    options:选项池 — single/multi/node_pick 必填,其他题型为空
    rating_scale:rating 题的最大分(默认 5)
    number_unit:number 题的单位提示(例:"天" / "万元" / "%")
    required:是否必答
    hint:答题提示(显示在题目下方)
    scope_label:LLM 给出的范围四分类建议;顾问可手改
    scope_label_source:ai 或 manual
    sow_evidence:从 SOW 解析得到的关联证据片段,提示顾问追问深度
    kb_refs:KB 二次过滤后注入的高分参考(顾问可剔除)
    phase:会前自填 / 会中深挖(分卷依据,默认 in_meeting 兼容老数据)
    best_practice_refs:伴随该问题展示的最佳实践参考(默认空)
    parent_item_key:动态追问时挂在哪个父问题下(None 表示主干题目)
    source:题目来源(ai/manual/follow_up,默认 ai 兼容老数据)
    """
    item_key: str
    ltc_module_key: str
    audience_roles: list[str]
    type: QuestionType
    question: str
    why: str = ""
    options: list[OptionItem] = field(default_factory=list)
    rating_scale: int = 5
    number_unit: str = ""
    required: bool = False
    hint: str = ""
    scope_label: ScopeLabel | None = None
    scope_label_source: ScopeLabelSource | None = None
    sow_evidence: str = ""
    kb_refs: list[dict] = field(default_factory=list)
    phase: QuestionPhase = "in_meeting"
    best_practice_refs: list[BestPracticeRef] = field(default_factory=list)
    best_practice_advice: str = ""           # AI 综合最佳实践库后,针对本题写的一段贴合建议
    parent_item_key: str | None = None
    source: QuestionSource = "ai"

    def to_dict(self) -> dict:
        d = asdict(self)
        d["options"] = [o.to_dict() if hasattr(o, "to_dict") else o for o in self.options]
        d["best_practice_refs"] = [
            r.to_dict() if hasattr(r, "to_dict") else r for r in self.best_practice_refs
        ]
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "QuestionItem":
        opts_raw = d.get("options") or []
        opts = [OptionItem(**o) if isinstance(o, dict) else o for o in opts_raw]
        bp_raw = d.get("best_practice_refs") or []
        bp_refs = [
            BestPracticeRef(**r) if isinstance(r, dict) else r for r in bp_raw
        ]
        return cls(
            item_key=d["item_key"],
            ltc_module_key=d["ltc_module_key"],
            audience_roles=list(d.get("audience_roles") or []),
            type=d["type"],
            question=d["question"],
            why=d.get("why", ""),
            options=opts,
            rating_scale=int(d.get("rating_scale") or 5),
            number_unit=d.get("number_unit", ""),
            required=bool(d.get("required") or False),
            hint=d.get("hint", ""),
            scope_label=d.get("scope_label"),
            scope_label_source=d.get("scope_label_source"),
            sow_evidence=d.get("sow_evidence", ""),
            kb_refs=list(d.get("kb_refs") or []),
            phase=d.get("phase") or "in_meeting",
            best_practice_refs=bp_refs,
            best_practice_advice=d.get("best_practice_advice") or "",
            parent_item_key=d.get("parent_item_key"),
            source=d.get("source") or "ai",
        )


# ── 构造辅助 ──────────────────────────────────────────────────────────────────

# 每个单选/多选必含的兜底选项(LLM 生成时如果漏了,后处理会补上)
SENTINEL_OTHER = OptionItem(value="__other__", label="其他(请说明)", is_other=True)
SENTINEL_NA = OptionItem(value="__na__", label="不适用", is_not_applicable=True)


def ensure_sentinels(options: list[OptionItem]) -> list[OptionItem]:
    """单选/多选必带"其他"和"不适用"兜底 — LLM 生成不全时用。"""
    if not options:
        return [SENTINEL_OTHER, SENTINEL_NA]
    has_other = any(o.is_other for o in options)
    has_na = any(o.is_not_applicable for o in options)
    out = list(options)
    if not has_other:
        out.append(SENTINEL_OTHER)
    if not has_na:
        out.append(SENTINEL_NA)
    return out


def make_item_key(ltc_module_key: str, sub_key: str) -> str:
    """统一构造 item_key 格式 — 跨大纲/问卷/答案/分类全局复用。"""
    return f"{ltc_module_key}::{sub_key}"


# ── 答案值的弱类型校验 ────────────────────────────────────────────────────────

def validate_answer(item: QuestionItem, value: Any) -> tuple[bool, str]:
    """返回 (is_valid, error_msg)。前端写入前/后端持久化前调用。

    弱校验:不阻断顾问录入,只在明显错误时返回提示。
    """
    if value is None or value == "":
        if item.required:
            return False, "必答题不能为空"
        return True, ""

    t = item.type
    if t == "single":
        if not isinstance(value, str):
            return False, "单选答案必须是字符串"
        valid_values = {o.value for o in item.options}
        if value not in valid_values and not value.startswith("__other__:"):
            return False, f"选项 {value} 不在候选中"
    elif t == "multi":
        if not isinstance(value, list):
            return False, "多选答案必须是数组"
    elif t == "rating":
        try:
            n = int(value)
        except (TypeError, ValueError):
            return False, "分级答案必须是整数"
        if not (1 <= n <= item.rating_scale):
            return False, f"分级范围 1-{item.rating_scale}"
    elif t == "number":
        try:
            float(value)
        except (TypeError, ValueError):
            return False, "数值题必须是数字"
    elif t == "node_pick":
        if not isinstance(value, list):
            return False, "节点勾选答案必须是数组"
    return True, ""
