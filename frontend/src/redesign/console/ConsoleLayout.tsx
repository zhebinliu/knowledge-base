/**
 * NewConsoleLayout — uat.tokenwave.cloud 下的对外工作台 layout
 *
 * 设计目标:**视觉换新 + 功能 100% 保留**。对照生产 `frontend/src/layouts/ConsoleLayout.tsx`,
 * 这里复用所有真功能:
 *   - useAuth(user / logout)
 *   - 路由守卫:无 console 模块权限 → 跳 `/`
 *   - 4 个 nav 项(工作台首页 / 知识问答 / 项目管理 / 会议纪要)
 *   - 用户菜单(头像 + 已登录 + 修改密码 + 进入后台 + 退出)
 *   - 移动端响应
 * 不同之处只是 Liquid Glass 风格的渲染:浮动 floatbar + 底部 dock + 分离 avatar orb
 */
import { useRef, useState, useEffect } from 'react'
import { NavLink, Navigate, Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Home, MessageSquare, FolderKanban, Mic, Sparkles, Search,
  ChevronDown, LogOut, KeyRound, Shield,
} from 'lucide-react'
import LiquidGlass from 'liquid-glass-react'
import { useAuth } from '../../auth/AuthContext'
import MeshOrbs from '../components/MeshOrb'
import GlobalSearchModal from './GlobalSearchModal'
import QixinDrawer from '../../components/qixin/QixinDrawer'
import UpgradeBanner from '../../components/UpgradeBanner'
import '../redesign.css'

type NavItem = {
  to: string
  label: string
  icon: typeof Home
  end?: boolean
  gated?: boolean   // 升级中:普通用户置灰拦截,管理员放行
}

// 2026-07-13:对普通用户仅保留会议纪要,其余入口置灰拦截(升级改造中);管理员放行
const NAV: NavItem[] = [
  { to: '/console',          label: '工作台', icon: Home, end: true, gated: true },
  { to: '/console/qa',       label: '问答',   icon: MessageSquare, gated: true },
  { to: '/console/projects', label: '项目',   icon: FolderKanban,  gated: true },
  { to: '/console/meeting',  label: '会议',   icon: Mic },
]

const SLOT = {
  dock:    { width: 380, height: 64 },
  orb:     { width: 56,  height: 56 },
  floatbar:{ width: 260, height: 46 },
}

// overLight: false — 深色底,LiquidGlass 走暗模式(2026-05-15 切 PPT 风)
const GLASS = {
  dock:     { blurAmount: 0.14, saturation: 130, aberrationIntensity: 2, elasticity: 0.20, displacementScale: 40, overLight: false },
  orb:      { blurAmount: 0.14, saturation: 130, aberrationIntensity: 2, elasticity: 0.35, displacementScale: 55, overLight: false },
  floatbar: { blurAmount: 0.12, saturation: 120, aberrationIntensity: 2, elasticity: 0.18, displacementScale: 35, overLight: false },
}

export default function NewConsoleLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const shellRef = useRef<HTMLDivElement>(null)

  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // ⌘K / Ctrl+K 打开全局搜索
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 路由守卫:user 显式没有 console 模块权限 → 跳回 / (走 Layout)
  if (user && !user.is_admin && user.allowed_modules &&
      !user.allowed_modules.includes('console')) {
    return <Navigate to="/" replace />
  }

  const display = user?.full_name || user?.username || '访客'
  const initial = (user?.full_name || user?.username || 'U').trim().charAt(0).toUpperCase()

  return (
    <div className="rd-root" ref={shellRef}>
      <MeshOrbs />
      {/* sci-fi 水平扫描激光 — 14s 一道,从屏幕上方扫到下方 */}
      <div className="rd-scan-line" aria-hidden />
      <div className="rd-floatbar-scrim" />
      <div className="rd-dock-scrim" />
      <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <QixinDrawer />

      <div className="rd-shell">
        {/* 浮动玻璃顶栏 */}
        <div className="rd-floatbar-wrap">
          <div className="rd-glass-slot" style={SLOT.floatbar}>
            <LiquidGlass
              cornerRadius={999}
              padding="6px 18px 6px 8px"
              {...GLASS.floatbar}
              mouseContainer={shellRef}
              style={{ position: 'absolute', top: '50%', left: '50%' }}
            >
              <div className="rd-floatbar-inner">
                <Link to="/console" className="rd-floatbar-logo" aria-label="首页">
                  <Sparkles size={14} color="#fff" />
                </Link>
                <span>实施工作台</span>
                {user?.is_admin && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 999,
                    background: 'rgba(245, 158, 11, .15)',
                    color: '#FCD34D',
                    fontSize: 10.5, fontWeight: 600,
                    letterSpacing: '0.02em',
                  }}>
                    <Shield size={9} /> 管理员
                  </span>
                )}
              </div>
            </LiquidGlass>
          </div>
        </div>

        <main
          key={location.pathname}
          style={{
            flex: 1,
            position: 'relative',
            paddingTop: 80,    // floatbar at top:18 + height ~46 + 16 gap
            paddingBottom: 110, // dock at bottom:22 + height ~64 + 24 gap
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* 升级中横幅:仅普通用户可见,管理员测试时不打扰 */}
          {!user?.is_admin && (
            <div style={{ padding: '0 16px 12px' }}>
              <div style={{ borderRadius: 12, overflow: 'hidden' }}>
                <UpgradeBanner variant="dark" />
              </div>
            </div>
          )}
          <Outlet />
        </main>

        {/* 底部 Liquid Glass Dock(4 个 nav + 搜索 + 头像菜单) */}
        <div className="rd-dock-wrap">
          <div className="rd-glass-slot" style={SLOT.dock}>
            <LiquidGlass
              cornerRadius={999}
              padding="6px"
              {...GLASS.dock}
              mouseContainer={shellRef}
              style={{ position: 'absolute', top: '50%', left: '50%' }}
            >
              <nav className="rd-dock-inner" aria-label="主导航">
                {NAV.map((item) => {
                  const { to, label, icon: Icon, end } = item
                  const disabled = !!item.gated && !user?.is_admin
                  return (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    aria-disabled={disabled || undefined}
                    title={disabled ? '升级改造中' : undefined}
                    onClick={e => { if (disabled) e.preventDefault() }}
                    className={({ isActive }) => `rd-dock-item${isActive && !disabled ? ' is-active' : ''}`}
                    style={disabled ? { opacity: 0.38, cursor: 'not-allowed' } : undefined}
                  >
                    <Icon size={17} strokeWidth={1.9} />
                    <span>{label}</span>
                  </NavLink>
                  )
                })}
              </nav>
            </LiquidGlass>
          </div>

          {/* 搜索 */}
          <div
            className="rd-glass-slot"
            style={{ ...SLOT.orb, cursor: 'pointer' }}
            title="全局搜索(⌘K)"
            onClick={() => setSearchOpen(true)}
          >
            <LiquidGlass
              cornerRadius={999}
              padding="14px"
              {...GLASS.orb}
              mouseContainer={shellRef}
              style={{ position: 'absolute', top: '50%', left: '50%' }}
              onClick={() => setSearchOpen(true)}
            >
              <Search
                size={20}
                color="#FFFFFF"
                strokeWidth={2.4}
                style={{ filter: 'drop-shadow(0 1px 4px rgba(255,141,26,0.5))' }}
              />
            </LiquidGlass>
          </div>

          {/* 头像菜单(点击展开浮窗) */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <div className="rd-glass-slot" style={SLOT.orb}>
              <LiquidGlass
                cornerRadius={999}
                padding="14px"
                {...GLASS.orb}
                mouseContainer={shellRef}
                style={{ position: 'absolute', top: '50%', left: '50%' }}
                onClick={() => setMenuOpen(o => !o)}
              >
                <span style={{
                  fontSize: 14, fontWeight: 800, color: '#fff',
                  display: 'inline-block', width: 20, height: 20, lineHeight: '20px',
                  textAlign: 'center', letterSpacing: '-0.02em',
                  background: 'linear-gradient(135deg, var(--rd-accent), var(--rd-accent-2))',
                  borderRadius: '50%',
                  boxShadow: '0 2px 8px rgba(255,141,26,.45), inset 0 1px 0 rgba(255,255,255,.4)',
                }}>{initial}</span>
              </LiquidGlass>
            </div>

            {menuOpen && (
              <div style={{
                position: 'absolute', bottom: 'calc(100% + 14px)', right: 0,
                width: 240,
                background: 'rgba(255, 255, 255, 0.92)',
                backdropFilter: 'blur(24px) saturate(180%)',
                WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                border: '1px solid var(--rd-line)',
                borderRadius: 16,
                boxShadow: '0 16px 40px -12px rgba(15, 18, 36, 0.18), 0 4px 12px -4px rgba(15, 18, 36, 0.10)',
                padding: 6,
                animation: 'rd-fade-up .25s var(--rd-ease) both',
                zIndex: 100,
              }}>
                <div style={{
                  padding: '10px 12px 12px',
                  borderBottom: '1px solid var(--rd-line)',
                  marginBottom: 4,
                }}>
                  <div style={{ fontSize: 11, color: 'var(--rd-text-3)', marginBottom: 3 }}>已登录</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--rd-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {display}
                    {user?.is_admin && <span style={{ fontSize: 10, color: '#FCD34D', marginLeft: 6, fontWeight: 500 }}>管理员</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--rd-text-3)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    @{user?.username}
                  </div>
                </div>

                <MenuItem icon={KeyRound} label="修改密码" onClick={() => { setMenuOpen(false); navigate('/change-password') }} />
                {user?.is_admin && (
                  <MenuItem icon={Shield} label="进入知识库后台" onClick={() => { setMenuOpen(false); navigate('/') }} />
                )}
                <div style={{ height: 1, background: 'var(--rd-line)', margin: '4px 8px' }} />
                <MenuItem icon={LogOut} label="退出登录" onClick={() => { setMenuOpen(false); logout() }} danger />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MenuItem({ icon: Icon, label, onClick, danger }: {
  icon: typeof Home; label: string; onClick: () => void; danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 12px',
        borderRadius: 10,
        border: 'none',
        background: 'transparent',
        color: danger ? '#F87171' : 'var(--rd-text)',
        fontSize: 13, fontWeight: 500,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background .15s',
        fontFamily: 'inherit',
      }}
      onMouseEnter={e => e.currentTarget.style.background = danger ? 'rgba(220, 38, 38, .08)' : 'rgba(15, 18, 36, .04)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <Icon size={14} /> {label}
    </button>
  )
}
