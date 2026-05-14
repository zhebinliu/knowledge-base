import { FileText, Layers, Folder, ClipboardCheck, TrendingUp, ArrowUpRight } from 'lucide-react'
import GlowCard from '../components/GlowCard'
import CountUp from '../components/CountUp'

const STATS = [
  { label: 'Documents',  value: 247,  trend: '+12.4%', icon: FileText,       sparkColor: '#FF8D1A' },
  { label: 'Chunks',     value: 1892, trend: '+8.1%',  icon: Layers,         sparkColor: '#8B5CF6' },
  { label: 'Projects',   value: 18,   trend: '+2',     icon: Folder,         sparkColor: '#22D3EE' },
  { label: 'Pending',    value: 6,    trend: '-3',     icon: ClipboardCheck, sparkColor: '#34D399' },
]

const PROCESSING = [
  { label: '已完成', value: 215, color: '#34D399' },
  { label: '处理中', value: 18,  color: '#FF8D1A' },
  { label: '待审核', value: 8,   color: '#22D3EE' },
  { label: '失败',   value: 6,   color: '#F87171' },
]

const QUEUE = [
  { title: '海尔智家 SOW v3.pdf',   tag: 'SOW',    age: '12 分钟前',  state: 'orange' },
  { title: '美的集团交接清单.docx',  tag: '交接单', age: '38 分钟前',  state: 'orange' },
  { title: '蒙牛 QA 复盘.md',       tag: 'QA',     age: '1 小时前',   state: 'blue' },
  { title: '中粮验收报告.pptx',     tag: '验收',   age: '3 小时前',   state: 'blue' },
  { title: '伊利合同附件 A.pdf',    tag: '合同',   age: '昨天 18:22', state: 'violet' },
]

function MiniSpark({ color }: { color: string }) {
  // Random-ish sparkline path
  const pts = [4, 12, 8, 18, 14, 22, 16, 28]
  const max = Math.max(...pts)
  const w = 80, h = 28
  const step = w / (pts.length - 1)
  const path = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * step},${h - (v / max) * h}`).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={`sg-${color}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.45" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L ${w},${h} L 0,${h} Z`} fill={`url(#sg-${color})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
    </svg>
  )
}

function Donut() {
  const total = PROCESSING.reduce((s, p) => s + p.value, 0)
  const r = 78, cx = 100, cy = 100
  const c = 2 * Math.PI * r
  let offset = 0

  return (
    <svg viewBox="0 0 200 200" width="220" height="220">
      <defs>
        <linearGradient id="rdDonutOrange" x1="0" x2="1">
          <stop offset="0%" stopColor="#FF8D1A" />
          <stop offset="100%" stopColor="#D96400" />
        </linearGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(15, 18, 36, .05)" strokeWidth="16" />
      {PROCESSING.map((p, i) => {
        const len = (p.value / total) * c
        const seg = (
          <circle
            key={p.label}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={p.color}
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{
              filter: `drop-shadow(0 0 6px ${p.color}aa)`,
              animation: `rd-donut-grow .8s var(--rd-ease) ${i * 0.12}s both`,
              transformOrigin: `${cx}px ${cy}px`,
            }}
          />
        )
        offset += len
        return seg
      })}
      <text x={cx} y={cy - 8} textAnchor="middle" fill="var(--rd-text)" fontSize="32" fontWeight="800" letterSpacing="-0.04em" style={{ fontFamily: 'inherit' }}>
        {total}
      </text>
      <text x={cx} y={cy + 18} textAnchor="middle" fill="var(--rd-text-3)" fontSize="10.5" letterSpacing="0.15em" style={{ fontFamily: 'inherit', textTransform: 'uppercase' }}>
        文档总数
      </text>
    </svg>
  )
}

export default function Dashboard() {
  return (
    <div className="rd-page">
      <style>{`
        @keyframes rd-donut-grow { from { stroke-dasharray: 0 9999; } }
      `}</style>

      <div className="rd-page-head">
        <h1>总览</h1>
        <div className="rd-page-meta">实时 · 每 30 秒刷新</div>
      </div>

      {/* Stats */}
      <div className="rd-grid-4 rd-stagger" style={{ marginBottom: 28 }}>
        {STATS.map((s, i) => {
          const Icon = s.icon
          const isDown = s.trend.startsWith('-')
          return (
            <GlowCard key={s.label} interactive style={{ animationDelay: `${i * 70}ms`, padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
                <div className="rd-stat-label">{s.label}</div>
                <div style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: `linear-gradient(135deg, ${s.sparkColor}33, ${s.sparkColor}0a)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: s.sparkColor,
                }}>
                  <Icon size={14} />
                </div>
              </div>
              <div className="rd-stat-value">
                <CountUp to={s.value} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                <div className={`rd-stat-trend${isDown ? ' is-down' : ''}`}>
                  <TrendingUp size={11} style={{ transform: isDown ? 'scaleY(-1)' : 'none' }} />
                  {s.trend}
                </div>
                <MiniSpark color={s.sparkColor} />
              </div>
            </GlowCard>
          )
        })}
      </div>

      {/* Donut + Queue */}
      <div style={{ display: 'grid', gridTemplateColumns: '5fr 4fr', gap: 16 }}>
        <GlowCard style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--rd-text)' }}>处理进度</h3>
            <span style={{ fontSize: 11, color: 'var(--rd-text-3)' }}>过去 7 天</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24, alignItems: 'center' }}>
            <Donut />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {PROCESSING.map(p => {
                const pct = Math.round((p.value / PROCESSING.reduce((s, x) => s + x.value, 0)) * 100)
                return (
                  <div key={p.label}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, boxShadow: `0 0 8px ${p.color}` }} />
                        <span style={{ color: 'var(--rd-text)' }}>{p.label}</span>
                      </span>
                      <span style={{ color: 'var(--rd-text-2)' }}>
                        <span style={{ color: 'var(--rd-text)', fontWeight: 600 }}>{p.value}</span> · {pct}%
                      </span>
                    </div>
                    <div style={{ height: 4, background: 'rgba(15, 18, 36, .04)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        width: `${pct}%`, height: '100%',
                        background: p.color,
                        boxShadow: `0 0 8px ${p.color}`,
                        transition: 'width .9s var(--rd-ease)',
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </GlowCard>

        <GlowCard shimmer style={{ padding: 0 }}>
          <div style={{ padding: '20px 24px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--rd-text)' }}>审核队列</h3>
            <a href="#" style={{ fontSize: 12, color: 'var(--rd-accent-2)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              全部 <ArrowUpRight size={12} />
            </a>
          </div>
          <div style={{ padding: '4px 12px 16px' }}>
            {QUEUE.map(q => (
              <div key={q.title} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px',
                borderRadius: 10,
                transition: 'background .2s',
                cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(15, 18, 36, .03)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--rd-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--rd-text-3)', marginTop: 3 }}>{q.age}</div>
                </div>
                <span className={`rd-badge is-${q.state}`}>{q.tag}</span>
              </div>
            ))}
          </div>
        </GlowCard>
      </div>
    </div>
  )
}
