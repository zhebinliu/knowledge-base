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
        <h1 className="text-3xl font-extrabold text-ink tracking-tight">项目洞察 — 售前交接给 PM 后,快速摸清项目底盘的工具</h1>
        <p className="mt-3 text-ink-secondary text-base leading-relaxed">
          售前交付后,实施 PM 拿到一堆 SOW / 集成方案 / 售前调研 / 交接单,要快速对这个项目了如指掌 —
          客户什么背景、项目要做什么、关键风险在哪、组织决策链怎么走、下一步怎么动。
          系统读完所有交接资料,自动整理一份 360° 项目画像。
          <strong className="text-ink"> 不会编。</strong> 资料够,出完整画像;资料不够,直接告诉 PM 缺什么、还需要找谁要。
        </p>

        <div className="mt-8 p-4 bg-orange-50 border-l-4 border-orange-400 rounded-r-lg">
          <div className="text-sm font-semibold text-[#92400E] mb-1">下面用「友发钢管集团」这个真实项目走一遍</div>
          <div className="text-xs text-ink-secondary">
            背景:集团化制造业客户,5 家子公司 + 多个事业部,2024-09 启动 CRM,正在 UAT 前期。<br/>
            行业:智能制造。售前已经交接了 6 份文档 + 一段历史访谈记录。PM 上任第一件事就是用这个工具摸底。
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

      {/* Step 2 — v3 文档驱动:左栏文档清单 + 中栏 Hero */}
      <Step n={2} title="确认交接资料齐不齐,补齐了点「开始生成」">
        <p className="text-sm text-ink-secondary mb-3">
          进入项目洞察后是 <strong>三栏布局</strong>。左栏文档清单告诉你"必备 / 推荐"哪些文档已经上传、哪些缺;
          中栏显示完成度大数字 + 大「开始生成」按钮。<strong>新版不需要填表</strong> — 系统直接从文档里抽,
          你只要把交接资料补齐就行。
        </p>
        <MockDocChecklist />
        <p className="text-xs text-ink-muted mt-3">
          ↑ 必备 7 项里已上传 4 项(SOW / 集成方案 / 合同 / 交接单),还差 3 项推荐资料 + 2 项虚拟物问卷。
          完成度 4/7 时仍可生成,但建议尽量补全提高画像质量。
        </p>
      </Step>

      {/* Step 3 */}
      <Step n={3} title="想知道生成会不会成功?点「先看体检」">
        <p className="text-sm text-ink-secondary mb-3">
          PreparationView 中栏顶部 Hero 卡片的 CTA 区,有个 <strong>「先看体检」</strong> 按钮(在「开始生成」旁边)。
          点开能看到 <strong>每个章节的字段够不够、缺什么、能不能成功生成</strong>。
          后台体检是规则化判断,<strong>不调 LLM 几秒钟出结果</strong>,让 PM 提前补缺,而不是等失败再补。
        </p>
        <MockEvidenceAssessment />
        <p className="text-[11px] text-ink-muted mt-2">
          ↑ 弹出的体检 Drawer 样式 — 顶部综合判定(够 / 不够),中间按章节展开看字段状态,底部列待补字段清单。
        </p>
      </Step>

      {/* Step 4 */}
      <Step n={4} title="点「开始生成」,等 1-3 分钟拿报告">
        <p className="text-sm text-ink-secondary mb-3">
          系统先并行生成 10 个章节,然后挑战员来挑刺,有重大问题的章节带反馈重生成,最多 3 轮。
          整个过程 PM <strong>不需要任何操作</strong>,工作台显示阶段进度 + 当前在跑的章节。
        </p>
        <MockGenerationProgress />
      </Step>

      {/* Step 5 — sample output */}
      <Step n={5} title="拿到 360° 项目画像 — 每段都能溯源">
        <p className="text-sm text-ink-secondary mb-3">
          下面是友发钢管画像的真实样式。报告顶部是<strong>综合质量评审</strong>(整体可交付 / 细节待补 / 挑战通过几轮);
          每段结论末尾的橙色徽章 <CitationBadge id="D1" />、<CitationBadge id="K3" /> 是 <strong>来源角标</strong>,
          点开就能看原文档/原片段。<strong>不带来源的"洞察"绝不会出现</strong>。
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
          <br/>对 PM 的实际意义:你拿这份画像内部对齐 / 跟客户复盘,不会被问"这数据哪里来的、你确定吗"。
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
    label: '收集资料',
    short: '把跟项目相关的文档、记录、画布全部读一遍',
    detail: '系统从 6 个地方收集资料:你上传的文档(SOW、集成方案、合同、交接单等)、项目基本信息(客户、行业、规模)、之前在表单里填过的字段、画好的干系人关系图、历史访谈记录、成功指标问卷。重要文档喂全文给 AI,不切片不漏关键条款。',
    color: 'blue',
    icon: <Database size={14} />,
  },
  {
    key: 'planner',
    label: '体检',
    short: '看看 10 个模块的资料够不够,缺什么标出来',
    detail: 'AI 不会蒙头就写。先对每个章节(执行摘要、项目快照、健康度雷达 等 10 个)做体检 — 哪些字段有数据、哪些缺。关键章节缺核心字段时,直接停下来告诉你"还差什么",不出残缺品。',
    color: 'orange',
    icon: <Cog size={14} />,
  },
  {
    key: 'kb_fill',
    label: '查知识库',
    short: '缺的资料去公司知识库 + 同行业案例库找',
    detail: '体检发现缺的内容,系统会自动去知识库检索。比如"行业典型实施周期"→ 同行业历史项目里找,"政策合规要点"→ KB 里找。命中的内容编号成 K1、K2 等,后续报告里有据可查。',
    color: 'orange',
    icon: <FileSearch size={14} />,
  },
  {
    key: 'execute',
    label: '并行写作',
    short: '10 个章节同时让 AI 写,每段都标具体出处',
    detail: '10 个章节同时开工,大约 1-2 分钟全部写完。AI 写每段时手边有项目文档(D1, D2…)、知识库片段(K1, K2…)、网搜结果(W1, W2…)。每个事实陈述末尾必须标具体出处,**编不出来的就标"信息缺失"**,绝不胡编。',
    color: 'purple',
    icon: <Workflow size={14} />,
  },
  {
    key: 'critic',
    label: '逐章打分',
    short: '4 个维度评每个章节:具体性、证据、时效性、下一步',
    detail: '初稿写完,系统对每章打 4 个维度分(0-4 分):**具体性**(够不够具体到陕西分公司、12/15 这种)、**证据**(每个数字有没有出处)、**时效性**(结论现在还有用吗)、**下一步**(每条建议有责任人 + 截止日期吗)。任一维度低于 3 分,标"待返工"。',
    color: 'purple',
    icon: <CheckCircle2 size={14} />,
  },
  {
    key: 'challenge',
    label: '对抗式审核',
    short: '让另一个 AI 当挑战者,把整份报告挑刺,有重大问题重写',
    detail: '挑战者 AI 用 7 个维度审整份报告,把"模糊 / 黑话 / 没引用 / 自相矛盾"等问题挑出来。有重大问题的章节,带着挑战意见重新生成。最多 3 轮。每轮通过率提升,直到挑战者说"通过"或 3 轮上限。',
    color: 'orange',
    icon: <ShieldAlert size={14} />,
  },
  {
    key: 'assemble',
    label: '拼装报告',
    short: '把 10 个章节按顺序拼成完整报告',
    detail: '按"执行摘要 → 项目快照 → 健康度雷达 → 干系人画像 → … → 下一步建议"的顺序拼装,加上"名词解释"和"挑战记录"附录。失败的章节会写"信息缺失,建议补访"占位,而不是空着或胡编。',
    color: 'emerald',
    icon: <Layers size={14} />,
  },
  {
    key: 'docx',
    label: '生成 Word',
    short: '一键下载格式好的 Word 文档,PM 可拿来归档 / 内部对齐',
    detail: '系统把 Markdown 自动转成 Word(.docx),保留标题层级、表格、引用等格式。PM 点页面右上角「下载」就能拿到,不需要复制粘贴重排。可以发给项目组其他成员、归档到项目文件夹、或带去会议讨论。',
    color: 'emerald',
    icon: <FileText size={14} />,
  },
  {
    key: 'persist',
    label: '入库展示',
    short: '报告存档,前端立即显示带角标 + 质量评审',
    detail: '报告写入数据库后,前端立即从"生成中"切换到"完成"。报告里的 [D1] [K1] 角标全部变成可点击的橙色徽章,点开能看到出处原文。顶部显示综合质量评审(整体可交付 / N 项细节待补)。',
    color: 'emerald',
    icon: <Boxes size={14} />,
  },
]

const INSIGHT_ARCH_LAYERS: ArchLayer[] = [
  {
    key: 'input',
    label: '第一层 — 系统会读什么',
    color: 'blue',
    components: [
      { name: '项目文档', description: 'SOW、系统集成方案、合同、交接单、售前调研、干系人图。重要文档喂全文给 AI,不切片漏条款。' },
      { name: '项目基本信息', description: '客户名称、所属行业、项目规模、启动时间、客户画像。' },
      { name: '已填表单', description: '顾问之前在表单里填过的字段(若有)。新版"文档驱动"模式下,可以跳过填表,系统自动从文档抽取。' },
      { name: '干系人关系图', description: '在项目详情页画的部门 / 人员组织关系图。系统转成文字喂给 AI。' },
      { name: '历史访谈记录', description: '之前跟客户的对话记录。系统会去重,避免在报告里重复问已聊过的话题。' },
      { name: '公司知识库', description: '跨项目沉淀的最佳实践、行业 knowhow、典型流程。AI 缺资料时来这里查。' },
      { name: '行业模板', description: '智能制造 / 金融 等行业的"必访部门 / 标准议题 / 客户准备材料"模板,自动注入到对应行业的项目。' },
      { name: '网络搜索', description: '需要行业最新动态(政策 / 标杆案例 / 公开数据)时,系统去网上搜。仅"行业最佳实践"章节用。' },
    ],
  },
  {
    key: 'engine',
    label: '第二层 — AI 引擎做什么',
    color: 'orange',
    components: [
      { name: '体检员', description: '生成前对每个章节做体检 — 哪些字段有数据、哪些缺。关键缺失直接停下来告诉你,不出残缺品。' },
      { name: '写作员', description: '10 个章节并行交给 AI 写,每段都要标具体出处。约 1-2 分钟。' },
      { name: '打分员', description: '初稿出来后,从 4 个维度(具体性 / 证据 / 时效性 / 下一步)给每章打分,找细节问题。' },
      { name: '挑战员', description: '从 7 个维度审整份报告找重大问题,把"模糊 / 黑话 / 没引用"挑出来,触发重写,最多 3 轮。' },
      { name: '检索员', description: '体检发现缺的资料,自动去知识库 / 同行业案例库找,找到的内容编号引用,有据可查。' },
      { name: '出处管家', description: '统一管理 D(项目文档) / K(知识库) / W(网搜)三类来源的编号,确保每个引用都能溯源。' },
    ],
  },
  {
    key: 'config',
    label: '第三层 — 运营可改什么',
    color: 'purple',
    components: [
      { name: '原子技能库', description: '12 条预置技能(MBB 风格、禁用黑话、中文输出、引用规则等),管理员可编辑,自由组合给不同场景。' },
      { name: '输出代理配置', description: '每个产物(项目洞察 / 调研大纲 / 调研问卷)用什么 AI 模型 / 启用哪些技能 / 自定义 prompt,后台都可改。' },
      { name: '阶段流程配置', description: '项目实施阶段(项目洞察 / 启动会 / 需求调研 / 蓝图设计 等)的顺序和启用状态,管理员可调。' },
      { name: '行业模板', description: '智能制造 / 金融 / 零售 等行业的差异化模板。代码内置一份,运营可在此基础上扩展自定义。' },
    ],
  },
  {
    key: 'output',
    label: '第四层 — 你会拿到什么',
    color: 'emerald',
    components: [
      { name: '完整画像', description: '10 个章节 + 附录的完整 Markdown / Word 文档,PM 用来摸底 / 内部对齐 / 归档。' },
      { name: '逐章质量评级', description: '每个章节的状态(通过 / 待提升 / 信息不足),以及具体哪几条 issue 顾问需要补。' },
      { name: '出处溯源', description: '画像里每个 [D1] [K1] 都能点开看原文。同事 / 客户问"这个数字哪来的",一秒答上。' },
      { name: '挑战记录', description: '挑战循环跑了几轮、每轮挑出什么问题、修了哪些章节,完整记录给顾问 review。' },
      { name: 'Word 下载', description: '一键下载格式好的 Word 文档,标题 / 表格 / 引用全保留,不用重排版。' },
    ],
  },
]

const INSIGHT_INPUTS: IORow[] = [
  {
    key: 'docs',
    label: '项目文档',
    source: '顾问上传',
    format: 'PDF / Word / Excel 自动转 Markdown',
    example: '友发钢管 SOW.docx — 包含项目范围、目标、交付物清单 等\n友发钢管 集成方案.pdf — 现有 ERP / OA / MES 系统列表 + 集成需求\n友发钢管 业务交接单.docx — 上家服务商遗留的待办 + 已知风险',
  },
  {
    key: 'project_meta',
    label: '项目基本信息',
    source: '项目创建时填',
    format: '客户 / 行业 / 模块 / 启动时间',
    example: '客户:友发钢管集团\n行业:智能制造\n实施模块:客户管理 / 商机管理 / 订单管理 / 渠道管理\n启动时间:2024-09-01',
  },
  {
    key: 'brief',
    label: '已填表单',
    source: '顾问之前填过的(可选)',
    format: '关键字段答案 + 来源标注',
    example: '项目态势:大型集团 5 子公司,UAT 阶段卡在数据质量\n核心成功指标:销售周期缩短 20% / 回款及时率提升 15%',
  },
  {
    key: 'stakeholder',
    label: '干系人关系图',
    source: '在项目详情页手画',
    format: '部门 / 人员节点 + 汇报关系连线',
    example: '张总(CIO)→ 王经理(IT 项目)\n李总(销售 VP)→ 赵主管(数字化项目)\n标记决策链:张总 + 李总联合拍板',
  },
  {
    key: 'transcript',
    label: '历史访谈记录',
    source: '系统访谈机器人收集',
    format: '问答对话(角色 / 内容)',
    example: '顾问问:"目前商机阶段如何定义?"\n客户答:"分 5 阶段:线索 / 接触 / 方案 / 报价 / 签约,但实际推进多走 3 阶段就跳。"',
  },
  {
    key: 'kb',
    label: '公司知识库',
    source: '跨项目沉淀',
    format: '行业 knowhow + 实施案例片段',
    example: '"智能制造行业 CRM 实施典型周期 6-9 个月" — 来自 2023 年 3 个同行业项目复盘\n"国央企集团客户必跑数据出境合规评估" — 来自 KB 制度库',
  },
]

const INSIGHT_OUTPUTS: IORow[] = [
  {
    key: 'content_md',
    label: '完整报告',
    source: '系统生成',
    format: '10 章节 + 附录的可下载 Word/Markdown',
    example: '# 友发钢管 · 项目洞察报告\n\n## 执行摘要\n总体健康度:黄 — UAT 阶段数据质量是最大隐患\n最大机会:打通国内/海外数据孤岛,LTC 全流程上线\n最大风险:8 个外部系统集成,接口延期会导致 LTC 闭不上 [D1]\n\n## 项目快照\n...',
  },
  {
    key: 'module_states',
    label: '逐章质量评级',
    source: '打分员 + 挑战员',
    format: '每章状态 + 4 维度分数 + 待补 issue',
    example: '执行摘要:通过\n健康度雷达:待提升 — 证据维度只 2 分(缺数据来源)\n  · 待补: 6 维度 RAG 评分未引用具体访谈或文档\n  · 待补: 下一步建议无责任人 + 截止日期',
  },
  {
    key: 'provenance',
    label: '出处溯源',
    source: '出处管家',
    format: '每个 D/K/W 角标对应的原文档 / 章节 / URL',
    example: '[D1] = SOW.docx 第 3 章「实施范围」\n[D5] = 业务交接单.docx 「数据迁移待办」段落\n[K3] = 知识库「智能制造 CRM 典型实施周期」案例片段\n[W1] = 工信部 2024 年制造业数字化白皮书 P12',
  },
  {
    key: 'challenge_summary',
    label: '挑战记录',
    source: '挑战员',
    format: '挑战轮数 + 最终评判 + 剩余 issue',
    example: '共跑 2 轮挑战\n第 1 轮:发现 4 个重大问题(缺引用 / 自相矛盾各 2 个),重生成 3 章节\n第 2 轮:通过,只剩 1 个 minor issue(术语不统一)',
  },
  {
    key: 'ask_user',
    label: '待你补充的信息',
    source: '体检员',
    format: '问题清单 + 选项',
    example: '关键模块「执行摘要」需要补:\n  · 项目当前态势是?(单选)A. 大型集团扩张 B. 现有 CRM 替换 C. 多业态整合\n  · 您认为最大的难点是什么?(开放题)',
  },
  {
    key: 'validity',
    label: '整体合格性',
    source: '体检员 + 挑战员综合',
    format: '通过 / 部分通过 / 信息不足',
    example: '通过 — 全部关键章节都通过质量审核,可直接交付\n部分通过 — 整体可交付,但有 N 项细节待顾问补全\n信息不足 — 关键资料缺失,系统未生成报告,需补充信息后重试',
  },
  {
    key: 'docx',
    label: 'Word 文档',
    source: '系统自动生成',
    format: '.docx 文件',
    example: '点报告页面右上角「下载」 — 浏览器直接下载格式好的 Word 文件,标题 / 表格 / 引用全保留',
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

function MockDocChecklist() {
  const required = [
    { label: 'SOW(项目范围说明书)', uploaded: true,  filename: '友发钢管 SOW.docx' },
    { label: '系统集成方案',         uploaded: true,  filename: '友发钢管 集成方案.pdf' },
    { label: '商务合同',             uploaded: true,  filename: '商务合同 v3.pdf' },
    { label: '业务交接单',           uploaded: true,  filename: '友发钢管 交接单.docx' },
    { label: '干系人组织架构',       uploaded: false, filename: null },
    { label: '售前调研报告',         uploaded: false, filename: null },
    { label: '售前方案 PPT',         uploaded: false, filename: null },
  ]
  const virtuals = [
    { label: '成功指标问卷',  filled: false },
    { label: '风险预警清单',  filled: true },
  ]
  const reqDone = required.filter(r => r.uploaded).length
  const reqTotal = required.length

  return (
    <div className="grid grid-cols-12 gap-3">
      {/* 左栏:文档清单 */}
      <div className="col-span-4 bg-white border border-line rounded-lg overflow-hidden shadow-sm">
        <div className="px-3 py-2 border-b border-line bg-slate-50">
          <div className="text-[11px] text-ink-muted">资料清单</div>
          <div className="text-xs text-ink mt-0.5">必备 {reqDone} / {reqTotal} · 虚拟物 1 / 2</div>
        </div>
        <div className="p-2 space-y-1 text-xs">
          <div className="text-[10px] text-ink-muted px-1 mt-1 mb-0.5">必备(系统读这些写画像)</div>
          {required.map((r, i) => (
            <div key={i} className={`flex items-center gap-2 px-2 py-1.5 rounded ${r.uploaded ? 'bg-emerald-50/60' : 'bg-slate-50/60'}`}>
              {r.uploaded ? (
                <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
              ) : (
                <span className="w-3 h-3 rounded-full border-2 border-slate-300 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className={`truncate ${r.uploaded ? 'text-ink' : 'text-ink-muted'}`}>{r.label}</div>
                {r.uploaded && r.filename && (
                  <div className="text-[10px] text-ink-muted truncate">{r.filename}</div>
                )}
              </div>
              {!r.uploaded && (
                <button className="text-[10px] text-orange-700 px-1.5 py-0.5 rounded border border-orange-200 hover:bg-orange-50 shrink-0">+ 上传</button>
              )}
            </div>
          ))}
          <div className="text-[10px] text-ink-muted px-1 mt-2 mb-0.5">虚拟物(一些问卷,顾问填)</div>
          {virtuals.map((v, i) => (
            <div key={i} className={`flex items-center gap-2 px-2 py-1.5 rounded ${v.filled ? 'bg-emerald-50/60' : 'bg-amber-50/60'}`}>
              {v.filled ? (
                <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle size={12} className="text-amber-600 shrink-0" />
              )}
              <span className={`flex-1 truncate ${v.filled ? 'text-ink' : 'text-ink-muted'}`}>{v.label}</span>
              {!v.filled && (
                <button className="text-[10px] text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 hover:bg-amber-50 shrink-0">填写</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 中栏:Hero + 大按钮 */}
      <div className="col-span-8 bg-white border border-line rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-5 flex items-start gap-4 border-b border-line"
             style={{ background: 'linear-gradient(to right, #FFF7ED 0%, #FFFFFF 60%)' }}>
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
               style={{ background: BRAND_GRAD }}>
            <Lightbulb size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-ink">项目洞察(新版)</h2>
            <p className="text-xs text-ink-muted mt-1 leading-relaxed">
              基于上传文档自动生成 360° 项目画像。<br/>
              把左栏文档清单补齐,系统会从文档抽取信息并标注每段来源。
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-extrabold tabular-nums text-orange-600">
              {reqDone}<span className="text-sm text-ink-muted font-normal"> / {reqTotal}</span>
            </div>
            <div className="text-[11px] text-ink-muted">必备资料</div>
          </div>
        </div>
        <div className="px-6 py-4">
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
            <div className="h-full rounded-full" style={{ width: `${reqDone / reqTotal * 100}%`, background: BRAND_GRAD }} />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-secondary flex-1">
              还差 {reqTotal - reqDone} 项必备资料(左栏补齐),也可以直接点开始生成
            </span>
            <button className="flex items-center justify-center gap-2 px-5 py-2 text-white rounded-lg text-sm font-semibold"
                    style={{ background: BRAND_GRAD }}>
              <Sparkles size={13} /> 开始生成
            </button>
          </div>
        </div>
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

// ── Mock 生成进度卡(跟工作台 GenerationProgressCard 1:1 视觉对齐) ──────

function MockGenerationProgress() {
  const stages = [
    { key: 'planning',    label: '规划',   color: '#3B82F6', done: true },
    { key: 'executing',   label: '生成',   color: '#8B5CF6', done: true },
    { key: 'critiquing',  label: '打分',   color: '#0EA5E9', done: true },
    { key: 'challenging', label: '挑战',   color: '#D96400', current: true },
    { key: 'regenerating',label: '重生成', color: '#F59E0B', done: false },
    { key: 'finalizing',  label: '入库',   color: '#10B981', done: false },
  ]
  return (
    <div className="rounded-xl border border-line bg-white shadow-sm overflow-hidden">
      {/* 顶部 Hero 区 */}
      <div className="px-5 py-4 flex items-start gap-3"
           style={{ background: 'linear-gradient(to right, #FFF7ED 0%, #FFFFFF 60%)' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 relative"
             style={{ background: BRAND_GRAD }}>
          <ShieldAlert size={18} className="text-white" />
          <Loader2 size={42} className="absolute inset-0 m-auto text-white/40 animate-spin" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-base font-bold text-ink">正在生成项目洞察</h2>
            <span className="px-1.5 py-0.5 text-[10px] rounded-full font-medium bg-orange-100 text-[#D96400]">挑战</span>
            <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-purple-100 text-purple-700 font-medium">第 1/3 轮挑战</span>
          </div>
          <div className="text-xs text-ink-secondary">第 1 轮:🚫 严重问题 · M3 健康度雷达和 M7 RAID 数据缺引用,正在重生成…</div>
        </div>
      </div>

      {/* 阶段进度条 */}
      <div className="px-5 py-3 border-t border-line bg-slate-50/40">
        <div className="flex items-center gap-1">
          {stages.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                s.done ? 'text-white' : s.current ? 'text-white ring-2 ring-orange-200' : 'bg-slate-100 text-ink-muted'
              }`} style={{ background: s.done || s.current ? s.color : undefined }}>
                {s.done ? '✓' : i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-[11px] font-medium truncate ${s.current ? 'text-ink' : s.done ? 'text-ink-secondary' : 'text-ink-muted'}`}>{s.label}</div>
              </div>
              {i < stages.length - 1 && <ChevronRight size={10} className="text-ink-muted shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      {/* 重生成中的模块 chip */}
      <div className="px-5 py-3 border-t border-line">
        <div className="text-[11px] text-ink-muted mb-1.5">正在重生成的章节</div>
        <div className="flex flex-wrap gap-1.5">
          {['M3 健康度雷达', 'M7 RAID 表'].map(m => (
            <span key={m} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded bg-orange-50 text-orange-700 border border-orange-200">
              <Loader2 size={9} className="animate-spin" /> {m}
            </span>
          ))}
        </div>
      </div>

      <div className="px-5 py-2 border-t border-line bg-slate-50/40 text-[11px] text-ink-muted">
        典型耗时 1-3 分钟。挑战循环最多 3 轮,通过后入库。整个过程 PM 不需要操作,等通知就行。
      </div>
    </div>
  )
}

// ── 样式预览:报告样本 ────────────────────────────────────────────────────────

function CitationBadge({ id }: { id: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded text-[10px] font-mono font-semibold bg-orange-100 text-orange-700 hover:bg-orange-200 cursor-pointer transition" title={`点击在右栏看 ${id} 的原文`}>
      {id}
    </span>
  )
}

function MockReportSnippet() {
  return (
    <div className="space-y-3">
      {/* 顶部:质量评审 banner(默认折叠样) */}
      <div className="px-3 sm:px-4 py-2 border-b bg-sky-50 border-sky-200 rounded-lg">
        <div className="flex items-center gap-2">
          <ChevronRight size={12} className="text-sky-700 shrink-0" />
          <ShieldAlert size={13} className="text-sky-700 shrink-0" />
          <span className="text-xs font-semibold text-sky-700">整体可交付 · 4 项细节待补</span>
          <span className="text-[10px] text-ink-muted ml-1">· 挑战 2 轮</span>
          <span className="flex-1" />
          <button className="shrink-0 flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md border border-sky-300 text-sky-700 bg-white hover:bg-sky-100">
            <Sparkles size={10} /> 重新生成
          </button>
        </div>
      </div>

      {/* 模块 M1 */}
      <div className="bg-white border border-line rounded-lg p-5">
        <div className="text-[11px] text-ink-muted mb-2">M1 · 执行摘要</div>
        <div className="text-sm text-ink leading-relaxed space-y-2">
          <p><strong className="text-red-700">总体健康度:黄</strong>。集团化 CRM 实施已进入 UAT 前期,
            <strong>方案设计阶段已完成,最大风险转移到推广阶段</strong>。</p>
          <ul className="list-disc list-inside space-y-1 text-ink-secondary">
            <li>5 家子公司业务差异大,统一方案 + 差异化配置策略已经确认<CitationBadge id="D1" /><CitationBadge id="D4" /></li>
            <li>奖惩制度刚性(配套 25 万实施奖金 + 奖一罚二),推广采纳率是头号变量<CitationBadge id="D2" /></li>
            <li>历史数据迁移工作量评估不足,可能影响上线节奏<CitationBadge id="K3" /></li>
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
              <td className="p-2">范围蔓延:子公司提新需求,镀金风险<CitationBadge id="D1" /></td>
              <td className="p-2"><span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-100 text-red-700">高</span></td>
              <td className="p-2"><span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-100 text-amber-700">中</span></td>
              <td className="p-2 text-ink-secondary">变更走 PMO 评审,纳入二期 backlog</td>
              <td className="p-2 text-ink-muted">徐广友 / 钟鼐</td>
            </tr>
            <tr>
              <td className="p-2">推广阻力:一线销售抵触新系统<CitationBadge id="D2" /><CitationBadge id="K2" /></td>
              <td className="p-2"><span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-100 text-red-700">高</span></td>
              <td className="p-2"><span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-100 text-red-700">高</span></td>
              <td className="p-2 text-ink-secondary">实施顾问驻场 2 周 + 商机更新及时率纳入考核</td>
              <td className="p-2 text-ink-muted">交付 PM</td>
            </tr>
            <tr>
              <td className="p-2">数据迁移:历史数据口径不清<CitationBadge id="D4" /><CitationBadge id="K3" /></td>
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
              <div className="font-medium">本周对齐数据迁移责任人 + 标准 + 时间表<CitationBadge id="D4" /></div>
              <div className="text-[11px] text-ink-muted">Owner:客户 IT · Deadline:2026-05-02 · 预期产出:迁移启动会纪要 + 责任人清单</div>
            </div>
          </li>
          <li className="flex gap-2">
            <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">UAT 前对齐 5 家子公司差异化配置点<CitationBadge id="D1" /></div>
              <div className="text-[11px] text-ink-muted">Owner:实施顾问 · Deadline:2026-05-09 · 预期产出:差异点清单 + 子公司确认书</div>
            </div>
          </li>
          <li className="flex gap-2">
            <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">启动「商机更新及时率」纳入销售月度考核<CitationBadge id="K1" /></div>
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
