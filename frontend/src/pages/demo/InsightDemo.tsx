/**
 * InsightDemo — 项目洞察 (新版) 走查页
 * Route: /demo/insight (no auth required)
 *
 * 风格:以「友发钢管」一个真实项目为主线,逐步走查"你会看到什么、你会拿到什么"。
 * 不讲架构(规划器 / 评审 那些),只讲用户视角。
 */
import { Link } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Lightbulb, ClipboardList, ChevronRight,
  Sparkles, CheckCircle2, AlertCircle, Search, Loader2, ShieldAlert, FileText, Bot,
  Workflow, Database, Cog, Layers, FileSearch, Boxes,
} from 'lucide-react'
import {
  PipelineDiagram, ArchitectureDiagram, IOTable,
  type PipelineStage, type ArchLayer, type IORow,
} from './_demo_diagrams'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'
const BRAND = '#D96400'

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InsightDemo() {
  return (
    <div className="min-h-screen bg-canvas">
      {/* Top nav */}
      <div className="bg-white border-b border-line sticky top-0 z-10">
        <div className="max-w-[1500px] mx-auto px-8 sm:px-12 py-3 flex items-center gap-3">
          <Link to="/demo" className="text-ink-muted hover:text-ink flex items-center gap-1 text-sm">
            <ArrowLeft size={14} /> 返回
          </Link>
          <span className="text-ink-muted text-xs">/</span>
          <span className="text-sm text-ink-secondary">功能走查</span>
          <span className="text-ink-muted text-xs">/</span>
          <span className="text-sm font-semibold text-ink">项目洞察(新版)</span>
        </div>
      </div>

      {/* Hero */}
      <div className="max-w-[1500px] mx-auto px-8 sm:px-12 pt-12 pb-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-700">新版 · 内测</span>
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-orange-100 text-[#D96400]">智能体</span>
        </div>
        <h1 className="text-3xl font-extrabold text-ink tracking-tight">项目洞察 新版 — 一份给高管看的项目诊断报告</h1>
        <p className="mt-3 text-ink-secondary text-base leading-relaxed">
          顾问做对内汇报 / 内部对齐时,需要一份"项目现在怎么样、有什么风险、下一步做什么"的洞察报告。
          新版跟旧版 最大的不同:<strong className="text-ink">不会编</strong>。信息够,生成完整报告;信息不够,直接告诉你缺什么、不出残缺品。
        </p>

        <div className="mt-8 p-4 bg-orange-50 border-l-4 border-orange-400 rounded-r-lg">
          <div className="text-sm font-semibold text-[#92400E] mb-1">下面我们用「友发钢管集团」这个真实项目走一遍</div>
          <div className="text-xs text-ink-secondary">
            背景:集团化制造业客户,5 家子公司 + 多个事业部,2024-09 启动 CRM,正在 UAT 前期。<br/>
            行业:智能制造。已经有 6 份相关文档 + 一段访谈记录在系统里。
          </div>
        </div>
      </div>

      {/* ── 流程图 ── */}
      <PipelineDiagram
        title="生成流程"
        description={'项目洞察从用户点「生成」到产物入库,后台跑这条 9 阶段流水线。失败任意一步都不会出残缺品 — 信息不足直接 short_circuit 拦截,带回「还缺什么」清单。'}
        stages={INSIGHT_PIPELINE}
      />

      {/* ── 架构图 ── */}
      <ArchitectureDiagram
        title="模块架构"
        description={'按职责分 4 层:输入层负责把多源数据归一成 ctx;规划层用规则 + LLM 评估每模块需要哪些字段;生成层并行跑 10 模块;评审层做 Critic 单模块打分 + Challenger 整文挑战循环最多 3 轮重生成。'}
        layers={INSIGHT_ARCH_LAYERS}
      />

      {/* ── 输入产物 ── */}
      <IOTable
        title="输入产物 — 系统会读什么"
        variant="input"
        description="项目洞察启动时,自动从这 6 类数据源加载上下文。文档喂全文(单文档最多 30k chars 给 LLM),不走切片召回。"
        rows={INSIGHT_INPUTS}
      />

      {/* ── 输出产物 ── */}
      <IOTable
        title="输出产物 — 你会拿到什么"
        variant="output"
        description="生成完毕后,bundle 持久化以下字段。前端按 module_states 驱动质量评审面板,按 provenance 驱动引用追溯,按 challenge_summary 驱动挑战回合面板。"
        rows={INSIGHT_OUTPUTS}
      />

      {/* ── 实操走查 ── */}
      <div className="max-w-[1500px] mx-auto px-8 sm:px-12 pt-16 pb-2">
        <h2 className="text-2xl font-bold text-ink">实操走查</h2>
        <p className="text-sm text-ink-secondary mt-2">下面用「友发钢管」走一遍完整界面。</p>
      </div>

      {/* Step 1 */}
      <Step n={1} title="点项目阶段栏的「项目洞察 (新版)」">
        <p className="text-sm text-ink-secondary mb-3">
          进入友发钢管项目详情,顶部阶段栏现在多了 2 个内测阶段。点第一个橙色那个。
        </p>
        <MockStageBar />
      </Step>

      {/* Step 2 */}
      <Step n={2} title="抽屉自动弹出,大半字段已经替你填好">
        <p className="text-sm text-ink-secondary mb-3">
          系统会扫"项目元数据 + 已上传文档 + 之前的访谈记录",自动预填  新版 需要的字段。你只需要校对 + 补几个缺的。
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
          下面是友发钢管 新版报告的真实样式。每段结论都标了 <strong>来源</strong>,不带来源的"洞察"不许出现。
        </p>
        <MockReportSnippet />
      </Step>

      {/* Step 6 — invalid */}
      <Step n={6} title="如果信息不够,你会看到红色 banner(而不是糊弄你的报告)">
        <p className="text-sm text-ink-secondary mb-3">
          换个新建的空项目(没访谈、没文档、没 Brief)跑新版,系统不会强行编。它会标 invalid,把缺的清单列出来,等你补完再点重新生成。
        </p>
        <MockInvalidBanner />
        <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 leading-relaxed">
          <strong>这是设计,不是 bug。</strong>
          旧版 的策略是"宁可写也别空着",结果一堆空话和编造;新版改成"宁可不写也别糊弄",信息不够的章节就标"信息缺失"。
          <br/>对顾问的实际意义:你拿这份报告对内汇报,不会被同事问"这数据哪里来的、你确定吗"。
        </div>
      </Step>

      {/* CTA */}
      <div className="max-w-[1500px] mx-auto px-8 sm:px-12 py-12">
        <div className="rounded-xl p-6 text-white" style={{ background: BRAND_GRAD }}>
          <h3 className="text-lg font-bold mb-1.5">现在去试一下</h3>
          <p className="text-sm opacity-90 mb-4">
            进任意 智能制造行业的项目(友发钢管 / 特变新能源 / 唐山天地矿业 / 百迈客生物科技 / 东方雨虹)
            ,点橙色阶段「项目洞察 (新版)」体验。
          </p>
          <div className="flex gap-2">
            <Link to="/console/projects" className="px-4 py-2 bg-white text-[#D96400] rounded-lg text-sm font-semibold inline-flex items-center gap-1.5">
              <Sparkles size={13} /> 去项目列表
            </Link>
            <Link to="/demo/survey" className="px-4 py-2 bg-white/20 text-white border border-white/40 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-white/30">
              <ClipboardList size={13} /> 看 调研问卷(新版)走查 →
            </Link>
          </div>
        </div>
      </div>

      {/* For engineers — 折叠 */}
      <div className="max-w-[1500px] mx-auto px-8 sm:px-12 pb-16">
        <details className="group bg-white rounded-lg border border-line">
          <summary className="cursor-pointer px-4 py-3 text-sm text-ink-secondary hover:text-ink flex items-center gap-2">
            <Bot size={14} />
            <span>给工程师看的实现细节</span>
            <ChevronRight size={14} className="ml-auto group-open:rotate-90 transition-transform" />
          </summary>
          <div className="px-4 pb-4 text-xs text-ink-secondary space-y-2 leading-relaxed">
            <p>10 个模块声明在 <code className="bg-slate-100 px-1.5 rounded">backend/services/agentic/insight_modules.py</code>(必要 6 个 / 可选 4 个)。</p>
            <p>流程编排在 <code className="bg-slate-100 px-1.5 rounded">runner.py</code>:规划器(规则化)→ Gap Fill(并行 KB 检索)→ 执行器(并行 LLM 模块填充)→ 评审(四要素评分:Specificity / Evidence / Timeliness / Next Step)。</p>
            <p>智能制造扩展在 <code className="bg-slate-100 px-1.5 rounded">industry_packs/smart_manufacturing.py</code>:13 字段补丁 + 10 痛点 + 3 标杆案例(友发 / 特变 / 唐山天地)+ 12 行业种子题。</p>
            <p>结果落到 <code className="bg-slate-100 px-1.5 rounded">bundle.extra.{`{validity_status, module_states, ask_user_prompts, run_history}`}</code>。无 alembic migration。</p>
          </div>
        </details>
      </div>
    </div>
  )
}

// ── 流程 / 架构 / IO 数据常量 ──────────────────────────────────────────────

const INSIGHT_PIPELINE: PipelineStage[] = [
  {
    key: 'ctx_load',
    label: '加载上下文',
    short: '读项目元信息 + 文档 + Brief + 干系人画布 + 历史访谈',
    detail: '从 6 个来源拉数据归一成 ctx:Project 元信息(行业 / 规模)、按 doc_type 索引的项目文档(SOW / 集成方案 / 合同 / 交接单)、用户填的 Brief 字段、前端画的干系人 canvas、历史 OutputConversation 访谈记录、虚拟物问卷(成功指标 / 风险预警)。文档喂全文,单文档最多 30k chars。',
    color: 'blue',
    icon: <Database size={14} />,
  },
  {
    key: 'planner',
    label: '规划体检',
    short: '评估 10 模块的字段是否充分,缺则标 ask_user / kb_search',
    detail: 'Planner 对每个模块的 fields 做规则化优先 + LLM 兜底评估:有数据→available,缺→missing+gap_action(kb_search 走 KB 检索 / ask_user 让用户补 / downgrade 降级跳过)。critical 模块缺关键字段 → sufficient_critical=False → 直接 short_circuit 拦截不跑 LLM。',
    color: 'orange',
    icon: <Cog size={14} />,
  },
  {
    key: 'kb_fill',
    label: '检索补缺',
    short: 'gap=kb_search 的字段 → 项目内 + KB 检索 → embedding 召回',
    detail: 'planner 标记 kb_search 的 gap actions 跑 fill_kb_gaps:embedding_service.embed(query) → vector_store.search(top_k=5,industry 过滤),命中的 chunks 作为 [K1][K2]... 编号引用。M9 行业最佳实践还会附加 web_search 结果 [W1][W2]。',
    color: 'orange',
    icon: <FileSearch size={14} />,
  },
  {
    key: 'execute',
    label: '并行生成',
    short: '10 模块并行调 LLM 写 markdown + sources_index',
    detail: 'execute_insight_module 并发跑 ready 模块。每模块 LLM prompt 含:fields 评估状态 / project 元信息 / sources_index(D/K/W 编号引用) / 行业包(M9) / agent_prompt + skill_text(运营在后台启用的 atomic skill)。LLM 必须每事实末尾标 [D1][K1] 等具体 ID,不能编。返回 dict {content, sources_index}。',
    color: 'purple',
    icon: <Workflow size={14} />,
  },
  {
    key: 'critic',
    label: 'Critic 打分',
    short: '每模块 4 维度 Sopact rubric 评分',
    detail: 'critique_modules 一次给所有模块按 specificity / evidence / timeliness / next_step 4 维度打 0-4 分。任一维度 < 阈值 → needs_rework;全通过 → pass;<200 字 / 全占位符 → insufficient。结果写到 module_states[m].score。',
    color: 'purple',
    icon: <CheckCircle2 size={14} />,
  },
  {
    key: 'challenge',
    label: '挑战循环',
    short: '整文 7 维度对抗审核,major issues 重生成,最多 3 轮',
    detail: '_run_challenge_loop:challenge_report 让 LLM 看整文找问题,7 维度(critic 4 维 + completeness/consistency/jargon)。verdict={pass / minor / major / parse_failed}。affected modules 带 critique 反馈走 execute_insight_module 重生成,替换 module_contents。重复直到 pass 或 round=3。parse_failed 自动重试 1 次降温度 + 反馈失败片段。',
    color: 'orange',
    icon: <ShieldAlert size={14} />,
  },
  {
    key: 'assemble',
    label: '拼装 markdown',
    short: '按 INSIGHT_MODULES 顺序拼,加附录 / 名词表 / 运行报告',
    detail: '_assemble_full_md 闭包:按 M1-M10 顺序输出每模块标题 + content,挑战循环每轮重生成模块后会再调一次。失败/缺失模块写"信息缺失,建议补访"占位。结尾加 名词解释 / 挑战日志 / 运行报告 三个附录。',
    color: 'emerald',
    icon: <Layers size={14} />,
  },
  {
    key: 'docx',
    label: '生成 docx',
    short: 'markdown → docx 落 MinIO,前端可下载',
    detail: '_build_docx 用 python-docx 把 markdown 转成 Word,MinIO put 到 outputs/{bundle_id}/insight_v2.docx。前端的「下载」按钮直接走 viewOutputUrl 拉文件。失败不阻断主流程(用户照常看到 markdown)。',
    color: 'emerald',
    icon: <FileText size={14} />,
  },
  {
    key: 'persist',
    label: '入库',
    short: 'CuratedBundle.content_md + extra(provenance / 挑战 / states)',
    detail: '_mark(bundle_id, "done") 写 CuratedBundle:content_md(完整 markdown) + status=done + extra={validity_status / module_states / ask_user_prompts / provenance / challenge_summary / progress / web_search_status}。前端 polling 拉到 done → 渲染 CitedReportView + 质量评审面板。',
    color: 'emerald',
    icon: <Boxes size={14} />,
  },
]

const INSIGHT_ARCH_LAYERS: ArchLayer[] = [
  {
    key: 'input',
    label: '输入层 — 多源数据归一',
    color: 'blue',
    components: [
      { name: '项目文档(全文)', description: '按 doc_type 索引(SOW / 集成方案 / 合同 / 交接单 / 售前调研...),单文档最多 30k chars 喂 LLM,不走切片' },
      { name: '项目元信息', description: 'Project 表:name / customer / industry / modules / kickoff_date / customer_profile' },
      { name: 'Brief 字段', description: '用户填的 M1-M10 字段(若有);v3 文档驱动模式可跳过填表' },
      { name: '干系人画布', description: '前端 react-flow 画的部门 / 人员关系图,渲染成 markdown 喂 LLM' },
      { name: '历史访谈', description: 'OutputConversation 表的对话记录,refs 包含已检索 KB chunks' },
      { name: 'KB 知识库', description: 'qdrant 向量索引,embedding 召回,industry / ltc_stage 过滤' },
      { name: '行业包', description: 'industry_packs(智能制造等)提供必访部门 / 默认 sessions / 客户准备材料模板' },
      { name: 'Web 搜索(M9)', description: 'Bocha / Tavily,仅 M9 行业最佳实践模块用,可配置 API key' },
    ],
  },
  {
    key: 'engine',
    label: '引擎层 — 规划 / 生成 / 评审',
    color: 'orange',
    components: [
      { name: 'Planner', description: 'plan_insight 评估每模块字段,产 ExecutionPlan(modules / gap_actions / sufficient_critical)' },
      { name: 'Executor', description: 'execute_insight_module 并行 10 模块,渲染 prompt + 调 LLM + 后处理引用 ID' },
      { name: 'Critic', description: 'critique_modules 一次性 LLM 评分,Sopact 4 维度,产 ModuleScore' },
      { name: 'Challenger', description: 'challenge_report + _run_challenge_loop 整文 7 维度对抗审核 + 最多 3 轮重生成' },
      { name: 'KB Filler', description: 'fill_kb_gaps 跑 kb_search gap actions,embedding + 项目内/全库降级检索' },
      { name: 'Provenance Builder', description: '_build_sources_index 统一编号 D/K/W ID,生成 evidence_block + sources_index' },
    ],
  },
  {
    key: 'config',
    label: '配置层 — 运营可改',
    color: 'purple',
    components: [
      { name: 'Atomic Skills', description: '12 条原子技能(MBB 风格 / 引用规则 / Critic rubric 等),后台可编辑,通过 skill_ids 关联到 kind' },
      { name: 'Output Agent Config', description: 'agent_config(output_agent, kind):prompt / skill_ids / model,运营在 /system-config「输出代理」编辑' },
      { name: 'Stage Flow Config', description: 'stage_flow:全局阶段流程(insight_v2 / survey_v2 / ...),admin 配置' },
      { name: 'Industry Packs', description: '智能制造 / 金融等行业模板,代码定义,运营可扩展' },
    ],
  },
  {
    key: 'output',
    label: '输出层 — 持久化 + 前端消费',
    color: 'emerald',
    components: [
      { name: 'CuratedBundle', description: '主表:content_md(整份报告) + status + file_key(docx) + extra(JSON)' },
      { name: 'extra.module_states', description: '每模块状态:status / score / missing_fields,驱动质量评审面板' },
      { name: 'extra.provenance', description: '{module_key: {D1/K1/W1: meta}},驱动 CitedReportView 角标点击 + 引用追溯' },
      { name: 'extra.challenge_summary', description: 'rounds_total / final_verdict / issues_remaining,驱动挑战回合面板' },
      { name: 'docx 文件', description: 'MinIO 存储,outputs/{bundle_id}/insight_v2.docx' },
    ],
  },
]

const INSIGHT_INPUTS: IORow[] = [
  {
    key: 'docs',
    label: '项目文档',
    source: 'documents 表',
    format: 'doc_type 分类 + markdown_content 全文',
    example: 'SOW / 系统集成方案 / 合同 / 交接单 / 售前调研报告 / 干系人图\n例: docs_by_type[\'sow\'] = [{filename: "友发钢管 SOW.docx", markdown: "本项目..."}]',
  },
  {
    key: 'project_meta',
    label: '项目元信息',
    source: 'projects 表',
    format: 'Project 字段',
    example: '{name: "友发钢管 CRM", customer: "友发钢管集团", industry: "manufacturing", modules: ["客户管理","商机管理"], kickoff_date: "2024-09-01"}',
  },
  {
    key: 'brief',
    label: 'Brief 字段',
    source: 'project_briefs 表',
    format: 'M1-M10 模块字段 dict',
    example: '{situation: "...", complication: "...", success_metric_revenue: ["销售额增长","回款率"], risk_alert_data_quality: 3}',
  },
  {
    key: 'stakeholder',
    label: '干系人画布',
    source: 'project_briefs(output_kind=stakeholder_graph)',
    format: 'react-flow nodes/edges JSON',
    example: '{nodes: [{id:"1", data:{name:"张总", role:"CIO"}}, ...], edges: [{source:"1", target:"2", relation:"汇报"}]}',
  },
  {
    key: 'transcript',
    label: '访谈记录',
    source: 'output_conversations 表',
    format: 'messages 数组(role / content / refs)',
    example: '[{role:"assistant", content:"目前商机阶段如何定义?"}, {role:"user", content:"分5阶段..."}]',
  },
  {
    key: 'kb',
    label: 'KB 检索',
    source: 'qdrant + chunks 表',
    format: 'embedding 召回 + industry/ltc_stage 过滤',
    example: 'plan.gap_actions[g].action="kb_search" → vector_store.search(qvec, top_k=5, industry="manufacturing")',
  },
]

const INSIGHT_OUTPUTS: IORow[] = [
  {
    key: 'content_md',
    label: '完整报告 markdown',
    source: 'CuratedBundle.content_md',
    format: 'Markdown 字符串(M1-M10 + 附录)',
    example: '# 友发钢管 · 项目洞察报告\n## M1 执行摘要\n总体健康度 RAG=黄...\n## M2 项目快照\n...',
  },
  {
    key: 'module_states',
    label: '模块状态',
    source: 'bundle.extra.module_states',
    format: '{module_key: {status, score, issues, missing_fields}}',
    example: '{M3_health_radar: {status:"done_with_warnings", score:{specificity:3, evidence:2, ..., overall:"needs_rework", issues:["证据:...未标来源"]}}}',
  },
  {
    key: 'provenance',
    label: '引用索引',
    source: 'bundle.extra.provenance',
    format: '{module_key: {D1/K1/W1: {type, label, doc_id/chunk_id/url}}}',
    example: '{M6_findings: {D1: {type:"doc", filename:"SOW.docx", doc_id:"abc"}, K1: {type:"kb", chunk_id:"xyz", section:"商机管理"}}}',
  },
  {
    key: 'challenge_summary',
    label: '挑战循环结果',
    source: 'bundle.extra.challenge_summary',
    format: '{rounds_total, final_verdict, issues_remaining}',
    example: '{rounds_total: 2, final_verdict: "minor_issues", issues_remaining: 1}',
  },
  {
    key: 'ask_user',
    label: '待用户补充',
    source: 'bundle.extra.ask_user_prompts',
    format: '[{module_key, field_key, question, options?}]',
    example: '[{module_key:"M1_exec_summary", field_key:"situation", question:"项目当前态势?", options:["...A","...B"]}]',
  },
  {
    key: 'validity',
    label: '整体合格性',
    source: 'bundle.extra.validity_status',
    format: 'enum: valid | partial | invalid',
    example: '"valid" — 全部 critical 模块通过\n"partial" — 部分通过(挑战循环后仍有 minor issues)\n"invalid" — 信息不足拦截,未跑 LLM',
  },
  {
    key: 'docx',
    label: 'Word 文档',
    source: 'MinIO outputs/{id}/insight_v2.docx',
    format: 'docx 二进制',
    example: '前端 viewOutputUrl(bundle.id) 拉签名 URL,浏览器直接下载',
  },
]


// ── 小组件:页面骨架 ───────────────────────────────────────────────────────────

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="max-w-[1500px] mx-auto px-8 sm:px-12 py-8 border-t border-line">
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

// ── 样式预览:阶段栏 ───────────────────────────────────────────────────────────

function MockStageBar() {
  const stages = [
    { label: '项目洞察', state: 'done', color: '#D1FAE5' },
    { label: '启动会·PPT', state: 'idle', color: '#F8FAFC' },
    { label: '启动会·HTML', state: 'idle', color: '#F8FAFC' },
    { label: '需求调研', state: 'done', color: '#D1FAE5' },
    { label: '项目洞察 (新版)', state: 'active', color: BRAND_GRAD },
    { label: '需求调研 (新版)', state: 'idle', color: '#F8FAFC' },
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

// ── 样式预览:Brief 抽屉 ──────────────────────────────────────────────────────

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
          <FileText size={13} /> 项目要点 · 项目洞察(新版) · 友发钢管集团
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

// ── 样式预览:规划器 评估 ────────────────────────────────────────────────────

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

// ── 样式预览:并行生成进度 ────────────────────────────────────────────────────

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

// ── 样式预览:报告样本 ────────────────────────────────────────────────────────

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

// ── 样式预览:invalid banner ──────────────────────────────────────────────────

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
