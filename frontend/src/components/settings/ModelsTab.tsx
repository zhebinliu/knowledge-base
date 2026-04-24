import { useState, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getModels, createModel, updateModel, deleteModel, type ModelEntry } from '../../api/client'
import { Pencil, Trash2, Save, X, Loader, Plus } from 'lucide-react'

const EMPTY_FORM = { key: '', provider: '', api_base: '', model_id: '', api_key_env: '', max_context: 128000, best_for: [] as string[] }

const btnPrimary = 'flex items-center gap-1.5 px-3 py-1.5 text-white text-sm rounded-lg disabled:opacity-50 transition-all'
const btnSecondary = 'flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors'
const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm'
const gradientStyle = { background: 'linear-gradient(135deg, #FF8D1A, #FF7A00)' }
const greenStyle = { background: 'linear-gradient(135deg, #10B981, #059669)' }

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

  const handleSave = (key: string) => saveMut.mutate({ key, body: form })

  const handleDelete = (key: string) => {
    if (window.confirm(`确认删除模型 "${key}"?`)) deleteMut.mutate(key)
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
          className={btnPrimary}
          style={gradientStyle}
        >
          <Plus size={14} /> 新增模型
        </button>
      </div>

      {/* Add new model form */}
      {showAdd && (
        <div className="px-6 py-4 border-b border-gray-100 bg-orange-50/40">
          <h3 className="text-sm font-medium text-gray-700 mb-3">新增模型</h3>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {[
              { label: '模型标识 *', field: 'key', placeholder: '例如：gpt-4o' },
              { label: '服务商 *', field: 'provider', placeholder: '例如：openai' },
              { label: '模型 ID *', field: 'model_id', placeholder: '例如：gpt-4o-2024-08-06' },
              { label: 'API 地址', field: 'api_base', placeholder: '例如：https://api.openai.com/v1' },
              { label: 'API Key 环境变量', field: 'api_key_env', placeholder: '例如：OPENAI_API_KEY' },
            ].map(({ label, field, placeholder }) => (
              <label key={field} className="block">
                <span className="text-xs text-gray-500 mb-1 block">{label}</span>
                <input
                  value={(addForm as any)[field]}
                  onChange={e => setAddForm(f => ({ ...f, [field]: e.target.value }))}
                  placeholder={placeholder}
                  className={inputCls}
                />
              </label>
            ))}
            <label className="block">
              <span className="text-xs text-gray-500 mb-1 block">最大上下文</span>
              <input
                type="number" min={1}
                value={addForm.max_context}
                onChange={e => setAddForm(f => ({ ...f, max_context: Number(e.target.value) }))}
                className={inputCls}
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (!addForm.key || !addForm.provider || !addForm.model_id) { alert('模型标识、服务商、模型 ID 为必填项'); return }
                if (!/^[a-zA-Z0-9._-]+$/.test(addForm.key)) { alert('模型标识只能包含字母、数字、点、下划线和连字符'); return }
                addMut.mutate()
              }}
              disabled={addMut.isPending}
              className={btnPrimary}
              style={greenStyle}
            >
              <Save size={14} /> {addMut.isPending ? '创建中...' : '创建'}
            </button>
            <button onClick={() => { setShowAdd(false); setAddForm(EMPTY_FORM) }} className={btnSecondary}>
              <X size={14} /> 取消
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-6 py-3 font-medium">模型标识</th>
              <th className="px-4 py-3 font-medium">服务商</th>
              <th className="px-4 py-3 font-medium">模型 ID</th>
              <th className="px-4 py-3 font-medium">API 地址</th>
              <th className="px-4 py-3 font-medium">最大上下文</th>
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
                        className="p-1.5 rounded-md text-gray-400 hover:text-orange-500 hover:bg-orange-50 transition-colors"
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

                {editingKey === m.key && (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 bg-orange-50/30 border-l-2 border-orange-300">
                      <div className="grid grid-cols-3 gap-3 mb-3">
                        {[
                          { label: '服务商', key: 'provider' },
                          { label: '模型 ID', key: 'model_id' },
                          { label: 'API 地址', key: 'api_base' },
                          { label: 'API Key 环境变量', key: 'api_key_env' },
                        ].map(({ label, key }) => (
                          <label key={key} className="block">
                            <span className="text-xs text-gray-500 mb-1 block">{label}</span>
                            <input
                              value={(form as any)[key] ?? ''}
                              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                              className={inputCls}
                            />
                          </label>
                        ))}
                        <label className="block">
                          <span className="text-xs text-gray-500 mb-1 block">最大上下文</span>
                          <input
                            type="number" min={1}
                            value={form.max_context ?? 0}
                            onChange={e => setForm(f => ({ ...f, max_context: Number(e.target.value) }))}
                            className={inputCls}
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-500 mb-1 block">擅长领域（逗号分隔）</span>
                          <input
                            value={(form.best_for ?? []).join(', ')}
                            onChange={e => setForm(f => ({ ...f, best_for: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                            className={inputCls}
                          />
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSave(m.key)}
                          disabled={saveMut.isPending}
                          className={btnPrimary}
                          style={gradientStyle}
                        >
                          <Save size={14} /> {saveMut.isPending ? '保存中...' : '保存'}
                        </button>
                        <button onClick={() => setEditingKey(null)} className={btnSecondary}>
                          <X size={14} /> 取消
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
