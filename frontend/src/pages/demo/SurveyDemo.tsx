/**
 * SurveyDemo — 调研问卷 v2 (agentic) 讲解页
 * Route: /demo/survey (no auth required)
 */
import { Link } from 'react-router-dom'
import {
  ClipboardList, ArrowLeft, Bot, Layers, Target, MessageSquare,
  CheckCircle2, ChevronRight, Sparkles, Lightbulb, Users, Settings,
} from 'lucide-react'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

const L1_TOPICS = [
  '战略意图(为什么上 CRM)',
  '成功标准(3 个 SMART 指标)',
  'Top 3 痛点',
  '干系人 / 决策链',
  '时间预期(上线节点 + 是否刚性)',
  '预算区间',
  '已有系统生态(ERP / OA / MES / 其他 CRM)',
]

const THEMES = [
  { key: 'strategy',         title: '战略与目标',     subs: 1, role: '业务负责人' },
  { key: 'org_role',         title: '组织与角色',     subs: 2, role: '业务 + IT' },
  { key: 'biz_process',      title: '业务流程',       subs: 4, role: '业务 + 一线 + 财务 + 售后' },
  { key: 'data_governance',  title: '数据治理',       subs: 1, role: 'IT + 业务' },
  { key: 'integration',      title: '集成生态',       subs: 2, role: 'IT + 财务' },
  { key: 'compliance',       title: '合规与安全',     subs: 1, role: 'IT + 业务' },
  { key: 'resource_change',  title: '资源与变革',     subs: 2, role: '业务 + IT' },
]

const QUESTION_TYPES = [
  { type: '事实型 (fact)',     example: '"现有 ERP 是哪家(金蝶/用友/SAP)?"',                       why: '一定有标准答案;低认知负担' },
  { type: '判断型 (judgment)', example: '"事业部之间的客户数据是否需要共享或隔离?"',                  why: '需主观评估;要决策导向' },
  { type: '数据型 (data)',     example: '"标品 vs 定制品占比?平均回款周期(天)?"',                  why: '需从系统/财务报表导出;后续做对照基线' },
  { type: '开放题 (open)',     example: '"目前商机推进过程中最大的卡点是什么?"',                    why: '挖掘痛点;每分卷 ≤ 4-5 题(避免疲劳)' },
]

const MFG_EXTRA = [
  { theme: '业务流程',  q: '项目报备机制(谁报、查重、报备奖励)是怎样的?' },
  { theme: '业务流程',  q: '试样 / 试机 的标准化程度?平均试机周期多久?' },
  { theme: '数据治理',  q: '标品 vs 定制品占比?定制品 BOM 嵌套层数?' },
  { theme: '集成生态',  q: 'ERP 厂商 + 版本(金蝶 EAS / 用友 NC / SAP S4HANA)?' },
  { theme: '集成生态',  q: 'MES / PLM 是否使用?是否需要 CRM 对接?' },
  { theme: '业务流程',  q: 'Install Base 在哪记录?是否有序列号体系?' },
  { theme: '业务流程',  q: '经销商数量?是否分级?是否有数据上报和奖惩挂钩?' },
]

const RUBRIC = [
  { dim: 'type_diversity',  threshold: '≥3', desc: '题型混合度(事实 + 判断 + 数据 + 开放),不能全是开放题' },
  { dim: 'no_jargon',       threshold: '≥3', desc: '禁止"赋能 / 抓手 / 闭环 / 链路 / 生态 / 数字化转型"等黑话' },
  { dim: 'actionable',      threshold: '≥3', desc: '题目颗粒度具体(不是"贵司销售流程如何?")' },
  { dim: 'no_duplicate',    threshold: '≥3', desc: '与已访谈话题不重复(Planner 用关键词匹配判定)' },
]

export default function SurveyDemo() {
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
          <span className="text-sm font-semibold text-ink">调研问卷 v2 (agentic)</span>
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
        <h1 className="text-3xl font-extrabold text-ink tracking-tight">调研问卷 (Survey) v2</h1>
        <p className="mt-3 text-ink-secondary text-base leading-relaxed">
          为实施顾问 / 客户业务团队设计的「实施前需求调研」AI 产物。区别于 v1 的"60 题一锅炖",v2 用
          <strong className="text-ink"> 双层结构(L1 高管短卷 + L2 模块化分卷)</strong>,
          每分卷 5-10 分钟可填,角色对应清晰,自动复用访谈成果做去重。
        </p>

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat value="2" label="问卷层级 (L1+L2)" />
          <Stat value="7" label="L2 主题" />
          <Stat value="13" label="可生成分卷" />
          <Stat value="≤10 min" label="单分卷填答" />
        </div>
      </div>

      {/* Section: 为什么 */}
      <Section title="为什么重写?" icon={Lightbulb}>
        <ul className="space-y-2 text-sm text-ink-secondary">
          <li className="flex gap-2">
            <ChevronRight size={14} className="mt-0.5 shrink-0 text-ink-muted" />
            <span>v1 一次 LLM 调用生成 60+ 题,客户拿到一份 <strong>"超级长卷"</strong>,各部门相互踢皮球,谁也不愿填;</span>
          </li>
          <li className="flex gap-2">
            <ChevronRight size={14} className="mt-0.5 shrink-0 text-ink-muted" />
            <span>没有 Brief 草稿,无法按客户业态做 <strong>差异化</strong>(集团 vs 单法人 / 工程 vs 制造);</span>
          </li>
          <li className="flex gap-2">
            <ChevronRight size={14} className="mt-0.5 shrink-0 text-ink-muted" />
            <span>访谈中已经聊过的话题,问卷里 <strong>还会再问一遍</strong>,客户体验差。</span>
          </li>
        </ul>
      </Section>

      {/* Section: 双层结构 */}
      <Section title="双层结构 — L1 + L2" icon={Layers}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-4 bg-white rounded-lg border-2 border-orange-200">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-md flex items-center justify-center bg-orange-100">
                <Target size={14} className="text-[#D96400]" />
              </div>
              <div>
                <div className="text-sm font-semibold text-ink">Layer 1 · 高管短卷</div>
                <div className="text-[11px] text-ink-muted">8-12 题 · ≤10 分钟 · CEO/COO/CIO/销售 VP</div>
              </div>
            </div>
            <div className="text-xs text-ink-muted mb-2">必须覆盖 7 个骨干主题:</div>
            <ul className="space-y-1.5 text-xs text-ink-secondary">
              {L1_TOPICS.map(t => (
                <li key={t} className="flex gap-2"><CheckCircle2 size={11} className="text-emerald-600 mt-0.5 shrink-0" />{t}</li>
              ))}
            </ul>
          </div>

          <div className="p-4 bg-white rounded-lg border-2 border-blue-200">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-md flex items-center justify-center bg-blue-100">
                <Layers size={14} className="text-blue-700" />
              </div>
              <div>
                <div className="text-sm font-semibold text-ink">Layer 2 · 模块化分卷</div>
                <div className="text-[11px] text-ink-muted">每分卷 8-15 题 · 5-10 分钟 · 业务 / IT / 财务 / 一线</div>
              </div>
            </div>
            <div className="text-xs text-ink-muted mb-2">7 主题 × 多个分卷:</div>
            <div className="space-y-1.5">
              {THEMES.map(t => (
                <div key={t.key} className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-ink min-w-[80px]">{t.title}</span>
                  <span className="text-ink-muted">{t.subs} 个分卷</span>
                  <span className="text-ink-muted">·</span>
                  <span className="text-ink-secondary">{t.role}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* Section: 题型策略 */}
      <Section title="题型策略 — 4 种类型混搭" icon={MessageSquare}>
        <p className="text-xs text-ink-muted mb-3">
          每题强制声明类型 + 注明"为什么问 / 答案如何使用"。Critic 检查类型混合度,全是开放题就 needs_rework。
        </p>
        <div className="space-y-2">
          {QUESTION_TYPES.map(q => (
            <div key={q.type} className="p-3 bg-white rounded-lg border border-line">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-100 text-ink-secondary">{q.type}</span>
                <span className="text-xs text-ink">{q.example}</span>
              </div>
              <div className="text-[11px] text-ink-muted italic">{q.why}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Section: 行业差异化 */}
      <Section title="行业差异化 — 智能制造扩展" icon={Settings}>
        <p className="text-xs text-ink-muted mb-3">
          当 <code className="px-1.5 py-0.5 bg-slate-100 rounded text-[11px]">project.industry === 'manufacturing'</code>,
          自动激活 <code className="px-1.5 py-0.5 bg-slate-100 rounded text-[11px]">smart_manufacturing</code> 行业包,
          注入以下扩展题(关键场景:项目型销售 / BOM / Install Base / 经销商 / ERP / MES):
        </p>
        <div className="bg-white rounded-lg border border-line overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-2.5 font-semibold text-ink-secondary w-24">归属主题</th>
                <th className="text-left p-2.5 font-semibold text-ink-secondary">扩展题</th>
              </tr>
            </thead>
            <tbody>
              {MFG_EXTRA.map((q, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="p-2.5 align-top">
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-orange-50 text-[#D96400]">{q.theme}</span>
                  </td>
                  <td className="p-2.5 text-ink">{q.q}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
          <strong>行业包是配置化的</strong>:扩到医疗 / 能源 / SaaS,只新增一个 Python 文件 注册即可,主链路不变。
        </div>
      </Section>

      {/* Section: 去重逻辑 */}
      <Section title="自动去重 — 不再问已访谈过的问题" icon={Users}>
        <p className="text-xs text-ink-secondary leading-relaxed mb-3">
          Planner 用关键词匹配扫描访谈 transcript,识别已经覆盖的话题(组织架构 / KPI / 线索 / 商机 / 回款 / BOM / 经销商 / ERP / Install Base / 工单 / 合规 / 预算...),
          然后注入到 Executor prompt 里,让 LLM 在出题时主动避开。
        </p>
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
          <strong>例:</strong>友发钢管访谈中已经聊到"集团-子公司-门店"三级架构,Survey v2 不会再在「组织架构与汇报关系」分卷里重问这个问题,而是自动转向"事业部之间数据是否隔离"等 <strong>未覆盖</strong>的子主题。
        </div>
      </Section>

      {/* Section: Critic */}
      <Section title="Critic 评分" icon={CheckCircle2}>
        <div className="space-y-2">
          {RUBRIC.map(r => (
            <div key={r.dim} className="p-3 bg-white rounded-lg border border-line flex gap-3">
              <div className="shrink-0 w-32">
                <div className="text-sm font-semibold text-ink">{r.dim}</div>
                <div className="text-[11px] text-emerald-700 font-mono">阈值 {r.threshold}</div>
              </div>
              <div className="text-xs text-ink-secondary leading-relaxed">{r.desc}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* CTA */}
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="rounded-xl p-6 text-white" style={{ background: BRAND_GRAD }}>
          <h3 className="text-lg font-bold mb-1.5">在项目中体验 v2</h3>
          <p className="text-sm opacity-90 mb-4">
            进入任意项目详情,在阶段栏切换到「需求调研 v2 (β)」,完成 L1 Brief 后点生成。结果会与 v1 并存,可对比。
          </p>
          <div className="flex gap-2">
            <Link to="/console/projects" className="px-4 py-2 bg-white text-[#D96400] rounded-lg text-sm font-semibold inline-flex items-center gap-1.5">
              <Sparkles size={13} /> 去项目列表
            </Link>
            <Link to="/demo/insight" className="px-4 py-2 bg-white/20 text-white border border-white/40 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-white/30">
              <Lightbulb size={13} /> 看 Insight v2 讲解
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
