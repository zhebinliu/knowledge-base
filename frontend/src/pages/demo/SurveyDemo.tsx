/**
 * SurveyDemo — 调研问卷 (新版) 走查页
 * Route: /demo/survey (no auth required)
 *
 * 风格:跟 InsightDemo 一样,以「友发钢管」为主线逐步走查。
 */
import { Link } from 'react-router-dom'
import {
  ArrowLeft, ClipboardList, ChevronRight, Sparkles, CheckCircle2,
  FileText, Bot, Lightbulb, Users, Building2, Scissors, Target, MinusCircle,
} from 'lucide-react'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

export default function SurveyDemo() {
  return (
    <div className="min-h-screen bg-canvas">
      {/* Top nav */}
      <div className="bg-white border-b border-line sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-3">
          <Link to="/demo" className="text-ink-muted hover:text-ink flex items-center gap-1 text-sm">
            <ArrowLeft size={14} /> 返回
          </Link>
          <span className="text-ink-muted text-xs">/</span>
          <span className="text-sm text-ink-secondary">功能走查</span>
          <span className="text-ink-muted text-xs">/</span>
          <span className="text-sm font-semibold text-ink">调研问卷(新版)</span>
        </div>
      </div>

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 pt-12 pb-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-700">新版 · 内测</span>
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-orange-100 text-[#D96400]">智能体</span>
        </div>
        <h1 className="text-3xl font-extrabold text-ink tracking-tight">调研问卷 新版 — 一份真的发得出去、客户愿意填的问卷</h1>
        <p className="mt-3 text-ink-secondary text-base leading-relaxed">
          顾问做实施前调研时,需要把"问什么、问谁、为什么问"打包成一份能直接发给客户业务负责人的问卷。
          新版跟旧版 最大的不同:<strong className="text-ink">不再一份 60 题超级长卷塞给所有人</strong> —
          拆成 L1 高管短卷(10 分钟填完)+ L2 模块化分卷(各模块责任人各填各的),还会自动跳过访谈里已经聊过的话题。
        </p>

        <div className="mt-8 p-4 bg-orange-50 border-l-4 border-orange-400 rounded-r-lg">
          <div className="text-sm font-semibold text-[#92400E] mb-1">同样用「友发钢管集团」走一遍</div>
          <div className="text-xs text-ink-secondary">
            背景:智能制造行业 · 集团 + 5 家子公司 · 之前已经做过一轮访谈,聊过组织架构 / KPI / 商机 / 渠道结构 /奖惩制度。
          </div>
        </div>
      </div>

      {/* Step 1 */}
      <Step n={1} title="点项目阶段栏的「需求调研 (新版)」">
        <p className="text-sm text-ink-secondary mb-3">
          阶段栏第二个橙色内测是 调研问卷(新版)。点它就开始。
        </p>
        <MockStageBar />
      </Step>

      {/* Step 2 */}
      <Step n={2} title="先填 L1 高管短卷的 Brief(战略 + 痛点对齐)">
        <p className="text-sm text-ink-secondary mb-3">
          L1 是给客户 CEO / CIO / 销售 VP 看的<strong>战略对齐卷</strong>,只 8-12 题、10 分钟内填完。
          系统会预填一部分,你校对补全后保存。
        </p>
        <MockL1Brief />
      </Step>

      {/* Step 3 */}
      <Step n={3} title="后台扫访谈记录,识别「已经聊过」的话题(去重)">
        <p className="text-sm text-ink-secondary mb-3">
          旧版 不管你之前有没有访谈,问卷里都会再问一遍组织架构 / KPI / 商机 — 客户填到吐血。
           新版 会先扫 transcript,识别覆盖话题,在后续生成里 <strong>主动跳过</strong>。
        </p>
        <MockDedupView />
      </Step>

      {/* Step 4 */}
      <Step n={4} title="拼出双层问卷:L1 + L2 × 7 主题 × 13 个分卷">
        <p className="text-sm text-ink-secondary mb-3">
          每个分卷只发给该模块的责任人(不再一份 60 题塞给「所有人」)。客户高管填 L1,业务负责人填 L2.业务流程,IT 填 L2.集成生态,以此类推。
        </p>
        <MockSurveyMap />
      </Step>

      {/* Step 5 */}
      <Step n={5} title="智能制造客户自动加 12 道行业扩展题">
        <p className="text-sm text-ink-secondary mb-3">
          因为友发钢管是 智能制造行业,系统自动激活智能制造行业包,在相关分卷里追加专属题目(
          BOM 嵌套 / Install Base / 经销商门户 / ERP 厂商 / MES / PLM / 项目报备等)。
          其他行业不会出现这些题。
        </p>
        <MockIndustryExtras />
      </Step>

      {/* Step 6 */}
      <Step n={6} title="一份真实分卷长这样(摘录)">
        <p className="text-sm text-ink-secondary mb-3">
          下面是友发钢管的 <strong>L2 · 业务流程 · 项目型销售流程</strong> 这个分卷的样子。每题都标了类型 +
          为什么问 + 答案怎么用,客户填的时候不需要你在场解释。
        </p>
        <MockSurveySnippet />
      </Step>

      {/* CTA */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="rounded-xl p-6 text-white" style={{ background: BRAND_GRAD }}>
          <h3 className="text-lg font-bold mb-1.5">现在去试一下</h3>
          <p className="text-sm opacity-90 mb-4">
            进任意 智能制造行业的项目,点橙色阶段「需求调研 (新版)」体验。
            生成出来会同时有 markdown 预览 和 .docx 下载,可以直接发给客户。
          </p>
          <div className="flex gap-2">
            <Link to="/console/projects" className="px-4 py-2 bg-white text-[#D96400] rounded-lg text-sm font-semibold inline-flex items-center gap-1.5">
              <Sparkles size={13} /> 去项目列表
            </Link>
            <Link to="/demo/insight" className="px-4 py-2 bg-white/20 text-white border border-white/40 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-white/30">
              <Lightbulb size={13} /> 看 项目洞察(新版)走查 →
            </Link>
          </div>
        </div>
      </div>

      {/* For engineers */}
      <div className="max-w-4xl mx-auto px-6 pb-16">
        <details className="group bg-white rounded-lg border border-line">
          <summary className="cursor-pointer px-4 py-3 text-sm text-ink-secondary hover:text-ink flex items-center gap-2">
            <Bot size={14} />
            <span>给工程师看的实现细节</span>
            <ChevronRight size={14} className="ml-auto group-open:rotate-90 transition-transform" />
          </summary>
          <div className="px-4 pb-4 text-xs text-ink-secondary space-y-2 leading-relaxed">
            <p>分卷定义在 <code className="bg-slate-100 px-1.5 rounded">backend/services/agentic/survey_modules.py</code>:7 themes × 13 subsections。L1 单独一个 SubsectionSpec(L1_EXEC_SUBSECTION)。</p>
            <p>去重:planner.py 里 <code className="bg-slate-100 px-1.5 rounded">plan_survey()</code> 用关键词扫描 transcript_text(组织架构/KPI/商机/线索/回款/BOM/经销商/ERP/Install Base/工单/合规/预算 etc),命中即标已覆盖,执行器 prompt 里告知 LLM 跳过。</p>
            <p>行业扩展题来自 <code className="bg-slate-100 px-1.5 rounded">industry_packs/smart_manufacturing.py</code> 的 extra_question_seeds(12 条),按 theme key 路由到对应分卷。</p>
            <p>评审 评分维度:type_diversity / no_jargon / actionable / no_duplicate(全 ≥3 通过)。</p>
            <p>输出:Markdown 直显 + .docx(MinIO 存),前端 V2ValidityBanner 展示分卷状态。</p>
          </div>
        </details>
      </div>
    </div>
  )
}

// ── 公共骨架 ──────────────────────────────────────────────────────────────────

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

// ── Mock 阶段栏 ───────────────────────────────────────────────────────────────

function MockStageBar() {
  const stages = [
    { label: '项目洞察', state: 'done', color: '#D1FAE5' },
    { label: '启动会·PPT', state: 'idle', color: '#F8FAFC' },
    { label: '启动会·HTML', state: 'idle', color: '#F8FAFC' },
    { label: '需求调研', state: 'done', color: '#D1FAE5' },
    { label: '项目洞察 (新版)', state: 'idle', color: '#F8FAFC' },
    { label: '需求调研 (新版)', state: 'active', color: BRAND_GRAD },
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

// ── Mock L1 Brief 抽屉 ───────────────────────────────────────────────────────

function MockL1Brief() {
  const fields = [
    { label: '战略意图',       value: '通过 CRM 实现集团销售业务全流程可视化、精细化管控,提升运营效率', filled: true, conf: 'high' },
    { label: '成功标准 (3 SMART)', value: ['上线 6 个月内商机更新及时率 ≥ 90%', '销售漏斗转化率提升 15%', '集团-子公司销售数据 T+1 同步'], filled: true, conf: 'medium', isList: true },
    { label: 'Top 3 痛点',     value: ['销售过程不透明,管理者看不到全局', '集团-子公司业务数据孤岛', '销售漏斗等科学工具缺失'], filled: true, conf: 'high', isList: true },
    { label: '决策链 / 拍板人', value: '集团总裁徐广友拍板;信息中心钟鼐 + PMO 联合执行', filled: true, conf: 'high' },
    { label: '时间预期',       value: '2026 年底前全集团上线;一阶段 2024-12 完成 UAT', filled: true, conf: 'high' },
    { label: '预算区间',       value: '', filled: false, conf: null },
    { label: '现有系统生态',   value: ['用友 ERP', '钉钉 OA + IM', '飞书会议'], filled: true, conf: 'medium', isList: true },
    { label: '渠道结构',       value: '', filled: false, conf: null },
  ]
  return (
    <div className="bg-white border border-line rounded-lg overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 border-b border-line bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <FileText size={13} /> 项目要点 · 调研问卷(新版) · L1 高管层 · 友发钢管集团
        </div>
        <span className="text-[11px] text-ink-muted">8 字段中 2 个待补</span>
      </div>
      <div className="p-4 space-y-3 text-xs">
        {fields.map((f, i) => (
          <div key={i} className="flex gap-3">
            <div className="w-28 shrink-0 text-ink-muted">{f.label}</div>
            <div className="flex-1 min-w-0">
              {f.filled ? (
                <>
                  <div className="text-ink">
                    {f.isList ? (
                      <ul className="list-disc list-inside space-y-0.5">{(f.value as string[]).map((v, j) => <li key={j}>{v}</li>)}</ul>
                    ) : f.value}
                  </div>
                  <div className="mt-1">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${f.conf === 'high' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      已抽取 · {f.conf}
                    </span>
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
        <button className="px-3 py-1.5 text-[11px] text-white font-semibold rounded" style={{ background: BRAND_GRAD }}>保存并生成 →</button>
      </div>
    </div>
  )
}

// ── Mock 去重视图 ─────────────────────────────────────────────────────────────

function MockDedupView() {
  const covered = ['组织架构', 'KPI', '商机', '线索', '回款', '渠道结构(经销商分级)', '奖惩制度']
  const skippedQs = [
    { from: 'L2 · 组织与角色', q: '请提供最新组织架构图(集团-事业部-部门-小组)' },
    { from: 'L2 · 战略与目标', q: '您部门未来 12 个月的核心 KPI 有哪些?目标值?' },
    { from: 'L2 · 业务流程',   q: '商机阶段定义?每个阶段的进入/退出条件?' },
    { from: 'L2 · 业务流程',   q: '经销商数量?是否分级?' },
    { from: 'L2 · 资源与变革', q: '推广策略(强制 / 引导 / 奖惩挂钩)?' },
  ]
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="bg-white border border-line rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 size={14} className="text-emerald-600" />
          <span className="text-sm font-semibold text-ink">访谈中已覆盖的话题</span>
          <span className="ml-auto text-[11px] text-ink-muted">{covered.length} 个</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {covered.map(t => (
            <span key={t} className="px-2 py-0.5 text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="bg-white border border-line rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Scissors size={14} className="text-amber-600" />
          <span className="text-sm font-semibold text-ink">问卷里跳过的题(节选)</span>
          <span className="ml-auto text-[11px] text-ink-muted">5 题</span>
        </div>
        <ul className="space-y-1.5 text-[11px]">
          {skippedQs.map((q, i) => (
            <li key={i} className="flex gap-2 items-start">
              <MinusCircle size={11} className="text-amber-500 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-ink-secondary truncate">{q.q}</div>
                <div className="text-[10px] text-ink-muted">来自 {q.from}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ── Mock Survey 拼装地图 ─────────────────────────────────────────────────────

function MockSurveyMap() {
  const themes = [
    { name: '战略与目标',   subs: 1,  role: '业务负责人',                  icon: Target,    color: '#FF8D1A' },
    { name: '组织与角色',   subs: 2,  role: '业务负责人 + IT',              icon: Building2, color: '#3B82F6' },
    { name: '业务流程',     subs: 4,  role: '业务 + 一线 + 财务 + 售后',    icon: Users,     color: '#8B5CF6', highlight: true },
    { name: '数据治理',     subs: 1,  role: 'IT + 业务',                   icon: FileText,  color: '#10B981' },
    { name: '集成生态',     subs: 2,  role: 'IT + 财务',                   icon: FileText,  color: '#06B6D4' },
    { name: '合规与安全',   subs: 1,  role: 'IT + 业务',                   icon: FileText,  color: '#F43F5E' },
    { name: '资源与变革',   subs: 2,  role: '业务 + IT',                   icon: FileText,  color: '#EAB308' },
  ]
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        {/* L1 大卡 */}
        <div className="p-4 rounded-lg border-2 border-orange-300 bg-gradient-to-br from-orange-50 to-white">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-[#D96400] text-white">L1</span>
            <span className="text-sm font-semibold text-ink">高管短卷</span>
            <span className="ml-auto text-[11px] text-ink-muted">8-12 题 · ≤10 min</span>
          </div>
          <div className="text-[11px] text-ink-secondary mb-2">填卷人:CEO / COO / CIO / 销售 VP</div>
          <div className="text-xs text-ink-muted">战略意图 · 成功标准 · Top 3 痛点 · 干系人 · 时间预期 · 预算 · 系统生态</div>
        </div>
        {/* 数字卡 */}
        <div className="p-4 rounded-lg border-2 border-blue-300 bg-gradient-to-br from-blue-50 to-white">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-blue-600 text-white">L2</span>
            <span className="text-sm font-semibold text-ink">模块化分卷</span>
            <span className="ml-auto text-[11px] text-ink-muted">每分卷 8-15 题 · 5-10 min</span>
          </div>
          <div className="text-[11px] text-ink-secondary mb-2">7 主题 · 13 分卷 · 各模块责任人各填各的</div>
          <div className="text-xs text-ink-muted">↓ 详细见下方</div>
        </div>
      </div>
      {/* L2 主题表 */}
      <div className="bg-white border border-line rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-2.5 font-semibold w-32">主题</th>
              <th className="text-left p-2.5 font-semibold w-20">分卷数</th>
              <th className="text-left p-2.5 font-semibold">填卷人</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {themes.map(t => (
              <tr key={t.name} className={t.highlight ? 'bg-purple-50/40' : ''}>
                <td className="p-2.5 font-medium text-ink flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.color }} />
                  {t.name}
                  {t.highlight && <span className="px-1.5 py-0 text-[9px] font-semibold rounded bg-purple-100 text-purple-700">最丰富</span>}
                </td>
                <td className="p-2.5 text-ink-muted">{t.subs}</td>
                <td className="p-2.5 text-ink-secondary">{t.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ── Mock 行业扩展题对比 ──────────────────────────────────────────────────────

function MockIndustryExtras() {
  const extras = [
    { theme: '业务流程',     q: '项目报备机制(谁报、查重维度、报备奖励)是怎样的?',        why: '项目型销售的核心反内卷机制' },
    { theme: '业务流程',     q: '试样 / 试机 的标准化程度?平均试机周期多久?',              why: '工业品 B2B 决定签单的关键环节' },
    { theme: '数据治理',     q: '标品 vs 定制品占比?定制品 BOM 嵌套层数(2 / 3 / 5+)?', why: '决定 CPQ 实施复杂度' },
    { theme: '集成生态',     q: 'ERP 厂商 + 版本(金蝶 EAS / 用友 NC / SAP S4HANA)?',     why: '决定接口选型' },
    { theme: '集成生态',     q: 'MES / PLM 是否使用?是否需要 CRM 对接?',                   why: '工业品场景特有的集成需求' },
    { theme: '业务流程',     q: 'Install Base 在哪记录?有没有序列号体系?',                 why: '售后服务和续约的根基' },
  ]
  return (
    <div className="bg-white border-2 border-orange-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-gradient-to-r from-orange-50 to-white border-b border-orange-200 flex items-center gap-2">
        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-[#D96400] text-white">行业包</span>
        <span className="text-sm font-semibold text-ink">smart_manufacturing</span>
        <span className="ml-auto text-[11px] text-ink-muted">已激活 · 12 道扩展题(节选 6 道)</span>
      </div>
      <table className="w-full text-xs">
        <tbody className="divide-y divide-line">
          {extras.map((e, i) => (
            <tr key={i}>
              <td className="p-2.5 align-top w-20">
                <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-orange-50 text-[#D96400] border border-orange-200">{e.theme}</span>
              </td>
              <td className="p-2.5">
                <div className="text-ink">{e.q}</div>
                <div className="text-[11px] text-ink-muted italic mt-0.5">为什么问:{e.why}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 bg-slate-50 border-t border-line text-[11px] text-ink-muted">
        换一个 healthcare 行业的项目,这些题不会出现 — 取而代之的是合规 / 临床数据 / GxP 那一套(本期未实现,等行业包扩展)。
      </div>
    </div>
  )
}

// ── Mock 一个分卷的真实样子 ──────────────────────────────────────────────────

function MockSurveySnippet() {
  const intro = "本分卷调研友发钢管集团的项目型销售流程现状,预计 8-10 分钟填完,请由销售负责人或一线区域经理填写。"
  const questions = [
    {
      n: 1, type: '事实型',
      text: '项目报备机制是怎么运作的?(谁报 / 查重维度 / 报备奖励 / 串货处理)',
      why: '项目型销售的核心反内卷机制,决定后续 CRM 商机查重规则设计',
      use: '若有正式流程,设计自动查重 + 报备奖励规则;若无,本期补建标准流程',
    },
    {
      n: 2, type: '数据型',
      text: '过去 12 个月的项目签单平均周期是多少天?(从首次接触到合同盖章)',
      why: '决定销售漏斗的阶段时长基线和异常预警阈值',
      use: '配置 CRM 销售漏斗的"停留时间预警"(超过 X 天自动提醒)',
    },
    {
      n: 3, type: '事实型',
      text: '试样 / 试机的标准化程度如何?平均试机周期多久?有没有"试机申请单 → 试机记录 → 转商机"的流程?',
      why: '工业品 B2B 决定签单的关键环节,顾客试用满意度高度相关于赢率',
      use: '设计 CRM 试机管理对象 + 转化路径,关联到商机赢率分析',
    },
    {
      n: 4, type: '数据型',
      text: '标品 vs 定制品占比?定制品 BOM 嵌套层数(2 层 / 3 层 / 5 层+)?',
      why: '决定 CPQ 实施复杂度和报价引擎选型',
      use: '若 BOM 嵌套 3 层+ 或定制品占比 ≥ 30%,启用 CPQ 模块;否则用简化报价',
    },
    {
      n: 5, type: '判断型',
      text: '当前商机推进过程中,**最耗时**的环节是什么?(选项:报价等待 / 投标准备 / 客户决策 / 内部审批 / 其他)',
      why: '识别瓶颈环节,实施重心向其倾斜',
      use: '配置 CRM 流程提速 + SLA 监控',
    },
  ]
  return (
    <div className="bg-white border border-line rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-line bg-slate-50">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-blue-600 text-white">L2</span>
          <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-purple-50 text-purple-700">业务流程</span>
          <h3 className="text-sm font-semibold text-ink">项目型销售流程</h3>
          <span className="ml-auto text-[11px] text-ink-muted">5/12 题(摘录)</span>
        </div>
        <div className="text-[11px] text-ink-muted">填卷人:销售负责人 + 区域经理 · 预计 8-10 分钟</div>
      </div>
      <div className="px-5 py-3 bg-blue-50/40 border-b border-line text-xs text-ink-secondary italic">
        {intro}
      </div>
      <div className="p-5 space-y-4">
        {questions.map(q => (
          <div key={q.n} className="border-l-2 border-orange-300 pl-3">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-sm font-semibold text-ink">{q.n}.</span>
              <span className="text-sm text-ink">{q.text}</span>
            </div>
            <div className="ml-5 space-y-0.5 text-[11px]">
              <div><span className="text-ink-muted">类型:</span><span className="px-1.5 py-0 text-[10px] font-medium rounded bg-slate-100 text-ink-secondary ml-1">{q.type}</span></div>
              <div className="text-ink-secondary italic">为什么问:{q.why}</div>
              <div className="text-ink-secondary italic">答案如何使用:{q.use}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="px-5 py-2.5 bg-slate-50 border-t border-line text-[11px] text-ink-muted">
        生成的 markdown 可以直接预览,也可以下载 .docx 发给客户。
      </div>
    </div>
  )
}
