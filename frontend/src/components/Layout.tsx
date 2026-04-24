import { useState, useRef, useEffect } from 'react'
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Brain, MessageSquare,
  ClipboardCheck, BookOpen, Settings, ChevronDown, LogOut, KeyRound, Shield, Folder,
  Copy, RefreshCw, Check, Plug, Trash2, AlertCircle, Menu, Sparkles,
} from 'lucide-react'
// BookOpen kept for chunks nav icon
import { useAuth } from '../auth/AuthContext'
import { TOKEN_STORAGE_KEY, refreshToken, getMcpKeyStatus, generateMcpKey, revokeMcpKey } from '../api/client'

/** path → module key 映射 */
const pathToModule: Record<string, string> = {
  '/': 'dashboard',
  '/projects': 'projects',
  '/documents': 'documents',
  '/chunks': 'chunks',
  '/qa': 'qa',
  '/review': 'review',
  '/challenge': 'challenge',
  '/settings': 'settings',
}

const allNavGroups = [
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
  const [copied, setCopied] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const location = useLocation()

  // Close mobile drawer when route changes
  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  // MCP Key state
  const [mcpPreview, setMcpPreview] = useState<string | null>(null)
  const [mcpHasKey, setMcpHasKey] = useState(false)
  const [mcpFullKey, setMcpFullKey] = useState<string | null>(null)   // 生成后短暂展示
  const [mcpCopied, setMcpCopied] = useState(false)
  const [mcpLoading, setMcpLoading] = useState(false)
  const [showMcpPanel, setShowMcpPanel] = useState(false)

  function copyToken() {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY)
    if (!token) return
    navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await refreshToken()
    } finally {
      setRefreshing(false)
    }
  }

  async function openMcpPanel() {
    setShowMcpPanel(true)
    setMcpFullKey(null)
    try {
      const s = await getMcpKeyStatus()
      setMcpHasKey(s.has_key)
      setMcpPreview(s.preview)
    } catch { /* ignore */ }
  }

  async function handleGenerateMcpKey() {
    setMcpLoading(true)
    try {
      const res = await generateMcpKey()
      setMcpFullKey(res.mcp_api_key)
      setMcpHasKey(true)
      setMcpPreview(res.mcp_api_key.slice(0, 8) + '…' + res.mcp_api_key.slice(-4))
    } catch { /* ignore */ } finally {
      setMcpLoading(false)
    }
  }

  async function handleRevokeMcpKey() {
    if (!confirm('确认撤销 MCP Key？撤销后现有 Claude Code 配置将失效。')) return
    setMcpLoading(true)
    try {
      await revokeMcpKey()
      setMcpHasKey(false)
      setMcpPreview(null)
      setMcpFullKey(null)
    } catch { /* ignore */ } finally {
      setMcpLoading(false)
    }
  }

  function copyMcpKey() {
    if (!mcpFullKey) return
    navigator.clipboard.writeText(mcpFullKey)
    setMcpCopied(true)
    setTimeout(() => setMcpCopied(false), 2000)
  }

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setShowMcpPanel(false)
        setMcpFullKey(null)
      }
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [])

  const display = user?.full_name || user?.username || '未登录'
  const initial = (user?.full_name || user?.username || 'U').slice(0, 1).toUpperCase()

  const canAccess = (to: string) => {
    if (!user) return false
    if (user.is_admin) return true
    if (!user.allowed_modules) return true // null = 全部可见
    const mod = pathToModule[to]
    return mod ? user.allowed_modules.includes(mod) : false
  }

  const navGroups = allNavGroups
    .map(g => ({ ...g, items: g.items.filter(i => canAccess(i.to)) }))
    .filter(g => g.items.length > 0)

  return (
    <div className="shell">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar${sidebarOpen ? ' is-open' : ''}`}>
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
          <button
            type="button"
            className="sidebar-hamburger"
            aria-label="打开菜单"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={18} />
          </button>
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
            {open && !showMcpPanel && (
              <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50">
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-xs text-gray-400">已登录</p>
                  <p className="text-sm text-gray-900 truncate">{user?.username}</p>
                </div>
                <Link
                  to="/console" onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Sparkles size={14} className="text-orange-500" /> 进入工作台
                </Link>
                <Link
                  to="/change-password" onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <KeyRound size={14} /> 修改密码
                </Link>
                <button
                  type="button" onClick={copyToken}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                  {copied ? 'Token 已复制' : '复制 JWT Token'}
                </button>
                <button
                  type="button" onClick={handleRefresh} disabled={refreshing}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                  {refreshing ? '刷新中…' : '刷新 JWT Token'}
                </button>
                <button
                  type="button" onClick={openMcpPanel}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Plug size={14} /> MCP API Key
                </button>
                <div className="border-t border-gray-100 my-1" />
                <button
                  type="button" onClick={() => { setOpen(false); logout() }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <LogOut size={14} /> 退出登录
                </button>
              </div>
            )}

            {open && showMcpPanel && (
              <div className="absolute right-0 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50">
                <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                    <Plug size={13} /> MCP API Key
                  </p>
                  <button type="button" onClick={() => setShowMcpPanel(false)} className="text-xs text-gray-400 hover:text-gray-600">← 返回</button>
                </div>

                {/* 已有 key 状态 */}
                {mcpHasKey && (
                  <div className="px-3 py-2">
                    <p className="text-xs text-gray-500 mb-1">当前 Key</p>
                    <p className="text-xs font-mono bg-gray-50 px-2 py-1 rounded text-gray-700">{mcpPreview}</p>
                  </div>
                )}

                {/* 新生成的完整 Key，仅本次展示 */}
                {mcpFullKey && (
                  <div className="px-3 py-2 bg-green-50 border-y border-green-100">
                    <p className="text-xs text-green-700 font-medium mb-1 flex items-center gap-1">
                      <Check size={11} /> 已生成，请立即复制（仅显示一次）
                    </p>
                    <p className="text-xs font-mono break-all text-gray-800 mb-2">{mcpFullKey}</p>
                    <button
                      type="button" onClick={copyMcpKey}
                      className="flex items-center gap-1.5 text-xs px-2 py-1 bg-white border border-green-200 rounded hover:bg-green-50 transition-colors"
                    >
                      {mcpCopied ? <Check size={11} className="text-green-600" /> : <Copy size={11} />}
                      {mcpCopied ? '已复制' : '复制 Key'}
                    </button>
                    <p className="text-xs text-gray-400 mt-2">Claude Code 配置命令：</p>
                    <p className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-600 mt-1 break-all">
                      {`claude mcp add --transport http kb-system https://kb.tokenwave.cloud/api/mcp --header "Authorization: Bearer ${mcpFullKey}" -s user`}
                    </p>
                  </div>
                )}

                {/* 无 Key 提示 */}
                {!mcpHasKey && !mcpFullKey && (
                  <div className="px-3 py-2 text-xs text-gray-500 flex items-center gap-1.5">
                    <AlertCircle size={12} /> 尚未生成 MCP Key
                  </div>
                )}

                <div className="px-3 py-2 flex gap-2">
                  <button
                    type="button" onClick={handleGenerateMcpKey} disabled={mcpLoading}
                    className="flex-1 text-xs px-2 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {mcpLoading ? '处理中…' : mcpHasKey ? '轮换 Key' : '生成 Key'}
                  </button>
                  {mcpHasKey && (
                    <button
                      type="button" onClick={handleRevokeMcpKey} disabled={mcpLoading}
                      className="text-xs px-2 py-1.5 text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50 transition-colors flex items-center gap-1"
                    >
                      <Trash2 size={11} /> 撤销
                    </button>
                  )}
                </div>
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
