import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  MessageSquare, FolderKanban, Mic, ArrowRight, Clock,
  CheckCircle2, Loader2, Sparkles, Building2,
} from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { listProjects, listOutputs, type CuratedBundle } from '../../api/client'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

const CARDS = [
  {
    to: '/console/qa',
    icon: MessageSquare,
    title: '知识问答',
    desc: '用自然语言提问知识库，得到有来源的结构化答案。多轮对话 + 收藏 + 反馈。',
    color: 'from-orange-50 to-rose-50',
    iconBg: 'bg-orange-100',
    iconColor: '#D96400',
    cta: '立即提问',
  },
  {
    to: '/console/projects',
    icon: FolderKanban,
    title: '项目管理',
    desc: '以项目为中心串联阶段交付物：项目洞察 / 启动会 PPT / 需求调研问卷。点击项目进入阶段推进。',
    color: 'from-orange-50 to-amber-50',
    iconBg: 'bg-orange-100',
    iconColor: '#D96400',
    cta: '进入项目',
  },
  {
    to: '/console/meeting',
    icon: Mic,
    title: '会议纪要',
    desc: '接入 AI 会议系统后，自动生成纪要 + 行动项 + 关联到对应客户项目知识库。',
    color: 'from-gray-50 to-slate-50',
    iconBg: 'bg-gray-100',
    iconColor: '#6B7280',
    cta: '即将上线',
    disabled: true,
  },
]

export default function ConsoleHome() {
  const { user } = useAuth()
  const display = user?.full_name || user?.username || '同事'

  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => listProjects() })
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

  const KIND_LABEL: Record<string, string> = {
    insight: '项目洞察',
    kickoff_pptx: '启动会 PPT',
    survey: '需求调研',
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Hero */}
      <div className="mb-8">
        <p className="text-sm text-ink-muted mb-1">你好，{display} 👋</p>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-ink leading-tight mb-2">
          需要做什么？
        </h1>
        <p className="text-sm text-ink-secondary max-w-xl">
          实施工作台围绕「项目」串联——从项目洞察 / 启动会 / 需求调研一直到交付，所有内容都基于已沉淀的客户知识库。
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <StatCard icon={Building2} label="活跃项目" value={projectCount} color="#D96400" bg="bg-orange-50" />
        <StatCard icon={CheckCircle2} label="已生成交付物" value={doneCount} color="#059669" bg="bg-emerald-50" />
        <StatCard
          icon={inflightCount > 0 ? Loader2 : Sparkles}
          spin={inflightCount > 0}
          label={inflightCount > 0 ? '后台进行中' : '可生成的阶段'}
          value={inflightCount > 0 ? inflightCount : '—'}
          color="#2563EB" bg="bg-blue-50"
        />
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {CARDS.map(({ to, icon: Icon, title, desc, color, iconBg, iconColor, cta, disabled }) => {
          const body = (
            <div
              className={[
                'group relative rounded-2xl border border-line bg-gradient-to-br p-5 h-full transition-all flex flex-col',
                color,
                disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-[#FF8D1A] hover:shadow-md cursor-pointer',
              ].join(' ')}
            >
              <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center mb-3`}>
                <Icon size={18} style={{ color: iconColor }} />
              </div>
              <p className="font-semibold text-ink mb-1">{title}</p>
              <p className="text-xs text-ink-secondary leading-relaxed mb-4 flex-1">{desc}</p>
              <div className="flex items-center gap-1 text-xs font-medium" style={{ color: disabled ? '#9CA3AF' : iconColor }}>
                {disabled && <Clock size={11} />}
                {cta}
                {!disabled && <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />}
              </div>
            </div>
          )
          return disabled ? (
            <div key={to}>{body}</div>
          ) : (
            <Link key={to} to={to} className="block">
              {body}
            </Link>
          )
        })}
      </div>

      {/* Recent rows */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <Panel title="最近项目" emptyHint="还没有项目" link="/console/projects" linkText="查看全部">
          {recentProjects.length === 0 ? null : (
            <ul className="divide-y divide-line">
              {recentProjects.map(p => (
                <li key={p.id}>
                  <Link
                    to={`/console/projects/${p.id}`}
                    className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-orange-50/50 transition-colors"
                  >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: BRAND_GRAD }}>
                      <Building2 size={12} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink truncate">{p.name}</p>
                      <p className="text-[11px] text-ink-muted truncate">{p.customer || '未填客户'}</p>
                    </div>
                    <span className="text-[11px] text-ink-muted shrink-0">{p.document_count} 份文档</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="最近生成" emptyHint="尚无交付物，去项目里生成第一个" link="/console/projects" linkText="去项目">
          {recentDoneBundles.length === 0 ? null : (
            <ul className="divide-y divide-line">
              {recentDoneBundles.map(b => (
                <li key={b.id} className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                      <CheckCircle2 size={12} className="text-emerald-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink truncate">{KIND_LABEL[b.kind] || b.kind}</p>
                      <p className="text-[11px] text-ink-muted truncate">
                        {projectName(b.project_id)}
                        {b.updated_at && <> · {new Date(b.updated_at).toLocaleDateString('zh-CN')}</>}
                      </p>
                    </div>
                    {b.project_id && (
                      <Link
                        to={`/console/projects/${b.project_id}`}
                        className="text-[11px] text-orange-700 hover:underline shrink-0"
                      >查看</Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Quick tips */}
      <div
        className="rounded-2xl p-5 border border-orange-100"
        style={{ background: 'linear-gradient(135deg,#FFF4E6,#FFFFFF)' }}
      >
        <p className="text-sm font-semibold text-ink mb-2">💡 工作台使用提示</p>
        <ul className="space-y-1.5 text-sm text-ink-secondary leading-relaxed">
          <li>• 所有知识来源于 <span className="font-medium">kb.tokenwave.cloud</span> 已审核的切片</li>
          <li>• 进入「项目管理」后，每个阶段卡片都可点击对话生成对应交付物</li>
          <li>• 项目详情页右上「关联文档」可查看本项目所有原始文档预览</li>
          <li>• 生成的交付物可下载为 Markdown / PDF / PPT / Word，直接交付给客户</li>
        </ul>
        {user?.is_admin && (
          <p className="mt-3 text-xs text-ink-muted">
            你是管理员，随时可从账户菜单进入 <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-line">/</span> 知识库后台管理文档与切片。
          </p>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color, bg, spin }: {
  icon: typeof Building2; label: string; value: number | string; color: string; bg: string; spin?: boolean
}) {
  return (
    <div className="bg-white border border-line rounded-2xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
        <Icon size={16} style={{ color }} className={spin ? 'animate-spin' : undefined} />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-ink leading-none">{value}</p>
        <p className="text-[11px] text-ink-muted mt-1.5">{label}</p>
      </div>
    </div>
  )
}

function Panel({ title, children, emptyHint, link, linkText }: {
  title: string; children: React.ReactNode; emptyHint: string; link: string; linkText: string
}) {
  const hasContent = !!children
  return (
    <div className="bg-white border border-line rounded-2xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-line flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <Link to={link} className="text-xs text-orange-700 hover:underline">{linkText} →</Link>
      </div>
      {hasContent ? children : (
        <div className="p-8 text-center text-xs text-ink-muted">{emptyHint}</div>
      )}
    </div>
  )
}
