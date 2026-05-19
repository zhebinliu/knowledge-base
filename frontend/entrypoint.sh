#!/bin/sh
# frontend 容器启动脚本(对 prod 和 uat 镜像都生效;uat 模板无 marker → 无操作)
#
# 每次启动都从模板重新生成 /etc/nginx/conf.d/default.conf,然后按证书存在与否裁剪:
#   - skillhub.tokenwave.cloud 证书不存在 → 剥掉 SKILLHUB_HTTPS_START..END 段
#   - 证书存在 → 把 SKILLHUB_REDIRECT_START..END 段替换成 301(HTTP → HTTPS)
set -e

TPL=/etc/nginx/templates/default.conf.tpl
CONF=/etc/nginx/conf.d/default.conf
SKILLHUB_CERT=/etc/letsencrypt/live/skillhub.tokenwave.cloud/fullchain.pem

# 1) 每次都从模板重置
cp "$TPL" "$CONF"

# 2) 按证书存在与否裁剪 skillhub 段(uat 镜像模板无 marker → sed/awk 无操作)
if [ ! -f "$SKILLHUB_CERT" ]; then
  echo "[entrypoint] skillhub.tokenwave.cloud 证书未签发,临时禁用 HTTPS 段"
  sed -i '/=== SKILLHUB_HTTPS_START ===/,/=== SKILLHUB_HTTPS_END ===/d' "$CONF"
else
  echo "[entrypoint] skillhub.tokenwave.cloud 证书已就位,启用 HTTPS + 301 重定向"
  awk '
    /=== SKILLHUB_REDIRECT_START ===/ {
      print "    location / { return 301 https://$host$request_uri; }";
      skip=1; next;
    }
    /=== SKILLHUB_REDIRECT_END ===/ { skip=0; next; }
    !skip { print }
  ' "$CONF" > "$CONF.tmp" && mv "$CONF.tmp" "$CONF"
fi

nginx -t
exec nginx -g 'daemon off;'
