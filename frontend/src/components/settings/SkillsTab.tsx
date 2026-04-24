import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Save, X, Loader } from 'lucide-react'
import { listSkills, createSkill, updateSkill, deleteSkill, type Skill } from '../../api/client'

const gradientStyle = { background: 'linear-gradient(135deg, #FF8D1A, #FF7A00)' }
const btnPrimary = 'flex items-center gap-1.5 px-3 py-1.5 text-white text-sm rounded-lg disabled:opacity-50 transition-all'
const btnSecondary = 'flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors'
const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-300'

interface FormState { name: string; description: string; prompt_snippet: string }
const EMPTY: FormState = { name: '', description: '', prompt_snippet: '' }

export default function SkillsTab() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<string | null>(null) // skill id or 'new'
  const [form, setForm] = useState<FormState>(EMPTY)
  const [error, setError] = useState('')

  const { data: skills, isLoading } = useQuery({ queryKey: ['skills'], queryFn: listSkills })

  const saveMut = useMutation({
    mutationFn: () => {
      if (editing === 'new') return createSkill({ name: form.name, description: form.description || undefined, prompt_snippet: form.prompt_snippet })
      return updateSkill(editing!, { name: form.name, description: form.description || undefined, prompt_snippet: form.prompt_snippet })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['skills'] }); setEditing(null); setError('') },
    onError: () => setError('保存失败，请重试'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteSkill(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['skills'] }),
  })

  const startNew = () => { setEditing('new'); setForm(EMPTY); setError('') }
  const startEdit = (s: Skill) => { setEditing(s.id); setForm({ name: s.name, description: s.description ?? '', prompt_snippet: s.prompt_snippet }); setError('') }
  const cancel = () => { setEditing(null); setError('') }

  const handleSave = () => {
    if (!form.name.trim() || !form.prompt_snippet.trim()) { setError('名称和提示词片段不能为空'); return }
    saveMut.mutate()
  }

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`确认删除技能「${name}」？`)) deleteMut.mutate(id)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader size={20} className="animate-spin mr-2" /> 加载中...
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-800">技能库</h2>
          <p className="text-xs text-gray-400 mt-0.5">定义可复用的提示词片段，供输出智能体选用</p>
        </div>
        <button
          onClick={() => { startNew(); }}
          disabled={editing === 'new'}
          className={btnPrimary}
          style={gradientStyle}
        >
          <Plus size={14} /> 新增技能
        </button>
      </div>

      {/* Add form */}
      {editing === 'new' && (
        <div className="px-6 py-4 border-b border-gray-100 bg-orange-50/40">
          <h3 className="text-sm font-medium text-gray-700 mb-3">新增技能</h3>
          {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">技能名称 *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="例：CRM实施最佳实践" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">描述（可选）</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={inputCls} placeholder="简要说明此技能的用途" />
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">提示词片段 *</label>
            <textarea value={form.prompt_snippet} onChange={e => setForm(f => ({ ...f, prompt_snippet: e.target.value }))} rows={4} className={`${inputCls} font-mono`} placeholder="此技能注入到输出智能体的提示词片段…" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={cancel} className={btnSecondary}><X size={13} /> 取消</button>
            <button onClick={handleSave} disabled={saveMut.isPending} className={btnPrimary} style={gradientStyle}>
              <Save size={13} /> {saveMut.isPending ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      )}

      {/* Skills list */}
      {(!skills || skills.length === 0) && editing !== 'new' ? (
        <div className="px-6 py-12 text-center text-sm text-gray-400">
          暂无技能，点击「新增技能」开始创建
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {(skills ?? []).map(s => (
            <div key={s.id}>
              {editing === s.id ? (
                // Inline edit form
                <div className="px-6 py-4 bg-orange-50/40">
                  {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">技能名称 *</label>
                      <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">描述</label>
                      <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={inputCls} />
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="block text-xs text-gray-500 mb-1">提示词片段 *</label>
                    <textarea value={form.prompt_snippet} onChange={e => setForm(f => ({ ...f, prompt_snippet: e.target.value }))} rows={4} className={`${inputCls} font-mono`} />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={cancel} className={btnSecondary}><X size={13} /> 取消</button>
                    <button onClick={handleSave} disabled={saveMut.isPending} className={btnPrimary} style={gradientStyle}>
                      <Save size={13} /> {saveMut.isPending ? '保存中…' : '保存'}
                    </button>
                  </div>
                </div>
              ) : (
                // Row
                <div className="px-6 py-4 flex items-start gap-4 hover:bg-gray-50/60 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-800">{s.name}</span>
                      {s.description && <span className="text-xs text-gray-400">{s.description}</span>}
                    </div>
                    <pre className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 font-mono whitespace-pre-wrap line-clamp-3 border border-gray-100">{s.prompt_snippet}</pre>
                  </div>
                  <div className="flex gap-1 shrink-0 pt-0.5">
                    <button onClick={() => startEdit(s)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDelete(s.id, s.name)} disabled={deleteMut.isPending} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
