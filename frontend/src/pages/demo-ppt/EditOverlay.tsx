/**
 * EditOverlay — PPT 编辑覆盖层
 *
 * 工作机制:
 *   - 编辑模式下监听 frame 内所有 [data-edit-id] 元素的鼠标事件
 *   - 选中后浮出 toolbar(字号/颜色/重置/隐藏)+ 选中边框
 *   - 拖动: mousedown → mousemove → 实时更新 patch.x/y(transform)
 *   - 双击文本: contentEditable=true → blur 时保存 content
 *
 * 渲染策略:
 *   - useLayoutEffect 在每次 patches 变化或 slide 切换时,
 *     遍历所有 [data-edit-id] 节点应用 patch (DOM 直改)
 *   - 这种方式不依赖每个组件配合, 只要标了 data-edit-id 就能被改
 */
import { useEffect, useLayoutEffect, useRef, useState, useCallback, type RefObject } from 'react'
import { usePatches, type ElementPatch } from './usePatches'

// ── 应用 patch 到 DOM 节点 ──
function applyPatchToElement(el: HTMLElement, patch: ElementPatch | undefined) {
  // 先重置(把 patch 之前可能改过的 inline style 清掉)
  el.style.removeProperty('font-size')
  el.style.removeProperty('color')
  el.style.removeProperty('font-weight')
  el.style.removeProperty('font-style')
  el.style.removeProperty('transform')
  el.style.removeProperty('display')

  if (!patch) {
    // 无 patch — 把 content 还原回原始(从 data-edit-original 读)
    if (el.dataset.editOriginal !== undefined && el.textContent !== el.dataset.editOriginal) {
      el.textContent = el.dataset.editOriginal
    }
    return
  }

  // 文字内容(用 textContent 不破坏外层结构)
  if (patch.content !== undefined) {
    if (el.dataset.editOriginal === undefined) {
      el.dataset.editOriginal = el.textContent ?? ''
    }
    if (el.textContent !== patch.content) el.textContent = patch.content
  } else {
    // 没改过 content,确保还原
    if (el.dataset.editOriginal !== undefined && el.textContent !== el.dataset.editOriginal) {
      el.textContent = el.dataset.editOriginal
    }
  }
  if (patch.fontSize) el.style.fontSize = `${patch.fontSize}px`
  if (patch.color) el.style.color = patch.color
  if (patch.bold) el.style.fontWeight = '900'
  if (patch.italic) el.style.fontStyle = 'italic'
  if (patch.x !== undefined || patch.y !== undefined) {
    el.style.transform = `translate(${patch.x ?? 0}px, ${patch.y ?? 0}px)`
  }
  if (patch.hidden) el.style.display = 'none'
}

// ── 主组件 ──
export function EditOverlay({
  frameRef,
  slideIdx,
  enabled,
}: {
  frameRef: RefObject<HTMLDivElement | null>
  slideIdx: number
  enabled: boolean
}) {
  const { patches, patchElement, resetElement } = usePatches()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [overlayVer, setOverlayVer] = useState(0)  // 强制重渲染选中框位置

  // 拖动状态
  const dragRef = useRef<{
    id: string
    startMouseX: number
    startMouseY: number
    startX: number
    startY: number
  } | null>(null)

  // ── 应用 patch 到当前 slide(每次 patches 变 / slide 切都跑)──
  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    // 只处理当前 active slide
    const active = frame.querySelector('.ppt-slide.is-active')
    if (!active) return
    const els = active.querySelectorAll<HTMLElement>('[data-edit-id]')
    els.forEach((el) => {
      const id = el.dataset.editId!
      applyPatchToElement(el, patches[id])
    })
    setOverlayVer((v) => v + 1)
  }, [patches, slideIdx, frameRef])

  // ── 选中切换:slide 变了或退出编辑模式,清除选中 ──
  useEffect(() => {
    setSelectedId(null)
  }, [slideIdx, enabled])

  // ── 鼠标事件 ──
  useEffect(() => {
    if (!enabled) return
    const frame = frameRef.current
    if (!frame) return

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // 工具栏点击不影响
      if (target.closest('.ppt-edit-toolbar') || target.closest('.ppt-edit-handles')) return
      const editable = target.closest<HTMLElement>('[data-edit-id]')
      if (editable) {
        e.preventDefault()
        e.stopPropagation()
        setSelectedId(editable.dataset.editId!)
      } else {
        setSelectedId(null)
      }
    }

    const onDoubleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const editable = target.closest<HTMLElement>('[data-edit-id][data-edit-type="text"]')
      if (!editable) return
      e.preventDefault()
      e.stopPropagation()
      setSelectedId(editable.dataset.editId!)
      enterTextEdit(editable)
    }

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      // contentEditable 中不拖
      if (target.isContentEditable) return
      const editable = target.closest<HTMLElement>('[data-edit-id]')
      if (!editable) return
      // 文本元素也允许拖(选中后)
      const id = editable.dataset.editId!
      if (selectedId !== id) return  // 只能拖已选中的
      const cur = patches[id] ?? {}
      dragRef.current = {
        id,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startX: cur.x ?? 0,
        startY: cur.y ?? 0,
      }
      e.preventDefault()
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const dx = e.clientX - dragRef.current.startMouseX
      const dy = e.clientY - dragRef.current.startMouseY
      patchElement(dragRef.current.id, {
        x: Math.round(dragRef.current.startX + dx),
        y: Math.round(dragRef.current.startY + dy),
      })
    }

    const onMouseUp = () => {
      dragRef.current = null
    }

    frame.addEventListener('click', onClick, true)
    frame.addEventListener('dblclick', onDoubleClick, true)
    frame.addEventListener('mousedown', onMouseDown, true)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      frame.removeEventListener('click', onClick, true)
      frame.removeEventListener('dblclick', onDoubleClick, true)
      frame.removeEventListener('mousedown', onMouseDown, true)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [enabled, frameRef, selectedId, patches, patchElement])

  // ── 进入文本编辑 ──
  const enterTextEdit = useCallback((el: HTMLElement) => {
    const id = el.dataset.editId!
    el.contentEditable = 'plaintext-only'
    el.style.outline = '2px solid #FF8D1A'
    el.style.outlineOffset = '4px'
    el.focus()
    // 选中所有文字
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)

    const finish = () => {
      el.contentEditable = 'false'
      el.style.removeProperty('outline')
      el.style.removeProperty('outline-offset')
      const newText = el.textContent ?? ''
      const original = el.dataset.editOriginal ?? newText
      if (newText !== original) {
        patchElement(id, { content: newText })
      } else {
        // 改回原始 → 清掉 content patch
        patchElement(id, { content: undefined })
      }
      el.removeEventListener('blur', finish)
      el.removeEventListener('keydown', onKey)
    }

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault()
        el.blur()
      }
    }

    el.addEventListener('blur', finish)
    el.addEventListener('keydown', onKey)
  }, [patchElement])

  // ── 选中元素的 DOM ref ──
  const selectedEl: HTMLElement | null = (() => {
    if (!enabled || !selectedId) return null
    const frame = frameRef.current
    if (!frame) return null
    return frame.querySelector<HTMLElement>(`[data-edit-id="${selectedId}"]`)
  })()

  // 选中元素的位置(用于浮动 toolbar 定位)
  const rect = selectedEl?.getBoundingClientRect() ?? null
  const frameRect = frameRef.current?.getBoundingClientRect() ?? null
  const selectedType = selectedEl?.dataset.editType ?? 'box'
  const selectedPatch = selectedId ? patches[selectedId] : undefined

  // ── 渲染选中边框 + toolbar ──
  if (!enabled) return null

  return (
    <>
      {/* 选中边框(绝对定位在 frame 内)*/}
      {rect && frameRect && (
        <div
          className="ppt-edit-handles"
          style={{
            position: 'absolute',
            left: rect.left - frameRect.left - 4,
            top: rect.top - frameRect.top - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            border: '2px dashed #FF8D1A',
            borderRadius: 6,
            pointerEvents: 'none',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.5), 0 0 16px rgba(255,141,26,0.4)',
            zIndex: 100,
            // 微动画:轻微闪烁
            animation: 'ppt-edit-blink 2s ease-in-out infinite',
          }}
          // 忽略 unused
          data-version={overlayVer}
        >
          {/* 4 角小圆点(视觉提示, 不实际拖)*/}
          {[
            { top: -4, left: -4 },
            { top: -4, right: -4 },
            { bottom: -4, left: -4 },
            { bottom: -4, right: -4 },
          ].map((pos, i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#FF8D1A',
                boxShadow: '0 0 8px rgba(255,141,26,0.8)',
                ...pos,
              }}
            />
          ))}
        </div>
      )}

      {/* 浮动 toolbar */}
      {selectedEl && rect && frameRect && (
        <FloatingToolbar
          frameRect={frameRect}
          rect={rect}
          patch={selectedPatch}
          isText={selectedType === 'text'}
          onChange={(p) => patchElement(selectedId!, p)}
          onReset={() => resetElement(selectedId!)}
          onEdit={() => enterTextEdit(selectedEl)}
        />
      )}
    </>
  )
}

// ── 浮动 toolbar ──
function FloatingToolbar({
  frameRect, rect, patch, isText, onChange, onReset, onEdit,
}: {
  frameRect: DOMRect
  rect: DOMRect
  patch: ElementPatch | undefined
  isText: boolean
  onChange: (p: Partial<ElementPatch>) => void
  onReset: () => void
  onEdit: () => void
}) {
  // 浮在选中元素上方
  const top = rect.top - frameRect.top - 56
  const left = rect.left - frameRect.left
  // 边界:不超出 frame
  const safeTop = top < 8 ? rect.bottom - frameRect.top + 12 : top
  const safeLeft = Math.max(8, Math.min(left, frameRect.width - 320))

  const fontSize = patch?.fontSize ?? null
  const color = patch?.color ?? '#ffffff'

  return (
    <div
      className="ppt-edit-toolbar"
      style={{
        position: 'absolute',
        top: safeTop,
        left: safeLeft,
        background: 'rgba(20,25,40,0.96)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,141,26,0.40)',
        borderRadius: 10,
        padding: '6px 8px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        zIndex: 110,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 16px rgba(255,141,26,0.3)',
        fontSize: 12,
        color: 'rgba(255,255,255,0.85)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {isText && (
        <>
          <button
            onClick={onEdit}
            style={btnStyle}
            title="双击元素也可编辑"
          >
            ✎ 编辑文字
          </button>
          <Sep />

          {/* 字号 */}
          <span style={{ opacity: 0.6, marginLeft: 2 }}>字号</span>
          <input
            type="number"
            min={8}
            max={300}
            step={1}
            value={fontSize ?? ''}
            placeholder="auto"
            onChange={(e) => {
              const v = e.target.value
              onChange({ fontSize: v ? Number(v) : undefined })
            }}
            style={{
              width: 56,
              padding: '4px 6px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 6,
              color: '#fff',
              fontSize: 12,
            }}
          />

          {/* 颜色 */}
          <Sep />
          <span style={{ opacity: 0.6 }}>色</span>
          <label
            style={{
              cursor: 'pointer',
              width: 24, height: 24,
              borderRadius: 6,
              background: color,
              border: '1px solid rgba(255,255,255,0.30)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <input
              type="color"
              value={color}
              onChange={(e) => onChange({ color: e.target.value })}
              style={{ width: 0, height: 0, opacity: 0, position: 'absolute' }}
            />
          </label>

          {/* 加粗 */}
          <Sep />
          <button
            onClick={() => onChange({ bold: !patch?.bold })}
            style={{
              ...btnStyle,
              fontWeight: 900,
              background: patch?.bold ? 'rgba(255,141,26,0.30)' : btnStyle.background,
            }}
          >
            B
          </button>
        </>
      )}

      {!isText && (
        <span style={{ padding: '0 6px' }}>容器 · 拖动调整位置</span>
      )}

      <Sep />
      <button onClick={onReset} style={{ ...btnStyle, color: '#FB7185' }} title="还原此元素">
        ↺ 重置
      </button>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.10)',
  color: 'inherit',
  borderRadius: 6,
  padding: '4px 10px',
  cursor: 'pointer',
  fontSize: 12,
}

function Sep() {
  return <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)' }} />
}
