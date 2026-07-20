import { useEffect, useState, useCallback, useMemo } from 'react'
import { Network, Loader2, AlertTriangle, RefreshCw } from 'lucide-react'
import { toast } from '../Toaster'
import {
  buildPropositionNetwork, getPropositionNetwork, getPropositionNetworkStatus,
  type PropositionNetworkData, type PropositionNetworkNode, type PropositionNetworkEdge,
} from '../../api/scenes'

const HC: Record<string, string> = { alive: '#10b981', weak: '#f59e0b', dead: '#ef4444' }
const HL: Record<string, string> = { alive: '有证据链', weak: '证据薄弱', dead: '已断链' }
const DL: Record<string, string> = {
  LTC: '线索到回款', MTL: '市场到线索', MCR: '客户关系', MPR: '伙伴关系', ITR: '问题到解决',
}

interface LayoutNode {
  n: PropositionNetworkNode
  cx: number
  cy: number
}

function useLayout(data: PropositionNetworkData['network'] | undefined, width: number) {
  return useMemo(() => {
    if (!data?.nodes?.length) return { nodes: [] as LayoutNode[], nodeMap: new Map<string, LayoutNode>(), edges: [] as PropositionNetworkEdge[] }
    const docs = data.nodes.filter(n => n.type === 'document')
    const props = data.nodes.filter(n => n.type === 'proposition')
    const scenes = data.nodes.filter(n => n.type === 'scene')

    const pad = 40
    const usable = width - pad * 2
    const yScene = 36, yProp = 130, yDoc = 224
    const nodeMap = new Map<string, LayoutNode>()
    const nodes: LayoutNode[] = []

    const place = (list: PropositionNetworkNode[], y: number) => {
      const gap = Math.min(usable / (list.length + 1), 100)
      const total = gap * (list.length + 1)
      const offset = pad + (usable - total) / 2
      list.forEach((n, i) => {
        const ln: LayoutNode = { n, cx: offset + gap * (i + 1), cy: y }
        nodes.push(ln)
        nodeMap.set(n.id, ln)
      })
    }

    place(scenes, yScene)
    place(props, yProp)
    place(docs, yDoc)

    return { nodes, nodeMap, edges: data.edges }
  }, [data, width])
}

function EdgePath({ e, nodeMap, lit }: { e: PropositionNetworkEdge; nodeMap: Map<string, LayoutNode>; lit: boolean | null }) {
  const s = nodeMap.get(e.source), t = nodeMap.get(e.target)
  if (!s || !t) return null
  const my = (s.cy + t.cy) / 2
  const d = `M${s.cx},${s.cy} C${s.cx},${my} ${t.cx},${my} ${t.cx},${t.cy}`
  const color = e.type === 'supports' ? (HC[e.health || 'weak'] || '#94a3b8') : '#94a3b8'
  return (
    <path
      d={d} fill="none" stroke={color}
      strokeWidth={lit ? 2 : 1}
      opacity={lit === null ? 0.35 : lit ? 0.8 : 0.06}
      style={{ transition: 'opacity .2s, stroke-width .2s' }}
    />
  )
}

function NodeCircle({ ln, active, onEnter, onLeave, onClick }: {
  ln: LayoutNode; active: boolean | null
  onEnter: () => void; onLeave: () => void; onClick: () => void
}) {
  const n = ln.n
  const r = n.type === 'proposition' ? (n.doc_count && n.doc_count >= 3 ? 16 : n.doc_count === 2 ? 13 : 10) : 12
  const op = active === null ? 1 : active ? 1 : 0.15

  let fill: string, stroke: string
  if (n.type === 'proposition') {
    fill = (HC[n.health || 'weak'] || '#999') + '25'
    stroke = HC[n.health || 'weak'] || '#999'
  } else if (n.type === 'document') {
    fill = '#dbeafe'; stroke = '#3b82f6'
  } else {
    fill = n.hit ? '#ede9fe' : '#f1f5f9'
    stroke = n.hit ? '#8b5cf6' : '#94a3b8'
  }

  const label = n.label.length > 10 ? n.label.slice(0, 9) + '…' : n.label
  const textColor = n.type === 'document' ? '#1e40af' : n.type === 'scene' ? '#6d28d9' : (HC[n.health || 'weak'] || '#666')

  return (
    <g
      style={{ cursor: 'pointer', opacity: op, transition: 'opacity .2s' }}
      onMouseEnter={onEnter} onMouseLeave={onLeave} onClick={onClick}
    >
      {n.type === 'document' ? (
        <rect x={ln.cx - 18} y={ln.cy - 10} width={36} height={20} rx={4}
          fill={fill} stroke={stroke} strokeWidth={active ? 2 : 0.8} />
      ) : n.type === 'scene' ? (
        <polygon
          points={Array.from({ length: 6 }, (_, i) => {
            const a = Math.PI / 3 * i - Math.PI / 2
            return `${ln.cx + r * Math.cos(a)},${ln.cy + r * Math.sin(a)}`
          }).join(' ')}
          fill={fill} stroke={stroke} strokeWidth={active ? 2 : 0.8}
        />
      ) : (
        <circle cx={ln.cx} cy={ln.cy} r={r} fill={fill} stroke={stroke} strokeWidth={active ? 2.5 : 1.2} />
      )}
      <text x={ln.cx} y={ln.cy + r + 12} textAnchor="middle" fontSize={9.5} fontWeight={active ? 600 : 400}
        fill={textColor} style={{ pointerEvents: 'none' }}>
        {label}
      </text>
    </g>
  )
}

export default function PropositionNetworkPanel({ projectId }: { projectId?: string }) {
  const [data, setData] = useState<PropositionNetworkData | null>(null)
  const [loading, setLoading] = useState(false)
  const [building, setBuilding] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const [selected, setSelected] = useState<PropositionNetworkNode | null>(null)
  const [width, setWidth] = useState(600)

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try { setData(await getPropositionNetwork(projectId)) } catch { /* */ } finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { load() }, [load])

  const handleBuild = useCallback(async () => {
    if (!projectId) return
    setBuilding(true)
    try {
      const { task_id } = await buildPropositionNetwork(projectId)
      toast.success('命题网络构建已启动')
      const poll = setInterval(async () => {
        try {
          const st = await getPropositionNetworkStatus(projectId, task_id)
          if (st.ready) { clearInterval(poll); setBuilding(false); await load(); toast.success('命题网络构建完成') }
          else if (st.state === 'FAILURE') { clearInterval(poll); setBuilding(false); toast.error('构建失败: ' + (st.error || '')) }
        } catch { clearInterval(poll); setBuilding(false) }
      }, 3000)
    } catch (e: any) { setBuilding(false); toast.error('启动失败: ' + (e?.message || '')) }
  }, [projectId, load])

  const { nodes, nodeMap, edges } = useLayout(data?.network, width)

  const litIds = useMemo(() => {
    if (!hovered) return null
    const s = new Set<string>([hovered])
    for (const e of edges) {
      if (e.source === hovered || e.target === hovered) { s.add(e.source); s.add(e.target) }
    }
    return s
  }, [hovered, edges])

  const stats = data?.stats
  const sel = selected ? data?.network?.nodes?.find(n => n.id === selected.id) || selected : null

  return (
    <div className="px-4 sm:px-6 py-3" ref={el => { if (el && el.clientWidth !== width) setWidth(el.clientWidth) }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Network className="w-4 h-4 text-purple-500" />
          命题网络
          {stats && <span className="text-xs text-gray-400 font-normal">{stats.proposition_count ?? 0} 命题 · {stats.doc_count ?? 0} 文档 · {stats.scene_hits_with_evidence ?? 0} 场景</span>}
        </div>
        <button onClick={handleBuild} disabled={building}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
          {building ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {building ? '构建中…' : data ? '重新构建' : '构建网络'}
        </button>
      </div>

      {loading && !data && <div className="flex items-center justify-center h-24 text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin mr-2" /> 加载中…</div>}

      {!loading && !data && !building && (
        <div className="flex flex-col items-center justify-center h-24 text-gray-400 text-sm">
          <Network className="w-8 h-8 mb-2 opacity-30" />
          <span>尚未构建命题网络</span>
          <span className="text-xs mt-1">点击"构建网络"从项目文档中抽取命题,形成场景证据链</span>
        </div>
      )}

      {nodes.length > 0 && (
        <>
          <div className="border border-gray-100 rounded-lg overflow-hidden bg-gray-50/30">
            <svg viewBox={`0 0 ${width} 260`} width="100%" style={{ display: 'block' }}>
              {/* 层标签 */}
              <text x={12} y={32} fontSize={10} fontWeight={500} fill="#8b5cf6" opacity={0.5}>场景层</text>
              <text x={12} y={126} fontSize={10} fontWeight={500} fill="#666" opacity={0.5}>命题层</text>
              <text x={12} y={220} fontSize={10} fontWeight={500} fill="#3b82f6" opacity={0.5}>文档层</text>
              {/* 分割线 */}
              <line x1={0} y1={80} x2={width} y2={80} stroke="#e5e7eb" strokeWidth={0.5} strokeDasharray="4 4" />
              <line x1={0} y1={176} x2={width} y2={176} stroke="#e5e7eb" strokeWidth={0.5} strokeDasharray="4 4" />
              {/* 连线 */}
              {edges.map((e, i) => (
                <EdgePath key={i} e={e} nodeMap={nodeMap}
                  lit={litIds === null ? null : (litIds.has(e.source) && litIds.has(e.target))} />
              ))}
              {/* 节点 */}
              {nodes.map(ln => (
                <NodeCircle key={ln.n.id} ln={ln}
                  active={litIds === null ? null : litIds.has(ln.n.id)}
                  onEnter={() => setHovered(ln.n.id)}
                  onLeave={() => setHovered(null)}
                  onClick={() => setSelected(ln.n)} />
              ))}
            </svg>
          </div>

          {/* 图例 */}
          <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-400 flex-wrap">
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: '#10b981' }} /> 有证据链</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: '#f59e0b' }} /> 证据薄弱</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: '#ef4444' }} /> 已断链</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded" style={{ background: '#dbeafe', border: '1px solid #3b82f6' }} /> 文档</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded" style={{ background: '#ede9fe', border: '1px solid #8b5cf6' }} /> 场景</span>
          </div>

          {/* 统计 */}
          {stats && (
            <div className="grid grid-cols-4 gap-2 mt-3">
              <SC label="命题总数" value={stats.proposition_count ?? 0} />
              <SC label="有证据链" value={stats.alive ?? 0} color="#10b981" />
              <SC label="证据薄弱" value={stats.weak ?? 0} color="#f59e0b" />
              <SC label="已断链" value={stats.dead ?? 0} color="#ef4444" />
            </div>
          )}

          {/* 选中详情 */}
          {sel && (
            <div className="mt-3 p-3 rounded-lg bg-white border border-gray-100 text-xs">
              <div className="font-medium text-gray-800 mb-1 flex items-center gap-1.5">
                {sel.type === 'proposition' && <span className="inline-block w-2 h-2 rounded-full" style={{ background: HC[sel.health || 'weak'] }} />}
                {sel.label}
                {sel.type === 'proposition' && sel.health && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: HC[sel.health] + '18', color: HC[sel.health] }}>{HL[sel.health]}</span>
                )}
                {sel.type === 'scene' && sel.domain && <span className="text-gray-400">{DL[sel.domain] || sel.domain}</span>}
              </div>
              {sel.description && <div className="text-gray-500 mb-1">{sel.description}</div>}
              {sel.type === 'proposition' && sel.members && (
                <div className="mt-1.5 space-y-1">
                  {sel.members.map((m, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-gray-500">
                      <span className="text-blue-500 flex-shrink-0">{m.doc_filename}</span>
                      <span className="text-gray-400">→</span>
                      <span>{m.detail}</span>
                    </div>
                  ))}
                </div>
              )}
              {sel.type === 'proposition' && sel.scene_codes?.length ? (
                <div className="mt-1.5 text-gray-400">对齐场景: {sel.scene_codes.join(', ')}</div>
              ) : null}
            </div>
          )}

          {/* 断链告警 */}
          {stats && (stats.dead ?? 0) > 0 && (
            <div className="mt-3 p-2.5 rounded-lg bg-red-50 border border-red-100 flex items-start gap-2 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-medium text-red-600">{stats.dead} 个命题已断链</span>
                <span className="text-red-400 ml-1">— 早期提出但后续文档未再提及,可能被取消或遗漏</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SC({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="p-2 rounded-md bg-white border border-gray-100 text-center">
      <div className="text-lg font-semibold" style={color ? { color } : {}}>{value}</div>
      <div className="text-[10px] text-gray-400">{label}</div>
    </div>
  )
}
