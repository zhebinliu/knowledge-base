# ── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
# --legacy-peer-deps: liquid-glass-react 声明 peer react>=19,但 React 18 运行时兼容
RUN npm ci --prefer-offline --legacy-peer-deps

COPY . .
RUN npm run build

# ── Stage 2: serve ───────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

# ENV 选择 nginx 配置:
#   prod → nginx.prod.conf(kb.liii.in + kb.tokenwave.cloud + uat.tokenwave.cloud TLS 入口)
#   uat  → nginx.uat.conf(只对 docker 内网暴露 :80,由 frontend-prod 反代进来)
ARG ENV=prod
ENV BUILD_ENV=${ENV}

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.${ENV}.conf /etc/nginx/conf.d/default.conf

# 兜底检查 — build 时若 ARG ENV 不是 prod/uat,启动会因为找不到配置而失败
RUN test -f /etc/nginx/conf.d/default.conf

EXPOSE 80
