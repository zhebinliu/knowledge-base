import { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'default' | 'ghost'

type Props = {
  variant?: Variant
  children: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>

export default function GlowButton({ variant = 'default', children, className = '', ...rest }: Props) {
  const cls = [
    'rd-btn',
    variant === 'primary' ? 'rd-btn-primary' : '',
    variant === 'ghost' ? 'rd-btn-ghost' : '',
    className,
  ].filter(Boolean).join(' ')
  return (
    <button {...rest} className={cls}>{children}</button>
  )
}
