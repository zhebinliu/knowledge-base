/**
 * OrthEdge — 自定义边:
 *  - 有 elk 路由折线点(data.points)→ 画绕开节点的正交折线(圆角)
 *  - 没有(初始/拖动后)→ 退回 React Flow 的 smoothstep 路径
 */
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react'

type Pt = { x: number; y: number }

function roundedOrthPath(pts: Pt[], r = 8): string {
  if (pts.length < 2) return ''
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`
  const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1]
    const d1 = Math.min(r, dist(p0, p1) / 2)
    const d2 = Math.min(r, dist(p1, p2) / 2)
    const v1x = (p1.x - p0.x) / (dist(p0, p1) || 1), v1y = (p1.y - p0.y) / (dist(p0, p1) || 1)
    const v2x = (p2.x - p1.x) / (dist(p1, p2) || 1), v2y = (p2.y - p1.y) / (dist(p1, p2) || 1)
    const a = { x: p1.x - v1x * d1, y: p1.y - v1y * d1 }
    const b = { x: p1.x + v2x * d2, y: p1.y + v2y * d2 }
    d += ` L ${a.x} ${a.y} Q ${p1.x} ${p1.y} ${b.x} ${b.y}`
  }
  const last = pts[pts.length - 1]
  d += ` L ${last.x} ${last.y}`
  return d
}

export default function OrthEdge(p: EdgeProps) {
  const pts = (p.data as any)?.points as Pt[] | undefined
  let path: string
  if (pts && pts.length >= 2) {
    path = roundedOrthPath(pts)
  } else {
    ;[path] = getSmoothStepPath({
      sourceX: p.sourceX, sourceY: p.sourceY, sourcePosition: p.sourcePosition,
      targetX: p.targetX, targetY: p.targetY, targetPosition: p.targetPosition,
    })
  }
  return <BaseEdge id={p.id} path={path} markerEnd={p.markerEnd} style={p.style} />
}
