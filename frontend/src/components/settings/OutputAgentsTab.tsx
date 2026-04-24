import { useState, useEffect, useMemo } from 'react'
import { Save, Loader, Bot, Check } from 'lucide-react'
import { listOutputAgents, updateOutputAgent, listSkills, type OutputAgentConfig, type Skill } from '../../api/client'

const gradientStyle = { background: 'linear-gradient(135deg, #FF8D1A, #FF7A00)' }
const btnPrimary = 'flex items-center gap-1.5 px-3 py-1.5 text-white text-sm rounded-lg disabled:opacity-50 transition-all'
const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-300'

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
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listOutputAgents(), listSkills()]).then(([cfgs, skls]) => {
      setConfigs(cfgs)
      setSkills(skls)
      const init: Record<string, AgentFormState> = {}
      cfgs.forEach(c => { init[c.key] = { prompt: c.prompt, skill_ids: c.skill_ids } })
      setForms(init)
      if (cfgs.length > 0) setSelectedKey(cfgs[0].key)
    }).finally(() => setLoading(false))
  }, [])

  const selected = useMemo(() => configs.find(c => c.key === selectedKey) ?? null, [configs, selectedKey])
  const form = selectedKey ? forms[selectedKey] ?? { prompt: '', skill_ids: [] } : { prompt: '', skill_ids: [] }

  const toggleSkill = (skillId: string) => {
    if (!selectedKey) return
    setForms(f => {
      const cur = f[selectedKey]?.skill_ids ?? []
      const next = cur.includes(skillId) ? cur.filter(id => id !== skillId) : [...cur, skillId]
      return { ...f, [selectedKey]: { ...f[selectedKey], skill_ids: next } }
    })
  }

  const updatePrompt = (prompt: string) => {
    if (!selectedKey) return
    setForms(f => ({ ...f, [selectedKey]: { ...f[selectedKey], prompt } }))
  }

  const save = async () => {
    if (!selectedKey) return
    setSaving(true)
    try {
      await updateOutputAgent(selectedKey, forms[selectedKey])
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader size={20} className="animate-spin mr-2" /> 加载中...
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800">输出智能体配置</h2>
        <p className="text-xs text-gray-400 mt-0.5">为每个输出类型配置系统提示词和要启用的技能</p>
      </div>

      <div className="flex" style={{ minHeight: 560 }}>
        {/* Left: agent list */}
        <div className="w-64 shrink-0 border-r border-gray-100 overflow-y-auto" style={{ maxHeight: 720 }}>
          <div className="py-2">
            {configs.map(c => {
              const active = selectedKey === c.key
              return (
                <button
                  key={c.key}
                  onClick={() => setSelectedKey(c.key)}
                  className={`w-full text-left px-4 py-2.5 border-l-2 transition-colors ${
                    active
                      ? 'bg-orange-50/60 border-l-orange-400'
                      : 'border-l-transparent hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <Bot size={12} className={active ? 'text-orange-500' : 'text-gray-400'} />
                    <span className={`text-sm truncate ${active ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
                      {AGENT_LABELS[c.key] ?? c.key}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 line-clamp-1 ml-5">{AGENT_DESCS[c.key]}</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Right: detail / form */}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {selected ? (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Detail header */}
              <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-gray-800 truncate">{AGENT_LABELS[selected.key] ?? selected.key}</h3>
                    <span className="text-xs text-gray-400 shrink-0">
                      · {form.prompt.length} 字符 · {form.skill_ids.length} 技能
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{AGENT_DESCS[selected.key]}</p>
                </div>
                <button
                  onClick={save}
                  disabled={saving}
                  className={btnPrimary}
                  style={gradientStyle}
                >
                  {saved ? <Check size={13} /> : <Save size={13} />}
                  {saved ? '已保存' : saving ? '保存中…' : '保存'}
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">系统提示词</label>
                  <textarea
                    value={form.prompt}
                    onChange={e => updatePrompt(e.target.value)}
                    className={`${inputCls} font-mono resize-none`}
                    style={{ minHeight: 360 }}
                    placeholder="输入此智能体的系统提示词…"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">当前 {form.prompt.length} 字符</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    启用技能（可多选）
                  </label>
                  {skills.length === 0 ? (
                    <p className="text-xs text-gray-400">暂无技能，请先到"技能库"创建。</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {skills.map(s => {
                        const on = form.skill_ids.includes(s.id)
                        return (
                          <button
                            key={s.id}
                            onClick={() => toggleSkill(s.id)}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                              on
                                ? 'bg-orange-100 text-orange-700 border-orange-300'
                                : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            {s.name}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
              从左侧选择一个智能体
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
