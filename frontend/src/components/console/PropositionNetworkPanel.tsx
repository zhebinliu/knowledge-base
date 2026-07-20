import { useEffect, useState, useCallback, useRef } from 'react'
import { Network, Loader2, AlertTriangle, RefreshCw } from 'lucide-react'
import { toast } from '../Toaster'
import {
  buildPropositionNetwork, getPropositionNetwork, getPropositionNetworkStatus,
  type PropositionNetworkData, type PropositionNetworkNode, type PropositionNetworkEdge,
} from '../../api/scenes'

const HEALTH_COLOR: Record<string, string> = {
  alive: '#10b981',
  weak: '#f59e0b',
  dead: '#ef4444',
}
const HEALTH_LABEL: Record<string, string> = {
  alive: '有证据链',
  weak: '证据薄弱',
  dead: '已断链',
}
const TYPE_COLOR: Record<string, string> = {
  document: '#3b82f6',
  scene: '#8b5cf6',
}
const DOMAIN_LABEL: Record<string, string> = {
  LTC: '线索到回款', MTL: '市场到线索', MCR: '客户关系', MPR: '伙伴关系', ITR: '问题到解决',
}

interface SimNode extends PropositionNetworkNode {
  x: number; y: number; vx: number; vy: number; radius: number
  pinned?: boolean
}

function buildSimulation(data: PropositionNetworkData['network'], width: number, height: number) {
  const nodeMap = new Map<string, SimNode>()
  const nodes: SimNode[] = []

  const docNodes = data.nodes.filter(n => n.type === 'document')
  const propNodes = data.nodes.filter(n => n.type === 'proposition')
  const sceneNodes = data.nodes.filter(n => n.type === 'scene')

  const layerY = { document: height * 0.82, proposition: height * 0.48, scene: height * 0.14 }

  docNodes.forEach((n, i) => {
    const sn: SimNode = {
      ...n, x: (i + 1) * width / (docNodes.length + 1), y: layerY.document + (Math.random() - 0.5) * 30,
      vx: 0, vy: 0, radius: 18,
    }
    nodes.push(sn); nodeMap.set(n.id, sn)
  })
  propNodes.forEach((n, i) => {
    const r = n.doc_count && n.doc_count >= 3 ? 22 : n.doc_count === 2 ? 18 : 14
    const sn: SimNode = {
      ...n, x: (i + 1) * width / (propNodes.length + 1), y: layerY.proposition + (Math.random() - 0.5) * 40,
      vx: 0, vy: 0, radius: r,
    }
    nodes.push(sn); nodeMap.set(n.id, sn)
  })
  sceneNodes.forEach((n, i) => {
    const sn: SimNode = {
      ...n, x: (i + 1) * width / (sceneNodes.length + 1), y: layerY.scene + (Math.random() - 0.5) * 30,
      vx: 0, vy: 0, radius: 16,
    }
    nodes.push(sn); nodeMap.set(n.id, sn)
  })

  return { nodes, nodeMap, edges: data.edges }
}

function tick(nodes: SimNode[], edges: PropositionNetworkEdge[], nodeMap: Map<string, SimNode>, width: number, height: number) {
  const repulsion = 800
  const attraction = 0.005
  const damping = 0.85
  const layerForce = 0.02
  const layerY = { document: height * 0.82, proposition: height * 0.48, scene: height * 0.14 }

  for (const a of nodes) {
    if (a.pinned) continue
    for (const b of nodes) {
      if (a === b) continue
      const dx = a.x - b.x, dy = a.y - b.y
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
      const f = repulsion / (dist * dist)
      a.vx += (dx / dist) * f
      a.vy += (dy / dist) * f
    }
  }

  for (const e of edges) {
    const s = nodeMap.get(e.source), t = nodeMap.get(e.target)
    if (!s || !t) continue
    const dx = t.x - s.x, dy = t.y - s.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const f = (dist - 120) * attraction
    if (!s.pinned) { s.vx += (dx / dist) * f; s.vy += (dy / dist) * f }
    if (!t.pinned) { t.vx -= (dx / dist) * f; t.vy -= (dy / dist) * f }
  }

  for (const n of nodes) {
    if (n.pinned) continue
    const target = layerY[n.type as keyof typeof layerY] ?? height / 2
    n.vy += (target - n.y) * layerForce

    n.vx *= damping; n.vy *= damping
    n.x += n.vx; n.y += n.vy
    n.x = Math.max(n.radius + 10, Math.min(width - n.radius - 10, n.x))
    n.y = Math.max(n.radius + 10, Math.min(height - n.radius - 10, n.y))
  }
}

function draw(
  ctx: CanvasRenderingContext2D, nodes: SimNode[], edges: PropositionNetworkEdge[],
  nodeMap: Map<string, SimNode>, hovered: SimNode | null, width: number, height: number,
  dpr: number,
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  const hoveredEdges = new Set<string>()
  if (hovered) {
    for (const e of edges) {
      if (e.source === hovered.id || e.target === hovered.id) {
        hoveredEdges.add(e.source); hoveredEdges.add(e.target)
      }
    }
  }

  for (const e of edges) {
    const s = nodeMap.get(e.source), t = nodeMap.get(e.target)
    if (!s || !t) continue
    const active = !hovered || hoveredEdges.has(e.source) && hoveredEdges.has(e.target)
    ctx.beginPath()
    ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y)
    const color = e.type === 'supports' ? (HEALTH_COLOR[e.health || 'weak'] || '#999') : '#94a3b8'
    ctx.strokeStyle = color
    ctx.globalAlpha = active ? 0.6 : 0.08
    ctx.lineWidth = active ? 1.5 : 0.5
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  for (const n of nodes) {
    const dimmed = hovered && !hoveredEdges.has(n.id) && n !== hovered
    ctx.globalAlpha = dimmed ? 0.15 : 1

    ctx.beginPath()
    if (n.type === 'proposition') {
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2)
      ctx.fillStyle = HEALTH_COLOR[n.health || 'weak'] || '#999'
      ctx.globalAlpha = dimmed ? 0.1 : 0.15; ctx.fill()
      ctx.globalAlpha = dimmed ? 0.15 : 1
      ctx.strokeStyle = HEALTH_COLOR[n.health || 'weak'] || '#999'
      ctx.lineWidth = n === hovered ? 2.5 : 1.5; ctx.stroke()
    } else if (n.type === 'document') {
      const w = n.radius * 2.2, h = n.radius * 1.4
      ctx.roundRect(n.x - w / 2, n.y - h / 2, w, h, 4)
      ctx.fillStyle = '#dbeafe'; ctx.fill()
      ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = n === hovered ? 2 : 1; ctx.stroke()
    } else {
      const r = n.radius
      ctx.moveTo(n.x, n.y - r)
      for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 3 * i - Math.PI / 2
        ctx.lineTo(n.x + r * Math.cos(angle), n.y + r * Math.sin(angle))
      }
      ctx.closePath()
      ctx.fillStyle = n.hit ? '#ede9fe' : '#f1f5f9'; ctx.fill()
      ctx.strokeStyle = n.hit ? '#8b5cf6' : '#94a3b8'; ctx.lineWidth = n === hovered ? 2 : 1; ctx.stroke()
    }

    ctx.fillStyle = n.type === 'document' ? '#1e40af' : n.type === 'scene' ? '#6d28d9' : (HEALTH_COLOR[n.health || 'weak'] || '#666')
    ctx.font = `${n === hovered ? '600' : '400'} 10px -apple-system, sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    const label = n.label.length > 12 ? n.label.slice(0, 11) + '…' : n.label
    ctx.fillText(label, n.x, n.y + n.radius + 3)
  }
  ctx.globalAlpha = 1

  ctx.font = '500 11px -apple-system, sans-serif'
  ctx.textAlign = 'left'
  const labels = [
    { y: height * 0.06, label: '场景层', color: '#8b5cf6' },
    { y: height * 0.38, label: '命题层', color: '#666' },
    { y: height * 0.76, label: '文档层', color: '#3b82f6' },
  ]
  for (const l of labels) {
    ctx.fillStyle = l.color; ctx.globalAlpha = 0.5
    ctx.fillText(l.label, 8, l.y)
  }
  ctx.globalAlpha = 1
}

export default function PropositionNetworkPanel({ projectId }: { projectId?: string }) {
  const [data, setData] = useState<PropositionNetworkData | null>(null)
  const [loading, setLoading] = useState(false)
  const [building, setBuilding] = useState(false)
  const [hovered, setHovered] = useState<SimNode | null>(null)
  const [selected, setSelected] = useState<SimNode | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<{ nodes: SimNode[]; nodeMap: Map<string, SimNode>; edges: PropositionNetworkEdge[] } | null>(null)
  const animRef = useRef<number>(0)

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const res = await getPropositionNetwork(projectId)
      setData(res)
    } catch { /* ignore */ } finally { setLoading(false) }
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
          if (st.ready) {
            clearInterval(poll)
            setBuilding(false)
            await load()
            toast.success('命题网络构建完成')
          } else if (st.state === 'FAILURE') {
            clearInterval(poll)
            setBuilding(false)
            toast.error('构建失败: ' + (st.error || '未知错误'))
          }
        } catch { clearInterval(poll); setBuilding(false) }
      }, 3000)
    } catch (e: any) {
      setBuilding(false)
      toast.error('启动失败: ' + (e?.message || ''))
    }
  }, [projectId, load])

  useEffect(() => {
    if (!data?.network?.nodes?.length) return
    const canvas = canvasRef.current
    if (!canvas) return
    const container = canvas.parentElement
    if (!container) return

    const width = container.clientWidth
    const height = 420
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr; canvas.height = height * dpr
    canvas.style.width = width + 'px'; canvas.style.height = height + 'px'

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const sim = buildSimulation(data.network, width, height)
    simRef.current = sim

    let frame = 0
    const maxFrames = 300
    function animate() {
      if (frame < maxFrames) {
        tick(sim.nodes, sim.edges, sim.nodeMap, width, height)
      }
      draw(ctx!, sim.nodes, sim.edges, sim.nodeMap, hovered, width, height, dpr)
      frame++
      animRef.current = requestAnimationFrame(animate)
    }
    animate()

    return () => cancelAnimationFrame(animRef.current)
  }, [data, hovered])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const container = canvas.parentElement
    if (!container) return
    const width = container.clientWidth

    const onMove = (e: MouseEvent) => {
      if (!simRef.current) return
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      let found: SimNode | null = null
      for (const n of simRef.current.nodes) {
        const dx = mx - n.x, dy = my - n.y
        if (Math.sqrt(dx * dx + dy * dy) < n.radius + 5) { found = n; break }
      }
      setHovered(found)
      canvas.style.cursor = found ? 'pointer' : 'default'
    }
    const onClick = () => { if (hovered) setSelected(hovered) }
    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('click', onClick)
    return () => { canvas.removeEventListener('mousemove', onMove); canvas.removeEventListener('click', onClick) }
  }, [hovered])

  const stats = data?.stats
  const sel = selected || hovered

  return (
    <div className="px-4 sm:px-6 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Network className="w-4 h-4 text-purple-500" />
          命题网络
          {stats && (
            <span className="text-xs text-gray-400 font-normal">
              {stats.proposition_count ?? 0} 命题 · {stats.doc_count ?? 0} 文档 · {stats.scene_hits_with_evidence ?? 0} 场景
            </span>
          )}
        </div>
        <button
          onClick={handleBuild}
          disabled={building}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {building ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {building ? '构建中…' : data ? '重新构建' : '构建网络'}
        </button>
      </div>

      {loading && !data && (
        <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> 加载中…
        </div>
      )}

      {!loading && !data && !building && (
        <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm">
          <Network className="w-8 h-8 mb-2 opacity-30" />
          <span>尚未构建命题网络</span>
          <span className="text-xs mt-1">点击"构建网络"从项目文档中抽取命题,形成场景证据链</span>
        </div>
      )}

      {data?.network?.nodes?.length ? (
        <>
          <div className="relative border border-gray-100 rounded-lg overflow-hidden bg-gray-50/50">
            <canvas ref={canvasRef} />
          </div>

          {/* 图例 */}
          <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-400 flex-wrap">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: '#10b981' }} /> 有证据链
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: '#f59e0b' }} /> 证据薄弱
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: '#ef4444' }} /> 已断链
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded" style={{ background: '#dbeafe', border: '1px solid #3b82f6' }} /> 文档
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded" style={{ background: '#ede9fe', border: '1px solid #8b5cf6' }} /> 场景
            </span>
          </div>

          {/* 统计概览 */}
          {stats && (
            <div className="grid grid-cols-4 gap-2 mt-3">
              <StatCard label="命题总数" value={stats.proposition_count ?? 0} />
              <StatCard label="有证据链" value={stats.alive ?? 0} color="#10b981" />
              <StatCard label="证据薄弱" value={stats.weak ?? 0} color="#f59e0b" />
              <StatCard label="已断链" value={stats.dead ?? 0} color="#ef4444" />
            </div>
          )}

          {/* 选中节点详情 */}
          {sel && (
            <div className="mt-3 p-3 rounded-lg bg-white border border-gray-100 text-xs">
              <div className="font-medium text-gray-800 mb-1 flex items-center gap-1.5">
                {sel.type === 'proposition' && (
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: HEALTH_COLOR[sel.health || 'weak'] }} />
                )}
                {sel.label}
                {sel.type === 'proposition' && sel.health && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                    background: HEALTH_COLOR[sel.health] + '18',
                    color: HEALTH_COLOR[sel.health],
                  }}>{HEALTH_LABEL[sel.health]}</span>
                )}
                {sel.type === 'scene' && sel.domain && (
                  <span className="text-gray-400">{DOMAIN_LABEL[sel.domain] || sel.domain}</span>
                )}
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
                <div className="mt-1.5 text-gray-400">
                  对齐场景: {sel.scene_codes.join(', ')}
                </div>
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
      ) : null}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="p-2 rounded-md bg-white border border-gray-100 text-center">
      <div className="text-lg font-semibold" style={color ? { color } : {}}>{value}</div>
      <div className="text-[10px] text-gray-400">{label}</div>
    </div>
  )
}
