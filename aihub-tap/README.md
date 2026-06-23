# aihub-tap

aihub.tokenwave.cloud 的透明记录 + 离线分析代理。坐在 nginx 和 new-api 之间,
抓全部 `/v1/*` 请求的 req+resp body(含 SSE 流),写 jsonl 给后续分析。

## 链路

```
[客户端]
  ↓ HTTPS
[kb-system-frontend-1 nginx]
  ├─ /v1/*           → aihub-tap:8080 → new-api:3000  (tee proxy + 写 tap.jsonl)
  ├─ /aihub-admin/*  → aihub-tap:8080(X-Admin-Key) → new-api-postgres:5432  (admin 查询)
  └─ 其它            → new-api:3000  (admin 后台 / 静态资源)
```

aihub-tap 加入 2 个 docker network:`kb-system_default`(frontend nginx 反代用) +
`new-api_new-api-internal`(直连 new-api-postgres 用)。

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

---

# 🛠 Admin Query API

管理员视角查全部用户余额 + 时段消耗明细。鉴权 `X-Admin-Key` header,key 存
`/opt/aihub-tap/.env` 的 `AIHUB_ADMIN_KEY`。

## 接口 1:列全部用户余额

```bash
curl -H "X-Admin-Key: <secret>" https://aihub.tokenwave.cloud/aihub-admin/balances
```

返回:

```json
{
  "count": 10,
  "users": [
    {
      "id": 2, "username": "tingya", "role": 10, "group": "default",
      "email": "", "status": 1,
      "remaining_usd": 7.83, "used_usd": 113.16,
      "token_count": 10, "tokens_used_usd": 113.17,
      "_raw": { "remaining_quota": 3914574, "used_quota": 56578405 }
    }
  ]
}
```

- `*_usd` = quota / 500000(new-api 默认换算)
- `_raw` = 原始 quota 单位,需要精确计算用
- `token_count` / `tokens_used_usd` 是该用户名下所有令牌的汇总

## 接口 2:时段内消耗明细

```bash
curl -H "X-Admin-Key: <secret>" \
  "https://aihub.tokenwave.cloud/aihub-admin/consumption?start=2026-06-16&end=2026-06-23&group_by=day"
```

参数:

| 参数 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `start` | ❌ | 24h 前 | unix 秒 / RFC3339 / `YYYY-MM-DD` / `YYYY-MM-DD HH:MM:SS`(默认北京时间) |
| `end` | ❌ | 当前时间 | 同上 |
| `group_by` | ❌ | `day` | `hour` / `day` / `month` |
| `model` | ❌ | | 过滤模型名,精确匹配 |
| `user` | ❌ | | 过滤 username,精确匹配 |
| `token` | ❌ | | 过滤 token_name,精确匹配 |

返回:

```json
{
  "start": "2026-06-16T00:00:00+08:00",
  "end": "2026-06-23T00:00:00+08:00",
  "group_by": "day",
  "summary": {
    "total_calls": 678,
    "total_prompt": 10350731,
    "total_completion": 1420805,
    "total_quota": 20471627,
    "total_usd": 40.94
  },
  "rows": [
    {
      "bucket": "2026-06-16T00:00:00+08:00",
      "username": "tingya", "token": "claude", "model": "claude-sonnet-4-6",
      "calls": 9, "prompt": 280000, "completion": 12500, "tokens_total": 292500,
      "quota": 1128650, "usd": 2.26
    }
  ]
}
```

## 鉴权 / 错误码

| HTTP | 含义 |
|---|---|
| 200 | 成功 |
| 400 | 参数格式错(如 group_by 不是 hour/day/month) |
| 403 | 没带 X-Admin-Key 或 key 错 |
| 404 | 路径不对(不是 /aihub-admin/balances 也不是 /consumption) |
| 500 | SQL 错误,日志看 `docker logs aihub-tap` |
| 503 | postgres 没连上 |

## 凭证管理

`/opt/aihub-tap/.env`(权限 600,只 root 可读):

```
AIHUB_ADMIN_KEY=<40 字符随机串>
NEW_API_POSTGRES_DSN=postgres://newapi:<password>@new-api-postgres:5432/newapi
```

模板见 [.env.example](.env.example)。**.env 在 .gitignore 里,不入 git**。

旋转 admin key 步骤:

```bash
# 1. 本地生成新 key
openssl rand -base64 32 | tr -d '/+=' | cut -c1-40

# 2. 服务器更新 .env
sudo sed -i 's/^AIHUB_ADMIN_KEY=.*/AIHUB_ADMIN_KEY=新KEY/' /opt/aihub-tap/.env

# 3. 重启容器(env_file 在启动时读)
cd /opt/aihub-tap && sudo docker compose restart aihub-tap
```

## 调用模板(Python)

```python
import httpx

BASE = "https://aihub.tokenwave.cloud/aihub-admin"
HEAD = {"X-Admin-Key": "<secret>"}

def list_balances():
    return httpx.get(f"{BASE}/balances", headers=HEAD, timeout=10).json()

def usage(start: str, end: str, **filters):
    params = {"start": start, "end": end, "group_by": "day", **filters}
    return httpx.get(f"{BASE}/consumption", headers=HEAD, params=params, timeout=30).json()

# 用法
print(list_balances()["users"][:3])
print(usage("2026-06-16", "2026-06-23", model="claude-sonnet-4-6"))
```

---

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
