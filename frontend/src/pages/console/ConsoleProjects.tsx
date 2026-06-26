import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderKanban, Search, CheckCircle2, Circle, Loader2, Building2, Calendar, Files, Plus } from 'lucide-react'
import { listProjects, listStageSummary, getProjectMeta, type StageStatusRow } from '../../api/client'
import ProjectFormModal from '../../components/ProjectFormModal'
import DeleteProjectControl from '../../components/DeleteProjectControl'
import { deriveStageBadges, type DerivedBadge } from '../../lib/stageBadges'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

// 卡片阶段徽章最多展示这么多,多出来的折成「+N」,保证卡片高度整齐
const MAX_STAGE_BADGES = 4

function StageBadge({ badge }: { badge: DerivedBadge }) {
  const { label, color, icon: Icon, status } = badge
  const done = status === 'done', inflight = status === 'inflight'
  return (
    <div
      className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${
        done ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
             : inflight ? 'bg-blue-50 border-blue-200 text-blue-700'
             : 'bg-gray-50 border-line text-ink-muted'
      }`}
      title={`${label}：${done ? '已生成' : inflight ? '生成中' : '未开始'}`}
    >
      {done ? <CheckCircle2 size={10} /> : inflight ? <Loader2 size={10} className="animate-spin" /> : <Circle size={10} />}
      <Icon size={10} style={{ color }} />
      {label}
    </div>
  )
}

export default function ConsoleProjects() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => listProjects() })
  const { data: stageRows } = useQuery({
    queryKey: ['stage-summary'],
    queryFn: () => listStageSummary(),
    refetchInterval: (qq) => {
      const items = qq.state.data ?? []
      return items.some((b: StageStatusRow) => b.status === 'pending' || b.status === 'generating') ? 5000 : false
    },
  })
  const { data: meta } = useQuery({ queryKey: ['project-meta'], queryFn: getProjectMeta })

  const industryMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const i of meta?.industries ?? []) m[i.value] = i.label
    return m
  }, [meta])

  const filtered = useMemo(() => {
    const list = projects ?? []
    if (!q.trim()) return list
    const kw = q.trim().toLowerCase()
    return list.filter(p =>
      p.name.toLowerCase().includes(kw) ||
      (p.customer ?? '').toLowerCase().includes(kw) ||
      (p.industry ?? '').toLowerCase().includes(kw)
    )
  }, [projects, q])

  const bundles = stageRows ?? []

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-5">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50 border border-orange-100 text-orange-700 text-xs font-medium mb-3">
          <FolderKanban size={11} /> 项目管理
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-ink leading-tight mb-1">所有项目</h1>
        <p className="text-sm text-ink-secondary">点击项目卡片进入详情：阶段推进 · 关联文档 · 项目对话</p>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="搜索项目名 / 客户 / 行业"
            className="w-full pl-9 pr-3 py-2 text-sm border border-line rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-300 bg-white"
          />
        </div>
        <span className="text-xs text-ink-muted">共 {filtered.length} 个项目</span>
        <button
          onClick={() => setCreateOpen(true)}
          className="ml-auto flex items-center gap-1.5 px-4 py-2 text-white text-sm font-medium rounded-lg shadow-sm hover:shadow transition-all"
          style={{ background: 'linear-gradient(135deg, #FF8D1A, #D96400)' }}
        >
          <Plus size={14} /> 新增项目
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white p-12 text-center text-sm text-ink-muted">
          {projects?.length === 0 ? '还没有项目，去后台「项目库」创建一个' : '没有匹配的项目'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => {
            const allBadges = deriveStageBadges(p.id, bundles)
            const shown = allBadges.slice(0, MAX_STAGE_BADGES)
            const extra = allBadges.length - shown.length
            return (
            <div key={p.id} className="relative group h-full">
            <button
              onClick={() => nav(`/console/projects/${p.id}`)}
              className="w-full h-full group text-left rounded-2xl border border-line bg-white hover:shadow-md hover:border-orange-200 transition-all p-5 flex flex-col gap-3.5"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm" style={{ background: BRAND_GRAD }}>
                  <Building2 size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-ink truncate group-hover:text-[#D96400] transition-colors">{p.name}</p>
                  <p className="text-xs text-ink-muted truncate mt-0.5">
                    {p.customer || '未填客户'}
                    {p.industry && <> · {industryMap[p.industry] || p.industry}</>}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {shown.map(badge => (
                  <StageBadge key={badge.kind} badge={badge} />
                ))}
                {extra > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] text-ink-muted bg-canvas border border-line">
                    +{extra}
                  </span>
                )}
              </div>

              <div className="mt-auto pt-3 border-t border-line text-[11px] text-ink-muted flex items-center justify-between">
                <span className="inline-flex items-center gap-1"><Files size={11} />{p.document_count} 份</span>
                <span className="inline-flex items-center gap-1"><Calendar size={11} />{p.kickoff_date || '未填立项'}</span>
              </div>
            </button>
            <DeleteProjectControl project={p} variant="card" />
            </div>
            )
          })}
        </div>
      )}

      <ProjectFormModal
        open={createOpen}
        meta={meta}
        initial={null}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false)
          qc.invalidateQueries({ queryKey: ['projects'] })
        }}
      />
    </div>
  )
}
