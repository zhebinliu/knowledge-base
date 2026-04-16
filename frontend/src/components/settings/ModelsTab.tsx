import { useState, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getModels, createModel, updateModel, deleteModel, type ModelEntry } from '../../api/client'
import { Pencil, Trash2, Save, X, Loader, Plus } from 'lucide-react'

const EMPTY_FORM = { key: '', provider: '', api_base: '', model_id: '', api_key_env: '', max_context: 128000, best_for: [] as string[] }

export default function ModelsTab() {
  const qc = useQueryClient()
  const { data: models, isLoading } = useQuery({ queryKey: ['models'], queryFn: getModels })

  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<ModelEntry>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState(EMPTY_FORM)

  const saveMut = useMutation({
    mutationFn: ({ key, body }: { key: string; body: Partial<ModelEntry> }) => updateModel(key, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['models'] }); setEditingKey(null) },
    onError: (e: any) => alert(`保存失败: ${e?.response?.data?.detail ?? e.message}`),
  })

  const deleteMut = useMutation({
    mutationFn: (key: string) => deleteModel(key),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['models'] }),
    onError: (e: any) => alert(`删除失败: ${e?.response?.data?.detail ?? e.message}`),
  })

  const addMut = useMutation({
    mutationFn: () => createModel(addForm),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['models'] }); setShowAdd(false); setAddForm(EMPTY_FORM) },
    onError: (e: any) => alert(`创建失败: ${e?.response?.data?.detail ?? e.message}`),
  })

  const startEdit = (m: ModelEntry) => {
    setEditingKey(m.key)
    setForm({ provider: m.provider, api_base: m.api_base, model_id: m.model_id, api_key_env: m.api_key_env, max_context: m.max_context, best_for: m.best_for })
  }

  const handleSave = (key: string) => {
    saveMut.mutate({ key, body: form })
  }

  const handleDelete = (key: string) => {
    if (window.confirm(`确认删除模型 "${key}"?`)) {
      deleteMut.mutate(key)
    }
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
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-800">模型列表</h2>
          <p className="text-xs text-gray-400 mt-0.5">配置可用的 LLM 模型及其参数</p>
        </div>
        <button
          onClick={() => { setShowAdd(!showAdd); setEditingKey(null) }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={14} />
          新增模型
        </button>
      </div>

      {/* Add new model form */}
      {showAdd && (
        <div className="px-6 py-4 border-b border-gray-100 bg-green-50/50">
          <h3 className="text-sm font-medium text-gray-700 mb-3">新增模型</h3>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <label className="block">
              <span className="text-xs text-gray-500 mb-1 block">Key <span className="text-red-400">*</span></span>
              <input
                required
                value={addForm.key}
                onChange={e => setAddForm(f => ({ ...f, key: e.target.value }))}
                placeholder="e.g. gpt-4o"
                pattern="^[a-zA-Z0-9._-]+$"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500 mb-1 block">Provider <span className="text-red-400">*</span></span>
              <input
                required
                value={addForm.provider}
                onChange={e => setAddForm(f => ({ ...f, provider: e.target.value }))}
                placeholder="e.g. openai"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500 mb-1 block">Model ID <span className="text-red-400">*</span></span>
              <input
                required
                value={addForm.model_id}
                onChange={e => setAddForm(f => ({ ...f, model_id: e.target.value }))}
                placeholder="e.g. gpt-4o-2024-08-06"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500 mb-1 block">API Base</span>
              <input
                value={addForm.api_base}
                onChange={e => setAddForm(f => ({ ...f, api_base: e.target.value }))}
                placeholder="https://api.openai.com/v1"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500 mb-1 block">API Key Env</span>
              <input
                value={addForm.api_key_env}
                onChange={e => setAddForm(f => ({ ...f, api_key_env: e.target.value }))}
                placeholder="e.g. OPENAI_API_KEY"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500 mb-1 block">Max Context</span>
              <input
                type="number"
                min={1}
                value={addForm.max_context}
                onChange={e => setAddForm(f => ({ ...f, max_context: Number(e.target.value) }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (!addForm.key || !addForm.provider || !addForm.model_id) {
                  alert('Key、Provider、Model ID 为必填项')
                  return
                }
                if (!/^[a-zA-Z0-9._-]+$/.test(addForm.key)) {
                  alert('Key 只能包含字母、数字、点、下划线和连字符')
                  return
                }
                addMut.mutate()
              }}
              disabled={addMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <Save size={14} />
              {addMut.isPending ? '创建中...' : '创建'}
            </button>
            <button
              onClick={() => { setShowAdd(false); setAddForm(EMPTY_FORM) }}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors"
            >
              <X size={14} />
              取消
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-6 py-3 font-medium">Key</th>
              <th className="px-4 py-3 font-medium">Provider</th>
              <th className="px-4 py-3 font-medium">Model ID</th>
              <th className="px-4 py-3 font-medium">API Base</th>
              <th className="px-4 py-3 font-medium">Max Context</th>
              <th className="px-4 py-3 font-medium w-24">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {models?.map(m => (
              <Fragment key={m.key}>
                <tr className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 font-mono text-xs font-semibold text-gray-800">{m.key}</td>
                  <td className="px-4 py-3 text-gray-600">{m.provider}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{m.model_id}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs max-w-[180px] truncate" title={m.api_base}>
                    {m.api_base}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{m.max_context.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => startEdit(m)}
                        className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="编辑"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(m.key)}
                        className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>

                {/* Inline edit form */}
                {editingKey === m.key && (
                  <tr className="bg-blue-50/50">
                    <td colSpan={6} className="px-6 py-4">
                      <div className="grid grid-cols-3 gap-3 mb-3">
                        <label className="block">
                          <span className="text-xs text-gray-500 mb-1 block">Provider</span>
                          <input
                            required
                            value={form.provider ?? ''}
                            onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-500 mb-1 block">Model ID</span>
                          <input
                            required
                            value={form.model_id ?? ''}
                            onChange={e => setForm(f => ({ ...f, model_id: e.target.value }))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-500 mb-1 block">API Base</span>
                          <input
                            value={form.api_base ?? ''}
                            onChange={e => setForm(f => ({ ...f, api_base: e.target.value }))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-500 mb-1 block">API Key Env</span>
                          <input
                            value={form.api_key_env ?? ''}
                            onChange={e => setForm(f => ({ ...f, api_key_env: e.target.value }))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-500 mb-1 block">Max Context</span>
                          <input
                            type="number"
                            min={1}
                            value={form.max_context ?? 0}
                            onChange={e => setForm(f => ({ ...f, max_context: Number(e.target.value) }))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-500 mb-1 block">Best For (逗号分隔)</span>
                          <input
                            value={(form.best_for ?? []).join(', ')}
                            onChange={e => setForm(f => ({ ...f, best_for: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                          />
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSave(m.key)}
                          disabled={saveMut.isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          <Save size={14} />
                          {saveMut.isPending ? '保存中...' : '保存'}
                        </button>
                        <button
                          onClick={() => setEditingKey(null)}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          <X size={14} />
                          取消
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {models?.length === 0 && (
        <div className="px-6 py-12 text-center text-gray-400 text-sm">暂无模型配置</div>
      )}
    </div>
  )
}
