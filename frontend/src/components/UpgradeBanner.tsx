import { Megaphone } from 'lucide-react'

/**
 * UpgradeBanner — 顶部「升级中」横幅
 *
 * 2026-07-13:项目管理等模块底层升级期间,对普通用户展示。管理员不展示(仍可操作所有模块做测试)。
 * 由各 layout 自行按 `!user?.is_admin` 决定是否渲染。
 *
 * variant:'light' 用于 legacy 浅色工作台(嵌在 sticky header 内),
 *         'dark'  用于 redesign 深色工作台(嵌在内容区顶部)。
 */
export default function UpgradeBanner({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const dark = variant === 'dark'
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: '100%',
        padding: '7px 16px',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: '0.01em',
        color: dark ? '#FFD9A8' : '#8A4B00',
        background: dark
          ? 'linear-gradient(90deg, rgba(217,100,0,0.18), rgba(255,141,26,0.14))'
          : 'linear-gradient(90deg, #FFF3E4, #FFE8CE)',
        borderBottom: dark ? '1px solid rgba(255,141,26,0.28)' : '1px solid #F3D6B0',
        backdropFilter: dark ? 'blur(8px)' : undefined,
        WebkitBackdropFilter: dark ? 'blur(8px)' : undefined,
      }}
    >
      <Megaphone size={15} strokeWidth={2} style={{ flexShrink: 0 }} />
      <span>正在项目管理模块底层升级,敬请期待</span>
    </div>
  )
}
