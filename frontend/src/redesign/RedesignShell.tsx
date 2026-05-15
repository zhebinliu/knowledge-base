import { useRef } from 'react'
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom'
import {
  LayoutDashboard, MessageSquare, FileText, Folder, Sparkles, Search,
  Lightbulb, ClipboardList,
} from 'lucide-react'
import LiquidGlass from 'liquid-glass-react'
import MeshOrbs from './components/MeshOrb'
import './redesign.css'

const NAV = [
  { to: '/redesign/console',   label: '工作台', icon: Sparkles },
  { to: '/redesign/qa',        label: '问答',   icon: MessageSquare },
  { to: '/redesign/documents', label: '文档',   icon: FileText },
  { to: '/redesign/projects',  label: '项目',   icon: Folder },
  { to: '/redesign/insight',   label: '洞察',   icon: Lightbulb },
  { to: '/redesign/survey',    label: '调研',   icon: ClipboardList },
]

const SLOT = {
  dock:    { width: 520, height: 64 },
  orb:     { width: 56,  height: 56 },
  floatbar:{ width: 280, height: 46 },
}

// 玻璃感统一参数 — 浅色模式 (overLight=true) 让 LiquidGlass 内部用更深的兜底色,
// 在浅色背景下也保持可读对比;displacement 略降避免内容字符被折射拉糊
const GLASS = {
  dock: {
    blurAmount: 0.14,
    saturation: 150,
    aberrationIntensity: 2,
    elasticity: 0.20,
    displacementScale: 40,
    overLight: true,
  },
  orb: {
    blurAmount: 0.14,
    saturation: 150,
    aberrationIntensity: 2,
    elasticity: 0.35,
    displacementScale: 55,
    overLight: true,
  },
  floatbar: {
    blurAmount: 0.12,
    saturation: 140,
    aberrationIntensity: 2,
    elasticity: 0.18,
    displacementScale: 35,
    overLight: true,
  },
}

export default function RedesignShell() {
  const location = useLocation()
  const shellRef = useRef<HTMLDivElement>(null)

  return (
    <div className="rd-root" ref={shellRef}>
      <MeshOrbs />
      {/* 顶/底渐变 scrim:保证 dock/topbar 上的文字始终可读 */}
      <div className="rd-floatbar-scrim" />
      <div className="rd-dock-scrim" />

      <div className="rd-shell">
        {/* 顶栏 */}
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
                <Link to="/redesign/console" className="rd-floatbar-logo" aria-label="首页">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
                  </svg>
                </Link>
                <span>实施知识 · KB</span>
                <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,.15)', margin: '0 4px' }} />
                <NavLink
                  to="/redesign/dashboard"
                  className={({ isActive }) => `rd-floatbar-link${isActive ? ' is-active' : ''}`}
                >
                  <LayoutDashboard size={12} />
                  总览
                </NavLink>
              </div>
            </LiquidGlass>
          </div>
        </div>

        <main key={location.pathname} style={{ flex: 1, position: 'relative' }}>
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
                {NAV.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to.endsWith('/console')}
                    className={({ isActive }) => `rd-dock-item${isActive ? ' is-active' : ''}`}
                  >
                    <Icon size={17} strokeWidth={1.9} />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </nav>
            </LiquidGlass>
          </div>

          <div className="rd-glass-slot" style={SLOT.orb}>
            <LiquidGlass
              cornerRadius={999}
              padding="14px"
              {...GLASS.orb}
              mouseContainer={shellRef}
              style={{ position: 'absolute', top: '50%', left: '50%' }}
              onClick={() => { /* TODO 搜索 */ }}
            >
              <Search
                size={20}
                color="#FFFFFF"
                strokeWidth={2.4}
                style={{ filter: 'drop-shadow(0 1px 2px rgba(255,255,255,0.10))' }}
              />
            </LiquidGlass>
          </div>

          <div className="rd-glass-slot" style={SLOT.orb}>
            <LiquidGlass
              cornerRadius={999}
              padding="14px"
              {...GLASS.orb}
              mouseContainer={shellRef}
              style={{ position: 'absolute', top: '50%', left: '50%' }}
              onClick={() => { /* TODO 账户 */ }}
            >
              <span style={{
                fontSize: 14,
                fontWeight: 800,
                color: '#fff',
                display: 'inline-block',
                width: 20,
                height: 20,
                lineHeight: '20px',
                textAlign: 'center',
                background: 'linear-gradient(135deg, var(--rd-accent), var(--rd-accent-2))',
                borderRadius: '50%',
                boxShadow: '0 2px 8px rgba(255,141,26,.45), inset 0 1px 0 rgba(255,255,255,0.05)',
                letterSpacing: '-0.02em',
              }}>Z</span>
            </LiquidGlass>
          </div>
        </div>
      </div>
    </div>
  )
}
