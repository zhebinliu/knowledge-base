/**
 * TemplateSelector — 会议详情页内嵌的模板选择与导出组件。
 *
 * 使用方式：在 meeting detail 页面中嵌入此组件，传入 meetingId:
 *   <TemplateSelector meetingId={meeting.id} meetingTitle={meeting.title} />
 */
import { useState, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  FileText, Download, FileDown, Loader2, ChevronDown,
  LayoutTemplate, Eye, EyeOff, X,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  listMarkupTemplates, renderTemplate,
  exportTemplateDocx, exportTemplateMd,
  type MarkupTemplate, type TemplateRenderResult,
} from '../api/markup-template'

export default function TemplateSelector({
  meetingId,
  meetingTitle,
}: {
  meetingId: number
  meetingTitle?: string
}) {
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [rendered, setRendered] = useState<TemplateRenderResult | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  const { data: templates, isLoading } = useQuery<MarkupTemplate[]>({
    queryKey: ['markup-templates'],
    queryFn: listMarkupTemplates,
  })

  const renderMut = useMutation({
    mutationFn: (templateId: number) => renderTemplate(templateId, meetingId),
    onSuccess: (data) => {
      setRendered(data)
    },
  })

  const docxMut = useMutation({
    mutationFn: (templateId: number) => exportTemplateDocx(templateId, meetingId),
    onSuccess: (blob) => {
      downloadBlob(blob as Blob, (meetingTitle || '会议纪要') + '.docx')
    },
  })

  const mdMut = useMutation({
    mutationFn: (templateId: number) => exportTemplateMd(templateId, meetingId),
    onSuccess: (blob) => {
      downloadBlob(blob as Blob, (meetingTitle || '会议纪要') + '.md')
    },
  })

  const handleSelect = useCallback((tplId: number) => {
    setSelectedId(tplId)
    setOpen(false)
    renderMut.mutate(tplId)
  }, [renderMut])

  const handleExportDocx = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (selectedId) docxMut.mutate(selectedId)
  }, [selectedId, docxMut])

  const handleExportMd = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (selectedId) mdMut.mutate(selectedId)
  }, [selectedId, mdMut])

  const selectedTemplate = templates?.find(t => t.id === selectedId)

  return (
    <div style={{ position: 'relative' }}>
      {/* 选择器触发按钮 */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', fontSize: 13, fontWeight: 600,
          color: '#fff',
          background: selectedTemplate
            ? 'linear-gradient(135deg,#2563eb,#1d4ed8)'
            : 'linear-gradient(135deg,#FF8D1A,#D96400)',
          border: 'none', borderRadius: 8,
          cursor: 'pointer', fontFamily: 'inherit',
          transition: 'all .2s',
        }}
      >
        <LayoutTemplate size={14} />
        {selectedTemplate ? selectedTemplate.name : '选择模板导出'}
        <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>

      {/* 下拉列表 */}
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4,
            minWidth: 260, maxHeight: 320, overflowY: 'auto',
            background: 'var(--rd-surface, #1A1D2E)', borderRadius: 10,
            border: '1px solid var(--rd-line)',
            boxShadow: '0 12px 40px rgba(0,0,0,.4)',
            zIndex: 99, padding: 6,
          }}>
            {isLoading && (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--rd-text-3)', fontSize: 13 }}>
                <Loader2 size={16} className="animate-spin" style={{ margin: '0 auto 8px' }} /> 加载中...
              </div>
            )}
            {templates?.map(tpl => (
              <button
                key={tpl.id}
                onClick={() => handleSelect(tpl.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '10px 12px',
                  fontSize: 13, fontWeight: selectedId === tpl.id ? 600 : 400,
                  color: 'var(--rd-text)',
                  background: selectedId === tpl.id ? 'rgba(37,99,235,.08)' : 'transparent',
                  border: 'none', borderRadius: 6,
                  cursor: 'pointer', textAlign: 'left',
                  fontFamily: 'inherit',
                  transition: 'background .15s',
                }}
                onMouseEnter={e => {
                  if (selectedId !== tpl.id) e.currentTarget.style.background = 'rgba(255,255,255,.04)'
                }}
                onMouseLeave={e => {
                  if (selectedId !== tpl.id) e.currentTarget.style.background = 'transparent'
                }}
              >
                <FileText size={13} style={{ color: tpl.is_builtin ? '#2563eb' : '#D96400' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tpl.name}
                  </div>
                </div>
                {tpl.is_builtin && (
                  <span style={{ fontSize: 10, color: '#2563eb', background: 'rgba(37,99,235,.12)', padding: '1px 5px', borderRadius: 3 }}>
                    预置
                  </span>
                )}
              </button>
            ))}
            {templates?.length === 0 && (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--rd-text-3)', fontSize: 12 }}>
                暂无模板，请先在模板管理页面上传
              </div>
            )}
          </div>
        </>
      )}

      {/* 渲染结果 + 导出按钮 */}
      {selectedTemplate && (
        <div style={{ marginTop: 12 }}>
          {/* 操作栏 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px',
            background: 'rgba(37,99,235,.06)', borderRadius: 8,
            border: '1px solid rgba(37,99,235,.15)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#2563eb', flex: 1 }}>
              当前模板：{selectedTemplate.name}
            </span>
            <button
              onClick={() => setShowPreview(v => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '5px 10px', fontSize: 12, fontWeight: 500,
                color: 'var(--rd-text-2)', background: 'rgba(255,255,255,.04)',
                border: '1px solid var(--rd-line)', borderRadius: 6,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
              {showPreview ? '隐藏预览' : '预览'}
            </button>
            <button
              onClick={handleExportMd}
              disabled={mdMut.isPending}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '5px 10px', fontSize: 12, fontWeight: 500,
                color: 'var(--rd-text)', background: 'rgba(255,255,255,.06)',
                border: '1px solid var(--rd-line)', borderRadius: 6,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {mdMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              .md
            </button>
            <button
              onClick={handleExportDocx}
              disabled={docxMut.isPending}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '5px 10px', fontSize: 12, fontWeight: 600,
                color: '#fff',
                background: 'linear-gradient(135deg,#2563eb,#1d4ed8)',
                border: 'none', borderRadius: 6,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {docxMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />}
              导出 Word
            </button>
          </div>

          {/* 渲染预览 */}
          {showPreview && (
            <div style={{
              marginTop: 8, padding: '12px 16px',
              background: 'rgba(255,255,255,.02)',
              border: '1px solid var(--rd-line)', borderRadius: 8,
              maxHeight: 400, overflowY: 'auto',
            }}>
              {renderMut.isPending ? (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--rd-text-3)' }}>
                  <Loader2 size={18} className="animate-spin" /> 正在渲染...
                </div>
              ) : rendered ? (
                <div className="text-[13px] leading-relaxed prose prose-sm max-w-none prose-p:my-1.5 prose-headings:mt-3 prose-headings:mb-2 prose-table:text-xs prose-code:text-xs">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {rendered.rendered}
                  </ReactMarkdown>
                </div>
              ) : renderMut.isError ? (
                <div style={{ color: '#ef4444', fontSize: 13 }}>
                  渲染失败：{(renderMut.error as Error)?.message || '未知错误'}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── 工具 ──────────────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
