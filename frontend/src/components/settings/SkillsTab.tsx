import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Save, X } from 'lucide-react'
import { listSkills, createSkill, updateSkill, deleteSkill, type Skill } from '../../api/client'

interface FormState { name: string; description: string; prompt_snippet: string }
const EMPTY: FormState = { name: '', description: '', prompt_snippet: '' }

export default function SkillsTab() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null) // skill id or 'new'
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      setSkills(await listSkills())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const startNew = () => { setEditing('new'); setForm(EMPTY); setError('') }
  const startEdit = (s: Skill) => { setEditing(s.id); setForm({ name: s.name, description: s.description ?? '', prompt_snippet: s.prompt_snippet }); setError('') }
  const cancel = () => { setEditing(null); setError('') }

  const save = async () => {
    if (!form.name.trim() || !form.prompt_snippet.trim()) { setError('名称和提示词片段不能为空'); return }
    setSaving(true)
    try {
      if (editing === 'new') {
        await createSkill({ name: form.name, description: form.description || undefined, prompt_snippet: form.prompt_snippet })
      } else if (editing) {
        await updateSkill(editing, { name: form.name, description: form.description || undefined, prompt_snippet: form.prompt_snippet })
      }
      await load()
      setEditing(null)
    } catch {
      setError('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const del = async (id: string, name: string) => {
    if (!confirm(`确认删除技能「${name}」？`)) return
    await deleteSkill(id)
    await load()
  }

  if (loading) return <div className="text-sm text-gray-400 py-4">加载中…</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="font-semibold text-gray-800">技能库</h2>
          <p className="text-xs text-gray-500 mt-0.5">定义可复用的提示词片段，供输出智能体选用</p>
        </div>
        {!editing && (
          <button onClick={startNew} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Plus size={14} /> 新增技能
          </button>
        )}
      </div>

      {editing && (
        <div className="border border-blue-200 rounded-lg p-4 bg-blue-50 space-y-3">
          <h3 className="text-sm font-medium text-gray-700">{editing === 'new' ? '新增技能' : '编辑技能'}</h3>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div>
            <label className="block text-xs text-gray-600 mb-1">技能名称 *</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="例：CRM实施最佳实践"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">描述（可选）</label>
            <input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="简要说明此技能的用途"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">提示词片段 *</label>
            <textarea
              value={form.prompt_snippet}
              onChange={e => setForm(f => ({ ...f, prompt_snippet: e.target.value }))}
              rows={5}
              className="w-full border rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="输入此技能注入到输出智能体的提示词片段…"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={cancel} className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 border rounded hover:bg-gray-50"><X size={13} /> 取消</button>
            <button onClick={save} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              <Save size={13} /> {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      )}

      {skills.length === 0 && !editing ? (
        <div className="text-sm text-gray-400 py-6 text-center border-2 border-dashed rounded-lg">暂无技能，点击「新增技能」开始创建</div>
      ) : (
        <div className="space-y-2">
          {skills.map(s => (
            <div key={s.id} className="border rounded-lg p-3 bg-white flex gap-3 items-start">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-gray-800">{s.name}</span>
                  {s.description && <span className="text-xs text-gray-400">{s.description}</span>}
                </div>
                <pre className="mt-1 text-xs text-gray-500 bg-gray-50 rounded p-2 overflow-x-auto whitespace-pre-wrap line-clamp-3 font-mono">{s.prompt_snippet}</pre>
              </div>
              {editing !== s.id && (
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => startEdit(s)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded"><Pencil size={14} /></button>
                  <button onClick={() => del(s.id, s.name)} className="p-1.5 text-gray-400 hover:text-red-600 rounded"><Trash2 size={14} /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
