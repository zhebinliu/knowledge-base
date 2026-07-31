/**
 * NewConsoleProjects — 对外工作台项目列表(Liquid Glass)
 *
 * 功能 100% 等价于生产 `frontend/src/pages/console/ConsoleProjects.tsx`:
 *   - listProjects + listOutputs(5s refetch 当 pending/generating)+ getProjectMeta
 *   - 搜索过滤(name / customer / industry)
 *   - 3 个 stage badge(项目洞察 / 启动会 / 需求调研)— 实时状态:已生成/生成中/未开始
 *   - 点卡片跳 /console/projects/:id
 *   - 新增项目按钮 → ProjectFormModal(复用老组件,功能完整)
 *   - 卡片 / 列表 视图切换(useProjectViewMode,与生产页共用记忆)
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search, CheckCircle2, Circle, Loader2, Building2, Calendar, Files, Plus, FolderKanban,
  LayoutGrid, List,
} from 'lucide-react'
import { listProjects, listStageSummary, getProjectMeta, type StageStatusRow } from '../../api/client'
import ProjectFormModal from '../../components/ProjectFormModal'
import DeleteProjectControl from '../../components/DeleteProjectControl'
import GlowCard from '../components/GlowCard'
import { deriveStageBadges, type DerivedBadge } from '../../lib/stageBadges'
import { useProjectViewMode } from '../../lib/projectViewMode'

// 列表视图折叠徽章 —— 保证每行单行高度一致,列表才有「密集可扫」的价值
const MAX_STAGE_BADGES_ROW = 4

function StageBadge({ badge }: { badge: DerivedBadge }) {
  const { label, color, icon: Icon, status } = badge
  const done = status === 'done', inflight = status === 'inflight'
  const cls = done ? 'is-green' : inflight ? 'is-blue' : 'is-gray'
  return (
    <span
      className={`rd-badge ${cls}`}
      title={`${label}:${done ? '已生成' : inflight ? '生成中' : '未开始'}`}
      style={{ gap: 5 }}
    >
      {done ? <CheckCircle2 size={9} /> : inflight ? <Loader2 size={9} className="animate-spin" /> : <Circle size={9} />}
      <Icon size={9} style={{ color }} />
      {label}
    </span>
  )
}

export default function NewConsoleProjects() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [view, setView] = useProjectViewMode()

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => listProjects(),
  })
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
    <div className="rd-page">
      {/* Hero */}
      <div className="rd-stagger" style={{ marginBottom: 22 }}>
        <span className="rd-chip is-active" style={{ marginBottom: 10 }}>
          <FolderKanban size={11} /> 项目管理
        </span>
        <h1 style={{
          fontSize: 28, fontWeight: 800, color: 'var(--rd-text)',
          letterSpacing: '-0.025em', lineHeight: 1.1, margin: 0, marginBottom: 6,
        }}>所有项目</h1>
        <p style={{ fontSize: 13.5, color: 'var(--rd-text-2)', margin: 0 }}>
          点击项目进入详情:阶段推进 · 关联文档 · 项目对话
        </p>
      </div>

      {/* 搜索 + 新增 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
          <Search size={13} style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--rd-text-3)', pointerEvents: 'none',
          }} />
          <input
            className="rd-input"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="搜索项目名 / 客户 / 行业"
            style={{ paddingLeft: 36, fontSize: 13, padding: '10px 12px 10px 36px' }}
          />
        </div>
        <span style={{ fontSize: 12, color: 'var(--rd-text-3)' }}>共 {filtered.length} 个项目</span>

        {/* 视图切换 —— 卡片 / 列表,选择记在 localStorage */}
        <div style={{
          marginLeft: 'auto',
          display: 'flex',
          border: '1px solid var(--rd-line)',
          borderRadius: 10,
          padding: 2,
          background: 'rgba(15, 18, 36, .03)',
        }}>
          {([['grid', LayoutGrid, '卡片视图'], ['list', List, '列表视图']] as const).map(([v, Icon, title]) => {
            const active = view === v
            return (
              <button
                key={v}
                onClick={() => setView(v)}
                title={title}
                aria-label={title}
                aria-pressed={active}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 28,
                  border: 'none',
                  background: active ? 'rgba(255,141,26,.12)' : 'transparent',
                  color: active ? 'var(--rd-accent-2)' : 'var(--rd-text-3)',
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'all .2s',
                }}
              >
                <Icon size={13} />
              </button>
            )
          })}
        </div>

        <button
          onClick={() => setCreateOpen(true)}
          className="rd-btn rd-btn-primary"
        >
          <Plus size={13} /> 新增项目
        </button>
      </div>

      {/* 列表 */}
      {isLoading ? (
        <div className="rd-grid-3" style={{ gap: 16 }}>
          {[1, 2, 3].map(i => (
            <GlowCard key={i} style={{ padding: 22, minHeight: 160 }}>
              <div className="rd-skel" style={{ height: 18, width: '60%', marginBottom: 10 }} />
              <div className="rd-skel" style={{ height: 12, width: '40%', marginBottom: 18 }} />
              <div className="rd-skel" style={{ height: 10, width: '90%' }} />
            </GlowCard>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <GlowCard style={{
          padding: '48px 24px', textAlign: 'center',
          border: '1px dashed var(--rd-line-strong)',
          background: 'transparent',
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            margin: '0 auto 14px',
            background: 'linear-gradient(135deg, rgba(255,141,26,.16), rgba(255,141,26,.04))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--rd-accent-2)',
          }}>
            <FolderKanban size={20} />
          </div>
          <p style={{ fontSize: 13, color: 'var(--rd-text-2)', margin: 0 }}>
            {projects?.length === 0 ? '还没有项目,去后台「项目库」创建一个' : '没有匹配的项目'}
          </p>
        </GlowCard>
      ) : view === 'list' ? (
        <GlowCard style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="rd-table">
              <thead>
                <tr>
                  <th>项目</th>
                  <th>客户 / 行业</th>
                  <th>阶段进展</th>
                  <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>文档</th>
                  <th style={{ whiteSpace: 'nowrap' }}>立项日期</th>
                  <th style={{ width: 56 }} />
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
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: 9, flexShrink: 0,
                            background: 'linear-gradient(135deg, var(--rd-accent), var(--rd-accent-2))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff',
                          }}>
                            <Building2 size={13} />
                          </div>
                          <span style={{
                            fontSize: 13, fontWeight: 600, color: 'var(--rd-text)',
                            maxWidth: 220,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{p.name}</span>
                        </div>
                      </td>
                      <td>
                        <div
                          style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={`${p.customer || '未填客户'}${p.industry ? ` · ${industryMap[p.industry] || p.industry}` : ''}`}
                        >
                          <span style={{ fontSize: 12.5, color: 'var(--rd-text-2)' }}>
                            {p.customer || '未填客户'}
                          </span>
                          {p.industry && (
                            <span style={{ fontSize: 12.5, color: 'var(--rd-text-3)' }}>
                              {' '}· {industryMap[p.industry] || p.industry}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="rd-badge-row">
                          {shown.map(badge => (
                            <StageBadge key={badge.kind} badge={badge} />
                          ))}
                          {extra > 0 && (
                            <span
                              className="rd-badge is-gray"
                              title={allBadges.slice(MAX_STAGE_BADGES_ROW).map(b => b.label).join('、')}
                            >
                              +{extra}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: 'var(--rd-text-2)' }}>
                          <Files size={11} style={{ color: 'var(--rd-text-3)' }} />
                          <span style={{ fontWeight: 600 }}>{p.document_count}</span>
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--rd-text-3)' }}>
                          <Calendar size={11} />
                          {p.kickoff_date || '未填立项'}
                        </span>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="rd-row-actions" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <DeleteProjectControl project={p} variant="row" />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </GlowCard>
      ) : (
        <div className="rd-grid-3 rd-stagger" style={{ gap: 16 }}>
          {filtered.map((p, i) => (
            <div key={p.id} className="relative group">
            <GlowCard
              interactive
              onClick={() => nav(`/console/projects/${p.id}`)}
              style={{ padding: 22, minHeight: 180, animationDelay: `${i * 50}ms` }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 11, flexShrink: 0,
                  background: 'linear-gradient(135deg, var(--rd-accent), var(--rd-accent-2))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff',
                  boxShadow: '0 4px 12px -2px rgba(255,141,26,.45)',
                }}>
                  <Building2 size={16} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h3 style={{
                    fontSize: 15, fontWeight: 700, color: 'var(--rd-text)',
                    margin: 0, marginBottom: 4,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{p.name}</h3>
                  <p style={{
                    fontSize: 12, color: 'var(--rd-text-3)', margin: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {p.customer || '未填客户'}
                    {p.industry && <> · {industryMap[p.industry] || p.industry}</>}
                  </p>
                </div>
              </div>

              {/* Stage badges — 生成了啥就显示啥(deriveStageBadges) */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {deriveStageBadges(p.id, bundles).map(badge => (
                  <StageBadge key={badge.kind} badge={badge} />
                ))}
              </div>

              {/* 底部信息 */}
              <div style={{
                paddingTop: 12, borderTop: '1px solid var(--rd-line)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                fontSize: 12, color: 'var(--rd-text-3)',
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Files size={11} />
                  <span style={{ color: 'var(--rd-text-2)', fontWeight: 500 }}>{p.document_count}</span> 份
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Calendar size={11} />
                  {p.kickoff_date || '未填立项'}
                </span>
              </div>
            </GlowCard>
            <DeleteProjectControl project={p} variant="card" />
            </div>
          ))}
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
