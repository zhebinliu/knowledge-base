/**
 * elkLayout — 用 elkjs 的 layered 算法做布局 + **正交边路由**(连线绕开节点)。
 * 给每个节点固定右中(出)/左中(入)端口,使 elk 的边起止点对齐 React Flow 的连接桩。
 * 返回:节点新坐标 + 每条边的折线点(points,存进 edge.data,由 OrthEdge 画)。
 */
import ELK from 'elkjs/lib/elk.bundled.js'
import type { Node, Edge } from '@xyflow/react'

const elk = new ELK()

function sizeOf(n: Node): { w: number; h: number } {
  const w = (n as any).measured?.width ?? (n.type === 'material' ? 150 : 188)
  const h = (n as any).measured?.height ?? (n.type === 'material' ? 64 : 92)
  return { w, h }
}

export async function elkLayout(nodes: Node[], edges: Edge[]): Promise<{ nodes: Node[]; edges: Edge[] }> {
  if (!nodes.length) return { nodes, edges }

  const graph: any = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.spacing.nodeNodeBetweenLayers': '120',
      'elk.spacing.nodeNode': '48',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '14',
      'elk.layered.spacing.edgeNodeBetweenLayers': '28',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    },
    children: nodes.map(n => {
      const { w, h } = sizeOf(n)
      return {
        id: n.id,
        width: w,
        height: h,
        layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
        ports: [
          { id: `${n.id}::out`, x: w, y: h / 2 },   // 右中 = source 桩
          { id: `${n.id}::in`, x: 0, y: h / 2 },     // 左中 = target 桩
        ],
      }
    }),
    edges: edges.map(e => ({ id: e.id, sources: [`${e.source}::out`], targets: [`${e.target}::in`] })),
  }

  const res: any = await elk.layout(graph)
  const pos = new Map<string, { x: number; y: number }>(
    (res.children || []).map((c: any) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]),
  )
  const ptsById = new Map<string, { x: number; y: number }[]>(
    (res.edges || []).map((e: any) => {
      const s = e.sections?.[0]
      const pts = s ? [s.startPoint, ...(s.bendPoints || []), s.endPoint] : []
      return [e.id, pts]
    }),
  )

  return {
    nodes: nodes.map(n => ({ ...n, position: pos.get(n.id) || n.position })),
    edges: edges.map(e => ({ ...e, type: 'orth', data: { ...(e.data || {}), points: ptsById.get(e.id) || [] } })),
  }
}
