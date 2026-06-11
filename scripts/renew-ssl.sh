#!/usr/bin/env bash
# Let's Encrypt 自动续期（webroot 模式，不停 frontend）
# 用 certbot/certbot docker 镜像，避免依赖系统 certbot
# cron 建议：17 3 * * * /opt/kb-system/scripts/renew-ssl.sh >> /var/log/kb-renew.log 2>&1
#
# 2026-05-12:加 healthchecks.io ping(可选)+ 证书 7 天内到期告警。
# 在 .env 或 cron env 配 SSL_HEALTHCHECK_URL=https://hc-ping.com/<uuid> 启用。
set -uo pipefail   # 注意:这里不用 -e,我们要兜底捕获 certbot 失败

SSL_HEALTHCHECK_URL="${SSL_HEALTHCHECK_URL:-}"
WEBHOOK_URL="${DEPLOY_WEBHOOK_URL:-}"

ping_hc() {
    # $1 = "" 成功, "/fail" 失败, "/start" 开始
    [ -n "$SSL_HEALTHCHECK_URL" ] || return 0
    curl -fsS -m 10 --retry 3 "${SSL_HEALTHCHECK_URL}${1:-}" >/dev/null 2>&1 || true
}

ping_hc "/start"

# webroot 模式：certbot 把 challenge 文件写入 /var/www/certbot/.well-known/acme-challenge/
# nginx 已配置从同路径 serve，外部 ACME 服务器可直接访问
if ! sudo certbot renew --quiet; then
    echo "$(date -Iseconds) certbot renew FAILED"
    ping_hc "/fail"
    if [ -n "$WEBHOOK_URL" ]; then
        curl -fsS -X POST "$WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d '{"msg_type":"text","content":{"text":"⚠️ KB SSL 续期失败,请尽快检查 /var/log/kb-renew.log"}}' \
            || true
    fi
    exit 1
fi

# 续期成功时（证书文件被替换）reload nginx 加载新证书
reload_needed=false
for domain in kb.liii.in kb.tokenwave.cloud uat.tokenwave.cloud skillhub.tokenwave.cloud aihub.tokenwave.cloud kanban.tokenwave.cloud; do
    cert_path="/etc/letsencrypt/live/${domain}/fullchain.pem"
    if [ -f "$cert_path" ] && [ -n "$(find "$cert_path" -mtime -1 2>/dev/null)" ]; then
        echo "$(date -Iseconds) cert renewed for ${domain}"
        reload_needed=true
    fi
    # 7 天内到期告警(无论是否刚续过)
    if [ -f "$cert_path" ]; then
        end_ts=$(date -d "$(openssl x509 -in "$cert_path" -noout -enddate | cut -d= -f2)" +%s 2>/dev/null || echo 0)
        now_ts=$(date +%s)
        days_left=$(( (end_ts - now_ts) / 86400 ))
        if [ "$days_left" -lt 7 ]; then
            echo "⚠️ ${domain} 证书仅剩 ${days_left} 天"
            if [ -n "$WEBHOOK_URL" ]; then
                curl -fsS -X POST "$WEBHOOK_URL" -H "Content-Type: application/json" \
                  -d "{\"msg_type\":\"text\",\"content\":{\"text\":\"⚠️ KB 证书 ${domain} 仅剩 ${days_left} 天到期\"}}" || true
            fi
        fi
    fi
done

if [ "$reload_needed" = true ]; then
    echo "$(date -Iseconds) reloading nginx"
    sudo docker exec kb-system-frontend-1 nginx -s reload
fi

ping_hc ""
