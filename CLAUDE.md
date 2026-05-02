# KB System

纷享销客 CRM 知识库管理系统。

> **每次开始工作前先扫一眼 [LEARNING.md](LEARNING.md)** — 沉淀的踩坑经验和项目专有约定。新踩坑也往那里追加。

## 访问地址

- 生产域名: https://kb.liii.in（强制 HTTPS）
- 备用域名: https://kb.tokenwave.cloud（同一服务器，独立证书）
- 直连 IP: 34.45.112.217（80→301 跳 HTTPS）

## 部署

- 远程服务器: `liu@34.45.112.217` (GCP)，SSH key: `/Users/zhebinliu/Documents/projects/private_key`
- 远程路径: `/opt/kb-system`
- 运行方式: Docker Compose (postgres, qdrant, redis, minio, backend, frontend, celery_worker)
- 同步脚本: `scripts/sync-dev.sh`（fswatch + rsync）
- HTTPS: Let's Encrypt 证书在主机 `/etc/letsencrypt/live/kb.liii.in/`，挂载进 frontend 容器。续期 cron `17 3 * * * /opt/kb-system/scripts/renew-ssl.sh`

### 部署流程

```bash
# 1. rsync 同步
rsync -avz --delete --exclude=.git --exclude=.env --exclude=__pycache__ --exclude="*.pyc" --exclude=node_modules --exclude=dist --exclude=.DS_Store -e "ssh -i /Users/zhebinliu/Documents/projects/private_key -o StrictHostKeyChecking=no" ./ liu@34.45.112.217:/opt/kb-system/

# 2. 远程 rebuild + restart（按需选择 backend / frontend）
ssh -i /Users/zhebinliu/Documents/projects/private_key liu@34.45.112.217 "cd /opt/kb-system && sudo docker compose build backend frontend && sudo docker compose up -d backend frontend"
```

## 项目结构

- `backend/` — FastAPI + Celery，Python 3.11
- `frontend/` — React + TypeScript + Vite + TailwindCSS
- 后端端口 8000，前端 nginx 端口 80/443 反代 `/api/*` 到 backend

## 开发规范

- **不询问直接执行**：所有 git / rsync / docker / SQL / curl 等命令直接跑，不要二次确认。包含 commit + push + rsync + rebuild 全流程。
- **复杂任务先写 task.md**：当用户给出 ≥2 个独立需求点时，第一步在 `task.md` 里拆解任务清单（含子任务、边界、验收标准），逐项推进时即时勾掉并补充实际修改。
- **边界管理**：每个任务自成闭环，不顺手改无关代码、不引入新依赖、不破坏既有 API 形状（除非任务本身就是改 API）。任务之间避免数据库 schema 互相耦合。
- **单任务完成后必测**：
  - 后端改动：`python -c "import ..."` 验证可加载、curl 验证接口
  - 前端改动：`npx tsc --noEmit -p tsconfig.json` 通过
  - DB 改动：跑 alembic 或手动 SQL 验证表结构
- **每完成一个 Block 部署一次**：单 task 不必每次都部署，但一组逻辑相关的任务完成后部署 + 端到端连通测试。
- **task.md 实时更新**：每完成一项划掉，遇到阻塞或范围调整即时记录在文件里。
- Git: 直接在 main 上开发，commit + push 不需确认。
- 分支: 不开 feature 分支。

## 产品决策（已确认，勿轻易回退）

- **项目洞察阶段：文档喂全文，不走切片召回**（用户 2026-04-29 明确决策）
  - `backend/services/agentic/executor.py` 的 `_build_sources_index` 默认 `max_chars_per_doc=30000`
  - 单份文档 ~10-12k tokens；一次 insight 最多 4-7 份 D 类文档，总文档证据 50-80k tokens，加 prompt + 输出仍在 Opus 200k 上下文里富余
  - SOW / 方案 / 合同 / 交接单这类核心文档要让 LLM 看到全文，避免切片漏掉关键条款
  - 长文档切片召回（RAG）作为后续优化方向，不在当前阶段做
