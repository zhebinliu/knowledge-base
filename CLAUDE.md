# KB System

纷享销客 CRM 知识库管理系统。

> **每次开始工作前必读两份**:
>
> 1. [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) — 架构 / 数据流 / 关键文件 / 决策依据(全景图)
> 2. [LEARNING.md](LEARNING.md) — 累计踩坑经验和项目专有约定(具体陷阱)
>
> 新踩坑往 LEARNING.md 追加。架构 / 决策类的变更同步到 PROJECT_OVERVIEW.md。
>
> **语言约定**:本系统所有用户可见文案、代码注释、文档统一用中文。新代码 / 新页面避免出现英文 UI 文案(技术术语如 API / JWT / SQL / LLM 等保留原文)。详见 [LEARNING.md § 9 中文化原则](LEARNING.md)。

## 访问地址

- **生产域名: https://kb.sharewb.cloud**(另有 skillhub.sharewb.cloud / aihub.sharewb.cloud)。2026-09 迁到腾讯云南京后,**tokenwave.cloud 未备案被腾讯拦截**(HTTP 302 到 dnspod webblock 页,HTTPS 直接不通),新机上也没有 tokenwave 证书;要恢复 tokenwave 得先备案。
- ~~kb.liii.in~~ **已弃用**(2026-07-15):其 DNS A 记录指向早已回收的老服务器 IP 34.45.112.217(现为第三方 K8s 集群),用户决定不再维护;edge 已移除该 server block,证书停止续期。
- ~~新前端预览 uat.tokenwave.cloud~~ **已下线**(2026-07-14):域名保留 TLS,统一 302 到 kb.liii.in;frontend-uat 容器可停,Deploy UAT workflow 已禁用。
- **团队看板**: https://kanban.tokenwave.cloud — ⚠️ **未随迁移搬到新机**(DNS 仍指老 GCP IP,老机已失联),当前不可用。Plane(开源 Jira/Linear 替代)。独立 compose `/opt/kanban`(源码在本仓 `kanban/`),独立 postgres/redis/rabbitmq/minio,由 edge nginx 持证反代到 `plane-proxy:80`,模式同 aihub。
- 直连 IP: 175.27.231.228(腾讯云 ap-nanjing,4C/7.4G/50G)。~~34.42.241.99(GCP)~~ 老机,2026-09 起 SSH 超时、已失联

## 部署

- 远程服务器: `ubuntu@175.27.231.228`(腾讯云南京),SSH key: `~/.ssh/id_rsa_github_deploy`,docker 需 sudo(免密)
- **新机特殊点**:`/opt/kb-system` **不是 git 仓库**,且**连不上 github.com** → 源码和 `docker-compose.yml` 都由 CI rsync 下发;服务器专属的 `.env` / `docker-compose.override.yml` / `newserver/` 只在服务器上,不进仓库
- 远程路径: `/opt/kb-system`
- 运行方式(2026-09-24 起):**CI 把源码 rsync 到服务器 `/opt/kb-build`,服务器用腾讯云内网源自己 build**,镜像只存本机(`kb-backend` / `kb-frontend-prod` / `kb-edge`,tag `:latest` / `:prev` / `:sha-xxx`)。不再用 ghcr(新机拉 ghcr 只有 ~76KB/s)
- **完整部署规范:[docs/部署指南.md](docs/部署指南.md)** —— 所有人上线都按它来
- **edge 容器 = 全服务器唯一 80/443 入口**(2026-07-14 从 frontend 拆出,源码 `edge/`):持全部域名证书,按 server_name 反代到各内网容器(frontend / skillhub / aihub / kanban / studio;uat 域名只 302),upstream 全部 resolver+变量延迟解析。日常前后端部署只动内网容器,**不闪断 aihub/skillhub 等其它站点**;只有 `edge/` 或 `docker-compose.yml` 变更才重建 edge(全域名闪断几秒)
- HTTPS: Let's Encrypt 证书在主机 `/etc/letsencrypt/live/<域名>/`，挂载进 edge 容器。续期 cron(root):`17 3 * * * /opt/kb-system/scripts/renew-sharewb-ssl.sh`(新机只有 sharewb 三张证书;`renew-ssl.sh` 是老机 tokenwave 用的)
- **`meeting/` 是普通子目录**(2026-05-25 合并回主仓,之前为 git submodule 指向 zhebinliu/ai-meeting)。Dockerfile 仍用 `COPY meeting/backend/ /app/` overlay 把会议代码叠到主镜像里,详见 [PROJECT_OVERVIEW § 12](PROJECT_OVERVIEW.md)。
- GitHub Actions `secrets.DEPLOY_HOST` / `DEPLOY_USER` 跟服务器绑定,**换服务器时除了改本仓代码,还要去 GitHub Settings → Secrets 同步改**(2026-09-24 已改为 `175.27.231.228` / `ubuntu`)

### 部署流程(只走 GitHub Actions;细节和禁止事项见 [docs/部署指南.md](docs/部署指南.md))

```bash
# push main 只跑 CI Checks(Deploy UAT 已禁用)
git push origin main

# PROD(kb.sharewb.cloud):手动触发 deploy-prod.yml
gh workflow run deploy-prod.yml --ref main -f confirm=deploy

# 看进度
gh run list --limit 5
gh run watch <run-id> --exit-status                           # 阻塞跟一直到结束
```

**不要**手工 SSH 上去 `docker compose build` / 改代码 —— build 由 workflow 在服务器上做(带测试、版本记录、`:prev` 回滚点);**不要 Re-run 很久以前失败的 Deploy PROD**(会部署旧 commit 的代码和 workflow)。
SSH 上服务器仅用于:看日志 / 进 PG / 紧急排错(命令在 [PROJECT_OVERVIEW § 9](PROJECT_OVERVIEW.md))。
`scripts/sync-dev.sh` 是 **本地开发期** fswatch 实时同步(本地改一行就推到服务器测),**不是部署路径** —— 它会绕过 GitHub Actions / ghcr 版本管控,只在本地短平快验证后用,不要在 main 已经能 push 的场景下用。

## 项目结构

- `backend/` — FastAPI + Celery，Python 3.11
- `frontend/` — React + TypeScript + Vite + TailwindCSS
- `edge/` — 80/443 边缘代理(纯 nginx,持全域名证书,反代所有站点)
- 后端端口 8000;frontend 容器只对内网暴露 :80,由 edge 反代进来(`/api/*` 由 frontend 再转 backend)

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
