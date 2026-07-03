#!/usr/bin/env python3
"""
/opt/aihub-tap/disk-alert.py — 磁盘用量告警(Resend SMTP)

- 检查 /opt/data 用量,超过阈值(默认 85%)发邮件到 ALERT_EMAIL
- SMTP 配置直接从 new-api-postgres options 表读(避免密码文件重复)
- Cooldown 12h(通过 /tmp/aihub-disk-alert.last 标记),避免刷屏

cron 建议(每 15 分钟一次):
    5,20,35,50 * * * *  /usr/bin/python3 /opt/aihub-tap/disk-alert.py >> /opt/aihub-tap/logs/disk-alert.log 2>&1

历史背景: 2026-07-02 因 /opt/data 99% 满 → docker/sshd/nginx 全挂 → 强制重启换 IP。
从那以后加了这个告警 + 已经加了 tap.jsonl 日切保留 3 天。
"""

import os
import shutil
import smtplib
import ssl
import subprocess
import sys
import time
from email.message import EmailMessage
from pathlib import Path

# ─── 可调参数 ─────────────────────────────────────────────
TARGET_PATH    = "/opt/data"
THRESHOLD_PCT  = 85
COOLDOWN_HOURS = 12
ALERT_EMAIL    = os.environ.get("ALERT_EMAIL", "yan98tiger@gmail.com")
COOLDOWN_FILE  = Path("/tmp/aihub-disk-alert.last")

# ─── 逻辑 ────────────────────────────────────────────────

def read_smtp_from_postgres() -> dict:
    """从 new-api-postgres 直接查 SMTP 配置,不复用外部凭证。"""
    result = subprocess.run(
        ["sudo", "docker", "exec", "new-api-postgres",
         "psql", "-U", "newapi", "-d", "newapi", "-t", "-A",
         "-c", "SELECT key, value FROM options WHERE key LIKE 'SMTP%';"],
        capture_output=True, text=True, timeout=10,
    )
    if result.returncode != 0:
        raise RuntimeError(f"psql failed: {result.stderr}")
    cfg = {}
    for line in result.stdout.splitlines():
        if "|" not in line:
            continue
        k, v = line.split("|", 1)
        cfg[k.strip()] = v.strip()
    return cfg


def in_cooldown() -> bool:
    if not COOLDOWN_FILE.exists():
        return False
    try:
        last = float(COOLDOWN_FILE.read_text().strip())
    except Exception:
        return False
    return (time.time() - last) < COOLDOWN_HOURS * 3600


def mark_sent() -> None:
    COOLDOWN_FILE.write_text(str(time.time()))


def send_alert(used_pct: float, free_gb: float, total_gb: float, cfg: dict) -> None:
    server_ip = subprocess.run(
        ["curl", "-s", "https://api.ipify.org"],
        capture_output=True, text=True, timeout=5,
    ).stdout.strip() or "unknown"

    msg = EmailMessage()
    msg["Subject"] = f"⚠️ aihub 磁盘 {used_pct:.0f}% 用满 · 剩 {free_gb:.1f}G"
    msg["From"]    = f"AIHub Monitor <{cfg.get('SMTPFrom', 'noreply@tokenwave.cloud')}>"
    msg["To"]      = ALERT_EMAIL
    body = f"""服务器 {server_ip} 的 {TARGET_PATH} 磁盘用量 {used_pct:.1f}%,
剩余 {free_gb:.1f}GB / {total_gb:.1f}GB。已超过 {THRESHOLD_PCT}% 阈值。

历史教训(2026-07-02): 磁盘 99% 满会导致 docker/nginx/sshd 全部无响应,
只能从 GCP Console 强制重启,而且外部 IP 会变。

立即排查:
  ssh -i ~/.ssh/id_rsa_github_deploy liu@{server_ip}
  sudo du -sh /opt/data/docker/* | sort -h | tail
  sudo docker images --format '{{{{.Size}}}} {{{{.Repository}}}}:{{{{.Tag}}}}' | sort -h | tail -15

常见元凶:
  1. 老 GHCR SHA 镜像堆积(每个 ~2.3GB,几天就 20+GB)
  2. tap.jsonl 增长(现已日切保留 3 天,一般 <500MB)
  3. docker builder cache(用 docker builder prune -af 清)

清理命令:
  # 只保留正在跑的 SHA(其它都删)
  IN_USE=$(sudo docker inspect kb-system-backend-1 -f '{{{{.Config.Image}}}}' | grep -oP 'sha-[a-z0-9]+')
  sudo docker images 'ghcr.io/zhebinliu/knowledge-base-*' --format '{{{{.Repository}}}}:{{{{.Tag}}}}' \\
    | grep -v "$IN_USE" | xargs -r sudo docker rmi

冷静期 {COOLDOWN_HOURS}h 内不再重复告警。

— aihub-tap disk-alert.py
"""
    msg.set_content(body)

    host = cfg.get("SMTPServer", "smtp.resend.com")
    port = int(cfg.get("SMTPPort", "465"))
    user = cfg.get("SMTPAccount", "resend")
    pw   = cfg.get("SMTPToken", "")
    if not pw:
        raise RuntimeError("SMTPToken empty in options table")

    ctx = ssl.create_default_context()
    with smtplib.SMTP_SSL(host, port, context=ctx, timeout=15) as s:
        s.login(user, pw)
        s.send_message(msg)


def main() -> int:
    stat = shutil.disk_usage(TARGET_PATH)
    used_pct = stat.used * 100 / stat.total
    free_gb  = stat.free / (1024 ** 3)
    total_gb = stat.total / (1024 ** 3)
    now = time.strftime("%F %T")

    if used_pct < THRESHOLD_PCT:
        # 低于阈值静默,不刷 log
        return 0

    if in_cooldown():
        print(f"[{now}] 磁盘 {used_pct:.1f}% (剩 {free_gb:.1f}G),冷静期未过,跳过")
        return 0

    try:
        cfg = read_smtp_from_postgres()
    except Exception as e:
        print(f"[{now}] 磁盘 {used_pct:.1f}% 但 SMTP 读取失败: {e}")
        return 1

    try:
        send_alert(used_pct, free_gb, total_gb, cfg)
        mark_sent()
        print(f"[{now}] 告警已发送至 {ALERT_EMAIL}: {used_pct:.1f}% ({free_gb:.1f}G free)")
        return 0
    except Exception as e:
        print(f"[{now}] 告警发送失败: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
