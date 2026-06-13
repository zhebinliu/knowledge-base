/**
 * ProjectCanvas — 项目画布(节点式编排视图)容器
 *
 *  Level A:编排现有 13 种交付物 + 4 个资料桶。后端生成器零改动 —— 节点仍自动拉取
 *  它已知的输入。带来的"自由":去强制顺序、自由排布/缩放、任意节点任意时刻运行、
 *  按需挑节点、双击进现有阶段工作区。连线只是可视化依赖图,本阶段不驱动后端路由。
 *
 *  数据流:
 *   - 画布布局 GET/PUT /api/workflow-canvas/{id}(复用 ProjectBrief 表,无迁移)
 *   - 节点实时状态 listLatestByKind(2s 轮询,有 inflight 才轮),经 context 合并进节点,**不入库**
 *   - 运行 generateOutput;双击 → /console/projects/:id?stage=&sub=
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge, reconnectEdge, useReactFlow, MarkerType,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './canvas.css'
import { ArrowLeft, Loader2 } from 'lucide-react'

import {
  getWorkflowCanvas, saveWorkflowCanvas, listLatestByKind, generateOutput,
  getStageFlow, getProject, listProjectDocuments, uploadDocument,
  type OutputKind, type CuratedBundle, type WorkflowCanvasNode,
} from '../../../api/client'
import {
  buildSeedGraph, toRFNodes, toRFEdges, fromRFNodes, fromRFEdges,
  kindToStageKey, genNodeId, matNodeId, edgeId, flattenKinds, SEED_DEPENDENCY_EDGES,
  newInputNode, type InputNodeType,
} from './canvasModel'
import GenerationNode from './GenerationNode'
import MaterialNode from './MaterialNode'
import { NoteNode, WebpageNode, FileNode } from './InputNodes'
import NodePalette, { DND_MIME, type PalettePayload } from './NodePalette'
import CanvasToolbar from './CanvasToolbar'
import OrthEdge from './OrthEdge'
// elkLayout 动态 import(elk.bundled.js ~1.4MB)—— 仅「整理布局」点击时才下载,画布页保持轻量
import { CanvasActionsContext, type CanvasActions, type NodeStatus } from './canvasContext'

// nodeTypes/edgeTypes 必须模块级稳定引用(否则 React Flow 每次渲染重建报警)
const nodeTypes = {
  generation: GenerationNode, material: MaterialNode,
  note: NoteNode, webpage: WebpageNode, file: FileNode,
}
const edgeTypes = { orth: OrthEdge }

// ── 自研分层布局(longest-path):无第三方依赖,左→右 DAG ─────────────────────
function layeredLayout(nodes: Node[], edges: Edge[]): Node[] {
  const incoming = new Map<string, string[]>()
  nodes.forEach(n => incoming.set(n.id, []))
  edges.forEach(e => { if (incoming.has(e.target)) incoming.get(e.target)!.push(e.source) })

  const depth = new Map<string, number>()
  const visiting = new Set<string>()
  const calc = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!
    if (visiting.has(id)) return 0          // 环保护
    visiting.add(id)
    let d = 0
    for (const u of incoming.get(id) || []) d = Math.max(d, calc(u) + 1)
    visiting.delete(id)
    depth.set(id, d)
    return d
  }
  nodes.forEach(n => calc(n.id))

  const cols = new Map<number, Node[]>()
  nodes.forEach(n => {
    const d = depth.get(n.id) || 0
    if (!cols.has(d)) cols.set(d, [])
    cols.get(d)!.push(n)
  })

  const X0 = 40, COL = 280, Y0 = 60, ROW = 130
  const pos = new Map<string, { x: number; y: number }>()
  ;[...cols.keys()].sort((a, b) => a - b).forEach(d => {
    cols.get(d)!.forEach((n, i) => pos.set(n.id, { x: X0 + d * COL, y: Y0 + i * ROW }))
  })
  return nodes.map(n => ({ ...n, position: pos.get(n.id) || n.position }))
}

function CanvasInner() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const qc = useQueryClient()
  const { screenToFlowPosition, fitView } = useReactFlow()
  const wrapRef = useRef<HTMLDivElement>(null)
  const seededRef = useRef(false)   // 只初始化一次,避免轮询/保存回填时冲掉未保存编辑

  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[])
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[])
  const [dirty, setDirty] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(true)
  const [pendingRun, setPendingRun] = useState<Set<OutputKind>>(new Set())

  // ── 查询 ─────────────────────────────────────────────────────────────────
  const { data: project } = useQuery({ queryKey: ['project', id], queryFn: () => getProject(id!), enabled: !!id })
  const { data: docs } = useQuery({ queryKey: ['project-docs', id], queryFn: () => listProjectDocuments(id!), enabled: !!id })
  const { data: stageFlow } = useQuery({
    queryKey: ['stage-flow'], queryFn: getStageFlow, staleTime: 30 * 1000, refetchOnMount: 'always',
  })
  const { data: canvasData, isLoading: canvasLoading } = useQuery({
    queryKey: ['workflow-canvas', id], queryFn: () => getWorkflowCanvas(id!), enabled: !!id,
  })
  const { data: latestByKind, refetch: refetchLatest } = useQuery({
    queryKey: ['project-latest-by-kind', id], queryFn: () => listLatestByKind(id!), enabled: !!id,
    refetchInterval: (q: any) => {
      const dict = q.state.data ?? {}
      const anyInflight = Object.values(dict).some((slot: any) => slot?.inflight)
      const anyPartial = Object.values(dict).some((slot: any) => {
        const b: CuratedBundle | null = slot?.done
        if (!b) return false
        const rp = (b as any).role_progress || {}
        const ssp = (b as any).session_progress || {}
        return Object.values(rp).some(v => v === 'generating') || Object.values(ssp).some(v => v === 'generating')
      })
      return (anyInflight || anyPartial) ? 2000 : false
    },
  })

  // ── 初始化(只一次):服务端有则用,空则种子图(资料桶 + 已有产物节点)──────────
  useEffect(() => {
    if (!canvasData || !stageFlow || seededRef.current) return
    const hasContent = canvasData.nodes?.length || canvasData.edges?.length
    if (hasContent) {
      setNodes(toRFNodes(canvasData.nodes as WorkflowCanvasNode[], stageFlow))
      setEdges(toRFEdges(canvasData.edges as any))
      setDirty(false)
      seededRef.current = true
      return
    }
    // 空画布 → 等首个 latest-by-kind 到位再种(以便把已有产物的节点种上)
    if (latestByKind === undefined) return
    const seed = buildSeedGraph(stageFlow, latestByKind)
    setNodes(toRFNodes(seed.nodes, stageFlow))
    setEdges(toRFEdges(seed.edges))
    setDirty(false)
    seededRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasData, stageFlow, latestByKind])

  // ── pending(乐观 inflight)清理:轮询拿到 inflight/done 后撤掉 ────────────────
  useEffect(() => {
    if (!latestByKind || pendingRun.size === 0) return
    let changed = false
    const next = new Set(pendingRun)
    for (const k of pendingRun) {
      const slot = (latestByKind as any)[k]
      if (slot?.inflight || slot?.done) { next.delete(k); changed = true }
    }
    if (changed) setPendingRun(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestByKind])

  // ── dirty 追踪:位置/增删才算改动,选中/测量不算 ──────────────────────────────
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes)
    if (changes.some(c => c.type === 'position' || c.type === 'remove' || c.type === 'add')) {
      setDirty(true)
      // 节点移动后,elk 算出的正交路由点会错位 → 清掉,连线回退到 smoothstep(贴合新位置)
      setEdges(eds => eds.some(e => (e.data as any)?.points?.length)
        ? eds.map(e => (e.data as any)?.points?.length ? { ...e, data: { ...e.data, points: undefined } } : e)
        : eds)
    }
  }, [onNodesChange, setEdges])
  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChange(changes)
    if (changes.some(c => c.type === 'remove' || c.type === 'add')) setDirty(true)
  }, [onEdgesChange])

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return
    setEdges(eds => {
      if (eds.some(e => e.source === c.source && e.target === c.target)) return eds
      return addEdge({ ...c, id: edgeId(c.source!, c.target!) }, eds)
    })
    setDirty(true)
  }, [setEdges])

  // 拖动已有连线的端点 → 重新接到别的节点
  const onReconnect = useCallback((oldEdge: Edge, newConn: Connection) => {
    if (!newConn.source || !newConn.target || newConn.source === newConn.target) return
    setEdges(eds => reconnectEdge(oldEdge, newConn, eds))
    setDirty(true)
  }, [setEdges])

  // ── 添加节点(拖拽 / 点击)────────────────────────────────────────────────────
  const addNodeFromPayload = useCallback((p: PalettePayload, position: { x: number; y: number }) => {
    let persisted: WorkflowCanvasNode
    if (p.nodeType === 'generation') {
      persisted = { id: genNodeId(p.outputKind!), type: 'generation', kind: p.outputKind!, x: position.x, y: position.y }
    } else if (p.nodeType === 'material') {
      persisted = { id: matNodeId(p.materialKind!), type: 'material', materialKind: p.materialKind!, x: position.x, y: position.y }
    } else {
      persisted = newInputNode(p.nodeType as InputNodeType, position.x, position.y)   // note/webpage/file:可多份
    }
    setNodes(nds => {
      if (nds.some(n => n.id === persisted.id)) return nds
      return [...nds, toRFNodes([persisted], stageFlow)[0]]
    })
    setDirty(true)
  }, [setNodes, stageFlow])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData('text/plain')
    if (!raw || raw[0] !== '{') return
    try {
      const p: PalettePayload = JSON.parse(raw)
      addNodeFromPayload(p, screenToFlowPosition({ x: e.clientX, y: e.clientY }))
    } catch { /* ignore */ }
  }, [addNodeFromPayload, screenToFlowPosition])
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'
  }, [])

  const onPaletteAdd = useCallback((p: PalettePayload) => {
    const rect = wrapRef.current?.getBoundingClientRect()
    const center = rect
      ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      : { x: 240, y: 200 }
    addNodeFromPayload(p, center)
  }, [addNodeFromPayload, screenToFlowPosition])

  // ── 工具栏动作 ───────────────────────────────────────────────────────────────
  const onAutoLayout = useCallback(async () => {
    try {
      const { elkLayout } = await import('./elkLayout')   // 按需加载 elk
      const laid = await elkLayout(nodes, edges)   // elk 分层 + 正交路由(连线绕开节点)
      setNodes(laid.nodes)
      setEdges(laid.edges)
      setDirty(true)
      setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 60)
    } catch {
      setNodes(nds => layeredLayout(nds, edges))   // 兜底:自研分层布局
      setDirty(true)
    }
  }, [nodes, edges, setNodes, setEdges, fitView])

  const onDeleteSelected = useCallback(() => {
    const selNodes = new Set(nodes.filter(n => n.selected).map(n => n.id))
    const selEdges = new Set(edges.filter(e => e.selected).map(e => e.id))
    if (!selNodes.size && !selEdges.size) return
    setNodes(nds => nds.filter(n => !selNodes.has(n.id)))
    setEdges(eds => eds.filter(e => !selEdges.has(e.id) && !selNodes.has(e.source) && !selNodes.has(e.target)))
    setDirty(true)
  }, [nodes, edges, setNodes, setEdges])

  const onFitView = useCallback(() => fitView({ padding: 0.2, duration: 300 }), [fitView])

  const saveMut = useMutation({
    mutationFn: () => saveWorkflowCanvas(id!, { nodes: fromRFNodes(nodes), edges: fromRFEdges(edges) }),
    onSuccess: (data) => { qc.setQueryData(['workflow-canvas', id], data); setDirty(false) },
  })

  const onRevert = useCallback(() => {
    if (!canvasData || !stageFlow) return
    const hasContent = canvasData.nodes?.length || canvasData.edges?.length
    const persisted = hasContent
      ? { nodes: canvasData.nodes, edges: canvasData.edges }
      : buildSeedGraph(stageFlow, latestByKind)
    setNodes(toRFNodes(persisted.nodes as WorkflowCanvasNode[], stageFlow))
    setEdges(toRFEdges(persisted.edges as any))
    setDirty(false)
  }, [canvasData, stageFlow, latestByKind, setNodes, setEdges])

  // 全部添加:把所有缺失的生成节点 + 依赖边铺上,再自动布局(一键得到完整流程总览)
  const onAddAll = useCallback(() => {
    const presentIds = new Set(nodes.map(n => n.id))
    const toAdd = flattenKinds(stageFlow)
      .filter(k => !presentIds.has(genNodeId(k.kind)))
      .map(k => ({ id: genNodeId(k.kind), type: 'generation' as const, kind: k.kind, x: 0, y: 0 }))
    if (!toAdd.length) return
    const newNodes = [...nodes, ...toRFNodes(toAdd, stageFlow)]
    const allIds = new Set(newNodes.map(n => n.id))
    const extraEdges: Edge[] = []
    const push = (s: string, t: string) => {
      const eid = edgeId(s, t)
      if (allIds.has(s) && allIds.has(t) && !edges.some(e => e.id === eid) && !extraEdges.some(e => e.id === eid)) {
        extraEdges.push({ id: eid, source: s, target: t })
      }
    }
    for (const [src, tgts] of Object.entries(SEED_DEPENDENCY_EDGES)) {
      for (const t of tgts || []) push(genNodeId(src as OutputKind), genNodeId(t))
    }
    const newEdges = [...edges, ...extraEdges]
    setNodes(layeredLayout(newNodes, newEdges))
    setEdges(newEdges)
    setDirty(true)
  }, [nodes, edges, stageFlow, setNodes, setEdges])

  // 节点库点击「已添加」项 → 选中并居中定位到该节点
  const onLocate = useCallback((nodeId: string) => {
    setNodes(nds => nds.map(n => ({ ...n, selected: n.id === nodeId })))
    fitView({ nodes: [{ id: nodeId }], duration: 400, maxZoom: 1.2 })
  }, [setNodes, fitView])

  // ── 节点状态 + 动作(经 context 透传给自定义节点)─────────────────────────────
  const onRun = useCallback((kind: OutputKind) => {
    setPendingRun(prev => new Set(prev).add(kind))
    generateOutput({ kind, project_id: id! })
      .then(() => refetchLatest())
      .catch(() => setPendingRun(prev => { const n = new Set(prev); n.delete(kind); return n }))
  }, [id, refetchLatest])

  // 自定义输入节点:更新内容 + 上传文件
  const updateNodeData = useCallback((nodeId: string, patch: Record<string, any>) => {
    setNodes(nds => nds.map(n => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)))
    setDirty(true)
  }, [setNodes])

  const uploadFile = useCallback((nodeId: string, file: File) => {
    updateNodeData(nodeId, { filename: file.name, status: 'uploading' })
    uploadDocument(file, { project_id: id })
      .then(res => {
        const doc: any = res.data
        updateNodeData(nodeId, { docId: doc.id, filename: doc.filename || file.name, status: doc.conversion_status || 'pending' })
      })
      .catch(() => updateNodeData(nodeId, { status: 'failed' }))
  }, [updateNodeData, id])

  const actions = useMemo<CanvasActions>(() => {
    const statusOf = (kind: OutputKind): NodeStatus => {
      const slot = (latestByKind as any)?.[kind]
      if (slot?.inflight || pendingRun.has(kind)) return 'inflight'
      if (slot?.done) return 'done'
      if (slot?.failed) return 'failed'
      return 'idle'
    }
    const failedTraceOf = (kind: OutputKind): string | null => {
      const f = (latestByKind as any)?.[kind]?.failed
      return f ? (f.trace_id ?? null) : null
    }
    const uiSuffix = sp.get('ui') === 'new' ? 'ui=new' : ''
    const onOpenGeneration = (kind: OutputKind) => {
      const stageKey = kindToStageKey(stageFlow, kind)
      const q = [stageKey ? `stage=${stageKey}` : '', `sub=${kind}`, uiSuffix].filter(Boolean).join('&')
      nav(`/console/projects/${id}?${q}`)
    }
    const onOpenMaterial = (_m: string) => {
      nav(`/console/projects/${id}${uiSuffix ? `?${uiSuffix}` : ''}`)
    }
    const countOf = (m: string) => (m === 'docs' ? (docs?.length ?? null) : null)
    return { statusOf, failedTraceOf, onRun, onOpenGeneration, onOpenMaterial, countOf, updateNodeData, uploadFile }
  }, [latestByKind, pendingRun, stageFlow, docs, id, nav, sp, onRun, updateNodeData, uploadFile])

  const onRunAll = useCallback(() => {
    const genKinds = nodes.filter(n => n.type === 'generation').map(n => (n.data as any).kind as OutputKind)
    const todo = genKinds.filter(k => actions.statusOf(k) === 'idle' || actions.statusOf(k) === 'failed')
    if (!todo.length) { window.alert('没有未开始 / 失败的节点需要运行'); return }
    if (!window.confirm(`将按依赖顺序运行 ${todo.length} 个节点,确认?`)) return
    todo.forEach(k => onRun(k))
  }, [nodes, actions, onRun])

  const hasSelection = nodes.some(n => n.selected) || edges.some(e => e.selected)
  const uiQuery = sp.get('ui') === 'new' ? '?ui=new' : ''
  // 主题:新 UI(uat / ?ui=new)深色;prod 旧浅色界面用浅色
  const isDark = typeof window !== 'undefined' && (window.location.hostname === 'uat.tokenwave.cloud' || sp.get('ui') === 'new')

  if (canvasLoading || !stageFlow) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>
        <Loader2 size={15} className="animate-spin" style={{ marginRight: 6 }} />加载项目画布…
      </div>
    )
  }

  return (
    <div
      className={`kb-canvas${isDark ? '' : ' kb-canvas-light'}`}
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--cv-bg)' }}
    >
      {/* 顶栏:返回 + 标题 */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
        borderBottom: '1px solid var(--cv-line)', background: 'var(--cv-toolbar-bg)',
      }}>
        <button onClick={() => nav(`/console/projects/${id}${uiQuery}`)} title="返回项目"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 12, borderRadius: 9, border: '1px solid var(--cv-line)', background: 'var(--cv-chip-bg)', color: 'var(--cv-text)', cursor: 'pointer' }}>
          <ArrowLeft size={13} />返回项目
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--cv-text)' }}>
          {project?.name || '项目'} · 项目画布
        </span>
        <span style={{ fontSize: 11, color: 'var(--cv-text-3)' }}>
          从左侧「节点库」拖入交付物 · 双击节点进工作区 · 工具栏「全部添加」一键铺满
        </span>
      </div>

      <CanvasToolbar
        dirty={dirty}
        saving={saveMut.isPending}
        hasSelection={hasSelection}
        nodeCount={nodes.length}
        edgeCount={edges.length}
        onTogglePalette={() => setPaletteOpen(o => !o)}
        onAddAll={onAddAll}
        onAutoLayout={onAutoLayout}
        onRunAll={onRunAll}
        onDeleteSelected={onDeleteSelected}
        onFitView={onFitView}
        onSave={() => saveMut.mutate()}
        onRevert={onRevert}
      />

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {paletteOpen && (
          <NodePalette
            stageFlow={stageFlow}
            presentIds={new Set(nodes.map(n => n.id))}
            onAdd={onPaletteAdd}
            onLocate={onLocate}
            onClose={() => setPaletteOpen(false)}
          />
        )}

        {/* 内层:position:relative + 占满行高(flex 拉伸),ReactFlow 绝对定位铺满 —
            不用 height:100% 百分比(在 flex 链里会解析成 0 导致画布零高、节点被裁切看不见)。
            不带 kb-canvas 类(否则会重置主题变量);RF 样式覆写靠 root.kb-canvas 祖先选择器生效。 */}
        <div ref={wrapRef} style={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative' }} onDrop={onDrop} onDragOver={onDragOver}>
          <CanvasActionsContext.Provider value={actions}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={onConnect}
              onReconnect={onReconnect}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              deleteKeyCode={['Delete', 'Backspace']}
              minZoom={0.2}
              fitView
              style={{ position: 'absolute', inset: 0 }}
              defaultEdgeOptions={{ type: 'orth', markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' } }}
            >
              <Background gap={18} size={1} />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable nodeColor={(n) => (n.type === 'material' ? '#34D399' : '#38BDF8')} maskColor={isDark ? 'rgba(0,0,0,0.45)' : 'rgba(226,232,240,0.65)'} />
            </ReactFlow>
          </CanvasActionsContext.Provider>
        </div>
      </div>
    </div>
  )
}

export default function ProjectCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  )
}
