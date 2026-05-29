#!/usr/bin/env bash
# 首次申请 Let's Encrypt 证书 — webroot 模式(无中断,不停 frontend)
# 适用于:已有 nginx 在跑、80 端口被占用、不想中断 kb.liii.in / kb.tokenwave.cloud 的访问
#
# 用法:
#   sudo DOMAIN=uat.tokenwave.cloud /opt/kb-system/scripts/init-ssl-webroot.sh
#
# 前置:
#   1. DNS A 记录已配:DOMAIN → 服务器 IP
#   2. frontend 容器已在跑,且 nginx 已 serve /.well-known/acme-challenge/ → /var/www/certbot
#      (现有 nginx.conf 顶部 HTTP server block 已有这段)
set -euo pipefail

DOMAIN="${DOMAIN:?需指定:DOMAIN=uat.tokenwave.cloud $0}"
EMAIL="${EMAIL:-liu@zheb.in}"
EXPECTED_IP="${EXPECTED_IP:-34.67.136.67}"

echo "==> [1/4] 检查 DNS 是否解析到 $EXPECTED_IP"
if ! command -v dig >/dev/null 2>&1; then
    echo "  -> 安装 dnsutils"
    sudo apt-get update -qq && sudo apt-get install -y dnsutils
fi
RESOLVED=$(dig +short "$DOMAIN" A @8.8.8.8 | head -1)
if [ "$RESOLVED" != "$EXPECTED_IP" ]; then
    echo "  ✗ $DOMAIN 解析到 '$RESOLVED',期望 '$EXPECTED_IP'"
    echo "  → 请等 DNS 生效后重试;或先用 'dig $DOMAIN @8.8.8.8' 排查"
    exit 1
fi
echo "  ✓ DNS 正确解析到 $EXPECTED_IP"

echo "==> [2/4] 准备 webroot 目录"
sudo mkdir -p /var/www/certbot/.well-known/acme-challenge
# nginx 容器内的 /var/www/certbot 来自 docker-compose 卷映射;
# 如果还没映射,这里失败时往下走 standalone 模式
WEBROOT_OK=false
if sudo docker compose -f /opt/kb-system/docker-compose.yml exec -T frontend test -d /var/www/certbot 2>/dev/null; then
    WEBROOT_OK=true
    echo "  ✓ frontend 容器内 /var/www/certbot 可写"
else
    echo "  ⚠ frontend 容器没挂 /var/www/certbot — 这次先用 standalone 模式(会短暂停 frontend)"
fi

if [ "$WEBROOT_OK" = true ]; then
    echo "==> [3/4] 用 certbot docker 镜像 webroot 模式申请证书(无中断)"
    sudo docker run --rm \
        -v /etc/letsencrypt:/etc/letsencrypt \
        -v /var/lib/letsencrypt:/var/lib/letsencrypt \
        -v /var/www/certbot:/var/www/certbot \
        certbot/certbot:latest \
        certonly --webroot --webroot-path=/var/www/certbot \
            -d "$DOMAIN" \
            --email "$EMAIL" \
            --agree-tos --non-interactive \
            --preferred-challenges http
else
    echo "==> [3/4] standalone 模式申请证书(临时停 frontend,~30 秒中断)"
    cd /opt/kb-system
    sudo docker compose stop frontend || true
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
    sudo docker compose up -d frontend
fi

echo "==> [4/4] 完成 — 证书路径"
sudo ls -l "/etc/letsencrypt/live/$DOMAIN/"
echo
echo "下一步:"
echo "  1. 确认 nginx.conf 已加 server { server_name $DOMAIN; ... } 块"
echo "  2. 重启 frontend 容器:cd /opt/kb-system && sudo docker compose up -d frontend"
echo "  3. 测试:curl -fsS https://$DOMAIN/health"
