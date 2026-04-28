/**
 * InsightDemo — 项目洞察 v2 (agentic) 走查页
 * Route: /demo/insight (no auth required)
 *
 * 风格:以「友发钢管」一个真实项目为主线,逐步走查"你会看到什么、你会拿到什么"。
 * 不讲架构(Planner / Critic 那些),只讲用户视角。
 */
import { Link } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Lightbulb, ClipboardList, ChevronRight,
  Sparkles, CheckCircle2, AlertCircle, Search, Loader2, ShieldAlert, FileText, Bot,
} from 'lucide-react'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'
const BRAND = '#D96400'

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InsightDemo() {
  return (
    <div className="min-h-screen bg-canvas">
      {/* Top nav */}
      <div className="bg-white border-b border-line sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-3">
          <Link to="/demo" className="text-ink-muted hover:text-ink flex items-center gap-1 text-sm">
            <ArrowLeft size={14} /> 返回
          </Link>
          <span className="text-ink-muted text-xs">/</span>
          <span className="text-sm text-ink-secondary">Skill 走查</span>
          <span className="text-ink-muted text-xs">/</span>
          <span className="text-sm font-semibold text-ink">项目洞察 v2</span>
        </div>
      </div>

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 pt-12 pb-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-700">v2 · Beta</span>
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-orange-100 text-[#D96400]">Agentic</span>
        </div>
        <h1 className="text-3xl font-extrabold text-ink tracking-tight">项目洞察 v2 — 一份给高管看的项目诊断报告</h1>
        <p className="mt-3 text-ink-secondary text-base leading-relaxed">
          顾问做对内汇报 / 内部对齐时,需要一份"项目现在怎么样、有什么风险、下一步做什么"的洞察报告。
          v2 跟 v1 最大的不同:<strong className="text-ink">不会编</strong>。信息够,生成完整报告;信息不够,直接告诉你缺什么、不出残缺品。
        </p>

        <div className="mt-8 p-4 bg-orange-50 border-l-4 border-orange-400 rounded-r-lg">
          <div className="text-sm font-semibold text-[#92400E] mb-1">下面我们用「友发钢管集团」这个真实项目走一遍</div>
          <div className="text-xs text-ink-secondary">
            背景:集团化制造业客户,5 家子公司 + 多个事业部,2024-09 启动 CRM,正在 UAT 前期。<br/>
            行业:manufacturing(智能制造)。已经有 6 份相关文档 + 一段访谈记录在系统里。
          </div>
        </div>
      </div>

      {/* Step 1 */}
      <Step n={1} title="点项目阶段栏的「项目洞察 v2 (β)」">
        <p className="text-sm text-ink-secondary mb-3">
          进入友发钢管项目详情,顶部阶段栏现在多了 2 个 Beta 阶段。点第一个橙色那个。
        </p>
        <MockStageBar />
      </Step>

      {/* Step 2 */}
      <Step n={2} title="抽屉自动弹出,大半字段已经替你填好">
        <p className="text-sm text-ink-secondary mb-3">
          系统会扫"项目元数据 + 已上传文档 + 之前的访谈记录",自动预填 v2 需要的字段。你只需要校对 + 补几个缺的。
        </p>
        <MockBriefDrawer />
        <p className="text-xs text-ink-muted mt-3">
          ↑ 上面 4 个字段中,前 2 个有黄色 <strong>已抽取</strong> 标(LLM 从文档里推出来的,可信度
          medium/high),后 2 个空着等你补。点"保存并生成"就触发后台流程。
        </p>
      </Step>

      {/* Step 3 */}
      <Step n={3} title="后台先评估「信息够不够」,缺的去补">
        <p className="text-sm text-ink-secondary mb-3">
          后台不直接喂给 LLM 写报告。先做一遍体检:每个模块要哪些字段,有的标 ✓,缺的去 KB 检索 / 等你补。
          这就是我们说的"agent 不再蒙头写"。
        </p>
        <MockEvidenceAssessment />
      </Step>

      {/* Step 4 */}
      <Step n={4} title="并行生成 10 个模块的内容">
        <p className="text-sm text-ink-secondary mb-3">
          每个模块都有自己的"该写什么、用什么证据、怎么算质量",10 个模块同时跑,大约 60-180 秒能拿到结果。
        </p>
        <MockGenerationProgress />
      </Step>

      {/* Step 5 — sample output */}
      <Step n={5} title="拿到报告(摘录两段)">
        <p className="text-sm text-ink-secondary mb-3">
          下面是友发钢管 v2 报告的真实样式。每段结论都标了 <strong>来源</strong>,不带来源的"洞察"不许出现。
        </p>
        <MockReportSnippet />
      </Step>

      {/* Step 6 — invalid */}
      <Step n={6} title="如果信息不够,你会看到红色 banner(而不是糊弄你的报告)">
        <p className="text-sm text-ink-secondary mb-3">
          换个新建的空项目(没访谈、没文档、没 Brief)跑 v2,系统不会强行编。它会标 invalid,把缺的清单列出来,等你补完再点重新生成。
        </p>
        <MockInvalidBanner />
        <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 leading-relaxed">
          <strong>这是设计,不是 bug。</strong>
          v1 的策略是"宁可写也别空着",结果一堆空话和编造;v2 改成"宁可不写也别糊弄",信息不够的章节就标"信息缺失"。
          <br/>对顾问的实际意义:你拿这份报告对内汇报,不会被同事问"这数据哪里来的、你确定吗"。
        </div>
      </Step>

      {/* CTA */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="rounded-xl p-6 text-white" style={{ background: BRAND_GRAD }}>
          <h3 className="text-lg font-bold mb-1.5">现在去试一下</h3>
          <p className="text-sm opacity-90 mb-4">
            进任意 manufacturing 行业的项目(友发钢管 / 特变新能源 / 唐山天地矿业 / 百迈客生物科技 / 东方雨虹)
            ,点橙色阶段「项目洞察 v2 (β)」体验。
          </p>
          <div className="flex gap-2">
            <Link to="/console/projects" className="px-4 py-2 bg-white text-[#D96400] rounded-lg text-sm font-semibold inline-flex items-center gap-1.5">
              <Sparkles size={13} /> 去项目列表
            </Link>
            <Link to="/demo/survey" className="px-4 py-2 bg-white/20 text-white border border-white/40 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-white/30">
              <ClipboardList size={13} /> 看 Survey v2 走查 →
            </Link>
          </div>
        </div>
      </div>

      {/* For engineers — 折叠 */}
      <div className="max-w-4xl mx-auto px-6 pb-16">
        <details className="group bg-white rounded-lg border border-line">
          <summary className="cursor-pointer px-4 py-3 text-sm text-ink-secondary hover:text-ink flex items-center gap-2">
            <Bot size={14} />
            <span>给工程师看的实现细节</span>
            <ChevronRight size={14} className="ml-auto group-open:rotate-90 transition-transform" />
          </summary>
          <div className="px-4 pb-4 text-xs text-ink-secondary space-y-2 leading-relaxed">
            <p>10 个模块声明在 <code className="bg-slate-100 px-1.5 rounded">backend/services/agentic/insight_modules.py</code>(必要 6 个 / 可选 4 个)。</p>
            <p>流程编排在 <code className="bg-slate-100 px-1.5 rounded">runner.py</code>:Planner(规则化)→ Gap Fill(并行 KB 检索)→ Executor(并行 LLM 模块填充)→ Critic(Sopact 四要素评分:Specificity / Evidence / Timeliness / Next Step)。</p>
            <p>智能制造扩展在 <code className="bg-slate-100 px-1.5 rounded">industry_packs/smart_manufacturing.py</code>:13 字段补丁 + 10 痛点 + 3 标杆案例(友发 / 特变 / 唐山天地)+ 12 行业种子题。</p>
            <p>结果落到 <code className="bg-slate-100 px-1.5 rounded">bundle.extra.{`{validity_status, module_states, ask_user_prompts, run_history}`}</code>。无 alembic migration。</p>
          </div>
        </details>
      </div>
    </div>
  )
}

// ── 小组件:页面骨架 ───────────────────────────────────────────────────────────

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="max-w-4xl mx-auto px-6 py-8 border-t border-line">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-full text-white flex items-center justify-center text-sm font-bold shrink-0"
             style={{ background: BRAND_GRAD }}>
          {n}
        </div>
        <h2 className="text-lg font-bold text-ink">{title}</h2>
      </div>
      <div className="ml-11">{children}</div>
    </section>
  )
}

// ── Mock UI:阶段栏 ───────────────────────────────────────────────────────────

function MockStageBar() {
  const stages = [
    { label: '项目洞察', state: 'done', color: '#D1FAE5' },
    { label: '启动会·PPT', state: 'idle', color: '#F8FAFC' },
    { label: '启动会·HTML', state: 'idle', color: '#F8FAFC' },
    { label: '需求调研', state: 'done', color: '#D1FAE5' },
    { label: '项目洞察 v2 (β)', state: 'active', color: BRAND_GRAD },
    { label: '需求调研 v2 (β)', state: 'idle', color: '#F8FAFC' },
  ]
  return (
    <div className="bg-white border border-line rounded-lg p-3">
      <div className="text-[11px] text-ink-muted mb-2">↓ 项目详情页顶部</div>
      <div className="flex gap-[2px] overflow-x-auto">
        {stages.map((s, i) => {
          const isActive = s.state === 'active'
          const isDone = s.state === 'done'
          return (
            <div key={i}
                 className={`px-3 py-1.5 text-[11px] whitespace-nowrap rounded ${isActive ? 'font-semibold text-white shadow' : isDone ? 'text-emerald-700' : 'text-ink-muted'}`}
                 style={{ background: isActive ? s.color : isDone ? s.color : s.color, border: isActive ? 'none' : '1px solid #E5E7EB' }}>
              {isDone && <CheckCircle2 size={10} className="inline mr-1" />}
              {s.label}
              {isActive && <span className="ml-1.5 text-[10px] opacity-90">← 点这里</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Mock UI:Brief 抽屉 ──────────────────────────────────────────────────────

function MockBriefDrawer() {
  const fields = [
    { label: '项目态势(Situation)', value: '集团化多法人 CRM 实施,2024-09 启动,目前 UAT 前期,5 家子公司差异大,推广压力大', filled: true, conf: 'high' },
    { label: '项目难点(Complication)', value: '集团 vs 子公司方案差异 + 销售推广阻力 + 数据迁移工作量大', filled: true, conf: 'medium' },
    { label: '最大机会', value: '', filled: false, conf: null },
    { label: '关键决策人', value: ['钟鼐(集团信息中心)', '徐广友(集团 PMO)'], filled: true, conf: 'high', isList: true },
    { label: '当前阶段', value: 'UAT 前期', filled: true, conf: 'high' },
    { label: '预算区间', value: '', filled: false, conf: null },
  ]
  return (
    <div className="bg-white border border-line rounded-lg overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 border-b border-line bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <FileText size={13} /> Brief · 项目洞察 v2 · 友发钢管集团
        </div>
        <span className="text-[11px] text-ink-muted">15 字段中 4 个待补</span>
      </div>
      <div className="p-4 space-y-3 text-xs">
        {fields.map((f, i) => (
          <div key={i} className="flex gap-3">
            <div className="w-32 shrink-0 text-ink-muted">{f.label}</div>
            <div className="flex-1 min-w-0">
              {f.filled ? (
                <>
                  <div className="text-ink">
                    {f.isList ? (
                      <ul className="list-disc list-inside">{(f.value as string[]).map((v, j) => <li key={j}>{v}</li>)}</ul>
                    ) : f.value}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${f.conf === 'high' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      已抽取 · {f.conf}
                    </span>
                    <span className="text-[10px] text-ink-muted">来自访谈记录 + 项目元数据</span>
                  </div>
                </>
              ) : (
                <div className="text-ink-muted italic">— 待你补充 —</div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="px-4 py-2.5 border-t border-line bg-slate-50 flex justify-end gap-2">
        <button className="px-3 py-1.5 text-[11px] text-ink-secondary border border-line rounded">取消</button>
        <button className="px-3 py-1.5 text-[11px] text-white font-semibold rounded" style={{ background: BRAND_GRAD }}>保存并生成 →</button>
      </div>
    </div>
  )
}

// ── Mock UI:Planner 评估 ────────────────────────────────────────────────────

function MockEvidenceAssessment() {
  const modules = [
    { key: 'M1', title: '执行摘要',         status: 'ready',     detail: '5 字段全有(4 个 Brief + 1 个等 M3 算出来)' },
    { key: 'M2', title: '项目快照',         status: 'ready',     detail: '5 字段全有(用户数 / 模块 / 时间窗 / 阶段都齐)' },
    { key: 'M3', title: '健康度雷达',       status: 'partial',   detail: '6 维:进度 / 范围 / 质量 缺数据,排了 KB 检索补' },
    { key: 'M4', title: '干系人画像',       status: 'ready',     detail: '决策人 / 推进人 / 决策链 都从访谈拿到了' },
    { key: 'M5', title: '行业上下文',       status: 'ready',     detail: '智能制造行业包已激活(Install Base / BOM / 渠道 / ERP)' },
    { key: 'M6', title: '关键发现',         status: 'ready',     detail: '访谈 + KB 提供候选发现池' },
    { key: 'M7', title: 'RAID 表',          status: 'ready',     detail: '5 条风险已经在 Brief.risks_top 里' },
    { key: 'M8', title: '依赖与里程碑',     status: 'partial',   detail: '里程碑有,依赖关系待 KB 补' },
    { key: 'M9', title: '行业最佳实践',     status: 'searching', detail: '正在 KB 检索同行业案例(唐山天地 / 特变)' },
    { key: 'M10', title: '下一步建议',      status: 'ready',     detail: 'Quick Win / 本月 / 季度三档' },
  ]
  const dot = (s: string) =>
    s === 'ready' ? <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block shrink-0" /> :
    s === 'partial' ? <span className="w-2 h-2 rounded-full bg-amber-400 inline-block shrink-0" /> :
    <Loader2 size={10} className="text-blue-500 animate-spin shrink-0" />
  const label = (s: string) => s === 'ready' ? '信息够' : s === 'partial' ? '部分缺' : 'KB 检索中'
  const labelColor = (s: string) => s === 'ready' ? 'text-emerald-700' : s === 'partial' ? 'text-amber-700' : 'text-blue-700'

  return (
    <div className="bg-white border border-line rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-line bg-slate-50 flex items-center gap-2">
        <Search size={12} className="text-ink-muted" />
        <span className="text-sm font-semibold text-ink">体检报告</span>
        <span className="ml-auto text-[11px] text-ink-muted">10 个模块 · 8 个就绪 · 2 个 KB 检索补充</span>
      </div>
      <div className="divide-y divide-line text-xs">
        {modules.map(m => (
          <div key={m.key} className="px-4 py-2 flex items-center gap-3">
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-ink-muted shrink-0 tabular-nums">{m.key}</span>
            <span className="font-medium text-ink shrink-0 w-24">{m.title}</span>
            <span className={`flex items-center gap-1 text-[11px] font-medium shrink-0 w-20 ${labelColor(m.status)}`}>
              {dot(m.status)} {label(m.status)}
            </span>
            <span className="text-ink-muted text-[11px] truncate">{m.detail}</span>
          </div>
        ))}
      </div>
      <div className="px-4 py-2 bg-blue-50 border-t border-line text-[11px] text-blue-900">
        <strong>要紧的事:</strong>关键模块 6 个全部 ready,可以正式开跑。M9 等下检索完会注入。
      </div>
    </div>
  )
}

// ── Mock UI:并行生成进度 ────────────────────────────────────────────────────

function MockGenerationProgress() {
  const items = [
    { name: 'M1 执行摘要',         pct: 100, color: 'bg-emerald-500' },
    { name: 'M2 项目快照',         pct: 100, color: 'bg-emerald-500' },
    { name: 'M3 健康度雷达',       pct: 80,  color: 'bg-blue-500' },
    { name: 'M4 干系人画像',       pct: 100, color: 'bg-emerald-500' },
    { name: 'M5 行业上下文',       pct: 70,  color: 'bg-blue-500' },
    { name: 'M6 关键发现',         pct: 60,  color: 'bg-blue-500' },
    { name: 'M7 RAID 表',          pct: 100, color: 'bg-emerald-500' },
    { name: 'M8 依赖与里程碑',     pct: 90,  color: 'bg-blue-500' },
    { name: 'M9 行业最佳实践',     pct: 50,  color: 'bg-blue-500' },
    { name: 'M10 下一步建议',      pct: 100, color: 'bg-emerald-500' },
  ]
  return (
    <div className="bg-white border border-line rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Loader2 size={13} className="text-blue-500 animate-spin" />
        <span className="text-sm font-medium text-ink">10 个模块并行生成中…</span>
        <span className="ml-auto text-[11px] text-ink-muted">大约还要 40 秒</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        {items.map(it => (
          <div key={it.name} className="flex items-center gap-2">
            <span className="w-32 shrink-0 text-ink-muted truncate">{it.name}</span>
            <div className="flex-1 h-1.5 bg-slate-100 rounded overflow-hidden">
              <div className={`h-full ${it.color} transition-all`} style={{ width: `${it.pct}%` }} />
            </div>
            <span className="w-8 shrink-0 text-right tabular-nums text-ink-muted">{it.pct}%</span>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-line text-[11px] text-ink-muted">
        每个模块完成后还会跑一遍质量评分,不达标的会标"需补充",不影响其他模块。
      </div>
    </div>
  )
}

// ── Mock UI:报告样本 ────────────────────────────────────────────────────────

function MockReportSnippet() {
  return (
    <div className="space-y-4">
      {/* 模块 M1 */}
      <div className="bg-white border border-line rounded-lg p-5">
        <div className="text-[11px] text-ink-muted mb-2">M1 · 执行摘要</div>
        <div className="text-sm text-ink leading-relaxed space-y-2">
          <p><strong className="text-red-700">总体健康度:黄</strong>。集团化 CRM 实施已进入 UAT 前期,
            <strong>方案设计阶段已完成,最大风险转移到推广阶段</strong>。</p>
          <ul className="list-disc list-inside space-y-1 text-ink-secondary">
            <li>5 家子公司业务差异大,统一方案 + 差异化配置策略已经确认 <span className="text-[10px] text-ink-muted">[访谈]</span></li>
            <li>奖惩制度刚性(配套 25 万实施奖金 + 奖一罚二),推广采纳率是头号变量 <span className="text-[10px] text-ink-muted">[访谈]</span></li>
            <li>历史数据迁移工作量评估不足,可能影响上线节奏 <span className="text-[10px] text-ink-muted">[KB · 启动会纪要]</span></li>
          </ul>
        </div>
      </div>

      {/* 模块 M7 */}
      <div className="bg-white border border-line rounded-lg p-5">
        <div className="text-[11px] text-ink-muted mb-2">M7 · 风险与议题(RAID)摘录</div>
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-2 font-semibold">风险</th>
              <th className="text-left p-2 font-semibold w-16">影响</th>
              <th className="text-left p-2 font-semibold w-16">可能性</th>
              <th className="text-left p-2 font-semibold">应对</th>
              <th className="text-left p-2 font-semibold w-20">Owner</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            <tr>
              <td className="p-2">范围蔓延:子公司提新需求,镀金风险</td>
              <td className="p-2"><span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-100 text-red-700">高</span></td>
              <td className="p-2"><span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-100 text-amber-700">中</span></td>
              <td className="p-2 text-ink-secondary">变更走 PMO 评审,纳入二期 backlog</td>
              <td className="p-2 text-ink-muted">徐广友 / 钟鼐</td>
            </tr>
            <tr>
              <td className="p-2">推广阻力:一线销售抵触新系统</td>
              <td className="p-2"><span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-100 text-red-700">高</span></td>
              <td className="p-2"><span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-100 text-red-700">高</span></td>
              <td className="p-2 text-ink-secondary">实施顾问驻场 2 周 + 商机更新及时率纳入考核</td>
              <td className="p-2 text-ink-muted">交付 PM</td>
            </tr>
            <tr>
              <td className="p-2">数据迁移:历史数据口径不清</td>
              <td className="p-2"><span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-100 text-amber-700">中</span></td>
              <td className="p-2"><span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-100 text-red-700">高</span></td>
              <td className="p-2 text-ink-secondary">本周对齐迁移责任人 + 标准 + 时间表</td>
              <td className="p-2 text-ink-muted">客户 IT</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 模块 M10 */}
      <div className="bg-white border border-line rounded-lg p-5">
        <div className="text-[11px] text-ink-muted mb-2">M10 · 下一步建议(Quick Win)</div>
        <ul className="text-sm text-ink space-y-2">
          <li className="flex gap-2">
            <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">本周对齐数据迁移责任人 + 标准 + 时间表</div>
              <div className="text-[11px] text-ink-muted">Owner:客户 IT · Deadline:2026-05-02 · 预期产出:迁移启动会纪要 + 责任人清单</div>
            </div>
          </li>
          <li className="flex gap-2">
            <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">UAT 前对齐 5 家子公司差异化配置点</div>
              <div className="text-[11px] text-ink-muted">Owner:实施顾问 · Deadline:2026-05-09 · 预期产出:差异点清单 + 子公司确认书</div>
            </div>
          </li>
          <li className="flex gap-2">
            <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">启动「商机更新及时率」纳入销售月度考核</div>
              <div className="text-[11px] text-ink-muted">Owner:集团信息中心 · Deadline:2026-05-15 · 预期产出:考核办法初稿</div>
            </div>
          </li>
        </ul>
      </div>
    </div>
  )
}

// ── Mock UI:invalid banner ──────────────────────────────────────────────────

function MockInvalidBanner() {
  return (
    <div className="bg-red-50 border-l-4 border-red-400 rounded-r-lg p-4">
      <div className="flex items-start gap-2">
        <ShieldAlert size={16} className="text-red-700 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-red-700">信息不足 · invalid — 本份产物缺少关键信息,建议补充后重新生成</div>
          <div className="mt-1.5 text-[11px] text-ink-secondary">
            <strong>未完成关键模块:</strong>执行摘要 / 项目快照 / 健康度雷达 / 干系人画像 / 关键发现 / RAID
          </div>
          <details className="mt-2" open>
            <summary className="text-[11px] cursor-pointer text-red-700 font-medium">需要补充的信息(8 项)</summary>
            <ul className="mt-1.5 space-y-0.5 text-[11px] text-ink-secondary list-disc list-inside">
              <li>一句话概括项目当前态势:规模 / 阶段 / 紧迫度?</li>
              <li>项目最大的难点 / 卡点是什么?</li>
              <li>项目最高拍板人是谁?决策走几层?</li>
              <li>目标用户数(全员 / 销售 / 渠道分别多少)?</li>
              <li>项目启动 → 上线 → 验收的关键日期?</li>
              <li>目前在哪个阶段(需求 / 方案 / 配置 / UAT / 上线)?</li>
              <li>目前最担心的 3-5 个风险是什么?</li>
              <li>… (3 项已折叠)</li>
            </ul>
          </details>
        </div>
        <button className="shrink-0 flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md border border-red-300 text-red-700 bg-white">
          <Sparkles size={10} /> 补充信息后重新生成
        </button>
      </div>
    </div>
  )
}
