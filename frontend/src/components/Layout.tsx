import { useState, useRef, useEffect } from 'react'
import { NavLink, Outlet, Link } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Brain, MessageSquare,
  ClipboardCheck, BookOpen, Settings, ChevronDown, LogOut, KeyRound, Shield, Folder, History,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../auth/AuthContext'

const nav = [
  { to: '/',          label: '总览',      icon: LayoutDashboard },
  { to: '/projects',  label: '项目库',    icon: Folder },
  { to: '/documents', label: '文档管理',  icon: FileText },
  { to: '/chunks',    label: '知识库',    icon: BookOpen },
  { to: '/qa',        label: '智能问答',  icon: MessageSquare },
  { to: '/review',    label: '审核队列',  icon: ClipboardCheck },
  { to: '/challenge', label: '知识挑战',  icon: Brain },
  { to: '/challenge/history', label: '挑战历史', icon: History },
  { to: '/settings',  label: '系统设置',  icon: Settings },
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
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-gray-900 flex flex-col">
        <div className="h-16 flex items-center px-5 border-b border-gray-700/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <BookOpen size={16} className="text-white" />
            </div>
            <div>
              <p className="text-white text-sm font-bold leading-tight">实施知识</p>
              <p className="text-gray-400 text-xs leading-tight">综合管理</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to} to={to} end={to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100',
                )
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-gray-700/50">
          <p className="text-xs text-gray-500">纷享销客 · 实施团队</p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-12 flex items-center justify-end px-5 bg-white border-b border-gray-200">
          <div className="relative" ref={ref}>
            <button
              type="button" onClick={() => setOpen((o) => !o)}
              className="flex items-center gap-2 text-sm text-gray-700 hover:bg-gray-100 px-2 py-1.5 rounded-lg"
            >
              <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold flex items-center justify-center">
                {initial}
              </span>
              <span className="leading-none">{display}</span>
              {user?.is_admin && (
                <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                  <Shield size={10} className="inline -mt-0.5 mr-0.5" />管理员
                </span>
              )}
              <ChevronDown size={14} className="text-gray-400" />
            </button>
            {open && (
              <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-xs text-gray-500">已登录</p>
                  <p className="text-sm text-gray-900 truncate">{user?.username}</p>
                </div>
                <Link
                  to="/change-password" onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <KeyRound size={14} /> 修改密码
                </Link>
                <button
                  type="button" onClick={() => { setOpen(false); logout() }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <LogOut size={14} /> 退出登录
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
