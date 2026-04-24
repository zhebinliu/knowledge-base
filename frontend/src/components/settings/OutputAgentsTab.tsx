import { useState, useEffect } from 'react'
import { Save, ChevronDown, ChevronUp } from 'lucide-react'
import { listOutputAgents, updateOutputAgent, listSkills, type OutputAgentConfig, type Skill } from '../../api/client'

const AGENT_LABELS: Record<string, string> = {
  kickoff_pptx: '启动会 PPT',
  survey: '调研问卷',
  insight: '洞察报告',
}

const AGENT_DESCS: Record<string, string> = {
  kickoff_pptx: '生成项目启动会演示文稿内容框架',
  survey: '生成实施调研问卷',
  insight: '生成项目洞察与分析报告',
}

interface AgentFormState { prompt: string; skill_ids: string[] }

export default function OutputAgentsTab() {
  const [configs, setConfigs] = useState<OutputAgentConfig[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [forms, setForms] = useState<Record<string, AgentFormState>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ kickoff_pptx: true })

  useEffect(() => {
    Promise.all([listOutputAgents(), listSkills()]).then(([cfgs, skls]) => {
      setConfigs(cfgs)
      setSkills(skls)
      const init: Record<string, AgentFormState> = {}
      cfgs.forEach(c => { init[c.key] = { prompt: c.prompt, skill_ids: c.skill_ids } })
      setForms(init)
    }).finally(() => setLoading(false))
  }, [])

  const toggle = (key: string) => setExpanded(e => ({ ...e, [key]: !e[key] }))

  const toggleSkill = (agentKey: string, skillId: string) => {
    setForms(f => {
      const cur = f[agentKey]?.skill_ids ?? []
      const next = cur.includes(skillId) ? cur.filter(id => id !== skillId) : [...cur, skillId]
      return { ...f, [agentKey]: { ...f[agentKey], skill_ids: next } }
    })
  }

  const save = async (key: string) => {
    setSaving(s => ({ ...s, [key]: true }))
    try {
      await updateOutputAgent(key, forms[key])
      setSaved(s => ({ ...s, [key]: true }))
      setTimeout(() => setSaved(s => ({ ...s, [key]: false })), 2000)
    } finally {
      setSaving(s => ({ ...s, [key]: false }))
    }
  }

  if (loading) return <div className="text-sm text-gray-400 py-4">加载中…</div>

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-gray-800">输出智能体配置</h2>
        <p className="text-xs text-gray-500 mt-0.5">为每个输出类型配置系统提示词和要启用的技能</p>
      </div>

      {configs.map(c => {
        const form = forms[c.key] ?? { prompt: '', skill_ids: [] }
        const isExpanded = expanded[c.key]
        return (
          <div key={c.key} className="border rounded-lg overflow-hidden">
            <button
              onClick={() => toggle(c.key)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
            >
              <div>
                <span className="font-medium text-sm text-gray-800">{AGENT_LABELS[c.key] ?? c.key}</span>
                <span className="ml-2 text-xs text-gray-400">{AGENT_DESCS[c.key]}</span>
              </div>
              {isExpanded ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
            </button>

            {isExpanded && (
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">系统提示词</label>
                  <textarea
                    value={form.prompt}
                    onChange={e => setForms(f => ({ ...f, [c.key]: { ...f[c.key], prompt: e.target.value } }))}
                    rows={5}
                    className="w-full border rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>

                {skills.length > 0 && (
                  <div>
                    <label className="block text-xs text-gray-600 mb-2">启用技能（可多选）</label>
                    <div className="flex flex-wrap gap-2">
                      {skills.map(s => {
                        const selected = form.skill_ids.includes(s.id)
                        return (
                          <button
                            key={s.id}
                            onClick={() => toggleSkill(c.key, s.id)}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${selected ? 'bg-blue-100 text-blue-700 border border-blue-300' : 'bg-gray-100 text-gray-600 border border-gray-200 hover:border-gray-300'}`}
                          >
                            {s.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    onClick={() => save(c.key)}
                    disabled={saving[c.key]}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Save size={13} />
                    {saved[c.key] ? '已保存 ✓' : saving[c.key] ? '保存中…' : '保存'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
