import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listChunks, type Chunk } from '../api/client'
import { ChevronDown, ChevronUp, Tag } from 'lucide-react'

const LTC_STAGES = ['', '线索', '商机', '报价', '合同', '回款', '售后']
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
  return (
    <div className="bg-white border border-gray-200 rounded-xl mb-3 overflow-hidden">
      <div
        className="flex items-start justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <p className={`text-sm text-gray-800 ${expanded ? '' : 'line-clamp-2'}`}>
            {chunk.content}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {chunk.ltc_stage && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">{chunk.ltc_stage}</span>
            )}
            {chunk.industry && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-700">{chunk.industry}</span>
            )}
            <span className={`px-2 py-0.5 rounded-full text-xs ${REVIEW_BADGE[chunk.review_status] ?? 'bg-gray-100 text-gray-600'}`}>
              {REVIEW_LABEL[chunk.review_status] ?? chunk.review_status}
            </span>
            {chunk.tags?.map(t => (
              <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                <Tag size={10} />{t}
              </span>
            ))}
          </div>
        </div>
        <button className="ml-3 flex-shrink-0 text-gray-400">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      {expanded && (
        <div className="px-5 pb-4 border-t border-gray-100 pt-3 text-xs text-gray-500 space-y-1">
          <div>文档 ID：{chunk.document_id}</div>
          <div>字数：{chunk.char_count}　序号：#{chunk.chunk_index}</div>
          {chunk.module && <div>模块：{chunk.module}</div>}
        </div>
      )}
    </div>
  )
}

export default function Chunks() {
  const [ltcStage, setLtcStage]         = useState('')
  const [reviewStatus, setReviewStatus] = useState('')

  const { data: chunks, isLoading } = useQuery({
    queryKey: ['chunks', ltcStage, reviewStatus],
    queryFn: () => listChunks({
      ltc_stage: ltcStage || undefined,
      review_status: reviewStatus || undefined,
      limit: 50,
    }),
  })

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">知识库</h1>
        <span className="text-sm text-gray-500">{chunks?.length ?? 0} 条</span>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <select
          value={ltcStage}
          onChange={e => setLtcStage(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">全部阶段</option>
          {LTC_STAGES.filter(Boolean).map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={reviewStatus}
          onChange={e => setReviewStatus(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {REVIEW_STATUS.map(s => (
            <option key={s} value={s}>{REVIEW_LABEL[s]}</option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-center text-gray-400 py-12">加载中…</p>}
      {!isLoading && chunks?.length === 0 && (
        <p className="text-center text-gray-400 py-12">暂无数据</p>
      )}
      {chunks?.map(c => <ChunkRow key={c.id} chunk={c} />)}
    </div>
  )
}
