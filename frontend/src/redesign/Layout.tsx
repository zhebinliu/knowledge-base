/**
 * NewLayout — uat 下的后台主壳(Liquid Glass)
 *
 * 功能 100% 等价于生产 `frontend/src/components/Layout.tsx`:
 *   - useAuth + 路由守卫:无后台模块权限 → 跳 /console
 *   - 模块权限过滤 nav
 *   - 用户菜单:JWT Token 复制/刷新 + MCP Key 管理(get/generate/revoke + 复制)+ 修改密码 + 进入工作台 + 退出
 *
 * 视觉:跟 NewConsoleLayout 同语言 — 浮动玻璃顶栏 + 底部 Liquid Glass dock
 * 由于后台 nav 有 10 项,dock 放 5 个最常用,其他放顶栏「更多」浮窗
 */
import { useState, useRef, useEffect } from 'react'
import { NavLink, Navigate, Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Brain, MessageSquare, ClipboardCheck, BookOpen,
  Settings, Sliders, ChevronDown, LogOut, KeyRound, Shield, Folder,
  Copy, RefreshCw, Check, Plug, Trash2, AlertCircle, Sparkles, Search,
  MoreHorizontal,
} from 'lucide-react'
import LiquidGlass from 'liquid-glass-react'
import { useAuth } from '../auth/AuthContext'
import { TOKEN_STORAGE_KEY, refreshToken, getMcpKeyStatus, generateMcpKey, revokeMcpKey } from '../api/client'
import MeshOrbs from './components/MeshOrb'
import GlobalSearchModal from './console/GlobalSearchModal'
import './redesign.css'

const pathToModule: Record<string, string> = {
  '/': 'dashboard',
  '/projects': 'projects',
  '/documents': 'documents',
  '/chunks': 'chunks',
  '/qa': 'qa',
  '/review': 'review',
  '/challenge': 'challenge',
  '/settings': 'settings',
  '/system-config': 'settings',
  '/invite-codes': 'settings',
}
const BACKEND_MODULES = ['dashboard', 'projects', 'documents', 'chunks', 'qa', 'review', 'challenge', 'settings']

const DOCK_NAV = [
  { to: '/',          label: '总览',     icon: LayoutDashboard, end: true },
  { to: '/projects',  label: '项目',     icon: Folder },
  { to: '/documents', label: '文档',     icon: FileText },
  { to: '/chunks',    label: '知识库',   icon: BookOpen },
  { to: '/qa',        label: '问答',     icon: MessageSquare },
]

const MORE_NAV = [
  { to: '/review',        label: '审核队列', icon: ClipboardCheck, module: 'review' },
  { to: '/challenge',     label: '知识挑战', icon: Brain,          module: 'challenge' },
  { to: '/system-config', label: '系统配置', icon: Sliders,        module: 'settings', adminOnly: true },
  { to: '/settings',      label: '系统设置', icon: Settings,       module: 'settings', adminOnly: true },
  { to: '/invite-codes',  label: '邀请码',   icon: Shield,         module: 'settings', adminOnly: true },
]

const SLOT = {
  dock:     { width: 460, height: 64 },
  orb:      { width: 56,  height: 56 },
  floatbar: { width: 240, height: 46 },
}
const GLASS = {
  dock:     { blurAmount: 0.14, saturation: 150, aberrationIntensity: 2, elasticity: 0.20, displacementScale: 40, overLight: true },
  orb:      { blurAmount: 0.14, saturation: 150, aberrationIntensity: 2, elasticity: 0.35, displacementScale: 55, overLight: true },
  floatbar: { blurAmount: 0.12, saturation: 140, aberrationIntensity: 2, elasticity: 0.18, displacementScale: 35, overLight: true },
}

export default function NewLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const shellRef = useRef<HTMLDivElement>(null)

  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)

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

  const [copied, setCopied] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // MCP Key state
  const [showMcpPanel, setShowMcpPanel] = useState(false)
  const [mcpPreview, setMcpPreview] = useState<string | null>(null)
  const [mcpHasKey, setMcpHasKey] = useState(false)
  const [mcpFullKey, setMcpFullKey] = useState<string | null>(null)
  const [mcpCopied, setMcpCopied] = useState(false)
  const [mcpLoading, setMcpLoading] = useState(false)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false); setShowMcpPanel(false); setMcpFullKey(null)
      }
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function copyToken() {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY)
    if (!token) return
    navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleRefresh() {
    setRefreshing(true)
    try { await refreshToken() } finally { setRefreshing(false) }
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
    } catch { /* ignore */ } finally { setMcpLoading(false) }
  }

  async function handleRevokeMcpKey() {
    if (!confirm('确认撤销 MCP Key?撤销后现有 Claude Code 配置将失效。')) return
    setMcpLoading(true)
    try {
      await revokeMcpKey()
      setMcpHasKey(false); setMcpPreview(null); setMcpFullKey(null)
    } catch { /* ignore */ } finally { setMcpLoading(false) }
  }

  function copyMcpKey() {
    if (!mcpFullKey) return
    navigator.clipboard.writeText(mcpFullKey)
    setMcpCopied(true)
    setTimeout(() => setMcpCopied(false), 2000)
  }

  // 路由守卫
  const canAccess = (to: string) => {
    if (!user) return false
    if (user.is_admin) return true
    if (!user.allowed_modules) return true
    const mod = pathToModule[to]
    return mod ? user.allowed_modules.includes(mod) : false
  }

  if (user && !user.is_admin && user.allowed_modules &&
      !user.allowed_modules.some(m => BACKEND_MODULES.includes(m))) {
    return <Navigate to="/console" replace />
  }

  const dockItems = DOCK_NAV.filter(i => canAccess(i.to))
  const moreItems = MORE_NAV.filter(i => {
    if (i.adminOnly && !user?.is_admin) return false
    return canAccess(i.to)
  })

  const display = user?.full_name || user?.username || '访客'
  const initial = (user?.full_name || user?.username || 'U').trim().charAt(0).toUpperCase()

  return (
    <div className="rd-root" ref={shellRef}>
      <MeshOrbs />
      <div className="rd-floatbar-scrim" />
      <div className="rd-dock-scrim" />
      <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />

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
                <Link to="/" className="rd-floatbar-logo" aria-label="首页">
                  <Sparkles size={14} color="#fff" />
                </Link>
                <span>实施知识 · KB</span>
                {user?.is_admin && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 999,
                    background: 'rgba(245, 158, 11, .15)',
                    color: '#B45309',
                    fontSize: 10.5, fontWeight: 600,
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
          <Outlet />
        </main>

        {/* 底部 Liquid Glass Dock */}
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
                {dockItems.map(({ to, label, icon: Icon, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) => `rd-dock-item${isActive ? ' is-active' : ''}`}
                  >
                    <Icon size={17} strokeWidth={1.9} />
                    <span>{label}</span>
                  </NavLink>
                ))}
                {moreItems.length > 0 && (
                  <button
                    type="button"
                    className="rd-dock-item"
                    onClick={() => setMoreOpen(o => !o)}
                  >
                    <MoreHorizontal size={17} strokeWidth={1.9} />
                    <span>更多</span>
                  </button>
                )}
              </nav>
            </LiquidGlass>

            {/* 更多浮窗(包含 review / challenge / 管理) */}
            {moreOpen && moreItems.length > 0 && (
              <div ref={moreRef} style={{
                position: 'absolute', bottom: 'calc(100% + 12px)', right: 0,
                width: 220,
                background: 'rgba(255, 255, 255, 0.55)',
                backdropFilter: 'blur(28px) saturate(180%)',
                WebkitBackdropFilter: 'blur(28px) saturate(180%)',
                border: '1px solid rgba(255, 255, 255, 0.55)',
                borderRadius: 16,
                boxShadow: '0 16px 40px -12px rgba(15, 18, 36, 0.18), inset 0 1px 0 rgba(255,255,255,.85)',
                padding: 6,
                animation: 'rd-fade-up .25s var(--rd-ease) both',
                zIndex: 100,
              }}>
                {moreItems.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMoreOpen(false)}
                    style={({ isActive }) => ({
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 12px',
                      borderRadius: 10,
                      color: isActive ? 'var(--rd-accent-2)' : 'var(--rd-text)',
                      background: isActive ? 'rgba(255, 141, 26, .12)' : 'transparent',
                      fontSize: 13, fontWeight: 500,
                      textDecoration: 'none',
                      transition: 'background .15s',
                    })}
                  >
                    <Icon size={14} /> {label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>

          {/* 搜索 orb */}
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
                color="#1A1D2E"
                strokeWidth={2.4}
                style={{ filter: 'drop-shadow(0 1px 2px rgba(255,255,255,.7))' }}
              />
            </LiquidGlass>
          </div>

          {/* 头像菜单 orb */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <div className="rd-glass-slot" style={SLOT.orb}>
              <LiquidGlass
                cornerRadius={999}
                padding="14px"
                {...GLASS.orb}
                mouseContainer={shellRef}
                style={{ position: 'absolute', top: '50%', left: '50%' }}
                onClick={() => { setMenuOpen(o => !o); setShowMcpPanel(false); setMcpFullKey(null) }}
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

            {menuOpen && !showMcpPanel && (
              <div style={{
                position: 'absolute', bottom: 'calc(100% + 14px)', right: 0,
                width: 240,
                background: 'rgba(255, 255, 255, 0.65)',
                backdropFilter: 'blur(28px) saturate(180%)',
                WebkitBackdropFilter: 'blur(28px) saturate(180%)',
                border: '1px solid rgba(255, 255, 255, 0.55)',
                borderRadius: 16,
                boxShadow: '0 16px 40px -12px rgba(15, 18, 36, 0.18), inset 0 1px 0 rgba(255,255,255,.85)',
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
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--rd-text)' }}>{display}</div>
                  <div style={{ fontSize: 11, color: 'var(--rd-text-3)', marginTop: 3 }}>@{user?.username}</div>
                </div>

                <MenuItem icon={Sparkles} label="进入工作台" onClick={() => { setMenuOpen(false); navigate('/console') }} accent />
                <MenuItem icon={KeyRound} label="修改密码"   onClick={() => { setMenuOpen(false); navigate('/change-password') }} />
                <MenuItem
                  icon={copied ? Check : Copy}
                  label={copied ? 'Token 已复制' : '复制 JWT Token'}
                  onClick={() => copyToken()}
                />
                <MenuItem
                  icon={RefreshCw}
                  label={refreshing ? '刷新中…' : '刷新 JWT Token'}
                  onClick={() => handleRefresh()}
                  disabled={refreshing}
                  spin={refreshing}
                />
                <MenuItem icon={Plug} label="MCP API Key" onClick={() => openMcpPanel()} />
                <div style={{ height: 1, background: 'var(--rd-line)', margin: '4px 8px' }} />
                <MenuItem icon={LogOut} label="退出登录" onClick={() => { setMenuOpen(false); logout() }} danger />
              </div>
            )}

            {menuOpen && showMcpPanel && (
              <div style={{
                position: 'absolute', bottom: 'calc(100% + 14px)', right: 0,
                width: 300,
                background: 'rgba(255, 255, 255, 0.85)',
                backdropFilter: 'blur(28px) saturate(180%)',
                WebkitBackdropFilter: 'blur(28px) saturate(180%)',
                border: '1px solid rgba(255, 255, 255, 0.55)',
                borderRadius: 16,
                boxShadow: '0 16px 40px -12px rgba(15, 18, 36, 0.18), inset 0 1px 0 rgba(255,255,255,.85)',
                padding: 6,
                animation: 'rd-fade-up .25s var(--rd-ease) both',
                zIndex: 100,
              }}>
                <div style={{
                  padding: '10px 12px', borderBottom: '1px solid var(--rd-line)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 4,
                }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                    <Plug size={13} /> MCP API Key
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowMcpPanel(false)}
                    style={{
                      fontSize: 11, color: 'var(--rd-text-3)', background: 'transparent',
                      border: 'none', cursor: 'pointer',
                    }}
                  >← 返回</button>
                </div>

                {mcpHasKey && (
                  <div style={{ padding: '8px 12px' }}>
                    <div style={{ fontSize: 11, color: 'var(--rd-text-3)', marginBottom: 4 }}>当前 Key</div>
                    <div className="rd-mono" style={{
                      fontSize: 11, padding: '4px 8px', borderRadius: 6,
                      background: 'rgba(15, 18, 36, .04)',
                      color: 'var(--rd-text)',
                    }}>{mcpPreview}</div>
                  </div>
                )}

                {mcpFullKey && (
                  <div style={{
                    padding: '10px 12px',
                    background: 'rgba(5, 150, 105, .08)',
                    borderTop: '1px solid rgba(5, 150, 105, .15)',
                    borderBottom: '1px solid rgba(5, 150, 105, .15)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#047857', fontWeight: 600, marginBottom: 6 }}>
                      <Check size={11} /> 已生成,请立即复制(仅显示一次)
                    </div>
                    <div className="rd-mono" style={{ fontSize: 11, wordBreak: 'break-all', color: 'var(--rd-text)', marginBottom: 8 }}>
                      {mcpFullKey}
                    </div>
                    <button
                      type="button"
                      onClick={copyMcpKey}
                      className="rd-chip"
                      style={{ fontSize: 11, padding: '4px 10px' }}
                    >
                      {mcpCopied ? <Check size={10} color="#059669" /> : <Copy size={10} />}
                      {mcpCopied ? '已复制' : '复制 Key'}
                    </button>
                  </div>
                )}

                {!mcpHasKey && !mcpFullKey && (
                  <div style={{ padding: '8px 12px', fontSize: 11.5, color: 'var(--rd-text-3)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <AlertCircle size={12} /> 尚未生成 MCP Key
                  </div>
                )}

                <div style={{ padding: 8, display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={handleGenerateMcpKey}
                    disabled={mcpLoading}
                    className="rd-btn rd-btn-primary"
                    style={{ flex: 1, fontSize: 12, padding: '7px 12px' }}
                  >
                    {mcpLoading ? '处理中…' : mcpHasKey ? '轮换 Key' : '生成 Key'}
                  </button>
                  {mcpHasKey && (
                    <button
                      type="button"
                      onClick={handleRevokeMcpKey}
                      disabled={mcpLoading}
                      className="rd-btn"
                      style={{ fontSize: 12, padding: '7px 10px', color: '#DC2626' }}
                    >
                      <Trash2 size={11} /> 撤销
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MenuItem({ icon: Icon, label, onClick, danger, accent, disabled, spin }: {
  icon: typeof LayoutDashboard; label: string; onClick: () => void
  danger?: boolean; accent?: boolean; disabled?: boolean; spin?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 12px',
        borderRadius: 10,
        border: 'none',
        background: 'transparent',
        color: danger ? '#DC2626' : accent ? 'var(--rd-accent-2)' : 'var(--rd-text)',
        fontSize: 13, fontWeight: accent ? 600 : 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        textAlign: 'left',
        transition: 'background .15s',
        fontFamily: 'inherit',
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={e => !disabled && (e.currentTarget.style.background = danger
        ? 'rgba(220, 38, 38, .08)' : accent ? 'rgba(255, 141, 26, .10)' : 'rgba(15, 18, 36, .04)')}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <Icon size={14} className={spin ? 'animate-spin' : ''} /> {label}
    </button>
  )
}
