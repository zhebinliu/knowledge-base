import { Children, ReactNode, cloneElement, isValidElement, CSSProperties } from 'react'

type Props = {
  children: ReactNode
  className?: string
  step?: number   // ms between items
  delay?: number  // initial delay
  style?: CSSProperties
}

export default function StaggerList({ children, className = '', step = 50, delay = 0, style }: Props) {
  return (
    <div className={`rd-stagger ${className}`} style={style}>
      {Children.map(children, (child, i) => {
        if (!isValidElement(child)) return child
        const el = child as React.ReactElement<{ style?: CSSProperties }>
        return cloneElement(el, {
          style: { ...el.props.style, animationDelay: `${delay + i * step}ms` },
        })
      })}
    </div>
  )
}
