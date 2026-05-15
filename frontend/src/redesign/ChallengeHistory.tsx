/**
 * NewChallengeHistory — 挑战历史(表格 + 详情抽屉)
 * 功能 100% 等价 — listChallengeRuns / getChallengeRun
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  History, Loader, CheckCircle2, XCircle, Clock, User as UserIcon, CalendarClock,
  ChevronRight, X, Repeat,
} from 'lucide-react'
import { listChallengeRuns, getChallengeRun } from '../api/client'
import MarkdownView from '../components/MarkdownView'
import { ltcLabel } from '../utils/labels'
import { formatTime } from '../utils/datetime'
import GlowCard from './components/GlowCard'

const STATUS_BADGE: Record<string, { cls: string; label: string; Icon: typeof CheckCircle2 }> = {
  running:   { cls: 'is-orange', label: '执行中', Icon: Loader },
  completed: { cls: 'is-green',  label: '已完成', Icon: CheckCircle2 },
  failed:    { cls: 'is-red',    label: '失败',   Icon: XCircle },
}

function formatDuration(sec: number | null): string {
  if (sec == null) return '—'
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}m${s ? ` ${s}s` : ''}`
}

export default function NewChallengeHistory() {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['challenge-runs'],
    queryFn: () => listChallengeRuns(50, 0),
    refetchInterval: 5_000,
  })

  return (
    <div className="rd-page" style={{ maxWidth: 1300 }}>
      <div className="rd-page-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <History size={22} color="var(--rd-accent)" />
          <h1>挑战历史</h1>
          {data && <span style={{ fontSize: 12, color: 'var(--rd-text-3)', marginLeft: 6 }}>共 {data.total} 次</span>}
        </div>
      </div>

      <GlowCard style={{ padding: 0, overflow: 'hidden' }}>
        <table className="rd-table">
          <thead>
            <tr>
              <th>开始时间</th>
              <th>触发方式</th>
              <th>阶段</th>
              <th style={{ textAlign: 'right' }}>题数</th>
              <th style={{ textAlign: 'right' }}>通过率</th>
              <th style={{ textAlign: 'right' }}>耗时</th>
              <th>状态</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--rd-text-3)' }}>加载中…</td></tr>}
            {data && data.items.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--rd-text-3)' }}>还没有挑战记录,去触发一次吧</td></tr>}
            {data?.items.map(run => {
              const badge = STATUS_BADGE[run.status] ?? STATUS_BADGE.running
              const Icon = badge.Icon
              const isManual = run.trigger_type === 'manual'
              return (
                <tr key={run.id} onClick={() => setSelectedId(run.id)} style={{ cursor: 'pointer' }}>
                  <td className="rd-mono" style={{ fontSize: 11.5, color: 'var(--rd-text-2)' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Clock size={11} color="var(--rd-text-3)" />{formatTime(run.started_at)}
                    </div>
                  </td>
                  <td>
                    <span className={`rd-badge ${isManual ? 'is-orange' : 'is-violet'}`}>
                      {isManual ? <UserIcon size={9} /> : <CalendarClock size={9} />}
                      {isManual ? '手动' : '定时'}
                    </span>
                    <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--rd-text-3)' }}>
                      {run.triggered_by_name || run.triggered_by || '匿名'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {run.target_stages?.slice(0, 4).map(s => <span key={s} className="rd-badge is-gray" style={{ fontSize: 10 }}>{s}</span>)}
                      {run.target_stages && run.target_stages.length > 4 && <span style={{ fontSize: 10, color: 'var(--rd-text-3)' }}>+{run.target_stages.length - 4}</span>}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {run.total}
                    {run.total > 0 && <span style={{ fontSize: 11, color: 'var(--rd-text-3)', marginLeft: 4 }}>({run.passed}过/{run.failed}败)</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="rd-mono" style={{
                      fontSize: 13, fontWeight: 600,
                      color: run.pass_rate >= 0.8 ? '#047857' : run.pass_rate >= 0.5 ? '#92400E' : '#B91C1C',
                    }}>{run.total > 0 ? `${Math.round(run.pass_rate * 100)}%` : '—'}</span>
                  </td>
                  <td className="rd-mono" style={{ fontSize: 11, color: 'var(--rd-text-3)', textAlign: 'right' }}>
                    {formatDuration(run.duration_seconds)}
                  </td>
                  <td>
                    <span className={`rd-badge ${badge.cls}`}>
                      <Icon size={9} className={run.status === 'running' ? 'animate-spin' : ''} />
                      {badge.label}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <ChevronRight size={13} color="var(--rd-text-3)" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </GlowCard>

      {selectedId && (
        <RunDetailDrawer runId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}

function RunDetailDrawer({ runId, onClose }: { runId: string; onClose: () => void }) {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['challenge-run', runId],
    queryFn: () => getChallengeRun(runId),
  })

  const rerun = () => {
    if (!data?.target_stages?.length) return
    const stage = data.target_stages[0]
    navigate(`/challenge?stage=${encodeURIComponent(stage)}`)
    onClose()
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 40,
      background: 'rgba(15, 18, 36, .30)', backdropFilter: 'blur(4px)',
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(840px, 100vw)', height: '100%',
        background: 'rgba(255,255,255,0.10)',
        backdropFilter: 'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(15, 18, 36, .25)',
      }}>
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          padding: '16px 22px', borderBottom: '1px solid var(--rd-line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(20px)',
        }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--rd-text)', margin: 0 }}>挑战详情</h2>
            <p className="rd-mono" style={{ fontSize: 11, color: 'var(--rd-text-3)', margin: '2px 0 0' }}>{runId}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {data?.target_stages?.length ? (
              <button onClick={rerun} className="rd-btn" style={{ padding: '5px 12px', fontSize: 11.5, color: 'var(--rd-accent-2)', borderColor: 'rgba(255, 141, 26, .35)' }} title="以相同阶段跳回挑战页重跑">
                <Repeat size={11} /> 重跑此批
              </button>
            ) : null}
            <button onClick={onClose} className="rd-icon-btn" style={{ width: 28, height: 28 }}><X size={14} /></button>
          </div>
        </div>

        {isLoading && <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--rd-text-3)', fontSize: 13 }}>加载中…</p>}

        {data && (
          <>
            <div style={{
              padding: '18px 22px',
              display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12,
              borderBottom: '1px solid var(--rd-line)',
              background: 'rgba(15, 18, 36, .015)',
              fontSize: 13,
            }}>
              <Field label="触发方式" value={data.trigger_type === 'manual' ? '手动' : '定时'} />
              <Field label="触发者" value={data.triggered_by_name || data.triggered_by || '匿名'} />
              <Field label="开始时间" value={formatTime(data.started_at)} />
              <Field label="结束时间" value={formatTime(data.finished_at)} />
              <Field label="耗时" value={formatDuration(data.duration_seconds)} />
              <Field label="状态" value={STATUS_BADGE[data.status]?.label ?? data.status} />
              <Field label="题数" value={`${data.total}(通过 ${data.passed} / 失败 ${data.failed})`} />
              <Field label="通过率" value={data.total > 0 ? `${Math.round(data.pass_rate * 100)}%` : '—'} />
              <Field label="阶段" value={(data.target_stages ?? []).join('、') || '—'} />
              <Field label="每阶段题数" value={String(data.questions_per_stage)} />
              {data.error_message && (
                <div style={{ gridColumn: 'span 2' }}>
                  <p style={{ fontSize: 11, color: '#DC2626', margin: '0 0 2px' }}>错误信息</p>
                  <p style={{ fontSize: 13, color: '#B91C1C', background: 'rgba(220, 38, 38, .08)', padding: '6px 10px', borderRadius: 6, margin: 0 }}>{data.error_message}</p>
                </div>
              )}
            </div>

            <div style={{ padding: '18px 22px' }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--rd-text)', margin: '0 0 12px' }}>问答 ({data.questions.length})</h3>
              {data.questions.length === 0 && (
                <p style={{ textAlign: 'center', color: 'var(--rd-text-3)', fontSize: 13, padding: '24px 0' }}>本次挑战未生成已固化的问答</p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.questions.map((q, idx) => {
                  const passed = q.tags?.includes('q-pass')
                  return (
                    <div key={q.chunk_id} style={{
                      border: '1px solid var(--rd-line)', borderRadius: 12, overflow: 'hidden',
                      background: 'rgba(255,255,255,0.06)',
                    }}>
                      <div style={{
                        padding: '8px 14px',
                        background: 'rgba(0,0,0,0.25)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        fontSize: 11.5,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: 'var(--rd-text-3)' }}>#{idx + 1}</span>
                          {q.ltc_stage && <span className="rd-badge is-gray">{ltcLabel(q.ltc_stage)}</span>}
                          <span className={`rd-badge ${passed ? 'is-green' : 'is-red'}`}>{passed ? '通过' : '未通过'}</span>
                          {q.score != null && <span className="rd-mono" style={{ color: 'var(--rd-text-3)' }}>分数 {q.score.toFixed(2)}</span>}
                        </div>
                        <span style={{ color: 'var(--rd-text-3)' }}>{formatTime(q.created_at)}</span>
                      </div>
                      <div style={{ padding: '12px 14px' }}>
                        <MarkdownView content={q.content} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: 11, color: 'var(--rd-text-3)', margin: '0 0 2px' }}>{label}</p>
      <p style={{ fontSize: 13, color: 'var(--rd-text)', margin: 0 }}>{value}</p>
    </div>
  )
}
