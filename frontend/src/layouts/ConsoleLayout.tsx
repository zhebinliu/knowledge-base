import { useState, useRef, useEffect } from 'react'
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import {
  MessageSquare, FolderKanban, Mic, BookOpen, ChevronDown, LogOut, KeyRound, Shield, Home,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

const NAV = [
  { to: '/console',          label: '工作台首页', icon: Home,          end: true },
  { to: '/console/qa',       label: '知识问答',   icon: MessageSquare },
  { to: '/console/projects', label: '项目管理',   icon: FolderKanban },
  { to: '/console/meeting',  label: '会议纪要',   icon: Mic,            disabled: true },
]

export default function ConsoleLayout() {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const loc = useLocation()

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const initial = (user?.full_name || user?.username || 'U').trim().charAt(0).toUpperCase()
  const display = user?.full_name || user?.username || '访客'

  return (
    <div className="min-h-screen bg-canvas">
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-line">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Link to="/console" className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: BRAND_GRAD }}>
              <BookOpen size={13} className="text-white" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold text-ink">实施工作台</p>
              <p className="text-[10px] text-ink-muted hidden sm:block">KB Console · 纷享销客</p>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {NAV.map(({ to, label, icon: Icon, end, disabled }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={e => { if (disabled) e.preventDefault() }}
                className={({ isActive }) => [
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors',
                  disabled ? 'text-ink-muted cursor-not-allowed opacity-60' :
                  isActive ? 'bg-brand-light text-[#D96400] font-medium' :
                  'text-ink-secondary hover:bg-canvas hover:text-ink',
                ].join(' ')}
                title={disabled ? '即将上线' : undefined}
              >
                <Icon size={14} /> {label}
                {disabled && <span className="ml-0.5 text-[9px] bg-gray-100 text-gray-500 px-1 rounded">即将上线</span>}
              </NavLink>
            ))}
          </nav>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen(o => !o)}
              className="flex items-center gap-2 text-sm text-ink hover:bg-canvas px-2 py-1.5 rounded-lg transition-colors"
            >
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                style={{ background: BRAND_GRAD }}
              >
                {initial}
              </span>
              <span className="hidden sm:inline leading-none">{display}</span>
              {user?.is_admin && (
                <span className="hidden sm:inline-flex items-center gap-0.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                  <Shield size={10} />管理员
                </span>
              )}
              <ChevronDown size={14} className="text-ink-muted" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-1 w-48 bg-white border border-line rounded-xl shadow-lg py-1 z-30">
                <div className="px-3 py-2 border-b border-line">
                  <p className="text-xs text-ink-muted">已登录</p>
                  <p className="text-sm text-ink truncate">{user?.username}</p>
                </div>
                <Link
                  to="/change-password"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-ink-secondary hover:bg-canvas transition-colors"
                >
                  <KeyRound size={14} /> 修改密码
                </Link>
                {user?.is_admin && (
                  <Link
                    to="/"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-ink-secondary hover:bg-canvas transition-colors"
                  >
                    <Shield size={14} /> 进入知识库后台
                  </Link>
                )}
                <div className="border-t border-line my-1" />
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); logout() }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-secondary hover:bg-canvas transition-colors"
                >
                  <LogOut size={14} /> 退出登录
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile nav */}
        <nav className="md:hidden flex items-center gap-1 px-4 pb-2 overflow-x-auto">
          {NAV.map(({ to, label, icon: Icon, end, disabled }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={e => { if (disabled) e.preventDefault() }}
              className={({ isActive }) => [
                'flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-colors',
                disabled ? 'text-ink-muted cursor-not-allowed opacity-60' :
                isActive ? 'bg-brand-light text-[#D96400] font-medium' :
                'text-ink-secondary hover:bg-canvas',
              ].join(' ')}
            >
              <Icon size={12} /> {label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* 工作台(projects/:id)走全宽 + 零左右内边距;列表/首页保持 max-w-7xl 居中 */}
      <main
        key={loc.pathname}
        className={
          /^\/console\/projects\/[^/]+$/.test(loc.pathname)
            ? 'w-full'
            : 'max-w-7xl mx-auto px-4 sm:px-6 py-6'
        }
      >
        <Outlet />
      </main>
    </div>
  )
}
