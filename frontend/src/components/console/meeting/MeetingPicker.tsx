/**
 * 会议选择器 — 从一个会议列表里挑一场(目前只有「跨会议对比」在用)。
 *
 * 为什么不用 redesign/components/PillSelect:
 *   1. 它只用 `rd-*` 类名,是 redesign 壳专属的;本组件被新旧两套 UI 共用
 *      (pages/console/ConsoleMeetingDetail.tsx 与 redesign 壳),必须只用 tailwind 令牌。
 *   2. 它没有搜索。一个项目跑到中后期会有几十场会议,纯鼠标翻列表找不着。
 * 所以另起一个,不做成通用组件 —— 只有一处调用方,按需长。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Check, ChevronDown, Search } from 'lucide-react'
import type { CompareMeetingRef } from '../../../api/client'

/** 后端给的是 ISO 串,列表里只需要日期 */
const dayOf = (iso: string) => iso.slice(0, 10)

export default function MeetingPicker({
  meetings, value, onChange, disabled,
}: {
  meetings: CompareMeetingRef[]
  value: number | null
  onChange: (id: number) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const current = meetings.find((m) => m.id === value) ?? null

  // 点面板外 / 按 Esc 关闭。没有这两个,下拉会一直挂在那儿挡住下面的内容。
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  // 展开时聚焦搜索框并清空上次的搜索词 —— 保留旧搜索词会让用户以为列表少了几场
  useEffect(() => {
    if (!open) return
    setQ('')
    inputRef.current?.focus()
  }, [open])

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase()
    if (!kw) return meetings
    // 标题和日期都能搜:日期能搜才好用(「上周那场」通常只记得日子)
    return meetings.filter((m) => m.title.toLowerCase().includes(kw) || dayOf(m.start_time).includes(kw))
  }, [meetings, q])

  return (
    <div ref={boxRef} className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex max-w-[22rem] items-center gap-1.5 rounded-md border border-line bg-canvas px-2 py-0.5 text-xs text-ink-secondary hover:bg-white disabled:opacity-50"
      >
        <CalendarDays size={12} className="shrink-0" />
        <span className="truncate">
          {current ? (
            <>
              <span className="text-ink">{current.title}</span>
              {current.start_time && <span className="text-ink-muted">({dayOf(current.start_time)})</span>}
            </>
          ) : (
            '选择对比会议'
          )}
        </span>
        <ChevronDown size={12} className="shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-80 rounded-lg border border-line bg-white p-1.5 shadow-lg">
          <div className="mb-1 flex items-center gap-1.5 rounded-md border border-line bg-canvas px-2 py-1">
            <Search size={12} className="shrink-0 text-ink-muted" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索会议标题或日期"
              className="w-full bg-transparent text-xs text-ink outline-none placeholder:text-ink-muted"
            />
          </div>

          <div role="listbox" className="max-h-64 overflow-y-auto">
            {shown.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-ink-muted">没有匹配的会议</p>
            ) : (
              shown.map((m) => {
                const active = m.id === value
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(m.id)
                      setOpen(false)
                    }}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-canvas ${
                      active ? 'bg-canvas' : ''
                    }`}
                  >
                    <span className="w-3 shrink-0 text-brand">{active && <Check size={12} />}</span>
                    <span className="min-w-0 flex-1 truncate text-ink">{m.title}</span>
                    {m.start_time && (
                      <span className="shrink-0 tabular-nums text-ink-muted">{dayOf(m.start_time)}</span>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
