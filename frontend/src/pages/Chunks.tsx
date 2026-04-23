import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listChunks, updateChunk, exportChunks, type Chunk } from '../api/client'
import { ChevronDown, ChevronUp, Tag, Pencil, Check, X, Loader, Cpu, Download, ChevronLeft, ChevronRight, Flame, Ghost } from 'lucide-react'
import MarkdownView from '../components/MarkdownView'
import { LTC_KEYS, LTC_LABEL, INDUSTRY_LABEL, ltcLabel, industryLabel, tagLabel } from '../utils/labels'

const PAGE_SIZE_OPTIONS = [20, 50, 100]

const REVIEW_STATUS = ['', 'pending', 'approved', 'rejected', 'needs_review']
const REVIEW_LABEL: Record<string, string> = {
  '': '全部状态',
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
  needs_review: '需复审',
}
const REVIEW_BADGE: Record<string, string> = {
  pending:      'bg-yellow-50 text-yellow-700',
  approved:     'bg-green-50 text-green-700',
  rejected:     'bg-red-50 text-red-700',
  needs_review: 'bg-orange-50 text-orange-700',
}

function ChunkRow({ chunk }: { chunk: Chunk }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing]   = useState(false)
  const [ltcStage, setLtcStage] = useState(chunk.ltc_stage ?? '')
  const [industry, setIndustry] = useState(chunk.industry ?? '')
  const [module, setModule]     = useState(chunk.module ?? '')
  const [tagsStr, setTagsStr]   = useState((chunk.tags ?? []).join(', '))
  const [content, setContent]   = useState(chunk.content ?? '')
  const [editContent, setEditContent] = useState(false)

  const qc = useQueryClient()
  const citations = chunk.citation_count ?? 0

  // Re-sync local form state if the chunk data updates from the server
  useEffect(() => {
    if (!editing) {
      setLtcStage(chunk.ltc_stage ?? '')
      setIndustry(chunk.industry ?? '')
      setModule(chunk.module ?? '')
      setTagsStr((chunk.tags ?? []).join(', '))
      setContent(chunk.content ?? '')
      setEditContent(false)
    }
  }, [chunk, editing])

  const save = useMutation({
    mutationFn: () =>
      updateChunk(chunk.id, {
        ltc_stage: ltcStage || undefined,
        industry: industry || undefined,
        module: module || undefined,
        tags: tagsStr.split(',').map(t => t.trim()).filter(Boolean),
        // 只在明确切换到"改内容"模式时才提交 content，避免误触发重嵌
        ...(editContent && content !== chunk.content ? { content } : {}),
      }),
    onSuccess: () => {
      setEditing(false)
      setEditContent(false)
      qc.invalidateQueries({ queryKey: ['chunks'] })
    },
  })

  const cancel = () => {
    setLtcStage(chunk.ltc_stage ?? '')
    setIndustry(chunk.industry ?? '')
    setModule(chunk.module ?? '')
    setTagsStr((chunk.tags ?? []).join(', '))
    setContent(chunk.content ?? '')
    setEditing(false)
    setEditContent(false)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl mb-3 overflow-hidden">
      <div
        className="flex items-start justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          {expanded ? (
            <MarkdownView content={chunk.content} size="sm" />
          ) : (
            <p className="text-sm text-gray-800 line-clamp-2">{chunk.content}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {chunk.ltc_stage && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">{ltcLabel(chunk.ltc_stage)}</span>
            )}
            {chunk.industry && chunk.industry !== 'other' && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-700">{industryLabel(chunk.industry)}</span>
            )}
            <span className={`px-2 py-0.5 rounded-full text-xs ${REVIEW_BADGE[chunk.review_status] ?? 'bg-gray-100 text-gray-600'}`}>
              {REVIEW_LABEL[chunk.review_status] ?? chunk.review_status}
            </span>
            {(chunk as any).generated_by_model && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-indigo-50 text-indigo-600 border border-indigo-100">
                <Cpu size={10} />{(chunk as any).generated_by_model}
              </span>
            )}
            {chunk.tags?.map(t => (
              <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                <Tag size={10} />{tagLabel(t)}
              </span>
            ))}
            {citations >= 5 ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700" title={`被引用 ${citations} 次`}>
                <Flame size={10}/> {citations}
              </span>
            ) : citations === 0 ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-400" title="从未被检索命中">
                <Ghost size={10}/> 未引用
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-50 text-gray-500" title={`被引用 ${citations} 次`}>
                {citations} 次
              </span>
            )}
          </div>
        </div>
        <button className="ml-3 flex-shrink-0 text-gray-400">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      {expanded && (
        <div className="px-5 pb-4 border-t border-gray-100 pt-3 space-y-3">
          <div className="text-xs text-gray-500 space-y-1">
            <div>文档 ID：{chunk.document_id}</div>
            <div>字数：{chunk.char_count ?? '—'}　序号：#{chunk.chunk_index}</div>
          </div>

          {!editing ? (
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500">
                {chunk.module && <span>模块：{chunk.module}</span>}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setEditing(true) }}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
              >
                <Pencil size={12}/> 编辑标签
              </button>
            </div>
          ) : (
            <div className="space-y-2 bg-gray-50 border border-gray-200 rounded-lg p-3" onClick={e => e.stopPropagation()}>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-500">LTC 阶段</span>
                  <select
                    value={ltcStage}
                    onChange={e => setLtcStage(e.target.value)}
                    className="px-2 py-1 border border-gray-200 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">（无）</option>
                    {LTC_KEYS.map(k => <option key={k} value={k}>{LTC_LABEL[k]}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-500">行业</span>
                  <select
                    value={industry}
                    onChange={e => setIndustry(e.target.value)}
                    className="px-2 py-1 border border-gray-200 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">（无）</option>
                    {Object.entries(INDUSTRY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">模块</span>
                <input
                  value={module}
                  onChange={e => setModule(e.target.value)}
                  placeholder="如 销售回款"
                  className="px-2 py-1 border border-gray-200 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">标签（英文逗号分隔）</span>
                <input
                  value={tagsStr}
                  onChange={e => setTagsStr(e.target.value)}
                  placeholder="challenge, q-pass"
                  className="px-2 py-1 border border-gray-200 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </label>

              <div className="pt-1 border-t border-gray-200">
                {!editContent ? (
                  <button
                    onClick={() => setEditContent(true)}
                    className="text-xs text-orange-600 hover:underline flex items-center gap-1"
                  >
                    <Pencil size={10}/> 修改切片内容（保存后自动重新嵌入）
                  </button>
                ) : (
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-orange-700 flex items-center gap-1">
                      <Pencil size={10}/> 切片内容（保存时会触发 embedding 重算）
                    </span>
                    <textarea
                      value={content}
                      onChange={e => setContent(e.target.value)}
                      rows={Math.min(20, Math.max(6, content.split('\n').length + 1))}
                      className="px-2 py-1.5 border border-orange-300 rounded text-xs font-mono bg-white focus:outline-none focus:ring-1 focus:ring-orange-500 resize-y"
                    />
                    <span className="text-[11px] text-gray-400">
                      当前 {content.length} 字（原 {chunk.content?.length ?? 0} 字）
                    </span>
                  </label>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                {save.isError && (
                  <span className="text-xs text-red-600 mr-auto">保存失败</span>
                )}
                <button
                  onClick={cancel}
                  disabled={save.isPending}
                  className="flex items-center gap-1 px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded disabled:opacity-50 transition-colors"
                >
                  <X size={12}/> 取消
                </button>
                <button
                  onClick={() => save.mutate()}
                  disabled={save.isPending}
                  className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {save.isPending ? <Loader size={12} className="animate-spin"/> : <Check size={12}/>}
                  保存
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Chunks() {
  const [ltcStage, setLtcStage]         = useState('')
  const [reviewStatus, setReviewStatus] = useState('')
  const [usage, setUsage]               = useState<'' | 'hot' | 'unused'>('')
  const [pageSize, setPageSize]         = useState(20)
  const [page, setPage]                 = useState(0)
  const [exporting, setExporting]       = useState(false)

  const params = useMemo(() => ({
    ltc_stage:     ltcStage     || undefined,
    review_status: reviewStatus || undefined,
    usage:         (usage || undefined) as 'hot' | 'unused' | undefined,
    limit:  pageSize,
    offset: page * pageSize,
  }), [ltcStage, reviewStatus, usage, pageSize, page])

  const { data: chunksPage, isLoading } = useQuery({
    queryKey: ['chunks', params],
    queryFn: () => listChunks(params),
    placeholderData: (prev) => prev,
  })

  const chunks     = chunksPage?.items ?? []
  const total      = chunksPage?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const handleExport = async () => {
    setExporting(true)
    try {
      const data = await exportChunks({ ltc_stage: ltcStage || undefined })
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `knowledge_${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      alert('导出失败，请重试')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">知识库</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-500">共 {total} 条</span>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {exporting ? <Loader size={13} className="animate-spin"/> : <Download size={13}/>}
            导出 JSON
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <select
          value={ltcStage}
          onChange={e => { setLtcStage(e.target.value); setPage(0) }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none"
        >
          <option value="">全部阶段</option>
          {LTC_KEYS.map(k => (
            <option key={k} value={k}>{LTC_LABEL[k]}</option>
          ))}
        </select>

        <select
          value={reviewStatus}
          onChange={e => { setReviewStatus(e.target.value); setPage(0) }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none"
        >
          {REVIEW_STATUS.map(s => (
            <option key={s} value={s}>{REVIEW_LABEL[s]}</option>
          ))}
        </select>

        <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
          {[
            { v: '' as const, label: '全部', icon: null },
            { v: 'hot' as const, label: '热门', icon: <Flame size={11} className="text-amber-500"/> },
            { v: 'unused' as const, label: '未引用', icon: <Ghost size={11} className="text-gray-400"/> },
          ].map(opt => (
            <button
              key={opt.v || 'all'}
              onClick={() => { setUsage(opt.v); setPage(0) }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                usage === opt.v ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
              }`}
            >
              {opt.icon}{opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && !chunksPage && <p className="text-center text-gray-400 py-12">加载中…</p>}
      {!isLoading && chunks.length === 0 && (
        <p className="text-center text-gray-400 py-12">暂无数据</p>
      )}
      {chunks.map(c => <ChunkRow key={c.id} chunk={c} />)}

      {/* Pagination bar */}
      {total > 0 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span>每页</span>
            {PAGE_SIZE_OPTIONS.map(n => (
              <button
                key={n}
                onClick={() => { setPageSize(n); setPage(0) }}
                className={`px-2.5 py-1 rounded border transition-colors ${
                  pageSize === n
                    ? 'border-orange-400 bg-orange-50 text-orange-700 font-semibold'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                }`}
              >{n} 条</button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded border border-gray-200 hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={13}/>
            </button>
            {Array.from({ length: totalPages }, (_, i) => i)
              .filter(i => i === 0 || i === totalPages - 1 || Math.abs(i - page) <= 1)
              .reduce<(number | '…')[]>((acc, i, idx, arr) => {
                if (idx > 0 && (i as number) - (arr[idx - 1] as number) > 1) acc.push('…')
                acc.push(i)
                return acc
              }, [])
              .map((item, idx) =>
                item === '…'
                  ? <span key={`e${idx}`} className="px-1 text-gray-400">…</span>
                  : <button
                      key={item}
                      onClick={() => setPage(item as number)}
                      className={`min-w-[28px] h-7 rounded border text-xs transition-colors ${
                        page === item
                          ? 'border-orange-400 bg-orange-50 text-orange-700 font-semibold'
                          : 'border-gray-200 hover:border-gray-300 text-gray-600'
                      }`}
                    >{(item as number) + 1}</button>
              )}
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded border border-gray-200 hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={13}/>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
