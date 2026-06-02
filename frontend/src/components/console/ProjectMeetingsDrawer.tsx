/**
 * ProjectMeetingsDrawer — 项目级关联会议抽屉(legacy 亮色版)
 *
 * 项目详情页点「会议」按钮唤出,列出 Meeting.project_id == projectId 的全部会议。
 * 点击跳 /console/meeting/:id 看纪要;「新建」跳 /console/meeting/new?project_id= 默认关联本项目。
 * 功能对齐 redesign 版 redesign/console/ProjectMeetingsDrawer,仅样式走 Tailwind 亮色。
 */
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { X, Loader2, RefreshCw, Plus, Mic, CheckCircle2, AlertCircle, Clock, MessageSquare } from 'lucide-react'
import { listMeetings, type Meeting, type MeetingStatus } from '../../api/client'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

const STATUS_META: Record<MeetingStatus, { label: string; cls: string; Icon: typeof Mic }> = {
  recording:  { label: '录制中', cls: 'bg-orange-50 border-orange-200 text-orange-700', Icon: Mic },
  processing: { label: '处理中', cls: 'bg-blue-50 border-blue-200 text-blue-700',       Icon: Loader2 },
  completed:  { label: '已完成', cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', Icon: CheckCircle2 },
  failed:     { label: '失败',   cls: 'bg-rose-50 border-rose-200 text-rose-700',         Icon: AlertCircle },
}

function StatusBadge({ status }: { status: MeetingStatus }) {
  const meta = STATUS_META[status] ?? { label: status, cls: 'bg-gray-50 border-line text-ink-muted', Icon: Clock }
  const { Icon } = meta
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${meta.cls}`}>
      <Icon size={10} className={status === 'processing' ? 'animate-spin' : ''} />
      {meta.label}
    </span>
  )
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return '-'
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function ProjectMeetingsDrawer({
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

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[min(720px,100vw)] bg-white border-l border-line shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
          <h2 className="inline-flex items-center gap-2 text-[15px] font-bold text-ink m-0">
            <MessageSquare size={15} className="text-[#D96400]" />
            关联会议
            <span className="text-xs text-ink-muted font-normal">{list.length} 场</span>
          </h2>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => nav(`/console/meeting/new?project_id=${projectId}`)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-white text-xs font-medium"
              style={{ background: BRAND_GRAD }}
              title="新建会议(默认关联到本项目)"
            >
              <Plus size={11} /> 新建
            </button>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-line text-ink-muted hover:bg-canvas disabled:opacity-50"
              title="刷新"
            >
              <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-line text-ink-muted hover:bg-canvas"
              title="关闭"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {isLoading && (
            <div className="text-center py-8 text-sm text-ink-muted">
              <Loader2 size={16} className="animate-spin inline mr-2" /> 加载中
            </div>
          )}
          {!isLoading && list.length === 0 && (
            <div className="text-center px-4 py-10 text-sm text-ink-muted">
              <MessageSquare size={22} className="mx-auto mb-2 opacity-50" />
              <p className="m-0">本项目还没有关联会议</p>
              <p className="text-xs mt-1.5 text-ink-muted">
                上方点「新建」上传录音 / 文本,或在已有会议详情页改其关联项目。
              </p>
            </div>
          )}
          {!isLoading && list.map(m => (
            <button
              key={m.id}
              onClick={() => { onClose(); nav(`/console/meeting/${m.id}`) }}
              className="text-left px-3.5 py-3 rounded-lg border border-line bg-white hover:border-orange-200 hover:bg-orange-50/40 transition-colors flex flex-col gap-1.5"
              title="查看会议详情"
            >
              <div className="flex items-center gap-2">
                <span className="flex-1 min-w-0 text-[13.5px] font-semibold text-ink truncate">
                  {m.title || '未命名会议'}
                </span>
                <StatusBadge status={m.status} />
              </div>
              <div className="flex items-center gap-2.5 text-[11.5px] text-ink-muted">
                <span>开始 {formatTime(m.start_time)}</span>
                {m.status === 'processing' && m.total_chunks > 0 && (
                  <span className="text-blue-600">{m.done_chunks}/{m.total_chunks} 切片</span>
                )}
                {m.meeting_minutes?.action_items && m.meeting_minutes.action_items.length > 0 && (
                  <span>{m.meeting_minutes.action_items.length} 待办</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </>,
    document.body,
  )
}
