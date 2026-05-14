import { useState } from 'react'
import {
  ClipboardList, Check, ChevronRight, MessageSquare,
  Mic, Pause, Sparkles, ListChecks, Send,
} from 'lucide-react'
import GlowCard from '../components/GlowCard'

const OUTLINE = [
  { id: 'biz',    label: '业务基础',  done: true,  count: 8, total: 8 },
  { id: 'sales',  label: '销售流程',  done: true,  count: 6, total: 6 },
  { id: 'prod',   label: '商品体系',  done: false, count: 4, total: 7, active: true },
  { id: 'order',  label: '订单履约',  done: false, count: 0, total: 9 },
  { id: 'finan',  label: '财务对账',  done: false, count: 0, total: 5 },
  { id: 'bi',     label: 'BI 报表',   done: false, count: 0, total: 6 },
]

const CURRENT_QUESTION = {
  prompt: '商品价格体系是按区域还是按客户分层?',
  hint: '请选择最贴近现状的项,可多选',
  options: [
    { id: 'region',   label: '按销售区域(华东/华北/华南)分层',                   selected: true },
    { id: 'customer', label: '按客户大类(KA/经销商/零售)分层',                     selected: true },
    { id: 'channel',  label: '按渠道(线上/线下/批发)分层',                          selected: false },
    { id: 'tier',     label: '按合同级别(战略/普通)分层',                            selected: false },
    { id: 'single',   label: '单一价格,不分层',                                       selected: false },
    { id: 'other',    label: '其他(需补充说明)',                                    selected: false },
  ],
  followUp: [
    '区域 + 客户大类同时分层的话,需要价目表 6×3=18 张,确认下吗?',
    '是否存在跨区域 KA 客户特殊定价?',
    '价格调整审批层级到哪里?',
  ],
}

const FACTS = [
  { tone: 'green',  label: '已确认',  text: '商品按区域 + 客户大类双重分层' },
  { tone: 'green',  label: '已确认',  text: '价目表预计 18 张以内' },
  { tone: 'orange', label: '待澄清',  text: '跨区域 KA 客户定价方式' },
  { tone: 'orange', label: '待澄清',  text: '调价审批层级' },
  { tone: 'blue',   label: '已记录',  text: '使用方:销售部 32 人,财务 8 人' },
]

const HISTORY = [
  { who: 'AI',  ts: '14:08', text: '我来问您几个关于商品体系的问题。先问个基本的:商品价格体系是按区域还是按客户分层?', kind: 'ai' },
  { who: '王琳', ts: '14:09', text: '我们其实两个都有,主要看客户。', kind: 'user' },
  { who: 'AI',  ts: '14:09', text: '好的,我列了 6 个常见分层维度,您挑最贴近的几个 →', kind: 'ai' },
]

export default function Survey() {
  const [opts, setOpts] = useState(CURRENT_QUESTION.options)
  const total = OUTLINE.reduce((s, o) => s + o.total, 0)
  const done = OUTLINE.reduce((s, o) => s + o.count, 0)
  const pct = Math.round((done / total) * 100)

  function toggle(id: string) {
    setOpts(opts.map(o => o.id === id ? { ...o, selected: !o.selected } : o))
  }

  return (
    <div className="rd-page">
      <style>{`
        .rd-outline-item {
          display: flex; align-items: center; gap: 10px;
          padding: 11px 12px;
          border-radius: 12px;
          background: transparent;
          border: 1px solid transparent;
          color: var(--rd-text-2);
          font-size: 12.5px;
          font-weight: 500;
          cursor: pointer;
          transition: all .25s var(--rd-ease);
          width: 100%; text-align: left;
        }
        .rd-outline-item:hover { background: rgba(15, 18, 36, .03); color: var(--rd-text); }
        .rd-outline-item.is-done {
          color: var(--rd-text-2);
        }
        .rd-outline-item.is-active {
          background: linear-gradient(135deg, rgba(255,141,26,.14), rgba(255,141,26,.03));
          border-color: rgba(255,141,26,.28);
          color: var(--rd-text);
        }
        .rd-outline-check {
          width: 18px; height: 18px;
          border-radius: 50%;
          display: inline-flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          font-size: 10px; font-weight: 700;
        }
        .rd-outline-item.is-done .rd-outline-check {
          background: linear-gradient(135deg, var(--rd-green), #059669);
          color: #fff;
          box-shadow: 0 0 6px rgba(52,211,153,.45);
        }
        .rd-outline-item:not(.is-done) .rd-outline-check {
          background: rgba(15, 18, 36, .05);
          color: var(--rd-text-3);
        }
        .rd-outline-item.is-active .rd-outline-check {
          background: linear-gradient(135deg, var(--rd-accent), var(--rd-accent-deep));
          color: #fff;
          box-shadow: var(--rd-accent-glow);
          animation: rd-pulse 2.4s ease-in-out infinite;
        }
        .rd-outline-count {
          margin-left: auto;
          font-family: ui-monospace, monospace;
          font-size: 10.5px;
          color: var(--rd-text-3);
        }
        .rd-outline-item.is-active .rd-outline-count { color: var(--rd-accent-2); }

        .rd-opt {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 14px 18px;
          background: rgba(15, 18, 36, .025);
          border: 1px solid var(--rd-line);
          border-radius: 14px;
          cursor: pointer;
          transition: all .22s var(--rd-ease);
          font-size: 14px;
          color: var(--rd-text);
          width: 100%; text-align: left;
          font-family: inherit;
        }
        .rd-opt:hover {
          background: rgba(15, 18, 36, .04);
          border-color: var(--rd-line-strong);
          transform: translateY(-1px);
        }
        .rd-opt.is-selected {
          background: linear-gradient(135deg, rgba(255,141,26,.14), rgba(255,141,26,.03));
          border-color: rgba(255,141,26,.50);
          box-shadow: 0 0 20px -4px rgba(255,141,26,.30);
        }
        .rd-opt-box {
          width: 18px; height: 18px;
          border-radius: 6px;
          border: 1.5px solid rgba(15, 18, 36, .20);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          transition: all .22s;
          margin-top: 1px;
        }
        .rd-opt.is-selected .rd-opt-box {
          background: linear-gradient(135deg, var(--rd-accent), var(--rd-accent-deep));
          border-color: transparent;
          box-shadow: 0 0 10px rgba(255,141,26,.5);
        }
      `}</style>

      <div className="rd-page-head">
        <div>
          <h1>
            <span style={{ color: 'var(--rd-text-3)', fontWeight: 500, fontSize: 18, marginRight: 8 }}>需求调研 /</span>
            海尔智家
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="rd-btn"><Pause size={13} /> 暂停录音</button>
          <button className="rd-btn rd-btn-primary"><Mic size={13} /> 继续访谈</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr 320px', gap: 20 }}>
        {/* 左:大纲 + 总进度 */}
        <div>
          <GlowCard style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{
                fontSize: 10.5, color: 'var(--rd-text-3)',
                letterSpacing: '0.14em', textTransform: 'uppercase',
                fontWeight: 600,
              }}>访谈进度</span>
              <span className="rd-mono" style={{ fontSize: 11, color: 'var(--rd-accent-2)' }}>{pct}%</span>
            </div>
            <div style={{
              height: 4, background: 'rgba(15, 18, 36, .05)',
              borderRadius: 2, overflow: 'hidden', marginBottom: 16,
            }}>
              <div style={{
                width: `${pct}%`, height: '100%',
                background: 'linear-gradient(90deg, var(--rd-accent), var(--rd-accent-2))',
                boxShadow: '0 0 8px var(--rd-accent)',
                transition: 'width .8s var(--rd-ease)',
              }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {OUTLINE.map(o => (
                <button
                  key={o.id}
                  className={`rd-outline-item${o.done ? ' is-done' : ''}${o.active ? ' is-active' : ''}`}
                >
                  <span className="rd-outline-check">
                    {o.done ? <Check size={11} /> : ''}
                  </span>
                  <span style={{ flex: 1 }}>{o.label}</span>
                  <span className="rd-outline-count">{o.count}/{o.total}</span>
                </button>
              ))}
            </div>
          </GlowCard>

          <GlowCard glow style={{ padding: 16, marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Sparkles size={12} color="var(--rd-accent)" />
              <span style={{ fontSize: 11, color: 'var(--rd-accent-2)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>实时洞察</span>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--rd-text)', lineHeight: 1.6, margin: 0 }}>
              对方在商品分层上犹豫,建议先用"双重分层"假设走完后续问题,再回头确认。
            </p>
          </GlowCard>
        </div>

        {/* 中:当前问题 + 选项 */}
        <div className="rd-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 大问题卡 */}
          <GlowCard glow style={{ padding: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <span className="rd-chip is-active">
                <ClipboardList size={11} />
                问题 12 / 41
              </span>
              <span style={{ fontSize: 11, color: 'var(--rd-text-3)' }}>商品体系 · 价格分层</span>
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--rd-green)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--rd-green)', boxShadow: '0 0 6px var(--rd-green)', animation: 'rd-pulse 1.4s ease-in-out infinite' }} />
                录音中
              </span>
            </div>
            <h2 style={{
              fontSize: 22, fontWeight: 700, color: 'var(--rd-text)',
              letterSpacing: '-0.01em', lineHeight: 1.35, margin: 0, marginBottom: 6,
            }}>{CURRENT_QUESTION.prompt}</h2>
            <p style={{ fontSize: 12.5, color: 'var(--rd-text-3)', margin: 0, marginBottom: 22 }}>{CURRENT_QUESTION.hint}</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {opts.map(o => (
                <button
                  key={o.id}
                  className={`rd-opt${o.selected ? ' is-selected' : ''}`}
                  onClick={() => toggle(o.id)}
                >
                  <span className="rd-opt-box">
                    {o.selected && <Check size={11} color="#fff" />}
                  </span>
                  <span>{o.label}</span>
                </button>
              ))}
            </div>

            <div style={{
              marginTop: 22, paddingTop: 18,
              borderTop: '1px solid var(--rd-line)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ fontSize: 11, color: 'var(--rd-text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>建议追问</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                {CURRENT_QUESTION.followUp.map((f, i) => (
                  <span key={i} className="rd-chip">{f}</span>
                ))}
              </div>
            </div>

            <div style={{
              marginTop: 22,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            }}>
              <button className="rd-btn">跳过</button>
              <button className="rd-btn rd-btn-primary" style={{ paddingLeft: 22, paddingRight: 22 }}>
                <Check size={13} /> 确认并进入下一题
                <ChevronRight size={13} />
              </button>
            </div>
          </GlowCard>

          {/* 对话历史(精简版) */}
          <GlowCard style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <MessageSquare size={13} color="var(--rd-text-2)" />
              <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--rd-text)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                本题对话
              </h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {HISTORY.map((m, i) => (
                <div key={i} style={{ display: 'flex', gap: 10 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                    background: m.kind === 'ai'
                      ? 'linear-gradient(135deg, var(--rd-accent), var(--rd-accent-deep))'
                      : 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: m.kind === 'ai'
                      ? '0 0 10px rgba(255,141,26,.4)'
                      : '0 0 10px rgba(139,92,246,.4)',
                    fontSize: 11, fontWeight: 700, color: '#fff',
                  }}>
                    {m.who.slice(0, 1)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--rd-text)' }}>{m.who}</span>
                      <span className="rd-mono" style={{ fontSize: 10, color: 'var(--rd-text-3)' }}>{m.ts}</span>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--rd-text-2)', lineHeight: 1.65, margin: 0 }}>{m.text}</p>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16, position: 'relative' }}>
              <input
                className="rd-input"
                placeholder="补充一句话…"
                style={{ paddingRight: 44, fontSize: 13 }}
              />
              <button style={{
                position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                width: 30, height: 30, borderRadius: 8,
                background: 'linear-gradient(135deg, var(--rd-accent), var(--rd-accent-deep))',
                border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#fff',
                boxShadow: '0 4px 12px -2px rgba(255,141,26,.5)',
              }}>
                <Send size={12} />
              </button>
            </div>
          </GlowCard>
        </div>

        {/* 右:已确认事实 */}
        <div className="rd-stagger">
          <GlowCard shimmer style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              padding: '16px 18px',
              borderBottom: '1px solid var(--rd-line)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <ListChecks size={13} color="var(--rd-text-2)" />
              <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--rd-text)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                已记录事实
              </h3>
              <span className="rd-mono" style={{ fontSize: 10, color: 'var(--rd-accent-2)', marginLeft: 'auto' }}>
                {FACTS.length}
              </span>
            </div>

            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {FACTS.map((f, i) => (
                <div key={i} style={{
                  padding: '10px 12px',
                  background: 'rgba(15, 18, 36, .025)',
                  border: '1px solid var(--rd-line)',
                  borderRadius: 10,
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  <span className={`rd-badge is-${f.tone}`} style={{ alignSelf: 'flex-start' }}>{f.label}</span>
                  <p style={{ fontSize: 12.5, color: 'var(--rd-text)', margin: 0, lineHeight: 1.55 }}>{f.text}</p>
                </div>
              ))}
            </div>
          </GlowCard>

          <GlowCard style={{ padding: 16, marginTop: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--rd-text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 10 }}>
              本次访谈
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                <span className="rd-muted">已用时</span>
                <span className="rd-mono" style={{ color: 'var(--rd-text)' }}>00:42:18</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                <span className="rd-muted">完成问题</span>
                <span style={{ color: 'var(--rd-text)' }}>{done} / {total}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                <span className="rd-muted">待澄清</span>
                <span style={{ color: 'var(--rd-accent-2)' }}>2</span>
              </div>
            </div>
          </GlowCard>
        </div>
      </div>
    </div>
  )
}
