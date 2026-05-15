/**
 * NewConsoleHome — uat 下的对外工作台首页(深色 Liquid Glass 版本)
 *
 * 功能 100% 等价于生产 `frontend/src/pages/console/ConsoleHome.tsx`:
 *   - useAuth() 取用户
 *   - useQuery listProjects():  projectCount、recentProjects(4 项)
 *   - useQuery listOutputs():   doneCount、inflightCount、recentDoneBundles(4 项)
 *     带 refetchInterval(有 pending/generating 时 5s 刷新)
 *   - 3 Stats + 3 入口卡 + 最近项目/最近生成 + 工作台使用提示
 *
 * 视觉换成 Liquid Glass(浅色玻璃 + 微彩 mesh + count-up + glow chips)
 */
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  MessageSquare, FolderKanban, Mic, ArrowUpRight, Clock,
  CheckCircle2, Loader2, Sparkles, Building2,
} from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { listProjects, listOutputs, type CuratedBundle } from '../../api/client'
import GlowCard from '../components/GlowCard'
import CountUp from '../components/CountUp'

const KIND_LABEL: Record<string, string> = {
  insight: '项目洞察',
  kickoff_pptx: '启动会 PPT',
  kickoff_html: '启动会 HTML',
  survey: '需求调研',
}

type EntryCard = {
  to: string
  Icon: typeof MessageSquare
  title: string
  desc: string
  cta: string
  color: string
  glow?: boolean
  disabled?: boolean
}
const ENTRY_CARDS: EntryCard[] = [
  {
    to: '/console/qa',
    Icon: MessageSquare,
    title: '知识问答',
    desc:  '自然语言提问知识库,得到有来源的结构化答案。多轮对话 + 收藏 + 反馈',
    cta:   '立即提问',
    color: '#D96400',
  },
  {
    to: '/console/projects',
    Icon: FolderKanban,
    title: '项目管理',
    desc:  '以项目串联阶段交付物:项目洞察 / 启动会 PPT / 需求调研。点击项目进入阶段推进',
    cta:   '进入项目',
    color: '#D96400',
    glow:  true,
  },
  {
    to: '/console/meeting',
    Icon: Mic,
    title: '会议纪要',
    desc:  '上传录音 / 粘贴文本,AI 自动生成纪要、待办、需求清单和干系人图谱',
    cta:   '进入会议',
    color: '#D96400',
  },
]

export default function NewConsoleHome() {
  const { user } = useAuth()
  const display = user?.full_name || user?.username || '同事'

  const { data: projects, isLoading: projectsLoading } = useQuery({
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

  const projectCount = projects?.length ?? 0
  const bundles = outputs?.items ?? []
  const doneCount = bundles.filter(b => b.status === 'done').length
  const inflightCount = bundles.filter(b => b.status === 'pending' || b.status === 'generating').length

  const recentProjects = (projects ?? []).slice(0, 4)
  const recentDoneBundles = bundles
    .filter(b => b.status === 'done')
    .sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''))
    .slice(0, 4)

  const projectName = (id: string | null | undefined) =>
    projects?.find(p => p.id === id)?.name || '—'

  const STATS = [
    { label: '活跃项目',     value: projectCount, Icon: Building2,                                   color: '#D96400' },
    { label: '已生成交付物', value: doneCount,    Icon: CheckCircle2,                                color: '#34D399' },
    { label: '处理中',       value: inflightCount, Icon: inflightCount > 0 ? Loader2 : Sparkles,    color: '#38BDF8', spin: inflightCount > 0 },
  ]

  return (
    <div className="rd-page">
      {/* Hero */}
      <div className="rd-stagger" style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 13, color: 'var(--rd-text-3)', margin: 0, marginBottom: 4 }}>
          你好,{display} <span style={{ filter: 'grayscale(0.3)' }}>👋</span>
        </p>
        <h1 style={{
          fontSize: 30, fontWeight: 800, color: 'var(--rd-text)',
          letterSpacing: '-0.025em', lineHeight: 1.1, margin: 0, marginBottom: 8,
        }}>
          需要做什么?
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--rd-text-2)', margin: 0, maxWidth: 580, lineHeight: 1.6 }}>
          实施工作台围绕「项目」串联 —— 从洞察 / 启动会 / 需求调研一直到交付,所有内容基于已沉淀的客户知识库。
        </p>
      </div>

      {/* Stats(3 张) */}
      <div className="rd-grid-3 rd-stagger" style={{ marginBottom: 24, gap: 14 }}>
        {STATS.map((s, i) => (
          <GlowCard key={s.label} interactive style={{ padding: 20, animationDelay: `${i * 60}ms` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="rd-stat-label">{s.label}</div>
                <div className="rd-stat-value" style={{ fontSize: 32, marginTop: 8 }}>
                  {typeof s.value === 'number' ? <CountUp to={s.value} /> : '—'}
                </div>
              </div>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: `linear-gradient(135deg, ${s.color}28, ${s.color}10)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: s.color, flexShrink: 0,
              }}>
                <s.Icon size={18} className={s.spin ? 'animate-spin' : ''} />
              </div>
            </div>
          </GlowCard>
        ))}
      </div>

      {/* 3 主入口 */}
      <div className="rd-grid-3 rd-stagger" style={{ marginBottom: 32 }}>
        {ENTRY_CARDS.map((e, i) => {
          const Icon = e.Icon
          const card = (
            <GlowCard
              interactive={!e.disabled}
              glow={e.glow}
              style={{ padding: 24, minHeight: 180, animationDelay: `${i * 70 + 200}ms`, opacity: e.disabled ? 0.55 : 1 }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: e.disabled
                  ? 'linear-gradient(135deg, rgba(0,0,0,0.25), rgba(0,0,0,0.25))'
                  : 'linear-gradient(135deg, rgba(255, 141, 26, 0.18), rgba(255, 141, 26, 0.06))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: e.disabled ? 'var(--rd-text-3)' : 'var(--rd-accent-2)',
                marginBottom: 14,
              }}>
                <Icon size={18} />
              </div>

              <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--rd-text)', marginBottom: 6 }}>{e.title}</h3>
              <p style={{ fontSize: 12.5, color: 'var(--rd-text-2)', margin: 0, lineHeight: 1.6, marginBottom: 14 }}>
                {e.desc}
              </p>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{
                  fontSize: 12,
                  color: e.disabled ? 'var(--rd-text-3)' : 'var(--rd-accent-2)',
                  fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  {e.disabled && <Clock size={11} />}
                  {e.cta}
                </span>
                {!e.disabled && <ArrowUpRight size={16} color="var(--rd-accent-2)" />}
              </div>
            </GlowCard>
          )
          return e.disabled
            ? <div key={e.title}>{card}</div>
            : <Link key={e.title} to={e.to} style={{ textDecoration: 'none', color: 'inherit' }}>{card}</Link>
        })}
      </div>

      {/* 最近项目 + 最近生成 */}
      <div className="rd-grid-2 rd-stagger" style={{ gap: 16, marginBottom: 24 }}>
        {/* 最近项目 */}
        <GlowCard style={{ padding: 0, overflow: 'hidden', animationDelay: '500ms' }}>
          <div style={{
            padding: '16px 20px', borderBottom: '1px solid var(--rd-line)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--rd-text)' }}>最近项目</h3>
            <Link to="/console/projects" style={{ fontSize: 12, color: 'var(--rd-accent-2)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              查看全部 <ArrowUpRight size={12} />
            </Link>
          </div>
          {projectsLoading ? (
            <div style={{ padding: 20 }}>
              {[1, 2, 3].map(i => <div key={i} className="rd-skel" style={{ height: 14, marginBottom: 12, width: `${60 + (i * 10) % 30}%` }} />)}
            </div>
          ) : recentProjects.length === 0 ? (
            <div style={{ padding: 36, textAlign: 'center', fontSize: 13, color: 'var(--rd-text-3)' }}>还没有项目</div>
          ) : (
            <div>
              {recentProjects.map((p, idx) => (
                <Link
                  key={p.id}
                  to={`/console/projects/${p.id}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 20px',
                    borderBottom: idx < recentProjects.length - 1 ? '1px solid var(--rd-line)' : 'none',
                    textDecoration: 'none', color: 'inherit',
                    transition: 'background .2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(15, 18, 36, .025)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                    background: 'linear-gradient(135deg, var(--rd-accent), var(--rd-accent-2))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff',
                  }}>
                    <Building2 size={13} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--rd-text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--rd-text-3)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.customer || '未填客户'}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--rd-text-3)', flexShrink: 0, fontFamily: 'ui-monospace, monospace' }}>
                    {p.document_count} 份
                  </span>
                </Link>
              ))}
            </div>
          )}
        </GlowCard>

        {/* 最近生成 */}
        <GlowCard style={{ padding: 0, overflow: 'hidden', animationDelay: '560ms' }}>
          <div style={{
            padding: '16px 20px', borderBottom: '1px solid var(--rd-line)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--rd-text)' }}>最近生成</h3>
            <Link to="/console/projects" style={{ fontSize: 12, color: 'var(--rd-accent-2)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              去项目 <ArrowUpRight size={12} />
            </Link>
          </div>
          {recentDoneBundles.length === 0 ? (
            <div style={{ padding: 36, textAlign: 'center', fontSize: 13, color: 'var(--rd-text-3)' }}>
              尚无交付物,去项目里生成第一个
            </div>
          ) : (
            <div>
              {recentDoneBundles.map((b, idx) => (
                <div key={b.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 20px',
                  borderBottom: idx < recentDoneBundles.length - 1 ? '1px solid var(--rd-line)' : 'none',
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                    background: 'linear-gradient(135deg, rgba(5, 150, 105, .18), rgba(5, 150, 105, .06))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#34D399',
                  }}>
                    <CheckCircle2 size={13} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--rd-text)', fontWeight: 500 }}>
                      {KIND_LABEL[b.kind] || b.kind}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--rd-text-3)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {projectName(b.project_id)}
                      {b.updated_at && <> · {new Date(b.updated_at).toLocaleDateString('zh-CN')}</>}
                    </div>
                  </div>
                  {b.project_id && (
                    <Link
                      to={`/console/projects/${b.project_id}`}
                      style={{ fontSize: 12, color: 'var(--rd-accent-2)', textDecoration: 'none', flexShrink: 0 }}
                    >
                      查看
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </GlowCard>
      </div>

      {/* 工作台使用提示 */}
      <GlowCard glow style={{ padding: 22, animationDelay: '640ms' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Sparkles size={14} color="var(--rd-accent)" />
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--rd-text)', margin: 0 }}>工作台使用提示</p>
        </div>
        <ul style={{ fontSize: 13, color: 'var(--rd-text-2)', lineHeight: 1.75, paddingLeft: 18, margin: 0 }}>
          <li>所有知识来源于 <span style={{ fontWeight: 600, color: 'var(--rd-text)' }}>kb.tokenwave.cloud</span> 已审核的切片</li>
          <li>进入「项目管理」后,每个阶段卡片都可点击对话生成对应交付物</li>
          <li>项目详情页右上「关联文档」可查看本项目所有原始文档预览</li>
          <li>生成的交付物可下载为 Markdown / PDF / PPT / Word,直接交付给客户</li>
        </ul>
        {user?.is_admin && (
          <p style={{ marginTop: 12, fontSize: 12, color: 'var(--rd-text-3)' }}>
            你是管理员,随时可从右下角头像菜单进入 <span className="rd-mono" style={{ background: 'rgba(0,0,0,0.25)', padding: '1px 6px', borderRadius: 4, color: 'var(--rd-text)' }}>/</span> 知识库后台管理文档与切片。
          </p>
        )}
      </GlowCard>
    </div>
  )
}
