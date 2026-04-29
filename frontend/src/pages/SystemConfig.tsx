/**
 * 系统配置 — 业务行为类配置(影响产物形态)。
 * 区别于「系统设置」(运维 / 接入 / 用户)。
 *
 * Tabs:
 *  - 项目流程(stage-flow)— 拖排 / 启停 / 编辑 / 新增 项目阶段
 *  - 提示词
 *  - 技能库
 *  - 输出智能体
 */
import { useState } from 'react'
import { Sliders, FileCode, Wand2, Bot, Layers } from 'lucide-react'
import clsx from 'clsx'
import StageFlowTab    from '../components/system-config/StageFlowTab'
import PromptsTab      from '../components/settings/PromptsTab'
import SkillsTab       from '../components/settings/SkillsTab'
import OutputAgentsTab from '../components/settings/OutputAgentsTab'

const tabs = [
  { key: 'stage-flow',    label: '项目流程',     icon: Layers },
  { key: 'prompts',       label: '提示词',       icon: FileCode },
  { key: 'skills',        label: '技能库',       icon: Wand2 },
  { key: 'output-agents', label: '输出智能体',   icon: Bot },
] as const

type TabKey = (typeof tabs)[number]['key']

export default function SystemConfig() {
  const [active, setActive] = useState<TabKey>('stage-flow')

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Sliders size={22} className="text-gray-400" />
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">系统配置</h1>
      </div>
      <p className="text-xs md:text-sm text-gray-500 mb-6 md:mb-8">
        项目流程 · 提示词 · 技能库 · 输出智能体(影响"产物长什么样"的业务规则)
      </p>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit max-w-full overflow-x-auto">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActive(key)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap',
              active === key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {active === 'stage-flow'    && <StageFlowTab />}
      {active === 'prompts'       && <PromptsTab />}
      {active === 'skills'        && <SkillsTab />}
      {active === 'output-agents' && <OutputAgentsTab />}
    </div>
  )
}
