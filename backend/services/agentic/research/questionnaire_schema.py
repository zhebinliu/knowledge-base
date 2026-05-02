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

    def to_dict(self) -> dict:
        d = asdict(self)
        d["options"] = [o.to_dict() if hasattr(o, "to_dict") else o for o in self.options]
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "QuestionItem":
        opts_raw = d.get("options") or []
        opts = [OptionItem(**o) if isinstance(o, dict) else o for o in opts_raw]
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
