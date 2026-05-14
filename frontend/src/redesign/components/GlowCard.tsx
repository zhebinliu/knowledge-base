import { useRef, useCallback, MouseEvent, ReactNode, CSSProperties } from 'react'

type Props = {
  children: ReactNode
  className?: string
  style?: CSSProperties
  interactive?: boolean
  glow?: boolean
  shimmer?: boolean
  onClick?: () => void
}

export default function GlowCard({
  children, className = '', style, interactive, glow, shimmer, onClick,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)

  const handleMouse = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (!interactive || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    ref.current.style.setProperty('--mx', `${x}%`)
    ref.current.style.setProperty('--my', `${y}%`)
  }, [interactive])

  const classes = [
    'rd-card',
    interactive ? 'is-interactive' : '',
    glow ? 'is-glow' : '',
    shimmer ? 'is-shimmer' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <div
      ref={ref}
      className={classes}
      style={style}
      onMouseMove={handleMouse}
      onClick={onClick}
    >
      {children}
    </div>
  )
}
