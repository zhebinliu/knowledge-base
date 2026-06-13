/**
 * MaterialNode — 资料节点(输入桶):项目资料 / 会议纪要 / 项目 Brief / 网络调研
 *  - 只有右侧 source 连接桩(资料喂给生成节点)
 *  - 角标显示计数(如文档数);双击打开对应抽屉;无「运行」
 *  - 颜色走 .kb-canvas 上的 --cv-* 变量,深/浅色自适应
 */
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Files, Contact, ClipboardList, Search } from 'lucide-react'
import { useCanvasActions } from './canvasContext'
import type { MatNodeData } from './canvasModel'

const ICON_MAP: Record<string, typeof Files> = {
  docs: Files, meetings: Contact, brief: ClipboardList, research: Search,
}

export default function MaterialNode({ data, selected }: NodeProps) {
  const d = data as MatNodeData
  const actions = useCanvasActions()
  const Icon = ICON_MAP[String(d.materialKind)] || Files
  const count = actions.countOf(String(d.materialKind))

  return (
    <div
      onDoubleClick={(e) => { e.stopPropagation(); actions.onOpenMaterial(String(d.materialKind)) }}
      title="双击查看/管理"
      style={{
        width: 150,
        borderRadius: 14,
        padding: '10px 12px',
        display: 'flex', alignItems: 'center', gap: 9,
        background: 'var(--cv-node-bg)',
        border: `1px solid ${selected ? 'var(--cv-mat)' : 'var(--cv-border)'}`,
        boxShadow: selected ? `0 0 0 1px var(--cv-mat), ${'var(--cv-shadow-sel)'}` : 'var(--cv-shadow)',
        color: 'var(--cv-text)',
        cursor: 'grab',
      }}
    >
      <Handle type="source" position={Position.Right} style={{ background: 'var(--cv-mat)', width: 8, height: 8, border: 'none' }} />
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: 9, flexShrink: 0,
        background: 'var(--cv-mat-soft)', color: 'var(--cv-mat)',
      }}>
        <Icon size={16} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {d.label}
        </div>
        <div style={{ fontSize: 10, color: 'var(--cv-text-3)', marginTop: 1 }}>
          {count != null ? `${count} 项` : '输入素材'}
        </div>
      </div>
    </div>
  )
}
