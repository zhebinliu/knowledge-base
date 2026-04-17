#!/usr/bin/env bash
# 首次申请 Let's Encrypt 证书（用官方 certbot/certbot docker 镜像，避免 Debian 12 自带 certbot 2.1 的 AttributeError bug）
# 在远程 /opt/kb-system 下以 sudo 执行
set -euo pipefail

DOMAIN="${DOMAIN:-kb.liii.in}"
EMAIL="${EMAIL:-liu@zheb.in}"
EXPECTED_IP="${EXPECTED_IP:-34.45.112.217}"

echo "==> [1/5] 检查 DNS 是否解析到 $EXPECTED_IP"
if ! command -v dig >/dev/null 2>&1; then
    echo "  -> 安装 dnsutils"
    sudo apt-get update -qq && sudo apt-get install -y dnsutils
fi
RESOLVED=$(dig +short "$DOMAIN" A @8.8.8.8 | head -1)
if [ "$RESOLVED" != "$EXPECTED_IP" ]; then
    echo "  ✗ $DOMAIN 解析到 '$RESOLVED'，期望 '$EXPECTED_IP'"
    exit 1
fi
echo "  ✓ DNS 正确解析到 $EXPECTED_IP"

echo "==> [2/5] 准备 webroot 目录（用于后续续期）"
sudo mkdir -p /var/www/certbot

echo "==> [3/5] 临时停 frontend 释放 80 端口"
cd /opt/kb-system
sudo docker compose stop frontend || true

echo "==> [4/5] 用 certbot docker 镜像 standalone 申请证书"
sudo docker run --rm \
    -p 80:80 \
    -v /etc/letsencrypt:/etc/letsencrypt \
    -v /var/lib/letsencrypt:/var/lib/letsencrypt \
    certbot/certbot:latest \
    certonly --standalone \
        -d "$DOMAIN" \
        --email "$EMAIL" \
        --agree-tos --non-interactive \
        --preferred-challenges http

echo "==> [5/5] 启动 frontend（带 443 + 证书挂载）"
sudo docker compose up -d frontend

echo
echo "==> 完成"
sudo ls -l "/etc/letsencrypt/live/$DOMAIN/"
echo
echo "下一步：把续期加入 cron"
echo "  sudo crontab -e"
echo "  17 3 * * * /opt/kb-system/scripts/renew-ssl.sh >> /var/log/kb-renew.log 2>&1"
