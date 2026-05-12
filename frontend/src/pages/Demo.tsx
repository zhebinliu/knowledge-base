/**
 * Demo — 产品演示页面
 * Route: /demo  (no auth required)
 *
 * 目标:简洁清晰地介绍"区别于普通 RAG 知识库"的核心创新点。
 * 6 个章节,每个聚焦一个真正不一样的能力,信息密度优于功能罗列。
 */
import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  Upload, MessageSquare, Layers, Folder, Brain, FileText,
  ChevronRight, ArrowRight, Search, RefreshCw, Star, ThumbsUp, ThumbsDown,
  Sparkles, Play, BookOpen, Target, Filter, Flame, Repeat,
  ClipboardList, Wand2, Mic, Bot, BarChart2, Network,
  ShieldCheck, Eye, Edit3, Terminal, Code2,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

function Tag({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-brand-light border border-orange-200 text-[#D96400]">
      {children}
    </span>
  )
}

function StatBadge({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <p className="text-3xl font-extrabold text-ink tracking-tight">{value}</p>
      <p className="text-xs text-ink-muted mt-0.5">{label}</p>
    </div>
  )
}

// 章节标题 + 编号
function SectionTitle({ idx, tag, title, sub }: { idx: string; tag: string; title: string; sub: string }) {
  return (
    <div className="text-center mb-8">
      <div className="inline-flex items-center gap-2 mb-3">
        <span className="font-mono text-[11px] text-ink-muted">{idx}</span>
        <Tag>{tag}</Tag>
      </div>
      <h2 className="text-2xl font-bold text-ink mb-2">{title}</h2>
      <p className="text-ink-secondary text-sm max-w-2xl mx-auto leading-relaxed">{sub}</p>
    </div>
  )
}

// ── 实时 QA 演示组件 ────────────────────────────────────────────────────────

const QA_DEMO_FLOWS: { q: string; a: string; sources: string[] }[] = [
  {
    q: '合同阶段的审批流程是什么?',
    a: '合同审批遵循「起草 → 法务审核 → 商务确认 → 高管签署」四步流程。法务审核需在 3 个工作日内完成,超时需上报项目经理。所有合同须在 OA 系统留存电子版……',
    sources: ['合同管理手册.pdf · 第 3 章', '实施规范 v2.1.docx · §5.2'],
  },
  {
    q: '回款认领需要哪些材料?',
    a: '回款认领需提交:① 银行到账回执(截图或 PDF);② 合同编号和对应金额;③ 客户开票信息(如有开票需求)。在 CRM「回款管理」模块操作,选择对应合同后上传材料……',
    sources: ['回款操作指南.pdf · 回款认领流程', '财务对接规范.md · 第 4 节'],
  },
  {
    q: '商机阶段如何做竞品分析?',
    a: '商机阶段竞品分析重点关注三个维度:功能覆盖度、TCO(总拥有成本)和实施周期。建议使用标准化比较矩阵,重点突出纷享销客在移动端和销售过程管控方面的差异化优势……',
    sources: ['竞品分析框架.pptx · 商机阶段', 'BD 话术手册.docx · 竞争应对'],
  },
]

function QaDemo() {
  const [flowIdx, setFlowIdx] = useState(0)
  const [phase, setPhase]     = useState<'idle' | 'typing' | 'answering' | 'done'>('idle')
  const [displayQ, setDisplayQ] = useState('')
  const [displayA, setDisplayA] = useState('')
  const [showSrc, setShowSrc]   = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flow = QA_DEMO_FLOWS[flowIdx]

  const runFlow = (idx: number) => {
    const f = QA_DEMO_FLOWS[idx]
    setDisplayQ(''); setDisplayA(''); setShowSrc(false); setPhase('typing')
    let qi = 0
    const typeQ = () => {
      if (qi <= f.q.length) {
        setDisplayQ(f.q.slice(0, qi)); qi++
        timerRef.current = setTimeout(typeQ, 40)
      } else {
        setPhase('answering')
        let ai = 0
        const typeA = () => {
          if (ai <= f.a.length) {
            setDisplayA(f.a.slice(0, ai)); ai += 3
            timerRef.current = setTimeout(typeA, 18)
          } else {
            setShowSrc(true); setPhase('done')
          }
        }
        timerRef.current = setTimeout(typeA, 600)
      }
    }
    typeQ()
  }

  useEffect(() => {
    timerRef.current = setTimeout(() => runFlow(0), 600)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  const switchFlow = (idx: number) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setFlowIdx(idx); runFlow(idx)
  }

  return (
    <div className="rounded-2xl border border-line overflow-hidden shadow-lg bg-surface">
      <div className="flex items-center gap-1.5 px-4 py-2.5 bg-gray-100 border-b border-line">
        <span className="w-3 h-3 rounded-full bg-red-400" />
        <span className="w-3 h-3 rounded-full bg-yellow-400" />
        <span className="w-3 h-3 rounded-full bg-green-400" />
        <span className="ml-3 text-xs text-ink-muted font-mono">KB System — 智能问答</span>
      </div>

      <div className="flex gap-1 px-4 py-2 bg-canvas border-b border-line overflow-x-auto">
        {QA_DEMO_FLOWS.map((f, i) => (
          <button
            key={i} onClick={() => switchFlow(i)}
            className={`flex-shrink-0 text-[11px] px-3 py-1 rounded-full font-medium transition-all ${flowIdx === i ? 'text-white' : 'text-ink-secondary hover:bg-surface'}`}
            style={flowIdx === i ? { background: BRAND_GRAD } : {}}
          >示例 {i + 1}</button>
        ))}
      </div>

      <div className="p-5 min-h-[260px] flex flex-col gap-4">
        {displayQ && (
          <div className="flex justify-end">
            <div className="max-w-[75%] px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm text-white" style={{ background: BRAND_GRAD }}>
              {displayQ}{phase === 'typing' && <span className="inline-block w-0.5 h-4 bg-white ml-0.5 animate-pulse align-middle" />}
            </div>
          </div>
        )}

        {(displayA || phase === 'answering') && (
          <div className="flex justify-start gap-3">
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: BRAND_GRAD }}>
              <Brain size={13} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="card px-4 py-3 text-sm text-ink leading-relaxed">
                {displayA || <span className="inline-flex gap-1">{[0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-ink-muted animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</span>}
                {phase === 'answering' && displayA && <span className="inline-block w-0.5 h-4 bg-ink ml-0.5 animate-pulse align-middle" />}
              </div>

              {showSrc && (
                <div className="mt-2 space-y-1">
                  <p className="text-[10px] text-ink-muted px-1 font-medium uppercase tracking-wider">参考来源</p>
                  {flow.sources.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-canvas border border-line text-[11px] text-ink-secondary">
                      <FileText size={11} className="flex-shrink-0 text-ink-muted" />
                      {s}
                    </div>
                  ))}
                  <div className="flex items-center gap-2 px-1 pt-1">
                    <button className="flex items-center gap-1 text-[11px] text-green-600 hover:text-green-700"><ThumbsUp size={11} /> 有帮助</button>
                    <button className="flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink ml-2"><Star size={11} /> 收藏</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {phase === 'idle' && !displayQ && (
          <div className="flex-1 flex items-center justify-center text-ink-muted text-sm">
            <RefreshCw size={14} className="animate-spin mr-2" /> 加载演示…
          </div>
        )}
      </div>

      <div className="px-4 pb-4">
        <div className="flex items-center gap-2 border border-line rounded-xl px-4 py-2.5 bg-canvas">
          <span className="flex-1 text-sm text-ink-muted">向知识库提问…</span>
          <button className="w-7 h-7 rounded-lg flex items-center justify-center text-white" style={{ background: BRAND_GRAD }}>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Demo() {
  useEffect(() => {
    document.title = '产品演示 — KB System'
    return () => { document.title = '实施知识综合管理' }
  }, [])

  return (
    <div className="min-h-screen bg-canvas">

      {/* ── Top nav bar ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-surface/90 backdrop-blur border-b border-line">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: BRAND_GRAD }}>
              <BookOpen size={13} className="text-white" />
            </div>
            <span className="text-sm font-bold text-ink">KB System</span>
            <span className="hidden sm:block text-xs text-ink-muted ml-1">纷享销客 CRM 实施知识库</span>
          </div>
          <div className="flex items-center gap-2">
            <a href="/help" className="text-xs text-ink-secondary hover:text-ink px-3 py-1.5 rounded-lg hover:bg-canvas transition-colors">使用手册</a>
            <a href="/api" className="text-xs text-ink-secondary hover:text-ink px-3 py-1.5 rounded-lg hover:bg-canvas transition-colors">API 文档</a>
            <a href="/" className="flex items-center gap-1.5 text-xs font-medium text-white px-3 py-1.5 rounded-lg transition-all hover:opacity-90" style={{ background: BRAND_GRAD }}>
              <Play size={11} /> 进入系统
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-14">

        {/* ── Hero ─────────────────────────────────────────────────── */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-light border border-orange-200 text-[#D96400] text-xs font-medium mb-5">
            <Sparkles size={11} /> CRM 实施团队专属 AI 工作台
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-ink leading-tight mb-4">
            不是又一个 RAG 知识库
            <br />
            <span style={{ background: BRAND_GRAD, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              是把实施顾问的工作流写进系统
            </span>
          </h1>
          <p className="text-ink-secondary text-base max-w-2xl mx-auto leading-relaxed mb-8">
            文档驱动的项目洞察、顾问勾选式调研、会议 AI 全链路、引用即原文 ——
            六个区别于普通知识库的核心创新,让每一份产物都有据可查、稳得住质量。
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <a href="/" className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl transition-all hover:opacity-90 shadow-sm" style={{ background: BRAND_GRAD }}>
              <Play size={14} /> 立即体验
            </a>
            <a href="/help" className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-ink rounded-xl border border-line bg-surface hover:bg-canvas transition-colors">
              <BookOpen size={14} /> 查看手册
            </a>
          </div>
        </div>

        {/* ── Stats strip ──────────────────────────────────────────── */}
        <div className="card p-6 mb-20 grid grid-cols-2 sm:grid-cols-4 gap-6 divide-x divide-line">
          <StatBadge value="6" label="核心创新点" />
          <StatBadge value="2 层" label="Critic + Challenger 评审" />
          <StatBadge value="3 选 1" label="会议 ASR 引擎" />
          <StatBadge value="8 个" label="MCP 工具开放" />
        </div>

        {/* ════════════════════════════════════════════════════════════════
            创新点 1:文档驱动的项目洞察
            ════════════════════════════════════════════════════════════════ */}
        <div className="mb-24">
          <SectionTitle
            idx="01"
            tag="Insight · 项目洞察"
            title="不切片,把核心文档整篇喂给 LLM"
            sub="SOW / 方案 / 合同 / 交接单这类文档的关键条款是绑定的 —— 切片会丢上下文。我们让 LLM 看到全文,然后用「Critic + Challenger」双层评审兜住质量。"
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left: 文档喂 LLM */}
            <div className="rounded-2xl border border-line overflow-hidden bg-surface shadow-sm">
              <div className="px-5 py-3 bg-gradient-to-r from-orange-50 to-rose-50 border-b border-line flex items-center gap-2">
                <FileText size={14} className="text-[#D96400]" />
                <p className="text-sm font-semibold text-ink">文档驱动 · 单份 ≥ 30k 字符整篇入 prompt</p>
              </div>
              <div className="p-5 text-xs space-y-3">
                <div className="flex items-center gap-3 px-3 py-2.5 bg-canvas rounded-lg border border-line">
                  <FileText size={14} className="text-purple-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-ink font-semibold truncate">XX 客户 SOW.docx</p>
                    <p className="text-[10px] text-ink-muted">合同条款 / 验收口径 / 工期</p>
                  </div>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded border border-purple-200">12k tokens</span>
                </div>
                <div className="flex items-center gap-3 px-3 py-2.5 bg-canvas rounded-lg border border-line">
                  <FileText size={14} className="text-blue-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-ink font-semibold truncate">实施方案 v2.pdf</p>
                    <p className="text-[10px] text-ink-muted">技术架构 / 集成清单 / 角色分工</p>
                  </div>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">9k tokens</span>
                </div>
                <div className="flex items-center gap-3 px-3 py-2.5 bg-canvas rounded-lg border border-line">
                  <FileText size={14} className="text-emerald-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-ink font-semibold truncate">交接单 2026Q1.md</p>
                    <p className="text-[10px] text-ink-muted">未完事项 / 客户人脉 / 历史坑</p>
                  </div>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-200">6k tokens</span>
                </div>

                <div className="flex items-center justify-center pt-2">
                  <ChevronRight size={14} className="text-ink-muted rotate-90" />
                </div>

                <div className="px-3 py-2.5 rounded-lg text-white text-center" style={{ background: BRAND_GRAD }}>
                  <p className="font-semibold text-sm">10 个模块的洞察报告</p>
                  <p className="text-[11px] opacity-90 mt-0.5">M1 执行摘要 · M3 健康雷达 · M7 RAID · M10 下一步</p>
                </div>
              </div>
            </div>

            {/* Right: Critic + Challenger */}
            <div className="rounded-2xl border border-line overflow-hidden bg-surface shadow-sm">
              <div className="px-5 py-3 bg-gradient-to-r from-purple-50 to-blue-50 border-b border-line flex items-center gap-2">
                <ShieldCheck size={14} className="text-purple-600" />
                <p className="text-sm font-semibold text-ink">Critic + Challenger · 双层评审</p>
              </div>
              <div className="p-5 text-xs space-y-3">
                <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 bg-white text-purple-700 rounded font-bold">CRITIC</span>
                    <p className="text-ink font-semibold">单模块 4 维度评分</p>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { k: 'Specificity', v: '具体性' },
                      { k: 'Evidence', v: '证据' },
                      { k: 'Timeliness', v: '时效性' },
                      { k: 'Next Step', v: '下一步' },
                    ].map(({ k, v }) => (
                      <div key={k} className="flex items-center gap-1 text-[10px] bg-white px-2 py-1 rounded border border-purple-100">
                        <span className="font-mono text-purple-700">{k}</span>
                        <span className="text-ink-muted">· {v}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-ink-muted mt-2 leading-relaxed">任一维度 &lt; 3 分 → 当模块返工重写,直到全部 ≥ 3。</p>
                </div>

                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 bg-white text-rose-700 rounded font-bold">CHALLENGER</span>
                    <p className="text-ink font-semibold">整文 6 维度反方辩护</p>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {['Specificity', 'Evidence', 'Next Step', 'Completeness', 'Consistency', 'Jargon'].map(k => (
                      <span key={k} className="text-[9px] font-mono text-rose-700 bg-white px-1.5 py-0.5 rounded border border-rose-100 text-center">{k}</span>
                    ))}
                  </div>
                  <p className="text-[10px] text-ink-muted mt-2 leading-relaxed">verdict = major_issues → 全文按 issue 列表逐条修复,再来一轮。</p>
                </div>

                <p className="text-[11px] text-ink-muted leading-relaxed pt-1">
                  代价是慢(2-5 分钟/份),收获是产物质量明显高于裸 LLM 输出 —— 把同行评审和反方辩护内化为系统能力。
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            创新点 2:顾问勾选式调研
            ════════════════════════════════════════════════════════════════ */}
        <div className="mb-24">
          <SectionTitle
            idx="02"
            tag="Survey · 需求调研"
            title="不发问卷给客户填,顾问当场屏上勾选"
            sub="toB 销售实际工作流是「顾问主导引导式访谈」—— 客户口头说,顾问屏上选。系统按 LTC 流程自动出大纲 + 6 题型问卷,选项池预填,顾问只点选不打字。"
          />

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5 mb-5">
            <div className="rounded-2xl border border-line overflow-hidden bg-surface shadow-sm">
              <div className="px-5 py-3 bg-gradient-to-r from-blue-50 to-emerald-50 border-b border-line flex items-center gap-2">
                <ClipboardList size={14} className="text-blue-600" />
                <p className="text-sm font-semibold text-ink">两阶段生成 · 大纲 → 问卷</p>
              </div>
              <div className="p-5 text-xs space-y-3">
                <div className="px-3 py-2.5 bg-canvas rounded-lg border border-line">
                  <p className="font-semibold text-ink mb-1">① survey_outline</p>
                  <p className="text-[11px] text-ink-secondary leading-relaxed">基于 LTC 字典 + 项目文档,生成本次调研要覆盖的章节大纲(线索 / 商机 / 合同 / 交付 / 回款)。</p>
                </div>
                <div className="px-3 py-2.5 bg-canvas rounded-lg border border-line">
                  <p className="font-semibold text-ink mb-1">② survey_v2</p>
                  <p className="text-[11px] text-ink-secondary leading-relaxed">按大纲展开成 6 种题型:单选 / 多选 / 单选+追问 / 多选+追问 / 矩阵 / 简述。选项池由 LLM 预填,顾问当场勾选。</p>
                </div>
                <div className="px-3 py-2.5 rounded-lg text-white" style={{ background: BRAND_GRAD }}>
                  <p className="font-semibold">同一条 agentic 流水线</p>
                  <p className="text-[11px] opacity-90 mt-0.5">Plan → Execute → Critic → Challenger,跟 Insight 共享代码 + 引用追溯</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-line overflow-hidden bg-surface shadow-sm">
              <div className="px-5 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-line flex items-center gap-2">
                <Eye size={14} className="text-emerald-600" />
                <p className="text-sm font-semibold text-ink">题型示例 · 单选 + 追问</p>
              </div>
              <div className="p-5 text-xs space-y-2.5">
                <p className="text-ink font-semibold">客户当前 CRM 使用情况?</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { l: '无 CRM,完全手工', active: false },
                    { l: '有自建 / 第三方', active: true },
                    { l: '用过但已弃用', active: false },
                  ].map(({ l, active }) => (
                    <span key={l} className={`px-2.5 py-1 rounded-full text-[11px] border ${active ? 'bg-orange-100 border-orange-300 text-orange-800 font-semibold' : 'border-line text-ink-secondary bg-white'}`}>{l}</span>
                  ))}
                </div>
                <div className="ml-3 pl-3 border-l-2 border-orange-200 space-y-2 pt-1">
                  <p className="text-ink text-[11px]">→ 追问:具体哪家产品?用了多久?</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['Salesforce', '销售易', 'Zoho', '自建', '其他'].map(c => (
                      <span key={c} className="px-2 py-0.5 text-[10px] rounded-full border border-line text-ink-secondary bg-canvas">{c}</span>
                    ))}
                  </div>
                </div>
                <p className="text-[10px] text-ink-muted pt-2 leading-relaxed border-t border-dashed border-line">
                  追问子题随父题选项联动显示,顾问点完父题立刻显追问,**全程不用现场打字**。
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            创新点 3:会议 AI 全链路
            ════════════════════════════════════════════════════════════════ */}
        <div className="mb-24">
          <SectionTitle
            idx="03"
            tag="Meeting · 会议智能"
            title="从录音到飞书多维表,一条流水线"
            sub="ASR 转写 → 文本打磨 → AI 纪要 → 需求 / Stakeholder 提取 → 一键写飞书文档 / 多维表。三种 ASR 引擎任选,纪要可直接喂回项目洞察当输入。"
          />

          <div className="rounded-2xl border border-line bg-surface shadow-sm p-5 sm:p-7">
            {/* 流水线五阶段 */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 sm:gap-3">
              {[
                { icon: Mic,        title: 'ASR 转写', sub: '讯飞 / 小米 / Whisper', color: '#D96400' },
                { icon: Wand2,      title: '文本打磨', sub: '去口语 / 修标点',       color: '#2563EB' },
                { icon: FileText,   title: 'AI 纪要',  sub: '议题 / 结论 / 待办',   color: '#7C3AED' },
                { icon: Target,     title: '需求提取', sub: '+ Stakeholder 角色',   color: '#059669' },
                { icon: BarChart2,  title: '写飞书',   sub: '文档 + 多维表',         color: '#E11D48' },
              ].map(({ icon: Icon, title, sub, color }, i, arr) => (
                <div key={title} className="relative">
                  <div className="rounded-xl border border-line bg-canvas p-3 text-center h-full">
                    <div className="w-9 h-9 rounded-xl mx-auto mb-2 flex items-center justify-center" style={{ background: `${color}15` }}>
                      <Icon size={16} style={{ color }} />
                    </div>
                    <p className="text-xs font-semibold text-ink">{title}</p>
                    <p className="text-[10px] text-ink-muted mt-0.5 leading-tight">{sub}</p>
                  </div>
                  {i < arr.length - 1 && (
                    <div className="hidden sm:flex absolute top-1/2 -right-2 -translate-y-1/2 z-10 bg-canvas">
                      <ChevronRight size={14} className="text-ink-muted" />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="px-3 py-2.5 bg-canvas rounded-lg border border-line text-xs">
                <p className="font-semibold text-ink mb-0.5">前端 6 个 tab</p>
                <p className="text-[11px] text-ink-muted leading-relaxed">原文 / 打磨 / 纪要 / 需求 / Stakeholder / 关系图</p>
              </div>
              <div className="px-3 py-2.5 bg-canvas rounded-lg border border-line text-xs">
                <p className="font-semibold text-ink mb-0.5">关系图可视化</p>
                <p className="text-[11px] text-ink-muted leading-relaxed">Stakeholder 之间的汇报 / 协作关系自动连线</p>
              </div>
              <div className="px-3 py-2.5 bg-canvas rounded-lg border border-line text-xs">
                <p className="font-semibold text-ink mb-0.5">飞书 Bitable 同步</p>
                <p className="text-[11px] text-ink-muted leading-relaxed">纪要进文档,需求进多维表,顾问无需复制粘贴</p>
              </div>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            创新点 4:三栏工作区 + 引用追溯
            ════════════════════════════════════════════════════════════════ */}
        <div className="mb-24">
          <SectionTitle
            idx="04"
            tag="Workspace · 三栏工作区"
            title="左文档、中报告、右引用 —— 点 [D1] 跳原文"
            sub="项目详情页主形态。报告里的 [D1][K1][W1] 角标点一下,右栏自动展开 + 高亮原文 + 滚动定位。Tiptap 所见即所得在线编辑,改完反向序列化回 markdown。"
          />

          <div className="rounded-2xl border border-line bg-surface shadow-sm overflow-hidden">
            {/* 三栏模拟图 */}
            <div className="grid grid-cols-12 gap-0 min-h-[300px]">
              {/* 左栏:文档清单 */}
              <div className="col-span-3 border-r border-line bg-canvas p-3">
                <p className="text-[10px] uppercase tracking-wider text-ink-muted font-medium mb-2">文档</p>
                <div className="space-y-1.5">
                  {['SOW.docx', '实施方案.pdf', '交接单.md', '会议纪要 ×3'].map((d, i) => (
                    <div key={d} className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-[11px] ${i === 0 ? 'bg-orange-50 text-ink font-semibold' : 'text-ink-secondary'}`}>
                      <FileText size={11} className={i === 0 ? 'text-[#D96400]' : 'text-ink-muted'} />
                      <span className="truncate">{d}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 中栏:报告 */}
              <div className="col-span-6 p-4 border-r border-line">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-ink">M3 健康雷达</p>
                  <button className="flex items-center gap-1 text-[10px] text-[#D96400] hover:underline">
                    <Edit3 size={10} /> 编辑
                  </button>
                </div>
                <div className="text-[11px] text-ink leading-relaxed space-y-1.5">
                  <p>当前项目处于<strong>合同签署阶段</strong>,健康状态<strong>良好</strong>。</p>
                  <p>客户方主决策人已明确签约意向 <span className="inline-flex items-center gap-0.5 px-1 rounded bg-orange-100 text-[#D96400] font-mono text-[10px] cursor-pointer hover:bg-orange-200">[D1]</span>,法务正在 review 最终条款。</p>
                  <p>已识别风险:验收口径与客户预期有差异 <span className="inline-flex items-center gap-0.5 px-1 rounded bg-orange-100 text-[#D96400] font-mono text-[10px] cursor-pointer hover:bg-orange-200">[K1]</span>,需在 kickoff 会前对齐。</p>
                  <p className="text-ink-muted text-[10px] mt-2">↑ 点角标自动展开右栏并高亮原文</p>
                </div>
              </div>

              {/* 右栏:引用 */}
              <div className="col-span-3 bg-orange-50/50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-ink-muted font-medium mb-2">引用 · [D1]</p>
                <div className="bg-white rounded border border-orange-200 p-2 text-[10px] text-ink-secondary leading-relaxed">
                  <p className="font-mono text-[9px] text-[#D96400] mb-1">SOW.docx · 第 2.1 节</p>
                  <p className="bg-orange-100 px-0.5">客户方授权签字人:王总(CIO),签约时间窗口 2026Q2。</p>
                </div>
              </div>
            </div>

            <div className="border-t border-line bg-canvas px-5 py-3 text-xs text-ink-secondary flex items-center gap-2 flex-wrap">
              <Eye size={12} className="text-emerald-600" />
              <span>每个角标都指向**真实文档片段**,而不是 LLM 编的;</span>
              <Edit3 size={12} className="text-blue-600" />
              <span>编辑后保存自动反向序列化成 markdown,不丢格式。</span>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            创新点 5:MCP + REST 双协议
            ════════════════════════════════════════════════════════════════ */}
        <div className="mb-24">
          <SectionTitle
            idx="05"
            tag="MCP · 外部 AI 调用"
            title="让 Claude / Cursor 直接读项目快照"
            sub="站点同时是 MCP 服务器,Claude Desktop / Cursor 等外部 AI 工具配一个 API Key 就能拉项目状态、报告全文、Brief 字段做二次分析。完整实现 MCP 2024-11-05 协议。"
          />

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5">
            <div className="rounded-2xl border border-line overflow-hidden bg-surface shadow-sm">
              <div className="px-5 py-3 bg-gradient-to-r from-violet-50 to-blue-50 border-b border-line flex items-center gap-2">
                <Terminal size={14} className="text-violet-600" />
                <p className="text-sm font-semibold text-ink">8 个只读工具</p>
              </div>
              <div className="p-5 text-xs">
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { n: 'ask_kb',             d: '问知识库' },
                    { n: 'search_kb',          d: '语义搜切片' },
                    { n: 'list_projects',      d: '列项目' },
                    { n: 'get_project_status', d: '取项目快照' },
                    { n: 'list_outputs',       d: '列报告' },
                    { n: 'get_output',         d: '取报告全文' },
                    { n: 'get_brief',          d: '取已确认字段' },
                    { n: 'list_documents',     d: '列项目文档' },
                  ].map(({ n, d }) => (
                    <div key={n} className="flex items-center gap-1.5 px-2 py-1.5 bg-canvas rounded border border-line">
                      <Code2 size={10} className="text-violet-600 flex-shrink-0" />
                      <span className="font-mono text-[10px] text-ink font-semibold">{n}</span>
                      <span className="text-[10px] text-ink-muted">· {d}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-ink-muted mt-3 leading-relaxed">
                  完整 MCP 2024-11-05 协议,JWT / MCP Key 双鉴权(<code className="text-[10px] bg-canvas px-1 rounded border border-line">mcp_xxx</code> 裸 token 兼容)。
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-line overflow-hidden bg-surface shadow-sm">
              <div className="px-5 py-3 bg-gradient-to-r from-emerald-50 to-canvas border-b border-line flex items-center gap-2">
                <Bot size={14} className="text-emerald-600" />
                <p className="text-sm font-semibold text-ink">Claude Desktop 配置示例</p>
              </div>
              <div className="p-5">
                <pre className="text-[10px] font-mono bg-ink/5 text-ink p-3 rounded-lg overflow-x-auto leading-relaxed">{`{
  "mcpServers": {
    "kb-system": {
      "command": "curl",
      "args": ["-N", "-H", "Authorization: Bearer mcp_xxx",
               "https://kb.liii.in/api/mcp"]
    }
  }
}`}</pre>
                <p className="text-[11px] text-ink-secondary mt-3 leading-relaxed">
                  详见 <Link to="/api" className="text-[#D96400] underline">/api 文档 → MCP 服务器</Link>,
                  或在系统设置里一键生成 MCP Key。
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            创新点 6:知识质量飞轮
            ════════════════════════════════════════════════════════════════ */}
        <div className="mb-24">
          <SectionTitle
            idx="06"
            tag="Flywheel · 知识飞轮"
            title="每一次 👎 都能指向「该补什么」"
            sub="未审核切片不进检索 + 引用热度参与排序 + 负反馈自动入审 + Challenge 失败按(阶段, 行业)聚合 —— 把「答不准」变成结构化的内容补充清单。"
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-2xl border border-line overflow-hidden bg-surface shadow-sm">
              <div className="px-5 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-line flex items-center gap-2">
                <Filter size={14} className="text-emerald-600" />
                <p className="text-sm font-semibold text-ink">检索闸门 · 未审核不召回</p>
              </div>
              <div className="p-5 text-xs space-y-2">
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-100">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 bg-white text-emerald-700 rounded border border-emerald-200 font-bold">approved</span>
                  <span className="text-ink-secondary flex-1">合同审批流程</span>
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-orange-600">
                    <Flame size={9} /> 12
                  </span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-100">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 bg-white text-emerald-700 rounded border border-emerald-200 font-bold">approved</span>
                  <span className="text-ink-secondary flex-1">法务会签规则</span>
                  <span className="text-[10px] font-mono text-emerald-700">+log(1+N)×0.05</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg border border-dashed border-gray-300 opacity-60">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 bg-white text-gray-500 rounded border font-bold">pending</span>
                  <span className="text-gray-500 flex-1 line-through">XX 客户特殊条款</span>
                  <span className="text-[10px] font-mono text-gray-500">filter out</span>
                </div>
                <p className="text-[11px] text-ink-muted pt-1 leading-relaxed">
                  Qdrant payload 写入 review_status,检索默认过滤待审切片;热门切片在 rerank 加权上浮。
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-line overflow-hidden bg-surface shadow-sm">
              <div className="px-5 py-3 bg-gradient-to-r from-rose-50 to-orange-50 border-b border-line flex items-center gap-2">
                <Target size={14} className="text-rose-600" />
                <p className="text-sm font-semibold text-ink">反馈聚合 · 👎 与挑战失败汇总</p>
              </div>
              <div className="p-5 text-xs space-y-2.5">
                {[
                  { icon: ThumbsDown, bg: 'bg-rose-100',   ic: 'text-rose-600',   text: '用户 👎 一次答案', sub: '引用的每个切片 down_votes += 1' },
                  { icon: Repeat,     bg: 'bg-orange-100', ic: 'text-orange-600', text: '累计 ≥ 2 次 → 自动入审核队列', sub: 'reason: 用户反馈负面 ×N' },
                  { icon: Network,    bg: 'bg-purple-100', ic: 'text-purple-600', text: 'Challenge 失败按 (阶段, 行业) 聚合', sub: '生成 coverage_gap → 提示 PM 该补哪里' },
                ].map(({ icon: Icon, bg, ic, text, sub }) => (
                  <div key={text} className="flex items-start gap-2.5">
                    <div className={`w-6 h-6 rounded-full ${bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      <Icon size={11} className={ic} />
                    </div>
                    <div className="flex-1">
                      <p className="text-ink">{text}</p>
                      <p className="text-[10px] text-ink-muted mt-0.5">{sub}</p>
                    </div>
                  </div>
                ))}

                <div className="mt-3 px-3 py-2.5 bg-gradient-to-r from-rose-50 to-transparent rounded-lg border border-rose-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-ink-muted uppercase tracking-wider font-medium">Dashboard 示例</span>
                    <span className="text-[10px] font-mono text-rose-600 flex items-center gap-0.5">
                      <Flame size={9} /> fail × 4
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-1">
                    <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-100">合同</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">制造业</span>
                  </div>
                  <p className="text-[11px] text-ink-secondary line-clamp-1">例:多方签约 SLA 条款如何处理?</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            架构补充:多层记忆体系
            ════════════════════════════════════════════════════════════════ */}
        <div className="mb-20">
          <SectionTitle
            idx="ARCH"
            tag="架构基础"
            title="多层知识记忆体系 · L1 → L4"
            sub="每个项目 4 层记忆:从「我是谁」到「我说过什么」再到「已对齐的事实」。问答 / PM 视角 / 报告生成共享同一份记忆。"
          />

          <div className="rounded-2xl border-2 border-orange-200 overflow-hidden bg-white shadow-sm">
            {[
              { id: 1, name: '项目元数据', tagline: '我是谁',             color: '#D96400', bg: 'bg-orange-50',  store: 'PostgreSQL · projects',           query: '主键直查' },
              { id: 2, name: '文档层',     tagline: '我有哪些资料',       color: '#2563EB', bg: 'bg-blue-50',    store: 'PostgreSQL · documents',          query: '元数据过滤 · 摘要拼接' },
              { id: 3, name: '切片层',     tagline: '具体说了什么(真相源)', color: '#7C3AED', bg: 'bg-purple-50',  store: 'PostgreSQL · chunks + Qdrant',    query: '语义检索 + rerank · 过滤未审核' },
              { id: 4, name: 'Brief 层',   tagline: '已对齐的事实',       color: '#059669', bg: 'bg-emerald-50', store: 'PostgreSQL · project_briefs',     query: '按 output_kind 直查 · 注入 prompt' },
            ].map((L, idx) => (
              <div key={L.id} className={`flex items-stretch ${idx > 0 ? 'border-t border-line' : ''} ${L.bg}`}>
                <div className="flex-shrink-0 w-14 sm:w-20 flex flex-col items-center justify-center py-3 border-r border-line/60">
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-ink-muted leading-none">层</span>
                  <span className="text-xl sm:text-2xl font-extrabold leading-tight" style={{ color: L.color }}>{L.id}</span>
                </div>
                <div className="flex-1 px-3 sm:px-4 py-3 min-w-0">
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
                    <Layers size={14} style={{ color: L.color, flexShrink: 0 }} />
                    <p className="text-sm font-semibold text-ink">{L.name}</p>
                    <span className="text-[10px] text-ink-muted">· {L.tagline}</span>
                  </div>
                </div>
                <div className="flex-shrink-0 w-32 sm:w-56 px-2 sm:px-3 py-3 flex flex-col justify-center border-l border-line/60 bg-white/60">
                  <p className="text-[9px] uppercase tracking-wider text-ink-muted leading-none mb-1">存储 / 召回</p>
                  <p className="text-[11px] sm:text-xs font-mono font-semibold text-ink leading-snug">{L.store}</p>
                  <p className="text-[10px] text-ink-muted leading-snug mt-0.5">{L.query}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Live QA demo ──────────────────────────────────────────── */}
        <div className="mb-20">
          <SectionTitle
            idx="DEMO"
            tag="实时演示"
            title="向知识库提问"
            sub="输入自然语言,系统检索最相关切片,RAG 生成带来源引用的答案。"
          />
          <div className="max-w-2xl mx-auto">
            <QaDemo />
          </div>
        </div>

        {/* ── CTA ──────────────────────────────────────────────────── */}
        <div className="rounded-2xl p-8 sm:p-12 text-center mb-8" style={{ background: 'linear-gradient(135deg,#FFF4E6,#FFE8CC)' }}>
          <h2 className="text-2xl font-extrabold text-ink mb-2">开始构建你的知识库</h2>
          <p className="text-ink-secondary text-sm mb-6">上传第一份文档,5 分钟内即可开始问答</p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <a href="/" className="flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white rounded-xl transition-all hover:opacity-90 shadow" style={{ background: BRAND_GRAD }}>
              <Play size={14} /> 立即进入系统
            </a>
            <a href="/help" className="flex items-center gap-2 px-6 py-3 text-sm font-medium text-[#D96400] rounded-xl border border-orange-300 bg-white hover:bg-orange-50 transition-colors">
              <BookOpen size={14} /> 阅读使用手册
            </a>
            <a href="/api" className="flex items-center gap-2 px-6 py-3 text-sm font-medium text-ink-secondary rounded-xl border border-line bg-white hover:bg-canvas transition-colors">
              <Code2 size={14} /> API 文档
            </a>
          </div>
        </div>

        <p className="text-center text-xs text-ink-muted">
          KB System · 纷享销客 CRM 实施知识库 ·{' '}
          <a href="https://kb.tokenwave.cloud" className="hover:text-ink transition-colors">kb.tokenwave.cloud</a>
        </p>

      </div>
    </div>
  )
}
