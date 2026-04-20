/**
 * Design tokens — TypeScript constants
 *
 * Use these when you need a value in an inline `style={}` prop
 * (e.g. dynamic gradients, complex box-shadows).
 * For static Tailwind classes, prefer the CSS-class equivalents
 * (bg-brand, text-ink, shadow-brand, …) defined in tailwind.config.js.
 */

// ── Colors ────────────────────────────────────────────────────────────────

export const color = {
  // Brand
  brand:      '#FF8D1A',
  brandDeep:  '#D96400',
  brandLight: '#FFF4E6',
  brandMid:   '#FFB066',

  // Surfaces
  surface: '#FFFFFF',
  canvas:  '#F5F6FA',

  // Borders
  line:       '#E8E9EE',
  lineStrong: '#D0D3DE',

  // Text
  ink:          '#1A1D2E',
  inkSecondary: '#6B7280',
  inkMuted:     '#9CA3AF',

  // Semantic
  success: '#10B981', successDeep: '#059669', successLight: '#ECFDF5',
  danger:  '#EF4444', dangerDeep:  '#DC2626', dangerLight:  '#FFF1F2',
  info:    '#3B82F6', infoDeep:    '#2563EB', infoLight:    '#EFF6FF',
  warn:    '#F59E0B', warnDeep:    '#B45309', warnLight:    '#FFFBEB',
  accent2: '#8B5CF6', accent2Deep: '#7C3AED', accent2Light: '#F5F3FF',
} as const

// ── Gradients ─────────────────────────────────────────────────────────────

export const gradient = {
  /** Primary brand gradient — buttons, active nav, logo icons */
  brand:   'linear-gradient(135deg, #FF8D1A, #FF7A00)',
  /** Lighter variant — auth background wash */
  brandBg: 'linear-gradient(160deg, #FFF4E6 0%, #F5F6FA 65%)',
  /** Tinted icon backgrounds — pass color value to stat-icon */
  iconOrange: 'linear-gradient(135deg, rgba(255,141,26,.14), rgba(255,122,0,.07))',
  iconBlue:   'linear-gradient(135deg, rgba(59,130,246,.14),  rgba(37,99,235,.07))',
  iconGreen:  'linear-gradient(135deg, rgba(16,185,129,.14),  rgba(5,150,105,.07))',
  iconRed:    'linear-gradient(135deg, rgba(239,68,68,.14),   rgba(220,38,38,.07))',
  iconPurple: 'linear-gradient(135deg, rgba(139,92,246,.14),  rgba(124,58,237,.07))',
  iconAmber:  'linear-gradient(135deg, rgba(245,158,11,.14),  rgba(217,119,6,.07))',
  success: 'linear-gradient(135deg, #10B981, #059669)',
} as const

// ── Shadows ───────────────────────────────────────────────────────────────

export const shadow = {
  sm:      '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)',
  md:      '0 4px 12px rgba(0,0,0,.08), 0 1px 3px rgba(0,0,0,.05)',
  lg:      '0 10px 28px rgba(0,0,0,.10), 0 4px 8px rgba(0,0,0,.06)',
  brand:   '0 2px 6px rgba(255,122,26,.25)',
  brandLg: '0 3px 10px rgba(255,122,26,.35)',
  success: '0 2px 6px rgba(16,185,129,.25)',
  navActive: '0 2px 8px rgba(255,122,26,.30)',
  authCard:  '0 3px 10px rgba(255,122,26,.28)',
} as const

// ── Radius ────────────────────────────────────────────────────────────────

export const radius = {
  sm:  '6px',
  md:  '10px',
  lg:  '14px',
  xl:  '18px',
  '2xl': '24px',
  full: '9999px',
} as const

// ── Convenience: semantic color for badge/stat-icon tone names ────────────

export type Tone = 'orange' | 'blue' | 'green' | 'red' | 'purple' | 'amber' | 'gray'

/** Map a tone name to its fg color (for inline icon coloring) */
export const toneColor: Record<Tone, string> = {
  orange: color.brand,
  blue:   color.info,
  green:  color.success,
  red:    color.danger,
  purple: color.accent2,
  amber:  color.warn,
  gray:   color.inkSecondary,
}

/** Map a tone name to its gradient background (for stat-icon fill) */
export const toneGradient: Record<Tone, string> = {
  orange: gradient.iconOrange,
  blue:   gradient.iconBlue,
  green:  gradient.iconGreen,
  red:    gradient.iconRed,
  purple: gradient.iconPurple,
  amber:  gradient.iconAmber,
  gray:   'linear-gradient(135deg, rgba(107,114,128,.12), rgba(75,85,99,.06))',
}
