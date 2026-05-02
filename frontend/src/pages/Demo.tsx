/**
 * Demo — 产品演示页面
 * Route: /demo  (no auth required)
 */
import { useState, useEffect, useRef } from 'react'
import {
  Upload, MessageSquare, Layers, Folder, Award, Terminal,
  ChevronRight, CheckCircle, Zap, Brain, ArrowRight,
  BarChart2, Search, RefreshCw, FileText, Star, ThumbsUp, ThumbsDown,
  Shield, Clock, Database, Code2, Sparkles, Play,
  BookOpen, KeyRound, Target, Filter, Flame, Repeat,
  ClipboardList, Lightbulb, Wand2, ExternalLink, Send,
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

// ── Animated QA demo ──────────────────────────────────────────────────────────

const QA_DEMO_FLOWS: { q: string; a: string; sources: string[] }[] = [
  {
    q: '合同阶段的审批流程是什么？',
    a: '合同审批遵循「起草 → 法务审核 → 商务确认 → 高管签署」四步流程。法务审核需在 3 个工作日内完成，超时需上报项目经理。所有合同须在 OA 系统留存电子版……',
    sources: ['合同管理手册.pdf · 第 3 章', '实施规范 v2.1.docx · §5.2'],
  },
  {
    q: '回款认领需要哪些材料？',
    a: '回款认领需提交：① 银行到账回执（截图或 PDF）；② 合同编号和对应金额；③ 客户开票信息（如有开票需求）。在 CRM「回款管理」模块操作，选择对应合同后上传材料……',
    sources: ['回款操作指南.pdf · 回款认领流程', '财务对接规范.md · 第 4 节'],
  },
  {
    q: '商机阶段如何做竞品分析？',
    a: '商机阶段竞品分析重点关注三个维度：功能覆盖度、TCO（总拥有成本）和实施周期。建议使用标准化比较矩阵，重点突出纷享销客在移动端和销售过程管控方面的差异化优势……',
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
        setDisplayQ(f.q.slice(0, qi))
        qi++
        timerRef.current = setTimeout(typeQ, 40)
      } else {
        setPhase('answering')
        let ai = 0
        const typeA = () => {
          if (ai <= f.a.length) {
            setDisplayA(f.a.slice(0, ai))
            ai += 3
            timerRef.current = setTimeout(typeA, 18)
          } else {
            setShowSrc(true)
            setPhase('done')
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
    setFlowIdx(idx)
    runFlow(idx)
  }

  return (
    <div className="rounded-2xl border border-line overflow-hidden shadow-lg bg-surface">
      {/* window chrome */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 bg-gray-100 border-b border-line">
        <span className="w-3 h-3 rounded-full bg-red-400" />
        <span className="w-3 h-3 rounded-full bg-yellow-400" />
        <span className="w-3 h-3 rounded-full bg-green-400" />
        <span className="ml-3 text-xs text-ink-muted font-mono">KB System — 智能问答</span>
      </div>

      {/* flow tabs */}
      <div className="flex gap-1 px-4 py-2 bg-canvas border-b border-line overflow-x-auto">
        {QA_DEMO_FLOWS.map((f, i) => (
          <button
            key={i}
            onClick={() => switchFlow(i)}
            className={`flex-shrink-0 text-[11px] px-3 py-1 rounded-full font-medium transition-all ${
              flowIdx === i ? 'text-white' : 'text-ink-secondary hover:bg-surface'
            }`}
            style={flowIdx === i ? { background: BRAND_GRAD } : {}}
          >
            示例 {i + 1}
          </button>
        ))}
      </div>

      {/* chat area */}
      <div className="p-5 min-h-[260px] flex flex-col gap-4">
        {/* user bubble */}
        {displayQ && (
          <div className="flex justify-end">
            <div className="max-w-[75%] px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm text-white" style={{ background: BRAND_GRAD }}>
              {displayQ}{phase === 'typing' && <span className="inline-block w-0.5 h-4 bg-white ml-0.5 animate-pulse align-middle" />}
            </div>
          </div>
        )}

        {/* assistant bubble */}
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

              {/* sources */}
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
                    <button className="flex items-center gap-1 text-[11px] text-green-600 hover:text-green-700">
                      <ThumbsUp size={11} /> 有帮助
                    </button>
                    <button className="flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink ml-2">
                      <Star size={11} /> 收藏
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* idle state */}
        {phase === 'idle' && !displayQ && (
          <div className="flex-1 flex items-center justify-center text-ink-muted text-sm">
            <RefreshCw size={14} className="animate-spin mr-2" /> 加载演示…
          </div>
        )}
      </div>

      {/* input bar */}
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

// ── Feature card ──────────────────────────────────────────────────────────────

function FeatureCard({
  icon: Icon, title, desc, color = 'orange',
  items,
}: {
  icon: any; title: string; desc: string; color?: 'orange' | 'purple' | 'blue' | 'green' | 'teal' | 'rose'
  items?: string[]
}) {
  const colors: Record<string, string> = {
    orange: 'bg-orange-50 border-orange-100',
    purple: 'bg-purple-50 border-purple-100',
    blue:   'bg-blue-50 border-blue-100',
    green:  'bg-green-50 border-green-100',
    teal:   'bg-teal-50 border-teal-100',
    rose:   'bg-rose-50 border-rose-100',
  }
  const iconColors: Record<string, string> = {
    orange: '#D96400', purple: '#7C3AED', blue: '#2563EB',
    green: '#059669', teal: '#0D9488', rose: '#E11D48',
  }
  const iconBg: Record<string, string> = {
    orange: 'bg-orange-100', purple: 'bg-purple-100', blue: 'bg-blue-100',
    green: 'bg-green-100', teal: 'bg-teal-100', rose: 'bg-rose-100',
  }
  return (
    <div className={`rounded-xl border p-5 ${colors[color]}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${iconBg[color]}`}>
        <Icon size={17} style={{ color: iconColors[color] }} />
      </div>
      <p className="font-semibold text-ink mb-1.5">{title}</p>
      <p className="text-xs text-ink-secondary leading-relaxed mb-3">{desc}</p>
      {items && (
        <ul className="space-y-1">
          {items.map(item => (
            <li key={item} className="flex items-center gap-1.5 text-xs text-ink-secondary">
              <CheckCircle size={11} style={{ color: iconColors[color], flexShrink: 0 }} />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Use case step flow ────────────────────────────────────────────────────────

function UseCaseFlow({ steps }: { steps: { icon: any; title: string; desc: string }[] }) {
  return (
    <div className="flex flex-col sm:flex-row gap-0">
      {steps.map((step, i) => (
        <div key={i} className="flex sm:flex-col items-start sm:items-center gap-3 sm:gap-2 flex-1">
          <div className="flex sm:flex-col items-center gap-3 sm:gap-2 flex-1 w-full">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand-light flex-shrink-0">
              <step.icon size={18} style={{ color: 'var(--accent)' }} />
            </div>
            {i < steps.length - 1 && (
              <ArrowRight size={14} className="text-ink-muted sm:hidden flex-shrink-0" />
            )}
            <div className="sm:text-center">
              <p className="text-sm font-semibold text-ink">{step.title}</p>
              <p className="text-xs text-ink-secondary mt-0.5">{step.desc}</p>
            </div>
          </div>
          {i < steps.length - 1 && (
            <ArrowRight size={14} className="text-ink-muted hidden sm:block self-start mt-3 sm:mt-0 sm:self-auto flex-shrink-0" style={{ transform: 'none' }} />
          )}
        </div>
      ))}
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
            <a href="/help" className="text-xs text-ink-secondary hover:text-ink px-3 py-1.5 rounded-lg hover:bg-canvas transition-colors">
              使用手册
            </a>
            <a href="/api" className="text-xs text-ink-secondary hover:text-ink px-3 py-1.5 rounded-lg hover:bg-canvas transition-colors">
              API 文档
            </a>
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
            <Sparkles size={11} /> CRM 实施团队专属知识管理平台
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-ink leading-tight mb-4">
            让实施知识
            <br />
            <span style={{ background: BRAND_GRAD, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              触手可及
            </span>
          </h1>
          <p className="text-ink-secondary text-base max-w-lg mx-auto leading-relaxed mb-8">
            上传实施文档，AI 自动切片入库，随时用自然语言提问。
            支持 PM 视角分析、MCP 集成和知识覆盖率挑战。
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
        <div className="card p-6 mb-16 grid grid-cols-2 sm:grid-cols-4 gap-6 divide-x divide-line">
          <StatBadge value="50MB" label="单文件上传上限" />
          <StatBadge value="6 类" label="文档格式支持" />
          <StatBadge value="9 段" label="LTC 阶段标注" />
          <StatBadge value="MCP" label="Model Context Protocol" />
        </div>

        {/* ── Multi-layer knowledge memory architecture ───────────── */}
        <div className="mb-20">
          <div className="text-center mb-8">
            <Tag>核心架构</Tag>
            <h2 className="text-2xl font-bold text-ink mt-3 mb-2">多层知识记忆体系</h2>
            <p className="text-ink-secondary text-sm max-w-xl mx-auto">
              每个项目都有 4 层记忆——从「我是谁」到「我说过什么」再到「已对齐的事实」。
              问答 / PM 视角 / 文档生成共享同一份记忆。
            </p>
          </div>

          <div className="rounded-2xl border border-line bg-surface shadow-sm p-5 sm:p-8">

            {/* Inputs row */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-1">
              {[
                { icon: Upload,        label: '文档上传',   sub: 'PDF · DOCX · PPT · MD' },
                { icon: Folder,        label: '项目信息',   sub: '客户 / 行业 / 立项日' },
                { icon: MessageSquare, label: '对话与反馈', sub: '问答 · 👎 · Brief 编辑' },
              ].map(({ icon: Icon, label, sub }) => (
                <div key={label} className="rounded-xl border border-line bg-canvas px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Icon size={13} className="text-ink-muted flex-shrink-0" />
                    <p className="text-xs font-semibold text-ink truncate">{label}</p>
                  </div>
                  <p className="text-[10px] text-ink-muted truncate">{sub}</p>
                </div>
              ))}
            </div>

            {/* Down arrow w/ caption */}
            <div className="flex flex-col items-center my-3">
              <div className="w-px h-3 bg-line" />
              <div className="text-[10px] text-ink-muted bg-canvas border border-line rounded-full px-2.5 py-0.5">
                LLM 抽取 · 切片 · 向量化
              </div>
              <div className="w-px h-3 bg-line" />
              <ChevronRight size={12} className="text-ink-muted rotate-90 -mt-0.5" />
            </div>

            {/* 4 memory layers stack */}
            <div className="rounded-xl border-2 border-orange-200 overflow-hidden bg-white">
              {[
                {
                  id: 1, name: '项目元数据', tagline: '我是谁',
                  icon: Folder, color: '#D96400', bg: 'bg-orange-50',
                  what: ['客户名称', '行业', '立项日期', '客户画像'],
                  store: 'PostgreSQL · projects',
                  query: '主键直查 · 项目锁定',
                },
                {
                  id: 2, name: '文档层', tagline: '我有哪些资料',
                  icon: FileText, color: '#2563EB', bg: 'bg-blue-50',
                  what: ['文件名', 'Markdown 全文', 'AI 摘要', '阶段标签'],
                  store: 'PostgreSQL · documents',
                  query: '元数据过滤 · 摘要拼接',
                },
                {
                  id: 3, name: '切片层（真相源）', tagline: '具体说了什么',
                  icon: Layers, color: '#7C3AED', bg: 'bg-purple-50',
                  what: ['文本切片', '阶段/模块标签', '向量 1024d', '审核状态', '🔥 热度'],
                  store: 'PostgreSQL · chunks  +  Qdrant',
                  query: '语义检索 + rerank + 过滤未审核',
                },
                {
                  id: 4, name: 'Brief 层（确认知识）', tagline: '已对齐的事实',
                  icon: ClipboardList, color: '#059669', bg: 'bg-emerald-50',
                  what: ['kickoff_pptx Brief', 'insight Brief', '置信度 · 来源', '人工确认'],
                  store: 'PostgreSQL · project_briefs',
                  query: '按 output_kind 直查 · 注入 prompt',
                },
              ].map((L, idx) => (
                <div key={L.id} className={`flex items-stretch ${idx > 0 ? 'border-t border-line' : ''} ${L.bg}`}>
                  {/* Layer badge */}
                  <div className="flex-shrink-0 w-12 sm:w-20 flex flex-col items-center justify-center py-3 border-r border-line/60">
                    <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-ink-muted leading-none">层</span>
                    <span className="text-xl sm:text-2xl font-extrabold leading-tight" style={{ color: L.color }}>{L.id}</span>
                  </div>

                  {/* Name + what */}
                  <div className="flex-1 px-3 sm:px-4 py-3 min-w-0">
                    <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 flex-wrap">
                      <L.icon size={14} style={{ color: L.color, flexShrink: 0 }} />
                      <p className="text-sm font-semibold text-ink">{L.name}</p>
                      <span className="text-[10px] text-ink-muted">· {L.tagline}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {L.what.map(w => (
                        <span key={w} className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-line text-ink-secondary">{w}</span>
                      ))}
                    </div>
                  </div>

                  {/* Storage column */}
                  <div className="flex-shrink-0 w-28 sm:w-48 px-2 sm:px-3 py-3 flex flex-col justify-center border-l border-line/60 bg-white/60">
                    <p className="text-[9px] uppercase tracking-wider text-ink-muted leading-none mb-1">存储 / 召回</p>
                    <p className="text-[11px] sm:text-xs font-mono font-semibold text-ink leading-snug">{L.store}</p>
                    <p className="text-[10px] text-ink-muted leading-snug mt-0.5">{L.query}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Down arrow w/ caption */}
            <div className="flex flex-col items-center my-3">
              <div className="w-px h-3 bg-line" />
              <div className="text-[10px] text-ink-muted bg-canvas border border-line rounded-full px-2.5 py-0.5">
                组合检索 · 上下文拼装
              </div>
              <div className="w-px h-3 bg-line" />
              <ChevronRight size={12} className="text-ink-muted rotate-90 -mt-0.5" />
            </div>

            {/* Consumers row */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {[
                { icon: MessageSquare, label: '智能问答',   sub: 'L3 召回 + 引用' },
                { icon: Brain,         label: 'PM 视角',    sub: 'L1+L2+L3 + 项目锁定' },
                { icon: Wand2,         label: '文档生成',   sub: 'L4 Brief 驱动 · L1/L2/L3 补全' },
              ].map(({ icon: Icon, label, sub }) => (
                <div key={label} className="rounded-xl px-3 py-2.5 text-white shadow-sm" style={{ background: BRAND_GRAD }}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Icon size={13} className="flex-shrink-0" />
                    <p className="text-xs font-semibold truncate">{label}</p>
                  </div>
                  <p className="text-[10px] opacity-90 truncate">{sub}</p>
                </div>
              ))}
            </div>

            {/* Support tier footer */}
            <div className="mt-5 pt-4 border-t border-dashed border-line flex items-center justify-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-ink-muted mr-1">支撑设施</span>
              {[
                { label: 'Redis', desc: '异步任务队列' },
                { label: 'MinIO', desc: '原始文件留存' },
                { label: 'Celery', desc: '文档解析 worker' },
                { label: 'BGE-M3', desc: '1024d 嵌入模型' },
              ].map(({ label, desc }) => (
                <span key={label} className="text-[10px] px-2 py-0.5 rounded-full bg-canvas border border-line text-ink-secondary">
                  <span className="font-mono font-semibold text-ink">{label}</span>
                  <span className="text-ink-muted"> · {desc}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Quality governance highlight (Block 1 + Block 2) ───── */}
        <div className="mb-20">
          <div className="text-center mb-8">
            <Tag>最近上线 · 知识质量治理</Tag>
            <h2 className="text-2xl font-bold text-ink mt-3 mb-2">从"能答"到"答得可信"</h2>
            <p className="text-ink-secondary text-sm max-w-xl mx-auto">
              检索闸门 + 引用热度 + 负反馈回溯 + 挑战失败聚合——让每一次 👎 都能指向该补什么内容。
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left: retrieval gate demo */}
            <div className="rounded-2xl border border-line overflow-hidden bg-surface shadow-sm">
              <div className="px-5 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-line flex items-center gap-2">
                <Filter size={14} className="text-emerald-600" />
                <p className="text-sm font-semibold text-ink">检索闸门 · 未复审切片不回召</p>
              </div>
              <div className="p-5 space-y-2.5 text-xs">
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-100">
                  <CheckCircle size={13} className="text-emerald-600 flex-shrink-0" />
                  <span className="text-ink-secondary flex-1">已批准 · 合同审批流程</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 bg-white text-emerald-700 rounded border border-emerald-200">score 0.91</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-100">
                  <CheckCircle size={13} className="text-emerald-600 flex-shrink-0" />
                  <span className="text-ink-secondary flex-1 flex items-center gap-1.5">
                    已批准 · 法务会签规则
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-orange-600 bg-orange-50 px-1 rounded">
                      <Flame size={9} /> 12
                    </span>
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 bg-white text-emerald-700 rounded border border-emerald-200">+0.08 加权</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg border border-dashed border-gray-300 opacity-60">
                  <Shield size={13} className="text-gray-400 flex-shrink-0" />
                  <span className="text-gray-500 flex-1 line-through">待复审 · XX 客户特殊条款</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 bg-white text-gray-500 rounded border">已过滤</span>
                </div>
                <p className="text-[11px] text-ink-muted pt-1 leading-relaxed">
                  Qdrant payload 写入 review_status + 引用次数，检索默认过滤待审切片；热门切片在 rerank 中加权上浮。
                </p>
              </div>
            </div>

            {/* Right: feedback flywheel */}
            <div className="rounded-2xl border border-line overflow-hidden bg-surface shadow-sm">
              <div className="px-5 py-3 bg-gradient-to-r from-rose-50 to-orange-50 border-b border-line flex items-center gap-2">
                <Target size={14} className="text-rose-600" />
                <p className="text-sm font-semibold text-ink">反馈飞轮 · 👎 与挑战失败自动汇总</p>
              </div>
              <div className="p-5 space-y-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <ThumbsDown size={11} className="text-rose-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-ink">用户 👎 一次答案</p>
                    <p className="text-[11px] text-ink-muted mt-0.5">引用的每个切片 down_votes += 1</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Repeat size={11} className="text-orange-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-ink">累计 ≥2 次 → 自动入审核队列</p>
                    <p className="text-[11px] text-ink-muted mt-0.5">reason: 用户反馈负面 ×N</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Award size={11} className="text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-ink">Challenge 失败题按 (阶段, 行业) 聚合</p>
                    <p className="text-[11px] text-ink-muted mt-0.5">生成 coverage_gap，提示 PM 该补哪里</p>
                  </div>
                </div>

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
                  <p className="text-[11px] text-ink-secondary line-clamp-1">
                    例：多方签约 SLA 条款如何处理？
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Three-number strip: measurable impact */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { icon: Filter, label: '检索默认过滤', value: 'review_status', desc: '未批准切片不污染答案' },
              { icon: Flame,  label: '热度参与排序', value: '+log(1+N)×0.05', desc: '被引用越多越靠前' },
              { icon: Target, label: '缺口自动聚合', value: '(阶段, 行业)', desc: '告诉 PM 该补什么' },
            ].map(({ icon: Icon, label, value, desc }) => (
              <div key={label} className="rounded-xl border border-line bg-surface px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-canvas flex items-center justify-center flex-shrink-0">
                  <Icon size={15} className="text-ink-secondary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-ink-muted">{label}</p>
                  <p className="text-sm font-semibold text-ink font-mono truncate">{value}</p>
                  <p className="text-[11px] text-ink-muted">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Output Center highlight (最近上线) ───────────────────── */}
        <div className="mb-20">
          <div className="text-center mb-8">
            <Tag>v3 阶段产物</Tag>
            <h2 className="text-2xl font-bold text-ink mt-3 mb-2">三类核心产物，按阶段一键生成</h2>
            <p className="text-ink-secondary text-sm max-w-xl mx-auto">
              项目洞察 / 启动会 PPT / 需求调研 — 三种产出方式各对应一种工作模式
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5 mb-6">
            {/* Left: agents */}
            <div className="rounded-2xl border border-line overflow-hidden bg-surface shadow-sm">
              <div className="px-5 py-3 bg-gradient-to-r from-orange-50 to-rose-50 border-b border-line flex items-center gap-2">
                <Wand2 size={14} className="text-[#D96400]" />
                <p className="text-sm font-semibold text-ink">三类产物 · 对应三种工作模式</p>
              </div>
              <div className="p-5 space-y-3 text-xs">
                {[
                  { icon: Lightbulb, title: '项目洞察 (规则化)', color: '#7C3AED', bg: 'bg-purple-50', border: 'border-purple-100', desc: 'M1 执行摘要 / M3 健康雷达 / M7 RAID / M10 下一步 等 10 个模块,Critic + Challenger 评审闭环。文档驱动,无需填表。' },
                  { icon: FileText, title: '启动会 PPT (对话式)', color: '#D96400', bg: 'bg-orange-50', border: 'border-orange-100', desc: '11 页 Claude 风格 HTML / pptxgen .pptx 双格式。顾问与智能体对话,几轮收集信息后生成。' },
                  { icon: ClipboardList, title: '需求调研 (顾问勾选)', color: '#2563EB', bg: 'bg-blue-50', border: 'border-blue-100', desc: '系统按 LTC 流程自动出大纲 + 6 题型问卷,顾问当场口头问 + 屏上勾选,不用现场打字。' },
                ].map(({ icon: Icon, title, color, bg, border, desc }) => (
                  <div key={title} className={`flex items-start gap-2.5 px-3 py-2.5 ${bg} rounded-lg border ${border}`}>
                    <div className="w-7 h-7 rounded bg-white flex items-center justify-center flex-shrink-0">
                      <Icon size={13} style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink">{title}</p>
                      <p className="text-[11px] text-ink-secondary leading-relaxed mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: chat simulation */}
            <div className="rounded-2xl border border-line overflow-hidden bg-surface shadow-sm">
              <div className="px-5 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-line flex items-center gap-2">
                <MessageSquare size={14} className="text-emerald-600" />
                <p className="text-sm font-semibold text-ink">对话式收集信息 · 按需检索知识库</p>
              </div>
              <div className="p-5 space-y-3 text-xs">
                {/* 顾问问候 */}
                <div className="flex justify-start">
                  <div className="bg-white border border-line rounded-2xl px-3 py-2 max-w-[90%]">
                    <p className="text-ink leading-relaxed">你好！我会分几轮了解项目情况。先问第一个——行业是？</p>
                  </div>
                </div>
                {/* 选项 chips */}
                <div className="flex flex-wrap gap-1.5 justify-start ml-1">
                  {['制造业', 'SaaS', '快消', '医疗'].map(c => (
                    <span key={c} className={`px-2.5 py-0.5 text-[11px] rounded-full border ${c === '制造业' ? 'bg-orange-100 border-orange-300 text-orange-800 font-semibold' : 'border-orange-200 text-orange-700 bg-white'}`}>{c}</span>
                  ))}
                </div>
                {/* 用户选择 */}
                <div className="flex justify-end">
                  <div className="bg-orange-50 border border-orange-100 rounded-2xl px-3 py-1.5">
                    <p className="text-ink">制造业</p>
                  </div>
                </div>
                {/* 工具调用标签 */}
                <div className="flex gap-1 ml-1">
                  <span className="flex items-center gap-1 text-[10px] text-ink-muted bg-gray-50 border border-line rounded-full px-2 py-0.5">
                    <Search size={9} /> 制造业 CRM 销售流程
                  </span>
                </div>
                {/* 顾问追问 */}
                <div className="flex justify-start">
                  <div className="bg-white border border-line rounded-2xl px-3 py-2 max-w-[90%]">
                    <p className="text-ink leading-relaxed">结合历史项目，制造业客户通常最关心三个场景。优先哪几个？(多选)</p>
                  </div>
                </div>
                <p className="text-[11px] text-ink-muted text-center">
                  … 几轮对话后点击右侧「生成文档」
                </p>
              </div>
            </div>
          </div>

          {/* Feature strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { icon: Wand2, label: '技能库可复用', value: 'pptgen 等方法论', desc: '挂上即套用 11 页骨架' },
              { icon: Search, label: '对话中检索', value: 'search_kb 工具', desc: '按行业/模块查历史项目' },
              { icon: ExternalLink, label: '在线播放', value: 'HTML 幻灯片', desc: '浏览器打开即演示，⌘P 导出 PDF' },
            ].map(({ icon: Icon, label, value, desc }) => (
              <div key={label} className="rounded-xl border border-line bg-surface px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-canvas flex items-center justify-center flex-shrink-0">
                  <Icon size={15} className="text-ink-secondary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-ink-muted">{label}</p>
                  <p className="text-sm font-semibold text-ink truncate">{value}</p>
                  <p className="text-[11px] text-ink-muted">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Live QA demo ──────────────────────────────────────────── */}
        <div className="mb-20">
          <div className="text-center mb-8">
            <Tag>实时演示</Tag>
            <h2 className="text-2xl font-bold text-ink mt-3 mb-2">AI 驱动的知识问答</h2>
            <p className="text-ink-secondary text-sm max-w-md mx-auto">
              输入自然语言问题，系统自动检索最相关的知识切片，
              结合 RAG 生成有来源引用的结构化答案。
            </p>
          </div>
          <div className="max-w-2xl mx-auto">
            <QaDemo />
          </div>
        </div>

        {/* ── Feature grid ─────────────────────────────────────────── */}
        <div className="mb-20">
          <div className="text-center mb-8">
            <Tag>核心功能</Tag>
            <h2 className="text-2xl font-bold text-ink mt-3 mb-2">完整的知识管理闭环</h2>
            <p className="text-ink-secondary text-sm">从文档上传到知识问答，覆盖实施团队全场景需求</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard
              icon={Upload} color="orange" title="智能文档处理"
              desc="支持 PDF/Word/PPT/Excel/MD 等主流格式，AI 自动识别结构、切片并分类 LTC 阶段"
              items={['自动推断文档类型', 'LTC 阶段置信度打分', '自动生成摘要 + FAQ']}
            />
            <FeatureCard
              icon={MessageSquare} color="blue" title="多轮 RAG 问答"
              desc="基于向量检索的语义问答，支持多轮对话上下文、来源引用跳转和答案反馈"
              items={['最多 6 轮对话上下文', '来源切片可跳转原文', '👍👎⭐ 三级反馈']}
            />
            <FeatureCard
              icon={Brain} color="purple" title="虚拟项目经理"
              desc="以特定客户项目 PM 的视角回答，输出状态 / 决策 / 下一步 / 风险四维分析"
              items={['限定项目文档范围', '结构化项目分析报告', '支持 MCP 调用']}
            />
            <FeatureCard
              icon={Layers} color="teal" title="切片精细管理"
              desc="查看每个知识切片的热度、审核状态，支持内联编辑并自动重新向量化"
              items={['🔥 热度追踪', '审核工作流', '内容编辑即时更新']}
            />
            <FeatureCard
              icon={Folder} color="green" title="项目维度组织"
              desc="按客户项目维度组织文档，支持行业标签继承，PM 模式自动过滤项目范围"
              items={['行业标签自动继承', '模块覆盖率统计', '文档类型分类']}
            />
            <FeatureCard
              icon={Terminal} color="rose" title="MCP / REST 集成"
              desc="完整实现 MCP 2024-11-05 协议，Claude Desktop / Cursor 等 AI 工具开箱即用"
              items={['ask_kb / search_kb / list_projects', 'MCP API Key 鉴权', '同时支持 JWT']}
            />
          </div>
        </div>

        {/* ── Use cases ────────────────────────────────────────────── */}
        <div className="mb-20">
          <div className="text-center mb-8">
            <Tag>典型场景</Tag>
            <h2 className="text-2xl font-bold text-ink mt-3 mb-2">三种核心使用场景</h2>
          </div>

          <div className="space-y-5">
            {[
              {
                title: '场景 1：新顾问快速上手',
                desc: '新加入的实施顾问通过 QA 提问快速获取各阶段规范，无需翻阅大量文档。',
                steps: [
                  { icon: Upload,        title: '上传项目文档', desc: '将历史文档批量上传' },
                  { icon: Zap,           title: '自动入库',     desc: '切片 + 分类 + 向量化' },
                  { icon: MessageSquare, title: '自然语言提问', desc: '用口语化问题检索知识' },
                  { icon: CheckCircle,   title: '获得答案',     desc: '附来源引用，可追溯' },
                ],
              },
              {
                title: '场景 2：AI 辅助项目复盘',
                desc: '项目经理通过 PM 模式快速梳理项目现状，生成结构化的状态报告。',
                steps: [
                  { icon: Folder,        title: '创建项目',     desc: '绑定客户文档到项目' },
                  { icon: Brain,         title: '切换 PM 视角', desc: '开启虚拟 PM 模式' },
                  { icon: MessageSquare, title: '提问项目现状', desc: '如「当前风险有哪些」' },
                  { icon: BarChart2,     title: '获得结构分析', desc: '状态/决策/风险四维' },
                ],
              },
              {
                title: '场景 3：Claude 直接调用知识库',
                desc: '开发者或顾问在 Claude 中配置 MCP，让 AI 实时访问知识库回答问题。',
                steps: [
                  { icon: KeyRound,  title: '生成 MCP Key', desc: '在系统设置中生成' },
                  { icon: Code2,    title: '配置 Claude',  desc: '添加 MCP 服务器配置' },
                  { icon: Search,   title: '自动调用工具', desc: 'Claude 识别并调用 ask_kb' },
                  { icon: Database, title: '实时检索答复', desc: '答案来自最新知识库内容' },
                ],
              },
            ].map(({ title, desc, steps }) => (
              <div key={title} className="card p-6">
                <p className="font-semibold text-ink mb-1">{title}</p>
                <p className="text-xs text-ink-secondary mb-5">{desc}</p>
                <UseCaseFlow steps={steps} />
              </div>
            ))}
          </div>
        </div>

        {/* ── Knowledge quality loop ───────────────────────────────── */}
        <div className="mb-20">
          <div className="text-center mb-8">
            <Tag>知识飞轮</Tag>
            <h2 className="text-2xl font-bold text-ink mt-3 mb-2">持续自我优化的知识体系</h2>
            <p className="text-ink-secondary text-sm max-w-md mx-auto">
              用户反馈、引用热度、挑战结果 → 自动回馈到检索闸门与内容补充队列
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { icon: MessageSquare, color: '#FF8D1A', bg: 'bg-orange-50', title: '用户提问', desc: '真实问题反映知识需求' },
              { icon: ThumbsUp,     color: '#10B981', bg: 'bg-green-50',  title: '答案反馈', desc: '👎 自动进入待补充队列' },
              { icon: Award,        color: '#7C3AED', bg: 'bg-purple-50', title: '定期挑战', desc: '识别覆盖薄弱的 LTC 阶段' },
              { icon: Upload,       color: '#2563EB', bg: 'bg-blue-50',   title: '补充文档', desc: '针对性上传，闭合知识缺口' },
            ].map(({ icon: Icon, color, bg, title, desc }, i, arr) => (
              <div key={title} className="relative">
                <div className={`rounded-xl p-4 text-center ${bg} border border-line`}>
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center mx-auto mb-3 shadow-sm">
                    <Icon size={18} style={{ color }} />
                  </div>
                  <p className="text-sm font-semibold text-ink">{title}</p>
                  <p className="text-[11px] text-ink-secondary mt-1">{desc}</p>
                </div>
                {i < arr.length - 1 && (
                  <div className="hidden sm:flex absolute top-1/2 -right-3 -translate-y-1/2 z-10">
                    <ChevronRight size={16} className="text-ink-muted" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Security & reliability strip ─────────────────────────── */}
        <div className="card p-6 mb-16">
          <p className="text-center text-xs font-semibold text-ink-muted uppercase tracking-widest mb-5">安全与可靠性</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            {[
              { icon: Shield, label: 'JWT 认证', desc: 'HS256，可配置过期时间' },
              { icon: Clock,  label: '接口限流', desc: 'slowapi 防 DDoS' },
              { icon: Database, label: '向量持久化', desc: 'Qdrant 独立向量库' },
              { icon: RefreshCw, label: '自动重试', desc: '最多 5 次，指数退避' },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label}>
                <div className="w-9 h-9 rounded-xl bg-canvas border border-line flex items-center justify-center mx-auto mb-2">
                  <Icon size={15} className="text-ink-secondary" />
                </div>
                <p className="text-xs font-semibold text-ink">{label}</p>
                <p className="text-[11px] text-ink-muted mt-0.5">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── CTA ──────────────────────────────────────────────────── */}
        <div className="rounded-2xl p-8 sm:p-12 text-center mb-8" style={{ background: 'linear-gradient(135deg,#FFF4E6,#FFE8CC)' }}>
          <h2 className="text-2xl font-extrabold text-ink mb-2">开始构建你的知识库</h2>
          <p className="text-ink-secondary text-sm mb-6">上传第一份文档，5 分钟内即可开始问答</p>
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
