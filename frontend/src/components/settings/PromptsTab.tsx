import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPrompts, getPromptDetail, updatePrompt, resetPrompt } from '../../api/client'
import { Save, RotateCcw, Loader, FileCode } from 'lucide-react'

const PROMPT_LABELS: Record<string, string> = {
  CONVERSION_PROMPT: '文档转化',
  CLASSIFICATION_PROMPT: '切片分类',
  QA_PROMPT: '知识问答',
  DOC_GENERATE_PROMPT: '文档生成',
  CHALLENGE_QUESTION_PROMPT: '知识挑战 · 出题',
  CHALLENGE_JUDGE_PROMPT: '知识挑战 · 评判',
}

const labelOf = (key: string) => PROMPT_LABELS[key] ?? key
const gradientStyle = { background: 'linear-gradient(135deg, #FF8D1A, #FF7A00)' }

export default function PromptsTab() {
  const qc = useQueryClient()
  const { data: prompts, isLoading } = useQuery({ queryKey: ['prompts'], queryFn: getPrompts })

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const activeKey = selectedKey ?? prompts?.[0]?.key ?? null

  return (
    <div className="flex gap-5 min-h-[560px]">
      {/* Left sidebar */}
      <div className="w-60 flex-shrink-0 bg-white rounded-xl border border-gray-200 overflow-hidden">
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
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-start gap-2 ${
                  activeKey === p.key
                    ? 'bg-orange-50 text-orange-700 font-medium border-r-2 border-orange-500'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <FileCode size={14} className="flex-shrink-0 mt-0.5" />
                <span className="flex flex-col leading-tight">
                  <span>{labelOf(p.key)}</span>
                  <span className="text-[10px] font-mono text-gray-400 mt-0.5">{p.key}</span>
                </span>
              </button>
            ))}
          </nav>
        )}
      </div>

      {/* Right: editor */}
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

/* ── Prompt editor ───────────────────────────────────────────────────────── */

function PromptEditor({ promptKey, qc }: { promptKey: string; qc: ReturnType<typeof useQueryClient> }) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ['prompts', promptKey],
    queryFn: () => getPromptDetail(promptKey),
  })

  const [template, setTemplate] = useState<string | null>(null)
  const [view, setView] = useState<'raw' | 'preview'>('raw')

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

  const variables = useMemo(() => detail?.variables ?? [], [detail])

  const highlightedParts = useMemo(() => {
    const parts: Array<{ text: string; isVar: boolean }> = []
    let lastIndex = 0
    const regex = /\{(\w+)\}/g
    let match: RegExpExecArray | null
    while ((match = regex.exec(currentTemplate)) !== null) {
      if (match.index > lastIndex) parts.push({ text: currentTemplate.slice(lastIndex, match.index), isVar: false })
      parts.push({ text: match[0], isVar: true })
      lastIndex = regex.lastIndex
    }
    if (lastIndex < currentTemplate.length) parts.push({ text: currentTemplate.slice(lastIndex), isVar: false })
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
      <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-800 text-base">{labelOf(promptKey)}</h2>
          <p className="text-xs text-gray-400 font-mono mt-0.5">{promptKey}</p>
          {variables.length > 0 && (
            <p className="text-xs text-gray-500 mt-2">
              变量: {variables.map((v, i) => (
                <span key={v}>
                  {i > 0 && ' '}
                  <code className="bg-yellow-100 text-yellow-800 px-1 py-0.5 rounded text-xs">{`{${v}}`}</code>
                </span>
              ))}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => { if (window.confirm(`将 ${labelOf(promptKey)} 重置为默认值?`)) resetMut.mutate() }}
            disabled={resetMut.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RotateCcw size={14} /> {resetMut.isPending ? '重置中...' : '恢复默认'}
          </button>
          <button
            onClick={() => saveMut.mutate()}
            disabled={!dirty || saveMut.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-white text-sm rounded-lg disabled:opacity-40 transition-all"
            style={gradientStyle}
          >
            <Save size={14} /> {saveMut.isPending ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="px-6 pt-3 border-b border-gray-100 flex items-center gap-1">
        <TabButton active={view === 'raw'} onClick={() => setView('raw')}>原文编辑</TabButton>
        <TabButton active={view === 'preview'} onClick={() => setView('preview')}>预览（变量高亮）</TabButton>
        {dirty && <span className="ml-auto text-xs text-amber-600 pb-2">● 未保存修改</span>}
      </div>

      {/* Body */}
      <div className="flex-1 p-4 overflow-hidden">
        {view === 'raw' ? (
          <textarea
            value={currentTemplate}
            onChange={e => setTemplate(e.target.value)}
            spellCheck={false}
            className="w-full h-full min-h-[440px] border border-gray-200 rounded-lg p-4 text-sm font-mono leading-relaxed resize-none"
            placeholder="输入提示词模板..."
          />
        ) : (
          <div className="w-full h-full min-h-[440px] border border-gray-200 rounded-lg p-4 bg-gray-50 overflow-y-auto text-sm font-mono leading-relaxed text-gray-700 whitespace-pre-wrap">
            {highlightedParts.length === 0 ? (
              <span className="text-gray-400">（空模板）</span>
            ) : (
              highlightedParts.map((part, i) =>
                part.isVar
                  ? <span key={i} className="bg-yellow-200 text-yellow-900 px-0.5 rounded">{part.text}</span>
                  : <span key={i}>{part.text}</span>
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-sm transition-colors border-b-2 -mb-px ${
        active
          ? 'border-orange-500 text-orange-600 font-medium'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  )
}
