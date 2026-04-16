import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPrompts, getPromptDetail, updatePrompt, resetPrompt, type PromptEntry } from '../../api/client'
import { Save, RotateCcw, Loader, FileCode } from 'lucide-react'

export default function PromptsTab() {
  const qc = useQueryClient()
  const { data: prompts, isLoading } = useQuery({ queryKey: ['prompts'], queryFn: getPrompts })

  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  // auto-select first if none selected
  const activeKey = selectedKey ?? prompts?.[0]?.key ?? null

  return (
    <div className="flex gap-5 min-h-[560px]">
      {/* Left sidebar: prompt list */}
      <div className="w-56 flex-shrink-0 bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">提示词模板</h3>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader size={16} className="animate-spin" />
          </div>
        ) : (
          <nav className="py-1">
            {prompts?.map(p => (
              <button
                key={p.key}
                onClick={() => setSelectedKey(p.key)}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2 ${
                  activeKey === p.key
                    ? 'bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <FileCode size={14} className="flex-shrink-0" />
                <span className="truncate">{p.key}</span>
              </button>
            ))}
          </nav>
        )}
      </div>

      {/* Right side: editor */}
      {activeKey ? (
        <PromptEditor key={activeKey} promptKey={activeKey} qc={qc} />
      ) : (
        <div className="flex-1 bg-white rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 text-sm">
          选择一个提示词模板
        </div>
      )}
    </div>
  )
}

/* ── Prompt editor panel ──────────────────────────────────────────────────── */

function PromptEditor({ promptKey, qc }: { promptKey: string; qc: ReturnType<typeof useQueryClient> }) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ['prompts', promptKey],
    queryFn: () => getPromptDetail(promptKey),
  })

  const [template, setTemplate] = useState<string | null>(null)

  // sync loaded data to local state
  const currentTemplate = template ?? detail?.template ?? ''
  const dirty = template !== null && template !== detail?.template

  const saveMut = useMutation({
    mutationFn: () => updatePrompt(promptKey, { template: currentTemplate }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prompts'] })
      qc.invalidateQueries({ queryKey: ['prompts', promptKey] })
      setTemplate(null)
    },
    onError: (e: any) => alert(`保存失败: ${e?.response?.data?.detail ?? e.message}`),
  })

  const resetMut = useMutation({
    mutationFn: () => resetPrompt(promptKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prompts'] })
      qc.invalidateQueries({ queryKey: ['prompts', promptKey] })
      setTemplate(null)
    },
    onError: (e: any) => alert(`重置失败: ${e?.response?.data?.detail ?? e.message}`),
  })

  // extract variables from template
  const variables = useMemo(() => {
    if (!detail?.variables) return []
    return detail.variables
  }, [detail])

  // render template with highlighted variables (safe React elements, no innerHTML)
  const highlightedParts = useMemo(() => {
    const parts: Array<{ text: string; isVar: boolean }> = []
    let lastIndex = 0
    const regex = /\{(\w+)\}/g
    let match: RegExpExecArray | null
    while ((match = regex.exec(currentTemplate)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ text: currentTemplate.slice(lastIndex, match.index), isVar: false })
      }
      parts.push({ text: match[0], isVar: true })
      lastIndex = regex.lastIndex
    }
    if (lastIndex < currentTemplate.length) {
      parts.push({ text: currentTemplate.slice(lastIndex), isVar: false })
    }
    return parts
  }, [currentTemplate])

  if (isLoading) {
    return (
      <div className="flex-1 bg-white rounded-xl border border-gray-200 flex items-center justify-center text-gray-400">
        <Loader size={18} className="animate-spin mr-2" /> 加载中...
      </div>
    )
  }

  return (
    <div className="flex-1 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-800 font-mono text-sm">{promptKey}</h2>
          {variables.length > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              变量: {variables.map((v, i) => (
                <span key={v}>
                  {i > 0 && ', '}
                  <code className="bg-yellow-100 text-yellow-800 px-1 py-0.5 rounded text-xs">{v}</code>
                </span>
              ))}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (window.confirm(`将 ${promptKey} 重置为默认值?`)) resetMut.mutate()
            }}
            disabled={resetMut.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RotateCcw size={14} />
            {resetMut.isPending ? '重置中...' : '恢复默认'}
          </button>
          <button
            onClick={() => saveMut.mutate()}
            disabled={!dirty || saveMut.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            <Save size={14} />
            {saveMut.isPending ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {/* Textarea */}
      <div className="flex-1 p-4 relative">
        <textarea
          value={currentTemplate}
          onChange={e => setTemplate(e.target.value)}
          spellCheck={false}
          className="w-full h-full min-h-[400px] border border-gray-200 rounded-lg p-4 text-sm font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          placeholder="输入提示词模板..."
        />
      </div>

      {/* Preview with highlighted vars */}
      {currentTemplate && (
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-500 mb-1">预览 (变量高亮显示)</p>
          <div className="text-xs font-mono text-gray-600 leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto">
            {highlightedParts.map((part, i) =>
              part.isVar ? (
                <span key={i} className="bg-yellow-200 text-yellow-900 px-0.5 rounded">{part.text}</span>
              ) : (
                <span key={i}>{part.text}</span>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}
