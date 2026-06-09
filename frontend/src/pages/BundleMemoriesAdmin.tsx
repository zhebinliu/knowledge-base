/**
 * 后台:修订学习记忆库 — 仅 is_admin 可访问。
 *
 * 功能:
 * - 11 个 markdown 类 bundle kind tab(insight / 调研三件套 / 方案三件套 / 实施三件套),
 *   角标显示启用/总数。kickoff_pptx / kickoff_html 二进制 kind 不在此处。
 * - 列表:笔记内容预览 + 来源 bundle/project/user + 创建时间 + 启停开关
 * - 操作:启停切换(即时生效)/ 编辑笔记 / 删除
 * - 数据流:见 backend/services/revision_learning.py 顶部 docstring
 */
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Brain, Loader2, RefreshCw, Trash2, Edit3, Check, X,
  CheckCircle2, PauseCircle, ExternalLink,
} from 'lucide-react'
import {
  listBundleMemories, fetchBundleMemoriesKindsSummary,
  updateBundleMemory, deleteBundleMemory,
  type BundleMemory, type BundleMemoryKind,
} from '../api/client'

const KIND_LABEL: Record<BundleMemoryKind, string> = {
  insight:              '项目洞察',
  survey:               '调研问卷',
  survey_outline:       '调研大纲',
  research_plan:        '调研计划',
  research_report:      '调研报告',
  blueprint_design:     '蓝图设计',
  object_field_layout:  '对象字段表',
  process_setup:        '流程建设表',
  implementation_plan:  '实施任务清单',
  test_plan:            '测试方案',
  acceptance_report:    '验收报告',
}

// 按业务阶段排列:洞察 → 调研三件套 → 方案三件套 → 实施三件套
const ALL_KINDS: BundleMemoryKind[] = [
  'insight',
  'survey_outline', 'research_plan', 'survey', 'research_report',
  'blueprint_design', 'object_field_layout', 'process_setup',
  'implementation_plan', 'test_plan', 'acceptance_report',
]


export default function BundleMemoriesAdmin() {
  const qc = useQueryClient()
  const [activeKind, setActiveKind] = useState<BundleMemoryKind>('insight')
  const [showOnlyEnabled, setShowOnlyEnabled] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const { data: kindsSummary } = useQuery({
    queryKey: ['bundle-memories-kinds'],
    queryFn: fetchBundleMemoriesKindsSummary,
  })

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['bundle-memories', activeKind, showOnlyEnabled],
    queryFn: () => listBundleMemories({
      kind: activeKind,
      enabled: showOnlyEnabled ? true : undefined,
      limit: 200,
    }),
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { enabled?: boolean; notes_md?: string } }) =>
      updateBundleMemory(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bundle-memories'] })
      qc.invalidateQueries({ queryKey: ['bundle-memories-kinds'] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteBundleMemory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bundle-memories'] })
      qc.invalidateQueries({ queryKey: ['bundle-memories-kinds'] })
    },
  })

  const handleToggleEnabled = (mem: BundleMemory) => {
    updateMut.mutate({ id: mem.id, body: { enabled: !mem.enabled } })
  }

  const startEdit = (mem: BundleMemory) => {
    setEditingId(mem.id)
    setEditDraft(mem.notes_md)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditDraft('')
  }

  const saveEdit = (id: string) => {
    const trimmed = editDraft.trim()
    if (!trimmed) {
      alert('笔记内容不能为空')
      return
    }
    updateMut.mutate(
      { id, body: { notes_md: trimmed } },
      { onSuccess: () => { setEditingId(null); setEditDraft('') } }
    )
  }

  const handleDelete = (mem: BundleMemory) => {
    if (window.confirm(`确定删除这条 ${KIND_LABEL[mem.bundle_kind]} 修订笔记?\n删除后不可恢复(如果只是暂时不想用,可以「停用」)。`)) {
      deleteMut.mutate(mem.id)
    }
  }

  const stats = useMemo(() => {
    const s = kindsSummary?.summary?.[activeKind]
    return s ?? { enabled: 0, total: 0 }
  }, [kindsSummary, activeKind])

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Brain className="w-6 h-6 text-violet-600" />
            修订学习记忆库
          </h1>
          <p className="text-sm text-slate-500 mt-1.5 max-w-3xl">
            用户每次上传修订版覆盖 AI 产出后,系统自动让 LLM 对比 A/B,
            抽取 3-5 条「用户偏好」沉淀到这里。下次生成同类产物时,启用中的笔记会自动注入到 system prompt 顶部,
            让 AI 产出更贴近用户喜好。可单条停用 / 编辑 / 删除。
          </p>
        </div>
        <button
          onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ['bundle-memories-kinds'] }) }}
          className="text-sm px-3 py-1.5 rounded-md border hover:bg-slate-50 inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" /> 刷新
        </button>
      </div>

      {/* Kind tab — 11 个 kind 横向滚动避免溢出 */}
      <div className="border-b overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {ALL_KINDS.map(k => {
            const s = kindsSummary?.summary?.[k] ?? { enabled: 0, total: 0 }
            const isActive = activeKind === k
            return (
              <button
                key={k}
                onClick={() => setActiveKind(k)}
                className={`px-4 py-2 text-sm border-b-2 transition-colors ${
                  isActive
                    ? 'border-violet-600 text-violet-700 font-medium'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {KIND_LABEL[k]}
                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                  isActive ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'
                }`}>
                  {s.enabled}/{s.total}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center justify-between text-sm">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showOnlyEnabled}
            onChange={e => setShowOnlyEnabled(e.target.checked)}
          />
          <span className="text-slate-700">仅看启用中</span>
        </label>
        <div className="text-slate-500">
          当前显示 <b className="text-slate-900">{items.length}</b> / 共 <b className="text-slate-900">{total}</b> 条
          {' · '}启用中 <b className="text-emerald-700">{stats.enabled}</b> / 全部 <b>{stats.total}</b>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="py-20 text-center text-slate-500">
          <Loader2 className="w-6 h-6 mx-auto animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-slate-500 border border-dashed rounded-lg">
          <Brain className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          <div>暂无{KIND_LABEL[activeKind]}修订笔记</div>
          <div className="text-xs mt-1">用户上传修订版后,系统会自动抽取偏好沉淀到这里</div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(mem => {
            const isEditing = editingId === mem.id
            return (
              <div
                key={mem.id}
                className={`border rounded-lg p-4 transition-all ${
                  mem.enabled ? 'bg-white' : 'bg-slate-50/50 opacity-75'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 text-xs">
                    {mem.enabled ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                        <CheckCircle2 className="w-3 h-3" /> 启用中
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 ring-1 ring-slate-200">
                        <PauseCircle className="w-3 h-3" /> 已停用
                      </span>
                    )}
                    <span className="text-slate-500">
                      {new Date(mem.created_at).toLocaleString('zh-CN')}
                    </span>
                    {mem.llm_model && (
                      <span className="text-slate-400">· 由 {mem.llm_model} 抽取</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {!isEditing && (
                      <>
                        <button
                          onClick={() => handleToggleEnabled(mem)}
                          disabled={updateMut.isPending}
                          className="text-xs px-2 py-1 rounded border hover:bg-slate-50 inline-flex items-center gap-1"
                          title={mem.enabled ? '停用后不再注入到生成 prompt' : '重新启用'}
                        >
                          {mem.enabled ? <PauseCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                          {mem.enabled ? '停用' : '启用'}
                        </button>
                        <button
                          onClick={() => startEdit(mem)}
                          className="text-xs px-2 py-1 rounded border hover:bg-slate-50 inline-flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" /> 编辑
                        </button>
                        <button
                          onClick={() => handleDelete(mem)}
                          disabled={deleteMut.isPending}
                          className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> 删除
                        </button>
                      </>
                    )}
                    {isEditing && (
                      <>
                        <button
                          onClick={() => saveEdit(mem.id)}
                          disabled={updateMut.isPending}
                          className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" /> 保存
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="text-xs px-2 py-1 rounded border hover:bg-slate-50 inline-flex items-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" /> 取消
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <textarea
                    value={editDraft}
                    onChange={e => setEditDraft(e.target.value)}
                    rows={Math.min(20, Math.max(4, editDraft.split('\n').length + 1))}
                    className="w-full text-sm font-mono p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
                    maxLength={3000}
                  />
                ) : (
                  <div className="text-sm text-slate-800 whitespace-pre-wrap font-medium leading-relaxed">
                    {mem.notes_md}
                  </div>
                )}

                {/* 来源信息 */}
                <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>来源:</span>
                  {mem.source_project_name && mem.source_project_id ? (
                    <a
                      href={`/projects/${mem.source_project_id}`}
                      className="inline-flex items-center gap-1 text-slate-700 hover:text-violet-700"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {mem.source_project_name}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-slate-400">(项目已删除)</span>
                  )}
                  {mem.source_bundle_title && (
                    <span title={mem.source_bundle_id ?? ''}>
                      产物:{mem.source_bundle_title}
                    </span>
                  )}
                  {mem.source_username && (
                    <span>修订人:{mem.source_username}</span>
                  )}
                  {mem.original_chars != null && mem.new_chars != null && (
                    <span>
                      字数:{mem.original_chars} → {mem.new_chars}
                      {' ('}
                      {mem.new_chars > mem.original_chars ? '+' : ''}
                      {mem.new_chars - mem.original_chars}
                      {')'}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
