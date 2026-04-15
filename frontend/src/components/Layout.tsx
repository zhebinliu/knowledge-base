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
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="h-16 flex items-center px-5 border-b border-gray-200">
          <span className="text-lg font-bold text-blue-600">📚 KB System</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-gray-200 text-xs text-gray-400">
          纷享销客 CRM · 知识库管理
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
