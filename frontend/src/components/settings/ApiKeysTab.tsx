import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiKeys, updateApiKey, deleteApiKey, type ApiKeyEntry } from '../../api/client'
import { Save, Trash2, Loader, Eye, EyeOff } from 'lucide-react'

const gradientStyle = { background: 'linear-gradient(135deg, #FF8D1A, #FF7A00)' }

export default function ApiKeysTab() {
  const qc = useQueryClient()
  const { data: keys, isLoading } = useQuery({ queryKey: ['api-keys'], queryFn: getApiKeys })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader size={20} className="animate-spin mr-2" /> 加载中...
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800">API 密钥管理</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          管理各模型提供商的 API 密钥。数据库中设置的密钥优先于 .env 环境变量。
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-6 py-3 font-medium">密钥名称</th>
              <th className="px-4 py-3 font-medium">当前值</th>
              <th className="px-4 py-3 font-medium">来源</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {keys?.map(k => <ApiKeyRow key={k.key} entry={k} qc={qc} />)}
          </tbody>
        </table>
      </div>

      {keys?.length === 0 && (
        <div className="px-6 py-12 text-center text-gray-400 text-sm">暂无 API 密钥配置</div>
      )}
    </div>
  )
}

function ApiKeyRow({ entry, qc }: { entry: ApiKeyEntry; qc: ReturnType<typeof useQueryClient> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [showValue, setShowValue] = useState(false)

  const saveMut = useMutation({
    mutationFn: () => updateApiKey(entry.key, value),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['api-keys'] }); setEditing(false); setValue('') },
    onError: (e: any) => alert(`保存失败: ${e?.response?.data?.detail ?? e.message}`),
  })

  const delMut = useMutation({
    mutationFn: () => deleteApiKey(entry.key),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
    onError: (e: any) => alert(`删除失败: ${e?.response?.data?.detail ?? e.message}`),
  })

  const sourceLabel = entry.source === 'database' ? '数据库' : '环境变量'
  const sourceBadgeClass = entry.source === 'database'
    ? 'bg-orange-50 text-orange-700'
    : 'bg-gray-100 text-gray-600'

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-6 py-3 font-mono text-xs font-semibold text-gray-800">{entry.key}</td>
      <td className="px-4 py-3 max-w-md">
        {editing ? (
          <div className="relative w-full min-w-[420px]">
            <input
              type={showValue ? 'text' : 'password'}
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="粘贴新密钥（任意长度都可以）"
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 pr-9 text-sm font-mono"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowValue(!showValue)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              title={showValue ? '隐藏' : '显示'}
            >
              {showValue ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        ) : (
          <span
            className="font-mono text-xs text-gray-500 block truncate max-w-md"
            title={entry.masked_value || ''}
          >
            {entry.masked_value || <span className="text-gray-300 italic">未设置</span>}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${sourceBadgeClass}`}>
          {sourceLabel}
        </span>
      </td>
      <td className="px-4 py-3">
        {entry.is_set ? (
          <span className="inline-flex items-center gap-1 text-xs text-green-600">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> 已配置
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-red-500">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> 未配置
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <button
                onClick={() => { if (value.trim()) saveMut.mutate() }}
                disabled={!value.trim() || saveMut.isPending}
                className="flex items-center gap-1 px-2.5 py-1.5 text-white text-xs rounded-lg disabled:opacity-40 transition-all"
                style={gradientStyle}
              >
                <Save size={12} /> {saveMut.isPending ? '...' : '保存'}
              </button>
              <button
                onClick={() => { setEditing(false); setValue(''); setShowValue(false) }}
                className="px-2.5 py-1.5 border border-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="px-2.5 py-1.5 text-white text-xs rounded-lg transition-all"
                style={gradientStyle}
              >
                {entry.is_set ? '修改' : '设置'}
              </button>
              {entry.source === 'database' && (
                <button
                  onClick={() => {
                    if (window.confirm(`确认删除数据库中的密钥 "${entry.key}"?\n删除后将回退到 .env 环境变量中的值。`))
                      delMut.mutate()
                  }}
                  disabled={delMut.isPending}
                  className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="删除数据库覆盖"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  )
}
