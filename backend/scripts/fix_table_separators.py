"""一次性 backfill:把已存库 bundle 的 content_md 里写错列数的 markdown 表格分隔行修正。

成因:LLM 把分隔行(|---|---|)列数写得跟表头不一致 → GFM 整表 reject → 预览退回 raw
文本、下载 docx/pdf 也是坏表。前端有渲染时兜底,但存库内容仍是坏的,导出路径不受益。
本脚本用与生成时同一个 normalize_table_separators 把存量数据就地修好。幂等,可重复跑。

跑法(prod 容器内):
    sudo docker exec kb-system-backend-1 python scripts/fix_table_separators.py
"""
import asyncio

from sqlalchemy import select

from models import async_session_maker
from models.curated_bundle import CuratedBundle
from services.agentic.research.blueprint_generator import normalize_table_separators


async def main() -> None:
    changed = scanned = 0
    async with async_session_maker() as s:
        rows = (await s.execute(
            select(CuratedBundle).where(CuratedBundle.content_md.isnot(None))
        )).scalars().all()
        for b in rows:
            scanned += 1
            md = b.content_md or ""
            fixed = normalize_table_separators(md)
            if fixed != md:
                b.content_md = fixed
                changed += 1
                print(f"  fixed {b.id} [{b.kind}] (+{len(fixed) - len(md):+d} chars)")
        if changed:
            await s.commit()
    print(f"done. scanned={scanned}, changed={changed}")


if __name__ == "__main__":
    asyncio.run(main())
