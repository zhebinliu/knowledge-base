# edge — 全服务器唯一 80/443 入口(纯 nginx 反代,无业务 dist)
# build context 是仓库根(跟其他镜像一致),便于 COPY frontend/public/maintenance.html
FROM nginx:1.27-alpine

# 模板放只读路径;entrypoint 每次启动都重新生成 default.conf,避免上次裁剪结果被沿用
COPY edge/nginx.conf /etc/nginx/templates/default.conf.tpl
COPY edge/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# kb/uat 内网容器重建的几秒钟内,edge 对 502/504 兜这个维护页
COPY frontend/public/maintenance.html /usr/share/nginx/edge/maintenance.html

EXPOSE 80 443

ENTRYPOINT ["/entrypoint.sh"]
