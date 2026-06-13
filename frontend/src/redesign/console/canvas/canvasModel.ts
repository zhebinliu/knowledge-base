/**
 * canvasModel — 项目画布纯逻辑层(无 React)
 *
 *  - 从 getStageFlow() 运行时派生 kind 列表 / label / 阶段分组(不硬编码 13 种)。
 *  - SEED_DEPENDENCY_EDGES:依赖边映射,是「唯一硬编码 kind 字符串」的地方;
 *    若未来增删 OutputKind,记得同步这里(以及 client.ts OutputKind / 后端 KIND_TO_TASK / stage_flow)。
 *  - buildSeedGraph:空项目首载时生成种子图(种子只在用户首次保存时落库)。
 *  - toRF / fromRF:持久化扁平形状 ↔ React Flow Node/Edge;回写时剥掉实时状态。
 *
 * 节点实时状态(已生成/生成中/失败)**不在这里、也不入库** —— 由 ProjectCanvas
 * 在渲染时从 latest-by-kind 通过 context 合并。本层只管"布局 + 派生展示信息"。
 */
import type { Node, Edge } from '@xyflow/react'
import type {
  StageFlowDto, OutputKind,
  WorkflowCanvasNode, WorkflowCanvasEdge,
} from '../../../api/client'

// ── 资料桶(输入节点)────────────────────────────────────────────────────────
export type MaterialKind = 'docs' | 'meetings' | 'brief' | 'research'
export const MATERIAL_BUCKETS: { materialKind: MaterialKind; label: string }[] = [
  { materialKind: 'docs',     label: '项目资料' },
  { materialKind: 'meetings', label: '会议纪要' },
  { materialKind: 'brief',    label: '项目 Brief' },
  { materialKind: 'research', label: '网络调研' },
]

// ── 依赖边映射(可视化依赖图;本阶段不驱动后端数据路由)────────────────────────
// 来源:backend/services/agentic/runner.py STAGE_PRIORS(阶段 1-3 已接线)
//       + 各 research generator 的 prior_bundles 签名(阶段 4-7,当前仅视觉)。
// ⚠️ 这是唯一硬编码 OutputKind 字符串的地方 —— 增删 kind 时同步更新。
export const SEED_DEPENDENCY_EDGES: Partial<Record<OutputKind, OutputKind[]>> = {
  insight:             ['kickoff_pptx', 'kickoff_html', 'survey_outline', 'survey', 'blueprint_design'],
  survey_outline:      ['research_plan', 'survey', 'research_report'],
  survey:              ['research_report'],
  research_report:     ['blueprint_design', 'object_field_layout', 'process_setup', 'implementation_plan', 'test_plan', 'acceptance_report'],
  blueprint_design:    ['object_field_layout', 'process_setup', 'implementation_plan', 'test_plan', 'acceptance_report'],
  implementation_plan: ['test_plan', 'acceptance_report'],
  test_plan:           ['acceptance_report'],
}

// 资料 → 生成节点的种子边(纯视觉,提示"喂素材")
const MATERIAL_SEED_EDGES: { material: MaterialKind; to: OutputKind }[] = [
  { material: 'docs',     to: 'insight' },
  { material: 'meetings', to: 'insight' },
  { material: 'docs',     to: 'survey_outline' },
]

// ── 节点 id 规则:每个 kind / 资料桶在画布上至多一份 → 用确定性 id,天然去重 ──────
export const genNodeId = (kind: OutputKind) => `gen_${kind}`
export const matNodeId = (m: MaterialKind | string) => `mat_${m}`
export const edgeId = (source: string, target: string) => `e_${source}_${target}`

// ── 从 stage-flow 派生有序的生成 kind 列表 ───────────────────────────────────
export interface KindSpec {
  kind: OutputKind
  label: string
  stageKey: string
  stageLabel: string
  iconName: string       // stageFlow.stage.icon 字符串(节点组件再映射成 lucide)
  beta: boolean
  stageIndex: number
  subIndex: number
}

export function flattenKinds(stageFlow: StageFlowDto | undefined): KindSpec[] {
  const out: KindSpec[] = []
  const stages = (stageFlow?.stages ?? []).filter(s => s.active)
  stages.forEach((s, stageIndex) => {
    const subs = (s.sub_kinds && s.sub_kinds.length > 0)
      ? s.sub_kinds
      : (s.kind ? [{ kind: s.kind, label: s.label }] : [])
    subs.forEach((sk, subIndex) => {
      out.push({
        kind: sk.kind as OutputKind,
        label: sk.label || s.label,
        stageKey: s.key,
        stageLabel: s.label,
        iconName: s.icon,
        beta: !!s.beta,
        stageIndex,
        subIndex,
      })
    })
  })
  return out
}

/** kind → 它所属 stage 的 key(双击节点深链 ?stage= 用) */
export function kindToStageKey(stageFlow: StageFlowDto | undefined, kind: OutputKind): string | null {
  for (const s of stageFlow?.stages ?? []) {
    if (s.kind === kind) return s.key
    if (s.sub_kinds?.some(sk => sk.kind === kind)) return s.key
  }
  return null
}

// ── 布局常量 ─────────────────────────────────────────────────────────────────
const MAT_X = 40
const MAT_Y0 = 80
const MAT_STEP = 120
const GEN_X0 = 340
const GEN_COL_STEP = 280
const GEN_Y0 = 60
const GEN_ROW_STEP = 130

/** 空项目种子图:资料桶左列 + 生成节点按阶段左→右铺开 + 依赖边 */
export function buildSeedGraph(stageFlow: StageFlowDto | undefined): {
  nodes: WorkflowCanvasNode[]
  edges: WorkflowCanvasEdge[]
} {
  const kinds = flattenKinds(stageFlow)
  const presentKinds = new Set(kinds.map(k => k.kind))

  const nodes: WorkflowCanvasNode[] = []

  // 资料桶
  MATERIAL_BUCKETS.forEach((b, i) => {
    nodes.push({
      id: matNodeId(b.materialKind),
      type: 'material',
      materialKind: b.materialKind,
      label: b.label,
      x: MAT_X,
      y: MAT_Y0 + i * MAT_STEP,
    })
  })

  // 生成节点
  kinds.forEach(k => {
    nodes.push({
      id: genNodeId(k.kind),
      type: 'generation',
      kind: k.kind,
      label: k.label,
      x: GEN_X0 + k.stageIndex * GEN_COL_STEP,
      y: GEN_Y0 + k.subIndex * GEN_ROW_STEP,
    })
  })

  // 依赖边(仅在两端 kind 都存在时连)
  const edges: WorkflowCanvasEdge[] = []
  const pushEdge = (sourceId: string, targetId: string) => {
    const id = edgeId(sourceId, targetId)
    if (!edges.some(e => e.id === id)) edges.push({ id, source: sourceId, target: targetId })
  }
  for (const [src, targets] of Object.entries(SEED_DEPENDENCY_EDGES)) {
    if (!presentKinds.has(src as OutputKind)) continue
    for (const tgt of targets || []) {
      if (presentKinds.has(tgt)) pushEdge(genNodeId(src as OutputKind), genNodeId(tgt))
    }
  }
  for (const { material, to } of MATERIAL_SEED_EDGES) {
    if (presentKinds.has(to)) pushEdge(matNodeId(material), genNodeId(to))
  }

  return { nodes, edges }
}

// ── 持久化形状 ↔ React Flow ──────────────────────────────────────────────────
// RF node.data 只放静态展示信息;实时状态由节点组件从 context 读 latest-by-kind。

export interface GenNodeData extends Record<string, unknown> {
  kind: OutputKind
  label: string
  iconName: string
  stageLabel: string
  beta: boolean
}
export interface MatNodeData extends Record<string, unknown> {
  materialKind: MaterialKind | string
  label: string
}

export function toRFNodes(
  persisted: WorkflowCanvasNode[],
  stageFlow: StageFlowDto | undefined,
): Node[] {
  const specByKind = new Map(flattenKinds(stageFlow).map(k => [k.kind, k]))
  return persisted.map(n => {
    if (n.type === 'material') {
      const bucket = MATERIAL_BUCKETS.find(b => b.materialKind === n.materialKind)
      const data: MatNodeData = {
        materialKind: (n.materialKind as MaterialKind) || 'docs',
        label: n.label || bucket?.label || '资料',
      }
      return { id: n.id, type: 'material', position: { x: n.x, y: n.y }, data }
    }
    const spec = n.kind ? specByKind.get(n.kind) : undefined
    const data: GenNodeData = {
      kind: (n.kind as OutputKind),
      label: spec?.label || n.label || String(n.kind ?? ''),
      iconName: spec?.iconName || 'FileText',
      stageLabel: spec?.stageLabel || '',
      beta: spec?.beta ?? false,
    }
    return { id: n.id, type: 'generation', position: { x: n.x, y: n.y }, data }
  })
}

export function toRFEdges(persisted: WorkflowCanvasEdge[]): Edge[] {
  return persisted.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label || undefined,
  }))
}

/** RF Node[] → 持久化扁平形状;剥掉 data 里的派生/状态信息,只留布局必需字段。 */
export function fromRFNodes(nodes: Node[]): WorkflowCanvasNode[] {
  return nodes.map(n => {
    const d = (n.data || {}) as Partial<GenNodeData & MatNodeData>
    const base = { id: n.id, type: (n.type as 'generation' | 'material'), x: n.position.x, y: n.position.y }
    if (n.type === 'material') {
      return { ...base, materialKind: (d.materialKind as string) ?? null }
    }
    return { ...base, kind: (d.kind as OutputKind) ?? null }
  })
}

export function fromRFEdges(edges: Edge[]): WorkflowCanvasEdge[] {
  return edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: typeof e.label === 'string' ? e.label : null,
  }))
}
