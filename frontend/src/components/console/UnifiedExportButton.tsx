/**
 * UnifiedExportButton — 统一「导出」入口(2026-08)。
 *
 * 把原先散落的两种导出合并到一处:
 *   - 模块导出: 选模块(建议/需求/流程/干系人) → 选排版 → .md / .docx / .html
 *   - 模板导出: 选模板 → 预览 → .md / .docx
 *
 * 替代旧详情页每 Tab 一个的 ModuleExportButton + 顶部 TemplateSelector 两套入口。
 * variant: 'redesign'=新 UI 深色玻璃; 'legacy'=旧 UI 浅色主题。
 */
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Download, FileText, FileDown, LayoutTemplate, ListChecks, GitBranch, Users,
  Lightbulb, Loader2, ChevronDown, Eye, EyeOff,
  type LucideIcon,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  listModuleLayouts,
  moduleExportUrl,
  exportMeetingDocxUrl,
  exportMeetingHtmlUrl,
  TOKEN_STORAGE_KEY,
  type ExportModule,
  type ModuleLayoutMeta,
} from '../../api/client'
import {
  listMarkupTemplates,
  renderTemplate,
  exportTemplateDocx,
  exportTemplateMd,
  type MarkupTemplate,
  type TemplateRenderResult,
} from '../../api/markup-template'

/** 导出目标:4 个模块 + 纪要全文(__minutes 走独立导出接口) */
type ExportTarget = ExportModule | '__minutes'

const MODULES: Array<{ key: ExportTarget; label: string; Icon: LucideIcon }> = [
  { key: '__minutes',   label: '纪要', Icon: FileText },
  { key: 'advice',          label: '建议', Icon: Lightbulb },
  { key: 'requirements',    label: '需求', Icon: ListChecks },
  { key: 'process_flows',   label: '流程', Icon: GitBranch },
  { key: 'stakeholders',    label: '干系人', Icon: Users },
]

type Mode = 'module' | 'template'
type Format = 'md' | 'docx' | 'html'

interface Props {
  meetingId: number
  meetingTitle?: string
  variant?: 'redesign' | 'legacy'
}

export default function UnifiedExportButton({ meetingId, meetingTitle, variant = 'redesign' }: Props) {
  const isLegacy = variant === 'legacy'
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('module')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)

  // ── 模块导出状态 ──
  const [module, setModule] = useState<ExportTarget>('__minutes')
  const [layouts, setLayouts] = useState<ModuleLayoutMeta[]>([])
  const [layoutsLoading, setLayoutsLoading] = useState(false)

  // ── 模板导出状态 ──
  const [templates, setTemplates] = useState<MarkupTemplate[] | null>(null)
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<MarkupTemplate | null>(null)
  const [rendered, setRendered] = useState<TemplateRenderResult | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 锚定弹出层到触发按钮右下(视口坐标),滚动/缩放时跟随
  const updatePos = () => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) })
  }

  useEffect(() => {
    if (!open) return
    updatePos()
    window.addEventListener('scroll', updatePos, true)
    window.addEventListener('resize', updatePos)
    return () => {
      window.removeEventListener('scroll', updatePos, true)
      window.removeEventListener('resize', updatePos)
    }
  }, [open])

  // 点外面关闭(含弹出层自身)
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (popupRef.current && triggerRef.current && !popupRef.current.contains(t) && !triggerRef.current.contains(t)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // 打开时懒加载排版列表(模块导出)
  useEffect(() => {
    if (!open || mode !== 'module' || module === '__minutes' || layouts.length > 0) return
    setLayoutsLoading(true)
    listModuleLayouts(meetingId, module)
      .then((r) => setLayouts(r.layouts))
      .catch(() => setError('加载排版列表失败'))
      .finally(() => setLayoutsLoading(false))
  }, [open, mode, module, layouts.length, meetingId])

  // 打开时懒加载模板列表
  useEffect(() => {
    if (!open || mode !== 'template' || templates) return
    setTemplatesLoading(true)
    listMarkupTemplates()
      .then((ts) => { setTemplates(ts); if (!selectedTemplate && ts.length) setSelectedTemplate(ts[0]) })
      .catch(() => setError('加载模板列表失败'))
      .finally(() => setTemplatesLoading(false))
  }, [open, mode, templates, selectedTemplate])

  const switchModule = (m: ExportTarget) => {
    setModule(m)
    setLayouts([])
  }

  // ── 模块导出下载(md/docx/html 走原生 fetch,带 JWT)──────────────
  const doModuleDownload = async (layout: string, format: Format, ext: string) => {
    setBusy(true)
    setError(null)
    try {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY) || ''
      // doModuleDownload 仅在非 __minutes(真实模块)分支被调用
      const url = moduleExportUrl(meetingId, module as ExportModule, format, layout)
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `导出失败 (${resp.status})`)
      }
      const blob = await resp.blob()
      const cd = resp.headers.get('content-disposition') || ''
      let filename = `${meetingTitle || '会议'}_${module}_${layout}.${ext}`
      const m = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i)
      if (m) {
        try { filename = decodeURIComponent(m[1]) } catch { filename = m[1] }
      }
      const dlUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = dlUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(dlUrl)
    } catch (e: any) {
      setError(e?.message || '导出失败')
    } finally {
      setBusy(false)
    }
  }

  // ── 纪要全文导出(docx/html,走独立接口)───────────────────────────
  const doMinutesDownload = async (format: 'docx' | 'html') => {
    setBusy(true)
    setError(null)
    try {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY) || ''
      const url = format === 'docx' ? exportMeetingDocxUrl(meetingId) : exportMeetingHtmlUrl(meetingId)
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `导出失败 (${resp.status})`)
      }
      const blob = await resp.blob()
      const safeTitle = (meetingTitle || '会议纪要').replace(/[/\\:*?"<>|]/g, '_')
      const dlUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = dlUrl
      a.download = `${safeTitle}.${format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(dlUrl)
    } catch (e: any) {
      setError(e?.message || '导出失败')
    } finally {
      setBusy(false)
    }
  }

  const handleSelectTemplate = (tpl: MarkupTemplate) => {
    setSelectedTemplate(tpl)
    setRendered(null)
    setShowPreview(false)
  }

  const handleRender = async () => {
    if (!selectedTemplate) return
    setBusy(true)
    setError(null)
    try {
      const r = await renderTemplate(selectedTemplate.id, meetingId)
      setRendered(r)
      setShowPreview(true)
    } catch (e: any) {
      setError(e?.message || '渲染失败')
    } finally {
      setBusy(false)
    }
  }

  const doTemplateDownload = async (fn: (id: number, mid: number) => Promise<Blob>, filename: string) => {
    if (!selectedTemplate) return
    setBusy(true)
    setError(null)
    try {
      const blob = await fn(selectedTemplate.id, meetingId)
      const dlUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = dlUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(dlUrl)
    } catch (e: any) {
      setError(e?.message || '导出失败')
    } finally {
      setBusy(false)
    }
  }

  // ── 主题取值 ──
  const th = {
    panelBg: isLegacy ? '#fff' : 'var(--rd-surface, #1A1D2E)',
    panelBorder: isLegacy ? '1px solid #e2e8f0' : '1px solid var(--rd-line)',
    text: isLegacy ? '#334155' : 'var(--rd-text, #e2e8f0)',
    text2: isLegacy ? '#475569' : 'var(--rd-text-2, #94a3b8)',
    muted: isLegacy ? '#94a3b8' : 'var(--rd-text-3, #94a3b8)',
    itemHover: isLegacy ? '#f8fafc' : 'rgba(255,255,255,.04)',
    accent: isLegacy ? '#D96400' : 'var(--rd-accent-2, #FFB066)',
    btnBg: isLegacy ? '#f8fafc' : 'rgba(255,255,255,.04)',
    btnBorder: isLegacy ? '1px solid #e2e8f0' : '1px solid var(--rd-line)',
  }

  const fmtBtnBase = `inline-flex items-center justify-center gap-1 px-2 py-1 text-xs rounded-md border ${isLegacy ? 'border-line' : ''}`

  return (
    <>
      {/* 触发按钮 */}
      <button
        ref={triggerRef}
        onClick={() => { if (!busy) { updatePos(); setOpen((o) => !o) } }}
        disabled={busy}
        className={
          isLegacy
            ? `inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-line bg-white text-ink hover:bg-canvas transition-colors disabled:opacity-40`
            : `rd-btn`
        }
        title="导出(模块 / 模板)"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        <span>导出</span>
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* 弹出层:Portal 到 body + fixed,不受祖先 overflow 裁剪;宽高按视口自适应 */}
      {open && pos && createPortal(
        <div
          ref={popupRef}
          className="rounded-lg shadow-xl overflow-hidden"
          style={{
            position: 'fixed',
            top: pos.top,
            right: pos.right,
            zIndex: 1000,
            width: 'min(400px, calc(100vw - 48px))',
            maxHeight: 'min(560px, calc(100dvh - 24px))',
            display: 'flex', flexDirection: 'column',
            background: th.panelBg,
            border: th.panelBorder,
            boxShadow: isLegacy ? '0 12px 40px rgba(0,0,0,.12)' : '0 16px 48px rgba(0,0,0,.45)',
            backdropFilter: isLegacy ? 'none' : 'blur(20px) saturate(140%)',
          }}
        >
          {/* 模式切换 */}
          <div className="flex border-b" style={{ borderColor: isLegacy ? '#e2e8f0' : 'var(--rd-line)', flexShrink: 0 }}>
            {([
              { key: 'module', label: '模块导出', Icon: Download },
              { key: 'template', label: '模板导出', Icon: LayoutTemplate },
            ] as Array<{ key: Mode; label: string; Icon: LucideIcon }>).map((m) => {
              const Ic = m.Icon
              const active = mode === m.key
              return (
                <button
                  key={m.key}
                  onClick={() => setMode(m.key)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-[13px] font-medium transition-colors"
                  style={{
                    color: active ? th.accent : th.text2,
                    borderBottom: `2px solid ${active ? (isLegacy ? '#FF8D1A' : 'var(--rd-accent)') : 'transparent'}`,
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <Ic size={13} /> {m.label}
                </button>
              )
            })}
          </div>

          {/* 模块导出 */}
          {mode === 'module' && (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 12px' }}>
              {/* 模块选择 */}
              <div className="flex gap-1.5 flex-wrap">
                {MODULES.map((m) => {
                  const Ic = m.Icon
                  const active = module === m.key
                  return (
                    <button
                      key={m.key}
                      onClick={() => switchModule(m.key)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
                      style={{
                        color: active ? (isLegacy ? '#D96400' : 'var(--rd-accent-2)') : th.text2,
                        background: active ? (isLegacy ? '#FFF4E6' : 'var(--rd-accent-soft, rgba(255,141,26,.14))') : 'transparent',
                        border: `1px solid ${active ? (isLegacy ? '#FFD8A8' : 'rgba(255,141,26,.35)') : th.btnBorder}`,
                        cursor: 'pointer',
                      }}
                    >
                      <Ic size={12} /> {m.label}
                    </button>
                  )
                })}
              </div>

              {module === '__minutes' ? (
                <div className="mt-3">
                  <div className="text-xs font-medium mb-2" style={{ color: th.text }}>会议纪要全文</div>
                  <div className="flex gap-1.5">
                    <FmtBtn label=".docx" onClick={() => doMinutesDownload('docx')} th={th} />
                    <FmtBtn label=".html" onClick={() => doMinutesDownload('html')} th={th} />
                  </div>
                  <div className="mt-2 text-[11px]" style={{ color: th.muted }}>
                    导出整篇会议纪要;.html 内可一键保存为 PNG
                  </div>
                </div>
              ) : (
                <div className="mt-3">
                  {layoutsLoading ? (
                    <div className="py-8 text-center" style={{ color: th.muted, fontSize: 12 }}>
                      <Loader2 size={16} className="animate-spin mx-auto mb-1.5" /> 加载排版…
                    </div>
                  ) : layouts.length === 0 ? (
                    <div className="py-8 text-center" style={{ color: th.muted, fontSize: 12 }}>
                      暂无可用排版
                    </div>
                  ) : (
                    <div className="divide-y" style={{ borderColor: isLegacy ? '#e2e8f0' : 'var(--rd-line)' }}>
                      {layouts.map((l) => (
                        <div key={l.id} className="py-2.5">
                          <div className="flex items-baseline justify-between gap-2 mb-1.5">
                            <span className="text-xs font-medium" style={{ color: th.text }}>{l.name}</span>
                            <span className="text-[10px] truncate ml-2" style={{ color: th.muted }} title={l.description}>
                              {l.description}
                            </span>
                          </div>
                          <div className="flex gap-1.5">
                            <FmtBtn label=".md"   onClick={() => doModuleDownload(l.id, 'md', 'md')}   th={th} />
                            <FmtBtn label=".docx" onClick={() => doModuleDownload(l.id, 'docx', 'docx')} th={th} />
                            <FmtBtn label=".html" onClick={() => doModuleDownload(l.id, 'html', 'html')} th={th} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 模板导出 */}
          {mode === 'template' && (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 12px' }}>
              {templatesLoading ? (
                <div className="py-8 text-center" style={{ color: th.muted, fontSize: 12 }}>
                  <Loader2 size={16} className="animate-spin mx-auto mb-1.5" /> 加载模板…
                </div>
              ) : !templates || templates.length === 0 ? (
                <div className="py-8 text-center" style={{ color: th.muted, fontSize: 12 }}>
                  暂无模板，请先在模板管理页面上传
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    {templates.map((tpl) => (
                      <button
                        key={tpl.id}
                        onClick={() => handleSelectTemplate(tpl)}
                        className="w-full text-left px-2.5 py-2 rounded-md text-[13px] transition-colors"
                        style={{
                          color: th.text,
                          background: selectedTemplate?.id === tpl.id
                            ? (isLegacy ? '#FFF4E6' : 'var(--rd-accent-soft, rgba(255,141,26,.14))')
                            : 'transparent',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => {
                          if (selectedTemplate?.id !== tpl.id) e.currentTarget.style.background = th.itemHover
                        }}
                        onMouseLeave={(e) => {
                          if (selectedTemplate?.id !== tpl.id) e.currentTarget.style.background = 'transparent'
                        }}
                      >
                        <div className="flex items-center gap-1.5">
                          <FileText size={12} style={{ color: tpl.is_builtin ? th.accent : '#D96400' }} />
                          <span className="font-medium">{tpl.name}</span>
                          {tpl.is_builtin && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: th.accent, background: isLegacy ? '#FFF4E6' : 'var(--rd-accent-soft)' }}>
                              预置
                            </span>
                          )}
                        </div>
                        {tpl.description && (
                          <div className="text-[11px] truncate mt-0.5 pl-[18px]" style={{ color: th.muted }}>{tpl.description}</div>
                        )}
                      </button>
                    ))}
                  </div>

                  {selectedTemplate && (
                    <div className="mt-3 flex items-center gap-2" style={{ padding: '8px 10px', borderRadius: 8, border: th.btnBorder, background: th.btnBg }}>
                      <button
                        onClick={handleRender}
                        disabled={busy}
                        className={fmtBtnBase}
                        style={{ color: th.text2, background: th.btnBg, border: th.btnBorder, cursor: 'pointer', flexShrink: 0 }}
                      >
                        {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
                        {rendered ? (showPreview ? '隐藏预览' : '显示预览') : '预览'}
                      </button>
                      <button
                        onClick={() => doTemplateDownload(exportTemplateMd, `${meetingTitle || '会议纪要'}.md`)}
                        disabled={busy}
                        className={fmtBtnBase}
                        style={{ color: th.text2, background: th.btnBg, border: th.btnBorder, cursor: 'pointer', flexShrink: 0 }}
                      >
                        <FileText size={12} /> .md
                      </button>
                      <button
                        onClick={() => doTemplateDownload(exportTemplateDocx, `${meetingTitle || '会议纪要'}.docx`)}
                        disabled={busy}
                        className={fmtBtnBase}
                        style={{
                          flexShrink: 0,
                          background: isLegacy ? 'linear-gradient(135deg,#FF8D1A,#D96400)' : 'linear-gradient(135deg,var(--rd-accent,#FF8D1A),var(--rd-accent-deep,#D96400))',
                          border: 'none',
                          color: '#fff',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <FileDown size={12} /> 导出Word
                      </button>
                    </div>
                  )}

                  {showPreview && rendered && (
                    <div
                      className="mt-2 rounded-lg px-3 py-2.5 text-[13px] leading-relaxed prose prose-sm max-w-none prose-p:my-1.5 prose-headings:mt-3 prose-headings:mb-2 prose-table:text-xs prose-code:text-xs"
                      style={{ border: th.btnBorder, maxHeight: 240, overflowY: 'auto', color: th.text }}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{rendered.rendered}</ReactMarkdown>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {error && (
            <div className="px-3 py-2 border-t text-[11px] text-red-600"
                 style={{ borderColor: isLegacy ? '#e2e8f0' : 'var(--rd-line)', background: 'rgba(244,63,94,.10)', flexShrink: 0 }}>
              {error}
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}

function FmtBtn({ label, onClick, th }: { label: string; onClick: () => void; th: { btnBg: string; btnBorder: string; text2: string } }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 text-xs rounded-md transition-colors"
      style={{
        color: th.text2,
        background: th.btnBg,
        border: th.btnBorder,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}
