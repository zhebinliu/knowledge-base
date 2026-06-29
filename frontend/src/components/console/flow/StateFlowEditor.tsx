/**
 * StateFlowEditor — mermaid stateDiagram-v2 的可视化拖拽编辑器(基于 React Flow)。
 *
 * 把状态机解析成节点/连线 → ELK 自动布局 → 用户拖拽/增删节点连线/改 label →
 * 保存时序列化回 mermaid 文本(serializeStateDiagram),由调用方写回 markdown。
 *
 * 复用项目已有的 @xyflow/react + elkjs 依赖(ProjectCanvas 同款栈)。
 * 仅支持 stateDiagram-v2 子集 —— flowchart/composite 等由调用方拦在外面走源码编辑。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MarkerType,
  useNodesState, useEdgesState, addEdge,
  type Node, type Edge, type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import ELK from 'elkjs/lib/elk.bundled.js'
import { Plus, LayoutGrid, Save, X, Loader2, Trash2 } from 'lucide-react'
import {
  parseStateDiagram, serializeStateDiagram, START_ID, END_ID,
  type StateGraph, type FlowNode,
} from './stateDiagram'

const elk = new ELK()

interface Props {
  source: string            // 原始 mermaid 块文本
  title?: string
  onSave: (mermaid: string) => Promise<void> | void
  onClose: () => void
}

// ── 图模型 ↔ React Flow ──────────────────────────────────────────────
function nodeStyle(kind: FlowNode['kind']): React.CSSProperties {
  if (kind === 'start') return { background: '#10B981', color: '#fff', borderRadius: 999, padding: '6px 14px', border: 'none', fontSize: 12, fontWeight: 600 }
  if (kind === 'end') return { background: '#475569', color: '#fff', borderRadius: 999, padding: '6px 14px', border: 'none', fontSize: 12, fontWeight: 600 }
  return { background: '#fff', border: '1.5px solid #FB923C', borderRadius: 10, padding: '8px 14px', fontSize: 13, color: '#1f2937', fontWeight: 500, minWidth: 80, textAlign: 'center' }
}

function toRF(g: StateGraph): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = g.nodes.map((n, i) => ({
    id: n.id,
    position: { x: 0, y: i * 90 },  // 占位,稍后 ELK 覆盖
    data: { label: n.label, kind: n.kind },
    style: nodeStyle(n.kind),
  }))
  const edges: Edge[] = g.edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label || undefined,
    markerEnd: { type: MarkerType.ArrowClosed },
    labelStyle: { fontSize: 11, fill: '#475569' },
    labelBgStyle: { fill: '#fff', fillOpacity: 0.85 },
    labelBgPadding: [4, 2] as [number, number],
  }))
  return { nodes, edges }
}

function fromRF(nodes: Node[], edges: Edge[]): StateGraph {
  return {
    nodes: nodes.map(n => ({
      id: n.id,
      label: String((n.data as any)?.label ?? n.id),
      kind: ((n.data as any)?.kind ?? 'state') as FlowNode['kind'],
    })),
    edges: edges.map((e, i) => ({
      id: e.id || `e${i}`,
      source: e.source,
      target: e.target,
      label: typeof e.label === 'string' ? e.label : '',
    })),
  }
}

async function layout(nodes: Node[], edges: Edge[]): Promise<Node[]> {
  if (!nodes.length) return nodes
  const graph: any = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.layered.spacing.nodeNodeBetweenLayers': '70',
      'elk.spacing.nodeNode': '50',
    },
    children: nodes.map(n => ({ id: n.id, width: (n as any).measured?.width ?? 120, height: (n as any).measured?.height ?? 44 })),
    edges: edges.map(e => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  }
  const res: any = await elk.layout(graph)
  const pos = new Map<string, { x: number; y: number }>((res.children || []).map((c: any) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]))
  return nodes.map(n => ({ ...n, position: pos.get(n.id) || n.position }))
}

function EditorInner({ source, title, onSave, onClose }: Props) {
  const initial = useMemo(() => {
    const g = parseStateDiagram(source)
    return g ? toRF(g) : { nodes: [], edges: [] }
  }, [source])

  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges)
  const [selId, setSelId] = useState<string | null>(null)
  const [selKind, setSelKind] = useState<'node' | 'edge' | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)

  // 挂载后跑一次 ELK 自动布局
  useEffect(() => {
    let cancelled = false
    layout(initial.nodes, initial.edges).then(laid => { if (!cancelled) setNodes(laid) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const relayout = useCallback(async () => {
    setNodes(await layout(nodes, edges))
  }, [nodes, edges, setNodes])

  const onConnect = useCallback((c: Connection) => {
    setEdges(eds => addEdge({
      ...c,
      id: `e_new_${seq.current++}`,
      markerEnd: { type: MarkerType.ArrowClosed },
      labelStyle: { fontSize: 11, fill: '#475569' },
      labelBgStyle: { fill: '#fff', fillOpacity: 0.85 },
      labelBgPadding: [4, 2] as [number, number],
    }, eds))
  }, [setEdges])

  const addState = useCallback(() => {
    const id = `状态${seq.current++ + 1}`
    setNodes(ns => [...ns, {
      id, position: { x: 60, y: 60 }, data: { label: id, kind: 'state' }, style: nodeStyle('state'),
    }])
  }, [setNodes])

  // 选中元素 → 右侧面板改 label
  const selectedLabel = useMemo(() => {
    if (selKind === 'node') return String((nodes.find(n => n.id === selId)?.data as any)?.label ?? '')
    if (selKind === 'edge') { const e = edges.find(e => e.id === selId); return typeof e?.label === 'string' ? e.label : '' }
    return ''
  }, [selId, selKind, nodes, edges])

  const selectedNodeKind = selKind === 'node' ? ((nodes.find(n => n.id === selId)?.data as any)?.kind as FlowNode['kind']) : null

  const setSelectedLabel = useCallback((val: string) => {
    if (selKind === 'node') {
      setNodes(ns => ns.map(n => n.id === selId ? { ...n, data: { ...(n.data as any), label: val } } : n))
    } else if (selKind === 'edge') {
      setEdges(es => es.map(e => e.id === selId ? { ...e, label: val || undefined } : e))
    }
  }, [selId, selKind, setNodes, setEdges])

  const deleteSelected = useCallback(() => {
    if (selKind === 'node') {
      setNodes(ns => ns.filter(n => n.id !== selId))
      setEdges(es => es.filter(e => e.source !== selId && e.target !== selId))
    } else if (selKind === 'edge') {
      setEdges(es => es.filter(e => e.id !== selId))
    }
    setSelId(null); setSelKind(null)
  }, [selId, selKind, setNodes, setEdges])

  const handleSave = useCallback(async () => {
    setError(null)
    const g = fromRF(nodes, edges)
    if (!g.nodes.length || !g.edges.length) { setError('流程图至少要有一个节点和一条连线'); return }
    const mermaid = serializeStateDiagram(g)
    try {
      setSaving(true)
      await onSave(mermaid)
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || '保存失败')
      setSaving(false)
    }
  }, [nodes, edges, onSave])

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[min(1100px,95vw)] h-[min(720px,90vh)] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* 顶栏 */}
        <div className="flex-shrink-0 px-4 py-2.5 border-b border-gray-200 bg-slate-50 flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800 truncate">{title || '可视化编辑流程图'}</span>
          <span className="text-[11px] text-gray-400">拖拽节点 · 从节点边缘拖出连线 · 选中后在右侧改文字</span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={addState} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-gray-200 text-gray-600 hover:bg-white hover:text-orange-600 hover:border-orange-200" title="添加一个状态节点">
              <Plus size={12} /> 添加状态
            </button>
            <button onClick={relayout} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-gray-200 text-gray-600 hover:bg-white hover:text-orange-600 hover:border-orange-200" title="ELK 自动重新布局">
              <LayoutGrid size={12} /> 自动布局
            </button>
            <button onClick={onClose} disabled={saving} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-50">
              <X size={12} /> 取消
            </button>
            <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white rounded-md disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#FF8D1A,#D96400)' }}>
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
        {error && <div className="flex-shrink-0 px-4 py-1.5 text-xs text-red-600 bg-red-50 border-b border-red-100">{error}</div>}

        {/* 主体:画布 + 右侧属性面板 */}
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, n) => { setSelId(n.id); setSelKind('node') }}
              onEdgeClick={(_, e) => { setSelId(e.id); setSelKind('edge') }}
              onPaneClick={() => { setSelId(null); setSelKind(null) }}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls />
            </ReactFlow>
          </div>

          {/* 右侧属性面板 */}
          <div className="w-60 flex-shrink-0 border-l border-gray-200 bg-slate-50/60 p-4 flex flex-col gap-3 overflow-auto">
            {selId ? (
              <>
                <div className="text-xs font-semibold text-gray-700">
                  {selKind === 'node' ? '状态节点' : '连线(转移)'}
                </div>
                {selKind === 'node' && (selectedNodeKind === 'start' || selectedNodeKind === 'end') ? (
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    这是「{selectedNodeKind === 'start' ? '开始' : '结束'}」伪节点(mermaid 里的 <code>[*]</code>),不可改名,可连线和删除。
                  </p>
                ) : (
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-gray-500">{selKind === 'node' ? '状态名' : '转移条件 / 动作(可空)'}</span>
                    <input
                      value={selectedLabel}
                      onChange={e => setSelectedLabel(e.target.value)}
                      className="px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-orange-300"
                      placeholder={selKind === 'node' ? '如:待分配' : '如:CEO人工指派'}
                      autoFocus
                    />
                  </label>
                )}
                <button onClick={deleteSelected} className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-red-200 text-red-600 hover:bg-red-50">
                  <Trash2 size={12} /> 删除{selKind === 'node' ? '此节点' : '此连线'}
                </button>
              </>
            ) : (
              <p className="text-[11px] text-gray-400 leading-relaxed">
                点选一个节点或连线,在这里改名 / 删除。<br /><br />
                · 拖节点边缘的小圆点连到另一个节点 = 新增转移<br />
                · 「添加状态」加节点<br />
                · 保存后写回文档的 mermaid 图,自动重新渲染。
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function StateFlowEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <EditorInner {...props} />
    </ReactFlowProvider>
  )
}
