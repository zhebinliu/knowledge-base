import { useState, useRef, useEffect, ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

type Option = { value: string; label: string; hint?: string }

type Props = {
  value: string
  options: Option[]
  onChange: (v: string) => void
  prefix?: ReactNode
  className?: string
}

export default function PillSelect({ value, options, onChange, prefix, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = options.find(o => o.value === value) ?? options[0]

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="rd-chip is-active"
        style={{ paddingRight: 8 }}
      >
        {prefix}
        <span style={{ color: 'var(--rd-text)' }}>{current?.label}</span>
        <ChevronDown size={12} style={{ transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 30,
            minWidth: 240,
            background: 'var(--rd-surface-elev)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid var(--rd-line-strong)',
            borderRadius: 14,
            padding: 6,
            boxShadow: '0 24px 60px -16px rgba(0,0,0,.6)',
            animation: 'rd-fade-up .25s var(--rd-ease) both',
          }}
        >
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false) }}
              className="rd-nav-link"
              style={{
                width: '100%',
                background: o.value === value ? 'rgba(255,141,26,.10)' : 'transparent',
                color: o.value === value ? 'var(--rd-text)' : 'var(--rd-text-2)',
              }}
            >
              <span style={{ flex: 1 }}>{o.label}</span>
              {o.hint && <span style={{ fontSize: 11, color: 'var(--rd-text-3)' }}>{o.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
