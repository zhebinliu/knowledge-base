#!/usr/bin/env bash
# Let's Encrypt 自动续期（webroot 模式，不停 frontend）
# 用 certbot/certbot docker 镜像，避免依赖系统 certbot
# cron 建议：17 3 * * * /opt/kb-system/scripts/renew-ssl.sh >> /var/log/kb-renew.log 2>&1
set -euo pipefail

# webroot 模式：certbot 把 challenge 文件写入 /var/www/certbot/.well-known/acme-challenge/
# nginx 已配置从同路径 serve，外部 ACME 服务器可直接访问 http://kb.liii.in/.well-known/acme-challenge/<token>
sudo docker run --rm \
    -v /etc/letsencrypt:/etc/letsencrypt \
    -v /var/lib/letsencrypt:/var/lib/letsencrypt \
    -v /var/www/certbot:/var/www/certbot \
    certbot/certbot:latest \
    renew \
        --webroot -w /var/www/certbot \
        --quiet

# 续期成功时（证书文件被替换）reload nginx 加载新证书
# certbot --deploy-hook 在容器内无法直接控制宿主 docker，所以放到容器外触发
if [ -f /etc/letsencrypt/live/kb.liii.in/fullchain.pem ]; then
    # 仅当证书在过去 1 天内被改写过时才 reload，避免每天无谓 reload
    if [ -n "$(find /etc/letsencrypt/live/kb.liii.in/fullchain.pem -mtime -1 2>/dev/null)" ]; then
        echo "$(date -Iseconds) cert renewed, reloading nginx"
        sudo docker exec kb-system-frontend-1 nginx -s reload
    fi
fi
