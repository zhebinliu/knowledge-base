/**
 * NewProjectMeetingsDrawer — 项目级关联会议抽屉(Liquid Glass)
 *
 * 在项目详情页点「会议」按钮唤出,列出 Meeting.project_id == projectId 的全部会议。
 * 仅展示,点击跳 /console/meeting/:id 看详情。新增会议跳 /console/meeting/new。
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  X, Loader2, RefreshCw, Plus, Mic, CheckCircle2, AlertCircle, Clock, MessageSquare,
} from 'lucide-react'
import { listMeetings, type Meeting, type MeetingStatus } from '../../api/client'

const STATUS_LABEL: Record<MeetingStatus, string> = {
  recording: '录制中',
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
}
const STATUS_BADGE_CLS: Record<MeetingStatus, string> = {
  recording:  'is-orange',
  processing: 'is-blue',
  completed:  'is-green',
  failed:     'is-red',
}
const STATUS_ICON: Record<MeetingStatus, typeof Mic> = {
  recording:  Mic,
  processing: Loader2,
  completed:  CheckCircle2,
  failed:     AlertCircle,
}

function StatusBadge({ status }: { status: MeetingStatus }) {
  const cls = STATUS_BADGE_CLS[status] ?? 'is-gray'
  const Icon = STATUS_ICON[status] ?? Clock
  return (
    <span className={`rd-badge ${cls}`} style={{ gap: 5 }}>
      <Icon size={10} className={status === 'processing' ? 'animate-spin' : ''} />
      {STATUS_LABEL[status] || status}
    </span>
  )
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function NewProjectMeetingsDrawer({
  projectId, open, onClose,
}: { projectId: string; open: boolean; onClose: () => void }) {
  const nav = useNavigate()

  const { data: meetings, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['project-meetings', projectId],
    queryFn: () => listMeetings({ project_id: projectId }),
    enabled: open,
    refetchInterval: (q: any) => {
      const items = (q.state.data ?? []) as Meeting[]
      return items.some(m => m.status === 'processing' || m.status === 'recording') ? 8000 : false
    },
  })

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const list = meetings ?? []

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'rgba(15, 18, 36, 0.20)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          animation: 'rd-fade-up .2s var(--rd-ease) both',
        }}
      />
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 50,
        width: 'min(720px, 100vw)',
        background: 'rgba(255,255,255,0.08)',
        backdropFilter: 'blur(40px) saturate(180%)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
        display: 'flex', flexDirection: 'column',
        borderLeft: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 25px 50px -12px rgba(15, 18, 36, .25), inset 1px 0 0 rgba(255,255,255,0.10)',
        animation: 'rd-fade-up .25s var(--rd-ease) both',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid var(--rd-line)',
        }}>
          <h2 style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontSize: 15, fontWeight: 700, color: 'var(--rd-text)', margin: 0,
          }}>
            <MessageSquare size={15} color="var(--rd-accent-2)" />
            关联会议
            <span style={{ fontSize: 12, color: 'var(--rd-text-3)', fontWeight: 400 }}>
              {list.length} 场
            </span>
          </h2>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => nav(`/console/meeting/new?project_id=${projectId}`)}
              className="rd-btn rd-btn-primary"
              style={{ padding: '5px 12px', fontSize: 12 }}
              title="新建会议(默认关联到本项目)"
            >
              <Plus size={11} /> 新建
            </button>
            <button
              onClick={() => refetch()}
              className="rd-icon-btn"
              style={{ width: 28, height: 28 }}
              title="刷新"
              disabled={isFetching}
            >
              <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="rd-icon-btn" style={{ width: 28, height: 28 }} title="关闭">
              <X size={13} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isLoading && (
            <div style={{ textAlign: 'center', padding: '32px 0', fontSize: 13, color: 'var(--rd-text-3)' }}>
              <Loader2 size={16} className="animate-spin" style={{ display: 'inline', marginRight: 8 }} /> 加载中
            </div>
          )}
          {!isLoading && list.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 16px', fontSize: 13, color: 'var(--rd-text-3)' }}>
              <MessageSquare size={22} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
              <p style={{ margin: 0 }}>本项目还没有关联会议</p>
              <p style={{ fontSize: 12, marginTop: 6, color: 'var(--rd-text-3)' }}>
                上方点「新建」开始上传录音 / 文本,或在已有会议详情页改其关联项目。
              </p>
            </div>
          )}
          {!isLoading && list.map(m => (
            <button
              key={m.id}
              onClick={() => { onClose(); nav(`/console/meeting/${m.id}`) }}
              style={{
                textAlign: 'left',
                padding: '12px 14px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--rd-line)',
                borderRadius: 10,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex', flexDirection: 'column', gap: 6,
                transition: 'background .15s, border-color .15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                e.currentTarget.style.borderColor = 'rgba(255,141,26,.35)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                e.currentTarget.style.borderColor = 'var(--rd-line)'
              }}
              title="查看会议详情"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  flex: 1, minWidth: 0,
                  fontSize: 13.5, fontWeight: 600, color: 'var(--rd-text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {m.title || '未命名会议'}
                </span>
                <StatusBadge status={m.status} />
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                fontSize: 11.5, color: 'var(--rd-text-3)',
              }}>
                <span>开始 {formatTime(m.start_time)}</span>
                {m.status === 'processing' && m.total_chunks > 0 && (
                  <span style={{ color: '#38BDF8' }}>
                    {m.done_chunks}/{m.total_chunks} 切片
                  </span>
                )}
                {m.meeting_minutes?.action_items && m.meeting_minutes.action_items.length > 0 && (
                  <span>{m.meeting_minutes.action_items.length} 待办</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
