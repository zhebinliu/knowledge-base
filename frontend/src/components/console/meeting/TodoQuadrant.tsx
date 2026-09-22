/**
 * 待办优先级四象限图 — 一个项目维护一套,在会议详情页「洞察」tab 里快速查看。
 *
 * ⚠️ 轴是「紧急 × 必要」,**不是**经典的「重要 × 紧急」—— 这是用户明确的口径。
 *    象限由两轴派生,`quadrant === null` 即「未分类」(新同步进来、模型判不了的都在这)。
 *
 * 交互:HTML5 拖拽把待办 chip 拖到别的象限 → `PATCH /todos/{id}` 写两轴。
 * 拖过之后后端把 quadrant_source 标成 `manual`,自动分类从此不再覆盖它
 * —— 用户拖出来的位置是最终意见。想让它重新参与自动分类,拖回「未分类」区。
 *
 * 为什么不用 recharts:4 个象限各自要当拖拽落点,图表库给不了可放置区域。
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info, Loader2, RefreshCw, Sparkles, Inbox } from 'lucide-react'
import {
  classifyProjectTodosQuadrant,
  getProjectTodos,
  patchTodo,
  syncProjectTodos,
  type ProjectTodo,
  type QuadrantKey,
  type Urgency,
  type Necessity,
} from '../../../api/client'
import { toast } from '../../Toaster'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

type ZoneKey = QuadrantKey | 'unclassified'

const QUADRANTS: {
  key: QuadrantKey
  label: string
  hint: string
  urgency: Urgency
  necessity: Necessity
  accent: string
  bg: string
}[] = [
  {
    key: 'urgent_necessary',
    label: '必要且紧急',
    hint: '优先做',
    urgency: 'urgent',
    necessity: 'necessary',
    accent: '#B91C1C',
    bg: '#FEF2F2',
  },
  {
    key: 'necessary_not_urgent',
    label: '必要不紧急',
    hint: '排期做',
    urgency: 'not_urgent',
    necessity: 'necessary',
    accent: '#B45309',
    bg: '#FFFBEB',
  },
  {
    key: 'urgent_unnecessary',
    label: '紧急非必要',
    hint: '尽快脱手 / 委派',
    urgency: 'urgent',
    necessity: 'not_necessary',
    accent: '#C2410C',
    bg: '#FFF7ED',
  },
  {
    key: 'neither',
    label: '不紧急不必要',
    hint: '可砍可缓',
    urgency: 'not_urgent',
    necessity: 'not_necessary',
    accent: '#6B7280',
    bg: '#F9FAFB',
  },
]

const STATUS_LABEL: Record<string, string> = { pending: '待办', doing: '进行中', done: '已完成' }

function TodoChip({
  todo,
  dragging,
  onDragStart,
  onDragEnd,
  onClear,
}: {
  todo: ProjectTodo
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onClear?: () => void
}) {
  const done = todo.status === 'done'
  const overdue =
    !done && todo.due_date ? new Date(todo.due_date) < new Date(new Date().toDateString()) : false

  return (
    <div
      draggable
      onDragStart={(e) => {
        // 必须 setData,否则 Firefox 不触发 drop
        e.dataTransfer.setData('text/plain', String(todo.id))
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      className={`group cursor-grab rounded-md border border-line bg-white px-2 py-1.5 text-xs shadow-sm active:cursor-grabbing ${
        dragging ? 'opacity-40' : ''
      }`}
      title={todo.source_quote || todo.content}
    >
      <div className={`leading-snug ${done ? 'text-ink-muted line-through' : 'text-ink'}`}>
        {todo.content}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-ink-muted">
        {todo.assignee && <span>{todo.assignee}</span>}
        {todo.due_date && (
          <span className={overdue ? 'font-medium text-red-600' : ''}>
            {todo.due_date}
            {overdue && ' 已逾期'}
          </span>
        )}
        <span>{STATUS_LABEL[todo.status] ?? todo.status}</span>
        {todo.quadrant_source === 'llm' && <span title="由 AI 判定,可拖拽覆盖">AI</span>}
        {todo.meeting_title && <span className="max-w-[9rem] truncate">· {todo.meeting_title}</span>}
        {onClear && (
          <button
            onClick={onClear}
            className="ml-auto hidden text-ink-muted hover:text-ink group-hover:inline"
            title="移出象限:回到未分类,之后可被自动分类重新判定"
          >
            移出
          </button>
        )}
      </div>
    </div>
  )
}

/** 一个可放置区域。拖拽悬停时用该象限的强调色描边 + 底色反馈,让落点明确。 */
function DropZone({
  label,
  hint,
  accent,
  bg,
  dashed,
  todos,
  dragging,
  onDrop,
  onChipDragStart,
  onChipDragEnd,
  onClear,
  emptyText,
  children,
}: {
  label: string
  hint: string
  accent: string
  bg: string
  dashed?: boolean
  todos: ProjectTodo[]
  dragging: boolean
  onDrop?: (id: number) => void
  onChipDragStart: (id: number) => void
  onChipDragEnd: () => void
  onClear?: (id: number) => void
  emptyText: string
  children?: React.ReactNode
}) {
  const [over, setOver] = useState(false)
  const active = over && dragging && Boolean(onDrop)
  return (
    <div
      onDragOver={
        onDrop
          ? (e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setOver(true)
            }
          : undefined
      }
      onDragLeave={onDrop ? () => setOver(false) : undefined}
      onDrop={
        onDrop
          ? (e) => {
              e.preventDefault()
              setOver(false)
              const id = Number(e.dataTransfer.getData('text/plain'))
              if (Number.isFinite(id) && id > 0) onDrop(id)
            }
          : undefined
      }
      className={`flex min-h-[128px] flex-col rounded-lg border p-2 transition-colors ${
        dashed ? 'border-dashed' : ''
      }`}
      style={{
        borderColor: active ? accent : '#E5E7EB',
        background: active ? bg : undefined,
      }}
    >
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-xs font-semibold" style={{ color: accent }}>
          {label}
        </span>
        <span className="text-[10px] text-ink-muted">{hint}</span>
        <span className="ml-auto text-[10px] text-ink-muted">{todos.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        {todos.map((t) => (
          <TodoChip
            key={t.id}
            todo={t}
            dragging={false}
            onDragStart={() => onChipDragStart(t.id)}
            onDragEnd={onChipDragEnd}
            onClear={onClear ? () => onClear(t.id) : undefined}
          />
        ))}
        {todos.length === 0 && <p className="m-auto text-[10px] text-ink-muted">{emptyText}</p>}
        {children}
      </div>
    </div>
  )
}

export default function TodoQuadrant({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [draggingId, setDraggingId] = useState<number | null>(null)

  const todosQ = useQuery({
    queryKey: ['project-todos', projectId],
    queryFn: () => getProjectTodos(projectId),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['project-todos', projectId] })

  const moveMut = useMutation({
    mutationFn: ({
      id,
      urgency,
      necessity,
    }: {
      id: number
      urgency: Urgency | ''
      necessity: Necessity | ''
    }) => patchTodo(id, { urgency, necessity }),
    onSuccess: invalidate,
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : '移动失败'),
  })

  const classifyMut = useMutation({
    mutationFn: () => classifyProjectTodosQuadrant(projectId, { only_unclassified: false }),
    onSuccess: (r) => {
      invalidate()
      if (r.error) {
        toast.error(`重新分类失败:${r.error}`)
      } else if (r.updated === 0) {
        toast.info(
          r.manual_skipped > 0
            ? `没有可重判的条目(${r.manual_skipped} 条是你手工拖拽的,不会被覆盖)`
            : '没有可重判的条目',
        )
      } else {
        toast.success(
          `已重判 ${r.updated} 条` +
            (r.unclassified ? `,${r.unclassified} 条依据不足保持未分类` : '') +
            (r.truncated ? '(条目过多,本次只处理了一部分)' : ''),
        )
      }
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : '重新分类失败'),
  })

  const syncMut = useMutation({
    mutationFn: () => syncProjectTodos(projectId),
    onSuccess: (r) => {
      invalidate()
      toast.success(
        r.imported > 0
          ? `已导入 ${r.imported} 条待办,正在后台判定象限…`
          : `没有新待办(已扫描 ${r.meetings_scanned} 场会议)`,
      )
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : '同步失败'),
  })

  const grouped = useMemo(() => {
    const map: Record<ZoneKey, ProjectTodo[]> = {
      urgent_necessary: [],
      necessary_not_urgent: [],
      urgent_unnecessary: [],
      neither: [],
      unclassified: [],
    }
    for (const t of todosQ.data ?? []) {
      const zone: ZoneKey = t.quadrant && t.quadrant in map ? t.quadrant : 'unclassified'
      map[zone].push(t)
    }
    return map
  }, [todosQ.data])

  const total = todosQ.data?.length ?? 0
  const manualCount = (todosQ.data ?? []).filter((t) => t.quadrant_source === 'manual').length
  const withReason = (todosQ.data ?? []).filter((t) => t.quadrant_meta?.reason)

  if (todosQ.isLoading) {
    return (
      <div className="py-8 text-center text-ink-muted">
        <Loader2 size={20} className="mx-auto animate-spin" />
      </div>
    )
  }

  if (todosQ.isError) {
    return <p className="py-6 text-center text-sm text-ink-muted">待办加载失败,请稍后重试</p>
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
          <Sparkles size={12} /> 象限由 AI 判定,可拖拽覆盖
        </span>
        <span className="text-ink-muted">
          共 {total} 条
          {manualCount > 0 && ` · ${manualCount} 条为你手工拖拽`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-ink-secondary hover:bg-canvas disabled:opacity-50"
            title="从本项目所有会议的 action_items 导入新待办,后台自动判定象限"
          >
            {syncMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            同步会议待办
          </button>
          <button
            onClick={() => classifyMut.mutate()}
            disabled={classifyMut.isPending || total === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-ink-secondary hover:bg-canvas disabled:opacity-50"
            title="重判所有非手工拖拽的条目"
          >
            {classifyMut.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Sparkles size={12} />
            )}
            重新分类
          </button>
        </div>
      </div>

      {total === 0 ? (
        <div className="py-8 text-center text-ink-muted">
          <Inbox size={26} className="mx-auto mb-2" />
          <p className="mb-3 text-sm">本项目还没有待办</p>
          <button
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm text-white disabled:opacity-50"
            style={{ background: BRAND_GRAD }}
          >
            {syncMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            从会议同步待办
          </button>
        </div>
      ) : (
        <>
          {/* 2×2。窄屏两列会让 chip 挤成一条,故单列堆叠。 */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {QUADRANTS.map((q) => (
              <DropZone
                key={q.key}
                label={q.label}
                hint={q.hint}
                accent={q.accent}
                bg={q.bg}
                todos={grouped[q.key]}
                dragging={draggingId !== null}
                onChipDragStart={setDraggingId}
                onChipDragEnd={() => setDraggingId(null)}
                onClear={
                  grouped[q.key].some((t) => t.quadrant_source === 'manual')
                    ? (id) => moveMut.mutate({ id, urgency: '', necessity: '' })
                    : undefined
                }
                emptyText="拖待办到这里"
                onDrop={(id) => moveMut.mutate({ id, urgency: q.urgency, necessity: q.necessity })}
              />
            ))}
          </div>

          {/* 未分类区:既是待处理收件箱,也是把人工条目交还自动分类的入口 */}
          <div className="mt-3">
            <DropZone
              label="未分类"
              hint="AI 依据不足或尚未判定 · 拖到上方象限即完成人工分类"
              accent="#9CA3AF"
              bg="#F9FAFB"
              dashed
              todos={grouped.unclassified}
              dragging={draggingId !== null}
              onChipDragStart={setDraggingId}
              onChipDragEnd={() => setDraggingId(null)}
              onDrop={(id) => moveMut.mutate({ id, urgency: '', necessity: '' })}
              emptyText="全部已分类"
            />
          </div>

          <p className="mt-2 flex items-start gap-1 text-[11px] text-ink-muted">
            <Info size={12} className="mt-0.5 shrink-0" />
            手动拖拽的条目会被标记为人工判定,「重新分类」不会再改动它们;要交还给 AI,把它拖回「未分类」或点 chip 上的「移出」。
          </p>

          {withReason.length > 0 && (
            <details className="mt-2 text-[11px] text-ink-muted">
              <summary className="cursor-pointer">查看 AI 判定依据({withReason.length} 条)</summary>
              <ul className="mt-1.5 space-y-0.5">
                {withReason.map((t) => (
                  <li key={t.id}>
                    <span className="text-ink-secondary">{t.content}</span> — {t.quadrant_meta?.reason}
                    {typeof t.quadrant_meta?.confidence === 'number' &&
                      `(置信度 ${t.quadrant_meta.confidence.toFixed(2)})`}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}

/** 象限中文名 —— 供别处(如待办列表徽标)复用 */
export const QUADRANT_LABEL: Record<QuadrantKey, string> = {
  urgent_necessary: '必要且紧急',
  urgent_unnecessary: '紧急非必要',
  necessary_not_urgent: '必要不紧急',
  neither: '不紧急不必要',
}
