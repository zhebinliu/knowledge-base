# 任务:可视化拖拽流程图编辑器(B 方案)

目标:方案设计阶段文档里的 ```mermaid flowchart 块,支持 React Flow 可视化拖拽编辑(加/删节点、连线、改 label),保存时序列化回 mermaid 写回 markdown(PUT /content),不破坏现有 mermaid-in-markdown 数据模型与下游/引用。

复用资产:`@xyflow/react` v12 已在依赖里(ProjectCanvas 用着)、`elkLayout.ts`(ELK 布局)、`OrthEdge`(正交连线)、后端 `PUT /content` 已支持 design 三 kind。

## 边界
- 只支持 mermaid `flowchart`/`graph` 类型;sequence/gantt/其他不接(检测到只给源码编辑)。
- 一个文档可能多个 mermaid 块 —— 编辑器针对**单个块**操作,精确替换回原 fence。
- 不追求 mermaid 全语法无损;支持子集(节点+形状+方向+连线+label+subgraph 尽量),其余降级保留原文。

## 清单
- [ ] T0 可行性 spike:从本项目 design 文档取真实 mermaid 块,验证 parse→{nodes,edges}→serialize→mermaid round-trip(不做 UI)。round-trip 不过关则回报、调整边界。
- [ ] T1 mermaidFlow.ts:parse(mermaid)→{nodes,edges,direction};serialize(...)→mermaid。纯函数 + 单测。
- [ ] T2 FlowEditor.tsx:React Flow 画布(拖拽/增删节点连线/改 label/方向)+ ELK 自动布局 + 保存回调。
- [ ] T3 接入读视图:ReportMarkdown 的 MermaidBlock 每张图加「可视化编辑」入口 → 开 FlowEditor → 存回替换该 fence → PUT /content。
- [ ] T4 tsc + 本地构建 + 部署 + 端到端验证(改图→存→读视图重渲染)。

## 进展
- 选定 B 方案(用户 2026-06-29)。
- [x] T0 done:真实数据 28 块 mermaid,**27 是 stateDiagram-v2、1 是 flowchart**。parse→serialize→parse round-trip **27/27 通过、0 失败**。
  - 重大结论:目标图表是**状态机(stateDiagram-v2)**,不是 flowchart。语法极干净:305/333 行是 `from --> to: label`,无 state 别名/note/fork/direction。
  - 编辑器主攻 stateDiagram-v2;flowchart 暂走源码编辑。
- [x] T1 flow/stateDiagram.ts — parse/serialize(start/end 映射版 round-trip 27/27 再验证通过)。
- [x] T1b flow/replaceMermaidBlock.ts — 按归一化源码定位并替换 md 里的图块。
- [x] T2 flow/StateFlowEditor.tsx — React Flow 编辑器(拖拽/增删/连线/改 label/ELK 自动布局/保存序列化回 mermaid)。
- [x] T3 接入:flow/mermaidEditContext.ts + ReportMarkdown.MermaidBlock 悬浮「可视化编辑」按钮(仅 stateDiagram + 有 Provider 时);BlueprintDesignWorkspace 注入 Provider + 编辑器 modal + 存回 PUT /content。
- [x] T4a tsc 通过、vite build 通过。
- [ ] T4b 部署 + 端到端验证(改图→存→读视图重渲染)。
