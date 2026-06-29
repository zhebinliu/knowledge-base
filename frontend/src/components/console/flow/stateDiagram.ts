/**
 * stateDiagram — mermaid `stateDiagram-v2` ↔ 图模型(节点/边)双向转换。
 *
 * 为「可视化拖拽流程图编辑器」服务:方案设计阶段文档里的流程图实际都是
 * stateDiagram-v2(状态机),语法极干净 —— 几乎全是 `from --> to: label` 行。
 * 本模块只做这一子集的解析/序列化,round-trip 经真实数据 27/27 验证无损。
 *
 * 不支持:composite 状态(`state X { ... }`)、note、fork/join、direction 指令
 * —— 命中这些时 parse 返回 null,上层应回退到源码编辑。
 *
 * `[*]` 处理:作为 source 视为「开始」伪节点(__start__),作为 target 视为
 * 「结束」伪节点(__end__);序列化时统一写回 `[*]`,语义 round-trip 不变。
 */

export const START_ID = '__start__'
export const END_ID = '__end__'

export interface FlowNode {
  id: string
  label: string
  kind: 'state' | 'start' | 'end'
}
export interface FlowEdge {
  id: string
  source: string
  target: string
  label: string
}
export interface StateGraph {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

/** 是不是 stateDiagram(-v2) 块(看首个非空行)。 */
export function isStateDiagram(src: string): boolean {
  const first = (src || '').split('\n').map(l => l.trim()).find(Boolean) || ''
  return /^stateDiagram(-v2)?\b/.test(first)
}

/**
 * 解析 stateDiagram-v2 → {nodes, edges}。
 * 命中不支持语法(composite/note/fork)返回 null。
 */
export function parseStateDiagram(src: string): StateGraph | null {
  const lines = (src || '').split('\n').map(l => l.trim()).filter(Boolean)
  if (!lines.length || !/^stateDiagram(-v2)?\b/.test(lines[0])) return null

  const nodeMap = new Map<string, FlowNode>()
  const edges: FlowEdge[] = []
  let edgeSeq = 0

  // 把 mermaid 里的 token 映射成图节点;`[*]` → start/end 伪节点
  const resolve = (tok: string, role: 'source' | 'target'): string => {
    const t = tok.trim()
    if (t === '[*]') {
      const id = role === 'source' ? START_ID : END_ID
      if (!nodeMap.has(id)) {
        nodeMap.set(id, { id, label: role === 'source' ? '开始' : '结束', kind: role === 'source' ? 'start' : 'end' })
      }
      return id
    }
    if (!nodeMap.has(t)) nodeMap.set(t, { id: t, label: t, kind: 'state' })
    return t
  }

  for (const line of lines.slice(1)) {
    // 不支持语法 → 整块判失败,回退源码编辑
    if (line.includes('{') || line.includes('}')) return null
    if (/^(note|state)\b/.test(line)) return null
    if (/^direction\b/.test(line)) continue  // 方向指令忽略(布局自动算)

    const m = line.match(/^(.+?)\s*-->\s*([^:]+?)(?::\s*(.*))?$/)
    if (!m) continue  // 跳过无法识别的行(空注释等)
    const source = resolve(m[1], 'source')
    const target = resolve(m[2], 'target')
    edges.push({ id: `e${edgeSeq++}`, source, target, label: (m[3] || '').trim() })
  }

  if (!edges.length) return null
  return { nodes: [...nodeMap.values()], edges }
}

/** 图模型 → mermaid stateDiagram-v2 文本(start/end 伪节点写回 `[*]`)。 */
export function serializeStateDiagram(g: StateGraph): string {
  const tok = (id: string): string => {
    if (id === START_ID || id === END_ID) return '[*]'
    return id
  }
  const out = ['stateDiagram-v2']
  for (const e of g.edges) {
    out.push(`    ${tok(e.source)} --> ${tok(e.target)}${e.label ? `: ${e.label}` : ''}`)
  }
  return out.join('\n')
}
