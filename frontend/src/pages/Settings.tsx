import { useState } from 'react'
import { Settings as SettingsIcon, Cpu, GitBranch, FileCode, KeyRound, Users, Wand2, Bot, ScrollText } from 'lucide-react'
import clsx from 'clsx'
import ModelsTab       from '../components/settings/ModelsTab'
import RoutingTab      from '../components/settings/RoutingTab'
import PromptsTab      from '../components/settings/PromptsTab'
import ApiKeysTab      from '../components/settings/ApiKeysTab'
import UsersTab        from '../components/settings/UsersTab'
import SkillsTab       from '../components/settings/SkillsTab'
import OutputAgentsTab from '../components/settings/OutputAgentsTab'
import CallLogsTab     from '../components/settings/CallLogsTab'

const tabs = [
  { key: 'models',        label: '模型管理',     icon: Cpu },
  { key: 'routing',       label: '路由与参数',   icon: GitBranch },
  { key: 'prompts',       label: '提示词',       icon: FileCode },
  { key: 'api-keys',      label: 'API 密钥',     icon: KeyRound },
  { key: 'users',         label: '用户管理',     icon: Users },
  { key: 'skills',        label: '技能库',       icon: Wand2 },
  { key: 'output-agents', label: '输出智能体',   icon: Bot },
  { key: 'call-logs',     label: '调用日志',     icon: ScrollText },
] as const

type TabKey = (typeof tabs)[number]['key']

export default function Settings() {
  const [active, setActive] = useState<TabKey>('models')

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <SettingsIcon size={22} className="text-gray-400" />
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">系统设置</h1>
      </div>
      <p className="text-xs md:text-sm text-gray-500 mb-6 md:mb-8">管理模型、路由规则、提示词模板与 API 密钥</p>

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
      {active === 'models'        && <ModelsTab />}
      {active === 'routing'       && <RoutingTab />}
      {active === 'prompts'       && <PromptsTab />}
      {active === 'api-keys'      && <ApiKeysTab />}
      {active === 'users'         && <UsersTab />}
      {active === 'skills'        && <SkillsTab />}
      {active === 'output-agents' && <OutputAgentsTab />}
      {active === 'call-logs'     && <CallLogsTab />}
    </div>
  )
}
