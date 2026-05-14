import { useEffect, useRef, useState } from 'react'

type Props = {
  to: number
  duration?: number
  format?: (n: number) => string
  className?: string
}

export default function CountUp({ to, duration = 900, format, className }: Props) {
  const [value, setValue] = useState(0)
  const startRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    startRef.current = null
    const tick = (t: number) => {
      if (startRef.current === null) startRef.current = t
      const elapsed = t - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(to * eased))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [to, duration])

  const display = format ? format(value) : value.toLocaleString()
  return <span className={className}>{display}</span>
}
