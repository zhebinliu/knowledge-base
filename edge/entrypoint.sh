#!/bin/sh
# edge 容器启动脚本
#
# 每次启动都从模板重新生成 /etc/nginx/conf.d/default.conf,然后按证书存在与否裁剪:
#   - <SITE>_HTTPS 段:证书不存在 → 整段剥掉
#   - <SITE>_REDIRECT 段:证书存在 → 替换成 301(HTTP → HTTPS)
# 标记段覆盖 skillhub.tokenwave.cloud / aihub.tokenwave.cloud / kanban.tokenwave.cloud。
# 对历史的裸 TLS server 块,缺证书时也会跳过该 vhost,避免影响已配置的站点。
#
# 2026-09 迁到腾讯云南京(175.27.231.228)后:tokenwave.cloud 未备案被腾讯拦截,
# 实际对外走 *.sharewb.cloud(见 nginx.conf 末尾 sharewb 段);新机上只有 sharewb 证书,
# 所以 kb/uat/studio.tokenwave.cloud 的 443 块在这里按缺证书剥掉,不再 fail fast。
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

# kb 的 HTTP 路由通常由默认站点转到 HTTPS。首张证书尚未签发时，
# 临时增加专属 vhost 直连 frontend，保证域名仍可访问并可完成后续验证。
enable_kb_http_fallback_if_cert_missing() {
  cert="/etc/letsencrypt/live/kb.tokenwave.cloud/fullchain.pem"
  [ -f "$cert" ] && return 0

  echo "[entrypoint] kb.tokenwave.cloud 证书未签发,启用 HTTP 回退"
  cat >> "$CONF" <<'EOF'
server {
    listen 80;
    server_name kb.tokenwave.cloud;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        default_type "text/plain";
    }

    location = /health { access_log off; return 200 'ok'; default_type text/plain; }

    location / {
        set $kb_upstream frontend;
        proxy_pass http://$kb_upstream:80;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 180s;
        proxy_connect_timeout 10s;
        proxy_send_timeout 300s;
        proxy_buffering off;
        proxy_request_buffering off;
        client_max_body_size 512m;
    }
}
EOF
}

enable_kb_http_fallback_if_cert_missing

# 历史配置中 uat/studio 的 HTTPS vhost 没有 marker。若证书尚未签发,
# 只移除对应的 443 server 块，保留其余域名正常启动。
drop_tls_vhost_if_cert_missing() {
  domain="$1"
  cert="/etc/letsencrypt/live/${domain}/fullchain.pem"
  [ -f "$cert" ] && return 0

  echo "[entrypoint] ${domain} 证书未签发,跳过其 HTTPS vhost"
  awk -v domain="$domain" '
    function braces(line, tmp, nopen, nclose) {
      tmp = line; nopen = gsub(/[{]/, "{", tmp)
      tmp = line; nclose = gsub(/[}]/, "}", tmp)
      return nopen - nclose
    }
    /^[[:space:]]*server[[:space:]]*\{/ {
      in_server = 1
      depth = braces($0)
      block = $0 ORS
      next
    }
    in_server {
      block = block $0 ORS
      depth += braces($0)
      if (depth == 0) {
        if (index(block, "server_name " domain ";") && index(block, "listen 443 ssl")) {
          # omit only this certificate-dependent TLS server block
        } else {
          printf "%s", block
        }
        in_server = 0
        block = ""
      }
      next
    }
    { print }
  ' "$CONF" > "$CONF.tmp" && mv "$CONF.tmp" "$CONF"
}

drop_tls_vhost_if_cert_missing kb.tokenwave.cloud
drop_tls_vhost_if_cert_missing uat.tokenwave.cloud
drop_tls_vhost_if_cert_missing studio.tokenwave.cloud
drop_tls_vhost_if_cert_missing kb.sharewb.cloud
drop_tls_vhost_if_cert_missing skillhub.sharewb.cloud
drop_tls_vhost_if_cert_missing aihub.sharewb.cloud

nginx -t
exec nginx -g 'daemon off;'
