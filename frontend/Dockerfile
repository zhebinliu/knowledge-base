# ── Stage 1: build ───────────────────────────────────────────────────────────
# 2026-05-19 起 build context 改为仓库根(为了让 COPY 能看到 meeting/ submodule),
# 所有路径都从仓库根算起。
FROM node:20-alpine AS builder
WORKDIR /app

COPY frontend/package*.json ./
# --legacy-peer-deps: liquid-glass-react 声明 peer react>=19,但 React 18 运行时兼容
RUN npm ci --prefer-offline --legacy-peer-deps

# overlay:先 frontend/ 整体,再 meeting/frontend/ 把 meeting 的 6 个 tsx 落到 src/ 对应位置
COPY frontend/ /app/
COPY meeting/frontend/ /app/
RUN npm run build

# ── Stage 2: serve ───────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

# ENV 选择 nginx 配置:
#   prod → nginx.prod.conf(kb.liii.in + kb.tokenwave.cloud + uat.tokenwave.cloud TLS 入口)
#   uat  → nginx.uat.conf(只对 docker 内网暴露 :80,由 frontend-prod 反代进来)
ARG ENV=prod
ENV BUILD_ENV=${ENV}

COPY --from=builder /app/dist /usr/share/nginx/html
# 模板放只读路径;entrypoint 每次启动都重新生成 default.conf,避免上次裁剪结果被沿用
COPY frontend/nginx.${ENV}.conf /etc/nginx/templates/default.conf.tpl
COPY frontend/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# 兜底检查 — build 时若 ARG ENV 不是 prod/uat,启动会因为找不到模板而失败
RUN test -f /etc/nginx/templates/default.conf.tpl

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
