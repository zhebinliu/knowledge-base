# 任务:会议 Co-pilot / 实时录音 UX 一批(2026-06-30)

- [x] R5 新建会议点录音按钮后置灰 + 显示「正在启动会议」防重复点(starting state)
- [ ] R3 建议小卡片加「待定」动作(存着下次调研问)。状态 pending;❓后端加 status + 端点 + 卡片按钮。
       未定:下次调研自动带出(跨会议)放本轮还是后续。
- [ ] R2 详情页转写/建议分栏中间竖条可拖动改左右宽度(draggable splitter + 宽度 state)
- [ ] R1 详情页「快速定位」横排 chip 改右侧**竖向时间轴**:小圆点按分类着色,hover 展开时间点+问题类型
- [ ] R4 实时会议看板:共识 + Copilot 建议,现场对客户对齐;录音中默认向右收起(过渡动画)、可点开;
       过建议时可持续撤销「需明确/遗漏」点。❓「已达成的共识」来源待确认(AI 抽 / 手动确认 / 两者)。

> R1/R2/R4 都重塑 Co-pilot 右侧面板,耦合 → 等 R4 设计定了一起做,避免返工。R3/R5 独立。

---

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
- T0 调研完成。范围限会议 process_flows;design 文档 stateDiagram 暂不纳入,util 后续可复用。
- [x] T1/T1b/T2/T3/T4 全部完成。
- [x] 踩坑:backend overlay clobber —— meeting_tasks.py / pipeline.py 有 meeting/backend 副本,COPY meeting/backend/ /app/ 覆盖,只改 backend/ 那份不上线。两份已同步(commit ce6acc2)。
- [x] 部署 ce6acc2,prod 手动跑一次:scanned=28 fixed=9 repaired=26 split=4;再跑 fixed=0(幂等);beat 已注册 sweep_meeting_mermaid(每小时)。
- 完成。
