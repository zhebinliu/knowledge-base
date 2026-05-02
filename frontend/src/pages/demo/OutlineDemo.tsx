/**
 * OutlineDemo — 调研大纲 (survey_outline) 走查页
 * Route: /demo/outline (no auth required)
 *
 * 风格:跟 InsightDemo / SurveyDemo 一样,以「友发钢管」为主线逐步走查。
 * 大纲 = 调研问卷的上游(先定开几场访谈、谁参加、聊什么、要准备什么材料)
 */
import { Link } from 'react-router-dom'
import {
  ArrowLeft, ChevronRight, Sparkles, CheckCircle2,
  FileText, Bot, Lightbulb, ClipboardList, Calendar, Package, Users2, Target,
} from 'lucide-react'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

export default function OutlineDemo() {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="bg-white border-b border-line sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-3">
          <Link to="/demo" className="text-ink-muted hover:text-ink flex items-center gap-1 text-sm">
            <ArrowLeft size={14} /> 返回
          </Link>
          <span className="text-ink-muted text-xs">/</span>
          <span className="text-sm text-ink-secondary">功能走查</span>
          <span className="text-ink-muted text-xs">/</span>
          <span className="text-sm font-semibold text-ink">调研大纲</span>
        </div>
      </div>

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 pt-12 pb-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-700">内测</span>
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-orange-100 text-[#D96400]">智能体</span>
        </div>
        <h1 className="text-3xl font-extrabold text-ink tracking-tight">调研大纲 — 一份能直接拿去开 Kickoff 的项目计划</h1>
        <p className="mt-3 text-ink-secondary text-base leading-relaxed">
          调研大纲是「调研问卷」的<strong className="text-ink">上游</strong>:先定接下来几周开几场访谈、谁参加、聊什么、要准备什么材料,
          再用「调研问卷」生成对应分卷,发给对应人填。
          大纲的核心是一张 <strong className="text-ink">9 列日程表</strong>,可以直接打印出来过 Kickoff 会。
        </p>

        <div className="mt-8 p-4 bg-orange-50 border-l-4 border-orange-400 rounded-r-lg">
          <div className="text-sm font-semibold text-[#92400E] mb-1">同样用「友发钢管集团」走一遍</div>
          <div className="text-xs text-ink-secondary">
            背景:智能制造行业 · 集团 + 5 家子公司 · 计划接下来 3 周做完调研 → 进方案设计阶段。
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
          <KeyPair icon={Calendar} label="9 列日程表" desc="时间 · 时长 · 议题 · 被访方 · 我方 · 客户材料 · 我方材料 · 交付物 · 备注" />
          <KeyPair icon={Package} label="客户材料清单" desc="按类别汇总 · Owner · 截止日 · 用于哪场访谈" />
          <KeyPair icon={Users2} label="行业典型 sessions" desc="智能制造客户自动注入 14 场行业默认访谈作参考" />
        </div>
      </div>

      {/* Step 1 */}
      <Step n={1} title="进「需求调研」阶段,选「调研大纲」按钮">
        <p className="text-sm text-ink-secondary mb-3">
           把「需求调研」合到一个 stage 下,内部两个按钮 — 大纲 + 问卷。各自独立 Brief / 状态 / 产物。
        </p>
        <MockSubButtons />
      </Step>

      {/* Step 2 */}
      <Step n={2} title="填 L0 启动 Brief(8 字段,2 分钟搞定)">
        <p className="text-sm text-ink-secondary mb-3">
          大纲 Brief 比问卷的 L1 高管短卷更简单 — 主要回答"为什么调研、几周、涉及哪些部门、谁对接"。
        </p>
        <MockOutlineBrief />
      </Step>

      {/* Step 3 */}
      <Step n={3} title="智能制造客户自动激活行业模板(14 场默认 sessions + 必访部门)">
        <p className="text-sm text-ink-secondary mb-3">
          因为友发钢管行业是智能制造,系统自动从行业包注入「典型必访部门」+「默认 sessions」+「典型客户材料」三组数据,
          作为 LLM 出表的参考(不是硬塞 — LLM 会根据本项目实际情况筛选)。
        </p>
        <MockIndustryDefaults />
      </Step>

      {/* Step 4 */}
      <Step n={4} title="拿到的核心交付物 — 9 列调研日程表">
        <p className="text-sm text-ink-secondary mb-3">
          M3 调研日程表是大纲的核心,可以直接打印当作 Kickoff 议程附件。下面摘录 6 行(实际通常 8-12 行)。
        </p>
        <MockScheduleTable />
      </Step>

      {/* Step 5 */}
      <Step n={5} title="客户准备材料清单 — 提前发给客户 PMO 催收">
        <p className="text-sm text-ink-secondary mb-3">
          所有 sessions 需要的材料按类别汇总,标 Owner + 截止日。客户 PMO 拿这个去内部催。
        </p>
        <MockMaterialList />
      </Step>

      {/* Step 6 */}
      <Step n={6} title="搞定后:点切换到「调研问卷」,生成对应分卷">
        <p className="text-sm text-ink-secondary mb-3">
          大纲定好之后,在同一 stage 里点切换到「调研问卷」,系统会生成 L1 高管短卷 + L2 模块化分卷,
          自动跳过访谈中已经聊过的话题,各模块责任人各填各的。这就是上下游接力。
        </p>
        <MockHandoffToSurvey />
      </Step>

      {/* CTA */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="rounded-xl p-6 text-white" style={{ background: BRAND_GRAD }}>
          <h3 className="text-lg font-bold mb-1.5">现在去试一下</h3>
          <p className="text-sm opacity-90 mb-4">
            进任意 智能制造行业的项目,点橙色阶段「需求调研」→ 选「调研大纲」按钮体验。
            生成完点切换按钮看「调研问卷」,体验上下游联动。
          </p>
          <div className="flex gap-2">
            <Link to="/console/projects" className="px-4 py-2 bg-white text-[#D96400] rounded-lg text-sm font-semibold inline-flex items-center gap-1.5">
              <Sparkles size={13} /> 去项目列表
            </Link>
            <Link to="/demo/survey" className="px-4 py-2 bg-white/20 text-white border border-white/40 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-white/30">
              <ClipboardList size={13} /> 看 调研问卷走查 →
            </Link>
            <Link to="/demo/insight" className="px-4 py-2 bg-white/20 text-white border border-white/40 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-white/30">
              <Lightbulb size={13} /> 看 项目洞察走查 →
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
            <p>kind = <code className="bg-slate-100 px-1.5 rounded">survey_outline</code>,与 <code className="bg-slate-100 px-1.5 rounded">survey</code> 平级。</p>
            <p>7 个模块在 <code className="bg-slate-100 px-1.5 rounded">backend/services/agentic/outline_modules.py</code>(全部 critical 4 个 / optional 3 个)。</p>
            <p>复用 <code className="bg-slate-100 px-1.5 rounded">_plan_modules_generic()</code> + <code className="bg-slate-100 px-1.5 rounded">execute_insight_module()</code> + <code className="bg-slate-100 px-1.5 rounded">critique_modules()</code>(都是 module-based markdown 报告流程)。</p>
            <p>行业差异化:industry_pack 上扩展 <code className="bg-slate-100 px-1.5 rounded">must_visit_departments</code> / <code className="bg-slate-100 px-1.5 rounded">default_sessions</code> / <code className="bg-slate-100 px-1.5 rounded">typical_customer_materials</code>,runner 拼成"行业大纲补丁"注入 agent_prompt。</p>
            <p>UI:STAGES 配置加 <code className="bg-slate-100 px-1.5 rounded">subKinds</code> 数组,「需求调研」 stage 渲染 2 个按钮。activeKind 派生自 selectedSubKind。</p>
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

function KeyPair({ icon: Icon, label, desc }: { icon: typeof Calendar; label: string; desc: string }) {
  return (
    <div className="p-3 bg-white rounded-lg border border-line">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="text-[#D96400]" />
        <span className="text-sm font-semibold text-ink">{label}</span>
      </div>
      <div className="text-[11px] text-ink-muted leading-relaxed">{desc}</div>
    </div>
  )
}

// ── Mock:子按钮组 ────────────────────────────────────────────────────────────

function MockSubButtons() {
  return (
    <div className="bg-white border border-line rounded-lg p-3">
      <div className="text-[11px] text-ink-muted mb-2">↓ 点完「需求调研」 stage 后,本阶段下面的按钮组</div>
      <div className="px-2 py-2 border border-dashed border-line rounded bg-slate-50 flex items-center gap-1">
        <span className="text-[11px] text-ink-muted mr-1">本阶段产物:</span>
        <button className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-[#D96400] bg-orange-50 text-[#D96400] font-semibold">
          <span className="w-2 h-2 rounded-full bg-slate-300" />
          调研大纲 ← 选中
        </button>
        <button className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-line text-ink-secondary">
          <span className="w-2 h-2 rounded-full bg-slate-300" />
          调研问卷
        </button>
      </div>
      <div className="mt-2 text-[11px] text-ink-muted">
        每个按钮独立的 Brief / 生成状态 / 产物。点其中一个,下面的"开始生成 / Brief / 预览"按钮自动切换到对应 kind。
      </div>
    </div>
  )
}

// ── Mock:Outline Brief ─────────────────────────────────────────────────────

function MockOutlineBrief() {
  const fields = [
    { label: '调研目的',         value: '摸底现状 + 验证一阶段方案 + 收集 5 家子公司差异化需求', filled: true, conf: 'high' },
    { label: '总周期',           value: '3 周(2024-12-09 → 2024-12-27)', filled: true, conf: 'high' },
    { label: '涵盖部门',         value: ['集团销售总部', '5 家子公司销售', '集团 IT 信息中心', 'PMO', '财务部'], filled: true, conf: 'high', isList: true },
    { label: '调研后要拍板的事项', value: ['集团 vs 子公司差异化配置点', 'UAT 阶段切分', '历史数据迁移责任人'], filled: true, conf: 'medium', isList: true },
    { label: '客户对接人',       value: '钟鼐(集团信息中心)', filled: true, conf: 'high' },
    { label: '我方调研团队',     value: '', filled: false, conf: null },
    { label: '时间窗约束',       value: '客户上班时间 9:00-18:00;周五下午通常开会优先级低', filled: true, conf: 'medium' },
    { label: '偏好形式',         value: '集团总部集中访谈 + 子公司分两批走访 + 重点 workshop 线下', filled: true, conf: 'high' },
  ]
  return (
    <div className="bg-white border border-line rounded-lg overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 border-b border-line bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <FileText size={13} /> 项目要点 · 调研大纲 · L0 启动 · 友发钢管集团
        </div>
        <span className="text-[11px] text-ink-muted">8 字段中 1 个待补</span>
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
                <div className="text-ink-muted italic">— 待你补充(主访 / 记录 / 跟进 各角色人员)—</div>
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

// ── Mock:行业默认数据 ────────────────────────────────────────────────────────

function MockIndustryDefaults() {
  const departments = [
    '销售总部 / 大客户部', '区域销售 / 分公司', '渠道运营 / 经销商管理', '售前 / 解决方案',
    '售后服务 / 客户服务', '产品 / 研发', '制造 / 生产计划', '物流 / 仓储 / 备件',
    '财务 / 应收 / 商务', 'IT / 信息中心', 'PMO / 战略',
  ]
  const sessions = [
    { topic: '高管战略对齐 1on1',                  method: '1on1 访谈', target: '总裁 / 销售 VP / CIO',  dur: '2h' },
    { topic: '渠道运营 — 经销商管理 + 防串货',      method: '集中访谈', target: '渠道总监 + 大区',       dur: '3h' },
    { topic: '经销商代表座谈',                     method: '工作坊',   target: '钻 / 金 / 银 各级代表', dur: '半天' },
    { topic: '售前 — 报价 / BOM / 投标流程',       method: '集中访谈', target: '售前总监 + 高级售前',   dur: '3h' },
    { topic: '试样 / 试机 现场观察',               method: '现场观察', target: '产品 + 一线 + 客户',    dur: '全天' },
    { topic: '客户备件管理走访',                   method: '现场观察', target: '售后 + 物流 + 客户',    dur: '全天' },
    { topic: 'ERP 主数据负责人 — 同步规则梳理',     method: '1on1 访谈', target: '财务 + IT(ERP 主管)', dur: '2h' },
    { topic: 'MES / PLM 集成可行性 workshop',       method: '工作坊',   target: 'IT + 制造 + 产品',      dur: '半天' },
  ]
  return (
    <div className="space-y-3">
      <div className="bg-white border-2 border-orange-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-gradient-to-r from-orange-50 to-white border-b border-orange-200 flex items-center gap-2">
          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-[#D96400] text-white">行业包</span>
          <span className="text-sm font-semibold text-ink">smart_manufacturing — 必访部门(11 个)</span>
        </div>
        <div className="p-3 flex flex-wrap gap-1.5">
          {departments.map(d => (
            <span key={d} className="px-2 py-0.5 text-[11px] bg-orange-50 text-[#D96400] border border-orange-200 rounded">
              {d}
            </span>
          ))}
        </div>
      </div>

      <div className="bg-white border-2 border-orange-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-gradient-to-r from-orange-50 to-white border-b border-orange-200 flex items-center gap-2">
          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-[#D96400] text-white">行业包</span>
          <span className="text-sm font-semibold text-ink">行业默认 sessions(摘 8/14)</span>
        </div>
        <table className="w-full text-xs">
          <tbody className="divide-y divide-line">
            {sessions.map((s, i) => (
              <tr key={i}>
                <td className="p-2 align-top">
                  <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-purple-50 text-purple-700">{s.method}</span>
                </td>
                <td className="p-2 text-ink">{s.topic}</td>
                <td className="p-2 text-ink-secondary text-[11px]">{s.target}</td>
                <td className="p-2 text-ink-muted text-[11px] tabular-nums w-12">{s.dur}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Mock:9 列日程表(核心) ─────────────────────────────────────────────────

function MockScheduleTable() {
  const rows = [
    {
      time: 'W1 周一 上午', dur: '2h', topic: '高管战略对齐 1on1(目标 / 痛点 / 决策机制)',
      target: '徐广友(集团总裁) + 钟鼐(信息中心)',
      ours: '主访:项目 PM · 记录:顾问 A',
      cmat: '集团战略 PPT / 上轮访谈纪要',
      omat: '议程模板 / 行业 brief',
      deliv: '高管对齐纪要',
      notes: '提前 3 天发议程,确保总裁档期'
    },
    {
      time: 'W1 周二 全天', dur: '6h', topic: '集团销售总部 — 全流程现状(L2C + O2C)',
      target: '销售 VP + 销售运营 + 大客户部',
      ours: '主访:顾问 A · 记录:顾问 B',
      cmat: 'L2C 流程图 / 现有表单 / KPI 报表',
      omat: '访谈提纲 / SFA benchmark',
      deliv: '销售流程现状文档 + 痛点清单',
      notes: '线下集中访谈'
    },
    {
      time: 'W1 周四 上午', dur: '3h', topic: '渠道运营 — 经销商管理 + 防串货机制',
      target: '渠道总监 + 大区渠道经理',
      ours: '主访:顾问 A · 记录:顾问 B',
      cmat: '经销商分级表 + 报备流程文档',
      omat: '伙伴云 PRM 案例参考',
      deliv: '渠道现状 + 改进建议草稿',
      notes: '集团 + 子公司渠道差异要重点确认'
    },
    {
      time: 'W2 周一 全天', dur: '6h', topic: '陕西友发分公司走访 — 一线销售 + 仓储',
      target: '徐福亮 + 区域 5 名销售',
      ours: '主访:顾问 A · 记录:顾问 B · 后台:顾问 C',
      cmat: '近 3 个月销售台账',
      omat: '现场访谈卡 + 录音笔',
      deliv: '一线痛点纪要',
      notes: '高铁前往 / 提前 1 天到 / 含工厂参观'
    },
    {
      time: 'W2 周三 半天', dur: '4h', topic: '经销商代表座谈(钻 / 金 / 银 各 2 家)',
      target: '6 家经销商负责人 + 集团渠道经理',
      ours: '主持:项目 PM · 记录:顾问 A + B',
      cmat: '会议室 + 茶歇',
      omat: '工作坊议程 + 投票工具 + 海报板',
      deliv: '经销商需求与抱怨清单',
      notes: '注意中立场,避免集团强势压制经销商发言'
    },
    {
      time: 'W3 周二 上午', dur: '2h', topic: 'ERP 主数据负责人 — 同步规则梳理',
      target: '财务 IT(用友主管)+ 集团 IT',
      ours: '主访:技术顾问 · 记录:顾问 A',
      cmat: '用友 ERP 现有 schema + 接口文档',
      omat: '集成方案模板 / API 清单',
      deliv: 'CRM↔ERP 同步规则草案',
      notes: '主数据归属是关键议题'
    },
  ]
  return (
    <div className="bg-white border border-line rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-line bg-slate-50 flex items-center gap-2">
        <Calendar size={13} className="text-[#D96400]" />
        <span className="text-sm font-semibold text-ink">M3 调研日程表(摘 6 行 / 共 12 场)</span>
        <span className="ml-auto text-[11px] text-ink-muted">3 周 · W1 5 场 + W2 4 场 + W3 3 场</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]" style={{ minWidth: '1100px' }}>
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-2 font-semibold text-ink-secondary w-24">时间</th>
              <th className="text-left p-2 font-semibold text-ink-secondary w-12">时长</th>
              <th className="text-left p-2 font-semibold text-ink-secondary">议题</th>
              <th className="text-left p-2 font-semibold text-ink-secondary w-44">被访方角色</th>
              <th className="text-left p-2 font-semibold text-ink-secondary w-40">我方参与人</th>
              <th className="text-left p-2 font-semibold text-ink-secondary w-44">客户准备材料</th>
              <th className="text-left p-2 font-semibold text-ink-secondary w-40">我方准备</th>
              <th className="text-left p-2 font-semibold text-ink-secondary w-36">交付物</th>
              <th className="text-left p-2 font-semibold text-ink-secondary w-44">备注</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="p-2 font-medium text-ink whitespace-nowrap">{r.time}</td>
                <td className="p-2 text-ink-muted tabular-nums">{r.dur}</td>
                <td className="p-2 text-ink">{r.topic}</td>
                <td className="p-2 text-ink-secondary">{r.target}</td>
                <td className="p-2 text-ink-secondary">{r.ours}</td>
                <td className="p-2 text-ink-secondary">{r.cmat}</td>
                <td className="p-2 text-ink-secondary">{r.omat}</td>
                <td className="p-2 text-ink-secondary">{r.deliv}</td>
                <td className="p-2 text-ink-muted italic">{r.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Mock:客户准备材料清单 ───────────────────────────────────────────────────

function MockMaterialList() {
  const rows = [
    { cat: '组织',     mat: '集团组织架构图(含子公司 / 事业部 / 关键人 RACI)',     dept: 'PMO',         due: 'W1 周一前' },
    { cat: '业务流程', mat: 'L2C 流程图(线索→商机→合同,含审批节点)',                dept: '销售运营',    due: 'W1 周二前' },
    { cat: '业务流程', mat: 'O2C 流程图(订单→发货→开票→回款)',                       dept: '销售运营 + 财务', due: 'W1 周二前' },
    { cat: '数据',     mat: '产品 + BOM 现状清单 + 经销商分级表',                       dept: '产品 + 渠道', due: 'W1 周三前' },
    { cat: '系统',     mat: '用友 ERP 现有 schema + 接口文档 + 主数据归属说明',          dept: 'IT',          due: 'W3 周一前' },
    { cat: '制度',     mat: '奖惩 / 考核办法 + 数据合规要求 + 审批权限矩阵',             dept: 'PMO + IT',    due: 'W2 周一前' },
    { cat: '战略',     mat: '未来 12 个月业务规划 + Top 3 业务挑战 + 成功 KPI 定义',      dept: '集团战略',    due: 'W1 周一前' },
  ]
  return (
    <div className="bg-white border border-line rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-line bg-slate-50 flex items-center gap-2">
        <Package size={13} className="text-[#D96400]" />
        <span className="text-sm font-semibold text-ink">M4 客户准备材料清单</span>
        <span className="ml-auto text-[11px] text-ink-muted">7 类 · 17 项物</span>
      </div>
      <table className="w-full text-xs">
        <thead className="bg-slate-50">
          <tr>
            <th className="text-left p-2 font-semibold text-ink-secondary w-16">类别</th>
            <th className="text-left p-2 font-semibold text-ink-secondary">具体材料</th>
            <th className="text-left p-2 font-semibold text-ink-secondary w-32">责任人</th>
            <th className="text-left p-2 font-semibold text-ink-secondary w-24">截止日</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="p-2"><span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-orange-50 text-[#D96400] border border-orange-200">{r.cat}</span></td>
              <td className="p-2 text-ink">{r.mat}</td>
              <td className="p-2 text-ink-secondary">{r.dept}</td>
              <td className="p-2 text-ink-muted tabular-nums">{r.due}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Mock:大纲 → 问卷 衔接 ───────────────────────────────────────────────────

function MockHandoffToSurvey() {
  return (
    <div className="space-y-3">
      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
        <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-emerald-900">
          <Target size={14} /> 大纲已完成
        </div>
        <div className="text-xs text-ink-secondary">
          12 场 sessions 排好,3 周日程,7 类客户材料清单,Owner + 截止日齐全。
        </div>
      </div>
      <div className="flex items-center justify-center text-ink-muted">
        <ChevronRight size={16} />
      </div>
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-blue-900">
          <ClipboardList size={14} /> 切换到「调研问卷」按钮 → 生成对应分卷
        </div>
        <div className="text-xs text-ink-secondary">
          系统自动按大纲里 sessions 涉及的角色,生成 L1 高管短卷 + L2 模块化分卷。
          访谈中已经聊过的话题(从 transcript 关键词扫描)<strong>自动跳过</strong>,客户不会被重复问。
        </div>
      </div>
      <div className="text-[11px] text-ink-muted text-center">
        上下游接力:大纲告诉客户「我们要怎么调研」,问卷帮各模块责任人「填进去」
      </div>
    </div>
  )
}
