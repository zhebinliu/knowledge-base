"""一次性 backfill 脚本:对已生成 bundle 里的 best_practice_advice 字段,
跑一遍客户名脱敏,把「特变新能源」「友发钢管」之类的真实客户名替换成「某同行业客户」。

用法(在 backend 容器里跑):
  docker compose exec backend python -m scripts.redact_existing_advice

设计:
- 只读 + 改 bundle.extra.questionnaire_items[].best_practice_advice
- 复用 best_practice_advisor._redact_customer_names 同一份黑名单
- 干跑模式默认开,看到改动数后改 DRY_RUN=False 才真正写库;也可以传 --apply 强制写
- 不调 LLM,纯正则替换,几秒搞定
"""
from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from models import async_session_maker
from models.curated_bundle import CuratedBundle
from services.agentic.research.best_practice_advisor import _redact_customer_names


async def run(dry_run: bool = True) -> None:
    n_bundles_total = 0
    n_bundles_changed = 0
    n_items_total = 0
    n_items_changed = 0

    async with async_session_maker() as s:
        rows = (await s.execute(
            select(CuratedBundle).where(CuratedBundle.kind == "survey")
        )).scalars().all()
        n_bundles_total = len(rows)

        for b in rows:
            extra = dict(b.extra or {})
            items = list(extra.get("questionnaire_items") or [])
            if not items:
                continue

            bundle_changed = False
            for it in items:
                advice = (it.get("best_practice_advice") or "").strip()
                if not advice:
                    continue
                n_items_total += 1
                cleaned = _redact_customer_names(advice)
                if cleaned != advice:
                    n_items_changed += 1
                    bundle_changed = True
                    if not dry_run:
                        it["best_practice_advice"] = cleaned

            if bundle_changed:
                n_bundles_changed += 1
                if not dry_run:
                    extra["questionnaire_items"] = items
                    b.extra = extra
                    flag_modified(b, "extra")

        if not dry_run:
            await s.commit()

    print("=" * 60)
    print(f"Mode:           {'APPLY (已写库)' if not dry_run else 'DRY-RUN (未写库)'}")
    print(f"survey bundles:    扫描 {n_bundles_total} 个,需改 {n_bundles_changed} 个")
    print(f"advice items:      扫描 {n_items_total} 条,需改 {n_items_changed} 条")
    print("=" * 60)
    if dry_run and n_items_changed > 0:
        print("提示:确认无误后,加 --apply 重跑写库。")


def main() -> None:
    apply_mode = "--apply" in sys.argv
    asyncio.run(run(dry_run=not apply_mode))


if __name__ == "__main__":
    main()
