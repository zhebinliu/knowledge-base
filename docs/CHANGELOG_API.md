# 平台更新日志 API(Changelog API)

对外只读接口,让第三方系统 / 客户站点定期拉取「知识库平台」的功能更新记录。
数据由管理员在后台维护(手工写 / commit 草稿润色后 publish),对外只返回 `is_published = true` 的条目。

## 基础信息

- **Base URL**: `https://kb.liii.in`(备用:`https://kb.tokenwave.cloud`)
- **鉴权方式**: HTTP 请求头 `X-API-Key: mcp_xxxxxxxx`
  - 复用平台既有的 MCP API Key 体系:管理员在 KB 后台 → 用户设置里为你生成一个 `mcp_` 前缀的 key,并开启 `api_enabled`
  - 一个 key 一个身份,调用日志(who / when / what)会自动落到 `api_call_logs` 表
- **限流**: 每个 IP 每分钟 60 次(超限返回 429)
- **响应格式**: JSON,时间字段一律 ISO8601 UTC(`2026-07-03T09:12:34+00:00`)

## 端点

### 1. 列表 · `GET /api/public/changelog`

Query 参数(全可选):

| 参数 | 类型 | 说明 |
|---|---|---|
| `category` | string | `feature` / `fix` / `improvement` / `breaking` / `security` |
| `tag` | string | 单个标签精确匹配,如 `会议纪要` |
| `since` | ISO8601 | 只返回 `published_at >= since` 的条目,增量拉取用 |
| `limit` | int | 默认 20,最大 100 |
| `offset` | int | 默认 0 |

响应:

```json
{
  "items": [
    {
      "id": "8f0e7ac2-...",
      "version": "v1.4.0",
      "title": "会议纪要支持多段音频合并转写",
      "content_md": "## 新增\n- ...",
      "category": "feature",
      "tags": ["会议纪要"],
      "published_at": "2026-07-01T02:00:00+00:00"
    }
  ],
  "total": 42,
  "limit": 20,
  "offset": 0,
  "next_offset": 20
}
```

### 2. 最新一条 · `GET /api/public/changelog/latest`

方便"官网首页展示最新版本号"这类场景,不需要翻列表。可选 `?category=feature` 只拿最新新功能。

### 3. 详情 · `GET /api/public/changelog/{id}`

按 id 拉单条完整内容(markdown 全文)。

## curl 示例

```bash
# 拉最近 20 条更新
curl -H "X-API-Key: mcp_xxxxxxxxxxxxxxxx" \
  https://kb.liii.in/api/public/changelog

# 拉 2026-07-01 之后的新功能
curl -H "X-API-Key: mcp_xxxxxxxxxxxxxxxx" \
  'https://kb.liii.in/api/public/changelog?category=feature&since=2026-07-01T00:00:00Z'

# 拉最新一条
curl -H "X-API-Key: mcp_xxxxxxxxxxxxxxxx" \
  https://kb.liii.in/api/public/changelog/latest
```

## 错误码

| HTTP | 说明 |
|---|---|
| 401 | 缺少 X-API-Key / key 无效 / 用户被禁用 |
| 403 | key 有效但 `api_enabled = false`,联系管理员开启 |
| 404 | 条目不存在或未发布 / `latest` 场景下当前无已发布条目 |
| 429 | 触发限流(60 次/分钟) |

## 内部维护(admin 使用,不对外)

以下端点要求 admin JWT(平台后台登录后拿到),对外无需关心:

```
GET    /api/admin/changelog                # 列表(含草稿)
POST   /api/admin/changelog                # 创建(默认草稿 is_published=false)
PUT    /api/admin/changelog/{id}           # 编辑
DELETE /api/admin/changelog/{id}
POST   /api/admin/changelog/{id}/publish   # 发布
POST   /api/admin/changelog/{id}/unpublish # 下线
```

## 变更记录

- 2026-07-03 初版,复用 `users.mcp_api_key` 鉴权,不新建 api_keys 表
