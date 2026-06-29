# 任务:会议流程图 mermaid 定期巡检 + 修复

目标:会议 `meetings.process_flows.flows[].mermaid` 里渲染失败的流程图,定期巡检自动修复。

## 关键发现(基于真实数据 109 块 mermaid,全是 flowchart)
- 80 块正常,**29 块渲染失败**。失败仅 3 个确定性类别:
  1. **保留字 `end` 作节点 id**(`g --> end([结束])` / `e --> end`)——后端 `_normalize_mermaid` 早有修复,但这些会议在该修复(2026-06-06)之前生成,存量没回灌。
  2. **菱形括号错配** `c --> d{风险等级判定]`(`{` 开 `]` 闭)。
  3. **一个字段塞多张图**(`flowchart...---flowchart...`)——meeting 46。
- 修复方案验证:repair(保留字+菱形) + split(按 `---`/多 header 拆图)后,**113/113 子图全部 mermaid.parse 通过**。**纯确定性,无需 LLM / 无需浏览器**。
- 检测可行性:node + jsdom 跑 mermaid.parse 可精确校验(纯 node 会被 DOMPurify 噪声干扰)。但**修复本身是纯字符串变换**,Python 即可,巡检任务不需要 JS。

## 设计(纯 Python,Celery beat)
- 修复=确定性变换,只动「检测到的坏 token」,不会把好图改坏;幂等。
- 校验局限:Python 不跑 mermaid,只按结构信号(保留字/错配括号/多 header)检测+修。未知新类别会漏(诚实记 log,不瞎猜)。

## 清单
- [ ] T1 backend/services/meeting/mermaid_repair.py:repair_mermaid() + split_mermaid_diagrams() + repair_process_flows()。纯函数。
- [ ] T1b 用真实数据交叉验证:Python 产出 → node mermaid.parse 全过。
- [ ] T2 pipeline._normalize_mermaid 委托给 repair_mermaid(生成时就修菱形,新会议不再坏)。
- [ ] T3 Celery 任务 sweep_meeting_mermaid + 注册 beat_schedule(每小时);首跑回灌存量。
- [ ] T4 py_compile + 部署 + 验证(看日志修复计数 / 会议页流程图恢复)。

## 进展
- T0 调研完成(见上)。范围限会议 process_flows(用户说「会议里」);design 文档的 stateDiagram 暂不纳入,同套 util 后续可复用。
