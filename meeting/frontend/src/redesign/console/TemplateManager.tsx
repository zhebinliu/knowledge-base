/**
 * TemplateManager — 会议纪要版面模板管理页面。
 *
 * 功能:
 *   - 展示预置 + 用户上传的模板列表
 *   - 上传模板文件（.md / .docx / 图片）
 *   - 手动创建 Markdown 模板
 *   - 预览模板内容
 *   - 删除非内置模板
 */
import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Upload, FileText, Image, Trash2, Eye, EyeOff,
  Loader2, Plus, Download, FileDown, Info,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  listMarkupTemplates, uploadMarkupTemplate, createMarkupTemplate,
  deleteMarkupTemplate, getPlaceholderHelp,
  type MarkupTemplate, type PlaceholderInfo,
} from '../../api/markup-template'
import GlowCard from '../components/GlowCard'

export default function TemplateManager() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  // UI 状态
  const [previewId, setPreviewId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showPlaceholders, setShowPlaceholders] = useState(false)
  // 表单
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newContent, setNewContent] = useState('')
  const [uploadName, setUploadName] = useState('')
  // 操作中
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // 查询
  const { data: templates, isLoading } = useQuery<MarkupTemplate[]>({
    queryKey: ['markup-templates'],
    queryFn: listMarkupTemplates,
  })
  const { data: placeholderHelp } = useQuery<PlaceholderInfo>({
    queryKey: ['markup-placeholders'],
    queryFn: getPlaceholderHelp,
  })

  // 创建
  const createMut = useMutation({
    mutationFn: createMarkupTemplate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['markup-templates'] })
      setShowCreate(false)
      setNewName('')
      setNewDesc('')
      setNewContent('')
    },
  })

  // 上传
  const uploadMut = useMutation({
    mutationFn: (data: { file: File; name?: string; desc?: string }) =>
      uploadMarkupTemplate(data.file, data.name, data.desc),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['markup-templates'] })
      setUploadName('')
      if (fileRef.current) fileRef.current.value = ''
    },
  })

  // 删除
  const deleteMut = useMutation({
    mutationFn: deleteMarkupTemplate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['markup-templates'] })
      setDeletingId(null)
    },
    onError: () => setDeletingId(null),
  })

  // 文件选择
  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    uploadMut.mutate({ file: f, name: uploadName || undefined })
  }, [uploadName, uploadMut])

  // 手动创建
  const handleCreate = useCallback(() => {
    if (!newName.trim() || !newContent.trim()) return
    createMut.mutate({ name: newName.trim(), description: newDesc.trim(), content: newContent.trim() })
  }, [newName, newDesc, newContent, createMut])

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* 头部 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--rd-text)' }}>
            纪要版面模板
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--rd-text-2)' }}>
            管理会议纪要的版面模板，支持用模板渲染并导出纪要
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowPlaceholders(v => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '8px 16px', fontSize: 13, fontWeight: 500,
              color: 'var(--rd-text-2)', background: 'rgba(255,255,255,.04)',
              border: '1px solid var(--rd-line)', borderRadius: 8,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <Info size={14} /> {showPlaceholders ? '隐藏' : '查看'}占位符
          </button>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '8px 16px', fontSize: 13, fontWeight: 600,
              color: '#fff',
              background: 'linear-gradient(135deg,#FF8D1A,#D96400)',
              border: 'none', borderRadius: 8,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <Plus size={14} /> 手动创建
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '8px 16px', fontSize: 13, fontWeight: 600,
              color: '#fff',
              background: 'linear-gradient(135deg,#2563eb,#1d4ed8)',
              border: 'none', borderRadius: 8,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
            disabled={uploadMut.isPending}
          >
            {uploadMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            上传模板
          </button>
          <input ref={fileRef} type="file" hidden
            accept=".md,.markdown,.docx,.png,.jpg,.jpeg,.gif,.webp,.bmp"
            onChange={handleFile}
          />
        </div>
      </div>

      {/* 占位符帮助面板 */}
      {showPlaceholders && placeholderHelp && (
        <GlowCard style={{ marginBottom: 20, padding: 16 }}>
          <h4 style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--rd-text)' }}>可用占位符</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 6 }}>
            {Object.entries(placeholderHelp).map(([key, desc]) => (
              <div key={key} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                <code style={{
                  color: '#2563eb', background: 'rgba(37,99,235,.1)',
                  padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap',
                }}>{key}</code>
                <span style={{ color: 'var(--rd-text-2)' }}>{desc}</span>
              </div>
            ))}
          </div>
        </GlowCard>
      )}

      {/* 上传文件名输入 */}
      {uploadMut.isPending && (
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--rd-text-2)', fontSize: 13 }}>
          <Loader2 size={14} className="animate-spin" /> 正在解析文件...
        </div>
      )}
      {uploadMut.isError && (
        <div style={{ marginBottom: 12, color: '#ef4444', fontSize: 13 }}>
          上传失败：{(uploadMut.error as Error)?.message || '未知错误'}
        </div>
      )}

      {/* 手动创建表单 */}
      {showCreate && (
        <GlowCard style={{ marginBottom: 20, padding: 20 }}>
          <h4 style={{ margin: '0 0 12px', fontSize: 15, color: 'var(--rd-text)' }}>手动创建模板</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              placeholder="模板名称"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              style={{
                padding: '8px 12px', fontSize: 13, borderRadius: 6,
                border: '1px solid var(--rd-line)', background: 'rgba(255,255,255,.03)',
                color: 'var(--rd-text)', fontFamily: 'inherit',
              }}
            />
            <input
              placeholder="模板描述（可选）"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              style={{
                padding: '8px 12px', fontSize: 13, borderRadius: 6,
                border: '1px solid var(--rd-line)', background: 'rgba(255,255,255,.03)',
                color: 'var(--rd-text)', fontFamily: 'inherit',
              }}
            />
            <textarea
              placeholder="Markdown 内容（支持 {{title}} {{date}} {{summary}} 等占位符）"
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              rows={12}
              style={{
                padding: '10px 12px', fontSize: 13, borderRadius: 6,
                border: '1px solid var(--rd-line)', background: 'rgba(255,255,255,.03)',
                color: 'var(--rd-text)', fontFamily: 'monospace', resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCreate(false)}
                style={{
                  padding: '8px 16px', fontSize: 13, fontWeight: 500,
                  color: 'var(--rd-text-2)', background: 'transparent',
                  border: '1px solid var(--rd-line)', borderRadius: 8,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >取消</button>
              <button
                onClick={handleCreate}
                disabled={createMut.isPending || !newName.trim() || !newContent.trim()}
                style={{
                  padding: '8px 16px', fontSize: 13, fontWeight: 600, color: '#fff',
                  background: 'linear-gradient(135deg,#FF8D1A,#D96400)',
                  border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                  opacity: (!newName.trim() || !newContent.trim()) ? 0.5 : 1,
                }}
              >
                {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                创建模板
              </button>
            </div>
          </div>
        </GlowCard>
      )}

      {/* 模板列表 */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--rd-text-2)' }}>
          <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto' }} />
        </div>
      )}

      {templates && templates.length === 0 && !isLoading && (
        <GlowCard style={{ padding: 40, textAlign: 'center', color: 'var(--rd-text-2)' }}>
          <FileText size={40} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ fontSize: 14 }}>暂无模板</p>
          <p style={{ fontSize: 12 }}>点击「上传模板」或「手动创建」添加</p>
        </GlowCard>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
        {templates?.map(tpl => (
          <TemplateCard
            key={tpl.id}
            template={tpl}
            isPreview={previewId === tpl.id}
            onTogglePreview={() => setPreviewId(previewId === tpl.id ? null : tpl.id)}
            onDelete={() => {
              setDeletingId(tpl.id)
              deleteMut.mutate(tpl.id)
            }}
            deleting={deletingId === tpl.id}
          />
        ))}
      </div>
    </div>
  )
}

// ── 模板卡片 ──────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  isPreview,
  onTogglePreview,
  onDelete,
  deleting,
}: {
  template: MarkupTemplate
  isPreview: boolean
  onTogglePreview: () => void
  onDelete: () => void
  deleting: boolean
}) {
  const formatIcon = {
    markdown: <FileText size={14} />,
    docx: <FileText size={14} />,
    image: <Image size={14} />,
  }[template.source_format] || <FileText size={14} />

  return (
    <GlowCard style={{ padding: 0, overflow: 'hidden' }}>
      {/* 卡片头部 */}
      <div style={{
        padding: '14px 16px',
        borderBottom: isPreview ? '1px solid var(--rd-line)' : 'none',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ color: 'var(--rd-text-3)' }}>{formatIcon}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--rd-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {template.name}
            </span>
            {template.is_builtin && (
              <span style={{
                fontSize: 10, color: '#2563eb', background: 'rgba(37,99,235,.12)',
                padding: '1px 6px', borderRadius: 4,
              }}>预置</span>
            )}
            {template.category === 'user_upload' && (
              <span style={{
                fontSize: 10, color: '#D96400', background: 'rgba(255,141,26,.12)',
                padding: '1px 6px', borderRadius: 4,
              }}>用户上传</span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--rd-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {template.description || '无描述'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={onTogglePreview}
            style={{
              padding: '4px 8px', fontSize: 12, color: 'var(--rd-text-2)',
              background: 'transparent', border: 'none', borderRadius: 6,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
            title={isPreview ? '收起预览' : '预览模板'}
          >
            {isPreview ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          {!template.is_builtin && (
            <button
              onClick={onDelete}
              disabled={deleting}
              style={{
                padding: '4px 8px', fontSize: 12, color: deleting ? 'var(--rd-text-3)' : '#ef4444',
                background: 'transparent', border: 'none', borderRadius: 6,
                cursor: deleting ? 'default' : 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
              title="删除模板"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            </button>
          )}
        </div>
      </div>

      {/* 预览区 */}
      {isPreview && (
        <div style={{
          padding: '12px 16px',
          maxHeight: 300, overflowY: 'auto',
          background: 'rgba(248,250,252,.025)',
        }}>
          <div className="text-[12px] leading-relaxed prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-code:text-xs">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {template.content.length > 2000
                ? template.content.slice(0, 2000) + '\n\n..._(内容已截断，完整内容请在渲染后查看)_'
                : template.content}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </GlowCard>
  )
}
