import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Brain, MessageSquare,
  ClipboardCheck, BookOpen,
} from 'lucide-react'
import clsx from 'clsx'

const nav = [
  { to: '/',          label: '总览',      icon: LayoutDashboard },
  { to: '/documents', label: '文档管理',  icon: FileText },
  { to: '/chunks',    label: '知识库',    icon: BookOpen },
  { to: '/qa',        label: '智能问答',  icon: MessageSquare },
  { to: '/review',    label: '审核队列',  icon: ClipboardCheck },
  { to: '/challenge', label: '知识挑战',  icon: Brain },
]

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-gray-900 flex flex-col">
        {/* Logo */}
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

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
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

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-700/50">
          <p className="text-xs text-gray-500">纷享销客 · 实施团队</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
