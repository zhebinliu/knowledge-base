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
  Workflow, Database, Cog, Layers, FileSearch, Boxes, ShieldAlert,
} from 'lucide-react'
import {
  PipelineDiagram, ArchitectureDiagram, IOTable,
  type PipelineStage, type ArchLayer, type IORow,
} from './_demo_diagrams'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

export default function SurveyDemo() {
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
          <span className="text-sm font-semibold text-ink">调研问卷(新版)</span>
        </div>
      </div>

      {/* Hero */}
      <div className="max-w-[1500px] mx-auto px-8 sm:px-12 pt-12 pb-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-700">新版 · 内测</span>
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-orange-100 text-[#D96400]">智能体</span>
        </div>
        <h1 className="text-3xl font-extrabold text-ink tracking-tight">需求调研 — 顾问拿大纲口头问、系统勾选录入的工作台</h1>
        <p className="mt-3 text-ink-secondary text-base leading-relaxed">
          需求调研不是发问卷给客户填,是<strong>顾问主导引导式访谈 + 当场在系统里勾选答案</strong>。
          系统按华为 LTC 标准流程(线索 / 商机 / 报价 / 合同 / 订单 / 履约 / 应收 / 服务)自动生成调研问卷,
          每题预填好选项池,顾问只需点选,不用现场打字。答完每个模块,AI 还会自动判定每条需求的范围:
          <strong className="text-ink"> 需新建 / 已有线下需数字化 / 已有需搬迁 / 不纳入一期</strong>,
          直通蓝图设计阶段。
        </p>

        <div className="mt-8 p-4 bg-orange-50 border-l-4 border-orange-400 rounded-r-lg">
          <div className="text-sm font-semibold text-[#92400E] mb-1">用「友发钢管集团」走一遍</div>
          <div className="text-xs text-ink-secondary">
            背景:智能制造行业 · 集团 + 5 家子公司 · 之前项目洞察阶段已经摸清 SOW 范围、关键风险、决策链。<br/>
            本期 PM 要带着调研工作台跟业务方做 4-5 场访谈,把 LTC 全流程的现状、痛点、范围归属问清楚,直接交付给方案设计组。
          </div>
        </div>
      </div>

      {/* ── 流程图 ── */}
      <PipelineDiagram
        title="生成流程"
        description="调研工作台分两个产物 — 调研大纲(顾问拿着上现场)+ 调研问卷(顾问勾选式录入)。下面是问卷生成的端到端流水线,大纲流程类似但少了结构化题目环节。"
        stages={SURVEY_PIPELINE}
      />

      {/* ── 架构图 ── */}
      <ArchitectureDiagram
        title="模块架构"
        description="跟项目洞察共用 agent v3 框架(Planner / Executor / Critic)。新增 LTC 字典 + SOW 同义词归一 + 客户自定义模块支持,让问卷题目按 LTC 流程组织,顾问按模块切换录入答案。"
        layers={SURVEY_ARCH_LAYERS}
      />

      {/* ── 输入产物 ── */}
      <IOTable
        title="输入产物 — 系统会读什么"
        variant="input"
        description="调研问卷生成时,自动读项目文档 + 上游 outline 的 LTC 模块映射 + 历史访谈,LLM 据此为每个 LTC 模块生成结构化题目 + 选项池。"
        rows={SURVEY_INPUTS}
      />

      {/* ── 输出产物 ── */}
      <IOTable
        title="输出产物 — 你会拿到什么"
        variant="output"
        description="生成完毕后,顾问在工作区按 LTC 模块切换,看到结构化题目(单选/多选/分级…),勾选式录入答案。每模块录完可触发 AI 范围四分类。"
        rows={SURVEY_OUTPUTS}
      />

      {/* ── 实操走查 ── */}
      <div className="max-w-[1500px] mx-auto px-8 sm:px-12 pt-16 pb-2">
        <h2 className="text-2xl font-bold text-ink">实操走查</h2>
        <p className="text-sm text-ink-secondary mt-2">下面用「友发钢管」走一遍完整界面。</p>
      </div>

      {/* Step 1 — 进入工作台 */}
      <Step n={1} title="进入项目,顶部阶段栏切到「需求调研(新版)」">
        <p className="text-sm text-ink-secondary mb-3">
          看到调研工作台是 <strong>三栏布局</strong>:左栏是 LTC 13 个模块清单(SOW 命中标橙点 / 客户自定义标紫点),
          中栏切换"准备 / 调研大纲 / 调研问卷(录入)"三个视图,右栏放参考资料(默认收起)。
        </p>
        <MockStageBar />
      </Step>

      {/* Step 2 — 生成大纲 */}
      <Step n={2} title="点「调研大纲」生成,拿到顾问上现场用的工作底稿">
        <p className="text-sm text-ink-secondary mb-3">
          系统读完所有项目资料 + 项目洞察输出 + 行业 knowhow,自动排出 4-6 场访谈日程,
          每场列清楚<strong> 时间 / 时长 / 议题 / 受访方 / 我方参与人 / 客户准备材料 / 我方准备物 / 交付物</strong>。
          顾问拿这份大纲跟客户对齐档期、准备材料、明确交付预期。
        </p>
        <MockOutlineSnippet />
      </Step>

      {/* Step 3 — 生成问卷 */}
      <Step n={3} title="点「调研问卷」生成,系统按 LTC 模块写题 + 选项池预填">
        <p className="text-sm text-ink-secondary mb-3">
          系统按 LTC 13 个模块 + 客户自定义模块,分别写题。<strong>每题预填详细选项池</strong>,
          顾问只需点选不用现场打字。题型混合(单选 60% / 多选 / 分级 / 数值 / 短文本 / 流程节点勾选),
          单选/多选必含「其他」「不适用」兜底。
        </p>
        <MockQuestionnaireSnippet />
      </Step>

      {/* Step 4 — 顾问录入 */}
      <Step n={4} title="顾问按模块切换,拿大纲口头问、系统勾选录入">
        <p className="text-sm text-ink-secondary mb-3">
          这是工作台的核心交互 — 顾问按访谈节奏 <strong>边问边勾</strong>。
          点左栏 LTC 模块切换,中栏显示该模块所有题目,顾问勾完一个模块再切下一个。
          每改一次自动保存,断网 / 关页面也不丢。
        </p>
        <MockResearchWorkspace />
      </Step>

      {/* Step 5 — 范围分类 */}
      <Step n={5} title="答完一个模块,点「触发 AI 范围分类」直通蓝图">
        <p className="text-sm text-ink-secondary mb-3">
          顾问录完一个 LTC 模块后,点工具栏「触发 AI 范围分类」。AI 综合(SOW + 项目洞察 + 答案)
          给每题打 <strong>4 个标签 — 需新建 / 已有线下需数字化 / 已有需搬迁 / 不纳入一期</strong>。
          这些标签直接交付方案设计组,蓝图阶段不用再梳理一遍。
        </p>
        <MockScopeClassify />
      </Step>

      {/* CTA */}
      <div className="max-w-[1500px] mx-auto px-8 sm:px-12 py-12">
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
      <div className="max-w-[1500px] mx-auto px-8 sm:px-12 pb-16">
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

// ── 流程 / 架构 / IO 数据常量 ──────────────────────────────────────────────

const SURVEY_PIPELINE: PipelineStage[] = [
  {
    key: 'ctx_load',
    label: '收集资料',
    short: '读项目文档 + 项目洞察输出 + 历史访谈',
    detail: '系统从项目里收集所有相关资料:你上传的 SOW / 集成方案 / 售前材料(全文,不切片);项目洞察阶段已经识别的关键发现 / 风险议题 / 干系人画像;之前跟客户的访谈记录(避免在问卷里重复问已聊过的)。',
    color: 'blue',
    icon: <Database size={14} />,
  },
  {
    key: 'sow_map',
    label: '识别 SOW 模块',
    short: '把 SOW 里"商机机会管理 / 招议标"对齐到 LTC 标准模块',
    detail: '客户在 SOW 里写的术语千奇百怪 — "商机机会管理"、"招议标"、"渠道商管理"。系统让 AI 把这些客户原文挨个映射到华为 LTC 标准模块(M01 线索 / M02 商机 / M03 报价投标 等),映射不上的标记为"客户自定义模块"。这样问卷题目按 LTC 流程组织,顾问 / 蓝图组都看得懂。',
    color: 'blue',
    icon: <Workflow size={14} />,
  },
  {
    key: 'kb_filter',
    label: '查行业 knowhow',
    short: '从知识库召回行业最佳实践,LLM 二次评分,只留高分注入',
    detail: '系统从知识库找跟当前 LTC 模块 + 行业相关的最佳实践片段。但 KB 内容质量参差,所以 AI 会再做一次评分(0-10 分),只把 ≥7 分的高质量片段注入 prompt。低分的展示给顾问 review,可手动剔除。',
    color: 'orange',
    icon: <FileSearch size={14} />,
  },
  {
    key: 'gen_outline',
    label: '写调研大纲',
    short: '生成 9 列日程表 + 客户准备材料清单 + 团队分工',
    detail: '调研大纲是顾问拿着上现场的工作底稿。系统输出 9 列日程表(时间 / 时长 / 议题 / 受访方 / 我方参与人 / 客户准备材料 / 我方准备材料 / 交付物 / 备注),每场访谈一行;另外列出客户该提前准备的材料清单 + 我方调研团队分工。',
    color: 'purple',
    icon: <ClipboardList size={14} />,
  },
  {
    key: 'gen_questions',
    label: '写问卷题目',
    short: '按 LTC 模块写题,每题预填选项池(单选/多选/分级)',
    detail: '系统按 LTC 13 模块(8 主流程 + 5 横向支撑 + N 客户自定义)分别写题。题型混合:60% 单选/多选(必含「其他」「不适用」兜底)+ 15% 分级(1-5 分)+ 10% 数值 + 10% 短文本 + 5% 流程节点勾选。**选项池预填得详细到顾问只需点选,不用现场打字**。',
    color: 'purple',
    icon: <Workflow size={14} />,
  },
  {
    key: 'persist',
    label: '入库展示',
    short: '问卷写入数据库,顾问在工作区按 LTC 模块切换录入',
    detail: '所有题目结构化存储。顾问进调研工作台:左栏是 LTC 13 模块清单(SOW 命中标橙点,客户自定义标紫点),点某个模块,中栏显示该模块下所有题目;顾问按口头访谈节奏勾选答案,每改一次自动保存。',
    color: 'emerald',
    icon: <Boxes size={14} />,
  },
  {
    key: 'scope',
    label: 'AI 范围分类',
    short: '答完一模块,AI 给每题打范围 4 分类 — 需新建 / 数字化 / 搬迁 / 不纳入',
    detail: '顾问录完一个 LTC 模块的全部题目后,点「触发 AI 范围分类」。AI 综合(SOW + 项目洞察 + 答案 + 行业 knowhow)给每题打 4 分类标签:**需新建**(客户从 0 开始)/ **已有线下需数字化** / **已有需搬迁**(老 CRM/ERP 模块迁过来)/ **不纳入一期**。顾问可手改,标签直接交付给方案设计阶段。',
    color: 'emerald',
    icon: <ShieldAlert size={14} />,
  },
]

const SURVEY_ARCH_LAYERS: ArchLayer[] = [
  {
    key: 'input',
    label: '第一层 — 系统会读什么',
    color: 'blue',
    components: [
      { name: '项目文档', description: 'SOW(项目范围说明书)、集成方案、售前调研报告、合同等。重要文档喂全文给 AI,不切片漏条款。' },
      { name: '项目洞察输出', description: '上一阶段(项目洞察)生成的关键发现 / 风险议题 / 干系人画像 / 决策链。AI 据此个性化问卷题目和选项。' },
      { name: '历史访谈记录', description: '之前跟客户的对话记录。系统会去重,避免在问卷里重复问已聊过的话题。' },
      { name: '行业 knowhow', description: '跨项目沉淀的行业最佳实践、典型流程模板。AI 二次评分后注入,确保题目针对性。' },
      { name: 'LTC 标准字典', description: '华为 LTC 端到端 — 8 主流程(线索 / 商机 / 报价 / 合同 / 订单 / 履约 / 应收 / 服务) + 5 横向(客户 / 产品 / 渠道 / 市场 / 集成),每模块带标准节点序列。' },
      { name: '行业模板', description: '智能制造 / 金融 等行业差异化模板,系统自动激活,加客户行业专属调研题。' },
    ],
  },
  {
    key: 'engine',
    label: '第二层 — AI 引擎做什么',
    color: 'orange',
    components: [
      { name: 'SOW 翻译员', description: '把客户在 SOW 里写的"商机机会管理 / 招议标"等说法,挨个映射到 LTC 标准模块。映射不上的当作客户自定义模块单独跟踪。' },
      { name: '大纲编排员', description: '基于干系人 + LTC 模块,排出 4-6 场访谈日程表(时间 / 受访方 / 议题 / 准备材料),给顾问当工作底稿。' },
      { name: '出题员', description: '按 LTC 模块写问卷题目,每题预填详细选项池(顾问只需点选不用现场打字)。题型按 6:2:1:1 比例混合。' },
      { name: '选项池兜底', description: '所有单选/多选题自动加「其他(请说明)」+「不适用」,确保选项穷举,顾问遇到选项不全时不卡壳。' },
      { name: '范围判定员', description: '答完一个模块后,AI 综合判定每条需求的实施范围归属(需新建 / 数字化 / 搬迁 / 不纳入),直通蓝图设计。' },
      { name: 'KB 过滤员', description: '行业 knowhow 召回后再做一次 AI 评分,只留高质量片段(≥7 分)注入 prompt,低分给顾问 review 决定要不要用。' },
    ],
  },
  {
    key: 'config',
    label: '第三层 — 运营可改什么',
    color: 'purple',
    components: [
      { name: '原子技能库', description: '强制中文输出 / 6 题型规范 / 严格 JSON 输出 / Markdown 表格规范 / LTC 流程骨架 等可组合技能,后台可编辑。' },
      { name: 'LTC 标准字典', description: '13 模块的别名(同义词归一用)、标准节点、典型选项池骨架。下期可迁后台让运营增删。' },
      { name: '行业模板', description: '智能制造 / 金融 / 零售 等行业的差异化调研题模板,运营可在内置基础上扩展。' },
      { name: '输出代理配置', description: '调研大纲 / 调研问卷 各自用什么 AI 模型 / 启用哪些技能,后台可调。' },
    ],
  },
  {
    key: 'output',
    label: '第四层 — 你会拿到什么',
    color: 'emerald',
    components: [
      { name: '调研大纲', description: '9 列日程表 + 客户准备材料清单 + 团队分工。可下载 Word,顾问拿着上现场。' },
      { name: '结构化问卷', description: '13 个 LTC 模块 + N 个客户自定义模块,每模块 5-15 道题 + 选项池,顾问按模块切换录入。' },
      { name: '顾问答案', description: '每题的勾选 / 数值 / 文本答案,自动保存,可重看可修改。' },
      { name: '范围 4 分类', description: '每条需求标:需新建 / 数字化 / 搬迁 / 不纳入。直接交付方案设计组,蓝图组省一道梳理工作。' },
      { name: 'Word 下载', description: '调研大纲 + 调研问卷都可下载格式好的 Word,归档 / 内部对齐 / 跟客户确认。' },
    ],
  },
]

const SURVEY_INPUTS: IORow[] = [
  {
    key: 'docs',
    label: '项目文档',
    source: '顾问上传',
    format: 'PDF / Word 自动转 Markdown',
    example: '友发钢管 SOW.docx — 实施范围:客户 / 商机 / 报价 / 合同 / 订单 / 应收 6 大模块 + 渠道分级\n友发钢管 集成方案.pdf — 接 用友 NC ERP / 钉钉 OA / 飞书\n友发钢管 售前调研报告.docx — 五子公司业务差异、KPI 体系',
  },
  {
    key: 'insight',
    label: '项目洞察输出',
    source: '上一阶段生成',
    format: '关键发现 / 风险 / 干系人 / 决策链',
    example: '关键发现:5 子公司渠道结构差异大,需差异化报价审批\n关键风险:数据迁移工作量评估不足\n关键干系人:钟鼐(集团 IT)、徐广友(集团 PMO)\n决策链:徐广友 + 张总联合拍板',
  },
  {
    key: 'transcript',
    label: '历史访谈',
    source: '系统访谈机器人',
    format: '已聊话题列表',
    example: '已聊:组织架构、KPI 口径、商机阶段定义、渠道分级、奖惩制度\n→ 这些话题在问卷里 AI 会主动跳过,避免客户重复填',
  },
  {
    key: 'kb',
    label: '知识库 knowhow',
    source: '跨项目沉淀',
    format: '行业实践片段',
    example: '"智能制造行业 LTC 实施关键议题清单" — 来自 3 个同行业历史项目\n"项目型销售的报备机制设计要点" — 来自 KB 行业制度库',
  },
  {
    key: 'ltc_dict',
    label: 'LTC 标准字典',
    source: '系统内置',
    format: '13 模块 + 别名 + 节点池',
    example: 'M02 商机管理(别名:商机 / 机会 / Opportunity / 销售机会 / 商机阶段)\n  标准节点:商机创建 → 阶段推进 → 决策链分析 → 客户拜访 → 竞争分析 → 赢率评估 → 战败/搁置 → 复盘',
  },
]

const SURVEY_OUTPUTS: IORow[] = [
  {
    key: 'outline',
    label: '调研大纲',
    source: '系统生成',
    format: '9 列日程表 + 材料清单 + 团队分工',
    example: '| 时间 | 时长 | 议题 | 受访方 | 我方 | 客户准备材料 | 我方准备 | 交付物 | 备注 |\n| Week1 周二上午 | 3h | 销售流程现状 | 销售 VP + 大区经理 | PM 主访 + 顾问记录 | 销售流程图、商机模板、考核办法 | 议程、对标问卷、行业案例 | 访谈纪要 + 现状描述 | 提前发议程 |',
  },
  {
    key: 'questionnaire',
    label: '结构化问卷',
    source: '系统生成',
    format: '按 LTC 模块的题目数组(单选/多选/分级…)',
    example: 'M02 商机管理 · 题 1(单选):你们目前用哪种商机阶段模型?\n  选项:A. 华为 LTC 6 阶段 / B. MEDDIC / C. BANT / D. 自定义 / E. 其他(请说明) / F. 不适用\n  为什么问:阶段模型决定 CRM 商机推进逻辑\n  答案怎么用:落地到系统阶段配置',
  },
  {
    key: 'responses',
    label: '顾问答案',
    source: '顾问勾选录入',
    format: '每题答案 + 时间戳',
    example: 'M02::stage_model = "C. BANT"(2026-05-01 14:23 由 PM 张三录入)\nM02::pain_points = ["阶段定义模糊", "决策链不清", "缺少预警"]\nM02::data_completeness = 3/5',
  },
  {
    key: 'scope',
    label: '范围 4 分类',
    source: 'AI 自动判定 + 顾问可改',
    format: '每条需求一个标签',
    example: 'M02::stage_model → 已有需搬迁(客户用 BANT,新系统用华为 LTC 6 阶段,数据需迁移映射)\nM02::pain_points → 需新建(分卷预警机制客户当前没有)\nM05::order_split → 不纳入一期(订单拆单逻辑过于客户特定,留二期)',
  },
  {
    key: 'docx',
    label: 'Word 下载',
    source: '系统自动生成',
    format: '.docx 文件',
    example: '调研大纲.docx + 调研问卷(空白版).docx + 调研问卷(已答版).docx — 三种格式分别用于现场访谈、客户回填、归档',
  },
]


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

// ── Mock 调研大纲 9 列日程表 ─────────────────────────────────────────────────

function MockOutlineSnippet() {
  const sessions = [
    { time: 'W1 周二上午', dur: '3h', topic: '销售流程现状(线索 → 商机 → 报价 → 合同)', target: '销售 VP + 大区经理', material: '现有销售流程图、商机模板、考核办法', deliverable: '访谈纪要 + 现状描述' },
    { time: 'W1 周二下午', dur: '2h', topic: '订单履约与产销协同', target: '运营总监 + 计划员', material: '订单流程、ERP 截图、产销会纪要', deliverable: '现状 + 痛点清单' },
    { time: 'W1 周三上午', dur: '3h', topic: '应收回款 + 财务集成', target: 'CFO + 应收主管', material: '应收台账、催收办法、银企对账', deliverable: '现状 + 集成需求' },
    { time: 'W1 周三下午', dur: '2h', topic: '渠道管理(经销商 + 五大六小)', target: '渠道总监', material: '渠道分级表、合同模板、返利政策', deliverable: '渠道结构图 + 政策清单' },
    { time: 'W2 周一全天', dur: '6h', topic: 'IT 集成 + 数据治理', target: 'IT 总监 + 数据架构师', material: '系统拓扑图、ERP 字段表、主数据现状', deliverable: '集成需求 + 数据清洗范围' },
    { time: 'W2 周二上午', dur: '2h', topic: '战略对齐 + 决策链', target: '集团总裁 + CIO', material: '集团 KPI、过往 IT 项目复盘', deliverable: '战略意图共识备忘' },
  ]
  const materials = [
    { cat: '组织',     items: ['集团-子公司组织图', '销售/IT/运营 部门架构 + 关键人岗位'], owner: '客户 PMO',   due: 'W1 周一前' },
    { cat: '业务流程', items: ['销售流程图(线索→签约)', '订单履约流程', '应收催收流程'], owner: '客户业务',   due: 'W1 周一前' },
    { cat: '数据',     items: ['客户 / 商机 / 订单 字段表(含主数据)', 'ERP 字段映射'],   owner: '客户 IT',    due: 'W1 周三前' },
    { cat: '系统',     items: ['ERP / OA / IM 系统拓扑', 'API 文档 / 集成现状'],          owner: '客户 IT',    due: 'W1 周三前' },
    { cat: '制度',     items: ['销售考核办法', '渠道返利政策', '内控审批制度'],           owner: '客户 HR / 财务', due: 'W1 周二前' },
  ]
  return (
    <div className="space-y-3">
      <div className="bg-white border border-line rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-line bg-slate-50 flex items-center gap-2">
          <ClipboardList size={13} className="text-orange-600" />
          <span className="text-sm font-semibold text-ink">访谈日程表(6 场 · 共 18 小时)</span>
          <span className="ml-auto text-[11px] text-ink-muted">直接发给客户 PMO 对齐档期</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50/60">
              <tr className="text-left text-ink-muted">
                <th className="px-3 py-2 font-semibold">时间</th>
                <th className="px-2 py-2 font-semibold">时长</th>
                <th className="px-2 py-2 font-semibold">议题</th>
                <th className="px-2 py-2 font-semibold">受访方</th>
                <th className="px-2 py-2 font-semibold">客户准备材料</th>
                <th className="px-2 py-2 font-semibold">交付物</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sessions.map((s, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 text-ink whitespace-nowrap">{s.time}</td>
                  <td className="px-2 py-2 text-ink-muted whitespace-nowrap">{s.dur}</td>
                  <td className="px-2 py-2 text-ink">{s.topic}</td>
                  <td className="px-2 py-2 text-ink-secondary">{s.target}</td>
                  <td className="px-2 py-2 text-ink-muted">{s.material}</td>
                  <td className="px-2 py-2 text-ink-secondary">{s.deliverable}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="bg-white border border-line rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-line bg-slate-50 flex items-center gap-2">
          <FileText size={13} className="text-blue-600" />
          <span className="text-sm font-semibold text-ink">客户准备材料清单(去重 + 按类别汇总)</span>
        </div>
        <table className="w-full text-xs">
          <tbody className="divide-y divide-line">
            {materials.map((m, i) => (
              <tr key={i}>
                <td className="px-3 py-2 align-top w-20">
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-blue-50 text-blue-700">{m.cat}</span>
                </td>
                <td className="px-2 py-2 text-ink">{m.items.join(' / ')}</td>
                <td className="px-2 py-2 text-ink-muted whitespace-nowrap w-28">{m.owner}</td>
                <td className="px-2 py-2 text-ink-muted whitespace-nowrap w-24">{m.due}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Mock 调研问卷题目示例 ───────────────────────────────────────────────────

function MockQuestionnaireSnippet() {
  return (
    <div className="bg-white border border-line rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-line bg-slate-50 flex items-center gap-2">
        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-orange-100 text-orange-700">M02</span>
        <span className="text-sm font-semibold text-ink">商机管理 · 共 12 题(节选 3 题)</span>
        <span className="ml-auto text-[11px] text-ink-muted">每题预填选项池,顾问只点选不打字</span>
      </div>
      <div className="p-5 space-y-4 text-xs">
        {/* 单选题 */}
        <div className="border-l-2 border-orange-300 pl-3">
          <div className="text-[10px] text-ink-muted mb-1">题 1 · 单选 · 必答</div>
          <div className="text-sm font-semibold text-ink mb-1.5">你们目前用哪种商机阶段模型?</div>
          <div className="text-[11px] text-ink-muted italic mb-2">为什么问:阶段模型决定 CRM 商机推进逻辑和赢率字段</div>
          <div className="space-y-1">
            {['华为 LTC 6 阶段', 'MEDDIC', 'BANT', '自定义阶段', '其他(请说明)', '不适用'].map((v, i) => (
              <label key={i} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 text-xs">
                <span className={`w-3 h-3 rounded-full border-2 ${i === 3 ? 'border-orange-500 bg-orange-500 ring-2 ring-orange-200' : 'border-slate-300'}`}>
                  {i === 3 && <span className="block w-1 h-1 bg-white rounded-full mx-auto mt-[1px]" />}
                </span>
                <span className={i === 3 ? 'text-orange-700 font-medium' : 'text-ink'}>{v}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 多选题 */}
        <div className="border-l-2 border-orange-300 pl-3">
          <div className="text-[10px] text-ink-muted mb-1">题 2 · 多选 · 必答</div>
          <div className="text-sm font-semibold text-ink mb-1.5">商机推进的最大卡点是什么?(可多选)</div>
          <div className="text-[11px] text-ink-muted italic mb-2">为什么问:找到核心痛点,决定 CRM 重点解决方向</div>
          <div className="space-y-1">
            {[
              { v: '阶段定义模糊', sel: true },
              { v: '决策链不清', sel: true },
              { v: '缺少预警', sel: true },
              { v: '赢率不准', sel: false },
              { v: '战败无复盘', sel: false },
              { v: '看板靠手工汇总', sel: false },
              { v: '其他(请说明)', sel: false },
              { v: '不适用', sel: false },
            ].map((o, i) => (
              <label key={i} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 text-xs">
                <span className={`w-3 h-3 rounded border-2 ${o.sel ? 'border-orange-500 bg-orange-500' : 'border-slate-300'} flex items-center justify-center`}>
                  {o.sel && <CheckCircle2 size={8} className="text-white" />}
                </span>
                <span className={o.sel ? 'text-orange-700 font-medium' : 'text-ink'}>{o.v}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 分级题 */}
        <div className="border-l-2 border-orange-300 pl-3">
          <div className="text-[10px] text-ink-muted mb-1">题 3 · 分级 · 必答</div>
          <div className="text-sm font-semibold text-ink mb-1.5">当前商机数据完整度如何?</div>
          <div className="text-[11px] text-ink-muted italic mb-2">1=极差(基本字段都缺) / 5=完整(所有字段齐全)</div>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} className={`w-7 h-7 rounded text-xs font-medium ${n <= 3 ? 'bg-orange-500 text-white' : 'bg-slate-100 text-ink-muted'}`}>{n}</button>
            ))}
            <span className="text-[11px] text-ink-muted ml-2">3 / 5 — 主数据齐,跟进字段散</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Mock 三栏调研工作台(LTC 模块切换 + 题目录入) ──────────────────────────

function MockResearchWorkspace() {
  const ltcModules = [
    { key: 'M01', label: '线索管理',   answered: 8,  hit: true,  selected: false },
    { key: 'M02', label: '商机管理',   answered: 12, hit: true,  selected: true },
    { key: 'M03', label: '报价投标',   answered: 5,  hit: true,  selected: false },
    { key: 'M04', label: '合同管理',   answered: 0,  hit: true,  selected: false },
    { key: 'M05', label: '订单管理',   answered: 0,  hit: true,  selected: false },
    { key: 'M06', label: '履约交付',   answered: 0,  hit: false, selected: false },
    { key: 'M07', label: '应收回款',   answered: 0,  hit: true,  selected: false },
    { key: 'M08', label: '售后服务',   answered: 0,  hit: false, selected: false },
    { key: 'S01', label: '客户管理',   answered: 6,  hit: true,  selected: false },
    { key: 'S03', label: '渠道管理',   answered: 0,  hit: true,  selected: false },
  ]
  const customer = ['测试服务管理', '硬件交付追溯']

  return (
    <div className="bg-white border border-line rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-line bg-slate-50 flex items-center gap-2 text-xs">
        <span className="text-ink-muted">本阶段产物:</span>
        <span className="px-2 py-0.5 rounded border border-emerald-300 text-emerald-700 bg-emerald-50">✓ 调研大纲</span>
        <span className="px-2 py-0.5 rounded border border-orange-300 text-orange-700 bg-orange-50 font-medium">● 调研问卷</span>
      </div>
      <div className="grid grid-cols-12 min-h-[420px]">
        {/* 左栏 LTC 模块 */}
        <div className="col-span-3 border-r border-line bg-slate-50/30 p-2 text-xs space-y-1 overflow-auto max-h-[420px]">
          <div className="text-[11px] text-ink-muted px-1 mb-1">LTC 流程模块  共 13 · SOW 涉及 8</div>
          {ltcModules.map(m => (
            <div key={m.key} className={`px-2 py-1.5 rounded flex items-center gap-1.5 ${m.selected ? 'bg-orange-50 ring-1 ring-orange-200 text-orange-700' : 'hover:bg-white text-ink'}`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.hit ? 'bg-orange-500' : 'bg-slate-300'}`} />
              <span className={m.selected ? 'font-medium' : ''}>{m.label}</span>
              <span className="text-[10px] text-ink-muted ml-auto shrink-0">{m.key}</span>
              {m.answered > 0 && (
                <span className="text-[10px] text-ink-muted shrink-0 bg-slate-100 px-1 rounded">{m.answered} 题</span>
              )}
            </div>
          ))}
          <div className="mt-2 pt-2 border-t border-line">
            <div className="text-[10px] text-ink-muted px-1 mb-1">SOW 客户自定义模块</div>
            {customer.map(c => (
              <div key={c} className="px-2 py-1.5 rounded flex items-center gap-1.5 hover:bg-white text-ink-secondary">
                <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-purple-400" />
                <span className="truncate">{c}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 中栏 题目录入 */}
        <div className="col-span-7 p-4 overflow-auto max-h-[420px] space-y-3">
          <div className="flex items-center gap-2 sticky top-0 bg-white pb-2 -mt-1 border-b border-line z-10">
            <span className="text-sm font-semibold text-ink">商机管理 · 12 题</span>
            <span className="text-xs text-ink-muted">已答 12 / 12</span>
            <button className="ml-auto text-xs px-2.5 py-1 rounded border border-line hover:bg-slate-50 text-ink-secondary">触发 AI 范围分类</button>
          </div>

          {/* 一道题示例 — 单选已答 */}
          <div className="border border-line rounded-lg p-3">
            <div className="flex items-baseline gap-2 mb-1.5">
              <span className="w-5 h-5 rounded text-[10px] bg-slate-100 text-ink-muted flex items-center justify-center">1</span>
              <span className="text-sm text-ink flex-1">你们目前用哪种商机阶段模型?</span>
              <span className="text-[10px] text-ink-muted">single</span>
            </div>
            <div className="ml-7 space-y-1">
              <label className="flex items-center gap-2 px-2 py-1 rounded text-xs">
                <span className="w-3 h-3 rounded-full border-2 border-orange-500 bg-orange-500 ring-2 ring-orange-200">
                  <span className="block w-1 h-1 bg-white rounded-full mx-auto mt-[1px]" />
                </span>
                <span className="text-orange-700 font-medium">自定义阶段</span>
                <span className="ml-auto text-[10px] text-emerald-600">已保存</span>
              </label>
              <div className="flex items-center gap-2 ml-2 mt-1.5 pt-1.5 border-t border-slate-100">
                <span className="text-[10px] px-1.5 py-0.5 rounded ring-1 bg-purple-50 text-purple-700 ring-purple-200">已有需搬迁(AI)</span>
              </div>
            </div>
          </div>

          {/* 一道题示例 — 多选已答 */}
          <div className="border border-line rounded-lg p-3">
            <div className="flex items-baseline gap-2 mb-1.5">
              <span className="w-5 h-5 rounded text-[10px] bg-slate-100 text-ink-muted flex items-center justify-center">2</span>
              <span className="text-sm text-ink flex-1">商机推进的最大卡点是什么?</span>
              <span className="text-[10px] text-ink-muted">multi</span>
            </div>
            <div className="ml-7 flex flex-wrap gap-1.5">
              {['阶段定义模糊', '决策链不清', '缺少预警'].map(v => (
                <span key={v} className="text-[11px] px-2 py-0.5 rounded bg-orange-50 text-orange-700 ring-1 ring-orange-200">{v}</span>
              ))}
              <div className="w-full mt-1.5 pt-1.5 border-t border-slate-100 flex items-center gap-2">
                <span className="text-[10px] px-1.5 py-0.5 rounded ring-1 bg-blue-50 text-blue-700 ring-blue-200">需新建(AI)</span>
              </div>
            </div>
          </div>

          {/* 一道题示例 — 分级已答 */}
          <div className="border border-line rounded-lg p-3">
            <div className="flex items-baseline gap-2 mb-1.5">
              <span className="w-5 h-5 rounded text-[10px] bg-slate-100 text-ink-muted flex items-center justify-center">3</span>
              <span className="text-sm text-ink flex-1">当前商机数据完整度?</span>
              <span className="text-[10px] text-ink-muted">rating</span>
            </div>
            <div className="ml-7 flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map(n => (
                <span key={n} className={`w-6 h-6 rounded text-[11px] flex items-center justify-center ${n <= 3 ? 'bg-orange-500 text-white' : 'bg-slate-100 text-ink-muted'}`}>{n}</span>
              ))}
              <span className="text-[11px] text-ink-muted ml-2">3 / 5</span>
              <div className="ml-auto">
                <span className="text-[10px] px-1.5 py-0.5 rounded ring-1 bg-amber-50 text-amber-700 ring-amber-200">已有线下需数字化(AI)</span>
              </div>
            </div>
          </div>
        </div>

        {/* 右栏 — 收起的浮动 tab */}
        <div className="col-span-2 border-l border-line p-3 text-xs text-ink-muted">
          <div className="text-[11px] mb-1.5">参考资料</div>
          <div className="text-[10px] leading-relaxed">行业 knowhow chunk 列表 + 引用追溯。本期占位,下期接入。</div>
        </div>
      </div>
    </div>
  )
}

// ── Mock 范围分类结果 ────────────────────────────────────────────────────────

function MockScopeClassify() {
  const items = [
    { mod: 'M02', q: '当前商机阶段模型',     scope: 'migrate',     reason: '客户用 BANT,新系统用华为 LTC 6 阶段,数据需迁移映射' },
    { mod: 'M02', q: '商机推进卡点',         scope: 'new',         reason: '阶段预警机制客户当前没有,需新建' },
    { mod: 'M02', q: '商机数据完整度',       scope: 'digitize',    reason: '数据散在 Excel + 邮件,需上 CRM 字段化' },
    { mod: 'M03', q: '招投标流程',           scope: 'digitize',    reason: '当前线下台账走,需上线管理' },
    { mod: 'M03', q: '报价审批分级',         scope: 'new',         reason: '差异化审批分支客户尚未设计' },
    { mod: 'M05', q: '订单拆单逻辑',         scope: 'out_of_scope', reason: '过于客户特定 + 不在一期 SOW,留二期' },
  ]
  const SCOPE_META: Record<string, { label: string; color: string }> = {
    new:           { label: '需新建',           color: 'bg-blue-50 text-blue-700 ring-blue-200' },
    digitize:      { label: '已有线下需数字化', color: 'bg-amber-50 text-amber-700 ring-amber-200' },
    migrate:       { label: '已有需搬迁',       color: 'bg-purple-50 text-purple-700 ring-purple-200' },
    out_of_scope:  { label: '不纳入一期',       color: 'bg-slate-50 text-slate-600 ring-slate-200' },
  }
  return (
    <div className="bg-white border border-line rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-line bg-emerald-50 flex items-center gap-2">
        <CheckCircle2 size={13} className="text-emerald-600" />
        <span className="text-sm font-semibold text-emerald-800">AI 范围分类完成</span>
        <span className="ml-auto text-[11px] text-emerald-700">{items.length} 题已打标 · 顾问可手改</span>
      </div>
      <table className="w-full text-xs">
        <thead className="bg-slate-50/60">
          <tr className="text-left text-ink-muted">
            <th className="px-3 py-2 font-semibold w-16">模块</th>
            <th className="px-2 py-2 font-semibold">需求</th>
            <th className="px-2 py-2 font-semibold w-40">范围分类</th>
            <th className="px-2 py-2 font-semibold">AI 判定理由</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((it, i) => {
            const meta = SCOPE_META[it.scope]
            return (
              <tr key={i}>
                <td className="px-3 py-2.5 text-ink-muted text-[11px] whitespace-nowrap">{it.mod}</td>
                <td className="px-2 py-2.5 text-ink">{it.q}</td>
                <td className="px-2 py-2.5">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 ${meta.color}`}>{meta.label}</span>
                </td>
                <td className="px-2 py-2.5 text-ink-secondary text-[11px]">{it.reason}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="px-4 py-2 bg-slate-50 border-t border-line text-[11px] text-ink-muted">
        这张分类表直接交付给方案设计组 — 蓝图阶段不用再梳理一遍"哪些功能要新建、哪些迁移"。
      </div>
    </div>
  )
}


