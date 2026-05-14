import { useState } from 'react'
import { Plus, LayoutGrid, List, Search, ArrowUpRight } from 'lucide-react'
import GlowCard from '../components/GlowCard'

type Project = {
  name: string
  client: string
  start: string
  docs: number
  ratio: number   // 0-1 完成度
  modules: string[]
  hue: string
}

const PROJECTS: Project[] = [
  { name: '海尔智家全渠道项目', client: '海尔智家',   start: '2026-04-12', docs: 38, ratio: 0.82, modules: ['销售', 'BI', '审批'], hue: 'linear-gradient(90deg, #FF8D1A, #D96400)' },
  { name: '美的集团 CRM 升级',   client: '美的集团',   start: '2026-03-30', docs: 24, ratio: 0.61, modules: ['销售', '客服'],       hue: 'linear-gradient(90deg, #8B5CF6, #6D28D9)' },
  { name: '蒙牛乳业渠道改造',     client: '蒙牛乳业',   start: '2026-02-18', docs: 17, ratio: 0.94, modules: ['销售', '渠道', '订单'], hue: 'linear-gradient(90deg, #22D3EE, #0E7490)' },
  { name: '伊利股份配额管理',     client: '伊利股份',   start: '2026-05-02', docs: 9,  ratio: 0.32, modules: ['订单', '财务'],       hue: 'linear-gradient(90deg, #34D399, #059669)' },
  { name: '中粮集团验收试点',     client: '中粮集团',   start: '2026-01-12', docs: 28, ratio: 0.75, modules: ['销售', 'BI'],         hue: 'linear-gradient(90deg, #FF8D1A, #FFB066)' },
  { name: '光明乳业 BI 接入',     client: '光明乳业',   start: '2026-05-08', docs: 6,  ratio: 0.18, modules: ['BI', '数据'],        hue: 'linear-gradient(90deg, #F472B6, #BE185D)' },
]

function RingPct({ ratio }: { ratio: number }) {
  const r = 18
  const c = 2 * Math.PI * r
  return (
    <div className="rd-mini-ring">
      <svg viewBox="0 0 44 44">
        <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(15, 18, 36, .06)" strokeWidth="3" />
        <circle
          cx="22" cy="22" r={r}
          fill="none"
          stroke="url(#rdRingGrad)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${ratio * c} ${c}`}
          transform="rotate(-90 22 22)"
          style={{ filter: 'drop-shadow(0 0 4px rgba(255,141,26,.6))', transition: 'stroke-dasharray 1s var(--rd-ease)' }}
        />
        <defs>
          <linearGradient id="rdRingGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#FF8D1A" />
            <stop offset="100%" stopColor="#FFB066" />
          </linearGradient>
        </defs>
      </svg>
      <div className="rd-mini-ring-label">{Math.round(ratio * 100)}</div>
    </div>
  )
}

export default function Projects() {
  const [view, setView] = useState<'grid' | 'list'>('grid')

  return (
    <div className="rd-page">
      <div className="rd-page-head">
        <h1>项目</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            display: 'flex',
            border: '1px solid var(--rd-line)',
            borderRadius: 10,
            padding: 2,
            background: 'rgba(15, 18, 36, .03)',
          }}>
            {(['grid', 'list'] as const).map(v => {
              const Icon = v === 'grid' ? LayoutGrid : List
              const active = view === v
              return (
                <button
                  key={v}
                  onClick={() => setView(v)}
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
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--rd-text-3)' }} />
            <input className="rd-input" placeholder="搜索项目" style={{ width: 200, padding: '8px 12px 8px 32px', fontSize: 12.5 }} />
          </div>
          <button className="rd-btn rd-btn-primary"><Plus size={13} /> 新建</button>
        </div>
      </div>

      {view === 'grid' && (
        <div className="rd-grid-3 rd-stagger">
          {PROJECTS.map((p, i) => (
            <GlowCard key={p.name} interactive style={{ animationDelay: `${i * 60}ms`, padding: 0, overflow: 'hidden' }}>
              {/* Gradient strip */}
              <div style={{ height: 4, background: p.hue, transition: 'height .35s var(--rd-ease)' }}
                   className="rd-card-strip" />

              <div style={{ padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h3 style={{
                      fontSize: 16, fontWeight: 700, color: 'var(--rd-text)',
                      marginBottom: 4,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{p.name}</h3>
                    <p style={{ fontSize: 12, color: 'var(--rd-text-2)', margin: 0 }}>{p.client}</p>
                  </div>
                  <RingPct ratio={p.ratio} />
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
                  {p.modules.map(m => <span key={m} className="rd-badge is-gray">{m}</span>)}
                </div>

                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  paddingTop: 14, borderTop: '1px solid var(--rd-line)',
                  fontSize: 11.5, color: 'var(--rd-text-3)',
                }}>
                  <span>立项 · {p.start}</span>
                  <span style={{ color: 'var(--rd-text-2)' }}>
                    <span style={{ color: 'var(--rd-text)', fontWeight: 600 }}>{p.docs}</span> 份文档
                  </span>
                </div>
              </div>
            </GlowCard>
          ))}

          {/* Add new */}
          <GlowCard interactive style={{
            padding: 0, minHeight: 220,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px dashed var(--rd-line-strong)',
            background: 'transparent',
            animationDelay: `${PROJECTS.length * 60}ms`,
          }}>
            <div style={{ textAlign: 'center', color: 'var(--rd-text-2)' }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                margin: '0 auto 12px',
                background: 'linear-gradient(135deg, rgba(255,141,26,.18), rgba(255,141,26,.04))',
                border: '1px solid rgba(255,141,26,.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--rd-accent)',
                boxShadow: 'var(--rd-accent-glow)',
              }}>
                <Plus size={20} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>新建项目</div>
            </div>
          </GlowCard>
        </div>
      )}

      {view === 'list' && (
        <GlowCard style={{ padding: 0 }}>
          <table className="rd-table">
            <thead>
              <tr>
                <th>项目</th>
                <th>客户</th>
                <th>立项</th>
                <th>模块</th>
                <th>文档</th>
                <th>完成度</th>
                <th style={{ width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {PROJECTS.map(p => (
                <tr key={p.name}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 3, height: 22, borderRadius: 2, background: p.hue }} />
                      <span style={{ fontSize: 13, color: 'var(--rd-text)', fontWeight: 500 }}>{p.name}</span>
                    </div>
                  </td>
                  <td><span style={{ fontSize: 12.5, color: 'var(--rd-text-2)' }}>{p.client}</span></td>
                  <td><span className="rd-mono" style={{ fontSize: 11.5, color: 'var(--rd-text-3)' }}>{p.start}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {p.modules.map(m => <span key={m} className="rd-badge is-gray">{m}</span>)}
                    </div>
                  </td>
                  <td><span style={{ color: 'var(--rd-text)', fontWeight: 600 }}>{p.docs}</span></td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 140 }}>
                      <div style={{ flex: 1, height: 4, background: 'rgba(15, 18, 36, .05)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{
                          width: `${p.ratio * 100}%`, height: '100%',
                          background: 'linear-gradient(90deg, var(--rd-accent), var(--rd-accent-2))',
                          boxShadow: '0 0 6px var(--rd-accent)',
                          transition: 'width .8s var(--rd-ease)',
                        }} />
                      </div>
                      <span className="rd-mono" style={{ fontSize: 11.5, color: 'var(--rd-accent-2)' }}>
                        {Math.round(p.ratio * 100)}%
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="rd-row-actions" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button className="rd-icon-btn" style={{ width: 28, height: 28 }}>
                        <ArrowUpRight size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlowCard>
      )}
    </div>
  )
}
