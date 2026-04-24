import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Save, X, Loader, Wand2, Eye, Code } from 'lucide-react'
import { listSkills, createSkill, updateSkill, deleteSkill, type Skill } from '../../api/client'
import MarkdownView from '../MarkdownView'

const gradientStyle = { background: 'linear-gradient(135deg, #FF8D1A, #FF7A00)' }
const btnPrimary = 'flex items-center gap-1.5 px-3 py-1.5 text-white text-sm rounded-lg disabled:opacity-50 transition-all'
const btnSecondary = 'flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors'
const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-300'

interface FormState { name: string; description: string; prompt_snippet: string; questions_json: string }
const EMPTY: FormState = { name: '', description: '', prompt_snippet: '', questions_json: '[]' }

export default function SkillsTab() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<'view' | 'edit' | 'new'>('view')
  const [form, setForm] = useState<FormState>(EMPTY)
  const [error, setError] = useState('')
  const [editPreview, setEditPreview] = useState(false)

  const { data: skills, isLoading } = useQuery({ queryKey: ['skills'], queryFn: listSkills })

  const selected = skills?.find(s => s.id === selectedId) ?? null

  // Auto-select first skill
  useEffect(() => {
    if (!selectedId && skills && skills.length > 0) setSelectedId(skills[0].id)
  }, [skills, selectedId])

  const saveMut = useMutation({
    mutationFn: () => {
      let questions: Skill['questions'] = []
      try {
        const parsed = JSON.parse(form.questions_json || '[]')
        if (!Array.isArray(parsed)) throw new Error('not array')
        questions = parsed
      } catch {
        throw new Error('题库 JSON 格式错误')
      }
      const body = {
        name: form.name,
        description: form.description || undefined,
        prompt_snippet: form.prompt_snippet,
        questions,
      }
      if (mode === 'new') return createSkill(body)
      return updateSkill(selectedId!, body)
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['skills'] })
      setMode('view')
      setError('')
      if (data && mode === 'new') setSelectedId(data.id)
    },
    onError: (e: Error) => setError(e.message || '保存失败，请重试'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteSkill(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills'] })
      setSelectedId(null)
    },
  })

  const startNew = () => {
    setMode('new')
    setForm(EMPTY)
    setError('')
    setEditPreview(false)
  }

  const startEdit = () => {
    if (!selected) return
    setForm({
      name: selected.name,
      description: selected.description ?? '',
      prompt_snippet: selected.prompt_snippet,
      questions_json: JSON.stringify(selected.questions ?? [], null, 2),
    })
    setMode('edit')
    setError('')
    setEditPreview(false)
  }

  const cancel = () => {
    setMode('view')
    setError('')
  }

  const handleSave = () => {
    if (!form.name.trim() || !form.prompt_snippet.trim()) {
      setError('名称和提示词片段不能为空')
      return
    }
    saveMut.mutate()
  }

  const handleDelete = () => {
    if (!selected) return
    if (window.confirm(`确认删除技能「${selected.name}」？`)) deleteMut.mutate(selected.id)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader size={20} className="animate-spin mr-2" /> 加载中...
      </div>
    )
  }

  const showForm = mode === 'edit' || mode === 'new'

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-800">技能库</h2>
          <p className="text-xs text-gray-400 mt-0.5">定义可复用的提示词片段，供输出智能体选用</p>
        </div>
        <button
          onClick={startNew}
          disabled={mode === 'new'}
          className={btnPrimary}
          style={gradientStyle}
        >
          <Plus size={14} /> 新增技能
        </button>
      </div>

      <div className="flex" style={{ minHeight: 560 }}>
        {/* Left: skill list */}
        <div className="w-64 shrink-0 border-r border-gray-100 overflow-y-auto" style={{ maxHeight: 720 }}>
          {(!skills || skills.length === 0) && mode !== 'new' ? (
            <div className="px-4 py-8 text-center text-xs text-gray-400">
              暂无技能
            </div>
          ) : (
            <div className="py-2">
              {(skills ?? []).map(s => (
                <button
                  key={s.id}
                  onClick={() => { setSelectedId(s.id); setMode('view'); setError('') }}
                  className={`w-full text-left px-4 py-2.5 border-l-2 transition-colors ${
                    selectedId === s.id && mode !== 'new'
                      ? 'bg-orange-50/60 border-l-orange-400'
                      : 'border-l-transparent hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <Wand2 size={12} className={selectedId === s.id && mode !== 'new' ? 'text-orange-500' : 'text-gray-400'} />
                    <span className={`text-sm truncate ${selectedId === s.id && mode !== 'new' ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
                      {s.name}
                    </span>
                  </div>
                  {s.description && (
                    <p className="text-xs text-gray-400 line-clamp-1 ml-5">{s.description}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: detail / form */}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {showForm ? (
            <div className="flex-1 flex flex-col px-6 py-4 bg-orange-50/30">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                {mode === 'new' ? '新增技能' : '编辑技能'}
              </h3>
              {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">技能名称 *</label>
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className={inputCls}
                    placeholder="例：CRM实施最佳实践"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">描述（可选）</label>
                  <input
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    className={inputCls}
                    placeholder="简要说明此技能的用途"
                  />
                </div>
              </div>
              <div className="flex-1 flex flex-col mb-3 min-h-0">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs text-gray-500">提示词片段 *</label>
                  <button
                    type="button"
                    onClick={() => setEditPreview(p => !p)}
                    className="flex items-center gap-1 px-2 py-0.5 text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
                  >
                    {editPreview ? <><Code size={12} /> 编辑</> : <><Eye size={12} /> 预览</>}
                  </button>
                </div>
                {editPreview ? (
                  <div
                    className="flex-1 overflow-y-auto bg-white border border-gray-200 rounded-lg px-4 py-3"
                    style={{ minHeight: 400 }}
                  >
                    <MarkdownView content={form.prompt_snippet || '_（空）_'} size="sm" toolbar={false} />
                  </div>
                ) : (
                  <textarea
                    value={form.prompt_snippet}
                    onChange={e => setForm(f => ({ ...f, prompt_snippet: e.target.value }))}
                    className={`${inputCls} font-mono flex-1 resize-none`}
                    style={{ minHeight: 400 }}
                    placeholder="输入此技能注入到输出智能体的提示词片段…"
                  />
                )}
                <p className="text-[11px] text-gray-400 mt-1">
                  当前 {form.prompt_snippet.length} 字符
                </p>
              </div>
              <div className="mb-3">
                <label className="block text-xs text-gray-500 mb-1">
                  题库（JSON 数组，可选）
                  <span className="text-gray-400 ml-2">
                    结构：[{'{'} key, stage?, question, hint? {'}'}]；非空则输出智能体会走访谈式生成
                  </span>
                </label>
                <textarea
                  value={form.questions_json}
                  onChange={e => setForm(f => ({ ...f, questions_json: e.target.value }))}
                  className={`${inputCls} font-mono resize-y`}
                  style={{ minHeight: 160 }}
                  placeholder='[{"key":"goal","stage":"目标","question":"项目目标是什么？"}]'
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={cancel} className={btnSecondary}><X size={13} /> 取消</button>
                <button onClick={handleSave} disabled={saveMut.isPending} className={btnPrimary} style={gradientStyle}>
                  <Save size={13} /> {saveMut.isPending ? '保存中…' : '保存'}
                </button>
              </div>
            </div>
          ) : selected ? (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Detail header */}
              <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-gray-800 truncate">{selected.name}</h3>
                    <span className="text-xs text-gray-400 shrink-0">
                      · {selected.prompt_snippet.length} 字符 · {selected.questions?.length ?? 0} 题
                    </span>
                  </div>
                  {selected.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{selected.description}</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0 ml-3">
                  <button
                    onClick={startEdit}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <Pencil size={12} /> 编辑
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleteMut.isPending}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 size={12} /> 删除
                  </button>
                </div>
              </div>

              {/* Prompt content */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-100">
                  <MarkdownView content={selected.prompt_snippet} size="sm" />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
              {skills && skills.length > 0 ? '从左侧选择一个技能' : '点击"新增技能"开始创建'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
