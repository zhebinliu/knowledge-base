"""sharedev skill 包加载工具(2026-05-29)。

skill 包结构(镜像自 sharecrm-skills-kit-1.0.0-rc.2.zip,解压到 backend/prompts/sharedev/):

  backend/prompts/sharedev/
  ├── skills/
  │   ├── sharedev-object/
  │   │   ├── SKILL.md            # frontmatter + 主体方法论
  │   │   ├── references/         # 细粒度规范(field-spec.md 等)
  │   │   └── assets/             # xml 模板
  │   ├── sharedev-field/ ...
  │   └── ... 17 个 skill
  └── specs/apl/SKILL.md

供 generator 用:把 SKILL.md + references + assets 拼成 LLM system prompt。
"""
from __future__ import annotations

from pathlib import Path
from functools import lru_cache
import structlog

logger = structlog.get_logger()


# 17 个 skill 的 id 清单(用于前端 task 分组 / 校验)
SHAREDEV_SKILLS: list[str] = [
    "sharedev-auto",
    "sharedev-object",
    "sharedev-field",
    "sharedev-validation-rule",
    "sharedev-layout",
    "sharedev-layout-rule",
    "sharedev-apl-implement",
    "sharedev-apl-lite",
    "sharedev-apl-code-review",
    "sharedev-pwc",
    "sharedev-pwc-write-prd-spec",
    "sharedev-pwc-write-arch",
    "sharedev-pwc-write-plans",
    "sharedev-pwc-execute-plans",
    "sharedev-pwc-subagent-driven-development",
    "sharedev-pwc-finish-development",
    "sharedev-pwc-review-code",
    "sharedev-pwc-fix-bug",
]

# 分类:给前端按组展示(配置类 / APL / PWC / 其他)
SKILL_GROUPS: dict[str, list[str]] = {
    "config": [
        "sharedev-object",
        "sharedev-field",
        "sharedev-validation-rule",
        "sharedev-layout",
        "sharedev-layout-rule",
    ],
    "apl": [
        "sharedev-apl-implement",
        "sharedev-apl-lite",
        "sharedev-apl-code-review",
    ],
    "pwc": [
        "sharedev-pwc",
        "sharedev-pwc-write-prd-spec",
        "sharedev-pwc-write-arch",
        "sharedev-pwc-write-plans",
        "sharedev-pwc-execute-plans",
        "sharedev-pwc-subagent-driven-development",
        "sharedev-pwc-finish-development",
        "sharedev-pwc-review-code",
        "sharedev-pwc-fix-bug",
    ],
    "meta": [
        "sharedev-auto",
    ],
}

SKILL_GROUP_LABELS: dict[str, str] = {
    "config": "配置类(对象 / 字段 / 校验 / 布局)",
    "apl": "APL 函数(Groovy)",
    "pwc": "PWC 组件",
    "meta": "智能编排",
}

# Phase 1 已接入(其他 skill 标 beta;前端按这个清单决定哪些 task 可点"生成配置")
SKILLS_AVAILABLE_PHASE_1: set[str] = {
    "sharedev-object",
    "sharedev-field",
}


def _prompts_root() -> Path:
    """返回 backend/prompts/sharedev/ 的绝对路径。

    本文件位于 backend/services/sharedev/skill_loader.py,所以 root = ../../prompts/sharedev
    """
    return Path(__file__).resolve().parents[2] / "prompts" / "sharedev"


def _skill_dir(skill_name: str) -> Path | None:
    """返回单个 skill 的目录路径(若存在)。"""
    root = _prompts_root()
    candidate = root / "skills" / skill_name
    if candidate.is_dir():
        return candidate
    # specs/apl 是历史遗留路径,有些 skill 在 specs 下
    candidate2 = root / "specs" / skill_name.replace("sharedev-", "")
    if candidate2.is_dir():
        return candidate2
    return None


@lru_cache(maxsize=32)
def load_skill_prompt(skill_name: str, *, include_references: bool = True, include_assets: bool = True) -> str:
    """加载 skill 的完整 system prompt(SKILL.md + references/* + assets/*)。

    Args:
        skill_name: 17 个 sharedev skill 的 id(如 "sharedev-field")
        include_references: 是否拼上 references/ 子目录的所有 md 文件
        include_assets: 是否拼上 assets/ 子目录的所有 xml 模板

    Returns:
        拼好的 markdown 字符串,可直接作为 LLM 的 system prompt

    Raises:
        FileNotFoundError: skill 不存在
    """
    skill_dir = _skill_dir(skill_name)
    if skill_dir is None:
        raise FileNotFoundError(
            f"sharedev skill {skill_name!r} 未找到。检查 backend/prompts/sharedev/skills/ "
            f"是否解压了 sharecrm-skills-kit zip"
        )

    parts: list[str] = []

    # 1) 主体 SKILL.md
    skill_md = skill_dir / "SKILL.md"
    if skill_md.is_file():
        parts.append(skill_md.read_text(encoding="utf-8"))

    # 2) references/ 下所有 md
    if include_references:
        ref_dir = skill_dir / "references"
        if ref_dir.is_dir():
            for ref_file in sorted(ref_dir.glob("*.md")):
                parts.append(f"\n\n---\n\n## 参考资料:{ref_file.name}\n\n{ref_file.read_text(encoding='utf-8')}")

    # 3) assets/ 下所有模板(xml/json/yaml)
    if include_assets:
        asset_dir = skill_dir / "assets"
        if asset_dir.is_dir():
            for asset_file in sorted(asset_dir.iterdir()):
                if asset_file.is_file() and asset_file.suffix in (".xml", ".json", ".yaml", ".yml", ".groovy"):
                    parts.append(
                        f"\n\n---\n\n## 模板文件:`{asset_file.name}`\n\n"
                        f"```{asset_file.suffix.lstrip('.')}\n{asset_file.read_text(encoding='utf-8')}\n```"
                    )

    if not parts:
        raise FileNotFoundError(f"sharedev skill {skill_name!r} 内容为空")

    full = "\n".join(parts)
    logger.info("sharedev_skill_loaded", skill=skill_name, chars=len(full))
    return full


def list_available_skills() -> dict:
    """列出所有 skill 的元信息,给前端 task 分组用。"""
    return {
        "skills": SHAREDEV_SKILLS,
        "groups": SKILL_GROUPS,
        "group_labels": SKILL_GROUP_LABELS,
        "available_phase_1": sorted(SKILLS_AVAILABLE_PHASE_1),
    }
