/**
 * NewFloatingChat — 浮动项目问答(Liquid Glass)
 * 功能 100% 等价 — 三态(closed/open/minimized/fullscreen)+ 拖拽 + 内嵌 NewQA(compact)
 * 替代老 FloatingChat + FloatingQA 两个组件
 */
import { useState, useEffect, useRef } from 'react'
import { MessageSquare, Minus, Maximize2, Minimize2, X, GripVertical } from 'lucide-react'
import NewQA from '../QA'

export interface FloatingChatState {
  open: boolean
  minimized: boolean
  fullscreen: boolean
}

interface Props {
  projectId: string
  state: FloatingChatState
  onChange: (s: FloatingChatState) => void
}

export default function NewFloatingChat({ projectId, state, onChange }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      setPos({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy })
    }
    const onUp = () => { dragRef.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  if (!state.open) return null

  if (state.minimized) {
    return (
      <button
        onClick={() => onChange({ ...state, minimized: false })}
        style={{
          position: 'fixed', bottom: 110, right: 24, zIndex: 50,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', borderRadius: 999,
          background: 'linear-gradient(135deg, var(--rd-accent), var(--rd-accent-2))',
          color: '#fff', border: 'none', cursor: 'pointer',
          fontSize: 12, fontWeight: 600,
          boxShadow: '0 8px 24px -4px rgba(255,141,26,.55), inset 0 1px 0 rgba(255,255,255,.4)',
          fontFamily: 'inherit',
        }}
        title="展开项目问答"
      >
        <MessageSquare size={12} /> 项目问答
      </button>
    )
  }

  const onTitleDown = (e: React.MouseEvent) => {
    if (state.fullscreen) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos?.x ?? 0, origY: pos?.y ?? 0 }
    e.preventDefault()
  }

  const containerStyle: React.CSSProperties = state.fullscreen
    ? { position: 'fixed', inset: 0, zIndex: 50 }
    : {
        position: 'fixed',
        right: 20 - (pos?.x ?? 0),
        bottom: 20 - (pos?.y ?? 0),
        width: 'min(95vw, 480px)',
        height: 'min(85vh, 680px)',
        zIndex: 50,
      }

  return (
    <div
      style={{
        ...containerStyle,
        background: 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(32px) saturate(180%)',
        WebkitBackdropFilter: 'blur(32px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.65)',
        borderRadius: state.fullscreen ? 0 : 16,
        boxShadow: '0 25px 50px -12px rgba(15, 18, 36, .25), inset 0 1px 0 rgba(255, 255, 255, .85)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      <div
        onMouseDown={onTitleDown}
        style={{
          flexShrink: 0,
          padding: '10px 14px',
          borderBottom: '1px solid var(--rd-line)',
          display: 'flex', alignItems: 'center', gap: 8,
          userSelect: 'none',
          cursor: state.fullscreen ? 'default' : 'move',
          background: 'linear-gradient(135deg, rgba(255, 141, 26, .08), rgba(255, 255, 255, 0))',
        }}
      >
        {!state.fullscreen && <GripVertical size={12} color="var(--rd-text-3)" />}
        <MessageSquare size={13} color="var(--rd-accent-2)" />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--rd-text)' }}>项目问答</span>
        <span style={{ fontSize: 12, color: 'var(--rd-text-3)' }}>· 不影响后台对话进程</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            onClick={() => onChange({ ...state, minimized: true })}
            className="rd-icon-btn"
            style={{ width: 26, height: 26 }}
            title="最小化"
          >
            <Minus size={12} />
          </button>
          <button
            onClick={() => onChange({ ...state, fullscreen: !state.fullscreen })}
            className="rd-icon-btn"
            style={{ width: 26, height: 26 }}
            title={state.fullscreen ? '退出全屏' : '全屏'}
          >
            {state.fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          <button
            onClick={() => onChange({ ...state, open: false })}
            className="rd-icon-btn"
            style={{ width: 26, height: 26 }}
            title="关闭"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <NewQA lockedProjectId={projectId} compact />
      </div>
    </div>
  )
}
