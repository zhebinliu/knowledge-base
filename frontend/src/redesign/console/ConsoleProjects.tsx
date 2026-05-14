/**
 * NewConsoleProjects — 对外工作台项目列表(Liquid Glass)
 *
 * 功能 100% 等价于生产 `frontend/src/pages/console/ConsoleProjects.tsx`:
 *   - listProjects + listOutputs(5s refetch 当 pending/generating)+ getProjectMeta
 *   - 搜索过滤(name / customer / industry)
 *   - 3 个 stage badge(项目洞察 / 启动会 / 需求调研)— 实时状态:已生成/生成中/未开始
 *   - 点卡片跳 /console/projects/:id
 *   - 新增项目按钮 → ProjectFormModal(复用老组件,功能完整)
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search, FileText, ClipboardList, Lightbulb,
  CheckCircle2, Circle, Loader2, Building2, Calendar, Files, Plus, FolderKanban,
} from 'lucide-react'
import { listProjects, listOutputs, getProjectMeta, type Project, type CuratedBundle } from '../../api/client'
import ProjectFormModal from '../../components/ProjectFormModal'
import GlowCard from '../components/GlowCard'

const STAGES = [
  { kind: 'insight',       label: '项目洞察', icon: Lightbulb,     color: '#7C3AED' },
  { kind: 'kickoff_pptx',  label: '启动会',   icon: FileText,      color: '#D96400' },
  { kind: 'survey',        label: '需求调研', icon: ClipboardList, color: '#2563EB' },
] as const

function StageBadge({ project, kind, label, color, Icon, bundles }: {
  project: Project; kind: string; label: string; color: string; Icon: typeof FileText; bundles: CuratedBundle[]
}) {
  const has = bundles.find(b => b.project_id === project.id && b.kind === kind && b.status === 'done')
  const inflight = bundles.find(b => b.project_id === project.id && b.kind === kind && (b.status === 'pending' || b.status === 'generating'))
  const cls = has ? 'is-green' : inflight ? 'is-blue' : 'is-gray'
  return (
    <span
      className={`rd-badge ${cls}`}
      title={`${label}:${has ? '已生成' : inflight ? '生成中' : '未开始'}`}
      style={{ gap: 5 }}
    >
      {has ? <CheckCircle2 size={9} /> : inflight ? <Loader2 size={9} className="animate-spin" /> : <Circle size={9} />}
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

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => listProjects(),
  })
  const { data: outputs } = useQuery({
    queryKey: ['outputs', 'all'],
    queryFn: () => listOutputs({ page: 1 }),
    refetchInterval: (qq) => {
      const items = qq.state.data?.items ?? []
      return items.some((b: CuratedBundle) => b.status === 'pending' || b.status === 'generating') ? 5000 : false
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

  const bundles = outputs?.items ?? []

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
          点击项目卡片进入详情:阶段推进 · 关联文档 · 项目对话
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
        <button
          onClick={() => setCreateOpen(true)}
          className="rd-btn rd-btn-primary"
          style={{ marginLeft: 'auto' }}
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
      ) : (
        <div className="rd-grid-3 rd-stagger" style={{ gap: 16 }}>
          {filtered.map((p, i) => (
            <GlowCard
              key={p.id}
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

              {/* Stage badges */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {STAGES.map(s => (
                  <StageBadge
                    key={s.kind}
                    project={p}
                    kind={s.kind}
                    label={s.label}
                    color={s.color}
                    Icon={s.icon}
                    bundles={bundles}
                  />
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
