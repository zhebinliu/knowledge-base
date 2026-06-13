/**
 * CanvasToolbar — 画布顶部工具栏
 *  节点库 / 整理布局 / 一键全跑 / 删除选中 / 适应画布 / 还原 / 保存(+未保存指示)
 */
import {
  PanelLeft, LayoutGrid, Play, Trash2, Maximize2, Save, RotateCcw, Loader2, ListPlus,
} from 'lucide-react'

interface Props {
  dirty: boolean
  saving: boolean
  hasSelection: boolean
  nodeCount: number
  edgeCount: number
  onTogglePalette: () => void
  onAddAll: () => void
  onAutoLayout: () => void
  onRunAll: () => void
  onDeleteSelected: () => void
  onFitView: () => void
  onSave: () => void
  onRevert: () => void
}

const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '5px 10px', fontSize: 12, borderRadius: 9,
  border: '1px solid var(--rd-line, rgba(255,255,255,0.12))',
  background: 'rgba(255,255,255,0.05)', color: 'var(--rd-text, #e8ecf5)',
  cursor: 'pointer',
}
const disabledBtn: React.CSSProperties = { opacity: 0.4, cursor: 'default' }

export default function CanvasToolbar(p: Props) {
  return (
    <div style={{
      flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
      padding: '9px 14px',
      borderBottom: '1px solid var(--rd-line, rgba(255,255,255,0.08))',
      background: 'rgba(255,255,255,0.04)',
    }}>
      <button style={btn} onClick={p.onTogglePalette} title="节点库"><PanelLeft size={13} />节点库</button>
      <button style={btn} onClick={p.onAddAll} title="把所有交付物节点一次性铺到画布(完整流程总览)"><ListPlus size={13} />全部添加</button>
      <button style={btn} onClick={p.onAutoLayout} title="自动排布"><LayoutGrid size={13} />整理布局</button>
      <button style={btn} onClick={p.onRunAll} title="按依赖顺序运行所有未开始节点"><Play size={13} />一键全跑</button>
      <button
        style={{ ...btn, ...(p.hasSelection ? {} : disabledBtn), color: p.hasSelection ? '#F87171' : undefined, borderColor: p.hasSelection ? 'rgba(248,113,113,0.4)' : undefined }}
        onClick={() => p.hasSelection && p.onDeleteSelected()} disabled={!p.hasSelection} title="删除选中(Delete)">
        <Trash2 size={13} />删除选中
      </button>
      <button style={btn} onClick={p.onFitView} title="适应画布"><Maximize2 size={13} />适应画布</button>

      <span style={{ fontSize: 11, color: 'var(--rd-text-3, #94a3b8)', marginLeft: 6 }}>
        {p.nodeCount} 节点 · {p.edgeCount} 连线
      </span>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        {p.dirty && <span style={{ fontSize: 11, color: '#FBBF24' }}>未保存</span>}
        <button
          style={{ ...btn, ...(p.dirty ? {} : disabledBtn) }}
          onClick={() => p.dirty && p.onRevert()} disabled={!p.dirty} title="还原到上次保存">
          <RotateCcw size={13} />还原
        </button>
        <button
          style={{
            ...btn,
            ...((!p.dirty || p.saving) ? disabledBtn : {}),
            background: 'rgba(56,189,248,0.18)', color: 'var(--rd-accent, #38BDF8)',
            borderColor: 'rgba(56,189,248,0.4)',
          }}
          onClick={() => p.dirty && !p.saving && p.onSave()} disabled={!p.dirty || p.saving} title="保存画布">
          {p.saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}保存
        </button>
      </div>
    </div>
  )
}
