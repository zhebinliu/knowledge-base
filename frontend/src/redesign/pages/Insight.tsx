import { useState } from 'react'
import {
  Lightbulb, FileText, Users, ChevronRight,
  Sparkles, Quote, ArrowUpRight, Workflow,
} from 'lucide-react'
import GlowCard from '../components/GlowCard'

const PROJECTS = [
  { id: 'haier',   name: '海尔智家全渠道项目',  client: '海尔智家',   docs: 38, ratio: 0.82 },
  { id: 'midea',   name: '美的集团 CRM 升级',   client: '美的集团',   docs: 24, ratio: 0.61 },
  { id: 'mengniu', name: '蒙牛乳业渠道改造',    client: '蒙牛乳业',   docs: 17, ratio: 0.94 },
  { id: 'yili',    name: '伊利股份配额管理',    client: '伊利股份',   docs: 9,  ratio: 0.32 },
]

const STAGES = [
  { key: 'overview',  label: '速览',     done: true },
  { key: 'business',  label: '业务底盘', done: true },
  { key: 'systems',   label: '系统现状', done: true },
  { key: 'stakeholders', label: '关键人', done: false, active: true },
  { key: 'risks',     label: '风险点',   done: false },
  { key: 'next',      label: '下一步',   done: false },
]

const STAKEHOLDERS = [
  { name: '张明远', role: '集团 CIO',       weight: '决策者',   tone: 'red',    desc: '统一回购方案,任何新厂商接入需 IT 委员会审批' },
  { name: '李婧',   role: '电商事业部 VP',  weight: '核心干系', tone: 'orange', desc: '本期 BI 接入主推动人,KPI 与上线节点强绑定' },
  { name: '陈鑫',   role: '渠道总监',       weight: '影响者',   tone: 'blue',   desc: '关注线下经销商配额合规,审批流程需双线签批' },
  { name: '王琳',   role: '数据组负责人',   weight: '执行者',   tone: 'green',  desc: '配合 BI 接入和数据对齐,需要 2 人天/周投入' },
]

const SOURCES = [
  { file: '海尔智家 SOW v3.pdf',  page: '第 14 页',  excerpt: '本期项目由集团 IT 委员会统一管控,任何新增 SaaS 接入需提前 5 个工作日提交评审。' },
  { file: '商务初访纪要.docx',     page: '§ 2.3',     excerpt: 'CIO 张明远办公室回访,重点询问数据出域合规,建议同步引入私有部署方案。' },
  { file: '电商部访谈实录.md',     page: '行 88-104', excerpt: '李婧 VP 强调 Q3 必须上线 BI 模块,与年度奖金考核挂钩,逾期会导致跨部门预算回收。' },
]

const QUOTES = [
  { q: '我们不是在挑工具,是在挑长期能跟着走的合作伙伴。',  who: '张明远 · CIO' },
  { q: 'Q3 上线是死线,但比起按时,我更在乎上线后销售能直接看到漏斗。',  who: '李婧 · 电商 VP' },
]

function StageRail() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {STAGES.map((s, i) => {
        const done = s.done
        const active = s.active
        return (
          <button
            key={s.key}
            className={`rd-stage${done ? ' is-done' : ''}${active ? ' is-active' : ''}`}
          >
            <span className="rd-stage-dot">
              {done ? '✓' : String(i + 1).padStart(2, '0')}
            </span>
            <span className="rd-stage-label">{s.label}</span>
            <ChevronRight size={12} className="rd-stage-chev" />
          </button>
        )
      })}
    </div>
  )
}

export default function Insight() {
  const [active, setActive] = useState('haier')
  const current = PROJECTS.find(p => p.id === active) ?? PROJECTS[0]

  return (
    <div className="rd-page">
      <style>{`
        .rd-stage {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 12px;
          border-radius: 12px;
          background: transparent;
          border: 1px solid transparent;
          color: var(--rd-text-3);
          font-size: 12.5px;
          font-weight: 500;
          cursor: pointer;
          transition: all .25s var(--rd-ease);
          width: 100%; text-align: left;
        }
        .rd-stage:hover { color: var(--rd-text-2); background: rgba(15, 18, 36, .03); }
        .rd-stage .rd-stage-dot {
          display: inline-flex; align-items: center; justify-content: center;
          width: 22px; height: 22px;
          border-radius: 50%;
          background: rgba(15, 18, 36, .05);
          font-size: 10.5px;
          color: var(--rd-text-3);
          font-family: ui-monospace, monospace;
          font-weight: 600;
          flex-shrink: 0;
        }
        .rd-stage.is-done .rd-stage-dot {
          background: linear-gradient(135deg, var(--rd-green), #34D399);
          color: #fff;
          box-shadow: 0 0 8px rgba(52,211,153,.4);
        }
        .rd-stage.is-active {
          background: linear-gradient(135deg, rgba(255,141,26,.16), rgba(255,141,26,.04));
          border-color: rgba(255,141,26,.30);
          color: var(--rd-text);
        }
        .rd-stage.is-active .rd-stage-dot {
          background: linear-gradient(135deg, var(--rd-accent), var(--rd-accent-deep));
          color: #fff;
          box-shadow: var(--rd-accent-glow);
          animation: rd-pulse 2.4s ease-in-out infinite;
        }
        .rd-stage .rd-stage-label { flex: 1; }
        .rd-stage .rd-stage-chev { color: var(--rd-text-3); opacity: 0; transition: opacity .2s; }
        .rd-stage:hover .rd-stage-chev,
        .rd-stage.is-active .rd-stage-chev { opacity: 1; }
      `}</style>

      <div className="rd-page-head">
        <div>
          <h1>
            <span style={{ color: 'var(--rd-text-3)', fontWeight: 500, fontSize: 18, marginRight: 8 }}>项目洞察 /</span>
            {current.name}
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="rd-chip">
            <Lightbulb size={12} color="var(--rd-accent)" />
            已分析 {current.docs} 份文档 · 完成度 {Math.round(current.ratio * 100)}%
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr 320px', gap: 20 }}>
        {/* 左:阶段进度 */}
        <div>
          <GlowCard style={{ padding: 16 }}>
            <div style={{
              fontSize: 10.5, color: 'var(--rd-text-3)',
              letterSpacing: '0.14em', textTransform: 'uppercase',
              fontWeight: 600, padding: '4px 0 12px',
            }}>洞察阶段</div>
            <StageRail />
          </GlowCard>

          <GlowCard style={{ padding: 16, marginTop: 16 }}>
            <div style={{
              fontSize: 10.5, color: 'var(--rd-text-3)',
              letterSpacing: '0.14em', textTransform: 'uppercase',
              fontWeight: 600, marginBottom: 12,
            }}>切换项目</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {PROJECTS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setActive(p.id)}
                  className={`rd-nav-link${active === p.id ? ' is-active' : ''}`}
                  style={{ fontSize: 12.5 }}
                >
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: active === p.id ? 'var(--rd-accent)' : 'var(--rd-text-3)',
                    boxShadow: active === p.id ? 'var(--rd-accent-glow)' : 'none',
                    flexShrink: 0,
                  }} />
                  {p.name.replace(/项目|升级|改造|管理/g, '').slice(0, 8)}
                </button>
              ))}
            </div>
          </GlowCard>
        </div>

        {/* 中:洞察主体 */}
        <div className="rd-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 摘要卡 */}
          <GlowCard glow style={{ padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Sparkles size={14} color="var(--rd-accent)" />
              <span style={{
                fontSize: 10.5, color: 'var(--rd-accent-2)',
                letterSpacing: '0.14em', textTransform: 'uppercase',
                fontWeight: 600,
              }}>AI 摘要</span>
              <span className="rd-mono" style={{ fontSize: 10, color: 'var(--rd-text-3)', marginLeft: 'auto' }}>2 分钟前</span>
            </div>
            <p style={{ fontSize: 15, lineHeight: 1.85, color: 'var(--rd-text)', margin: 0 }}>
              海尔智家本期项目由 <strong style={{ color: 'var(--rd-accent-2)', fontWeight: 600 }}>集团 IT 委员会统一管控</strong>,
              新厂商接入需 5 个工作日评审。核心推动方为电商事业部
              <strong style={{ color: 'var(--rd-accent-2)', fontWeight: 600 }}> Q3 BI 上线 KPI</strong>,
              但 CIO 同时关注数据出域合规,建议同步评估私有部署方案。预计需
              <strong style={{ color: 'var(--rd-accent-2)', fontWeight: 600 }}>跨 4 个事业部协同</strong>,
              线下经销商配额需双线签批流程。
            </p>
          </GlowCard>

          {/* 关键人 */}
          <GlowCard style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              padding: '20px 24px 12px',
              display: 'flex', alignItems: 'center', gap: 8,
              borderBottom: '1px solid var(--rd-line)',
            }}>
              <Users size={14} color="var(--rd-text-2)" />
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--rd-text)' }}>关键干系人</h3>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--rd-text-3)' }}>4 / 7 已识别</span>
            </div>
            <div>
              {STAKEHOLDERS.map((s, i) => (
                <div key={s.name} style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 110px 80px 1fr',
                  alignItems: 'center', gap: 16,
                  padding: '16px 24px',
                  borderBottom: i < STAKEHOLDERS.length - 1 ? '1px solid var(--rd-line)' : 'none',
                  transition: 'background .2s',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(15, 18, 36, .02)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: 'linear-gradient(135deg, rgba(255,141,26,.18), rgba(255,141,26,.05))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--rd-accent-2)', fontWeight: 700, fontSize: 13,
                    flexShrink: 0,
                  }}>
                    {s.name.slice(0, 1)}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--rd-text)' }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--rd-text-3)', marginTop: 2 }}>{s.role}</div>
                  </div>
                  <span className={`rd-badge is-${s.tone}`} style={{ justifySelf: 'start' }}>{s.weight}</span>
                  <p style={{ fontSize: 12.5, color: 'var(--rd-text-2)', margin: 0, lineHeight: 1.6 }}>{s.desc}</p>
                </div>
              ))}
            </div>
          </GlowCard>

          {/* 原话 */}
          <GlowCard style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Quote size={14} color="var(--rd-text-2)" />
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--rd-text)' }}>原话留存</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {QUOTES.map(q => (
                <div key={q.q} style={{
                  padding: '14px 18px',
                  background: 'linear-gradient(135deg, rgba(255,141,26,.06), rgba(255,141,26,.01))',
                  border: '1px solid rgba(255,141,26,.15)',
                  borderRadius: 12,
                  borderLeft: '3px solid var(--rd-accent)',
                }}>
                  <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--rd-text)', margin: 0, fontStyle: 'italic' }}>
                    "{q.q}"
                  </p>
                  <div style={{ fontSize: 11, color: 'var(--rd-accent-2)', marginTop: 8, letterSpacing: '0.04em' }}>
                    — {q.who}
                  </div>
                </div>
              ))}
            </div>
          </GlowCard>
        </div>

        {/* 右:引用文档 */}
        <div className="rd-stagger">
          <GlowCard shimmer style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              padding: '16px 18px',
              borderBottom: '1px solid var(--rd-line)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <FileText size={13} color="var(--rd-text-2)" />
              <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--rd-text)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                证据来源
              </h3>
              <span className="rd-mono" style={{ fontSize: 10, color: 'var(--rd-accent-2)', marginLeft: 'auto' }}>
                {SOURCES.length}
              </span>
            </div>

            <div style={{ padding: 12 }}>
              {SOURCES.map((s, i) => (
                <div key={i} style={{
                  padding: 14,
                  marginBottom: 8,
                  background: 'rgba(15, 18, 36, .025)',
                  border: '1px solid var(--rd-line)',
                  borderRadius: 12,
                  cursor: 'pointer',
                  transition: 'all .25s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'rgba(255,141,26,.35)'
                  e.currentTarget.style.background = 'rgba(255,141,26,.04)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--rd-line)'
                  e.currentTarget.style.background = 'rgba(15, 18, 36, .025)'
                }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <FileText size={11} color="var(--rd-accent)" />
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--rd-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {s.file}
                    </span>
                  </div>
                  <p style={{
                    fontSize: 11.5, color: 'var(--rd-text-2)', margin: 0,
                    lineHeight: 1.6,
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>"{s.excerpt}"</p>
                  <div className="rd-mono" style={{ fontSize: 10, color: 'var(--rd-text-3)', marginTop: 8 }}>
                    {s.page}
                  </div>
                </div>
              ))}
            </div>
          </GlowCard>

          {/* 下一步建议卡 */}
          <GlowCard glow style={{ padding: 18, marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Workflow size={13} color="var(--rd-accent)" />
              <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--rd-text)' }}>下一步建议</h3>
            </div>
            <ul style={{ fontSize: 12.5, color: 'var(--rd-text-2)', lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
              <li>本周联系 CIO 张明远,递交合规方案</li>
              <li>启动电商部需求调研 →
                <a href="/redesign/survey" style={{ color: 'var(--rd-accent-2)', textDecoration: 'none', marginLeft: 4 }}>
                  开始 <ArrowUpRight size={10} style={{ display: 'inline' }} />
                </a>
              </li>
              <li>排期与渠道总监对齐双线签批流</li>
            </ul>
          </GlowCard>
        </div>
      </div>
    </div>
  )
}
