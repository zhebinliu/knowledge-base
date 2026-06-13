/**
 * canvasContext — 把"节点实时状态 + 节点动作"从容器透传给自定义节点组件,
 * 避免把状态/回调塞进持久化的 node.data(状态绝不入库)。
 *
 * 节点组件用 useContext 订阅 → latestByKind 轮询变化时,context value 变化触发
 * 节点重渲染(绕过 React Flow 对 props 的 memo),状态即时刷新。
 */
import { createContext, useContext } from 'react'
import type { OutputKind } from '../../../api/client'

export type NodeStatus = 'idle' | 'inflight' | 'done' | 'failed'

export interface CanvasActions {
  /** 生成节点状态:done/inflight/failed/idle */
  statusOf: (kind: OutputKind) => NodeStatus
  /** 最近一次失败的 trace_id(供复制排错),无则 null */
  failedTraceOf: (kind: OutputKind) => string | null
  /** 触发生成 */
  onRun: (kind: OutputKind) => void
  /** 双击生成节点 → 跳到现有阶段工作区 */
  onOpenGeneration: (kind: OutputKind) => void
  /** 双击资料节点 → 打开对应抽屉 */
  onOpenMaterial: (materialKind: string) => void
  /** 资料桶角标计数(如文档数),无则 null */
  countOf: (materialKind: string) => number | null
  /** 自定义输入节点:更新内容(text/url/...)并标记未保存 */
  updateNodeData: (id: string, patch: Record<string, any>) => void
  /** 文件输入节点:上传文件 → 关联文档,回写 docId/filename/status */
  uploadFile: (id: string, file: File) => void
}

const noop = () => {}
export const CanvasActionsContext = createContext<CanvasActions>({
  statusOf: () => 'idle',
  failedTraceOf: () => null,
  onRun: noop,
  onOpenGeneration: noop,
  onOpenMaterial: noop,
  countOf: () => null,
  updateNodeData: noop,
  uploadFile: noop,
})

export const useCanvasActions = () => useContext(CanvasActionsContext)
