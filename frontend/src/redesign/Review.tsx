/**
 * NewReview — 审核队列(单卡逐条 review,Liquid Glass)
 * 功能 100% 等价 — listReviewQueue / approve / reject / batchApprove
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listReviewQueue, approveReview, rejectReview, batchApproveReview } from '../api/client'
import {
  CheckCircle, XCircle, ClipboardCheck, AlertTriangle, CheckCheck,
  Cpu, MapPin, Tag, ChevronLeft, ChevronRight, SkipForward,
} from 'lucide-react'
import MarkdownView from '../components/MarkdownView'
import { useAuth } from '../auth/AuthContext'
import { ltcLabel, industryLabel, tagLabel } from '../utils/labels'
import { formatTime } from '../utils/datetime'
import GlowCard from './components/GlowCard'

function ageDays(iso: string): number {
  const parsed = new Date(/[Zz]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z')
  if (Number.isNaN(parsed.getTime())) return 0
  return Math.floor((Date.now() - parsed.getTime()) / 86400000)
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = value >= 0.85 ? '#059669' : value >= 0.6 ? '#D97706' : '#DC2626'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 4, background: 'rgba(0,0,0,0.25)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, boxShadow: `0 0 4px ${color}` }} />
      </div>
      <span className="rd-mono" style={{ fontSize: 10, color: 'var(--rd-text-3)' }}>{pct}%</span>
    </div>
  )
}

export default function NewReview() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const reviewer = user?.username || 'unknown'
  const [cursor, setCursor] = useState(0)

  const { data: items, isLoading } = useQuery({
    queryKey: ['review-queue'], queryFn: listReviewQueue, refetchInterval: 15_000,
  })

  const total = items?.length ?? 0
  const safeIdx = total > 0 ? Math.min(cursor, total - 1) : 0
  const item = items?.[safeIdx]

  const go = (dir: 1 | -1) => setCursor(c => Math.max(0, Math.min(total - 1, c + dir)))
  const skip = () => setCursor(c => (c + 1 >= total ? 0 : c + 1))

  const approve = useMutation({
    mutationFn: ({ id }: { id: string }) => approveReview(id, reviewer),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['review-queue'] }),
  })
  const reject = useMutation({
    mutationFn: ({ id }: { id: string }) => rejectReview(id, reviewer),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['review-queue'] }),
  })
  const batchApprove = useMutation({
    mutationFn: () => batchApproveReview(reviewer),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['review-queue'] }),
  })

  const acting = approve.isPending || reject.isPending || batchApprove.isPending
  const overdueCount = (items ?? []).filter(it => ageDays(it.created_at) > 7).length
  const itemAge = item ? ageDays(item.created_at) : 0

  return (
    <div className="rd-page" style={{ maxWidth: 900 }}>
      {/* Header */}
      <div className="rd-page-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1>审核队列</h1>
          {overdueCount > 0 && (
            <span className="rd-badge is-red" style={{ marginBottom: 4 }}>{overdueCount} 条积压 &gt;7 天</span>
          )}
        </div>
        {total > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => {
                if (confirm(`将当前 ${total} 条待审核全部通过?`)) batchApprove.mutate()
              }}
              disabled={acting}
              className="rd-btn"
              style={{ padding: '6px 12px', fontSize: 11.5, color: '#047857', borderColor: 'rgba(5, 150, 105, .35)' }}
              title="批量通过当前队列"
            >
              <CheckCheck size={12} /> 全部通过
            </button>
            <button onClick={() => go(-1)} disabled={safeIdx === 0} className="rd-icon-btn" style={{ width: 30, height: 30 }} title="上一条">
              <ChevronLeft size={14} />
            </button>
            <span className="rd-mono" style={{ fontSize: 13, color: 'var(--rd-text-2)', minWidth: 56, textAlign: 'center', fontWeight: 600 }}>
              {safeIdx + 1} / {total}
            </span>
            <button onClick={() => go(1)} disabled={safeIdx === total - 1} className="rd-icon-btn" style={{ width: 30, height: 30 }} title="下一条">
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {isLoading && <p style={{ textAlign: 'center', color: 'var(--rd-text-3)', padding: '48px 0', fontSize: 13 }}>加载中…</p>}

      {!isLoading && total === 0 && (
        <GlowCard style={{ padding: '60px 24px', textAlign: 'center' }}>
          <ClipboardCheck size={44} color="var(--rd-text-3)" style={{ opacity: 0.3, marginBottom: 12 }} />
          <p style={{ fontSize: 13, color: 'var(--rd-text-3)', margin: 0 }}>暂无待审核内容</p>
        </GlowCard>
      )}

      {/* Progress bar */}
      {total > 1 && (
        <div style={{ display: 'flex', gap: 2, marginBottom: 16 }}>
          {items!.map((_, i) => {
            const active = i === safeIdx
            return (
              <button
                key={i}
                onClick={() => setCursor(i)}
                style={{
                  flex: 1, height: 5, borderRadius: 999, border: 'none',
                  background: active ? 'var(--rd-accent)' : 'rgba(0,0,0,0.40)',
                  boxShadow: active ? '0 0 6px var(--rd-accent)' : 'none',
                  cursor: 'pointer', transition: 'background .15s',
                }}
                title={`第 ${i + 1} 条`}
              />
            )
          })}
        </div>
      )}

      {/* Single card */}
      {item && (
        <GlowCard style={{ padding: 0, overflow: 'hidden' }}>
          {/* Banner */}
          <div style={{
            padding: '12px 20px',
            background: 'linear-gradient(135deg, rgba(255, 141, 26, .10), rgba(255, 141, 26, .03))',
            borderBottom: '1px solid rgba(255, 141, 26, .18)',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <AlertTriangle size={13} color="var(--rd-accent)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 11.5, color: '#92400E', fontWeight: 600, margin: '0 0 8px' }}>{item.reason}</p>

                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 16px' }}>
                  {item.chunk_ltc_stage && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span className="rd-badge is-blue">{ltcLabel(item.chunk_ltc_stage)}</span>
                      {item.chunk_ltc_stage_confidence != null && (
                        <div style={{ width: 80 }}><ConfidenceBar value={item.chunk_ltc_stage_confidence} /></div>
                      )}
                    </div>
                  )}
                  {item.chunk_industry && item.chunk_industry !== 'other' && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--rd-text-2)' }}>
                      <MapPin size={10} color="var(--rd-text-3)" />{industryLabel(item.chunk_industry)}
                    </span>
                  )}
                  {item.chunk_module && (
                    <span className="rd-badge is-violet">{item.chunk_module}</span>
                  )}
                  {item.chunk_source_section && (
                    <span style={{
                      fontSize: 11, color: 'var(--rd-text-3)',
                      maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }} title={item.chunk_source_section}>
                      § {item.chunk_source_section}
                    </span>
                  )}
                  {item.chunk_generated_by_model && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--rd-text-3)', marginLeft: 'auto' }}>
                      <Cpu size={10} />{item.chunk_generated_by_model}
                    </span>
                  )}
                </div>

                {item.chunk_tags && item.chunk_tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 6 }}>
                    <Tag size={10} color="var(--rd-text-3)" />
                    {item.chunk_tags.map(t => <span key={t} className="rd-badge is-gray">{tagLabel(t)}</span>)}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                <span className="rd-mono" style={{ fontSize: 11, color: 'var(--rd-text-3)' }}>{formatTime(item.created_at)}</span>
                {itemAge > 7 && <span className="rd-badge is-red">积压 {itemAge} 天</span>}
              </div>
            </div>
          </div>

          {/* Chunk content */}
          <div style={{ padding: '16px 20px', minHeight: 140 }}>
            {item.chunk_content ? (
              <MarkdownView content={item.chunk_content} size="sm" />
            ) : (
              <p style={{ fontSize: 13, color: 'var(--rd-text-3)', fontStyle: 'italic' }}>
                Chunk ID: {item.chunk_id}(内容加载中或已删除)
              </p>
            )}
          </div>

          {/* Actions */}
          <div style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--rd-line)',
            background: 'rgba(0,0,0,0.25)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <button
              onClick={() => approve.mutate({ id: item.id })}
              disabled={acting}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '9px 20px', borderRadius: 10,
                background: 'linear-gradient(135deg, #10B981, #059669)',
                color: '#fff', border: 'none', cursor: acting ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 600, opacity: acting ? 0.5 : 1,
                boxShadow: '0 4px 12px -2px rgba(5, 150, 105, .45), inset 0 1px 0 rgba(255, 255, 255, .25)',
                fontFamily: 'inherit',
              }}
            >
              <CheckCircle size={14} /> 通过
            </button>
            <button
              onClick={() => reject.mutate({ id: item.id })}
              disabled={acting}
              className="rd-btn"
              style={{ padding: '8px 18px', fontSize: 13, color: '#DC2626', borderColor: 'rgba(220, 38, 38, .25)' }}
            >
              <XCircle size={14} /> 拒绝
            </button>
            <div style={{ flex: 1 }} />
            <button
              onClick={skip}
              disabled={acting || total <= 1}
              className="rd-btn rd-btn-ghost"
              style={{ padding: '8px 14px', fontSize: 12.5 }}
            >
              <SkipForward size={13} /> 跳过
            </button>
          </div>
        </GlowCard>
      )}
    </div>
  )
}
