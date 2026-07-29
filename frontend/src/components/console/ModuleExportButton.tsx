/**
 * 会议模块导出按钮 — 2026-07。
 *
 * 为每个会议详情 tab 模块（Co-pilot 建议 / 需求清单 / 业务流程 / 干系人）
 * 提供排版选择 + 格式选择的下拉导出面板。
 *
 * 用户操作流: 点击「导出{模块名}⏷」→ 弹 popover →
 *   每套排版一个区段，内含 .md / .docx / .png / .html 四个格式按钮
 *   - .md / .docx / .html: 直接下载二进制
 *   - .png: fetch HTML → 隐藏容器渲染 → html-to-image 截图 → 下载
 */
import { useState, useRef, useEffect } from 'react'
import { Download, FileText, FileDown, Image, Loader2, ChevronDown } from 'lucide-react'
import {
  listModuleLayouts,
  moduleExportUrl,
  fetchModuleExportHtml,
  TOKEN_STORAGE_KEY,
  type ExportModule,
  type ModuleLayoutMeta,
} from '../../api/client'

interface Props {
  meetingId: number
  meetingTitle: string
  module: ExportModule
  moduleLabel: string
  /** 无数据时禁用按钮 */
  hasData: boolean
  /** 紧凑模式(顶部工具栏) */
  compact?: boolean
}

export default function ModuleExportButton({ meetingId, meetingTitle, module, moduleLabel, hasData, compact }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [layouts, setLayouts] = useState<ModuleLayoutMeta[]>([])
  const [layoutsLoading, setLayoutsLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // 点外面关闭
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // 打开时懒加载排版列表
  useEffect(() => {
    if (!open || layouts.length > 0) return
    setLayoutsLoading(true)
    listModuleLayouts(meetingId, module)
      .then((r) => setLayouts(r.layouts))
      .catch(() => setError('加载排版列表失败'))
      .finally(() => setLayoutsLoading(false))
  }, [open, meetingId, module, layouts.length])

  // ── 格式按钮处理 ────────────────────────────────────────────────────

  const doDownload = async (layout: string, format: 'md' | 'docx' | 'html', ext: string) => {
    setBusy(true)
    setError(null)
    try {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY) || ''
      const url = moduleExportUrl(meetingId, module, format, layout)
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `导出失败 (${resp.status})`)
      }
      const blob = await resp.blob()
      // 从 Content-Disposition 提取文件名
      const cd = resp.headers.get('content-disposition') || ''
      let filename = `${meetingTitle}_${module}_${layout}.${ext}`
      const m = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i)
      if (m) {
        try { filename = decodeURIComponent(m[1]) } catch { filename = m[1] }
      }
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(downloadUrl)
      setOpen(false)
    } catch (e: any) {
      setError(e?.message || '导出失败')
    } finally {
      setBusy(false)
    }
  }

  const doPngExport = async (layout: string) => {
    setBusy(true)
    setError(null)
    try {
      // 1. 获取 HTML
      const html = await fetchModuleExportHtml(meetingId, module, layout)

      // 2. 创建隐藏容器
      const container = document.createElement('div')
      container.style.cssText =
        'position:fixed;left:-9999px;top:0;width:1200px;z-index:-1;background:#fff'
      container.innerHTML = html
      document.body.appendChild(container)

      // 3. 等待字体 + Mermaid 渲染
      await document.fonts.ready
      await new Promise((r) => setTimeout(r, 500))

      // 检查是否有 mermaid 渲染后的 SVG，再等一轮
      const mermaidSvgs = container.querySelectorAll('pre.mermaid svg')
      if (mermaidSvgs.length === 0) {
        await new Promise((r) => setTimeout(r, 1500))
      }

      // 4. 截图 - 动态 import html-to-image
      const { toPng } = await import('html-to-image')
      const targetEl = container.firstElementChild || container
      const dataUrl = await toPng(targetEl as HTMLElement, {
        quality: 1.0,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
      })

      // 5. 下载
      const blob = await (await fetch(dataUrl)).blob()
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `${meetingTitle}_${module}_${layout}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(downloadUrl)

      // 6. 清理
      document.body.removeChild(container)
      setOpen(false)
    } catch (e: any) {
      setError('PNG 导出失败，请尝试下载 HTML 文件后用浏览器打印为 PDF')
      console.error('PNG export error:', e)
    } finally {
      setBusy(false)
    }
  }

  // ── 渲染 ──────────────────────────────────────────────────────────

  const sz = compact ? 11 : 12
  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => { if (!busy) setOpen((o) => !o) }}
        disabled={busy || !hasData}
        className={`flex items-center gap-1 ${
          compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'
        } rounded border border-line text-ink-secondary bg-white hover:bg-slate-50 disabled:opacity-40 transition-colors`}
        title={!hasData ? '暂无数据可导出' : `导出 ${moduleLabel}`}
      >
        {busy ? (
          <Loader2 size={sz} className="animate-spin" />
        ) : (
          <Download size={sz} />
        )}
        <span>导出{moduleLabel}</span>
        <ChevronDown size={sz - 2} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-[360px] bg-white rounded-lg border border-line shadow-lg overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2 border-b border-line bg-slate-50/60">
            <div className="text-xs font-semibold text-ink">导出 {moduleLabel}</div>
            <div className="text-[10px] text-ink-muted mt-0.5">
              选择排版与格式。PNG 通过浏览器截图生成。
            </div>
          </div>

          {/* Layouts */}
          <div className="divide-y divide-line/60 max-h-[420px] overflow-y-auto">
            {layoutsLoading ? (
              <div className="px-3 py-6 text-center">
                <Loader2 size={16} className="animate-spin mx-auto text-ink-muted" />
                <div className="text-[11px] text-ink-muted mt-1">加载排版…</div>
              </div>
            ) : layouts.length === 0 ? (
              <div className="px-3 py-6 text-center text-[12px] text-ink-muted">
                暂无可用的排版模板
              </div>
            ) : (
              layouts.map((l) => (
                <div key={l.id} className="px-3 py-2.5 hover:bg-slate-50/40">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-ink">{l.name}</div>
                      <div className="text-[10px] text-ink-muted truncate" title={l.description}>
                        {l.description}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <FmtBtn icon={<FileText size={10} />} label=".md"  onClick={() => doDownload(l.id, 'md', 'md')}       title="下载 Markdown 文件" />
                    <FmtBtn icon={<FileDown size={10} />} label=".docx" onClick={() => doDownload(l.id, 'docx', 'docx')} title="下载 Word 文档" />
                    <FmtBtn icon={<Image size={10} />}    label=".png"  onClick={() => doPngExport(l.id)}                title="以图片形式导出" />
                    <FmtBtn icon={<FileText size={10} />} label=".html" onClick={() => doDownload(l.id, 'html', 'html')} title="下载 HTML 文件" />
                  </div>
                </div>
              ))
            )}
          </div>

          {error && (
            <div className="px-3 py-2 border-t border-line bg-red-50 text-[11px] text-red-600">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FmtBtn({
  icon, label, onClick, title,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[10.5px] rounded border border-line text-ink-secondary hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 transition-colors"
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
