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
  WorkflowCanvasNode, WorkflowCanvasEdge, LatestByKind,
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
// 精简成「主链」(每个节点只连主要上游),避免画布连线太多/交叉。用户可自行补连。
export const SEED_DEPENDENCY_EDGES: Partial<Record<OutputKind, OutputKind[]>> = {
  insight:             ['kickoff_pptx', 'kickoff_html', 'survey_outline'],
  survey_outline:      ['survey'],
  survey:              ['research_report'],
  research_report:     ['blueprint_design'],
  blueprint_design:    ['object_field_layout', 'process_setup', 'implementation_plan'],
  implementation_plan: ['test_plan'],
  test_plan:           ['acceptance_report'],
}

// 资料 → 生成节点的种子边:默认不连(用户自行连),保持画布清爽
const MATERIAL_SEED_EDGES: { material: MaterialKind; to: OutputKind }[] = []

// ── 节点 id 规则:每个 kind / 资料桶在画布上至多一份 → 用确定性 id,天然去重 ──────
export const genNodeId = (kind: OutputKind) => `gen_${kind}`
export const matNodeId = (m: MaterialKind | string) => `mat_${m}`
export const edgeId = (source: string, target: string) => `e_${source}_${target}`
// 自定义输入节点可多份 → 用随机实例 id(不依赖 crypto.randomUUID,老 webkit 没有)
export const newId = (prefix = 'n') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

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

/** 某 kind 是否已有产物(done/inflight/failed 任一) */
function hasBundle(latestByKind: LatestByKind | undefined, kind: OutputKind): boolean {
  const slot = latestByKind?.[kind]
  return !!(slot && (slot.done || slot.inflight || slot.failed))
}

/**
 * 种子图:资料桶(输入)始终铺在左列;生成节点**只放已有产物的 kind**
 * (done/inflight/failed),其余留在「节点库」里供用户拖拽自由组合。
 * 全新项目 → 只有 4 个资料桶,画布是空白起点,节点库满是可拖拽的交付物节点。
 */
export function buildSeedGraph(
  stageFlow: StageFlowDto | undefined,
  latestByKind?: LatestByKind,
): { nodes: WorkflowCanvasNode[]; edges: WorkflowCanvasEdge[] } {
  const kinds = flattenKinds(stageFlow)
  // 只种已有产物的生成节点
  const seedKinds = kinds.filter(k => hasBundle(latestByKind, k.kind))
  const presentKinds = new Set(seedKinds.map(k => k.kind))

  const nodes: WorkflowCanvasNode[] = []

  // 资料桶(始终)
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

  // 生成节点(仅已有产物)
  seedKinds.forEach(k => {
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

// ── 自定义输入节点(可多份,用 newId 生成实例 id)────────────────────────────
export type InputNodeType = 'note' | 'webpage' | 'file'
export interface NoteNodeData extends Record<string, unknown> { text: string }
export interface WebpageNodeData extends Record<string, unknown> { url: string; title?: string }
export interface FileNodeData extends Record<string, unknown> { docId?: string; filename?: string; status?: string }

export const INPUT_NODE_DEFS: { type: InputNodeType; label: string }[] = [
  { type: 'note',    label: '手写备注' },
  { type: 'webpage', label: '网页' },
  { type: 'file',    label: '文件' },
]
const INPUT_TYPES = new Set<string>(['note', 'webpage', 'file'])

/** 新建一个自定义输入节点(持久化形状) */
export function newInputNode(type: InputNodeType, x: number, y: number): WorkflowCanvasNode {
  const data = type === 'note' ? { text: '' } : type === 'webpage' ? { url: '' } : {}
  return { id: newId(type), type, x, y, data }
}

export function toRFNodes(
  persisted: WorkflowCanvasNode[],
  stageFlow: StageFlowDto | undefined,
): Node[] {
  const specByKind = new Map(flattenKinds(stageFlow).map(k => [k.kind, k]))
  return persisted.map(n => {
    if (INPUT_TYPES.has(n.type)) {
      // 自定义输入:data 直接透传(text/url/docId/filename)
      return { id: n.id, type: n.type, position: { x: n.x, y: n.y }, data: { ...(n.data || {}) } }
    }
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
    const d = (n.data || {}) as Record<string, any>
    const base = { id: n.id, type: (n.type as WorkflowCanvasNode['type']), x: n.position.x, y: n.position.y }
    if (INPUT_TYPES.has(n.type as string)) {
      // 只存内容字段,丢掉派生/瞬时(如 file 的 status 也一并存,便于回显)
      const data: Record<string, any> = {}
      for (const k of ['text', 'url', 'title', 'docId', 'filename', 'status']) {
        if (d[k] !== undefined) data[k] = d[k]
      }
      return { ...base, data }
    }
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
