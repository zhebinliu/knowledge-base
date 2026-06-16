# aihub-tap

aihub.tokenwave.cloud 的透明记录 + 离线分析代理。坐在 nginx 和 new-api 之间,
抓全部 `/v1/*` 请求的 req+resp body(含 SSE 流),写 jsonl 给后续分析。

## 链路

```
[客户端]
  ↓ HTTPS
[kb-system-frontend-1 nginx]
  ↓ HTTP /v1/*  (nginx.prod.conf aihub 块 location ~ ^/v1/)
[aihub-tap:8080]   ← Go tee proxy (main.go)
  ↓ HTTP
[new-api:3000]
  ↓
[Anthropic / 火山方舟 / DeepSeek / ...]
```

非 `/v1/*` 的路径(admin 后台 /api/*、静态资源)走 nginx 的另一个 location 直连 new-api,
**不进 tap**,见 [../frontend/nginx.prod.conf](../frontend/nginx.prod.conf)。

## 部署

```bash
ssh -i ~/.ssh/id_rsa_github_deploy liu@34.67.136.67
cd /opt/aihub-tap
sudo docker compose up -d
sudo docker logs aihub-tap --tail 20
```

改 `main.go` 后:

```bash
# 本地改 + scp
scp -i ~/.ssh/id_rsa_github_deploy main.go liu@34.67.136.67:/opt/aihub-tap/
# 服务器重启容器(go run 会重编译,~3 秒)
ssh -i ~/.ssh/id_rsa_github_deploy liu@34.67.136.67 "cd /opt/aihub-tap && sudo docker compose restart aihub-tap"
```

## 日志输出

| 文件 | 内容 | 大小预估 |
|---|---|---|
| `/opt/aihub-tap/logs/tap.jsonl` | 每个 /v1/* 请求一行 JSON,含 req_body/resp_body 全文 | ~35MB/周(全 SSE 流) |
| `/opt/aihub-tap/logs/rewrite-suggestions.jsonl` | analyze-rewrite.py 输出的改写建议(Level 0) | 每条几 KB |
| `/opt/aihub-tap/logs/rewrite-report-YYYY-MM-DD.txt` | 每日 cron 跑出的可读报告 | 每天 ~3 KB |
| `/opt/aihub-tap/logs/rewrite-cron.log` | cron 运行心跳 | 一行/天 |

## 快速查询示例

```bash
# 最近 5 条调用的状态码
ssh -i ~/.ssh/id_rsa_github_deploy liu@34.67.136.67 \
  "sudo tail -5 /opt/aihub-tap/logs/tap.jsonl | python3 -c \"
import sys, json
for line in sys.stdin:
    d = json.loads(line)
    print(d['ts'][:19], d['status'], d['path'], d['client_ip'])
\""

# 今天所有 200 调用的总 input tokens
ssh -i ~/.ssh/id_rsa_github_deploy liu@34.67.136.67 \
  "sudo grep '2026-06-16' /opt/aihub-tap/logs/tap.jsonl | python3 -c \"...\""
```

---

# 🎯 Prompt Cache 改写计划 (Rewrite Plan)

## 背景

2026-06-11 起观察到 tingya 的 APL 修复 agent 调用 Claude sonnet,
**system prompt 86K 字符单 block + cache_control 加在末尾**,
被尾部 1K 动态需求文字击穿,**6 天累计 cache 命中率 4-34%**,
**等价付费 79-114%**(多次跑赢成本反而比不用 cache 还贵)。

详见 [../LEARNING.md § 14](../LEARNING.md)。

已通过私信给 tingya 发了重构建议(拆 `system` 为多 content block + 多 cache_control 断点),
但她尚未完全落地。所以服务端启动这个改写计划,**网关层自动注入 cache_control**。

## 三级渐进方案

| 等级 | 行为 | 风险 | 适用 |
|---|---|---|---|
| **Level 0** | dry-run 离线分析,只统计 / 写建议日志,**不改请求** | 0 | 当前阶段,数据收集 |
| **Level 1** | opt-in 在线改写,只对 token name 带 `[auto-cache]` 后缀的生效 | 低,失败可切回默认 token | 选取自愿试用的 token 用户 |
| **Level 2** | 全局改写,写入「使用手册」明示,支持 `X-Aihub-No-Rewrite: 1` opt-out | 中,silently 修改用户请求是责任 | Level 1 稳定 2 周后再考虑 |

## 算法 (LCP-based 自适应拆分)

```
[每个 client_ip] 维护 deque(maxlen=10) 历史 system 文本

收到新请求:
  1. 提取 system[0].text (仅当 system 是单 block 时)
  2. 跟历史 N 条算最长公共前缀(LCP)
  3. LCP >= 5000 字符? 否 → 跳过
  4. 从 LCP 位置往回找最近的 \n## / \n### / \n``` markdown 边界
  5. 边界 >= 1000? 否 → 跳过
  6. 在边界处注入 cache_control,生成两个 content block:
     - block 0: [0..边界] 加 cache_control:ephemeral
     - block 1: [边界..尾部] 加 cache_control:ephemeral
  7. 转发给上游
```

**为什么 LCP-based** (而不是固定切点)?

- Domain-agnostic: 不只对 tingya 的 APL 文档结构生效,任何客户端有稳定 prefix 都自动受益
- 自适应: 不用维护"在第 N 字符切"这种规则,prompt 演变自动跟上
- 保守: 没有 5K 以上稳定前缀就不动,避免误伤

## 当前状态 (2026-06-16)

**Level 0 部署完成 + 历史数据跑通**

| | |
|---|---|
| 脚本 | [`analyze-rewrite.py`](analyze-rewrite.py) → `/opt/aihub-tap/analyze-rewrite.py` |
| 包装 | [`run-daily-report.sh`](run-daily-report.sh) → `/opt/aihub-tap/run-daily-report.sh` |
| cron | `0 9 * * * /opt/aihub-tap/run-daily-report.sh` |
| 输出 | `/opt/aihub-tap/logs/rewrite-report-YYYY-MM-DD.txt` (保留 14 天) |
| 历史首跑 | 194 Claude 请求 / 75 条建议 / 估算可省 $7.37/周 |

## 决策门控 (Gates)

**Level 0 → Level 1 条件**(全满足才升级):

- [ ] Level 0 跑满 7 天,每日"建议改写数 / 调用数"比例稳定在 30%+
- [ ] 累计估算可省 ≥ $30/月 (低于这个 ROI 不划算,不如等 tingya 自己改)
- [ ] 切点位置稳定(不会跨多个 markdown 边界跳动)
- [ ] tingya 在期间未自己改造 system 结构(她改了就直接关掉此计划)

**Level 1 → Level 2 条件**(全满足):

- [ ] Level 1 至少 1 名用户使用满 2 周
- [ ] 无 cache_control 注入引发的 4xx/5xx 报告
- [ ] tingya 视角:命中率从 < 15% 提升到 > 60%
- [ ] 在 `AIHUB_使用手册.md` 写明改写行为 + opt-out 方法

**任意时刻自动降级触发条件**:

- Anthropic 修改 cache_control 限制(从 4 → 2 断点)
- new-api 升级导致 `pass_through_body_enabled` 行为变化
- aihub-tap 容器 OOM / crash > 3 次/天
- tingya 报告调用异常

## 文件清单

| 路径 | 用途 |
|---|---|
| `main.go` | Go tee-proxy 主体(Level 0 阶段不改) |
| `docker-compose.yml` | 服务编排 |
| `analyze-rewrite.py` | Level 0 离线分析脚本 |
| `run-daily-report.sh` | cron 入口 wrapper |
| `README.md` | 本文档 |
| `.gitignore` | 忽略 `logs/` |

## 操作历史

| 日期 | 事件 |
|---|---|
| 2026-06-11 | aihub-tap 初始部署,捕获 tingya APL agent 9 类模型调用 |
| 2026-06-11 | 发现 new-api `pass_through_body_enabled=false` 导致 cache_control 被 strip。开启 Claude 渠道透传 |
| 2026-06-13 | 给 tingya 发改造建议 v1(单 → 多 content block + cache_control) |
| 2026-06-15 | 唯一一天 cache 命中率达 33.9%(等价成本 79%) |
| 2026-06-16 | 6 天观察后启动改写计划:Level 0 部署 + 历史数据跑通(75 条建议) |
| 2026-06-17 | (待) 首个 cron 周期报告 |
