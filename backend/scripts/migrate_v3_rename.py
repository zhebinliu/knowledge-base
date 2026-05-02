"""
一次性迁移：把 v3 阶段的代码层 kind 命名归一 — `_v2` 后缀去掉。

背景：
- 项目洞察 v3 / 需求调研 v3 已稳定，旧版对话式 `insight` / `survey` 不再使用。
- 同时把 `insight_v2` / `survey_v2` / `survey_outline_v2` 改回 `insight` / `survey` / `survey_outline`，
  让用户感知层和代码层都没有版本心智负担。

操作：
1. 归档旧版（kind ∈ {'insight','survey'}）的 curated_bundles / project_briefs / output_conversations
   到 `_archive_legacy` 后缀的归档表，保留 30 天可回滚。
2. 删除归档后的旧版主表记录。
3. 把 `_v2` kind 全部改成无后缀名（curated_bundles.kind / project_briefs.output_kind /
   output_conversations.kind）。
4. 同步处理 agent_configs(config_type='output_agent', config_key='*_v2')：
   - 若 v2 行已存在且无后缀行也存在(后端启动时 seed 默认 skill 关联会创建占位行)，
     用 v2 的 config_value(运营手改值)合并覆盖无后缀行,然后删除 v2 行。
   - 若只有 v2 行存在，直接 UPDATE config_key 即可。
5. agent_configs(config_type='stage_flow').config_value JSON 内的 kind/sub_kinds[].kind 字符串。

幂等：多次执行结果一致 — 重命名后再跑就是 0 行受影响,归档表 INSERT 用 ON CONFLICT DO NOTHING。

依赖：环境变量 DATABASE_URL（同 services/config.settings.database_url）。

用法（生产）：
    docker exec kb-system-backend-1 python -m scripts.migrate_v3_rename

用法（本地 dry-run）：
    python -m scripts.migrate_v3_rename --dry-run
"""

import argparse
import asyncio
import json
import structlog
from sqlalchemy import text
from models import async_session_maker

logger = structlog.get_logger()


LEGACY_KINDS = ("insight", "survey")
V2_TO_NO_SUFFIX = {
    "insight_v2": "insight",
    "survey_v2": "survey",
    "survey_outline_v2": "survey_outline",
}


# ── 表名 / 列名 备忘(已对照各 model 文件确认) ────────────────────────────────
# curated_bundles      .kind          (models/curated_bundle.py:14,17)
# project_briefs       .output_kind   (models/project_brief.py:13,21)
# output_conversations .kind          (models/output_conversation.py:14,18)
# agent_configs        .config_key    (models/agent_config.py:13,17)
#                       UniqueConstraint(config_type, config_key)


async def archive_and_delete_legacy(session, dry_run: bool):
    """归档 + 删除旧版 conversational 'insight' / 'survey' 数据。"""
    summary = {
        "archived_curated": 0, "archived_briefs": 0, "archived_conv": 0,
        "deleted_curated": 0, "deleted_briefs": 0, "deleted_conv": 0,
    }

    # ── 1. curated_bundles ──
    await session.execute(text("""
        CREATE TABLE IF NOT EXISTS curated_bundles_archive_legacy
        (LIKE curated_bundles INCLUDING ALL);
    """))
    res = await session.execute(text(
        "SELECT count(*) FROM curated_bundles WHERE kind IN ('insight','survey')"
    ))
    summary["archived_curated"] = res.scalar() or 0
    if summary["archived_curated"] > 0:
        await session.execute(text("""
            INSERT INTO curated_bundles_archive_legacy
            SELECT * FROM curated_bundles WHERE kind IN ('insight','survey')
            ON CONFLICT DO NOTHING;
        """))
        if not dry_run:
            res = await session.execute(text(
                "DELETE FROM curated_bundles WHERE kind IN ('insight','survey')"
            ))
            summary["deleted_curated"] = res.rowcount or 0

    # ── 2. project_briefs ──
    await session.execute(text("""
        CREATE TABLE IF NOT EXISTS project_briefs_archive_legacy
        (LIKE project_briefs INCLUDING ALL);
    """))
    res = await session.execute(text(
        "SELECT count(*) FROM project_briefs WHERE output_kind IN ('insight','survey')"
    ))
    summary["archived_briefs"] = res.scalar() or 0
    if summary["archived_briefs"] > 0:
        await session.execute(text("""
            INSERT INTO project_briefs_archive_legacy
            SELECT * FROM project_briefs WHERE output_kind IN ('insight','survey')
            ON CONFLICT DO NOTHING;
        """))
        if not dry_run:
            res = await session.execute(text(
                "DELETE FROM project_briefs WHERE output_kind IN ('insight','survey')"
            ))
            summary["deleted_briefs"] = res.rowcount or 0

    # ── 3. output_conversations(列名是 kind,不是 output_kind!) ──
    await session.execute(text("""
        CREATE TABLE IF NOT EXISTS output_conversations_archive_legacy
        (LIKE output_conversations INCLUDING ALL);
    """))
    res = await session.execute(text(
        "SELECT count(*) FROM output_conversations WHERE kind IN ('insight','survey')"
    ))
    summary["archived_conv"] = res.scalar() or 0
    if summary["archived_conv"] > 0:
        await session.execute(text("""
            INSERT INTO output_conversations_archive_legacy
            SELECT * FROM output_conversations WHERE kind IN ('insight','survey')
            ON CONFLICT DO NOTHING;
        """))
        if not dry_run:
            res = await session.execute(text(
                "DELETE FROM output_conversations WHERE kind IN ('insight','survey')"
            ))
            summary["deleted_conv"] = res.rowcount or 0

    return summary


async def rename_v2_to_no_suffix(session, dry_run: bool):
    """把 `*_v2` kind 改成无后缀。表名 / 列名见文件头备忘。"""
    summary = {}
    for old_kind, new_kind in V2_TO_NO_SUFFIX.items():
        # curated_bundles.kind
        res = await session.execute(text(
            "SELECT count(*) FROM curated_bundles WHERE kind = :k"
        ).bindparams(k=old_kind))
        cnt = res.scalar() or 0
        summary[f"curated_bundles[{old_kind}]"] = cnt
        if cnt > 0 and not dry_run:
            await session.execute(text(
                "UPDATE curated_bundles SET kind = :new WHERE kind = :old"
            ).bindparams(new=new_kind, old=old_kind))

        # project_briefs.output_kind
        res = await session.execute(text(
            "SELECT count(*) FROM project_briefs WHERE output_kind = :k"
        ).bindparams(k=old_kind))
        cnt = res.scalar() or 0
        summary[f"project_briefs[{old_kind}]"] = cnt
        if cnt > 0 and not dry_run:
            await session.execute(text(
                "UPDATE project_briefs SET output_kind = :new WHERE output_kind = :old"
            ).bindparams(new=new_kind, old=old_kind))

        # output_conversations.kind(注:字段名是 kind 不是 output_kind!)
        res = await session.execute(text(
            "SELECT count(*) FROM output_conversations WHERE kind = :k"
        ).bindparams(k=old_kind))
        cnt = res.scalar() or 0
        summary[f"output_conversations[{old_kind}]"] = cnt
        if cnt > 0 and not dry_run:
            await session.execute(text(
                "UPDATE output_conversations SET kind = :new WHERE kind = :old"
            ).bindparams(new=new_kind, old=old_kind))

    return summary


async def merge_agent_configs(session, dry_run: bool):
    """把 agent_configs(output_agent, *_v2) 合并到无后缀行。

    场景:后端启动时 seed_default_skill_associations 会按 KIND_TO_ATOMIC_SKILLS
    创建 (output_agent, 'insight'/'survey'/'survey_outline') 三行(若不存在)。
    所以本迁移要假设这些"占位"行可能已存在,不能直接 UPDATE config_key='insight_v2' → 'insight'
    (会撞 UniqueConstraint(config_type, config_key))。

    策略:对每个 (old_key, new_key) 对:
    - 若 old 行存在且 new 行也存在 → 用 old 的 config_value(运营手改值)
      覆盖 new 的 config_value,然后 DELETE old 行。
    - 若 old 行存在且 new 行不存在 → 直接 UPDATE config_key。
    - 若 old 行不存在 → 跳过。
    """
    summary = {}
    for old_key, new_key in V2_TO_NO_SUFFIX.items():
        # 用 sqlalchemy 的 expanding 写法或 hardcoded SELECT 都可以;这里 single-key 直接 :k
        res = await session.execute(text("""
            SELECT id, config_value FROM agent_configs
            WHERE config_type='output_agent' AND config_key = :k
        """).bindparams(k=old_key))
        old_row = res.first()
        res2 = await session.execute(text("""
            SELECT id FROM agent_configs
            WHERE config_type='output_agent' AND config_key = :k
        """).bindparams(k=new_key))
        new_row = res2.first()

        if old_row is None:
            summary[f"{old_key}→{new_key}"] = "skip(old absent)"
            continue

        if new_row is None:
            # 直接 UPDATE 改 key
            if not dry_run:
                await session.execute(text("""
                    UPDATE agent_configs SET config_key = :new
                    WHERE config_type='output_agent' AND config_key = :old
                """).bindparams(new=new_key, old=old_key))
            summary[f"{old_key}→{new_key}"] = "rename"
        else:
            # 合并:用 old 的 config_value 覆盖 new(因为 old 通常是运营手改过的),
            # 然后删除 old
            old_id, old_value = old_row
            if not dry_run:
                # config_value 是 JSON 列,asyncpg 默认把 string bindparam 推断为 VARCHAR,
                # 必须用 CAST(... AS jsonb) 强制 PG 解析为 jsonb 类型,否则 DatatypeMismatchError。
                # 注:不能用 PG 风格的 :v::jsonb,SQLAlchemy text() 解析器会把 :: 当作 cast 而忽略 :v 参数。
                await session.execute(text("""
                    UPDATE agent_configs SET config_value = CAST(:v AS jsonb)
                    WHERE config_type='output_agent' AND config_key = :k
                """).bindparams(v=json.dumps(old_value or {}), k=new_key))
                await session.execute(text("""
                    DELETE FROM agent_configs WHERE id = :id
                """).bindparams(id=old_id))
            summary[f"{old_key}→{new_key}"] = "merge(old→new), drop old"

    return summary


async def patch_stage_flow_config(session, dry_run: bool):
    """改 agent_configs(config_type='stage_flow', config_key='default').config_value JSON。

    若运营从未保存过自定义 stage flow(DB 里没记录),跳过 — 后端 _read() 会走硬编码 DEFAULT_STAGES。
    """
    res = await session.execute(text("""
        SELECT id, config_value FROM agent_configs
        WHERE config_type = 'stage_flow' AND config_key = 'default'
    """))
    row = res.first()
    if not row:
        return {"stage_flow_patched": 0, "note": "no custom config"}

    cfg_id, cfg_value = row
    if not isinstance(cfg_value, dict):
        return {"stage_flow_patched": 0, "note": "config_value not dict"}

    stages = cfg_value.get("stages") or []
    if not isinstance(stages, list):
        return {"stage_flow_patched": 0, "note": "stages not list"}

    patched = 0
    new_stages = []
    legacy_stage_keys = set(LEGACY_KINDS)  # 'insight','survey' 也是 stage key

    for stage in stages:
        if not isinstance(stage, dict):
            new_stages.append(stage)
            continue
        # 删除旧版整条 stage(key 是 'insight' 或 'survey' 且 kind 也是同名旧 conversational kind)
        if stage.get("key") in legacy_stage_keys and stage.get("kind") in LEGACY_KINDS:
            patched += 1
            continue
        new_stage = dict(stage)
        # 改 stage.kind
        if new_stage.get("kind") in V2_TO_NO_SUFFIX:
            new_stage["kind"] = V2_TO_NO_SUFFIX[new_stage["kind"]]
            patched += 1
        # 改 sub_kinds[].kind
        sub_kinds = new_stage.get("sub_kinds") or []
        new_sub_kinds = []
        for sk in sub_kinds:
            if isinstance(sk, dict) and sk.get("kind") in V2_TO_NO_SUFFIX:
                new_sk = dict(sk)
                new_sk["kind"] = V2_TO_NO_SUFFIX[sk["kind"]]
                new_sub_kinds.append(new_sk)
                patched += 1
            else:
                new_sub_kinds.append(sk)
        if sub_kinds:
            new_stage["sub_kinds"] = new_sub_kinds
        # 改 stage.key(v2 stage key)
        if new_stage.get("key") in V2_TO_NO_SUFFIX:
            new_stage["key"] = V2_TO_NO_SUFFIX[new_stage["key"]]
            patched += 1
        # 改 label「(新版)」「(旧版)」字样(半角 + 全角括号都清)
        label = new_stage.get("label", "")
        if any(s in label for s in ("(新版)", "（新版）", "(旧版)", "（旧版）")):
            new_label = label
            for s in ("(新版)", "（新版）", "(旧版)", "（旧版）"):
                new_label = new_label.replace(s, "")
            new_stage["label"] = new_label.strip()
            patched += 1
        new_stages.append(new_stage)

    if patched > 0 and not dry_run:
        cfg_value["stages"] = new_stages
        # 同样需要 CAST(... AS jsonb) — config_value 是 JSON 列,直接绑 string 会被推断为 VARCHAR
        await session.execute(text("""
            UPDATE agent_configs SET config_value = CAST(:cv AS jsonb) WHERE id = :id
        """).bindparams(cv=json.dumps(cfg_value), id=cfg_id))

    return {"stage_flow_patched_fields": patched}


async def main(dry_run: bool):
    logger.info("migrate_v3_rename_start", dry_run=dry_run)

    async with async_session_maker() as session:
        try:
            arch = await archive_and_delete_legacy(session, dry_run)
            logger.info("legacy_archive_done", **arch)

            ren = await rename_v2_to_no_suffix(session, dry_run)
            logger.info("rename_v2_done", **ren)

            agent = await merge_agent_configs(session, dry_run)
            logger.info("agent_configs_merge_done", **agent)

            stage = await patch_stage_flow_config(session, dry_run)
            logger.info("stage_flow_patch_done", **stage)

            if dry_run:
                await session.rollback()
                logger.info("migrate_v3_rename_dryrun_rolled_back")
            else:
                await session.commit()
                logger.info("migrate_v3_rename_committed")

            print("\n=== 迁移完成 ===")
            print(f"模式: {'DRY RUN(已回滚)' if dry_run else '已提交'}")
            print(f"归档/删除(旧版 conversational): {arch}")
            print(f"v2 → 无后缀重命名: {ren}")
            print(f"agent_configs 合并: {agent}")
            print(f"stage_flow 配置修补: {stage}")
            print("\n回滚提示: 归档表 *_archive_legacy 保留 30 天,需要时可 INSERT 反向回插。")

        except Exception as e:
            await session.rollback()
            logger.error("migrate_v3_rename_failed", error=str(e)[:300])
            raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="只读分析，不实际写入")
    args = parser.parse_args()
    asyncio.run(main(args.dry_run))
