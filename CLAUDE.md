# KB System

纷享销客 CRM 知识库管理系统。

## 部署

- 远程服务器: `liu@34.45.112.217` (GCP)，SSH key: `~/.ssh/id_rsa_github_deploy`
- 远程路径: `/opt/kb-system`
- 运行方式: Docker Compose (postgres, qdrant, redis, minio, backend, frontend, celery_worker)
- 同步脚本: `scripts/sync-dev.sh`（fswatch + rsync）

### 部署流程

```bash
# 1. rsync 同步
rsync -avz --delete --exclude=.git --exclude=.env --exclude=__pycache__ --exclude="*.pyc" --exclude=node_modules --exclude=dist --exclude=.DS_Store -e "ssh -i ~/.ssh/id_rsa_github_deploy -o StrictHostKeyChecking=no" ./ liu@34.45.112.217:/opt/kb-system/

# 2. 远程 rebuild + restart
ssh -i ~/.ssh/id_rsa_github_deploy liu@34.45.112.217 "cd /opt/kb-system && sudo docker compose build backend frontend && sudo docker compose up -d backend frontend"
```

## 项目结构

- `backend/` — FastAPI + Celery，Python 3.11
- `frontend/` — React + TypeScript + Vite + TailwindCSS
- 后端端口 8000，前端 nginx 端口 80 反代 `/api/*` 到 backend

## 开发规范

- Git 推送: 改完代码直接 commit 并 push 到 main，不需要确认
- 部署: 改完代码直接 rsync + rebuild，不需要确认
- 分支: 直接在 main 上开发
