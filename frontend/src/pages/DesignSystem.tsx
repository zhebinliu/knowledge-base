/**
 * Design System — Living style guide
 * Route: /ds  (no auth required)
 * Inspired by Salesforce Lightning Design System 2
 */
import { useState, useEffect } from 'react'
import { BookOpen, Palette, Type, Square, Layers, Box, AlertCircle, ToggleLeft, Layout, Download } from 'lucide-react'

// ── Data ─────────────────────────────────────────────────────────────────────

const NAV = [
  { id: 'intro',      label: '介绍',       icon: BookOpen },
  { id: 'colors',     label: '颜色',       icon: Palette },
  { id: 'typography', label: '字体',       icon: Type },
  { id: 'spacing',    label: '圆角 & 阴影', icon: Square },
  { id: 'buttons',    label: '按钮',       icon: ToggleLeft },
  { id: 'badges',     label: '徽章',       icon: Layers },
  { id: 'cards',      label: '卡片',       icon: Box },
  { id: 'alerts',     label: '提示条',     icon: AlertCircle },
  { id: 'inputs',     label: '输入框',     icon: Layout },
  { id: 'tokens',     label: 'Token 速查', icon: BookOpen },
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
      <div className="px-4 py-2 bg-canvas border-b border-line flex items-center justify-between">
        <span className="text-xs font-medium text-ink-secondary">{label}</span>
      </div>
      <div className="p-6 bg-surface flex flex-wrap gap-3 items-center">{children}</div>
      {code && <Code>{code}</Code>}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DesignSystem() {
  const [active, setActive] = useState('intro')

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
        "DEFAULT":   { "$value": "#FF8D1A", "$type": "color", "$description": "Primary brand orange" },
        "deep":      { "$value": "#D96400", "$type": "color", "$description": "Darker orange for text on light bg" },
        "light":     { "$value": "#FFF4E6", "$type": "color", "$description": "Tinted bg, hover fill" },
        "mid":       { "$value": "#FFB066", "$type": "color", "$description": "Mid-tone accent" },
      },
      "surface": {
        "canvas":    { "$value": "#F5F6FA", "$type": "color", "$description": "Page background" },
        "surface":   { "$value": "#FFFFFF", "$type": "color", "$description": "Card / panel background" },
      },
      "border": {
        "line":      { "$value": "#E8E9EE", "$type": "color", "$description": "Subtle separator" },
        "strong":    { "$value": "#D0D3DE", "$type": "color", "$description": "Emphasized separator" },
      },
      "text": {
        "primary":   { "$value": "#1A1D2E", "$type": "color", "$description": "Headings, body" },
        "secondary": { "$value": "#6B7280", "$type": "color", "$description": "Labels, captions" },
        "muted":     { "$value": "#9CA3AF", "$type": "color", "$description": "Placeholders, hints" },
      },
      "radius": {
        "sm":        { "$value": "6px",  "$type": "dimension" },
        "DEFAULT":   { "$value": "10px", "$type": "dimension" },
        "lg":        { "$value": "14px", "$type": "dimension" },
      },
      "semantic": {
        "success":   { "$value": "#10B981", "$type": "color" },
        "danger":    { "$value": "#EF4444", "$type": "color" },
        "info":      { "$value": "#3B82F6", "$type": "color" },
        "warn":      { "$value": "#F59E0B", "$type": "color" },
      },
    }
    const blob = new Blob([JSON.stringify(tokens, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'kb-design-tokens.json'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-h-screen bg-canvas">

      {/* ── Left nav ─────────────────────────────────────────────────────── */}
      <aside className="w-56 flex-shrink-0 border-r border-line bg-surface flex flex-col sticky top-0 h-screen overflow-y-auto">
        {/* Logo */}
        <div className="h-14 flex items-center gap-2.5 px-5 border-b border-line flex-shrink-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#FF8D1A,#D96400)' }}>
            <BookOpen size={13} className="text-white" />
          </div>
          <div>
            <p className="text-xs font-bold text-ink leading-none">Design System</p>
            <p className="text-[10px] text-ink-muted leading-none mt-0.5">v1.0 · KB System</p>
          </div>
        </div>

        {/* Nav items */}
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
      </aside>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <main className="flex-1 px-12 py-10 max-w-5xl">

        {/* ── Intro ──────────────────────────────────────────────────────── */}
        <Section id="intro" title="KB System Design System" subtitle="为纷享销客 CRM 知识库管理系统设计的视觉规范与组件库">
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

          {/* Download tokens */}
          <div className="mt-6 flex items-center gap-3 p-4 rounded-lg bg-brand-light border border-orange-200">
            <Download size={16} style={{ color: 'var(--accent)' }} className="flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink">下载 Design Token</p>
              <p className="text-xs text-ink-secondary mt-0.5">提供 CSS 变量和 JSON 两种格式，可直接用于其他项目或设计工具</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={downloadCSSTokens}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-line bg-surface text-ink hover:border-brand hover:text-brand transition-colors"
              >
                <Download size={11} /> CSS 变量
              </button>
              <button
                onClick={downloadJSONTokens}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-line bg-surface text-ink hover:border-brand hover:text-brand transition-colors"
              >
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
              <Swatch hex="#FFFFFF" name="surface" tw="bg-surface" text />
              <Swatch hex="#F5F6FA" name="canvas"  tw="bg-canvas" text />
              <Swatch hex="#E8E9EE" name="line"    tw="border-line" text />
              <Swatch hex="#D0D3DE" name="line-strong" tw="border-line-strong" text />
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
                { cls: 'text-2xs', size: '11.5px / 1.6', sample: '徽章文字 · Badge label', use: 'badge, 次要标注' },
                { cls: 'text-xs',  size: '12px / 1.5',   sample: '辅助信息 · Caption text', use: '表格辅助列、时间戳' },
                { cls: 'text-sm',  size: '14px / 1.5',   sample: '正文 · Body text',    use: '卡片内容、按钮' },
                { cls: 'text-base',size: '16px / 1.5',   sample: '大正文 · Large body',  use: '段落、输入值' },
                { cls: 'text-lg',  size: '18px / 1.75',  sample: '次标题 · Subheading',  use: '模态标题' },
                { cls: 'text-xl',  size: '20px / 1.75',  sample: '标题 · Heading',       use: '页面模块标题' },
                { cls: 'text-2xl', size: '24px / 2',     sample: '页面标题 · Page Title', use: '.page-head h2 (22px)' },
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

        {/* ── Spacing / Radius / Shadow ───────────────────────────────────── */}
        <Section id="spacing" title="圆角 & 阴影" subtitle="统一的视觉层次感">

          <SubSection title="圆角 · Border Radius">
            <div className="flex flex-wrap gap-5">
              {[
                { r: '6px',  cls: 'rounded-sm', label: 'sm · 6px',    use: '按钮、输入框、徽章' },
                { r: '10px', cls: 'rounded',    label: 'md · 10px',   use: '下拉、提示条' },
                { r: '14px', cls: 'rounded-lg', label: 'lg · 14px',   use: '卡片、数据卡' },
                { r: '18px', cls: 'rounded-xl', label: 'xl · 18px',   use: '登录卡片' },
                { r: '9999px', cls: 'rounded-full', label: 'full',    use: '头像、圆形按钮' },
              ].map(({ r, cls, label, use }) => (
                <div key={cls} className="flex flex-col items-center gap-2">
                  <div
                    className="w-20 h-20 bg-brand-light border-2 border-brand/30 flex items-center justify-center"
                    style={{ borderRadius: r }}
                  >
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              新建文档
            </button>
            <button className="ds-btn flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              导出
            </button>
            <button className="ds-btn ds-btn-danger flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              删除
            </button>
          </LiveExample>

          <div className="bg-surface border border-line rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-canvas">
                <tr>
                  {['类名', '用途', '颜色'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary uppercase tracking-wider border-b border-line">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { cls: '.ds-btn',            use: '基础类，必须加',     color: '白底 / 灰边框' },
                  { cls: '.ds-btn-primary',    use: '主要操作（唯一）',   color: '品牌橙渐变' },
                  { cls: '.ds-btn-success',    use: '确认 / 保存 / 提交', color: '绿色渐变' },
                  { cls: '.ds-btn-danger',     use: '删除 / 不可逆操作',  color: '红色描边' },
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
                <tr>
                  {['修饰类', '前景色', '背景色', '语义'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary uppercase tracking-wider border-b border-line">{h}</th>
                  ))}
                </tr>
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
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: fg }}/>
                        <span className="font-mono text-xs text-ink">{fg}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full border border-line flex-shrink-0" style={{ background: bg }}/>
                        <span className="font-mono text-xs text-ink">{bg}</span>
                      </div>
                    </td>
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

        {/* ── Inputs ─────────────────────────────────────────────────────── */}
        <Section id="inputs" title="输入框" subtitle="聚焦时自动切换成品牌橙色描边（index.css 全局覆盖）">

          <LiveExample label="文本输入 · Text Input" code={`<input
  type="text"
  class="w-full px-3 py-2 text-sm border border-line rounded-sm bg-surface
         text-ink placeholder:text-ink-muted focus:outline-none"
  placeholder="输入搜索关键词…"
/>`}>
            <input
              type="text"
              className="w-72 px-3 py-2 text-sm border border-line rounded-sm bg-surface text-ink placeholder:text-ink-muted focus:outline-none"
              placeholder="输入搜索关键词…"
            />
          </LiveExample>

          <LiveExample label="带标签表单行 · Form Field">
            <div className="w-full max-w-md flex flex-col gap-4">
              <div>
                <label className="block text-xs font-medium text-ink-secondary mb-1.5">项目名称</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 text-sm border border-line rounded-sm bg-surface text-ink placeholder:text-ink-muted focus:outline-none"
                  placeholder="例：纷享销客 2024 实施项目"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-secondary mb-1.5">所属行业</label>
                <select className="w-full px-3 py-2 text-sm border border-line rounded-sm bg-surface text-ink focus:outline-none">
                  <option>制造业</option>
                  <option>金融业</option>
                  <option>零售业</option>
                </select>
              </div>
            </div>
          </LiveExample>

          <div className="info-bar orange text-sm">
            ⚠️ 焦点样式在 <code className="font-mono text-xs bg-brand-light px-1 rounded">index.css</code> 全局声明，无需在每个 input 上单独添加 focus:ring-* 类。
          </div>
        </Section>

        {/* ── Token Reference ────────────────────────────────────────────── */}
        <Section id="tokens" title="Token 速查" subtitle="完整 CSS 变量 & Tailwind 工具类对照表">

          <SubSection title="颜色 Token">
            <div className="bg-surface border border-line rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-canvas">
                  <tr>
                    {['CSS 变量', 'Tailwind 类', '值', ''].map((h, i) => (
                      <th key={i} className="text-left px-4 py-2.5 text-xs font-semibold text-ink-secondary uppercase tracking-wider border-b border-line">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { css: '--accent',        tw: 'bg-brand / text-brand',          val: '#FF8D1A', hex: '#FF8D1A' },
                    { css: '--accent-deep',   tw: 'bg-brand-deep / text-brand-deep', val: '#D96400', hex: '#D96400' },
                    { css: '--accent-light',  tw: 'bg-brand-light',                 val: '#FFF4E6', hex: '#FFF4E6' },
                    { css: '--bg',            tw: 'bg-canvas',                      val: '#F5F6FA', hex: '#F5F6FA' },
                    { css: '--surface',       tw: 'bg-surface',                     val: '#FFFFFF', hex: '#FFFFFF' },
                    { css: '--line',          tw: 'border-line',                    val: '#E8E9EE', hex: '#E8E9EE' },
                    { css: '--line-strong',   tw: 'border-line-strong',             val: '#D0D3DE', hex: '#D0D3DE' },
                    { css: '--text-primary',  tw: 'text-ink',                       val: '#1A1D2E', hex: '#1A1D2E' },
                    { css: '--text-secondary',tw: 'text-ink-secondary',             val: '#6B7280', hex: '#6B7280' },
                    { css: '--text-muted',    tw: 'text-ink-muted',                 val: '#9CA3AF', hex: '#9CA3AF' },
                  ].map(({ css, tw, val, hex }) => (
                    <tr key={css} className="border-b border-line last:border-0 hover:bg-canvas">
                      <td className="px-4 py-2.5 font-mono text-xs text-brand-deep">{css}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-info-deep">{tw}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-ink">{val}</td>
                      <td className="px-4 py-2.5">
                        <div className="w-6 h-6 rounded border border-line" style={{ background: hex }}/>
                      </td>
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
                  <tr>
                    {['CSS 变量', 'Tailwind 类', '值'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-ink-secondary uppercase tracking-wider border-b border-line">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <TokenRow name="--radius-sm" value="6px"  desc="rounded-sm — 按钮、输入框、徽章" />
                  <TokenRow name="--radius"    value="10px" desc="rounded    — 卡片、下拉" />
                  <TokenRow name="--radius-lg" value="14px" desc="rounded-lg — 数据卡、模态" />
                  <TokenRow name="--shadow-sm" value="0 1px 3px …" desc="shadow-sm — 轻微浮起" />
                  <TokenRow name="--shadow"    value="0 4px 12px …" desc="shadow    — 卡片 hover" />
                  <TokenRow name="--shadow-lg" value="0 10px 28px …" desc="shadow-lg — 登录卡、模态" />
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
