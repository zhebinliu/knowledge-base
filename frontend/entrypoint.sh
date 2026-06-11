#!/bin/sh
# frontend 容器启动脚本(对 prod 和 uat 镜像都生效;uat 模板无 marker → 无操作)
#
# 每次启动都从模板重新生成 /etc/nginx/conf.d/default.conf,然后按证书存在与否裁剪:
#   - <SITE>_HTTPS 段:证书不存在 → 整段剥掉
#   - <SITE>_REDIRECT 段:证书存在 → 替换成 301(HTTP → HTTPS)
# 目前支持的 SITE:skillhub.tokenwave.cloud / aihub.tokenwave.cloud / kanban.tokenwave.cloud
set -e

TPL=/etc/nginx/templates/default.conf.tpl
CONF=/etc/nginx/conf.d/default.conf

# 1) 每次都从模板重置
cp "$TPL" "$CONF"

# 2) 通用裁剪函数:按证书存在与否处理一个 SITE 段
#    $1=域名  $2=marker 前缀(大写,例如 SKILLHUB / AIHUB)
trim_site() {
  domain="$1"
  prefix="$2"
  cert="/etc/letsencrypt/live/${domain}/fullchain.pem"
  if [ ! -f "$cert" ]; then
    echo "[entrypoint] ${domain} 证书未签发,临时禁用 HTTPS 段"
    sed -i "/=== ${prefix}_HTTPS_START ===/,/=== ${prefix}_HTTPS_END ===/d" "$CONF"
  else
    echo "[entrypoint] ${domain} 证书已就位,启用 HTTPS + 301 重定向"
    awk -v start="=== ${prefix}_REDIRECT_START ===" -v end="=== ${prefix}_REDIRECT_END ===" '
      $0 ~ start {
        print "    location / { return 301 https://$host$request_uri; }";
        skip=1; next;
      }
      $0 ~ end { skip=0; next; }
      !skip { print }
    ' "$CONF" > "$CONF.tmp" && mv "$CONF.tmp" "$CONF"
  fi
}

trim_site skillhub.tokenwave.cloud SKILLHUB
trim_site aihub.tokenwave.cloud AIHUB
trim_site kanban.tokenwave.cloud KANBAN

nginx -t
exec nginx -g 'daemon off;'
