/**
 * StakeholderCanvas — 干系人图谱 SVG canvas
 *
 * 功能:
 *  - 顶栏:[+ 部门] [+ 干系人] [删除选中] [保存] 工具按钮
 *  - 主画布:SVG,节点拖拽,点击选中,双击改名,Delete 键删除
 *  - 连线:选中节点后显示右侧 + 手柄,按住拖到另一节点创建边
 *  - 侧栏:选中节点显示详情表单(名称/职位/部门)
 *
 * 数据通过 GET/PUT /api/stakeholder-graph/{project_id} 持久化。
 * 不依赖任何 canvas / graph 第三方库,纯 SVG + DOM event。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building2, User, Trash2, Save, Loader2, Plus, RotateCcw,
} from 'lucide-react'
import {
  getStakeholderGraph, saveStakeholderGraph,
  type StakeholderNode, type StakeholderEdge,
} from '../../api/client'

interface Props {
  projectId: string
}

const NODE_W = 140
const NODE_H = 56
const HANDLE_R = 6

function newId(prefix = 'n'): string {
  // 不依赖 crypto.randomUUID() — 老 webkit 可能没有
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export default function StakeholderCanvas({ projectId }: Props) {
  const qc = useQueryClient()
  const svgRef = useRef<SVGSVGElement>(null)

  // 持久状态
  const { data: server, isLoading } = useQuery({
    queryKey: ['stakeholder-graph', projectId],
    queryFn: () => getStakeholderGraph(projectId),
  })

  // 本地编辑状态(server load 后初始化)
  const [nodes, setNodes] = useState<StakeholderNode[]>([])
  const [edges, setEdges] = useState<StakeholderEdge[]>([])
  const [dirty, setDirty] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null)
  // 连线拖拽中:from 节点 + 当前鼠标 svg 坐标
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [mousePt, setMousePt] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!server) return
    setNodes(server.nodes ?? [])
    setEdges(server.edges ?? [])
    setDirty(false)
  }, [server])

  const saveMut = useMutation({
    mutationFn: () => saveStakeholderGraph(projectId, { nodes, edges }),
    onSuccess: (data) => {
      qc.setQueryData(['stakeholder-graph', projectId], data)
      setDirty(false)
    },
  })

  // ── 工具栏动作 ───────────────────────────────────────────────────────────────
  const addDept = () => {
    const n: StakeholderNode = {
      id: newId('d'), type: 'department', name: '新部门',
      x: 60 + Math.random() * 80, y: 60 + Math.random() * 80,
    }
    setNodes([...nodes, n])
    setSelectedId(n.id)
    setDirty(true)
  }
  const addPerson = () => {
    const n: StakeholderNode = {
      id: newId('p'), type: 'person', name: '新干系人', title: '', dept: '',
      x: 200 + Math.random() * 80, y: 60 + Math.random() * 80,
    }
    setNodes([...nodes, n])
    setSelectedId(n.id)
    setDirty(true)
  }
  const deleteSelected = () => {
    if (!selectedId) return
    setNodes(nodes.filter(n => n.id !== selectedId))
    setEdges(edges.filter(e => e.source !== selectedId && e.target !== selectedId))
    setSelectedId(null)
    setDirty(true)
  }
  const revert = () => {
    if (!server) return
    setNodes(server.nodes ?? [])
    setEdges(server.edges ?? [])
    setDirty(false)
    setSelectedId(null)
  }

  // ── 键盘事件:Delete 删除节点(只当焦点在画布) ────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        // 不要在 input 里拦
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        deleteSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, nodes, edges])

  // ── SVG 鼠标坐标转换 ─────────────────────────────────────────────────────────
  const toSvgPoint = (clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const inv = ctm.inverse()
    const r = pt.matrixTransform(inv)
    return { x: r.x, y: r.y }
  }

  // ── 节点拖拽 ─────────────────────────────────────────────────────────────────
  const onNodeMouseDown = (e: React.MouseEvent, n: StakeholderNode) => {
    e.stopPropagation()
    setSelectedId(n.id)
    if (connectFrom) return  // 连线模式不拖拽
    const p = toSvgPoint(e.clientX, e.clientY)
    dragOffset.current = { dx: p.x - n.x, dy: p.y - n.y }
    setDraggingId(n.id)
  }

  // ── 连线手柄 ─────────────────────────────────────────────────────────────────
  const onHandleMouseDown = (e: React.MouseEvent, n: StakeholderNode) => {
    e.stopPropagation()
    setConnectFrom(n.id)
    const p = toSvgPoint(e.clientX, e.clientY)
    setMousePt(p)
  }

  // ── SVG 全局鼠标 ────────────────────────────────────────────────────────────
  const onSvgMouseMove = (e: React.MouseEvent) => {
    const p = toSvgPoint(e.clientX, e.clientY)
    if (draggingId && dragOffset.current) {
      const { dx, dy } = dragOffset.current
      setNodes(nodes.map(n =>
        n.id === draggingId ? { ...n, x: Math.max(0, p.x - dx), y: Math.max(0, p.y - dy) } : n
      ))
      setDirty(true)
    } else if (connectFrom) {
      setMousePt(p)
    }
  }

  const onSvgMouseUp = () => {
    setDraggingId(null)
    dragOffset.current = null
    if (connectFrom) {
      setConnectFrom(null)
      setMousePt(null)
    }
  }

  const onNodeMouseUpForConnect = (e: React.MouseEvent, n: StakeholderNode) => {
    if (!connectFrom || connectFrom === n.id) return
    e.stopPropagation()
    // 防止重复边
    const exists = edges.some(ed => ed.source === connectFrom && ed.target === n.id)
    if (!exists) {
      setEdges([...edges, { id: newId('e'), source: connectFrom, target: n.id, label: '' }])
      setDirty(true)
    }
    setConnectFrom(null)
    setMousePt(null)
  }

  const onSvgClick = () => {
    if (!draggingId && !connectFrom) {
      setSelectedId(null)
    }
  }

  // ── 节点详情编辑 ─────────────────────────────────────────────────────────────
  const selected = useMemo(() => nodes.find(n => n.id === selectedId), [nodes, selectedId])
  const updateSelected = (patch: Partial<StakeholderNode>) => {
    if (!selectedId) return
    setNodes(nodes.map(n => n.id === selectedId ? { ...n, ...patch } : n))
    setDirty(true)
  }
  const updateEdgeLabel = (edgeId: string, label: string) => {
    setEdges(edges.map(e => e.id === edgeId ? { ...e, label } : e))
    setDirty(true)
  }
  const deleteEdge = (edgeId: string) => {
    setEdges(edges.filter(e => e.id !== edgeId))
    setDirty(true)
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-ink-muted">
        <Loader2 size={14} className="animate-spin mr-1.5" />加载图谱…
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 顶部工具栏 */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-line bg-white flex items-center gap-2">
        <button onClick={addDept}
          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-blue-200 text-blue-700 hover:bg-blue-50">
          <Plus size={11} /><Building2 size={11} /> 部门
        </button>
        <button onClick={addPerson}
          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-orange-200 text-[#D96400] hover:bg-orange-50">
          <Plus size={11} /><User size={11} /> 干系人
        </button>
        <button onClick={deleteSelected} disabled={!selectedId}
          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-white">
          <Trash2 size={11} /> 删除选中
        </button>
        <span className="text-[11px] text-ink-muted ml-2">
          {nodes.length} 节点 · {edges.length} 关系
          {connectFrom && <span className="text-orange-600 ml-2">⚡ 拖到目标节点</span>}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-[11px] text-amber-600">未保存</span>}
          <button onClick={revert} disabled={!dirty}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-line text-ink-muted hover:bg-canvas disabled:opacity-40">
            <RotateCcw size={11} /> 还原
          </button>
          <button onClick={() => saveMut.mutate()} disabled={!dirty || saveMut.isPending}
            className="flex items-center gap-1 px-3 py-1 text-xs rounded text-white shadow-sm disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#FF8D1A,#D96400)' }}>
            {saveMut.isPending
              ? <Loader2 size={11} className="animate-spin" />
              : <Save size={11} />}
            保存
          </button>
        </div>
      </div>

      {/* 主体:画布 + 右侧详情 */}
      <div className="flex-1 min-h-0 flex">
        {/* 画布 */}
        <div className="flex-1 min-w-0 overflow-auto bg-[radial-gradient(circle,#e5e7eb_1px,transparent_1px)] bg-[length:18px_18px]">
          <svg
            ref={svgRef}
            width="100%" height="100%"
            viewBox="0 0 1200 800"
            preserveAspectRatio="xMinYMin meet"
            onMouseMove={onSvgMouseMove}
            onMouseUp={onSvgMouseUp}
            onClick={onSvgClick}
            style={{ minWidth: 1200, minHeight: 800, display: 'block', cursor: connectFrom ? 'crosshair' : 'default' }}
          >
            <defs>
              <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5"
                markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
              </marker>
            </defs>

            {/* 边 */}
            {edges.map(e => {
              const a = nodes.find(n => n.id === e.source)
              const b = nodes.find(n => n.id === e.target)
              if (!a || !b) return null
              const ax = a.x + NODE_W / 2
              const ay = a.y + NODE_H / 2
              const bx = b.x + NODE_W / 2
              const by = b.y + NODE_H / 2
              const mx = (ax + bx) / 2
              const my = (ay + by) / 2
              return (
                <g key={e.id}>
                  <line x1={ax} y1={ay} x2={bx} y2={by}
                    stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrowhead)" />
                  {e.label && (
                    <g>
                      <rect x={mx - (e.label.length * 5 + 6)} y={my - 8}
                        width={e.label.length * 10 + 12} height={16}
                        rx={3} fill="white" stroke="#e5e7eb" />
                      <text x={mx} y={my + 4} fontSize={10} textAnchor="middle" fill="#475569">
                        {e.label}
                      </text>
                    </g>
                  )}
                  {/* 边的 hit area 用于点击选中删除 */}
                  <line x1={ax} y1={ay} x2={bx} y2={by}
                    stroke="transparent" strokeWidth="10"
                    style={{ cursor: 'pointer' }}
                    onClick={(ev) => { ev.stopPropagation(); deleteEdge(e.id) }}>
                    <title>点击删除关系</title>
                  </line>
                </g>
              )
            })}

            {/* 连线拖拽预览 */}
            {connectFrom && mousePt && (() => {
              const a = nodes.find(n => n.id === connectFrom)
              if (!a) return null
              const ax = a.x + NODE_W / 2
              const ay = a.y + NODE_H / 2
              return (
                <line x1={ax} y1={ay} x2={mousePt.x} y2={mousePt.y}
                  stroke="#FF8D1A" strokeWidth="1.5" strokeDasharray="4 3" />
              )
            })()}

            {/* 节点 */}
            {nodes.map(n => {
              const isDept = n.type === 'department'
              const isSel = n.id === selectedId
              const fill = isDept ? '#dbeafe' : '#fed7aa'
              const stroke = isSel ? (isDept ? '#2563eb' : '#D96400') : (isDept ? '#93c5fd' : '#fdba74')
              return (
                <g key={n.id}
                  onMouseDown={(e) => onNodeMouseDown(e, n)}
                  onMouseUp={(e) => onNodeMouseUpForConnect(e, n)}
                  style={{ cursor: connectFrom ? 'pointer' : (draggingId === n.id ? 'grabbing' : 'grab') }}
                >
                  <rect x={n.x} y={n.y} width={NODE_W} height={NODE_H}
                    rx={8} fill={fill} stroke={stroke} strokeWidth={isSel ? 2 : 1.5} />
                  <text x={n.x + 10} y={n.y + 22} fontSize={13} fontWeight={600} fill="#0f172a">
                    {n.name.length > 14 ? n.name.slice(0, 13) + '…' : n.name}
                  </text>
                  {n.type === 'person' && n.title && (
                    <text x={n.x + 10} y={n.y + 40} fontSize={10} fill="#475569">
                      {n.title.length > 18 ? n.title.slice(0, 17) + '…' : n.title}
                    </text>
                  )}
                  {n.type === 'department' && (
                    <text x={n.x + 10} y={n.y + 40} fontSize={10} fill="#475569">部门</text>
                  )}
                  {/* 连线手柄(选中时显示) */}
                  {isSel && (
                    <circle cx={n.x + NODE_W} cy={n.y + NODE_H / 2}
                      r={HANDLE_R} fill="white" stroke="#D96400" strokeWidth={2}
                      style={{ cursor: 'crosshair' }}
                      onMouseDown={(e) => onHandleMouseDown(e, n)}>
                      <title>按住拖到另一节点 → 创建关系</title>
                    </circle>
                  )}
                </g>
              )
            })}

            {nodes.length === 0 && (
              <text x={600} y={400} textAnchor="middle" fontSize={13} fill="#94a3b8">
                空画布 — 点击上方「+ 部门」/「+ 干系人」开始
              </text>
            )}
          </svg>
        </div>

        {/* 右侧详情 */}
        <div className="w-72 flex-shrink-0 border-l border-line bg-slate-50/40 overflow-auto">
          {selected ? (
            <NodeDetailForm node={selected} onChange={updateSelected}
              edges={edges.filter(e => e.source === selected.id || e.target === selected.id)}
              nodes={nodes}
              onEdgeLabelChange={updateEdgeLabel}
              onEdgeDelete={deleteEdge}
            />
          ) : (
            <div className="p-4 text-xs text-ink-muted leading-relaxed">
              <div className="font-medium text-ink mb-2">操作提示</div>
              <ul className="space-y-1 list-disc pl-4">
                <li>点节点选中 → 编辑详情</li>
                <li>选中后右侧 + 手柄 → 拖到另一节点画关系</li>
                <li>点关系线删除</li>
                <li>Delete / Backspace 删除选中节点</li>
                <li>编辑后顶部「保存」按钮才入库</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function NodeDetailForm({ node, edges, nodes, onChange, onEdgeLabelChange, onEdgeDelete }: {
  node: StakeholderNode
  edges: StakeholderEdge[]
  nodes: StakeholderNode[]
  onChange: (patch: Partial<StakeholderNode>) => void
  onEdgeLabelChange: (edgeId: string, label: string) => void
  onEdgeDelete: (edgeId: string) => void
}) {
  const Icon = node.type === 'department' ? Building2 : User
  const tone = node.type === 'department' ? 'text-blue-700' : 'text-[#D96400]'
  return (
    <div className="p-3 space-y-3">
      <div className={`flex items-center gap-1.5 ${tone} text-xs font-medium`}>
        <Icon size={12} />{node.type === 'department' ? '部门节点' : '干系人节点'}
      </div>

      <Field label="名称">
        <input value={node.name} onChange={e => onChange({ name: e.target.value })}
          className="w-full px-2 py-1 text-xs border border-line rounded focus:outline-none focus:ring-1 focus:ring-orange-300 bg-white" />
      </Field>

      {node.type === 'person' && (
        <>
          <Field label="职位">
            <input value={node.title ?? ''} onChange={e => onChange({ title: e.target.value })}
              placeholder="如 销售总监 / CIO"
              className="w-full px-2 py-1 text-xs border border-line rounded focus:outline-none focus:ring-1 focus:ring-orange-300 bg-white" />
          </Field>
          <Field label="所属部门">
            <input value={node.dept ?? ''} onChange={e => onChange({ dept: e.target.value })}
              placeholder="弱关联,可留空"
              className="w-full px-2 py-1 text-xs border border-line rounded focus:outline-none focus:ring-1 focus:ring-orange-300 bg-white" />
          </Field>
        </>
      )}

      {edges.length > 0 && (
        <Field label={`关系(${edges.length})`}>
          <div className="space-y-1.5">
            {edges.map(e => {
              const other = nodes.find(n => n.id === (e.source === node.id ? e.target : e.source))
              const dir = e.source === node.id ? '→' : '←'
              return (
                <div key={e.id} className="flex items-center gap-1.5 text-[11px] bg-white border border-line rounded px-1.5 py-1">
                  <span className="text-ink-muted shrink-0">{dir}</span>
                  <span className="text-ink truncate flex-1" title={other?.name}>{other?.name ?? '?'}</span>
                  <input value={e.label ?? ''} onChange={ev => onEdgeLabelChange(e.id, ev.target.value)}
                    placeholder="关系"
                    className="w-16 px-1 py-0.5 text-[10px] border border-slate-200 rounded bg-white" />
                  <button onClick={() => onEdgeDelete(e.id)} className="text-red-400 hover:text-red-600">
                    <Trash2 size={10} />
                  </button>
                </div>
              )
            })}
          </div>
        </Field>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] text-ink-muted mb-1 font-medium uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}
