#!/usr/bin/env bash
# Let's Encrypt 自动续期（webroot 模式，不停 frontend）
# 用 certbot/certbot docker 镜像，避免依赖系统 certbot
# cron 建议：17 3 * * * /opt/kb-system/scripts/renew-ssl.sh >> /var/log/kb-renew.log 2>&1
set -euo pipefail

# webroot 模式：certbot 把 challenge 文件写入 /var/www/certbot/.well-known/acme-challenge/
# nginx 已配置从同路径 serve，外部 ACME 服务器可直接访问
sudo certbot renew --quiet

# 续期成功时（证书文件被替换）reload nginx 加载新证书
reload_needed=false
for domain in kb.liii.in kb.tokenwave.cloud; do
    cert_path="/etc/letsencrypt/live/${domain}/fullchain.pem"
    if [ -f "$cert_path" ] && [ -n "$(find "$cert_path" -mtime -1 2>/dev/null)" ]; then
        echo "$(date -Iseconds) cert renewed for ${domain}"
        reload_needed=true
    fi
done

if [ "$reload_needed" = true ]; then
    echo "$(date -Iseconds) reloading nginx"
    sudo docker exec kb-system-frontend-1 nginx -s reload
fi
