/**
 * NewSettings — 系统设置(Liquid Glass tab 外壳,内嵌老 Tab)
 * 功能 100% 等价 — 5 个 Tab 组件 import 老的不动
 */
import { useState } from 'react'
import { Cpu, GitBranch, KeyRound, Users, ScrollText, Settings as SettingsIcon, type LucideIcon } from 'lucide-react'
import ModelsTab   from '../components/settings/ModelsTab'
import RoutingTab  from '../components/settings/RoutingTab'
import ApiKeysTab  from '../components/settings/ApiKeysTab'
import UsersTab    from '../components/settings/UsersTab'
import CallLogsTab from '../components/settings/CallLogsTab'
// FeishuTab 已移至个人设置 /personal-settings — 每个用户独立配置
import GlowCard from './components/GlowCard'

const TABS: Array<{ key: string; label: string; Icon: LucideIcon; Comp: React.FC }> = [
  { key: 'models',    label: '模型管理',   Icon: Cpu,        Comp: ModelsTab },
  { key: 'routing',   label: '路由与参数', Icon: GitBranch,  Comp: RoutingTab },
  { key: 'api-keys',  label: 'API 密钥',   Icon: KeyRound,   Comp: ApiKeysTab },
  { key: 'users',     label: '用户管理',   Icon: Users,      Comp: UsersTab },
  { key: 'call-logs', label: '调用日志',   Icon: ScrollText, Comp: CallLogsTab },
]

export default function NewSettings() {
  const [active, setActive] = useState(TABS[0].key)
  const ActiveTab = TABS.find(t => t.key === active)?.Comp ?? TABS[0].Comp
  return (
    <div className="rd-page" style={{ maxWidth: 1100 }}>
      <div className="rd-stagger" style={{ marginBottom: 22 }}>
        <span className="rd-chip is-active" style={{ marginBottom: 10 }}>
          <SettingsIcon size={11} /> 系统设置
        </span>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--rd-text)', letterSpacing: '-0.02em', margin: 0 }}>
          系统设置
        </h1>
        <p style={{ fontSize: 13, color: 'var(--rd-text-2)', margin: '4px 0 0' }}>
          运维 / 接入 / 用户管理 — 业务行为类配置在「系统配置」
        </p>
      </div>

      <GlowCard style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ borderBottom: '1px solid var(--rd-line)', display: 'flex', overflowX: 'auto' }}>
          {TABS.map(t => {
            const Icon = t.Icon
            const isActive = t.key === active
            return (
              <button
                key={t.key}
                onClick={() => setActive(t.key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '13px 22px', fontSize: 13, fontWeight: isActive ? 700 : 500,
                  color: isActive ? 'var(--rd-accent-2)' : 'var(--rd-text-2)',
                  background: isActive
                    ? 'linear-gradient(180deg, rgba(255,141,26,.10) 0%, rgba(255,141,26,.02) 100%)'
                    : 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${isActive ? 'var(--rd-accent)' : 'transparent'}`,
                  marginBottom: -1, cursor: 'pointer', whiteSpace: 'nowrap',
                  fontFamily: 'inherit', transition: 'all .2s',
                }}
              >
                <Icon size={13} /> {t.label}
              </button>
            )
          })}
        </div>
        <div style={{ padding: '20px 24px' }}>
          <ActiveTab />
        </div>
      </GlowCard>
    </div>
  )
}
