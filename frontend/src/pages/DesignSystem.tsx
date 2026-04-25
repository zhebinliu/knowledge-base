/**
 * Design System — Living style guide
 * Route: /ds  (no auth required)
 * Inspired by Salesforce Lightning Design System 2
 */
import { useState, useEffect } from 'react'
import {
  BookOpen, Palette, Type, Square, Layers, Box, AlertCircle, ToggleLeft, Layout,
  Download, Ruler, Table2, FormInput, NotebookTabs, Loader, Ghost, Smile,
  FileText, Folder, Search, Settings, ChevronDown, ChevronRight,
  Plus, Trash2, Edit, Check, X, RefreshCw, Upload, Eye, Lock,
  Bell, Star, Home, User, LogOut, Copy, Filter, ArrowRight,
  BarChart2, MessageSquare, Brain, ClipboardCheck, Zap, Calendar,
  Rows3, PanelRightOpen, Code as CodeIcon,
  CheckCircle2, Loader2, Building2, Sparkles, Lightbulb, ClipboardList, FolderKanban,
} from 'lucide-react'
import DataTable, { type ColumnDef } from '../components/DataTable'
import Modal, { Drawer, ConfirmModal } from '../components/Modal'

// ── Data ─────────────────────────────────────────────────────────────────────

const NAV = [
  { id: 'intro',      label: '介绍',        icon: BookOpen },
  { id: 'colors',     label: '颜色',        icon: Palette },
  { id: 'typography', label: '字体',        icon: Type },
  { id: 'spacing',    label: '间距系统',    icon: Ruler },
  { id: 'radiusshadow', label: '圆角 & 阴影', icon: Square },
  { id: 'buttons',    label: '按钮',        icon: ToggleLeft },
  { id: 'badges',     label: '徽章',        icon: Layers },
  { id: 'cards',      label: '卡片',        icon: Box },
  { id: 'alerts',     label: '提示条',      icon: AlertCircle },
  { id: 'inputs',     label: '表单',        icon: FormInput },
  { id: 'tables',     label: '表格',        icon: Table2 },
  { id: 'datatable',  label: '数据表组件',  icon: Rows3 },
  { id: 'modals',     label: '模态框',      icon: PanelRightOpen },
  { id: 'tabs',       label: '标签页',      icon: NotebookTabs },
  { id: 'loading',    label: '加载状态',    icon: Loader },
  { id: 'empty',      label: '空状态',      icon: Ghost },
  { id: 'icons',      label: '图标',        icon: Smile },
  { id: 'workspace',  label: '工作台模式',  icon: FolderKanban },
  { id: 'tokens',     label: 'Token 速查',  icon: Layout },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function Section({ id, title, subtitle, children }: {
  id: string; title: string; subtitle?: string; children: React.ReactNode
}) {
  return (
    <section id={id} className="mb-16 scroll-mt-8">
      <div className="mb-6 pb-4 border-b border-line">
        <h2 className="text-2xl font-bold text-ink">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <h3 className="text-sm font-semibold text-ink-secondary uppercase tracking-widest mb-4">{title}</h3>
      {children}
    </div>
  )
}

function Swatch({ hex, name, tw, text = false }: { hex: string; name: string; tw: string; text?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(hex)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return (
    <div className="group cursor-pointer" onClick={copy}>
      <div
        className="h-16 rounded-lg mb-2 border border-line transition-transform group-hover:scale-[1.03]"
        style={{ background: hex }}
      />
      <p className="text-xs font-semibold text-ink">{name}</p>
      <p className="text-xs text-ink-muted font-mono">{copied ? '已复制！' : hex}</p>
      <p className="text-xs text-ink-muted/70">{tw}</p>
    </div>
  )
}

function TokenRow({ name, value, desc }: { name: string; value: string; desc: string }) {
  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-2.5 pr-4 font-mono text-xs text-brand-deep">{name}</td>
      <td className="py-2.5 pr-4 text-xs text-ink">{value}</td>
      <td className="py-2.5 text-xs text-ink-secondary">{desc}</td>
    </tr>
  )
}

function Code({ children }: { children: string }) {
  return (
    <code className="block bg-gray-950 text-green-400 text-xs font-mono rounded-lg px-4 py-3 mt-3 overflow-x-auto whitespace-pre">
      {children}
    </code>
  )
}

function LiveExample({ label, children, code }: { label: string; children: React.ReactNode; code?: string }) {
  return (
    <div className="border border-line rounded-lg overflow-hidden mb-6">
      <div className="px-4 py-2 bg-canvas border-b border-line">
        <span className="text-xs font-medium text-ink-secondary">{label}</span>
      </div>
      <div className="p-6 bg-surface flex flex-wrap gap-3 items-center">{children}</div>
      {code && <Code>{code}</Code>}
    </div>
  )
}

// Interactive tab demo component
function TabDemo() {
  const [active, setActive] = useState(0)
  const tabs = ['概览', '文档', '成员', '设置']
  return (
    <div className="border border-line rounded-lg overflow-hidden">
      <div className="ds-tabs px-4 pt-1 bg-surface">
        {tabs.map((t, i) => (
          <button key={t} className={`ds-tab${active === i ? ' is-active' : ''}`} onClick={() => setActive(i)}>{t}</button>
        ))}
      </div>
      <div className="p-5 bg-surface text-sm text-ink-secondary">
        {active === 0 && '项目概览内容区域…'}
        {active === 1 && '文档列表区域…'}
        {active === 2 && '成员管理区域…'}
        {active === 3 && '项目设置区域…'}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DesignSystem() {
  const [active, setActive] = useState('intro')
  const [toggleVal, setToggleVal] = useState(true)

  useEffect(() => {
    document.title = '设计规范 — KB System'
    return () => { document.title = '实施知识综合管理' }
  }, [])

  const scrollTo = (id: string) => {
    setActive(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  function downloadCSSTokens() {
    const css = `/* KB System Design Tokens — CSS Custom Properties */
:root {
  /* Brand — orange */
  --accent:        #FF8D1A;
  --accent-deep:   #D96400;
  --accent-light:  #FFF4E6;
  --accent-mid:    #FFB066;

  /* Surfaces */
  --surface:       #FFFFFF;
  --bg:            #F5F6FA;

  /* Borders */
  --line:          #E8E9EE;
  --line-strong:   #D0D3DE;

  /* Text */
  --text-primary:   #1A1D2E;
  --text-secondary: #6B7280;
  --text-muted:     #9CA3AF;

  /* Border radius */
  --radius-sm: 6px;
  --radius:    10px;
  --radius-lg: 14px;

  /* Shadows */
  --shadow-sm: 0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04);
  --shadow:    0 4px 12px rgba(0,0,0,.08), 0 1px 3px rgba(0,0,0,.05);
  --shadow-lg: 0 10px 28px rgba(0,0,0,.10), 0 4px 8px rgba(0,0,0,.06);

  /* Semantic */
  --success: #10B981;  --success-deep: #059669;  --success-light: #ECFDF5;
  --danger:  #EF4444;  --danger-deep:  #DC2626;  --danger-light:  #FFF1F2;
  --info:    #3B82F6;  --info-deep:    #2563EB;  --info-light:    #EFF6FF;
  --warn:    #F59E0B;  --warn-deep:    #B45309;  --warn-light:    #FFFBEB;
}
`
    const blob = new Blob([css], { type: 'text/css' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'kb-design-tokens.css'; a.click()
    URL.revokeObjectURL(url)
  }

  function downloadJSONTokens() {
    const tokens = {
      "$schema": "https://design-tokens.github.io/community-group/format/",
      "brand": {
        "DEFAULT": { "$value": "#FF8D1A", "$type": "color", "$description": "Primary brand orange" },
        "deep":    { "$value": "#D96400", "$type": "color" },
        "light":   { "$value": "#FFF4E6", "$type": "color" },
        "mid":     { "$value": "#FFB066", "$type": "color" },
      },
      "surface": {
        "canvas":  { "$value": "#F5F6FA", "$type": "color" },
        "surface": { "$value": "#FFFFFF", "$type": "color" },
      },
      "border": {
        "line":    { "$value": "#E8E9EE", "$type": "color" },
        "strong":  { "$value": "#D0D3DE", "$type": "color" },
      },
      "text": {
        "primary":   { "$value": "#1A1D2E", "$type": "color" },
        "secondary": { "$value": "#6B7280", "$type": "color" },
        "muted":     { "$value": "#9CA3AF", "$type": "color" },
      },
      "radius": {
        "sm":      { "$value": "6px",  "$type": "dimension" },
        "DEFAULT": { "$value": "10px", "$type": "dimension" },
        "lg":      { "$value": "14px", "$type": "dimension" },
      },
      "semantic": {
        "success": { "$value": "#10B981", "$type": "color" },
        "danger":  { "$value": "#EF4444", "$type": "color" },
        "info":    { "$value": "#3B82F6", "$type": "color" },
        "warn":    { "$value": "#F59E0B", "$type": "color" },
      },
      "spacing": {
        "1": { "$value": "4px",  "$type": "dimension" },
        "2": { "$value": "8px",  "$type": "dimension" },
        "3": { "$value": "12px", "$type": "dimension" },
        "4": { "$value": "16px", "$type": "dimension" },
        "5": { "$value": "20px", "$type": "dimension" },
        "6": { "$value": "24px", "$type": "dimension" },
        "8": { "$value": "32px", "$type": "dimension" },
        "10": { "$value": "40px", "$type": "dimension" },
        "12": { "$value": "48px", "$type": "dimension" },
        "16": { "$value": "64px", "$type": "dimension" },
      },
    }
    const blob = new Blob([JSON.stringify(tokens, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'kb-design-tokens.json'; a.click()
    URL.revokeObjectURL(url)
  }

  const ICON_GROUPS = [
    {
      label: '导航 & 布局',
      icons: [
        { icon: Home, name: 'Home' }, { icon: Settings, name: 'Settings' },
        { icon: ChevronDown, name: 'ChevronDown' }, { icon: ChevronRight, name: 'ChevronRight' },
        { icon: ArrowRight, name: 'ArrowRight' }, { icon: Filter, name: 'Filter' },
        { icon: Search, name: 'Search' }, { icon: LogOut, name: 'LogOut' },
      ],
    },
    {
      label: '文件 & 内容',
      icons: [
        { icon: FileText, name: 'FileText' }, { icon: Folder, name: 'Folder' },
        { icon: Upload, name: 'Upload' }, { icon: Download, name: 'Download' },
        { icon: Copy, name: 'Copy' }, { icon: Edit, name: 'Edit' },
        { icon: Trash2, name: 'Trash2' }, { icon: Eye, name: 'Eye' },
      ],
    },
    {
      label: '操作 & 状态',
      icons: [
        { icon: Plus, name: 'Plus' }, { icon: Check, name: 'Check' },
        { icon: X, name: 'X' }, { icon: RefreshCw, name: 'RefreshCw' },
        { icon: Loader, name: 'Loader' }, { icon: Lock, name: 'Lock' },
        { icon: Bell, name: 'Bell' }, { icon: Star, name: 'Star' },
      ],
    },
    {
      label: '业务 & 数据',
      icons: [
        { icon: Brain, name: 'Brain' }, { icon: MessageSquare, name: 'MessageSquare' },
        { icon: ClipboardCheck, name: 'ClipboardCheck' }, { icon: Zap, name: 'Zap' },
        { icon: BarChart2, name: 'BarChart2' }, { icon: Calendar, name: 'Calendar' },
        { icon: User, name: 'User' }, { icon: Table2, name: 'Table2' },
      ],
    },
  ]

  return (
    <div className="flex min-h-screen bg-canvas">

      {/* ── Left nav ─────────────────────────────────────────────────────── */}
      <aside className="w-56 flex-shrink-0 border-r border-line bg-surface flex flex-col sticky top-0 h-screen overflow-y-auto">
        <div className="h-14 flex items-center gap-2.5 px-5 border-b border-line flex-shrink-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#FF8D1A,#D96400)' }}>
            <BookOpen size={13} className="text-white" />
          </div>
          <div>
            <p className="text-xs font-bold text-ink leading-none">Design System</p>
            <p className="text-[10px] text-ink-muted leading-none mt-0.5">v1.1 · KB System</p>
          </div>
        </div>

        <nav className="flex-1 py-3 px-2">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium transition-colors mb-0.5 ${
                active === id
                  ? 'bg-brand-light text-brand-deep'
                  : 'text-ink-secondary hover:bg-canvas hover:text-ink'
              }`}
            >
              <Icon size={14} className="flex-shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        <div className="border-t border-line px-4 py-3 flex-shrink-0">
          <a href="/ds.md" target="_blank" rel="noreferrer"
            className="flex items-center gap-2 text-xs text-ink-secondary hover:text-brand-deep">
            <CodeIcon size={12} /> Markdown 版（AI 可读）
          </a>
          <a href="/llms.txt" target="_blank" rel="noreferrer"
            className="flex items-center gap-2 text-xs text-ink-secondary hover:text-brand-deep mt-1">
            <FileText size={12} /> llms.txt
          </a>
        </div>
      </aside>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <main className="flex-1 px-12 py-10 max-w-5xl">

        {/* ── Intro ──────────────────────────────────────────────────────── */}
        <Section id="intro" title="KB System Design System" subtitle="为纷享销客 CRM 知识库管理系统设计的视觉规范与组件库，可供其他内部项目直接复用">
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: '设计原则', desc: '清晰 · 高效 · 一致。用橙色作为主品牌色，建立可信赖的企业级视觉语言。' },
              { label: '技术栈',   desc: 'React + TypeScript + Tailwind CSS v3。所有 token 通过 CSS 变量统一管理。' },
              { label: '使用方式', desc: '优先使用 Tailwind 工具类（bg-brand, text-ink…），复杂样式用 index.css 组件类。' },
            ].map(({ label, desc }) => (
              <div key={label} className="card p-5">
                <p className="text-sm font-semibold text-ink mb-2">{label}</p>
                <p className="text-xs text-ink-secondary leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center gap-3 p-4 rounded-lg bg-brand-light border border-orange-200">
            <Download size={16} style={{ color: 'var(--accent)' }} className="flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink">下载 Design Token</p>
              <p className="text-xs text-ink-secondary mt-0.5">提供 CSS 变量和 JSON 两种格式，可直接用于其他项目或 Figma 设计工具</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={downloadCSSTokens} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-line bg-surface text-ink hover:border-brand hover:text-brand transition-colors">
                <Download size={11} /> CSS 变量
              </button>
              <button onClick={downloadJSONTokens} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-line bg-surface text-ink hover:border-brand hover:text-brand transition-colors">
                <Download size={11} /> JSON
              </button>
            </div>
          </div>
        </Section>

        {/* ── Colors ─────────────────────────────────────────────────────── */}
        <Section id="colors" title="颜色" subtitle="所有颜色通过 CSS 自定义属性定义，Tailwind config 以 var(--*) 形式引用">
          <SubSection title="品牌色 · Brand">
            <div className="grid grid-cols-4 gap-4 mb-2">
              <Swatch hex="#FF8D1A" name="brand"       tw="bg-brand / text-brand" />
              <Swatch hex="#D96400" name="brand-deep"  tw="bg-brand-deep / text-brand-deep" />
              <Swatch hex="#FFB066" name="brand-mid"   tw="bg-brand-mid" />
              <Swatch hex="#FFF4E6" name="brand-light" tw="bg-brand-light" text />
            </div>
            <p className="text-xs text-ink-muted">点击色块可复制 Hex 值</p>
          </SubSection>

          <SubSection title="文字色 · Ink">
            <div className="grid grid-cols-3 gap-4">
              <Swatch hex="#1A1D2E" name="ink"           tw="text-ink" />
              <Swatch hex="#6B7280" name="ink-secondary" tw="text-ink-secondary" />
              <Swatch hex="#9CA3AF" name="ink-muted"     tw="text-ink-muted" />
            </div>
          </SubSection>

          <SubSection title="背景 & 边框 · Surface / Line">
            <div className="grid grid-cols-4 gap-4">
              <Swatch hex="#FFFFFF" name="surface"      tw="bg-surface"      text />
              <Swatch hex="#F5F6FA" name="canvas"       tw="bg-canvas"       text />
              <Swatch hex="#E8E9EE" name="line"         tw="border-line"     text />
              <Swatch hex="#D0D3DE" name="line-strong"  tw="border-line-strong" text />
            </div>
          </SubSection>

          <SubSection title="语义色 · Semantic">
            <div className="grid grid-cols-4 gap-4 mb-6">
              <Swatch hex="#10B981" name="success"       tw="text-success" />
              <Swatch hex="#059669" name="success-deep"  tw="text-success-deep" />
              <Swatch hex="#ECFDF5" name="success-light" tw="bg-success-light" text />
              <div/>
              <Swatch hex="#EF4444" name="danger"        tw="text-danger" />
              <Swatch hex="#DC2626" name="danger-deep"   tw="text-danger-deep" />
              <Swatch hex="#FFF1F2" name="danger-light"  tw="bg-danger-light" text />
              <div/>
              <Swatch hex="#3B82F6" name="info"          tw="text-info" />
              <Swatch hex="#2563EB" name="info-deep"     tw="text-info-deep" />
              <Swatch hex="#EFF6FF" name="info-light"    tw="bg-info-light" text />
              <div/>
              <Swatch hex="#F59E0B" name="warn"          tw="text-warn" />
              <Swatch hex="#B45309" name="warn-deep"     tw="text-warn-deep" />
              <Swatch hex="#FFFBEB" name="warn-light"    tw="bg-warn-light" text />
              <div/>
              <Swatch hex="#8B5CF6" name="accent2"       tw="text-accent2" />
              <Swatch hex="#7C3AED" name="accent2-deep"  tw="text-accent2-deep" />
              <Swatch hex="#F5F3FF" name="accent2-light" tw="bg-accent2-light" text />
            </div>
          </SubSection>
        </Section>

        {/* ── Typography ─────────────────────────────────────────────────── */}
        <Section id="typography" title="字体" subtitle="使用系统字体栈，-webkit-font-smoothing: antialiased 全局开启">
          <SubSection title="字号 · Font Size">
            <div className="bg-surface border border-line rounded-lg overflow-hidden">
              {[
                { cls: 'text-2xs', size: '11.5px / 1.6', sample: '徽章文字 · Badge label',  use: 'badge, 次要标注' },
                { cls: 'text-xs',  size: '12px / 1.5',   sample: '辅助信息 · Caption text',  use: '表格辅助列、时间戳' },
                { cls: 'text-sm',  size: '14px / 1.5',   sample: '正文 · Body text',          use: '卡片内容、按钮' },
                { cls: 'text-base',size: '16px / 1.5',   sample: '大正文 · Large body',        use: '段落、输入值' },
                { cls: 'text-lg',  size: '18px / 1.75',  sample: '次标题 · Subheading',        use: '模态标题' },
                { cls: 'text-xl',  size: '20px / 1.75',  sample: '标题 · Heading',             use: '页面模块标题' },
                { cls: 'text-2xl', size: '24px / 2',     sample: '页面标题 · Page Title',       use: '.page-head h2 (22px)' },
              ].map(({ cls, size, sample, use }) => (
                <div key={cls} className="flex items-baseline gap-6 px-5 py-3 border-b border-line last:border-0 hover:bg-canvas transition-colors">
                  <span className="w-20 font-mono text-xs text-brand-deep flex-shrink-0">{cls}</span>
                  <span className={`${cls} text-ink flex-1`}>{sample}</span>
                  <span className="text-xs text-ink-muted w-28 text-right flex-shrink-0">{size}</span>
                  <span className="text-xs text-ink-muted/70 w-36 text-right flex-shrink-0 hidden lg:block">{use}</span>
                </div>
              ))}
            </div>
          </SubSection>

          <SubSection title="字重 · Font Weight">
            <div className="grid grid-cols-4 gap-4">
              {[
                { w: 'font-normal',   label: '400 Regular',  sample: '普通正文' },
                { w: 'font-medium',   label: '500 Medium',   sample: '按钮 / 导航' },
                { w: 'font-semibold', label: '600 Semibold', sample: '卡片标题' },
                { w: 'font-bold',     label: '700 Bold',     sample: '页面标题' },
              ].map(({ w, label, sample }) => (
                <div key={w} className="bg-surface border border-line rounded-lg p-4">
                  <p className={`text-xl text-ink mb-1 ${w}`}>{sample}</p>
                  <p className="text-xs font-mono text-ink-muted">{w}</p>
                  <p className="text-xs text-ink-muted">{label}</p>
                </div>
              ))}
            </div>
          </SubSection>
        </Section>

        {/* ── Spacing ────────────────────────────────────────────────────── */}
        <Section id="spacing" title="间距系统" subtitle="基于 4px 基准网格，所有间距值均为 4 的倍数">
          <SubSection title="间距刻度 · Spacing Scale">
            <div className="space-y-2">
              {[
                { step: '1',  px: '4px',   tw: 'p-1 / m-1 / gap-1' },
                { step: '2',  px: '8px',   tw: 'p-2 / m-2 / gap-2' },
                { step: '3',  px: '12px',  tw: 'p-3 / m-3 / gap-3' },
                { step: '4',  px: '16px',  tw: 'p-4 / m-4 / gap-4' },
                { step: '5',  px: '20px',  tw: 'p-5 / m-5 / gap-5' },
                { step: '6',  px: '24px',  tw: 'p-6 / m-6 / gap-6' },
                { step: '8',  px: '32px',  tw: 'p-8 / m-8 / gap-8' },
                { step: '10', px: '40px',  tw: 'p-10 / m-10 / gap-10' },
                { step: '12', px: '48px',  tw: 'p-12 / m-12 / gap-12' },
                { step: '16', px: '64px',  tw: 'p-16 / m-16 / gap-16' },
              ].map(({ step, px, tw }) => (
                <div key={step} className="flex items-center gap-4">
                  <span className="w-8 text-xs font-mono text-ink-muted text-right flex-shrink-0">{step}</span>
                  <div
                    className="bg-brand/20 border border-brand/30 rounded flex-shrink-0"
                    style={{ width: px, height: '20px' }}
                  />
                  <span className="text-xs font-mono text-brand-deep w-12 flex-shrink-0">{px}</span>
                  <span className="text-xs text-ink-muted">{tw}</span>
                </div>
              ))}
            </div>
          </SubSection>

          <SubSection title="使用规范 · Usage Guidelines">
            <div className="grid grid-cols-2 gap-4">
              {[
                { title: '组件内部间距',    items: ['按钮内边距：px-3.5 py-2（sm）/ px-4 py-2.5（md）', '卡片内容区：p-5', '表格单元格：px-4 py-3', '输入框：px-3 py-2'] },
                { title: '组件间距离',      items: ['同组按钮间：gap-2', '表单字段间：gap-4', '卡片与卡片：gap-4 ~ gap-6', '页面模块间：mb-8 ~ mb-16'] },
                { title: '页面布局间距',    items: ['侧边栏宽度：224px', '内容区左右 padding：px-8 ~ px-12', '顶部页标题下方：mb-7（28px）', '区块间距：mb-16（64px）'] },
                { title: '避免使用',        items: ['奇数像素值（3px、7px）', '非 4 倍数的任意值（例：p-[15px]）', '过大的任意间距（例：p-[100px]）', '混用 px 和 rem 单位'] },
              ].map(({ title, items }) => (
                <div key={title} className="bg-surface border border-line rounded-lg p-4">
                  <p className="text-xs font-semibold text-ink mb-3">{title}</p>
                  <ul className="space-y-1.5">
                    {items.map(item => (
                      <li key={item} className="text-xs text-ink-secondary flex items-start gap-2">
                        <span className="text-brand mt-0.5 flex-shrink-0">·</span>{item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </SubSection>
        </Section>

        {/* ── Radius / Shadow ─────────────────────────────────────────────── */}
        <Section id="radiusshadow" title="圆角 & 阴影" subtitle="统一的视觉层次感">
          <SubSection title="圆角 · Border Radius">
            <div className="flex flex-wrap gap-5">
              {[
                { r: '6px',    cls: 'rounded-sm',   label: 'sm · 6px',   use: '按钮、输入框、徽章' },
                { r: '10px',   cls: 'rounded',      label: 'md · 10px',  use: '下拉、提示条' },
                { r: '14px',   cls: 'rounded-lg',   label: 'lg · 14px',  use: '卡片、数据卡' },
                { r: '18px',   cls: 'rounded-xl',   label: 'xl · 18px',  use: '登录卡片' },
                { r: '9999px', cls: 'rounded-full', label: 'full',       use: '头像、圆形按钮' },
              ].map(({ r, cls, label, use }) => (
                <div key={cls} className="flex flex-col items-center gap-2">
                  <div className="w-20 h-20 bg-brand-light border-2 border-brand/30 flex items-center justify-center" style={{ borderRadius: r }}>
                    <span className="text-xs font-mono text-brand-deep">{r}</span>
                  </div>
                  <p className="text-xs font-mono text-ink text-center">{cls}</p>
                  <p className="text-xs text-ink-muted text-center">{use}</p>
                </div>
              ))}
            </div>
          </SubSection>

          <SubSection title="阴影 · Box Shadow">
            <div className="grid grid-cols-3 gap-4">
              {[
                { cls: 'shadow-sm',       label: 'shadow-sm',       use: '轻微浮起' },
                { cls: 'shadow',          label: 'shadow',          use: '卡片 hover' },
                { cls: 'shadow-lg',       label: 'shadow-lg',       use: '模态框、登录卡' },
                { cls: 'shadow-brand',    label: 'shadow-brand',    use: '品牌按钮 resting' },
                { cls: 'shadow-brand-lg', label: 'shadow-brand-lg', use: '品牌按钮 hover' },
                { cls: 'shadow-success',  label: 'shadow-success',  use: '成功按钮' },
              ].map(({ cls, label, use }) => (
                <div key={cls} className={`bg-surface rounded-lg p-5 ${cls}`}>
                  <p className="text-sm font-mono text-ink">{label}</p>
                  <p className="text-xs text-ink-muted mt-1">{use}</p>
                </div>
              ))}
            </div>
          </SubSection>
        </Section>

        {/* ── Buttons ────────────────────────────────────────────────────── */}
        <Section id="buttons" title="按钮" subtitle="使用 .ds-btn 基础类 + 变体修饰类">
          <LiveExample
            label="所有变体 · All Variants"
            code={`<button class="ds-btn">默认按钮</button>
<button class="ds-btn ds-btn-primary">主要操作</button>
<button class="ds-btn ds-btn-success">成功操作</button>
<button class="ds-btn ds-btn-danger">危险操作</button>
<button class="ds-btn" disabled>禁用状态</button>`}
          >
            <button className="ds-btn">默认按钮</button>
            <button className="ds-btn ds-btn-primary">主要操作</button>
            <button className="ds-btn ds-btn-success">成功操作</button>
            <button className="ds-btn ds-btn-danger">危险操作</button>
            <button className="ds-btn" disabled>禁用状态</button>
          </LiveExample>

          <LiveExample label="带图标 · With Icon">
            <button className="ds-btn ds-btn-primary flex items-center gap-1.5">
              <Plus size={14} /> 新建文档
            </button>
            <button className="ds-btn flex items-center gap-1.5">
              <Download size={14} /> 导出
            </button>
            <button className="ds-btn ds-btn-danger flex items-center gap-1.5">
              <Trash2 size={14} /> 删除
            </button>
            <button className="ds-btn flex items-center gap-1.5">
              <RefreshCw size={14} /> 刷新
            </button>
          </LiveExample>

          <LiveExample label="尺寸 · Sizes" code={`<button class="ds-btn text-xs px-2.5 py-1">小号</button>
<button class="ds-btn">默认</button>
<button class="ds-btn text-base px-5 py-2.5">大号</button>`}>
            <button className="ds-btn text-xs px-2.5 py-1">小号 xs</button>
            <button className="ds-btn">默认 sm</button>
            <button className="ds-btn text-base px-5 py-2.5">大号 base</button>
          </LiveExample>

          <div className="bg-surface border border-line rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-canvas">
                <tr>{['类名', '用途', '颜色'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary uppercase tracking-wider border-b border-line">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {[
                  { cls: '.ds-btn',         use: '基础类，必须加',      color: '白底 / 灰边框' },
                  { cls: '.ds-btn-primary', use: '主要操作（页面唯一）', color: '品牌橙渐变' },
                  { cls: '.ds-btn-success', use: '确认 / 保存 / 提交',  color: '绿色渐变' },
                  { cls: '.ds-btn-danger',  use: '删除 / 不可逆操作',   color: '红色描边' },
                ].map(({ cls, use, color }) => (
                  <tr key={cls} className="border-b border-line last:border-0 hover:bg-canvas">
                    <td className="px-4 py-3 font-mono text-xs text-brand-deep">{cls}</td>
                    <td className="px-4 py-3 text-xs text-ink">{use}</td>
                    <td className="px-4 py-3 text-xs text-ink-secondary">{color}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── Badges ─────────────────────────────────────────────────────── */}
        <Section id="badges" title="徽章" subtitle="用 .badge + 颜色修饰类。前置圆点自动生成（::before）">
          <LiveExample
            label="所有颜色 · All Colors"
            code={`<span class="badge green">已完成</span>
<span class="badge orange">待审核</span>
<span class="badge blue">进行中</span>
<span class="badge red">已拒绝</span>
<span class="badge purple">知识挑战</span>
<span class="badge amber">待跟进</span>
<span class="badge gray">归档</span>`}
          >
            <span className="badge green">已完成</span>
            <span className="badge orange">待审核</span>
            <span className="badge blue">进行中</span>
            <span className="badge red">已拒绝</span>
            <span className="badge purple">知识挑战</span>
            <span className="badge amber">待跟进</span>
            <span className="badge gray">归档</span>
          </LiveExample>

          <div className="bg-surface border border-line rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-canvas">
                <tr>{['修饰类', '前景色', '背景色', '语义'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary uppercase tracking-wider border-b border-line">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {[
                  { mod: 'green',  fg: '#059669', bg: '#ECFDF5', sem: '成功、已完成' },
                  { mod: 'orange', fg: '#C2410C', bg: '#FFF7ED', sem: '待处理、警告' },
                  { mod: 'blue',   fg: '#2563EB', bg: '#EFF6FF', sem: '进行中、信息' },
                  { mod: 'red',    fg: '#DC2626', bg: '#FFF1F2', sem: '错误、拒绝' },
                  { mod: 'purple', fg: '#7C3AED', bg: '#F5F3FF', sem: '挑战、特殊' },
                  { mod: 'amber',  fg: '#B45309', bg: '#FFFBEB', sem: '待跟进、次警告' },
                  { mod: 'gray',   fg: '#6B7280', bg: '#F3F4F6', sem: '中性、归档' },
                ].map(({ mod, fg, bg, sem }) => (
                  <tr key={mod} className="border-b border-line last:border-0 hover:bg-canvas">
                    <td className="px-4 py-2.5 font-mono text-xs text-brand-deep">.badge.{mod}</td>
                    <td className="px-4 py-2.5"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: fg }}/><span className="font-mono text-xs text-ink">{fg}</span></div></td>
                    <td className="px-4 py-2.5"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full border border-line flex-shrink-0" style={{ background: bg }}/><span className="font-mono text-xs text-ink">{bg}</span></div></td>
                    <td className="px-4 py-2.5 text-xs text-ink-secondary">{sem}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── Cards ──────────────────────────────────────────────────────── */}
        <Section id="cards" title="卡片" subtitle=".card + .card-head 组合。内容区无默认 padding，按需添加">
          <LiveExample label="带标题卡片 · Card with Header" code={`<div class="card">
  <div class="card-head">
    <h3>文档列表</h3>
    <button class="ds-btn ds-btn-primary">上传</button>
  </div>
  <div class="p-5">卡片内容</div>
</div>`}>
            <div className="card w-full max-w-md">
              <div className="card-head">
                <h3>文档列表</h3>
                <button className="ds-btn ds-btn-primary text-xs px-3 py-1.5">上传文档</button>
              </div>
              <div className="p-5">
                <p className="text-sm text-ink-secondary">卡片内容区域，padding 按需自行添加。</p>
              </div>
            </div>
          </LiveExample>

          <LiveExample label="数据卡片 · Stat Card" code={`<div class="stat">
  <div class="stat-icon orange"><!-- icon --></div>
  <div class="stat-body">
    <p class="stat-label">知识切片</p>
    <p class="stat-value">2,341</p>
  </div>
</div>`}>
            {[
              { color: 'orange', label: '知识切片', value: '2,341', icon: '📄' },
              { color: 'blue',   label: '向量检索', value: '18,492', icon: '🔍' },
              { color: 'green',  label: '挑战通过', value: '87%',    icon: '✅' },
              { color: 'purple', label: '文档总数', value: '156',    icon: '📚' },
            ].map(({ color, label, value, icon }) => (
              <div key={label} className="stat flex-1 min-w-0" style={{ minWidth: 160 }}>
                <div className={`stat-icon ${color}`}>{icon}</div>
                <div className="stat-body">
                  <p className="stat-label">{label}</p>
                  <p className="stat-value">{value}</p>
                </div>
              </div>
            ))}
          </LiveExample>
        </Section>

        {/* ── Alerts ─────────────────────────────────────────────────────── */}
        <Section id="alerts" title="提示条" subtitle=".info-bar + 颜色修饰类。支持作为 <a> 标签使用">
          <LiveExample
            label="提示条变体 · Info Bar Variants"
            code={`<div class="info-bar orange">⚠️ 有 3 个切片置信度低于阈值，等待审核。</div>
<div class="info-bar blue">ℹ️ 系统每日凌晨 2:00 自动触发知识挑战。</div>`}
          >
            <div className="w-full flex flex-col gap-3">
              <div className="info-bar orange">⚠️ 有 3 个切片置信度低于阈值，需要人工审核。</div>
              <div className="info-bar blue">ℹ️ 系统每日凌晨 2:00 自动触发知识挑战评测。</div>
            </div>
          </LiveExample>
        </Section>

        {/* ── Forms ──────────────────────────────────────────────────────── */}
        <Section id="inputs" title="表单" subtitle="聚焦时自动切换成品牌橙色描边（index.css 全局覆盖）">
          <SubSection title="文本输入 · Text Input">
            <LiveExample label="输入框状态" code={`<input type="text"
  class="w-full px-3 py-2 text-sm border border-line rounded-sm
         bg-surface text-ink placeholder:text-ink-muted focus:outline-none"
  placeholder="输入关键词…"
/>`}>
              <div className="w-full max-w-sm flex flex-col gap-3">
                <input type="text" className="w-full px-3 py-2 text-sm border border-line rounded-sm bg-surface text-ink placeholder:text-ink-muted focus:outline-none" placeholder="默认状态…" />
                <input type="text" className="w-full px-3 py-2 text-sm border border-line rounded-sm bg-surface text-ink focus:outline-none" defaultValue="已填入内容" />
                <input type="text" className="w-full px-3 py-2 text-sm border border-line rounded-sm bg-canvas text-ink-muted cursor-not-allowed focus:outline-none" placeholder="禁用状态" disabled />
              </div>
            </LiveExample>
          </SubSection>

          <SubSection title="多行文本 · Textarea">
            <LiveExample label="Textarea">
              <textarea className="w-full max-w-md px-3 py-2 text-sm border border-line rounded bg-surface text-ink placeholder:text-ink-muted focus:outline-none resize-none" rows={3} placeholder="输入详细描述…" />
            </LiveExample>
          </SubSection>

          <SubSection title="选择框 · Select">
            <LiveExample label="Select">
              <select className="px-3 py-2 text-sm border border-line rounded-sm bg-surface text-ink focus:outline-none">
                <option>全部阶段</option>
                <option>线索</option>
                <option>商机</option>
                <option>合同</option>
                <option>回款</option>
              </select>
            </LiveExample>
          </SubSection>

          <SubSection title="复选框 & 单选 · Checkbox & Radio">
            <LiveExample label="Checkbox / Radio" code={`<label class="ds-check">
  <input type="checkbox" /> 启用自动触发
</label>
<label class="ds-check">
  <input type="radio" name="stage" /> 线索阶段
</label>`}>
              <div className="flex flex-col gap-3">
                <label className="ds-check"><input type="checkbox" defaultChecked /> 启用自动触发</label>
                <label className="ds-check"><input type="checkbox" /> 发送邮件通知</label>
                <label className="ds-check"><input type="checkbox" disabled /> 高级模式（暂不可用）</label>
              </div>
              <div className="flex flex-col gap-3">
                <label className="ds-check"><input type="radio" name="stage" defaultChecked /> 线索</label>
                <label className="ds-check"><input type="radio" name="stage" /> 商机</label>
                <label className="ds-check"><input type="radio" name="stage" /> 回款</label>
              </div>
            </LiveExample>
          </SubSection>

          <SubSection title="开关 · Toggle">
            <LiveExample label="Toggle Switch" code={`<label class="ds-toggle">
  <input type="checkbox" checked />
  <span class="ds-toggle-track"></span>
</label>`}>
              <div className="flex items-center gap-4">
                <label className="ds-toggle">
                  <input type="checkbox" checked={toggleVal} onChange={e => setToggleVal(e.target.checked)} />
                  <span className="ds-toggle-track" />
                </label>
                <span className="text-sm text-ink">{toggleVal ? '已启用' : '已禁用'}</span>
              </div>
              <div className="flex items-center gap-4">
                <label className="ds-toggle">
                  <input type="checkbox" disabled />
                  <span className="ds-toggle-track" />
                </label>
                <span className="text-sm text-ink-muted">禁用状态</span>
              </div>
            </LiveExample>
          </SubSection>

          <SubSection title="完整表单示例 · Form Layout">
            <LiveExample label="带标签的表单行 · Labeled Form">
              <div className="w-full max-w-md flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-medium text-ink-secondary mb-1.5">项目名称 <span className="text-danger">*</span></label>
                  <input type="text" className="w-full px-3 py-2 text-sm border border-line rounded-sm bg-surface text-ink placeholder:text-ink-muted focus:outline-none" placeholder="例：纷享销客 2024 实施项目" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-secondary mb-1.5">所属行业</label>
                  <select className="w-full px-3 py-2 text-sm border border-line rounded-sm bg-surface text-ink focus:outline-none">
                    <option>制造业</option><option>金融业</option><option>零售业</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-secondary mb-1.5">项目描述</label>
                  <textarea className="w-full px-3 py-2 text-sm border border-line rounded bg-surface text-ink placeholder:text-ink-muted focus:outline-none resize-none" rows={2} placeholder="可选" />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button className="ds-btn text-sm">取消</button>
                  <button className="ds-btn ds-btn-primary text-sm">保存项目</button>
                </div>
              </div>
            </LiveExample>
          </SubSection>

          <div className="info-bar orange text-sm">
            ⚠️ 焦点样式在 <code className="font-mono text-xs bg-brand-light px-1 rounded">index.css</code> 全局声明，无需在每个 input 上单独添加 focus:ring-* 类。
          </div>
        </Section>

        {/* ── Tables ─────────────────────────────────────────────────────── */}
        <Section id="tables" title="表格" subtitle="使用 .ds-table 类，搭配 .card 容器实现圆角边框">
          <SubSection title="基础表格 · Basic Table">
            <LiveExample label="带状态与操作列" code={`<div class="card">
  <table class="ds-table">
    <thead><tr><th>文件名</th><th>状态</th><th>操作</th></tr></thead>
    <tbody>
      <tr><td>文件.pdf</td><td><span class="badge green">完成</span></td>
          <td><button class="ds-btn text-xs">查看</button></td></tr>
    </tbody>
  </table>
</div>`}>
              <div className="card w-full overflow-hidden">
                <table className="ds-table">
                  <thead>
                    <tr>
                      <th>文件名</th>
                      <th>格式</th>
                      <th>状态</th>
                      <th>上传时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: '纷享销客实施手册 v3.2.pdf', fmt: 'PDF', status: 'completed', time: '2024-04-18 14:22' },
                      { name: '商机管理最佳实践.docx',      fmt: 'DOCX', status: 'slicing',   time: '2024-04-18 13:10' },
                      { name: '回款认领流程图.xlsx',        fmt: 'XLSX', status: 'failed',    time: '2024-04-17 09:45' },
                    ].map(({ name, fmt, status, time }) => (
                      <tr key={name}>
                        <td className="max-w-xs truncate">{name}</td>
                        <td><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded uppercase">{fmt}</span></td>
                        <td>
                          <span className={`badge ${status === 'completed' ? 'green' : status === 'slicing' ? 'blue' : 'red'}`}>
                            {status === 'completed' ? '完成' : status === 'slicing' ? '切片中' : '失败'}
                          </span>
                        </td>
                        <td className="text-ink-muted">{time}</td>
                        <td>
                          <button className="ds-btn text-xs py-1 px-2.5">查看</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </LiveExample>
          </SubSection>

          <SubSection title="斑马纹 · Striped">
            <div className="card overflow-hidden">
              <table className="ds-table striped">
                <thead>
                  <tr><th>LTC 阶段</th><th>切片数</th><th>平均置信度</th><th>最近更新</th></tr>
                </thead>
                <tbody>
                  {[
                    { stage: '线索', count: 312,  conf: '94%', date: '今天' },
                    { stage: '商机', count: 489,  conf: '91%', date: '昨天' },
                    { stage: '报价', count: 156,  conf: '88%', date: '3天前' },
                    { stage: '合同', count: 234,  conf: '92%', date: '今天' },
                    { stage: '回款', count: 178,  conf: '89%', date: '2天前' },
                    { stage: '售后', count: 97,   conf: '85%', date: '5天前' },
                  ].map(({ stage, count, conf, date }) => (
                    <tr key={stage}>
                      <td><span className="badge orange">{stage}</span></td>
                      <td className="font-mono">{count}</td>
                      <td className="font-mono">{conf}</td>
                      <td className="text-ink-muted">{date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SubSection>
        </Section>

        {/* ── DataTable (advanced) ───────────────────────────────────────── */}
        <DataTableSection />

        {/* ── Modals ─────────────────────────────────────────────────────── */}
        <ModalSection />

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
        <Section id="tabs" title="标签页" subtitle="使用 .ds-tabs + .ds-tab 类，is-active 状态由 JS 控制">
          <SubSection title="交互演示 · Interactive Demo">
            <TabDemo />
            <Code>{`const [active, setActive] = useState(0)
const tabs = ['概览', '文档', '成员', '设置']

<div class="ds-tabs">
  {tabs.map((t, i) => (
    <button
      class={\`ds-tab\${active === i ? ' is-active' : ''}\`}
      onClick={() => setActive(i)}
    >{t}</button>
  ))}
</div>
<div>{/* 根据 active 渲染对应内容 */}</div>`}
            </Code>
          </SubSection>

          <SubSection title="样式说明">
            <div className="bg-surface border border-line rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-canvas">
                  <tr>{['类名', '说明'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-ink-secondary uppercase tracking-wider border-b border-line">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {[
                    { cls: '.ds-tabs',    desc: '容器，flex 行，带底边框' },
                    { cls: '.ds-tab',     desc: '单个 Tab 按钮，默认灰色文字' },
                    { cls: '.is-active',  desc: '激活状态：橙色文字 + 底部品牌色下划线' },
                  ].map(({ cls, desc }) => (
                    <tr key={cls} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 font-mono text-xs text-brand-deep">{cls}</td>
                      <td className="px-4 py-3 text-xs text-ink-secondary">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SubSection>
        </Section>

        {/* ── Loading ────────────────────────────────────────────────────── */}
        <Section id="loading" title="加载状态" subtitle="旋转 Loader 图标 + 骨架屏两种模式">
          <SubSection title="旋转图标 · Spinner">
            <LiveExample label="Spinner 尺寸" code={`import { Loader } from 'lucide-react'

<Loader size={16} className="animate-spin text-brand" />
<Loader size={24} className="animate-spin text-brand" />
<Loader size={32} className="animate-spin text-brand" />`}>
              <Loader size={16} className="animate-spin" style={{ color: 'var(--accent)' }} />
              <Loader size={24} className="animate-spin" style={{ color: 'var(--accent)' }} />
              <Loader size={32} className="animate-spin" style={{ color: 'var(--accent)' }} />
              <div className="flex items-center gap-2 text-sm text-ink-secondary">
                <Loader size={16} className="animate-spin" style={{ color: 'var(--accent)' }} />
                加载中…
              </div>
            </LiveExample>
          </SubSection>

          <SubSection title="骨架屏 · Skeleton">
            <LiveExample label="Skeleton Placeholder" code={`<div class="skeleton h-4 w-48 mb-2"></div>
<div class="skeleton h-4 w-32 mb-2"></div>
<div class="skeleton h-4 w-56"></div>`}>
              <div className="w-full max-w-sm space-y-3">
                {/* Card-like skeleton */}
                <div className="card p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="skeleton w-10 h-10 rounded-lg block flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <span className="skeleton h-3.5 w-32 block" />
                      <span className="skeleton h-3 w-20 block" />
                    </div>
                  </div>
                  <span className="skeleton h-3 w-full block" />
                  <span className="skeleton h-3 w-4/5 block" />
                  <span className="skeleton h-3 w-2/3 block" />
                </div>
              </div>
            </LiveExample>
          </SubSection>

          <SubSection title="按钮加载 · Button Loading">
            <LiveExample label="加载中按钮">
              <button className="ds-btn ds-btn-primary flex items-center gap-2 opacity-75 cursor-not-allowed" disabled>
                <Loader size={13} className="animate-spin" /> 提交中…
              </button>
              <button className="ds-btn flex items-center gap-2 opacity-75 cursor-not-allowed" disabled>
                <Loader size={13} className="animate-spin" /> 加载中
              </button>
            </LiveExample>
          </SubSection>
        </Section>

        {/* ── Empty State ────────────────────────────────────────────────── */}
        <Section id="empty" title="空状态" subtitle="使用 .ds-empty 类，配置图标、标题、描述和可选操作按钮">
          <SubSection title="标准空状态 · Empty States">
            <div className="grid grid-cols-3 gap-4">
              {[
                {
                  icon: FileText, title: '暂无文档',
                  desc: '还没有上传任何文档，点击右上角「上传」开始添加。',
                  action: '上传文档',
                },
                {
                  icon: Search, title: '未找到结果',
                  desc: '没有匹配的内容，试试修改搜索关键词或调整筛选条件。',
                  action: undefined,
                },
                {
                  icon: Brain, title: '尚无挑战记录',
                  desc: '点击「开始挑战」发起首次知识评测，验证知识库质量。',
                  action: '开始挑战',
                },
              ].map(({ icon: Icon, title, desc, action }) => (
                <div key={title} className="card ds-empty">
                  <div className="ds-empty-icon"><Icon size={22} /></div>
                  <h4>{title}</h4>
                  <p>{desc}</p>
                  {action && (
                    <button className="ds-btn ds-btn-primary mt-4 text-xs">{action}</button>
                  )}
                </div>
              ))}
            </div>
          </SubSection>

          <Code>{`<div class="card ds-empty">
  <div class="ds-empty-icon">
    <FileText size={22} />
  </div>
  <h4>暂无文档</h4>
  <p>还没有上传任何文档，点击右上角「上传」开始添加。</p>
  <button class="ds-btn ds-btn-primary mt-4 text-xs">上传文档</button>
</div>`}
          </Code>
        </Section>

        {/* ── Icons ──────────────────────────────────────────────────────── */}
        <Section id="icons" title="图标" subtitle="使用 lucide-react 图标库。统一尺寸规范确保视觉一致性">
          <SubSection title="尺寸规范 · Size Guide">
            <div className="flex flex-wrap gap-6 items-end">
              {[
                { size: 12, use: '极小图标（徽章内）' },
                { size: 14, use: '导航 / 按钮内' },
                { size: 16, use: '行内动作' },
                { size: 18, use: '卡片标题' },
                { size: 20, use: '页面标题' },
                { size: 24, use: '空状态' },
                { size: 32, use: '大图标展示' },
              ].map(({ size, use }) => (
                <div key={size} className="flex flex-col items-center gap-2">
                  <FileText size={size} style={{ color: 'var(--accent)' }} />
                  <span className="text-xs font-mono text-ink">{size}px</span>
                  <span className="text-xs text-ink-muted text-center" style={{ maxWidth: 72 }}>{use}</span>
                </div>
              ))}
            </div>
          </SubSection>

          {ICON_GROUPS.map(({ label, icons }) => (
            <SubSection key={label} title={label}>
              <div className="grid grid-cols-8 gap-3">
                {icons.map(({ icon: Icon, name }) => (
                  <div
                    key={name}
                    className="flex flex-col items-center gap-2 p-3 rounded-lg border border-line bg-surface hover:bg-brand-light hover:border-brand/30 transition-colors cursor-default group"
                  >
                    <Icon size={18} className="text-ink-secondary group-hover:text-brand-deep" />
                    <span className="text-[10px] text-ink-muted text-center leading-tight group-hover:text-brand-deep">{name}</span>
                  </div>
                ))}
              </div>
            </SubSection>
          ))}

          <Code>{`import { FileText, Brain, Loader } from 'lucide-react'

// 基础用法
<FileText size={16} />

// 带颜色
<Brain size={16} style={{ color: 'var(--accent)' }} />

// 旋转动画
<Loader size={16} className="animate-spin text-brand" />`}
          </Code>
        </Section>

        {/* ── Workspace Patterns ─────────────────────────────────────────── */}
        <Section id="workspace" title="工作台模式 · Workspace Patterns" subtitle="2026-04 新增。围绕「项目」组织页面的复合模式：Hero 卡 / 阶段步进器 / 统计卡 / 抽屉式侧栏">

          <SubSection title="Hero Card · 项目头卡">
            <div className="bg-white border border-line rounded-2xl p-5 mb-3">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0"
                     style={{ background: 'linear-gradient(135deg,#FF8D1A,#D96400)' }}>
                  <Building2 size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl font-bold text-ink leading-tight">某某 CRM 系统实施项目</h1>
                  <div className="mt-1.5 flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-ink-secondary">
                    <span>某某科技</span><span>· 制造业</span><span>· 立项 2026-03-01</span><span>· 12 份文档</span>
                  </div>
                </div>
                <button className="px-3 py-1.5 text-xs rounded-lg border border-line text-ink-secondary hover:bg-canvas">编辑</button>
              </div>
            </div>
            <Code>{`<div className="bg-white border border-line rounded-2xl p-5">
  <div className="flex items-start gap-4">
    <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0"
         style={{ background: 'linear-gradient(135deg,#FF8D1A,#D96400)' }}>
      <Building2 size={20} />
    </div>
    <div className="flex-1 min-w-0">
      <h1 className="text-2xl font-bold text-ink leading-tight">{title}</h1>
      <div className="mt-1.5 flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-ink-secondary">
        {/* meta chips: 客户 / 行业 / 立项日 / 文档数 */}
      </div>
    </div>
    <ActionButton />
  </div>
</div>`}</Code>
            <p className="text-xs text-ink-muted mt-2">用法：详情页顶部锁定项目身份。橙渐变方块图标 + 大标题（24px bold）+ 一行 meta（chips by ·）+ 右侧动作按钮。</p>
          </SubSection>

          <SubSection title="Stage Stepper · 阶段步进器">
            <div className="bg-white border border-line rounded-2xl p-5 mb-3">
              <div className="flex items-start">
                {[
                  { label: '项目洞察',  status: 'done' },
                  { label: '启动会',    status: 'done' },
                  { label: '需求调研',  status: 'inflight' },
                  { label: '方案设计',  status: 'idle', active: true },
                  { label: '项目实施',  status: 'locked' },
                  { label: '上线测试',  status: 'locked' },
                  { label: '项目验收',  status: 'locked' },
                ].map((s, i, arr) => (
                  <div key={i} className="flex items-start min-w-[88px] flex-1">
                    <div className="flex flex-col items-center flex-1">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold ${
                        s.status === 'done' ? 'bg-emerald-500 text-white' :
                        s.status === 'inflight' ? 'bg-blue-500 text-white' :
                        s.status === 'locked' ? 'bg-gray-100 text-ink-muted border border-dashed border-gray-300' :
                        'text-white shadow-md ring-4 ring-orange-100'
                      }`} style={s.active ? { background: 'linear-gradient(135deg,#FF8D1A,#D96400)' } : undefined}>
                        {s.status === 'done' ? <CheckCircle2 size={16} /> :
                         s.status === 'inflight' ? <Loader2 size={14} className="animate-spin" /> :
                         s.status === 'locked' ? <Lock size={11} /> : <span>{i + 1}</span>}
                      </div>
                      <span className={`mt-2 text-[11px] text-center px-1 ${
                        s.active ? 'text-ink font-semibold' :
                        s.status === 'locked' ? 'text-ink-muted' : 'text-ink-secondary'
                      }`}>{s.label}</span>
                    </div>
                    {i < arr.length - 1 && (
                      <div className={`h-px flex-1 mt-[18px] ${s.status === 'done' ? 'bg-emerald-300' : 'bg-line'}`} />
                    )}
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-ink-muted mb-2">
              <strong>状态四态：</strong>
              <span className="inline-flex items-center gap-1 mx-2"><span className="w-3 h-3 rounded-full bg-emerald-500"/>done</span>
              <span className="inline-flex items-center gap-1 mx-2"><span className="w-3 h-3 rounded-full bg-blue-500"/>inflight</span>
              <span className="inline-flex items-center gap-1 mx-2"><span className="w-3 h-3 rounded-full" style={{ background: 'linear-gradient(135deg,#FF8D1A,#D96400)' }}/>idle (active)</span>
              <span className="inline-flex items-center gap-1 mx-2"><span className="w-3 h-3 rounded-full bg-gray-100 border border-dashed border-gray-400"/>locked</span>
            </p>
            <Code>{`type Status = 'done' | 'inflight' | 'idle' | 'locked'

// 节点圆 + 标签 + 连接线（最后一个无连接线）
<div className="flex items-start">
  {stages.map((s, i, arr) => (
    <div key={s.key} className="flex items-start min-w-[88px] flex-1">
      <div className="flex flex-col items-center flex-1">
        <button className={\`w-9 h-9 rounded-full ... \${classByStatus(s.status, s.active)}\`}>
          {s.status === 'done' ? <CheckCircle2/> :
           s.status === 'inflight' ? <Loader2 className="animate-spin"/> :
           s.status === 'locked' ? <Lock/> : <span>{i+1}</span>}
        </button>
        <span className="mt-2 text-[11px]">{s.label}</span>
      </div>
      {i < arr.length - 1 && (
        <div className={\`h-px flex-1 mt-[18px] \${s.status === 'done' ? 'bg-emerald-300' : 'bg-line'}\`}/>
      )}
    </div>
  ))}
</div>`}</Code>
          </SubSection>

          <SubSection title="Action Strip · 当前阶段动作条">
            <div className="rounded-xl border border-line bg-canvas/50 px-4 py-3 flex items-center gap-3 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
                     style={{ background: 'linear-gradient(135deg,#FF8D1A,#D96400)' }}>
                  <Lightbulb size={13}/>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">项目洞察</p>
                  <p className="text-[11px] text-ink-muted truncate">尚未生成，可开始对话生成</p>
                </div>
              </div>
              <div className="ml-auto">
                <button className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white rounded-lg shadow-sm"
                        style={{ background: 'linear-gradient(135deg,#FF8D1A,#D96400)' }}>
                  <Sparkles size={11}/> 开始对话生成
                </button>
              </div>
            </div>
            <p className="text-xs text-ink-muted">紧贴步进器下方的状态-动作面板：左侧标签 + 描述文案，右侧动作按钮（预览/下载/重生成 或 开始生成）。</p>
          </SubSection>

          <SubSection title="StatCard · 统计卡">
            <div className="grid grid-cols-3 gap-3 mb-3">
              {[
                { Icon: Building2,    label: '活跃项目',     val: 12, color: '#D96400', bg: 'bg-orange-50' },
                { Icon: CheckCircle2, label: '已生成交付物', val: 38, color: '#059669', bg: 'bg-emerald-50' },
                { Icon: Loader2,      label: '后台进行中',   val: 2,  color: '#2563EB', bg: 'bg-blue-50', spin: true },
              ].map(({ Icon, label, val, color, bg, spin }) => (
                <div key={label} className="bg-white border border-line rounded-2xl p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                    <Icon size={16} style={{ color }} className={spin ? 'animate-spin' : undefined}/>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xl font-bold text-ink leading-none">{val}</p>
                    <p className="text-[11px] text-ink-muted mt-1.5">{label}</p>
                  </div>
                </div>
              ))}
            </div>
            <Code>{`<div className="bg-white border border-line rounded-2xl p-4 flex items-center gap-3">
  <div className={\`w-10 h-10 rounded-xl \${bg} flex items-center justify-center shrink-0\`}>
    <Icon size={16} style={{ color }} />
  </div>
  <div className="min-w-0">
    <p className="text-xl font-bold text-ink leading-none">{value}</p>
    <p className="text-[11px] text-ink-muted mt-1.5">{label}</p>
  </div>
</div>`}</Code>
          </SubSection>

          <SubSection title="Drawer Trigger · 抽屉触发按钮">
            <div className="flex items-center gap-2 mb-3">
              <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-line text-ink-secondary hover:bg-canvas hover:text-ink">
                <ClipboardList size={12}/> 关联文档
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-canvas text-ink-muted">12</span>
              </button>
            </div>
            <p className="text-xs text-ink-muted">右上角次要入口的标准模式：图标 + 标签 + 灰色 pill 计数。点击调用 <code className="px-1 bg-canvas rounded">@/components/Modal</code> 的 <code className="px-1 bg-canvas rounded">Drawer</code>。</p>
          </SubSection>

          <SubSection title="Tab Bar · 双模 Chat 切换">
            <div className="px-4 pt-3 pb-0 border border-line bg-white rounded-xl flex items-end gap-1 mb-3">
              <span className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-t-lg border-b-2 border-[#D96400] text-ink font-semibold bg-orange-50/60">
                <MessageSquare size={12}/> 项目问答
              </span>
              <span className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-t-lg border-b-2 border-transparent text-ink-secondary">
                <Sparkles size={12}/> 生成 · 项目洞察
              </span>
            </div>
            <p className="text-xs text-ink-muted">下划线 Tab：激活态用品牌橙下边框 + 浅橙背景 + 加粗。非激活无边框、灰色文字。</p>
          </SubSection>

          <SubSection title="约束 · Do / Don't">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="border border-emerald-200 bg-emerald-50/40 rounded-xl p-4">
                <p className="text-xs font-semibold text-emerald-700 mb-2">✓ Do</p>
                <ul className="text-xs text-ink-secondary leading-relaxed space-y-1">
                  <li>• 详情页用 <code>h-[calc(100vh-56px)] overflow-hidden flex flex-col</code> 强约束高度，让 chat 输入贴底</li>
                  <li>• 状态色仅 4 种语义：done(绿) / inflight(蓝) / idle/active(橙) / locked(灰虚线)</li>
                  <li>• 锁定状态用 dashed border + Lock 图标，不要混 disabled 灰色按钮</li>
                  <li>• Drawer 可叠层（如「关联文档」抽屉里点文档打开「文档预览」抽屉）</li>
                </ul>
              </div>
              <div className="border border-red-200 bg-red-50/40 rounded-xl p-4">
                <p className="text-xs font-semibold text-red-700 mb-2">✗ Don't</p>
                <ul className="text-xs text-ink-secondary leading-relaxed space-y-1">
                  <li>• 不要用 <code>min-h</code>，会让 chat 输入下方留白</li>
                  <li>• 阶段卡片不要塞预览/下载等小动作（&lt;12px 的密集按钮）— 集中到当前阶段动作条</li>
                  <li>• 不要在同一页堆叠紫/蓝/绿/橙多种品牌色按钮 — 仅橙为主，其他只表达状态</li>
                  <li>• 不在阶段卡内塞图标+文字+按钮三件套，只放数字/图标即可</li>
                </ul>
              </div>
            </div>
          </SubSection>
        </Section>

        {/* ── Token Reference ────────────────────────────────────────────── */}
        <Section id="tokens" title="Token 速查" subtitle="完整 CSS 变量 & Tailwind 工具类对照表">
          <SubSection title="颜色 Token">
            <div className="bg-surface border border-line rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-canvas">
                  <tr>{['CSS 变量', 'Tailwind 类', '值', ''].map((h, i) => (
                    <th key={i} className="text-left px-4 py-2.5 text-xs font-semibold text-ink-secondary uppercase tracking-wider border-b border-line">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {[
                    { css: '--accent',         tw: 'bg-brand / text-brand',           val: '#FF8D1A', hex: '#FF8D1A' },
                    { css: '--accent-deep',    tw: 'bg-brand-deep / text-brand-deep',  val: '#D96400', hex: '#D96400' },
                    { css: '--accent-light',   tw: 'bg-brand-light',                  val: '#FFF4E6', hex: '#FFF4E6' },
                    { css: '--bg',             tw: 'bg-canvas',                       val: '#F5F6FA', hex: '#F5F6FA' },
                    { css: '--surface',        tw: 'bg-surface',                      val: '#FFFFFF', hex: '#FFFFFF' },
                    { css: '--line',           tw: 'border-line',                     val: '#E8E9EE', hex: '#E8E9EE' },
                    { css: '--line-strong',    tw: 'border-line-strong',              val: '#D0D3DE', hex: '#D0D3DE' },
                    { css: '--text-primary',   tw: 'text-ink',                        val: '#1A1D2E', hex: '#1A1D2E' },
                    { css: '--text-secondary', tw: 'text-ink-secondary',              val: '#6B7280', hex: '#6B7280' },
                    { css: '--text-muted',     tw: 'text-ink-muted',                  val: '#9CA3AF', hex: '#9CA3AF' },
                  ].map(({ css, tw, val, hex }) => (
                    <tr key={css} className="border-b border-line last:border-0 hover:bg-canvas">
                      <td className="px-4 py-2.5 font-mono text-xs text-brand-deep">{css}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-info-deep">{tw}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-ink">{val}</td>
                      <td className="px-4 py-2.5"><div className="w-6 h-6 rounded border border-line" style={{ background: hex }}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="其他 Token">
            <div className="bg-surface border border-line rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-canvas">
                  <tr>{['CSS 变量', 'Tailwind 类', '值 / 说明'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-ink-secondary uppercase tracking-wider border-b border-line">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  <TokenRow name="--radius-sm" value="6px"           desc="rounded-sm — 按钮、输入框、徽章" />
                  <TokenRow name="--radius"    value="10px"          desc="rounded    — 卡片、下拉" />
                  <TokenRow name="--radius-lg" value="14px"          desc="rounded-lg — 数据卡、模态" />
                  <TokenRow name="--shadow-sm" value="0 1px 3px …"   desc="shadow-sm — 轻微浮起" />
                  <TokenRow name="--shadow"    value="0 4px 12px …"  desc="shadow    — 卡片 hover" />
                  <TokenRow name="--shadow-lg" value="0 10px 28px …" desc="shadow-lg — 登录卡、模态" />
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="组件类速查 · Component Classes">
            <div className="bg-surface border border-line rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-canvas">
                  <tr>{['类名', '用途', '文件'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-ink-secondary uppercase tracking-wider border-b border-line">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {[
                    { cls: '.ds-btn / .ds-btn-*',  use: '按钮基础 + 变体', file: 'index.css' },
                    { cls: '.badge / .badge.*',    use: '状态徽章',         file: 'index.css' },
                    { cls: '.card / .card-head',   use: '内容卡片',         file: 'index.css' },
                    { cls: '.stat / .stat-icon.*', use: '数据卡片',         file: 'index.css' },
                    { cls: '.info-bar / .info-bar.*', use: '提示条',        file: 'index.css' },
                    { cls: '.ds-table / .striped', use: '数据表格',         file: 'index.css' },
                    { cls: '.ds-tabs / .ds-tab',   use: '标签页',           file: 'index.css' },
                    { cls: '.ds-toggle',           use: '开关组件',         file: 'index.css' },
                    { cls: '.skeleton',            use: '骨架屏占位',       file: 'index.css' },
                    { cls: '.ds-check',            use: 'Checkbox / Radio', file: 'index.css' },
                    { cls: '.ds-empty',            use: '空状态',           file: 'index.css' },
                    { cls: '.nav-link / .is-active', use: '侧边栏导航',     file: 'index.css' },
                    { cls: '.shell / .sidebar / .topbar', use: '整体布局', file: 'index.css' },
                    { cls: '.page-head',           use: '页面标题区',       file: 'index.css' },
                    { cls: '.auth-card / .auth-action-primary', use: '登录页', file: 'index.css' },
                  ].map(({ cls, use, file }) => (
                    <tr key={cls} className="border-b border-line last:border-0 hover:bg-canvas">
                      <td className="px-4 py-2.5 font-mono text-xs text-brand-deep">{cls}</td>
                      <td className="px-4 py-2.5 text-xs text-ink">{use}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-ink-muted">{file}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="tokens.ts 用法">
            <Code>{`import { color, gradient, shadow, toneColor, toneGradient } from '@/lib/tokens'

// 动态渐变背景
<div style={{ background: gradient.brand }}>品牌橙渐变</div>

// 根据 tone 动态着色 stat-icon
<div style={{ background: toneGradient[tone], color: toneColor[tone] }}>
  <Icon />
</div>

// 直接用颜色常量
<div style={{ color: color.brandDeep }}>深橙文字</div>`}
            </Code>
          </SubSection>
        </Section>

      </main>
    </div>
  )
}

// ── DataTable (advanced) demo section ────────────────────────────────────────

type DemoRow = {
  id: string
  filename: string
  ltc: string
  industry: string
  chunks: number
  confidence: number
  status: 'completed' | 'retrying' | 'failed'
  updated: string
}

const DEMO_ROWS: DemoRow[] = [
  { id: '1', filename: '纷享销客实施手册 v3.2.pdf',     ltc: '线索', industry: 'technology',    chunks: 312, confidence: 0.94, status: 'completed', updated: '2024-04-18' },
  { id: '2', filename: '商机管理最佳实践.docx',          ltc: '商机', industry: 'technology',    chunks: 189, confidence: 0.91, status: 'completed', updated: '2024-04-18' },
  { id: '3', filename: '回款认领流程图.xlsx',            ltc: '回款', industry: 'manufacturing', chunks: 56,  confidence: 0.88, status: 'retrying',  updated: '2024-04-17' },
  { id: '4', filename: '合同审批 SOP.pptx',              ltc: '合同', industry: 'healthcare',    chunks: 78,  confidence: 0.92, status: 'completed', updated: '2024-04-17' },
  { id: '5', filename: '客户访谈记录 Q2.docx',           ltc: '线索', industry: 'energy',        chunks: 42,  confidence: 0.85, status: 'failed',    updated: '2024-04-16' },
  { id: '6', filename: '售后工单月报.xlsx',              ltc: '售后', industry: 'technology',    chunks: 23,  confidence: 0.79, status: 'completed', updated: '2024-04-16' },
  { id: '7', filename: '商机转化率分析 2024.pdf',        ltc: '商机', industry: 'technology',    chunks: 167, confidence: 0.93, status: 'completed', updated: '2024-04-15' },
]

function DataTableSection() {
  const [rows, setRows] = useState<DemoRow[]>(DEMO_ROWS)
  const [filters, setFilters] = useState<Record<string, string>>({ ltc: '', status: '', search: '' })
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>({ key: 'updated', dir: 'desc' })
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(5)

  const filtered = rows
    .filter((r) => (filters.ltc ? r.ltc === filters.ltc : true))
    .filter((r) => (filters.status ? r.status === filters.status : true))
    .filter((r) => (filters.search ? r.filename.includes(filters.search) : true))

  const sorted = sort
    ? [...filtered].sort((a, b) => {
        const va = (a as unknown as Record<string, unknown>)[sort.key] as string | number | undefined
        const vb = (b as unknown as Record<string, unknown>)[sort.key] as string | number | undefined
        const cmp = String(va ?? '').localeCompare(String(vb ?? ''), undefined, { numeric: true })
        return sort.dir === 'asc' ? cmp : -cmp
      })
    : filtered

  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize)

  const columns: ColumnDef<DemoRow>[] = [
    { key: 'filename', header: '文件名', sortable: true,
      render: (r) => <span className="font-medium">{r.filename}</span>,
      editor: (r, commit, cancel) => (
        <input autoFocus defaultValue={r.filename}
          onBlur={(e) => { setRows((rs) => rs.map((x) => x.id === r.id ? { ...x, filename: e.target.value } : x)); commit(e.target.value) }}
          onKeyDown={(e) => { if (e.key === 'Escape') cancel(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className="border border-blue-400 rounded px-1 py-0.5 text-sm w-full" />
      ),
    },
    { key: 'ltc', header: 'LTC', sortable: true,
      render: (r) => <span className="badge orange">{r.ltc}</span> },
    { key: 'industry', header: '行业', sortable: true, defaultVisible: false },
    { key: 'chunks', header: '切片数', sortable: true, className: 'font-mono',
      render: (r) => <span className="font-mono">{r.chunks}</span> },
    { key: 'confidence', header: '置信度', sortable: true,
      render: (r) => <span className="font-mono">{(r.confidence * 100).toFixed(0)}%</span> },
    { key: 'status', header: '状态',
      render: (r) => (
        <span className={`badge ${r.status === 'completed' ? 'green' : r.status === 'retrying' ? 'orange' : 'red'}`}>
          {r.status === 'completed' ? '完成' : r.status === 'retrying' ? '重试中' : '失败'}
        </span>
      ) },
    { key: 'updated', header: '更新', sortable: true, defaultVisible: false },
  ]

  return (
    <Section id="datatable" title="数据表组件 · DataTable"
      subtitle="统一封装的高级数据表：多维筛选 · 排序 · 分页 · 列切换 · 批量操作 · 在线编辑">
      <SubSection title="完整演示 · Full Demo">
        <p className="text-xs text-ink-muted mb-3">
          <strong>试试：</strong>顶栏筛选 LTC / 状态；点击 <strong>列</strong> 切换显示；点击表头<strong>排序</strong>；勾选左侧复选框看<strong>批量操作栏</strong>；<strong>双击文件名</strong>进入在线编辑；底部切换分页。
        </p>
        <DataTable
          rows={paged}
          columns={columns}
          rowKey={(r) => r.id}
          filters={[
            { key: 'ltc',    label: 'LTC',    options: ['线索','商机','报价','合同','回款','售后'].map((v) => ({ value: v, label: v })) },
            { key: 'status', label: '状态',   options: [
              { value: 'completed', label: '完成' },
              { value: 'retrying',  label: '重试中' },
              { value: 'failed',    label: '失败' },
            ] },
            { key: 'search', label: '搜索文件名' },
          ]}
          filterValues={filters}
          onFilterChange={(v) => { setFilters(v); setPage(0) }}
          sort={sort}
          onSortChange={setSort}
          pagination={{
            page,
            pageSize,
            total: filtered.length,
            pageSizeOptions: [3, 5, 10],
            onPageChange: setPage,
            onPageSizeChange: (s) => { setPageSize(s); setPage(0) },
          }}
          bulkActions={[
            { label: '标记已审', onRun: (rs) => alert(`批量已审 ${rs.length} 条：\n` + rs.map((r) => r.filename).join('\n')) },
            { label: '批量删除', danger: true, onRun: (rs) => { if (confirm(`删除 ${rs.length} 条？`)) setRows((all) => all.filter((r) => !rs.find((x) => x.id === r.id))) } },
          ]}
        />
      </SubSection>

      <SubSection title="核心用法 · Quick Start">
        <Code>{`import DataTable, { type ColumnDef } from '@/components/DataTable'

const columns: ColumnDef<Row>[] = [
  { key: 'name', header: '名称', sortable: true },
  { key: 'status', header: '状态',
    render: (r) => <span className={\`badge \${tone(r.status)}\`}>{r.status}</span> },
  { key: 'notes', header: '备注', defaultVisible: false,
    editor: (r, commit, cancel) => (
      <input defaultValue={r.notes} onBlur={(e) => commit(e.target.value)} /* ... */ />
    ) },
]

<DataTable
  rows={paged}
  columns={columns}
  rowKey={(r) => r.id}
  filters={[{ key: 'status', label: '状态', options: [...] }]}
  filterValues={filters}
  onFilterChange={setFilters}
  sort={sort}
  onSortChange={setSort}
  pagination={{ page, pageSize, total, onPageChange, onPageSizeChange }}
  bulkActions={[{ label: '删除', danger: true, onRun: (rs) => ... }]}
/>`}</Code>
      </SubSection>

      <SubSection title="Props 速查 · Props Reference">
        <div className="bg-surface border border-line rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-canvas">
              <tr>{['Prop', '类型', '说明'].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-ink-secondary uppercase tracking-wider border-b border-line">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {[
                ['rows',           'T[]',                         '当前页数据'],
                ['columns',        'ColumnDef<T>[]',              '列定义；每列含 render/editor/sortable/defaultVisible'],
                ['rowKey',         '(row) => string',             '行 id 取值'],
                ['filters',        'FilterDef[]',                 '筛选配置；options 存在即为下拉，否则为文本'],
                ['filterValues',   'Record<string, string>',      '受控筛选值'],
                ['onFilterChange', '(v) => void',                 '筛选变更'],
                ['sort',           '{key, dir} | null',           '当前排序状态'],
                ['onSortChange',   '(s) => void',                 '点击表头回调，三态循环 asc→desc→null'],
                ['pagination',     '{page,pageSize,total,...}',   '服务端分页；不传则不显示分页栏'],
                ['bulkActions',    'BulkAction<T>[]',             '传入即显示首列复选框 + 选中蓝色工具条'],
                ['onRowClick',     '(row) => void',               '点击行回调（会跳过 input/button 等）'],
                ['toolbarRight',   'ReactNode',                   '工具栏右侧追加自定义按钮'],
              ].map(([p, t, d]) => (
                <tr key={p} className="border-b border-line last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-brand-deep">{p}</td>
                  <td className="px-4 py-2 font-mono text-xs text-ink">{t}</td>
                  <td className="px-4 py-2 text-xs text-ink-secondary">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SubSection>

      <SubSection title="在线编辑 · Inline Edit">
        <p className="text-xs text-ink-muted mb-3">
          给某列传 <code className="font-mono text-brand-deep">editor</code>，单元格变为可双击编辑。编辑态由 DataTable 内部管理，你只需在 <code className="font-mono text-brand-deep">onBlur / Enter</code> 时调用 <code className="font-mono text-brand-deep">commit(value)</code>。
        </p>
        <Code>{`editor: (row, commit, cancel) => (
  <input autoFocus defaultValue={row.name}
    onBlur={async (e) => {
      await updateRow(row.id, { name: e.target.value })
      commit(e.target.value)
    }}
    onKeyDown={(e) => {
      if (e.key === 'Escape') cancel()
      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
    }}
  />
)`}</Code>
      </SubSection>

      <SubSection title="动态字段 · Column Toggle">
        <p className="text-xs text-ink-muted mb-3">
          每列可设 <code className="font-mono text-brand-deep">defaultVisible: false</code> 默认隐藏。用户在工具栏"列"菜单里勾选显示，选择会<strong>自动持久化到 localStorage</strong>（按列 key 组合作为存储键）。设 <code className="font-mono text-brand-deep">hideable: false</code> 可锁定（如操作列）。
        </p>
      </SubSection>
    </Section>
  )
}

// ── Modals demo section ──────────────────────────────────────────────────────

function ModalSection() {
  const [modalOpen, setModalOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <Section id="modals" title="模态框 · Modal / Drawer / Confirm"
      subtitle="统一的遮罩容器组件，自动处理 Esc 关闭、遮罩点击、body 锁定滚动">
      <SubSection title="三种变体 · Variants">
        <LiveExample label="Modal / Drawer / ConfirmModal">
          <button className="ds-btn ds-btn-primary" onClick={() => setModalOpen(true)}>打开 Modal</button>
          <button className="ds-btn ds-btn-primary" onClick={() => setDrawerOpen(true)}>打开 Drawer</button>
          <button className="ds-btn" onClick={() => setConfirmOpen(true)}>打开 ConfirmModal</button>
        </LiveExample>
      </SubSection>

      <SubSection title="Modal · 基础用法">
        <Code>{`import Modal from '@/components/Modal'

<Modal
  open={open}
  title="编辑项目"
  onClose={() => setOpen(false)}
  width="lg"                  // sm / md / lg / xl / 2xl / 3xl
  footer={
    <>
      <button onClick={close}>取消</button>
      <button onClick={save}>保存</button>
    </>
  }
>
  <form>...</form>
</Modal>`}</Code>
      </SubSection>

      <SubSection title="Drawer · 右侧抽屉">
        <Code>{`import { Drawer } from '@/components/Modal'

<Drawer open={open} title="详情" onClose={close} width="2xl">
  <div>...详情内容...</div>
</Drawer>`}</Code>
      </SubSection>

      <SubSection title="ConfirmModal · 快捷确认">
        <Code>{`import { ConfirmModal } from '@/components/Modal'

<ConfirmModal
  open={!!target}
  title="删除项目"
  message={\`确认删除 "\${target.name}"？此操作不可撤销。\`}
  danger
  confirmText="删除"
  onConfirm={() => doDelete(target)}
  onClose={() => setTarget(null)}
/>`}</Code>
      </SubSection>

      <SubSection title="行为规范 · Behavior">
        <div className="bg-surface border border-line rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-canvas">
              <tr>{['行为', '默认', '说明'].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-ink-secondary uppercase tracking-wider border-b border-line">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {[
                ['Esc 关闭',          '启用',  '按下 Escape 键触发 onClose'],
                ['遮罩点击',          '启用',  '点击半透明背景触发 onClose；closeOnBackdrop=false 可禁用'],
                ['锁定滚动',          '启用',  '打开时 body overflow=hidden，关闭恢复'],
                ['最大高度',          '90vh',  '内容超过自动出滚动条'],
                ['z-index',           '50',    '覆盖普通页面元素'],
                ['Drawer 宽度',       'w-[720px]', '响应式 max-w-full；可通过 width prop 覆盖'],
                ['嵌套',              '支持',  '多个 Modal 可叠加（靠 z-index 顺序）'],
              ].map(([k, v, d]) => (
                <tr key={k} className="border-b border-line last:border-0">
                  <td className="px-4 py-2 text-xs text-ink">{k}</td>
                  <td className="px-4 py-2 font-mono text-xs text-brand-deep">{v}</td>
                  <td className="px-4 py-2 text-xs text-ink-secondary">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SubSection>

      {/* live demos */}
      <Modal open={modalOpen} title="示例 Modal" onClose={() => setModalOpen(false)}
        footer={<>
          <button className="ds-btn" onClick={() => setModalOpen(false)}>取消</button>
          <button className="ds-btn ds-btn-primary" onClick={() => setModalOpen(false)}>保存</button>
        </>}>
        <p className="text-sm text-ink">这是一个基础 Modal。按 <kbd className="px-1.5 py-0.5 bg-canvas border border-line rounded text-xs">Esc</kbd> 或点击遮罩关闭。</p>
        <input className="mt-4 w-full border border-line rounded-lg px-3 py-2 text-sm" placeholder="表单字段示例" />
      </Modal>

      <Drawer open={drawerOpen} title="示例 Drawer" onClose={() => setDrawerOpen(false)}>
        <div className="space-y-3 text-sm text-ink">
          <p>右侧抽屉适合展示详情、日志、活动流等长内容。</p>
          <p className="text-ink-muted">宽度默认 720px，可通过 <code className="font-mono text-brand-deep">width</code> prop 切换。</p>
          <div className="h-64 bg-canvas border border-line rounded-lg flex items-center justify-center text-ink-muted">详情内容区域</div>
        </div>
      </Drawer>

      <ConfirmModal open={confirmOpen} onClose={() => setConfirmOpen(false)} danger
        title="删除确认" confirmText="确认删除"
        message={'你确定要执行这个操作吗？这里是演示用，点击"确认删除"仅关闭对话框。'}
        onConfirm={() => { /* demo */ }} />
    </Section>
  )
}
