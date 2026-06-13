/**
 * NodePalette — 「节点库」侧栏
 *  - 按阶段列出全部生成 kind(从 stageFlow 派生)+ 4 个资料桶
 *  - 未添加项:拖拽到画布(HTML5 DnD)或点击添加;已在画布项:点击定位(选中并居中)
 *  - 颜色走 .kb-canvas 上的 --cv-* 变量
 */
import { useMemo } from 'react'
import {
  FileText, Lightbulb, ClipboardList, Bot, Sparkles, Search,
  Files, Contact, X, Plus, Check,
} from 'lucide-react'
import {
  flattenKinds, MATERIAL_BUCKETS, genNodeId, matNodeId,
  type MaterialKind,
} from './canvasModel'
import type { StageFlowDto, OutputKind } from '../../../api/client'

export const DND_MIME = 'application/kb-canvas-node'

export interface PalettePayload {
  nodeType: 'generation' | 'material'
  outputKind?: OutputKind
  materialKind?: MaterialKind
  label: string
}

const STAGE_ICONS: Record<string, typeof FileText> = {
  FileText, Lightbulb, ClipboardList, Bot, Sparkles, Search,
}
const MAT_ICONS: Record<string, typeof Files> = {
  docs: Files, meetings: Contact, brief: ClipboardList, research: Search,
}

interface Props {
  stageFlow: StageFlowDto | undefined
  presentIds: Set<string>
  onAdd: (p: PalettePayload) => void
  onLocate: (nodeId: string) => void
  onClose: () => void
}

export default function NodePalette({ stageFlow, presentIds, onAdd, onLocate, onClose }: Props) {
  const groups = useMemo(() => {
    const kinds = flattenKinds(stageFlow)
    const byStage: { stageKey: string; stageLabel: string; iconName: string; items: typeof kinds }[] = []
    for (const k of kinds) {
      let g = byStage.find(x => x.stageKey === k.stageKey)
      if (!g) { g = { stageKey: k.stageKey, stageLabel: k.stageLabel, iconName: k.iconName, items: [] }; byStage.push(g) }
      g.items.push(k)
    }
    return byStage
  }, [stageFlow])

  const drag = (e: React.DragEvent, p: PalettePayload) => {
    e.dataTransfer.setData(DND_MIME, JSON.stringify(p))
    e.dataTransfer.effectAllowed = 'move'
  }

  // present(已在画布):可读、可点击定位;未添加:可拖拽 / 点击添加
  const itemStyle = (present: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 9px', marginBottom: 5, borderRadius: 9,
    border: '1px solid var(--cv-line)',
    background: present ? 'var(--cv-accent-soft)' : 'var(--cv-chip-bg)',
    color: present ? 'var(--cv-text-2)' : 'var(--cv-text)',
    fontSize: 12.5, cursor: present ? 'pointer' : 'grab', userSelect: 'none',
  })

  return (
    <div style={{
      width: 224, flexShrink: 0, height: '100%', overflowY: 'auto',
      borderRight: '1px solid var(--cv-line)', background: 'var(--cv-panel-bg)',
      padding: '12px 12px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--cv-text)' }}>节点库</span>
        <button className="nodrag" onClick={onClose} title="收起节点库"
          style={{ color: 'var(--cv-text-3)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'inline-flex' }}>
          <X size={15} />
        </button>
      </div>

      {/* 资料桶 */}
      <div style={{ fontSize: 10.5, color: 'var(--cv-text-3)', margin: '6px 0 6px', letterSpacing: 1 }}>资料</div>
      {MATERIAL_BUCKETS.map(b => {
        const nid = matNodeId(b.materialKind)
        const present = presentIds.has(nid)
        const Icon = MAT_ICONS[b.materialKind] || Files
        const p: PalettePayload = { nodeType: 'material', materialKind: b.materialKind, label: b.label }
        return (
          <div key={b.materialKind} draggable={!present}
            onDragStart={(e) => !present && drag(e, p)}
            onClick={() => present ? onLocate(nid) : onAdd(p)}
            style={itemStyle(present)} title={present ? '已在画布 · 点击定位' : '拖拽或点击添加'}>
            <Icon size={14} style={{ color: 'var(--cv-mat)', flexShrink: 0 }} />
            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.label}</span>
            {present
              ? <Check size={12} style={{ color: 'var(--cv-text-3)' }} />
              : <Plus size={12} style={{ color: 'var(--cv-text-3)' }} />}
          </div>
        )
      })}

      {/* 生成节点(按阶段) */}
      {groups.map(g => {
        const StageIcon = STAGE_ICONS[g.iconName] || FileText
        return (
          <div key={g.stageKey}>
            <div style={{ fontSize: 10.5, color: 'var(--cv-text-3)', margin: '12px 0 6px', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
              <StageIcon size={11} />{g.stageLabel}
            </div>
            {g.items.map(k => {
              const nid = genNodeId(k.kind)
              const present = presentIds.has(nid)
              const p: PalettePayload = { nodeType: 'generation', outputKind: k.kind, label: k.label }
              return (
                <div key={k.kind} draggable={!present}
                  onDragStart={(e) => !present && drag(e, p)}
                  onClick={() => present ? onLocate(nid) : onAdd(p)}
                  style={itemStyle(present)} title={present ? '已在画布 · 点击定位' : '拖拽或点击添加'}>
                  <StageIcon size={14} style={{ color: 'var(--cv-accent)', flexShrink: 0 }} />
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {k.label}{k.beta && <span style={{ marginLeft: 4, fontSize: 9 }}>Beta</span>}
                  </span>
                  {present
                    ? <Check size={12} style={{ color: 'var(--cv-text-3)' }} />
                    : <Plus size={12} style={{ color: 'var(--cv-text-3)' }} />}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
