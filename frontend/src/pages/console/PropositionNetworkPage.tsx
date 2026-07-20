import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, RefreshCw, AlertTriangle, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { toast } from '../../components/Toaster'
import {
  buildPropositionNetwork, getPropositionNetwork, getPropositionNetworkStatus,
  type PropositionNetworkData, type PropositionNetworkNode, type PropositionNetworkEdge,
} from '../../api/scenes'
import { getProject } from '../../api/client'
import { useQuery } from '@tanstack/react-query'

/* ── 配色 ── */
const HC: Record<string, string> = { alive: '#10b981', weak: '#f59e0b', dead: '#ef4444' }
const HL: Record<string, string> = { alive: '有证据链', weak: '证据薄弱', dead: '已断链' }

/* ── 布局参数 ── */
const LAYER_GAP = 220
const NODE_R = 18
const SCENE_R = 22
const DOC_W = 110
const DOC_H = 36

interface Pos { x: number; y: number }
interface LayoutResult {
  positions: Map<string, Pos>
  width: number
  height: number
}

function computeLayout(data: PropositionNetworkData['network']): LayoutResult {
  const docs = data.nodes.filter(n => n.type === 'document')
  const props = data.nodes.filter(n => n.type === 'proposition')
  const scenes = data.nodes.filter(n => n.type === 'scene')

  const pad = 60
  const nodeGapMin = 50

  const propsByHealth = [...props].sort((a, b) => {
    const order: Record<string, number> = { alive: 0, weak: 1, dead: 2 }
    return (order[a.health || 'weak'] ?? 1) - (order[b.health || 'weak'] ?? 1)
  })

  const sceneGap = Math.max(nodeGapMin, 80)
  const propGap = Math.max(nodeGapMin, 56)
  const docGap = Math.max(nodeGapMin, 40)

  const sceneWidth = scenes.length * sceneGap
  const propWidth = propsByHealth.length * propGap
  const docWidth = docs.length * docGap
  const totalWidth = Math.max(sceneWidth, propWidth, docWidth) + pad * 2

  const yScene = pad + SCENE_R
  const yProp = yScene + LAYER_GAP
  const yDoc = yProp + LAYER_GAP

  const positions = new Map<string, Pos>()

  const placeRow = (list: PropositionNetworkNode[], y: number, gap: number) => {
    const rowW = list.length * gap
    const startX = (totalWidth - rowW) / 2 + gap / 2
    list.forEach((n, i) => {
      positions.set(n.id, { x: startX + i * gap, y })
    })
  }

  placeRow(scenes, yScene, sceneGap)
  placeRow(propsByHealth, yProp, propGap)
  placeRow(docs, yDoc, docGap)

  return { positions, width: totalWidth, height: yDoc + DOC_H + pad }
}

/* ── 主组件 ── */
export default function PropositionNetworkPage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [data, setData] = useState<PropositionNetworkData | null>(null)
  const [loading, setLoading] = useState(true)
  const [building, setBuilding] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const [selected, setSelected] = useState<PropositionNetworkNode | null>(null)

  // zoom & pan
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 800, h: 600 })
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef({ x: 0, y: 0, vx: 0, vy: 0 })

  const { data: project } = useQuery({
    queryKey: ['project', id],
    queryFn: () => getProject(id!),
    enabled: !!id,
  })

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const d = await getPropositionNetwork(id)
      setData(d)
      if (d?.network?.nodes?.length) {
        const layout = computeLayout(d.network)
        setViewBox({ x: 0, y: 0, w: layout.width, h: layout.height })
      }
    } catch { /* */ }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])

  const handleBuild = useCallback(async () => {
    if (!id) return
    setBuilding(true)
    try {
      const { task_id } = await buildPropositionNetwork(id)
      toast.success('命题网络构建已启动')
      const poll = setInterval(async () => {
        try {
          const st = await getPropositionNetworkStatus(id, task_id)
          if (st.ready) { clearInterval(poll); setBuilding(false); await load(); toast.success('命题网络构建完成') }
          else if (st.state === 'FAILURE') { clearInterval(poll); setBuilding(false); toast.error('构建失败: ' + (st.error || '')) }
        } catch { clearInterval(poll); setBuilding(false) }
      }, 3000)
    } catch (e: any) { setBuilding(false); toast.error('启动失败: ' + (e?.message || '')) }
  }, [id, load])

  const layout = useMemo(() => {
    if (!data?.network?.nodes?.length) return null
    return computeLayout(data.network)
  }, [data])

  const nodeMap = useMemo(() => {
    const m = new Map<string, PropositionNetworkNode>()
    data?.network?.nodes?.forEach(n => m.set(n.id, n))
    return m
  }, [data])

  const litIds = useMemo(() => {
    if (!hovered || !data?.network) return null
    const s = new Set<string>([hovered])
    for (const e of data.network.edges) {
      if (e.source === hovered || e.target === hovered) {
        s.add(e.source); s.add(e.target)
      }
    }
    return s
  }, [hovered, data])

  /* ── zoom ── */
  const zoom = useCallback((factor: number) => {
    setViewBox(vb => {
      const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2
      const nw = vb.w / factor, nh = vb.h / factor
      return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh }
    })
  }, [])

  const fitAll = useCallback(() => {
    if (layout) setViewBox({ x: 0, y: 0, w: layout.width, h: layout.height })
  }, [layout])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    zoom(factor)
  }, [zoom])

  const toSvgCoords = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return {
      x: viewBox.x + (clientX - rect.left) / rect.width * viewBox.w,
      y: viewBox.y + (clientY - rect.top) / rect.height * viewBox.h,
    }
  }, [viewBox])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    const target = e.target as SVGElement
    if (target.closest('[data-node]')) return
    setIsPanning(true)
    panStart.current = { x: e.clientX, y: e.clientY, vx: viewBox.x, vy: viewBox.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [viewBox])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning) return
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const dx = (e.clientX - panStart.current.x) / rect.width * viewBox.w
    const dy = (e.clientY - panStart.current.y) / rect.height * viewBox.h
    setViewBox(vb => ({ ...vb, x: panStart.current.vx - dx, y: panStart.current.vy - dy }))
  }, [isPanning, viewBox.w, viewBox.h])

  const handlePointerUp = useCallback(() => { setIsPanning(false) }, [])

  const stats = data?.stats

  return (
    <div className="flex flex-col bg-gray-50" style={{ height: 'calc(100vh - 56px)' }}>
      {/* 顶栏 */}
      <div className="flex-shrink-0 h-12 bg-white border-b border-gray-200 flex items-center px-4 gap-3">
        <button onClick={() => nav(`/console/projects/${id}`)}
          className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" /> 返回项目
        </button>
        <div className="w-px h-5 bg-gray-200" />
        <span className="text-sm font-medium text-gray-800 truncate">
          {project?.name || '项目'} — 命题神经网络
        </span>

        {stats && (
          <div className="flex items-center gap-3 ml-4 text-xs text-gray-400">
            <span>{stats.proposition_count ?? 0} 命题</span>
            <span>{stats.doc_count ?? 0} 文档</span>
            <span>{stats.scene_hits_with_evidence ?? 0} 场景</span>
            <span className="w-px h-3 bg-gray-200" />
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> {stats.alive ?? 0}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> {stats.weak ?? 0}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> {stats.dead ?? 0}</span>
          </div>
        )}

        <div className="flex-1" />
        <button onClick={handleBuild} disabled={building}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
          {building ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {building ? '构建中…' : data ? '重新构建' : '构建网络'}
        </button>
      </div>

      {/* 主体 */}
      <div className="flex-1 relative overflow-hidden" ref={containerRef}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80 z-10">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {!loading && !data && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
            <div className="text-6xl mb-4 opacity-20">🧠</div>
            <span className="text-lg">尚未构建命题网络</span>
            <span className="text-sm mt-2">点击右上角"构建网络"从项目文档中抽取命题</span>
          </div>
        )}

        {layout && data?.network && (
          <>
            <svg
              ref={svgRef}
              viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
              className="w-full h-full"
              style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
              onWheel={handleWheel}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              <defs>
                <filter id="glow-alive"><feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#10b981" floodOpacity="0.4" /></filter>
                <filter id="glow-weak"><feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#f59e0b" floodOpacity="0.4" /></filter>
                <filter id="glow-dead"><feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#ef4444" floodOpacity="0.4" /></filter>
                <filter id="glow-scene"><feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#8b5cf6" floodOpacity="0.3" /></filter>
                <filter id="glow-doc"><feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#3b82f6" floodOpacity="0.3" /></filter>
              </defs>

              {/* 层标签 */}
              <text x={viewBox.x + 16} y={layout.positions.values().next().value?.y ?? 60}
                fontSize="13" fontWeight="600" fill="#8b5cf6" opacity="0.4">场景层 SCENES</text>
              <text x={viewBox.x + 16} y={(layout.positions.values().next().value?.y ?? 60) + LAYER_GAP}
                fontSize="13" fontWeight="600" fill="#6b7280" opacity="0.4">命题层 PROPOSITIONS</text>
              <text x={viewBox.x + 16} y={(layout.positions.values().next().value?.y ?? 60) + LAYER_GAP * 2}
                fontSize="13" fontWeight="600" fill="#3b82f6" opacity="0.4">文档层 DOCUMENTS</text>

              {/* 层分割线 */}
              {[1, 2].map(i => {
                const y = (layout.positions.values().next().value?.y ?? 60) + LAYER_GAP * i - LAYER_GAP / 2
                return <line key={i} x1={0} y1={y} x2={layout.width} y2={y} stroke="#e5e7eb" strokeWidth="0.5" strokeDasharray="8 4" />
              })}

              {/* 连线 */}
              {data.network.edges.map((e, i) => {
                const sp = layout.positions.get(e.source)
                const tp = layout.positions.get(e.target)
                if (!sp || !tp) return null
                const lit = litIds === null ? null : (litIds.has(e.source) && litIds.has(e.target))
                const color = e.type === 'supports' ? (HC[e.health || 'weak'] || '#94a3b8') : '#cbd5e1'
                const dy = (tp.y - sp.y) * 0.4
                const path = `M${sp.x},${sp.y} C${sp.x},${sp.y + dy} ${tp.x},${tp.y - dy} ${tp.x},${tp.y}`
                return (
                  <path key={i} d={path} fill="none" stroke={color}
                    strokeWidth={lit ? 2.5 : 1}
                    opacity={lit === null ? 0.25 : lit ? 0.85 : 0.04}
                    style={{ transition: 'opacity .25s, stroke-width .25s' }}
                  />
                )
              })}

              {/* 场景节点 */}
              {data.network.nodes.filter(n => n.type === 'scene').map(n => {
                const p = layout.positions.get(n.id)
                if (!p) return null
                const active = litIds === null ? null : litIds.has(n.id)
                const op = active === null ? 1 : active ? 1 : 0.1
                const fill = n.hit ? '#ede9fe' : '#f8fafc'
                const stroke = n.hit ? '#8b5cf6' : '#94a3b8'
                const pts = Array.from({ length: 6 }, (_, i) => {
                  const a = Math.PI / 3 * i - Math.PI / 2
                  return `${p.x + SCENE_R * Math.cos(a)},${p.y + SCENE_R * Math.sin(a)}`
                }).join(' ')
                return (
                  <g key={n.id} data-node style={{ cursor: 'pointer', opacity: op, transition: 'opacity .25s' }}
                    onMouseEnter={() => setHovered(n.id)} onMouseLeave={() => setHovered(null)} onClick={() => setSelected(n)}>
                    <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={active ? 2.5 : 1}
                      filter={active ? 'url(#glow-scene)' : undefined} />
                    <text x={p.x} y={p.y + SCENE_R + 14} textAnchor="middle" fontSize="10" fontWeight="500" fill="#6d28d9">
                      {n.label.length > 12 ? n.label.slice(0, 11) + '…' : n.label}
                    </text>
                  </g>
                )
              })}

              {/* 命题节点 */}
              {data.network.nodes.filter(n => n.type === 'proposition').map(n => {
                const p = layout.positions.get(n.id)
                if (!p) return null
                const active = litIds === null ? null : litIds.has(n.id)
                const op = active === null ? 1 : active ? 1 : 0.1
                const r = n.doc_count && n.doc_count >= 3 ? NODE_R + 4 : n.doc_count === 2 ? NODE_R : NODE_R - 4
                const color = HC[n.health || 'weak'] || '#999'
                return (
                  <g key={n.id} data-node style={{ cursor: 'pointer', opacity: op, transition: 'opacity .25s' }}
                    onMouseEnter={() => setHovered(n.id)} onMouseLeave={() => setHovered(null)} onClick={() => setSelected(n)}>
                    <circle cx={p.x} cy={p.y} r={r} fill={color + '18'} stroke={color} strokeWidth={active ? 2.5 : 1.2}
                      filter={active ? `url(#glow-${n.health || 'weak'})` : undefined} />
                    <circle cx={p.x} cy={p.y} r={3} fill={color} opacity="0.6" />
                    <text x={p.x} y={p.y + r + 14} textAnchor="middle" fontSize="9" fontWeight="400" fill={color}>
                      {n.label.length > 14 ? n.label.slice(0, 13) + '…' : n.label}
                    </text>
                  </g>
                )
              })}

              {/* 文档节点 */}
              {data.network.nodes.filter(n => n.type === 'document').map(n => {
                const p = layout.positions.get(n.id)
                if (!p) return null
                const active = litIds === null ? null : litIds.has(n.id)
                const op = active === null ? 1 : active ? 1 : 0.1
                return (
                  <g key={n.id} data-node style={{ cursor: 'pointer', opacity: op, transition: 'opacity .25s' }}
                    onMouseEnter={() => setHovered(n.id)} onMouseLeave={() => setHovered(null)} onClick={() => setSelected(n)}>
                    <rect x={p.x - DOC_W / 2} y={p.y - DOC_H / 2} width={DOC_W} height={DOC_H} rx={6}
                      fill="#eff6ff" stroke="#3b82f6" strokeWidth={active ? 2 : 0.8}
                      filter={active ? 'url(#glow-doc)' : undefined} />
                    <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="10" fontWeight="500" fill="#1e40af">
                      {n.label.length > 14 ? n.label.slice(0, 13) + '…' : n.label}
                    </text>
                  </g>
                )
              })}
            </svg>

            {/* 缩放控件 */}
            <div className="absolute bottom-4 right-4 flex flex-col gap-1">
              <button onClick={() => zoom(1.3)} className="w-8 h-8 bg-white border border-gray-200 rounded-md flex items-center justify-center hover:bg-gray-50 shadow-sm">
                <ZoomIn className="w-4 h-4 text-gray-600" />
              </button>
              <button onClick={() => zoom(0.7)} className="w-8 h-8 bg-white border border-gray-200 rounded-md flex items-center justify-center hover:bg-gray-50 shadow-sm">
                <ZoomOut className="w-4 h-4 text-gray-600" />
              </button>
              <button onClick={fitAll} className="w-8 h-8 bg-white border border-gray-200 rounded-md flex items-center justify-center hover:bg-gray-50 shadow-sm">
                <Maximize2 className="w-4 h-4 text-gray-600" />
              </button>
            </div>

            {/* 图例 */}
            <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur border border-gray-200 rounded-lg px-3 py-2 flex items-center gap-4 text-[11px] text-gray-500 shadow-sm">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border-2" style={{ borderColor: '#10b981' }} /> 有证据链</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border-2" style={{ borderColor: '#f59e0b' }} /> 证据薄弱</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border-2" style={{ borderColor: '#ef4444' }} /> 已断链</span>
              <span className="w-px h-3 bg-gray-200" />
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: '#eff6ff', border: '1px solid #3b82f6' }} /> 文档</span>
              <span className="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 14 14"><polygon points={Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 3 * i - Math.PI / 2; return `${7 + 6 * Math.cos(a)},${7 + 6 * Math.sin(a)}` }).join(' ')} fill="#ede9fe" stroke="#8b5cf6" strokeWidth="1" /></svg>
                场景
              </span>
            </div>

            {/* 断链告警 */}
            {stats && (stats.dead ?? 0) > 0 && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-red-50 border border-red-200 rounded-lg px-4 py-2 flex items-center gap-2 text-xs shadow-sm">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                <span className="font-medium text-red-600">{stats.dead} 个命题已断链</span>
                <span className="text-red-400">— 早期提出但后续文档未再提及</span>
              </div>
            )}
          </>
        )}

        {/* 详情侧栏 */}
        {selected && (
          <div className="absolute top-0 right-0 w-80 h-full bg-white border-l border-gray-200 shadow-lg overflow-y-auto z-20">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  {selected.type === 'proposition' ? '命题' : selected.type === 'scene' ? '场景' : '文档'} 详情
                </span>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
              </div>

              <h3 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
                {selected.type === 'proposition' && selected.health && (
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: HC[selected.health] }} />
                )}
                {selected.label}
              </h3>

              {selected.type === 'proposition' && selected.health && (
                <span className="inline-block text-[10px] px-2 py-0.5 rounded-full mb-2"
                  style={{ background: HC[selected.health] + '18', color: HC[selected.health] }}>
                  {HL[selected.health]}
                  {selected.doc_count !== undefined && ` · ${selected.doc_count} 份文档提及`}
                </span>
              )}

              {selected.description && (
                <p className="text-xs text-gray-500 mb-3 leading-relaxed">{selected.description}</p>
              )}

              {selected.type === 'proposition' && selected.members && selected.members.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">证据来源</div>
                  <div className="space-y-2">
                    {selected.members.map((m, i) => (
                      <div key={i} className="p-2 rounded bg-gray-50 text-xs">
                        <div className="font-medium text-blue-600 mb-0.5">{m.doc_filename}</div>
                        <div className="text-gray-500 leading-relaxed">{m.detail}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selected.type === 'proposition' && selected.scene_codes && selected.scene_codes.length > 0 && (
                <div>
                  <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">对齐场景</div>
                  <div className="flex flex-wrap gap-1">
                    {selected.scene_codes.map(c => (
                      <span key={c} className="text-[10px] px-2 py-0.5 rounded bg-purple-50 text-purple-600">{c}</span>
                    ))}
                  </div>
                </div>
              )}

              {selected.type === 'scene' && (
                <div className="text-xs text-gray-500">
                  {selected.hit ? (
                    <span className="text-purple-600 font-medium">已命中 — 有命题证据支撑</span>
                  ) : (
                    <span className="text-gray-400">未命中</span>
                  )}
                </div>
              )}

              {/* 关联节点列表 */}
              {data?.network && (
                <div className="mt-4">
                  <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">关联节点</div>
                  <div className="space-y-1">
                    {data.network.edges
                      .filter(e => e.source === selected.id || e.target === selected.id)
                      .map((e, i) => {
                        const otherId = e.source === selected.id ? e.target : e.source
                        const other = nodeMap.get(otherId)
                        if (!other) return null
                        return (
                          <button key={i} onClick={() => { setSelected(other); setHovered(other.id) }}
                            className="w-full text-left p-1.5 rounded hover:bg-gray-50 text-xs flex items-center gap-2 transition-colors">
                            {other.type === 'proposition' && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: HC[other.health || 'weak'] }} />}
                            {other.type === 'document' && <span className="w-2 h-2 rounded flex-shrink-0 bg-blue-400" />}
                            {other.type === 'scene' && <span className="w-2 h-2 rounded flex-shrink-0 bg-purple-400" />}
                            <span className="truncate text-gray-600">{other.label}</span>
                          </button>
                        )
                      })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
