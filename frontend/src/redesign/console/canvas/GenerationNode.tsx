/**
 * GenerationNode — 生成节点(13 种交付物之一)
 *  - 玻璃卡片,左 target / 右 source 连接桩
 *  - 状态药丸(已生成/生成中/失败/未开始)从 context 读 latest-by-kind
 *  - 内联「运行」→ generateOutput;双击 → 跳现有阶段工作区
 */
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  FileText, Lightbulb, ClipboardList, Bot, Sparkles, Search,
  CheckCircle2, Loader2, AlertCircle, Play,
} from 'lucide-react'
import { useCanvasActions, type NodeStatus } from './canvasContext'
import type { GenNodeData } from './canvasModel'
import type { OutputKind } from '../../../api/client'

const ICON_MAP: Record<string, typeof FileText> = {
  FileText, Lightbulb, ClipboardList, Bot, Sparkles, Search,
}

const STATUS_META: Record<NodeStatus, { label: string; color: string }> = {
  done:     { label: '已生成', color: '#34D399' },
  inflight: { label: '生成中', color: '#38BDF8' },
  failed:   { label: '失败',   color: '#F87171' },
  idle:     { label: '未开始', color: 'var(--rd-text-3, #94a3b8)' },
}

export default function GenerationNode({ data, selected }: NodeProps) {
  const d = data as GenNodeData
  const actions = useCanvasActions()
  const kind = d.kind as OutputKind
  const status = actions.statusOf(kind)
  const Icon = ICON_MAP[d.iconName] || FileText
  const meta = STATUS_META[status]
  const isInflight = status === 'inflight'

  return (
    <div
      onDoubleClick={(e) => { e.stopPropagation(); actions.onOpenGeneration(kind) }}
      title="双击进入工作区"
      style={{
        width: 188,
        borderRadius: 14,
        padding: '11px 13px',
        background: 'rgba(34,42,66,0.96)',
        border: `1px solid ${selected ? 'var(--rd-accent, #38BDF8)' : 'rgba(255,255,255,0.18)'}`,
        boxShadow: selected
          ? '0 0 0 1px var(--rd-accent, #38BDF8), 0 8px 28px rgba(0,0,0,0.4)'
          : '0 6px 20px rgba(0,0,0,0.32)',
        backdropFilter: 'blur(10px)',
        color: 'var(--rd-text, #e8ecf5)',
        cursor: 'grab',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: 'var(--rd-accent, #38BDF8)', width: 8, height: 8, border: 'none' }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--rd-accent, #38BDF8)', width: 8, height: 8, border: 'none' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 26, height: 26, borderRadius: 8, flexShrink: 0,
          background: 'rgba(56,189,248,0.14)', color: 'var(--rd-accent, #38BDF8)',
        }}>
          <Icon size={15} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {d.label}
            {d.beta && <span style={{ marginLeft: 5, fontSize: 9, color: 'var(--rd-text-3, #94a3b8)' }}>Beta</span>}
          </div>
          {d.stageLabel && (
            <div style={{ fontSize: 10, color: 'var(--rd-text-3, #94a3b8)', marginTop: 1 }}>{d.stageLabel}</div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: meta.color }}>
          {status === 'done' && <CheckCircle2 size={11} />}
          {status === 'inflight' && <Loader2 size={11} className="animate-spin" />}
          {status === 'failed' && <AlertCircle size={11} />}
          {status === 'idle' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--rd-text-3, #94a3b8)', display: 'inline-block' }} />}
          {meta.label}
        </span>

        <button
          className="nodrag"
          onClick={(e) => { e.stopPropagation(); if (!isInflight) actions.onRun(kind) }}
          disabled={isInflight}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 9px', fontSize: 11, borderRadius: 8,
            border: '1px solid var(--rd-line, rgba(255,255,255,0.12))',
            background: isInflight ? 'rgba(255,255,255,0.04)' : 'rgba(56,189,248,0.16)',
            color: isInflight ? 'var(--rd-text-3, #94a3b8)' : 'var(--rd-accent, #38BDF8)',
            cursor: isInflight ? 'default' : 'pointer',
          }}
        >
          {isInflight ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
          {isInflight ? '生成中' : (status === 'done' ? '重跑' : '运行')}
        </button>
      </div>
    </div>
  )
}
