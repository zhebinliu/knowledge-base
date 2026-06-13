/**
 * 自定义输入节点:手写备注 / 网页 / 文件
 *  - 都只有右侧 source 桩(作为素材喂给下游生成节点)
 *  - 内容存进 node.data,经 context.updateNodeData 实时回写 + 标记未保存
 *  - 颜色走 .kb-canvas 上的 --cv-* 变量
 *  注:本阶段为"可加/可编辑/可连/可存";连线真正喂进生成由后端下一步接入。
 */
import { useRef } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { StickyNote, Globe, Paperclip, Upload, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { useCanvasActions } from './canvasContext'

const CARD = (selected: boolean, accent: string): React.CSSProperties => ({
  width: 190,
  borderRadius: 14,
  padding: '10px 12px',
  background: 'var(--cv-node-bg)',
  border: `1px solid ${selected ? accent : 'var(--cv-border)'}`,
  boxShadow: selected ? `0 0 0 1px ${accent}, var(--cv-shadow-sel)` : 'var(--cv-shadow)',
  color: 'var(--cv-text)',
  cursor: 'grab',
})
const HEAD: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7, fontSize: 12.5, fontWeight: 600 }
const ACCENT = '#f59e0b'   // 输入节点统一用琥珀色,和交付物(蓝)/资料(绿)区分

function srcHandle() {
  return <Handle type="source" position={Position.Right} style={{ background: ACCENT, width: 8, height: 8, border: 'none' }} />
}

export function NoteNode({ id, data, selected }: NodeProps) {
  const actions = useCanvasActions()
  const text = (data as any)?.text ?? ''
  return (
    <div style={CARD(!!selected, ACCENT)}>
      {srcHandle()}
      <div style={{ ...HEAD, color: ACCENT }}><StickyNote size={14} />手写备注</div>
      <textarea
        className="nodrag nowheel"
        value={text}
        onChange={(e) => actions.updateNodeData(id, { text: e.target.value })}
        onMouseDown={(e) => e.stopPropagation()}
        placeholder="写点备注 / 要点…"
        rows={3}
        style={{
          width: '100%', resize: 'none', fontSize: 12, lineHeight: 1.4,
          border: '1px solid var(--cv-line)', borderRadius: 8, padding: '6px 8px',
          background: 'var(--cv-chip-bg)', color: 'var(--cv-text)', outline: 'none',
        }}
      />
    </div>
  )
}

export function WebpageNode({ id, data, selected }: NodeProps) {
  const actions = useCanvasActions()
  const url = (data as any)?.url ?? ''
  return (
    <div style={CARD(!!selected, ACCENT)}>
      {srcHandle()}
      <div style={{ ...HEAD, color: ACCENT }}><Globe size={14} />网页</div>
      <input
        className="nodrag"
        value={url}
        onChange={(e) => actions.updateNodeData(id, { url: e.target.value })}
        onMouseDown={(e) => e.stopPropagation()}
        placeholder="https://…"
        style={{
          width: '100%', fontSize: 12,
          border: '1px solid var(--cv-line)', borderRadius: 8, padding: '6px 8px',
          background: 'var(--cv-chip-bg)', color: 'var(--cv-text)', outline: 'none',
        }}
      />
    </div>
  )
}

export function FileNode({ id, data, selected }: NodeProps) {
  const actions = useCanvasActions()
  const d = (data as any) || {}
  const fileRef = useRef<HTMLInputElement>(null)
  const status = d.status as string | undefined
  return (
    <div style={CARD(!!selected, ACCENT)}>
      {srcHandle()}
      <div style={{ ...HEAD, color: ACCENT }}><Paperclip size={14} />文件</div>
      <input ref={fileRef} type="file" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) actions.uploadFile(id, f) }} />
      {d.filename ? (
        <div style={{ fontSize: 11.5, color: 'var(--cv-text-2)', display: 'flex', alignItems: 'center', gap: 5 }}>
          {status === 'uploading' || status === 'pending' || status === 'converting'
            ? <Loader2 size={12} className="animate-spin" style={{ color: ACCENT }} />
            : status === 'failed'
              ? <AlertCircle size={12} style={{ color: '#ef4444' }} />
              : <CheckCircle2 size={12} style={{ color: '#10b981' }} />}
          <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={d.filename}>{d.filename}</span>
        </div>
      ) : (
        <button
          className="nodrag"
          onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }}
          style={{
            width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            fontSize: 12, padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
            border: '1px dashed var(--cv-line)', background: 'var(--cv-chip-bg)', color: 'var(--cv-text-2)',
          }}>
          <Upload size={13} />上传文件
        </button>
      )}
    </div>
  )
}
