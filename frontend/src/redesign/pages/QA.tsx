import { useState, useEffect, useRef } from 'react'
import { Send, Sparkles, FileText, Bookmark, ChevronLeft, Plus, Search } from 'lucide-react'
import StreamingText from '../components/StreamingText'
import PillSelect from '../components/PillSelect'

const HISTORY = [
  { id: '1', title: '海尔智家 SOW 关键里程碑',     time: '14:22' },
  { id: '2', title: '美的项目交接清单是否齐全',     time: '昨天' },
  { id: '3', title: '蒙牛实施期合同付款节点',       time: '昨天' },
  { id: '4', title: '伊利配额管理对接思路',         time: '前天' },
  { id: '5', title: '中粮验收阶段常见问题',         time: '前天' },
  { id: '6', title: '光明乳业 BI 接入方案',         time: '上周' },
  { id: '7', title: '完美日记销售漏斗梳理',         time: '上周' },
]

const SOURCES = [
  { title: '海尔智家 SOW v3.pdf',  chunk: '第 12 页 · § 3.2 关键里程碑', score: 0.93 },
  { title: '海尔实施排期.xlsx',     chunk: 'Sheet1 · 行 24-38',          score: 0.87 },
  { title: '海尔交付计划.md',       chunk: '## 阶段三 · 上线准备',       score: 0.81 },
]

const ANSWER = `根据海尔智家 SOW v3 的约定,关键里程碑分为四个节点:

1. 立项与启动会(2026-05-30)—— 完成商务签约、组建联合实施小组
2. UAT 启动(2026-08-15)—— 测试用例通过率 ≥ 95%
3. 试运行上线(2026-10-08)—— 海尔智家两个事业部首批上线
4. 验收交付(2026-12-22)—— 完成第一份月度运营报告

其中节点 2 和 3 之间的 6 周窗口被认为是风险最高的阶段,主要原因是涉及外部 BI 接入,建议提前进入第三方对接评审。`

export default function QA() {
  const [role, setRole]       = useState('pm')
  const [project, setProject] = useState('haier')
  const [stage, setStage]     = useState('implement')
  const [historyOpen, setHistoryOpen] = useState(true)
  const [activeId, setActiveId] = useState<string | null>('1')
  const [input, setInput] = useState('')
  const [phase, setPhase] = useState<'idle' | 'thinking' | 'streaming' | 'done'>('idle')
  const [showAnswer, setShowAnswer] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [phase])

  function handleAsk() {
    if (!input.trim()) return
    setShowAnswer(false)
    setPhase('thinking')
    setTimeout(() => {
      setShowAnswer(true)
      setPhase('streaming')
    }, 1100)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: (historyOpen ? '260px' : '64px') + ' 1fr 320px', height: 'calc(100vh - 56px)', gap: 0 }}>
      {/* History sidebar */}
      <aside style={{
        borderRight: '1px solid var(--rd-line)',
        background: 'rgba(255, 255, 255, .55)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        display: 'flex', flexDirection: 'column',
        transition: 'width .35s var(--rd-ease)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--rd-line)' }}>
          <button
            className="rd-icon-btn"
            style={{ width: 30, height: 30, flexShrink: 0 }}
            onClick={() => setHistoryOpen(o => !o)}
            aria-label="切换历史栏"
          >
            <ChevronLeft size={14} style={{ transition: 'transform .35s', transform: historyOpen ? 'none' : 'rotate(180deg)' }} />
          </button>
          {historyOpen && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--rd-text)' }}>历史会话</span>}
          {historyOpen && (
            <button className="rd-icon-btn" style={{ width: 30, height: 30, marginLeft: 'auto' }} aria-label="新建">
              <Plus size={14} />
            </button>
          )}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '8px 8px' }}>
          {HISTORY.map(h => (
            <button
              key={h.id}
              onClick={() => setActiveId(h.id)}
              className={`rd-nav-link${activeId === h.id ? ' is-active' : ''}`}
              style={{ padding: historyOpen ? '10px 12px' : '10px 8px', justifyContent: historyOpen ? 'flex-start' : 'center' }}
            >
              {!historyOpen && (
                <span style={{ width: 24, height: 24, borderRadius: 8, background: 'rgba(255,141,26,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--rd-accent-2)', fontSize: 11, fontWeight: 700 }}>
                  {h.title.slice(0, 1)}
                </span>
              )}
              {historyOpen && (
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, color: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {h.title}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--rd-text-3)', marginTop: 2 }}>{h.time}</div>
                </div>
              )}
            </button>
          ))}
        </div>
      </aside>

      {/* Conversation */}
      <section style={{ display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
        {/* Top control bar (collapsed to a single pill row) */}
        <div style={{
          padding: '16px 32px',
          borderBottom: '1px solid var(--rd-line)',
          display: 'flex', alignItems: 'center', gap: 10,
          flexWrap: 'wrap',
        }}>
          <PillSelect
            prefix={<Sparkles size={11} />}
            value={role}
            onChange={setRole}
            options={[
              { value: 'pm',      label: '项目经理',   hint: '限定项目库' },
              { value: 'general', label: '通用问答',   hint: '全量知识' },
            ]}
          />
          <PillSelect
            value={project}
            onChange={setProject}
            options={[
              { value: 'haier',  label: '海尔智家' },
              { value: 'midea',  label: '美的集团' },
              { value: 'mengniu', label: '蒙牛乳业' },
            ]}
          />
          <PillSelect
            value={stage}
            onChange={setStage}
            options={[
              { value: 'lead',      label: '商机阶段' },
              { value: 'sow',       label: 'SOW 阶段' },
              { value: 'implement', label: '实施阶段' },
              { value: 'accept',    label: '验收阶段' },
            ]}
          />
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px 140px' }}>
          {/* User msg */}
          <div className="rd-stagger" style={{ maxWidth: 720, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 28 }}>
              <div style={{
                maxWidth: '70%',
                background: 'linear-gradient(135deg, rgba(139,92,246,.18), rgba(139,92,246,.06))',
                border: '1px solid rgba(139,92,246,.25)',
                borderRadius: 16,
                padding: '12px 18px',
                fontSize: 14,
                color: 'var(--rd-text)',
                lineHeight: 1.6,
              }}>
                海尔智家项目的关键里程碑都有哪些?哪个阶段风险最高?
              </div>
            </div>

            {/* AI msg */}
            <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                background: 'linear-gradient(135deg, var(--rd-accent), var(--rd-accent-deep))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: 'var(--rd-accent-glow)',
                animation: 'rd-pulse 2.4s ease-in-out infinite',
              }}>
                <Sparkles size={15} color="#fff" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--rd-text-3)', marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  AI · 项目经理
                </div>
                <div style={{
                  fontSize: 14, lineHeight: 1.8,
                  color: 'var(--rd-text)',
                  whiteSpace: 'pre-wrap',
                }}>
                  {phase === 'thinking' && !showAnswer && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--rd-text-2)' }}>
                      <span className="rd-dots"><span /><span /><span /></span>
                      <span style={{ fontSize: 13 }}>检索 3 份文档,生成中</span>
                    </div>
                  )}
                  {showAnswer && (
                    <StreamingText
                      key={phase}
                      text={ANSWER}
                      speed={phase === 'streaming' ? 16 : 0}
                      onDone={() => setPhase('done')}
                    />
                  )}
                </div>

                {phase === 'done' && (
                  <div style={{ marginTop: 18, display: 'flex', gap: 8, animation: 'rd-fade-up .4s var(--rd-ease) both' }}>
                    <button className="rd-chip"><Bookmark size={11} /> 收藏金句</button>
                    <button className="rd-chip">追问</button>
                    <button className="rd-chip">⤴ 分享</button>
                  </div>
                )}
              </div>
            </div>

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          padding: '20px 32px 24px',
          background: 'linear-gradient(180deg, transparent, var(--rd-bg) 50%)',
        }}>
          <div style={{ maxWidth: 720, margin: '0 auto', position: 'relative' }}>
            <input
              className="rd-input"
              placeholder="问点什么…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk() } }}
              style={{ paddingRight: 52, paddingLeft: 20 }}
            />
            <button
              onClick={handleAsk}
              aria-label="发送"
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                width: 36, height: 36, borderRadius: 10,
                background: 'linear-gradient(135deg, var(--rd-accent), var(--rd-accent-deep))',
                border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 4px 14px -4px rgba(255,141,26,.6)',
                transition: 'transform .2s',
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-50%) scale(1.06)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateY(-50%)'}
            >
              <Send size={14} color="#fff" />
            </button>
          </div>
        </div>
      </section>

      {/* Sources */}
      <aside style={{
        borderLeft: '1px solid var(--rd-line)',
        padding: 20,
        background: 'rgba(255, 255, 255, .55)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        overflow: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--rd-text)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            参考来源 · {SOURCES.length}
          </h3>
          <button className="rd-icon-btn" style={{ width: 26, height: 26 }}><Search size={12} /></button>
        </div>
        <div className="rd-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {SOURCES.map((s, i) => (
            <div key={s.title} style={{
              padding: 14,
              background: 'rgba(15, 18, 36, .025)',
              border: '1px solid var(--rd-line)',
              borderRadius: 12,
              cursor: 'pointer',
              transition: 'all .25s var(--rd-ease)',
              animationDelay: `${i * 80}ms`,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'rgba(255,141,26,.35)'
              e.currentTarget.style.background = 'rgba(255,141,26,.05)'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--rd-line)'
              e.currentTarget.style.background = 'rgba(15, 18, 36, .025)'
              e.currentTarget.style.transform = 'none'
            }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <FileText size={12} color="var(--rd-accent)" />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--rd-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.title}
                </span>
                <span className="rd-mono" style={{ fontSize: 10, color: 'var(--rd-accent-2)' }}>{s.score.toFixed(2)}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--rd-text-2)', lineHeight: 1.5 }}>{s.chunk}</div>
              <div style={{ marginTop: 8, height: 2, background: 'rgba(15, 18, 36, .05)', borderRadius: 1, overflow: 'hidden' }}>
                <div style={{
                  width: `${s.score * 100}%`, height: '100%',
                  background: 'linear-gradient(90deg, var(--rd-accent), var(--rd-accent-2))',
                  boxShadow: '0 0 6px var(--rd-accent)',
                }} />
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}
