import { useEffect, useState } from 'react'

type Props = {
  text: string
  speed?: number          // ms per char
  startDelay?: number     // ms before start
  onDone?: () => void
  className?: string
  cursor?: boolean
}

export default function StreamingText({ text, speed = 24, startDelay = 0, onDone, className, cursor = true }: Props) {
  const [shown, setShown] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    setShown('')
    setDone(false)
    let i = 0
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      if (i >= text.length) {
        setDone(true)
        onDone?.()
        return
      }
      i += 1
      setShown(text.slice(0, i))
      timer = setTimeout(tick, speed)
    }
    const initial = setTimeout(tick, startDelay)
    return () => { clearTimeout(initial); clearTimeout(timer!) }
  }, [text, speed, startDelay, onDone])

  return (
    <span className={className}>
      {shown}
      {cursor && !done && <span className="rd-typing-cursor" />}
    </span>
  )
}
