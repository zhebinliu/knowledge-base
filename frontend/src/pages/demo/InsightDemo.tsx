/**
 * InsightDemo — 项目洞察 v2 (agentic) 讲解页
 * Route: /demo/insight (no auth required)
 *
 * 用途: 讲解 v2 的设计原理给团队 / 客户看。
 * 风格参考 /demo,但内容聚焦 agentic skill 的"三层流程 + 信息地图"。
 */
import { Link } from 'react-router-dom'
import {
  Lightbulb, ArrowLeft, Bot, Layers, Target, Search,
  CheckCircle2, AlertTriangle, ChevronRight, Sparkles, ClipboardList,
} from 'lucide-react'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

// ── 数据 ───────────────────────────────────────────────────────────────────────

const MODULES = [
  { key: 'M1', title: '执行摘要',           critical: true,  hint: 'SCQA 开篇 + 总 RAG + 1 大机会 + 1 大风险' },
  { key: 'M2', title: '项目快照',           critical: true,  hint: '量化:用户数 / 模块 / 预算 / 时间窗 / 阶段' },
  { key: 'M3', title: '健康度雷达',         critical: true,  hint: '6 维 RAG:进度 / 范围 / 预算 / 质量 / 人员 / 风险' },
  { key: 'M4', title: '干系人画像',         critical: true,  hint: '决策链 + 各角色态度(积极/观望/阻力)' },
  { key: 'M5', title: '行业上下文',         critical: false, hint: '智能制造专属:Install Base / BOM / 经销商 / ERP' },
  { key: 'M6', title: '关键发现',           critical: true,  hint: '5-8 条,严格满足 Sopact 四要素' },
  { key: 'M7', title: '风险与议题(RAID)',   critical: true,  hint: 'Risks / Actions / Issues / Decisions 四张表' },
  { key: 'M8', title: '依赖与里程碑',       critical: false, hint: '阻塞项标红 + 依赖链可视化' },
  { key: 'M9', title: '行业最佳实践对照',   critical: false, hint: '同行业经验:可借鉴 + 应规避' },
  { key: 'M10', title: '下一步建议',        critical: true,  hint: 'Quick Win / 本月 / 季度,Owner+deadline' },
]

const PHASES = [
  {
    icon: Layers, color: '#FF8D1A',
    title: 'Phase 1 · Planner', subtitle: '识别能拿到什么、缺什么',
    desc: '读取 Project + Brief + 访谈记录,按 source priority(brief / metadata / industry_pack / conversation / kb_search)解析每个字段的状态。产出 ExecutionPlan: 哪些模块 ready,哪些 blocked,哪些字段需要 KB 检索 / 询问用户。',
  },
  {
    icon: Search, color: '#3B82F6',
    title: 'Phase 2 · Gap Fill', subtitle: '主动补信息',
    desc: 'Planner 标记的 KB 检索 gap 在这一阶段并行执行,把检索结果绑定到对应模块的字段池。需要询问用户的字段则记入 ask_user_prompts(展示在前端 banner)。',
  },
  {
    icon: Bot, color: '#8B5CF6',
    title: 'Phase 3 · Executor', subtitle: '并行填模块',
    desc: '每个 ready 模块一个 LLM subagent,只看自己的字段评估 + 项目元数据 + 相关证据。所有模块并行,总耗时 ≈ 单模块时间 × 1.5。',
  },
  {
    icon: CheckCircle2, color: '#10B981',
    title: 'Phase 4 · Critic', subtitle: 'Sopact 四要素打分',
    desc: 'Specificity / Evidence / Timeliness / Next Step 四维评分。任一维度不达标 → needs_rework;模块残缺 → insufficient。Critic 一次评所有模块,节省 token。',
  },
]

const RUBRIC = [
  { dim: 'Specificity',  threshold: '≥3', desc: '主语/对象/条件明确(不是"系统不稳定"而是"陕西分公司 12/15 出现 2 次商机审批超时")' },
  { dim: 'Evidence',     threshold: '≥3', desc: '数据点带 [访谈]/[KB]/[Brief]/[Web]/[推断] 标注,编造一律 0 分' },
  { dim: 'Timeliness',   threshold: '≥2', desc: '结论现在还能影响项目结果(避免事后诸葛亮)' },
  { dim: 'Next Step',    threshold: '≥3', desc: '每条结论配 Owner + deadline(不是"加强沟通")' },
]

// M3 health_radar 的信息地图(作为示例展示)
const FIELD_MAP_EXAMPLE = [
  { field: 'progress.actual_vs_plan', sources: 'Brief.phase_plan / 访谈 / KB(项目周报)', gap: 'kb_search("项目进度 周报 里程碑")' },
  { field: 'scope.changes_count',     sources: '访谈 / KB(变更控制单)',                  gap: 'kb_search("变更控制 范围变化")' },
  { field: 'budget.burn_rate',        sources: '访谈 / Brief.budget_range',               gap: 'ask_user("预算消耗比例?")' },
  { field: 'quality.defects_open',    sources: 'KB(测试报告/缺陷库) / 访谈',              gap: 'kb_search("UAT 缺陷 测试报告")' },
  { field: 'team.churn',              sources: '访谈',                                   gap: 'ask_user("团队稳定性 / 关键人离场?")' },
  { field: 'risk.top3',               sources: 'Brief.key_risks / 访谈',                  gap: '降级(可选模块直接放弃)' },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InsightDemo() {
  return (
    <div className="min-h-screen bg-canvas">
      {/* Top nav */}
      <div className="bg-white border-b border-line">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-3">
          <Link to="/demo" className="text-ink-muted hover:text-ink flex items-center gap-1 text-sm">
            <ArrowLeft size={14} /> 返回
          </Link>
          <span className="text-ink-muted text-xs">/</span>
          <span className="text-sm text-ink-secondary">Skill 讲解</span>
          <span className="text-ink-muted text-xs">/</span>
          <span className="text-sm font-semibold text-ink">项目洞察 v2 (agentic)</span>
        </div>
      </div>

      {/* Hero */}
      <div className="max-w-5xl mx-auto px-6 pt-10 pb-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-700">
            <Bot size={11} className="inline mr-1" /> Agentic Skill
          </span>
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-orange-100 text-[#D96400]">
            v2 · 旁路验证
          </span>
        </div>
        <h1 className="text-3xl font-extrabold text-ink tracking-tight">项目洞察 (Insight) v2</h1>
        <p className="mt-3 text-ink-secondary text-base leading-relaxed">
          为 CRM 实施顾问设计的「项目诊断与洞察」AI 产物。区别于 v1 的"一次性 LLM + 章节硬编码",v2 用
          <strong className="text-ink"> 模块化 + 三层 agentic 流程(Plan → Execute → Critic)</strong>,
          针对智能制造 / 纷享销客场景做差异化,信息不足时拒绝输出残缺品。
        </p>

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat value="10" label="独立模块" />
          <Stat value="6" label="critical 模块" />
          <Stat value="4" label="Sopact 评分维度" />
          <Stat value="< 90s" label="并行总耗时" />
        </div>
      </div>

      {/* Section: 为什么 */}
      <Section title="为什么重写?" icon={Lightbulb}>
        <ul className="space-y-2 text-sm text-ink-secondary">
          <li className="flex gap-2">
            <ChevronRight size={14} className="mt-0.5 shrink-0 text-ink-muted" />
            <span>v1 把所有素材一锅炖喂给 LLM,缺什么、要补什么 <strong>完全不可见</strong>;</span>
          </li>
          <li className="flex gap-2">
            <ChevronRight size={14} className="mt-0.5 shrink-0 text-ink-muted" />
            <span>章节硬编码 8 个,信息够不够 <strong>都强行写完</strong>,容易出现编造或空话;</span>
          </li>
          <li className="flex gap-2">
            <ChevronRight size={14} className="mt-0.5 shrink-0 text-ink-muted" />
            <span>未对智能制造场景做差异化,经销商 / BOM / Install Base / ERP 集成等关键字段缺位。</span>
          </li>
        </ul>
        <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-[#92400E]">
          <strong>核心命题:</strong>让 agent 有"连续思考"能力 — 根据已有信息判断下一步,直到拿够;
          <strong>信息不足无法输出 → 视为无效文档</strong>(产品契约,不是 bug)。
        </div>
      </Section>

      {/* Section: 三层流程 */}
      <Section title="三层 agentic 流程" icon={Bot}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PHASES.map(p => (
            <div key={p.title} className="p-4 bg-white rounded-lg border border-line">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: `${p.color}20` }}>
                  <p.icon size={14} style={{ color: p.color }} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-ink">{p.title}</div>
                  <div className="text-[11px] text-ink-muted">{p.subtitle}</div>
                </div>
              </div>
              <p className="text-xs text-ink-secondary leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Section: 模块清单 */}
      <Section title="10 个独立模块" icon={Layers}>
        <p className="text-xs text-ink-muted mb-3">
          每个模块可独立判断"信息是否充分"。<strong className="text-red-700">关键模块</strong>失败 → 整份文档判 invalid;
          <span className="text-ink-secondary">可选模块</span>失败 → 标"信息不足",不阻塞文档。
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {MODULES.map(m => (
            <div key={m.key} className="flex items-start gap-2 p-2.5 bg-white rounded border border-line">
              <span className={`shrink-0 px-1.5 py-0.5 text-[10px] font-bold rounded tabular-nums ${
                m.critical ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-ink-muted'
              }`}>{m.key}</span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink">{m.title}
                  {m.critical && <span className="ml-1.5 text-[9px] uppercase tracking-wide text-red-600 font-semibold">critical</span>}
                </div>
                <div className="text-[11px] text-ink-muted mt-0.5">{m.hint}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Section: 信息地图示例 */}
      <Section title="信息地图(M3 健康度雷达 示例)" icon={Target}>
        <p className="text-xs text-ink-muted mb-3">
          每个字段声明 <strong>来源优先级</strong> 和 <strong>缺失时的获取动作</strong>。Planner 按规则评估,缺信息触发对应 action。
        </p>
        <div className="overflow-x-auto bg-white rounded-lg border border-line">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-2 font-semibold text-ink-secondary">字段</th>
                <th className="text-left p-2 font-semibold text-ink-secondary">来源优先级</th>
                <th className="text-left p-2 font-semibold text-ink-secondary">缺时获取动作</th>
              </tr>
            </thead>
            <tbody>
              {FIELD_MAP_EXAMPLE.map(r => (
                <tr key={r.field} className="border-t border-line">
                  <td className="p-2 font-mono text-[11px] text-ink">{r.field}</td>
                  <td className="p-2 text-ink-secondary">{r.sources}</td>
                  <td className="p-2 text-ink-secondary"><code className="text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">{r.gap}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Section: Critic rubric */}
      <Section title="Critic 评分:Sopact 四要素" icon={CheckCircle2}>
        <p className="text-xs text-ink-muted mb-3">
          每个模块产出后,Critic LLM 跑这套 rubric 打分 0-4。任一维度低于阈值 → needs_rework;
          模块残缺(&lt;200 字 / 全占位符) → insufficient。
        </p>
        <div className="space-y-2">
          {RUBRIC.map(r => (
            <div key={r.dim} className="p-3 bg-white rounded-lg border border-line flex gap-3">
              <div className="shrink-0 w-24">
                <div className="text-sm font-semibold text-ink">{r.dim}</div>
                <div className="text-[11px] text-emerald-700 font-mono">阈值 {r.threshold}</div>
              </div>
              <div className="text-xs text-ink-secondary leading-relaxed">{r.desc}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Section: invalid 契约 */}
      <Section title="「无效文档」产品契约" icon={AlertTriangle}>
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-sm text-red-700">
            <strong>规则:</strong>任一 critical 模块状态 ∈ {"{blocked, insufficient}"} → 整份 bundle 标记
            <code className="mx-1 px-1.5 py-0.5 bg-white rounded text-[11px]">validity_status = invalid</code>
            ,前端 banner 展示具体缺什么,引导顾问补充访谈 / Brief 后重新生成。
          </div>
          <div className="mt-3 text-xs text-ink-secondary leading-relaxed">
            这是 <strong>设计而非 bug</strong>。残缺的洞察报告不仅没价值,还会误导决策。
            v1 的"宁可多写也别空着" → v2 的"宁可不写也别编造"。
          </div>
        </div>
      </Section>

      {/* CTA */}
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="rounded-xl p-6 text-white" style={{ background: BRAND_GRAD }}>
          <h3 className="text-lg font-bold mb-1.5">在项目中体验 v2</h3>
          <p className="text-sm opacity-90 mb-4">
            进入任意项目详情,在阶段栏切换到「项目洞察 v2 (β)」,完成 Brief 后点生成。结果会与 v1 并存,可对比。
          </p>
          <div className="flex gap-2">
            <Link to="/console/projects" className="px-4 py-2 bg-white text-[#D96400] rounded-lg text-sm font-semibold inline-flex items-center gap-1.5">
              <Sparkles size={13} /> 去项目列表
            </Link>
            <Link to="/demo/survey" className="px-4 py-2 bg-white/20 text-white border border-white/40 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-white/30">
              <ClipboardList size={13} /> 看 Survey v2 讲解
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 小组件 ────────────────────────────────────────────────────────────────────

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="p-3 bg-white rounded-lg border border-line text-center">
      <div className="text-2xl font-extrabold text-ink tracking-tight">{value}</div>
      <div className="text-[11px] text-ink-muted mt-0.5">{label}</div>
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Lightbulb; children: React.ReactNode }) {
  return (
    <section className="max-w-5xl mx-auto px-6 py-6 border-t border-line">
      <h2 className="text-lg font-bold text-ink flex items-center gap-2 mb-4">
        <Icon size={16} className="text-[#D96400]" />
        {title}
      </h2>
      {children}
    </section>
  )
}
