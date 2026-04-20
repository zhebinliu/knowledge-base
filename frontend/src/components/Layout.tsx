import { useState, useRef, useEffect } from 'react'
import { NavLink, Outlet, Link } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Brain, MessageSquare,
  ClipboardCheck, BookOpen, Settings, ChevronDown, LogOut, KeyRound, Shield, Folder,
} from 'lucide-react'
// BookOpen kept for chunks nav icon
import { useAuth } from '../auth/AuthContext'

const navGroups = [
  {
    label: '工作区',
    items: [
      { to: '/',          label: '总览',      icon: LayoutDashboard },
      { to: '/projects',  label: '项目库',    icon: Folder },
      { to: '/documents', label: '文档管理',  icon: FileText },
      { to: '/chunks',    label: '知识库',    icon: BookOpen },
      { to: '/qa',        label: '智能问答',  icon: MessageSquare },
      { to: '/review',    label: '审核队列',  icon: ClipboardCheck },
      { to: '/challenge', label: '知识挑战',  icon: Brain },
    ],
  },
  {
    label: '系统',
    items: [
      { to: '/settings', label: '系统设置', icon: Settings },
    ],
  },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [])

  const display = user?.full_name || user?.username || '未登录'
  const initial = (user?.full_name || user?.username || 'U').slice(0, 1).toUpperCase()

  return (
    <div className="shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img src="/logo.png" alt="logo" className="w-9 h-9 object-contain flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-gray-900 leading-tight">实施知识</p>
            <p className="text-xs leading-tight" style={{ color: 'var(--text-muted)' }}>综合管理</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navGroups.map((group) => (
            <div key={group.label} className="mb-1">
              <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400 select-none">
                {group.label}
              </p>
              {group.items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to} to={to} end={to === '/'}
                  className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
                >
                  <Icon size={16} />
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">纷享销客 · 实施团队</div>
      </aside>

      {/* Main */}
      <div className="main-wrap">
        {/* Topbar */}
        <header className="topbar">
          <div className="relative" ref={ref}>
            <button
              type="button" onClick={() => setOpen((o) => !o)}
              className="flex items-center gap-2 text-sm text-gray-700 hover:bg-gray-100 px-2 py-1.5 rounded-lg transition-colors"
            >
              <span className="user-avatar">{initial}</span>
              <span className="leading-none">{display}</span>
              {user?.is_admin && (
                <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                  <Shield size={10} />管理员
                </span>
              )}
              <ChevronDown size={14} className="text-gray-400" />
            </button>
            {open && (
              <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50">
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-xs text-gray-400">已登录</p>
                  <p className="text-sm text-gray-900 truncate">{user?.username}</p>
                </div>
                <Link
                  to="/change-password" onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <KeyRound size={14} /> 修改密码
                </Link>
                <button
                  type="button" onClick={() => { setOpen(false); logout() }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <LogOut size={14} /> 退出登录
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
