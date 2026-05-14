import { Link } from 'react-router-dom'
import {
  MessageSquare, FolderKanban, Mic, ArrowUpRight,
  CheckCircle2, Loader2, Building2, Lightbulb, ClipboardList,
} from 'lucide-react'
import GlowCard from '../components/GlowCard'
import CountUp from '../components/CountUp'

// 真实生产数据形态(mock):活跃项目 / 已生成交付物 / 处理中
const STATS = [
  { label: '活跃项目',     value: 18,  Icon: Building2,    color: '#D96400' },
  { label: '已生成交付物', value: 247, Icon: CheckCircle2, color: '#059669' },
  { label: '处理中',       value: 3,   Icon: Loader2,      color: '#0E7490', spin: true },
]

// 与生产 ConsoleHome 三入口一致:知识问答 / 项目管理 / 会议纪要
const ENTRIES = [
  {
    to:    '/redesign/qa',
    Icon:  MessageSquare,
    title: '知识问答',
    desc:  '自然语言提问知识库,得到有来源的结构化答案。多轮对话 + 收藏 + 反馈',
    cta:   '立即提问',
  },
  {
    to:    '/redesign/projects',
    Icon:  FolderKanban,
    title: '项目管理',
    desc:  '以项目串联阶段交付物:项目洞察 / 启动会 PPT / 需求调研。点击项目进入阶段推进',
    cta:   '进入项目',
    sub:   [
      { Icon: Lightbulb,     label: '项目洞察', to: '/redesign/insight' },
      { Icon: ClipboardList, label: '需求调研', to: '/redesign/survey' },
    ],
  },
  {
    to:    '/redesign/console',
    Icon:  Mic,
    title: '会议纪要',
    desc:  '接入 AI 会议系统后,自动生成纪要 + 行动项 + 关联到对应项目知识库',
    cta:   '即将上线',
    disabled: true,
  },
]

const RECENT_PROJECTS = [
  { name: '海尔智家全渠道项目', stage: '需求调研', ratio: 0.62 },
  { name: '美的集团 CRM 升级',  stage: '项目洞察', ratio: 0.18 },
  { name: '蒙牛乳业渠道改造',    stage: '启动会',   ratio: 0.94 },
  { name: '伊利股份配额管理',    stage: '需求调研', ratio: 0.32 },
]

const RECENT_OUTPUTS = [
  { kind: '项目洞察', project: '海尔智家',  at: '今天 14:22' },
  { kind: '启动会 PPT', project: '蒙牛乳业', at: '今天 11:08' },
  { kind: '需求调研', project: '美的集团',  at: '昨天 18:46' },
  { kind: '项目洞察', project: '伊利股份',  at: '昨天 15:30' },
]

export default function ConsoleHome() {
  return (
    <div className="rd-page">
      {/* Hero(简洁,功能性) */}
      <div className="rd-stagger" style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 13, color: 'var(--rd-text-3)', margin: 0, marginBottom: 4 }}>
          你好,刘哲滨 <span style={{ filter: 'grayscale(0.3)' }}>👋</span>
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
                  <CountUp to={s.value} />
                </div>
              </div>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: `linear-gradient(135deg, ${s.color}28, ${s.color}10)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: s.color,
                flexShrink: 0,
              }}>
                <s.Icon size={18} className={s.spin ? 'animate-spin' : ''} />
              </div>
            </div>
          </GlowCard>
        ))}
      </div>

      {/* 3 主入口 */}
      <div className="rd-grid-3 rd-stagger" style={{ marginBottom: 32 }}>
        {ENTRIES.map((e, i) => {
          const Icon = e.Icon
          const card = (
            <GlowCard
              interactive={!e.disabled}
              glow={!e.disabled && i === 1}
              style={{ padding: 24, minHeight: 180, animationDelay: `${i * 70 + 200}ms`, opacity: e.disabled ? 0.55 : 1 }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: e.disabled
                  ? 'linear-gradient(135deg, rgba(15, 18, 36, 0.06), rgba(15, 18, 36, 0.02))'
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

              {/* 项目管理 — 二级入口 */}
              {e.sub && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                  {e.sub.map(s => (
                    <Link
                      key={s.label}
                      to={s.to}
                      onClick={ev => ev.stopPropagation()}
                      className="rd-chip"
                      style={{ textDecoration: 'none' }}
                    >
                      <s.Icon size={11} />
                      {s.label}
                    </Link>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{
                  fontSize: 12,
                  color: e.disabled ? 'var(--rd-text-3)' : 'var(--rd-accent-2)',
                  fontWeight: 600,
                }}>
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

      {/* 最近项目 + 最近交付物 */}
      <div className="rd-grid-2 rd-stagger" style={{ gap: 16 }}>
        <GlowCard style={{ padding: 0, overflow: 'hidden', animationDelay: '500ms' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--rd-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--rd-text)' }}>最近项目</h3>
            <Link to="/redesign/projects" style={{ fontSize: 12, color: 'var(--rd-accent-2)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              全部 <ArrowUpRight size={12} />
            </Link>
          </div>
          <div>
            {RECENT_PROJECTS.map((p, idx) => (
              <div key={p.name} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 20px',
                borderBottom: idx < RECENT_PROJECTS.length - 1 ? '1px solid var(--rd-line)' : 'none',
                cursor: 'pointer',
                transition: 'background .2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(15, 18, 36, .025)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--rd-text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--rd-text-3)', marginTop: 3 }}>当前阶段 · {p.stage}</div>
                </div>
                <div style={{ width: 100 }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 10.5, color: 'var(--rd-accent-2)', marginBottom: 4, fontFamily: 'ui-monospace, monospace' }}>
                    {Math.round(p.ratio * 100)}%
                  </div>
                  <div style={{ height: 3, background: 'rgba(15, 18, 36, .06)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      width: `${p.ratio * 100}%`, height: '100%',
                      background: 'linear-gradient(90deg, var(--rd-accent), #FFB066)',
                      transition: 'width .8s var(--rd-ease)',
                    }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </GlowCard>

        <GlowCard style={{ padding: 0, overflow: 'hidden', animationDelay: '560ms' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--rd-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--rd-text)' }}>最近交付物</h3>
            <span style={{ fontSize: 11, color: 'var(--rd-text-3)' }}>过去 48 小时</span>
          </div>
          <div>
            {RECENT_OUTPUTS.map((o, idx) => (
              <div key={idx} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 20px',
                borderBottom: idx < RECENT_OUTPUTS.length - 1 ? '1px solid var(--rd-line)' : 'none',
                cursor: 'pointer',
                transition: 'background .2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(15, 18, 36, .025)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span className="rd-badge is-orange">{o.kind}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--rd-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.project}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--rd-text-3)', fontFamily: 'ui-monospace, monospace' }}>{o.at}</span>
              </div>
            ))}
          </div>
        </GlowCard>
      </div>
    </div>
  )
}
