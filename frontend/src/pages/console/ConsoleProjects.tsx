import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FolderKanban, Search, CheckCircle2, Circle, Loader2, Building2, Calendar, Files, Plus,
  LayoutGrid, List,
} from 'lucide-react'
import { listProjects, listStageSummary, getProjectMeta, type StageStatusRow } from '../../api/client'
import ProjectFormModal from '../../components/ProjectFormModal'
import DeleteProjectControl from '../../components/DeleteProjectControl'
import { deriveStageBadges, type DerivedBadge } from '../../lib/stageBadges'
import { useProjectViewMode } from '../../lib/projectViewMode'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

// 卡片阶段徽章最多展示这么多,多出来的折成「+N」,保证卡片高度整齐
const MAX_STAGE_BADGES = 4

// 列表视图同样折叠徽章 —— 保证每行单行高度一致,列表才有「密集可扫」的价值
const MAX_STAGE_BADGES_ROW = 4

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
  const [view, setView] = useProjectViewMode()

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
        <p className="text-sm text-ink-secondary">点击项目进入详情：阶段推进 · 关联文档 · 项目对话</p>
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

        {/* 视图切换 —— 卡片 / 列表,选择记在 localStorage */}
        <div className="ml-auto flex items-center rounded-lg border border-line bg-white p-0.5">
          {([['grid', LayoutGrid, '卡片视图'], ['list', List, '列表视图']] as const).map(([v, Icon, title]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              title={title}
              aria-label={title}
              aria-pressed={view === v}
              className={`inline-flex items-center justify-center w-8 h-7 rounded-md transition-colors ${
                view === v ? 'bg-orange-50 text-[#D96400]' : 'text-ink-muted hover:text-ink hover:bg-gray-50'
              }`}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>

        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-white text-sm font-medium rounded-lg shadow-sm hover:shadow transition-all"
          style={{ background: 'linear-gradient(135deg, #FF8D1A, #D96400)' }}
        >
          <Plus size={14} /> 新增项目
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white p-12 text-center text-sm text-ink-muted">
          {projects?.length === 0 ? '还没有项目，去后台「项目库」创建一个' : '没有匹配的项目'}
        </div>
      ) : view === 'list' ? (
        <div className="rounded-2xl border border-line bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-canvas border-b border-line text-[11px] text-ink-muted">
                  <th className="text-left font-medium px-4 py-2.5">项目</th>
                  <th className="text-left font-medium px-4 py-2.5 hidden md:table-cell">客户 / 行业</th>
                  <th className="text-left font-medium px-4 py-2.5 hidden lg:table-cell">阶段进展</th>
                  <th className="text-right font-medium px-4 py-2.5 whitespace-nowrap">文档</th>
                  <th className="text-left font-medium px-4 py-2.5 hidden sm:table-cell whitespace-nowrap">立项日期</th>
                  <th className="px-4 py-2.5 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const allBadges = deriveStageBadges(p.id, bundles)
                  const shown = allBadges.slice(0, MAX_STAGE_BADGES_ROW)
                  const extra = allBadges.length - shown.length
                  return (
                    <tr
                      key={p.id}
                      onClick={() => nav(`/console/projects/${p.id}`)}
                      className="border-b border-line last:border-b-0 hover:bg-orange-50/40 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: BRAND_GRAD }}>
                            <Building2 size={13} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-ink truncate max-w-[220px]">{p.name}</p>
                            {/* 窄屏藏了客户列,这里补一行 */}
                            <p className="text-[11px] text-ink-muted truncate max-w-[220px] md:hidden">
                              {p.customer || '未填客户'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="truncate max-w-[240px]" title={`${p.customer || '未填客户'}${p.industry ? ` · ${industryMap[p.industry] || p.industry}` : ''}`}>
                          <span className="text-ink-secondary text-[13px]">{p.customer || '未填客户'}</span>
                          {p.industry && (
                            <span className="text-ink-muted text-[13px]"> · {industryMap[p.industry] || p.industry}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {/* nowrap + 子元素不压缩:徽章既不折行也不被挤到文字断行,保证每行等高 */}
                        <div className="flex flex-nowrap gap-1.5 [&>*]:shrink-0 [&>*]:whitespace-nowrap">
                          {shown.map(badge => (
                            <StageBadge key={badge.kind} badge={badge} />
                          ))}
                          {extra > 0 && (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] text-ink-muted bg-canvas border border-line"
                              title={allBadges.slice(MAX_STAGE_BADGES_ROW).map(b => b.label).join('、')}
                            >
                              +{extra}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-[12px] text-ink-secondary">
                          <Files size={11} className="text-ink-muted" />{p.document_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-[12px] text-ink-muted">
                          <Calendar size={11} />{p.kickoff_date || '未填立项'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <DeleteProjectControl project={p} variant="row" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
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
