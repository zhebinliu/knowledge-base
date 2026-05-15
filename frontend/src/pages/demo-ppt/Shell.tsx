/**
 * SlideShell — 单页骨架 + 共用视觉 helper
 *
 * 提供:
 * - SlideShell: 16:9 容器, 处理进入动画(stagger)
 * - SlideHeader: 章节标签 + 序号 + 标题区
 * - GradText: 橙色渐变文字
 * - GlowOrb: 背景发光球(装饰)
 * - Stagger: 子元素 stagger 进入动画
 */
import { type ReactNode, type CSSProperties } from 'react'
import { PPT, fz } from './theme'

// ── SlideShell ──────────────────────────────────────────────────────────────

export function SlideShell({
  children,
  variant = 'default',
  pad = true,
  noBg = false,
}: {
  children: ReactNode
  variant?: 'default' | 'hero' | 'cover'
  pad?: boolean
  noBg?: boolean
}) {
  return (
    <div
      className={`slide-shell relative w-full h-full overflow-hidden ${pad ? 'px-[4cqi] py-[3cqi]' : ''}`}
      style={{
        containerType: 'inline-size',
        containerName: 'slide',
        background: noBg ? undefined : PPT.bg,
        color: PPT.fg,
      }}
    >
      {!noBg && variant !== 'hero' && variant !== 'cover' && <SlideBackdrop />}
      {!noBg && (variant === 'hero' || variant === 'cover') && <SlideBackdropHero />}
      <div className="relative w-full h-full flex flex-col" style={{ containerType: 'inline-size' }}>
        {children}
      </div>
    </div>
  )
}

// 普通页背景:深色 + 微弱网格点
function SlideBackdrop() {
  return (
    <>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 80% -10%, rgba(255,141,26,0.08), transparent 50%),
                       radial-gradient(ellipse at -10% 110%, rgba(96,165,250,0.06), transparent 50%)`,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.18]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.18) 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />
    </>
  )
}

// Hero / Cover 页背景:更浓的橙色光晕 + 流动光带
function SlideBackdropHero() {
  return (
    <>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 50% 50%, rgba(255,141,26,0.18), transparent 60%),
                       radial-gradient(ellipse at 20% 80%, rgba(255,141,26,0.10), transparent 50%),
                       radial-gradient(ellipse at 80% 20%, rgba(96,165,250,0.10), transparent 50%)`,
        }}
      />
      <GlowOrb size="38vmin" x="78%" y="22%" color="rgba(255,141,26,0.30)" delay="0s"  />
      <GlowOrb size="28vmin" x="18%" y="70%" color="rgba(255,141,26,0.18)" delay="-3s" />
      <GlowOrb size="22vmin" x="62%" y="78%" color="rgba(96,165,250,0.18)" delay="-6s" />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.10]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }}
      />
    </>
  )
}

// 飘动光球(slow drift)
export function GlowOrb({
  size, x, y, color, delay = '0s',
}: { size: string; x: string; y: string; color: string; delay?: string }) {
  return (
    <div
      className="absolute pointer-events-none rounded-full ppt-orb"
      style={{
        width: size, height: size, left: x, top: y, background: color,
        filter: 'blur(60px)', transform: 'translate(-50%,-50%)',
        animationDelay: delay,
      }}
    />
  )
}

// ── 标题区 ──────────────────────────────────────────────────────────────────

export function SlideHeader({
  index,
  tag,
  title,
  sub,
  align = 'left',
}: {
  index?: string
  tag?: string
  title: ReactNode
  sub?: ReactNode
  align?: 'left' | 'center'
}) {
  return (
    <div
      className={`flex flex-col gap-[0.8cqi] ppt-stagger-row ${align === 'center' ? 'items-center text-center' : ''}`}
      style={{ marginBottom: '1.6cqi' }}
    >
      {(index || tag) && (
        <div className={`flex items-center gap-[1.2cqi] ${align === 'center' ? 'justify-center' : ''}`}>
          {index && (
            <span
              className="font-mono"
              style={{ fontSize: fz.tiny, color: PPT.fgDim, letterSpacing: '0.3em' }}
            >
              {index}
            </span>
          )}
          {tag && (
            <span
              className="inline-flex items-center px-[1.2cqi] py-[0.4cqi] rounded-full font-semibold"
              style={{
                fontSize: fz.tiny,
                background: PPT.brandSoft,
                color: PPT.brand,
                border: `1px solid ${PPT.borderHi}`,
                letterSpacing: '0.15em',
              }}
            >
              {tag}
            </span>
          )}
        </div>
      )}
      <h2
        className="font-extrabold leading-[1.05] tracking-tight"
        style={{
          fontSize: fz.h1,
          // 不丑断行: balance 均衡两行长度 + keep-all 让中文只在标点处断, 不会从汉字中间切
          textWrap: 'balance' as 'balance',
          wordBreak: 'keep-all',
          overflowWrap: 'break-word',
          maxWidth: '100%',
        }}
      >
        {title}
      </h2>
      {sub && (
        <p style={{ fontSize: fz.body, color: PPT.fgMuted, fontWeight: 300, lineHeight: 1.45, maxWidth: '85%' }}>
          {sub}
        </p>
      )}
    </div>
  )
}

// ── 渐变文字(高亮关键词)───────────────────────────────────────────────────

export function GradText({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span
      style={{
        background: PPT.brandGradTxt,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        ...style,
      }}
    >
      {children}
    </span>
  )
}

// ── Stagger 容器:让子元素依次进入(配合 ppt-stagger-row class)──────────

export function Stagger({
  children,
  delay = 0,
  step = 0.08,
  className = '',
  style,
}: {
  children: ReactNode
  delay?: number
  step?: number
  className?: string
  style?: CSSProperties
}) {
  return (
    <div className={className} style={style} data-stagger data-stagger-delay={delay} data-stagger-step={step}>
      {children}
    </div>
  )
}

// ── 大数字(进入时累加)─────────────────────────────────────────────────────

export function BigNumber({
  value,
  unit,
  caption,
  color = PPT.brand,
  size = fz.numL,
  glow = true,
  align = 'left',
}: {
  value: ReactNode
  unit?: ReactNode
  caption?: ReactNode
  color?: string
  size?: string
  glow?: boolean
  align?: 'left' | 'center'
}) {
  return (
    <div
      className={`inline-flex flex-col ${align === 'center' ? 'items-center text-center' : 'items-start'}`}
      style={{ minWidth: 0 }}
    >
      <div
        className="font-extrabold leading-none tracking-tight flex items-baseline gap-[0.5cqi]"
        style={{
          fontSize: size,
          color,
          textShadow: glow ? `0 0 60px ${color}80, 0 0 18px ${color}55` : undefined,
          whiteSpace: 'nowrap',  // 大数字永远不换行
        }}
      >
        <span style={{ whiteSpace: 'nowrap' }}>{value}</span>
        {unit && (
          <span
            style={{ fontSize: `calc(${size} * 0.32)`, color: PPT.fgMuted, fontWeight: 600, whiteSpace: 'nowrap' }}
          >
            {unit}
          </span>
        )}
      </div>
      {caption && (
        <div
          style={{ fontSize: fz.body, color: PPT.fgMuted, marginTop: '1cqi', fontWeight: 500 }}
        >
          {caption}
        </div>
      )}
    </div>
  )
}

// ── 玻璃卡片 ───────────────────────────────────────────────────────────────

export function GlassCard({
  children,
  className = '',
  style,
  highlight = false,
  pad = '2.4cqi',
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
  highlight?: boolean
  pad?: string
}) {
  return (
    <div
      className={`relative rounded-[1.6cqi] ${className}`}
      style={{
        background: highlight ? 'rgba(255,141,26,0.08)' : PPT.bgPanel,
        border: `1px solid ${highlight ? PPT.borderHi : PPT.border}`,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        padding: pad,
        boxShadow: highlight
          ? `inset 0 1px 0 rgba(255,255,255,0.08), ${PPT.glowBrand}`
          : 'inset 0 1px 0 rgba(255,255,255,0.05)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ── 标签 / 标签云 ───────────────────────────────────────────────────────────

export function Chip({
  children, tone = 'default',
}: { children: ReactNode; tone?: 'default' | 'brand' | 'rose' | 'green' | 'blue' }) {
  const toneMap: Record<string, { bg: string; fg: string; border: string }> = {
    default: { bg: 'rgba(255,255,255,0.06)', fg: PPT.fgMuted, border: PPT.border },
    brand:   { bg: PPT.brandSoft, fg: PPT.brandMid, border: PPT.borderHi },
    rose:    { bg: 'rgba(251,113,133,0.12)', fg: PPT.rose, border: 'rgba(251,113,133,0.30)' },
    green:   { bg: 'rgba(52,211,153,0.12)',  fg: PPT.green, border: 'rgba(52,211,153,0.30)' },
    blue:    { bg: 'rgba(96,165,250,0.12)',  fg: PPT.blue,  border: 'rgba(96,165,250,0.30)' },
  }
  const t = toneMap[tone]
  return (
    <span
      className="inline-flex items-center px-[1cqi] py-[0.4cqi] rounded-full font-medium"
      style={{ fontSize: fz.tiny, background: t.bg, color: t.fg, border: `1px solid ${t.border}`, letterSpacing: '0.05em' }}
    >
      {children}
    </span>
  )
}

// ── 状态徽标 · 已上线 / 路线图 ─────────────────────────────────────────────

export function StatusBadge({
  status,
  label,
}: {
  status: 'now' | 'next'
  /** 自定义文案; 默认 "已上线" / "路线图" */
  label?: string
}) {
  const isNow = status === 'now'
  const text = label ?? (isNow ? '已上线' : '路线图')
  return (
    <span
      className="inline-flex items-center gap-[0.4cqi] px-[0.8cqi] py-[0.3cqi] rounded-full font-mono"
      style={{
        fontSize: fz.tiny,
        background: isNow ? PPT.brandSoft : 'rgba(96,165,250,0.12)',
        color: isNow ? PPT.brand : PPT.blue,
        border: `1px solid ${isNow ? PPT.borderHi : 'rgba(96,165,250,0.40)'}`,
        letterSpacing: '0.2em',
        fontWeight: 700,
      }}
    >
      <span
        style={{
          width: '0.5cqi', height: '0.5cqi',
          borderRadius: '50%',
          background: 'currentColor',
          boxShadow: '0 0 6px currentColor',
          flexShrink: 0,
        }}
      />
      {text}
    </span>
  )
}

// ── 双层分区容器 — 已上线(实线/橙) + 路线图(虚线/蓝)──────────────────

export function TierSection({
  status,
  title,
  hint,
  children,
  className = '',
  pad = '1.4cqi',
}: {
  status: 'now' | 'next'
  title?: ReactNode
  hint?: ReactNode
  children: ReactNode
  className?: string
  pad?: string
}) {
  const isNow = status === 'now'
  return (
    <div
      className={`relative rounded-[1.2cqi] ${className}`}
      style={{
        background: isNow ? 'rgba(255,141,26,0.05)' : 'rgba(96,165,250,0.04)',
        border: `1px ${isNow ? 'solid' : 'dashed'} ${isNow ? 'rgba(255,141,26,0.35)' : 'rgba(96,165,250,0.40)'}`,
        padding: pad,
        backdropFilter: 'blur(20px)',
        boxShadow: isNow ? '0 0 30px -15px rgba(255,141,26,0.5)' : 'none',
      }}
    >
      <div
        className="absolute"
        style={{ top: '-0.7cqi', left: '1.2cqi', background: PPT.bg, padding: '0 0.4cqi' }}
      >
        <StatusBadge status={status} />
      </div>
      {title && (
        <div
          className="flex items-center gap-[0.6cqi]"
          style={{ marginBottom: hint ? '0.3cqi' : '1cqi', marginTop: '0.4cqi' }}
        >
          <span style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg }}>
            {title}
          </span>
        </div>
      )}
      {hint && (
        <div style={{ fontSize: fz.tiny, color: PPT.fgMuted, marginBottom: '1cqi', lineHeight: 1.4 }}>
          {hint}
        </div>
      )}
      {children}
    </div>
  )
}

// ── 流程箭头(SVG)──────────────────────────────────────────────────────────

export function FlowArrow({
  vertical = false, color = PPT.fgDim, length = '100%', thickness = 1.5,
}: { vertical?: boolean; color?: string; length?: string; thickness?: number }) {
  if (vertical) {
    return (
      <svg width="14" height={length} viewBox="0 0 14 100" preserveAspectRatio="none" style={{ height: length }}>
        <line x1="7" y1="0" x2="7" y2="92" stroke={color} strokeWidth={thickness} strokeDasharray="4 4" />
        <polygon points="7,100 1,90 13,90" fill={color} />
      </svg>
    )
  }
  return (
    <svg height="14" width={length} viewBox="0 0 100 14" preserveAspectRatio="none" style={{ width: length }}>
      <line x1="0" y1="7" x2="92" y2="7" stroke={color} strokeWidth={thickness} strokeDasharray="4 4" />
      <polygon points="100,7 90,1 90,13" fill={color} />
    </svg>
  )
}
