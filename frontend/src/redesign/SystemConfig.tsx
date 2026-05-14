/**
 * NewSystemConfig — 系统配置(Liquid Glass tab 外壳,内嵌老 Tab)
 */
import { useState } from 'react'
import { Sliders, FileCode, Wand2, Bot, Layers, type LucideIcon } from 'lucide-react'
import StageFlowTab    from '../components/system-config/StageFlowTab'
import PromptsTab      from '../components/settings/PromptsTab'
import SkillsTab       from '../components/settings/SkillsTab'
import OutputAgentsTab from '../components/settings/OutputAgentsTab'
import GlowCard from './components/GlowCard'

const TABS: Array<{ key: string; label: string; Icon: LucideIcon; Comp: React.FC }> = [
  { key: 'stage-flow',    label: '项目流程',   Icon: Layers,   Comp: StageFlowTab },
  { key: 'prompts',       label: '提示词',     Icon: FileCode, Comp: PromptsTab },
  { key: 'skills',        label: '技能库',     Icon: Wand2,    Comp: SkillsTab },
  { key: 'output-agents', label: '输出智能体', Icon: Bot,      Comp: OutputAgentsTab },
]

export default function NewSystemConfig() {
  const [active, setActive] = useState(TABS[0].key)
  const ActiveTab = TABS.find(t => t.key === active)?.Comp ?? TABS[0].Comp
  return (
    <div className="rd-page" style={{ maxWidth: 1100 }}>
      <div className="rd-stagger" style={{ marginBottom: 22 }}>
        <span className="rd-chip is-active" style={{ marginBottom: 10 }}>
          <Sliders size={11} /> 系统配置
        </span>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--rd-text)', letterSpacing: '-0.02em', margin: 0 }}>
          系统配置
        </h1>
        <p style={{ fontSize: 13, color: 'var(--rd-text-2)', margin: '4px 0 0' }}>
          业务行为类配置 — 项目流程 / 提示词 / 技能库 / 输出智能体
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
