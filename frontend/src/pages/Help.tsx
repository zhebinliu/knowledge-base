/**
 * Help — 用户操作手册
 * Route: /help  (no auth required)
 */
import { useState, useEffect } from 'react'
import {
  BookOpen, Upload, FileText, MessageSquare, Layers, Folder,
  Settings, Zap, ChevronRight, ChevronDown, Info, CheckCircle,
  AlertCircle, Lightbulb, Search, Brain, Star, ThumbsUp, ThumbsDown,
  Edit, RefreshCw, Filter, BarChart2, Key, Terminal, Users,
  ClipboardCheck, Award, Clock, Trash2, Eye, ArrowRight,
  Sparkles, Wand2, ExternalLink, ClipboardList,
} from 'lucide-react'

// ── NAV ───────────────────────────────────────────────────────────────────────

const NAV = [
  { id: 'overview',   label: '系统概览',   icon: BookOpen },
  { id: 'upload',     label: '上传文档',   icon: Upload },
  { id: 'documents',  label: '文档管理',   icon: FileText },
  { id: 'qa',         label: '智能问答',   icon: MessageSquare },
  { id: 'chunks',     label: '知识切片',   icon: Layers },
  { id: 'projects',   label: '项目管理',   icon: Folder },
  { id: 'outputs',    label: '输出中心',   icon: Sparkles },
  { id: 'challenge',  label: '知识挑战',   icon: Award },
  { id: 'dashboard',  label: '总览面板',   icon: BarChart2 },
  { id: 'settings',   label: '系统设置',   icon: Settings },
  { id: 'mcp',        label: 'MCP 集成',   icon: Terminal },
  { id: 'faq',        label: '常见问题',   icon: Lightbulb },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function Section({ id, title, icon: Icon, children }: {
  id: string; title: string; icon: any; children: React.ReactNode
}) {
  return (
    <section id={id} className="mb-14 scroll-mt-8">
      <div className="flex items-center gap-2.5 mb-5 pb-3 border-b border-line">
        <div className="w-8 h-8 rounded-lg bg-brand-light flex items-center justify-center flex-shrink-0">
          <Icon size={15} style={{ color: 'var(--accent)' }} />
        </div>
        <h2 className="text-lg font-bold text-ink">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h3 className="text-sm font-semibold text-ink mb-3">{title}</h3>
      {children}
    </div>
  )
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 bg-brand-light border border-orange-200 rounded-lg px-4 py-3 mb-4 text-sm text-[#7a3c00]">
      <Lightbulb size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
      <span>{children}</span>
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 text-sm text-blue-800">
      <Info size={14} className="flex-shrink-0 mt-0.5 text-blue-500" />
      <span>{children}</span>
    </div>
  )
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-sm text-amber-800">
      <AlertCircle size={14} className="flex-shrink-0 mt-0.5 text-amber-500" />
      <span>{children}</span>
    </div>
  )
}

function Steps({ items }: { items: { title: string; desc: string }[] }) {
  return (
    <ol className="space-y-3 mb-4">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center text-white mt-0.5"
            style={{ background: 'linear-gradient(135deg,#FF8D1A,#D96400)' }}>
            {i + 1}
          </span>
          <div>
            <p className="text-sm font-medium text-ink">{item.title}</p>
            <p className="text-xs text-ink-secondary mt-0.5">{item.desc}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-line rounded-lg mb-2 overflow-hidden bg-surface">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-canvas transition-colors text-left"
      >
        <span className="flex-1 text-sm font-medium text-ink">{q}</span>
        {open ? <ChevronDown size={14} className="text-ink-muted flex-shrink-0" />
               : <ChevronRight size={14} className="text-ink-muted flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-line">
          <p className="text-sm text-ink-secondary leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  )
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-block px-1.5 py-0.5 text-xs font-mono bg-gray-100 border border-gray-300 rounded text-gray-700">
      {children}
    </kbd>
  )
}

// ── Feature grid card ─────────────────────────────────────────────────────────

function FeatureCard({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="card p-4 flex gap-3">
      <div className="w-8 h-8 rounded-lg bg-brand-light flex items-center justify-center flex-shrink-0">
        <Icon size={14} style={{ color: 'var(--accent)' }} />
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="text-xs text-ink-secondary mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Help() {
  const [active, setActive] = useState('overview')

  useEffect(() => {
    document.title = '使用手册 — KB System'
    return () => { document.title = '实施知识综合管理' }
  }, [])

  const scrollTo = (id: string) => {
    setActive(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="flex min-h-screen bg-canvas">

      {/* ── Left nav ───────────────────────────────────────────────────── */}
      <aside className="w-56 flex-shrink-0 border-r border-line bg-surface flex flex-col sticky top-0 h-screen overflow-y-auto">
        <div className="h-14 flex items-center gap-2.5 px-5 border-b border-line flex-shrink-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#FF8D1A,#D96400)' }}>
            <BookOpen size={13} className="text-white" />
          </div>
          <div>
            <p className="text-xs font-bold text-ink leading-none">使用手册</p>
            <p className="text-[10px] text-ink-muted leading-none mt-0.5">KB System v1.0</p>
          </div>
        </div>

        <div className="px-2 py-1 border-b border-line">
          <a href="/" className="block text-xs text-ink-secondary hover:text-ink px-3 py-2 transition-colors">← 返回系统</a>
        </div>

        <nav className="flex-1 py-3 px-2">
          <p className="px-3 py-1 text-[10px] font-semibold text-ink-muted uppercase tracking-widest">目录</p>
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className={`w-full text-left px-3 py-2 rounded text-sm font-medium mb-0.5 transition-colors flex items-center gap-2 ${
                active === id
                  ? 'bg-brand-light text-brand-deep'
                  : 'text-ink-secondary hover:bg-canvas hover:text-ink'
              }`}
            >
              <Icon size={13} className="flex-shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-line">
          <p className="text-[10px] text-ink-muted">遇到问题？</p>
          <a href="/api" className="text-[10px] text-brand hover:underline">查看 API 文档 →</a>
        </div>
      </aside>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <main className="flex-1 px-10 py-10 max-w-4xl overflow-y-auto">

        {/* Hero */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-light border border-orange-200 text-[#D96400] text-xs mb-4">
            <BookOpen size={11} /> 操作手册
          </div>
          <h1 className="text-3xl font-bold text-ink mb-2">KB System 使用手册</h1>
          <p className="text-ink-secondary text-sm max-w-xl leading-relaxed">
            纷享销客 CRM 实施知识库管理系统完整操作指南。涵盖文档上传、知识问答、切片管理、
            项目协作及 MCP 集成等全部功能模块。
          </p>
        </div>

        {/* Overview */}
        <Section id="overview" title="系统概览" icon={BookOpen}>
          <p className="text-sm text-ink-secondary mb-5 leading-relaxed">
            KB System 是一套面向 CRM 实施团队的知识库管理平台。核心工作流为：
            <strong className="text-ink">上传文档 → 自动切片入库 → AI 问答检索</strong>，
            同时支持多维度知识管理和外部 AI 工具集成。
          </p>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <FeatureCard icon={Upload}        title="智能文档处理" desc="支持 PDF/Word/PPT/Excel/Markdown 等格式，自动转换、切片、向量化入库" />
            <FeatureCard icon={MessageSquare} title="RAG 智能问答" desc="基于知识库内容回答问题，支持来源引用、多轮对话、PM 虚拟角色" />
            <FeatureCard icon={Layers}        title="知识切片管理" desc="查看、审核、编辑知识切片，支持热度追踪和 LTC 阶段标注" />
            <FeatureCard icon={Folder}        title="项目维度组织" desc="按客户项目组织文档，支持 PM 视角定制化问答分析" />
            <FeatureCard icon={Award}         title="知识挑战" desc="自动出题检验知识库覆盖率，支持定时挑战和历史记录" />
            <FeatureCard icon={Terminal}      title="MCP / REST 集成" desc="支持 Claude、Cursor 等 AI 工具通过 MCP 协议直接调用知识库" />
          </div>

          <div className="card p-4">
            <p className="text-xs font-semibold text-ink mb-3">核心工作流</p>
            <div className="flex items-center gap-2 flex-wrap text-xs text-ink-secondary">
              {['上传文档', '自动转换 Markdown', 'LTC 切片分类', '向量化入库', '语义检索', 'RAG 答案生成'].map((step, i, arr) => (
                <span key={step} className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full border border-line bg-canvas text-ink-secondary font-medium">{step}</span>
                  {i < arr.length - 1 && <ArrowRight size={12} className="text-ink-muted" />}
                </span>
              ))}
            </div>
          </div>
        </Section>

        {/* Upload */}
        <Section id="upload" title="上传文档" icon={Upload}>
          <SubSection title="支持的文件格式">
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { fmt: 'PDF', note: '最常用' },
                { fmt: 'Word (.docx)', note: '推荐' },
                { fmt: 'PowerPoint (.pptx)', note: '' },
                { fmt: 'Excel (.xlsx)', note: '' },
                { fmt: 'Markdown (.md)', note: '' },
                { fmt: 'TXT / CSV', note: '纯文本' },
              ].map(({ fmt, note }) => (
                <div key={fmt} className="card px-3 py-2 flex items-center gap-2">
                  <CheckCircle size={12} className="text-green-500 flex-shrink-0" />
                  <span className="text-xs text-ink">{fmt}</span>
                  {note && <span className="text-[10px] text-ink-muted ml-auto">{note}</span>}
                </div>
              ))}
            </div>
            <Note>单文件最大 50 MB。建议将大型文档拆分后分批上传以获得更好的切片质量。</Note>
          </SubSection>

          <SubSection title="上传步骤">
            <Steps items={[
              { title: '进入文档管理页', desc: '点击左侧导航「文档管理」，或直接访问 /documents' },
              { title: '选择文件', desc: '点击「上传文档」按钮，或直接将文件拖放到虚线区域（支持多文件同时拖入）' },
              { title: '填写归属信息（可选）', desc: '在弹出的上传选项中选择关联项目和文档类型，有助于后续按项目筛选' },
              { title: '点击确认上传', desc: '系统将并发处理最多 3 个文件，右下角进度面板实时显示进度' },
              { title: '等待处理完成', desc: '状态依次经历：等待处理 → 转换中 → 切片中 → 完成。通常 1-3 分钟完成' },
            ]} />
            <Tip>
              上传时指定「项目」和「文档类型」，切片会自动继承项目行业标签，QA 检索质量更高。
            </Tip>
          </SubSection>

          <SubSection title="处理状态说明">
            <div className="space-y-2">
              {[
                { status: '等待处理', color: 'bg-yellow-50 text-yellow-700', desc: '已入队，等待 Celery Worker 处理' },
                { status: '转换中', color: 'bg-orange-50 text-orange-700', desc: '正在将原始文档转换为 Markdown 格式' },
                { status: '切片中', color: 'bg-purple-50 text-purple-700', desc: '正在按知识模块拆分并分类 LTC 阶段' },
                { status: '完成', color: 'bg-green-50 text-green-700', desc: '切片已入库，可立即通过 QA 检索到' },
                { status: '失败', color: 'bg-red-50 text-red-700', desc: '处理出错，鼠标悬停查看原因，系统会自动重试 5 次' },
              ].map(({ status, color, desc }) => (
                <div key={status} className="flex items-center gap-3 text-sm">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${color}`}>{status}</span>
                  <span className="text-ink-secondary text-xs">{desc}</span>
                </div>
              ))}
            </div>
          </SubSection>
        </Section>

        {/* Documents */}
        <Section id="documents" title="文档管理" icon={FileText}>
          <SubSection title="文档列表与筛选">
            <p className="text-sm text-ink-secondary mb-3 leading-relaxed">
              文档列表支持按项目和文档类型两个维度筛选。点击列名右侧图标可查看失败文档的错误原因。
            </p>
            <div className="card p-4 mb-4 space-y-2">
              {[
                { icon: Eye,     label: 'Markdown 预览',   desc: '查看文档转换后的 Markdown 全文和 AI 生成的摘要、FAQ' },
                { icon: Layers,  label: 'Chunks 视图',     desc: '列出该文档的所有知识切片，可按 chunk ID 跳转到高亮位置' },
                { icon: Edit,    label: '修改归属',         desc: '更改文档所属项目、文档类型、行业标签' },
                { icon: Trash2,  label: '删除文档',         desc: '删除文档及其所有切片和向量数据（操作不可恢复）' },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex items-start gap-3">
                  <Icon size={14} className="text-ink-muted flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs font-semibold text-ink">{label}：</span>
                    <span className="text-xs text-ink-secondary">{desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </SubSection>

          <SubSection title="文档摘要与 FAQ">
            <p className="text-sm text-ink-secondary mb-3 leading-relaxed">
              文档处理完成后系统会自动生成 3 句话摘要和 Top 5 常见问题，点击
              <strong className="text-ink"> Markdown 预览 </strong>
              即可在顶部折叠卡片中查看。摘要和 FAQ 有助于快速了解文档内容而无需阅读全文。
            </p>
            <Tip>从 QA 引用面板点击「看原文」链接可直接跳转到对应文档的精确切片位置并高亮显示。</Tip>
          </SubSection>
        </Section>

        {/* QA */}
        <Section id="qa" title="智能问答" icon={MessageSquare}>
          <SubSection title="基础问答">
            <Steps items={[
              { title: '进入 QA 页面', desc: '点击左侧导航「智能问答」' },
              { title: '输入问题', desc: '在底部输入框输入自然语言问题，支持中文' },
              { title: '查看答案', desc: '答案流式返回，右下角来源面板显示引用的知识切片及相关度百分比' },
              { title: '追问', desc: '系统自动记录对话上下文，可直接追问相关问题（最多携带 6 轮历史）' },
            ]} />
            <Tip>
              问题越具体，答案质量越高。建议包含关键词，例如「<strong>合同阶段</strong>的审批流程是什么」比「流程是什么」效果好。
            </Tip>
          </SubSection>

          <SubSection title="LTC 阶段过滤">
            <p className="text-sm text-ink-secondary mb-3 leading-relaxed">
              点击输入框上方的 LTC 阶段选择器，可将检索范围限定在特定销售阶段的知识切片内，
              避免跨阶段内容干扰。适用于针对特定阶段深入提问的场景。
            </p>
            <div className="flex flex-wrap gap-2">
              {['线索', '商机', '报价', '合同', '回款', '售后'].map(s => (
                <span key={s} className="px-2.5 py-1 rounded-full text-xs border border-orange-200 bg-brand-light text-[#D96400] font-medium">{s}</span>
              ))}
            </div>
          </SubSection>

          <SubSection title="虚拟项目经理模式（PM 视角）">
            <p className="text-sm text-ink-secondary mb-3 leading-relaxed">
              切换到 <strong className="text-ink">PM 模式</strong> 并选择一个项目后，
              系统以该项目 PM 的视角回答，答案结构化呈现「当前状态 / 决策建议 / 下一步行动 / 风险预警」，
              并且只检索该项目的相关文档。
            </p>
            <Steps items={[
              { title: '点击 persona 切换器', desc: '在 QA 页面顶部切换到「PM 模式」' },
              { title: '选择项目', desc: '从项目下拉列表选择要分析的客户项目' },
              { title: '提问', desc: '输入与该项目相关的问题，如「当前回款风险有哪些」' },
            ]} />
            <Note>PM 模式需要该项目下已有足够的文档；若项目文档少于 3 份，答案可能较简短。</Note>
          </SubSection>

          <SubSection title="答案反馈">
            <p className="text-sm text-ink-secondary mb-3">
              每条回答下方提供三个反馈按钮，帮助持续改善知识库质量：
            </p>
            <div className="space-y-2">
              {[
                { icon: ThumbsUp,  label: '👍 有帮助',  desc: '答案准确有用，将该问题标记为已解决' },
                { icon: ThumbsDown, label: '👎 无帮助', desc: '答案有误或无关，问题自动进入「未解决队列」供人工补充' },
                { icon: Star,      label: '⭐ 收藏',    desc: '标记高质量答案，同时标记为已解决' },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex items-center gap-3 text-sm card p-2.5">
                  <Icon size={14} className="text-ink-muted flex-shrink-0" />
                  <span className="font-medium text-ink w-24 flex-shrink-0">{label}</span>
                  <span className="text-xs text-ink-secondary">{desc}</span>
                </div>
              ))}
            </div>
          </SubSection>
        </Section>

        {/* Chunks */}
        <Section id="chunks" title="知识切片" icon={Layers}>
          <p className="text-sm text-ink-secondary mb-5 leading-relaxed">
            知识切片是文档被拆分后进入向量库的最小单元，每个切片对应一个知识点。
            切片管理页面可以查看、审核、编辑所有切片。
          </p>

          <SubSection title="筛选与过滤">
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { label: 'LTC 阶段', desc: '按销售阶段过滤切片' },
                { label: '行业标签', desc: '按行业分类过滤' },
                { label: '审核状态', desc: '待审核 / 已通过 / 已拒绝' },
                { label: '热度', desc: '🔥 热门（被引用 ≥5 次）/ 👻 未被引用' },
              ].map(({ label, desc }) => (
                <div key={label} className="card p-3 flex items-start gap-2">
                  <Filter size={12} className="text-ink-muted flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-ink">{label}</p>
                    <p className="text-[11px] text-ink-secondary">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </SubSection>

          <SubSection title="审核切片">
            <p className="text-sm text-ink-secondary mb-3 leading-relaxed">
              LTC 分类置信度低于阈值的切片会进入「待审核」队列。在审核页面可以逐条确认或拒绝，
              或在切片管理页面直接修改标签。
            </p>
          </SubSection>

          <SubSection title="编辑切片内容">
            <Steps items={[
              { title: '展开切片卡片', desc: '点击切片右侧「编辑」按钮打开编辑面板' },
              { title: '开启内容修改', desc: '打开「修改切片内容」开关（防止误触）' },
              { title: '编辑文本', desc: '修改切片的原文内容，同时可修改 LTC 阶段、标签' },
              { title: '保存', desc: '点击保存后系统自动重新向量化，更新 Qdrant 中的嵌入向量' },
            ]} />
            <Warn>修改切片内容会触发重新嵌入（约 1-2 秒），完成前该切片的检索结果为旧内容。</Warn>
          </SubSection>

          <SubSection title="热度徽章说明">
            <div className="card p-4 space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <span className="text-base">🔥</span>
                <span className="text-ink-secondary text-xs">被 QA 引用 <strong className="text-ink">≥ 5 次</strong>，说明该切片是核心知识点，建议定期检查准确性</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-base">👻</span>
                <span className="text-ink-secondary text-xs">从未被引用，说明该切片覆盖的内容较少被提问，可考虑优化关键词或合并</span>
              </div>
            </div>
          </SubSection>
        </Section>

        {/* Projects */}
        <Section id="projects" title="项目管理" icon={Folder}>
          <p className="text-sm text-ink-secondary mb-5 leading-relaxed">
            项目是组织文档的核心单元，代表一个客户实施项目。每个项目可以关联多个文档，
            并通过 PM 模式在 QA 中进行项目专属分析。
          </p>

          <SubSection title="创建项目">
            <Steps items={[
              { title: '进入项目库页面', desc: '点击左侧导航「项目库」' },
              { title: '点击「新建项目」', desc: '填写项目名称（必填）、客户名称、行业、启动日期、描述' },
              { title: '保存项目', desc: '项目创建后可以在上传文档时关联到该项目' },
            ]} />
          </SubSection>

          <SubSection title="为文档关联项目">
            <p className="text-sm text-ink-secondary mb-3">
              有两种方式关联：①上传时在选项弹框中选择项目；②上传后在文档列表点击
              <strong className="text-ink"> 修改归属（铅笔图标）</strong>重新指定项目。
            </p>
            <Tip>为项目配置「行业」标签后，上传到该项目的文档会自动继承行业，QA 检索质量更高。</Tip>
          </SubSection>

          <SubSection title="查看项目详情">
            <p className="text-sm text-ink-secondary mb-3">
              在项目卡片上点击项目名称进入详情页，可以查看项目基本信息、
              文档列表和系统自动识别的 CRM 模块覆盖情况。
            </p>
          </SubSection>
        </Section>

        {/* Outputs */}
        <Section id="outputs" title="输出中心 · 对话式生成" icon={Sparkles}>
          <p className="text-sm text-ink-secondary mb-5 leading-relaxed">
            输出中心通过<strong className="text-ink">多轮对话</strong>收集项目信息，实时调用知识库检索，最终一键生成启动会
            PPT、实施调研问卷、项目洞察报告三种交付物。不再依赖固定问题模板——智能体会根据每个项目的实际情况动态追问。
          </p>

          <SubSection title="三个输出智能体">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              {[
                { icon: FileText, title: '启动会 PPT', desc: 'Claude 风格 11 页 HTML 幻灯片，含品牌色板 / chevron / 2×2 矩阵 / 甘特 / RACI 等视觉元件，浏览器打开即可播放', color: '#D96400' },
                { icon: ClipboardList, title: '实施调研问卷', desc: '按业务流程 / 角色权限 / 数据集成 / 风险约束 / 进度资源五大类生成，导出 Markdown + Word', color: '#2563EB' },
                { icon: Lightbulb, title: '项目洞察报告', desc: '面向高管的项目概览 / 关键决策 / 风险矩阵 / 下一步建议四段式报告', color: '#7C3AED' },
              ].map(({ icon: Icon, title, desc, color }) => (
                <div key={title} className="card p-4">
                  <Icon size={18} style={{ color }} className="mb-2" />
                  <p className="text-sm font-semibold text-ink mb-1">{title}</p>
                  <p className="text-[11px] text-ink-secondary leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </SubSection>

          <SubSection title="使用流程">
            <Steps items={[
              { title: '进入输出中心', desc: '点击左侧导航「输出中心」' },
              { title: '右侧配置面板', desc: '选择智能体（启动会 PPT / 问卷 / 洞察），选择作用域：具体项目（已创建）或行业（无项目）' },
              { title: '开始对话', desc: '点击「开始对话」，智能体会做开场问候并抛出第一个问题。有选项时显示为可点击的橙色 chip，多选题显示「提交选择」按钮' },
              { title: '按需检索知识库', desc: '智能体会在合适节点自动调用 search_kb 工具查询历史项目资产，检索痕迹（查询词）以小标签显示在消息上方' },
              { title: '阶段性小结', desc: '每 3~4 轮对话智能体会复述收集到的要点，你可以校正或补充' },
              { title: '生成文档', desc: '右侧「生成文档」按钮随页面滚动常驻。点击后触发 Celery 异步任务，下方「我的输出」列表显示生成进度' },
              { title: '在线播放 / 下载', desc: '启动会 PPT 支持新窗口「在线播放」（按 PgDn 翻页，Cmd+P 可打印 PDF）；所有类型都可下载原始文件' },
            ]} />
            <Tip>
              每个项目的对话内容都独立保存，可以多次开不同智能体的对话去收集不同类型的信息，最后分别生成对应的交付物。
            </Tip>
          </SubSection>

          <SubSection title="技能库">
            <p className="text-sm text-ink-secondary mb-3 leading-relaxed">
              技能库是一组可复用的<strong className="text-ink">提示词片段</strong>，可以挂在任意输出智能体上，作为生成时的方法论注入。例如给
              「启动会 PPT」智能体挂上「PPT 生成方法论（pptgen）」技能，就会按 11 页骨架 + 色板 + 文案规范来产出 HTML。
            </p>
            <Steps items={[
              { title: '进入系统设置', desc: '左侧「系统设置」→「技能库」Tab（仅管理员）' },
              { title: '新增技能', desc: '填写技能名称、描述，在「提示词片段」中粘贴 Markdown（支持预览 / 编辑切换）' },
              { title: '挂载到智能体', desc: '在「输出智能体」Tab 中勾选要启用的技能，保存后立即生效' },
            ]} />
            <Note>系统已预置 pptgen、项目启动会准备、项目洞察访谈三个内置技能，按需复用或修改。</Note>
          </SubSection>

          <SubSection title="在线播放启动会 PPT">
            <p className="text-sm text-ink-secondary mb-3 leading-relaxed">
              启动会 PPT 生成完后，「我的输出」列表会出现橙色的
              <span className="inline-flex items-center gap-1 px-2 py-0.5 mx-1 text-xs border border-orange-200 bg-orange-50 text-orange-600 rounded">
                <ExternalLink size={10} /> 在线播放
              </span>
              按钮。点击后在新窗口直接打开 HTML 幻灯片，自带 1280×720 分页样式，浏览器
              <Kbd>⌘P</Kbd> 「打印 → 另存为 PDF」即可导出咨询交付级 PDF。
            </p>
            <Warn>
              HTML 幻灯片只有当前账号可访问（带 JWT 鉴权），分享给外部请先「下载」原始 .html 文件。
            </Warn>
          </SubSection>

          <SubSection title="多选一 / 多选多 交互">
            <p className="text-sm text-ink-secondary mb-3 leading-relaxed">
              智能体在系统提示词里被教会尽量用选项减少你的打字负担。常见的选项类型：
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="card p-3">
                <p className="text-xs font-semibold text-ink mb-1">单选 Chip</p>
                <p className="text-[11px] text-ink-secondary">直接点击即发送，如「制造业 / SaaS / 快消 / 医疗」</p>
              </div>
              <div className="card p-3">
                <p className="text-xs font-semibold text-ink mb-1">多选 Chip</p>
                <p className="text-[11px] text-ink-secondary">勾选后点「提交选择」，如「销售管理 + 服务工单 + 合同」</p>
              </div>
            </div>
          </SubSection>
        </Section>

        {/* Challenge */}
        <Section id="challenge" title="知识挑战" icon={Award}>
          <p className="text-sm text-ink-secondary mb-5 leading-relaxed">
            知识挑战会从知识库中自动出题，由模型回答后再由评判模型打分，
            用于检验知识库对各 LTC 阶段的覆盖质量。
          </p>

          <SubSection title="手动触发挑战">
            <Steps items={[
              { title: '进入挑战页面', desc: '点击左侧导航「知识挑战」' },
              { title: '选择阶段和题数', desc: '勾选要覆盖的 LTC 阶段，设置每阶段题数（建议 3-5 题）' },
              { title: '开始挑战', desc: '点击「开始挑战」，问题和答案实时流式展示' },
              { title: '查看结果', desc: '挑战完成后显示通过率和评分，点击「查看历史」可回溯详情' },
            ]} />
          </SubSection>

          <SubSection title="定时挑战">
            <p className="text-sm text-ink-secondary mb-3 leading-relaxed">
              在挑战页面下方配置「定时挑战」，支持 Cron 表达式。例如
              <code className="text-ink font-mono mx-1">0 9 * * 1</code>
              表示每周一上午 9:00 自动执行一次，结果记录到挑战历史。
            </p>
          </SubSection>

          <SubSection title="挑战历史">
            <p className="text-sm text-ink-secondary mb-3">
              左侧导航「挑战历史」列出所有历史挑战记录，点击任意一条可查看每道题的
              完整问题、模型答案和评分说明。
            </p>
          </SubSection>
        </Section>

        {/* Dashboard */}
        <Section id="dashboard" title="总览面板" icon={BarChart2}>
          <p className="text-sm text-ink-secondary mb-5 leading-relaxed">
            Dashboard 是登录后的默认首页，汇总系统关键指标。
          </p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              { label: '文档统计卡',     desc: '总文档数、已完成、处理中、失败，点击状态可跳转到对应筛选' },
              { label: '切片统计卡',     desc: '总切片数、待审核数、向量库容量' },
              { label: '文档处理进度',   desc: '实时显示正在处理的文档进度，5 秒自动刷新' },
              { label: '未解决问题队列', desc: 'Top 5 待解答问题，来自用户在 QA 中点击「无帮助」的反馈' },
            ].map(({ label, desc }) => (
              <div key={label} className="card p-3">
                <p className="text-xs font-semibold text-ink mb-1">{label}</p>
                <p className="text-[11px] text-ink-secondary leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
          <Note>未解决问题队列是补充知识库的重要线索，建议定期查看并上传相关文档或直接回答。</Note>
        </Section>

        {/* Settings */}
        <Section id="settings" title="系统设置" icon={Settings}>
          <p className="text-sm text-ink-secondary mb-4 leading-relaxed">
            系统设置仅管理员可访问（左侧导航「系统设置」），包含四个 Tab：
          </p>
          <div className="space-y-3 mb-5">
            {[
              {
                tab: '模型配置',
                desc: '管理接入的 AI 模型列表，填写各模型的 API Key、Base URL、最大 Token 数。支持多个模型并行配置。',
              },
              {
                tab: '路由与参数',
                desc: '为不同任务（文档转写、QA 问答、切片分类等）指定主模型和备选模型，并单独配置 max_tokens、temperature、超时时间。',
              },
              {
                tab: '提示词',
                desc: '查看和编辑各类 Prompt 模板，支持 Raw / 预览双视图。修改后立即生效，无需重启服务。',
              },
              {
                tab: 'API 密钥',
                desc: '生成或撤销 MCP API Key（格式 mcp_xxx），用于外部工具集成。Key 仅在生成时显示一次，请妥善保存。',
              },
            ].map(({ tab, desc }) => (
              <div key={tab} className="card p-4">
                <p className="text-xs font-semibold text-ink mb-1">{tab}</p>
                <p className="text-xs text-ink-secondary leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
          <Warn>修改路由规则和 Prompt 模板会立即影响所有 QA 请求，建议在低峰期操作。</Warn>
        </Section>

        {/* MCP */}
        <Section id="mcp" title="MCP / 外部集成" icon={Terminal}>
          <p className="text-sm text-ink-secondary mb-5 leading-relaxed">
            KB System 实现了 MCP（Model Context Protocol）协议，
            Claude Desktop、Cursor、VS Code Copilot 等 AI 工具可通过 MCP 直接调用知识库。
          </p>

          <SubSection title="获取 API Key">
            <Steps items={[
              { title: '进入系统设置', desc: '点击左侧导航「系统设置」→「API 密钥」Tab' },
              { title: '生成 MCP Key', desc: '点击「生成 MCP Key」按钮，Key 格式为 mcp_xxx' },
              { title: '复制保存', desc: 'Key 仅显示一次，请立即复制到安全位置。丢失后需重新生成' },
            ]} />
          </SubSection>

          <SubSection title="Claude Desktop 接入">
            <p className="text-sm text-ink-secondary mb-3">
              编辑 Claude Desktop 配置文件，将以下内容加入
              <code className="text-ink font-mono mx-1">mcpServers</code> 字段：
            </p>
            <div className="relative mt-2 rounded-lg overflow-hidden border border-line">
              <div className="px-4 py-2 bg-surface border-b border-line">
                <span className="text-xs text-ink-muted font-mono">json — claude_desktop_config.json</span>
              </div>
              <pre className="bg-[#F5F7FA] px-4 py-3 text-xs text-[#1a3a5c] font-mono overflow-x-auto whitespace-pre leading-relaxed">{`{
  "mcpServers": {
    "kb-system": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://kb.tokenwave.cloud/api/mcp"],
      "env": { "MCP_REMOTE_AUTH": "Bearer mcp_xxx" }
    }
  }
}`}</pre>
            </div>
          </SubSection>

          <SubSection title="可用的 MCP 工具">
            <div className="space-y-3">
              {[
                { name: 'ask_kb',       badge: '推荐', desc: 'RAG 问答，支持 persona=pm + project 参数以 PM 视角回答' },
                { name: 'search_kb',    badge: '',     desc: '语义检索，返回原始切片列表，适合需要二次分析的场景' },
                { name: 'list_projects', badge: '',    desc: '列出所有项目，获取 project ID 供 ask_kb 使用' },
              ].map(({ name, badge, desc }) => (
                <div key={name} className="card p-3 flex items-start gap-3">
                  <div className="w-7 h-7 rounded bg-brand-light flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Terminal size={12} style={{ color: 'var(--accent)' }} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <code className="text-xs font-bold text-[#D96400]">{name}</code>
                      {badge && <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-50 text-green-700 border border-green-200">{badge}</span>}
                    </div>
                    <p className="text-xs text-ink-secondary">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <Tip>
                在 Claude 中使用 PM 模式的典型流程：先调用
                <code className="font-mono mx-1">list_projects</code> 查出项目 ID，
                再调用 <code className="font-mono mx-1">ask_kb(persona="pm", project="项目ID")</code> 分析项目现状。
              </Tip>
            </div>
          </SubSection>
        </Section>

        {/* FAQ */}
        <Section id="faq" title="常见问题" icon={Lightbulb}>
          <div className="space-y-1">
            {[
              {
                q: '文档上传后一直显示「等待处理」，怎么办？',
                a: 'Celery Worker 可能已满载或未运行。请联系管理员检查 Worker 状态。在 /health/worker 接口可以查看 Worker 存活情况。通常会在 1-5 分钟内开始处理。',
              },
              {
                q: 'QA 回答说「没有找到相关内容」，但我上传过相关文档。',
                a: '可能原因：①文档尚未处理完成（检查状态是否为「完成」）；②问题描述与文档关键词差距较大，尝试换不同词语提问；③文档内容过于专业，LTC 分类偏差导致未被检索到（可在切片页面确认 LTC 标签是否正确）。',
              },
              {
                q: '如何批量修改多个切片的 LTC 阶段？',
                a: '目前切片管理页面支持逐条编辑。如需批量修改，可以通过 PUT /api/chunks/{id} 接口脚本化操作，或联系管理员执行 SQL 批量更新后重新向量化。',
              },
              {
                q: 'MCP Key 泄露了怎么办？',
                a: '立即前往系统设置 → API 密钥，点击「撤销」当前 Key，然后重新生成新 Key 并更新配置。旧 Key 撤销后立即失效。',
              },
              {
                q: 'PM 模式的答案结构能自定义吗？',
                a: '可以。在系统设置 → 提示词 Tab 中找到 PM_QA_PROMPT，直接编辑模板内容并保存，修改即时生效。',
              },
              {
                q: '知识挑战的通过率很低，如何提升？',
                a: '通过率低通常代表知识库覆盖不足。建议：①上传该阶段更多文档；②检查已有切片的内容质量（审核页面）；③在 QA 中通过「未解决队列」发现高频未覆盖问题，针对性补充文档。',
              },
              {
                q: '文档摘要/FAQ 什么时候生成，可以手动触发吗？',
                a: '文档处理完成后自动触发一次摘要生成（约 30-60 秒）。目前不支持手动重新触发，若摘要质量不佳，可通过修改系统设置中的提示词模板来改善后续文档的生成质量。',
              },
              {
                q: '如何彻底删除一个项目及其所有文档？',
                a: '在项目库页面点击项目 → 删除项目，或调用 DELETE /api/projects/{id}?cascade=true 接口。cascade=true 会解绑所有关联文档（文档本身不会删除）。如需同时删除文档，需在文档管理页面单独删除。',
              },
            ].map((item) => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </Section>

      </main>
    </div>
  )
}
