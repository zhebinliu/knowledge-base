import { Link } from 'react-router-dom'
import { MessageSquare, Brain, Sparkles, Mic, ArrowRight, Clock } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'

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
    to: '/console/pm',
    icon: Brain,
    title: 'PM 视角分析',
    desc: '指定客户项目，以 PM 的视角生成状态 / 决策 / 风险 / 下一步四维分析。',
    color: 'from-purple-50 to-blue-50',
    iconBg: 'bg-purple-100',
    iconColor: '#7C3AED',
    cta: '选择项目',
  },
  {
    to: '/console/outputs',
    icon: Sparkles,
    title: '输出中心',
    desc: '一键生成启动会 PPT、调研问卷、项目洞察报告，直接交付给客户 / 实施团队。',
    color: 'from-emerald-50 to-teal-50',
    iconBg: 'bg-emerald-100',
    iconColor: '#059669',
    cta: '生成交付物',
  },
  {
    to: '/console/meeting',
    icon: Mic,
    title: '会议纪要',
    desc: '接入 AI 会议系统后，自动生成纪要 + 行动项 + 沉淀到对应项目知识库。',
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

  return (
    <div className="max-w-5xl mx-auto">
      {/* Hero */}
      <div className="mb-10">
        <p className="text-sm text-ink-muted mb-1">你好，{display} 👋</p>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-ink leading-tight mb-2">
          需要做什么？
        </h1>
        <p className="text-sm text-ink-secondary max-w-xl">
          从下面的任务卡进入——实施工作台会调用知识库里已经沉淀好的内容，输出你能直接拿去客户现场的交付物。
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
        {CARDS.map(({ to, icon: Icon, title, desc, color, iconBg, iconColor, cta, disabled }) => {
          const body = (
            <div
              className={[
                'group relative rounded-2xl border border-line bg-gradient-to-br p-5 sm:p-6 h-full transition-all',
                color,
                disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-[#FF8D1A] hover:shadow-md cursor-pointer',
              ].join(' ')}
            >
              <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center mb-4`}>
                <Icon size={18} style={{ color: iconColor }} />
              </div>
              <p className="font-semibold text-ink mb-1">{title}</p>
              <p className="text-xs text-ink-secondary leading-relaxed mb-4">{desc}</p>
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

      {/* Quick tips */}
      <div
        className="rounded-2xl p-5 sm:p-6 border border-orange-100"
        style={{ background: 'linear-gradient(135deg,#FFF4E6,#FFFFFF)' }}
      >
        <p className="text-sm font-semibold text-ink mb-2">💡 工作台使用提示</p>
        <ul className="space-y-1.5 text-sm text-ink-secondary leading-relaxed">
          <li>• 所有知识来源于 <span className="font-medium">kb.tokenwave.cloud</span> 已审核的切片</li>
          <li>• PM 视角和输出中心需要你先绑定具体的客户项目</li>
          <li>• 生成的交付物可以下载为 Markdown / PDF / PPT / Word，直接交付给客户</li>
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
