# Task: 增强 MCP — 开放全站「读取项目资料 + 写/动作」能力(2026-06-25)

## 背景
用户要把全站能力开放成 MCP,让用户读取自己项目的资料。现有 `backend/api/mcp.py` 已有 8 个只读工具 + 完整 per-user 项目隔离(地基好)。
- 范围决策:**只读补全 + 写/动作**(用户 2026-06-25 确认)
- 鉴权决策:**维持管理员授权**(api_enabled 仍由 admin 开,不改策略)

## 关键约束 / 复用点
- 只动 `backend/api/mcp.py` + `backend/api/outputs.py`(两者都是主后端单副本,**非 overlay**,不用双改)
- 新工具**复用现有逻辑**,不重复硬编码:
  - kind 列表 ← `from api.outputs import KIND_TITLES`(根治 §6.8 第 4 处漂移)
  - 生成触发 ← 抽 `enqueue_generation()` 共享给 HTTP 端点 + MCP
  - 会议 DTO / ACL ← `from api.meeting import _meeting_dto, _requirement_dto, _load_meeting_owned`
  - 智能建议 ← `from services.smart_advice import get_advice_only`(只读,不触发 LLM)
- 写工具必须校 **write** 权限(LEARNING §10.1),不是 read
- 后端改动 → 部署走 `deploy-prod`(UAT 共享后端)

## Block 1 — 修复 stale kind 同步(只读)
- [x] mcp.py 顶部 `from api.outputs import KIND_TITLES`
- [x] `get_project_status` 的 KINDS / KIND_LABELS 改为 KIND_TITLES 全 13 个
- [x] `list_outputs` 的 `kind` 枚举改为 `list(KIND_TITLES)`

## Block 2 — 新增只读工具
- [x] `get_document(doc_id)` — 文档全文 markdown(ACL: doc.project_id → read)
- [x] `list_meetings(project)` — 项目下会议清单(id/title/status/时间)
- [x] `get_meeting(meeting_id, include_transcript=false)` — 纪要+需求+业务流程+干系人(可选转写)
- [x] `get_smart_advice(project)` — 项目智能建议(只读 cache,不触发生成)

## Block 3 — 新增写/动作工具(校 write 权限)
- [x] outputs.py 抽 `async def enqueue_generation(*, user, project_id, kind, session) -> CuratedBundle`,原 HTTP 端点改为调用它
- [x] `generate_output(project, kind)` — 触发任意 13 kind 生成
- [x] `create_meeting_from_text(transcript, title?, project?)` — 建会议 + 自动 process

## Block 4 — server 元数据 / 鉴权收尾
- [x] `_resolve_project_for(user, ref, level="read")` 加 level 参数,写工具传 "write"
- [x] TOOLS 描述加「【读】/【写】」前缀
- [x] `initialize` instructions 重写:分读/写两组 + 写需 write 权限
- [x] tools/call dispatch 接上全部新 handler

## 验收
- [x] `python -m py_compile backend/api/mcp.py backend/api/outputs.py` 通过
- [x] ApiDocs 公开页同步全部 14 工具(读/写分组),frontend tsc 仅报无关缺包错(@xyflow/elkjs)
- [ ] 部署 deploy-prod 后,MCP key 调 tools/list 看到全部工具;generate_output 能触发生成(待部署验证)
