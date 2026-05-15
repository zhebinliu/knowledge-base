/**
 * NewDocChecklist — 项目洞察左栏「文档清单 + 虚拟物」(Liquid Glass)
 * 功能 100% 等价 — getDocChecklist / uploadDocument / updateDocumentMeta / deleteDocument
 *                  + 必需/推荐分组 + 虚拟物问卷入口 + 附加参考 + 关联已有文档选择器
 */
import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2, Upload, Loader2, FileText, Lightbulb, Sparkles,
  ChevronRight, Clock, Network, Paperclip, Plus, Link2, X, Trash2,
} from 'lucide-react'
import {
  getDocChecklist, uploadDocument, updateDocumentMeta, deleteDocument,
  type DocChecklistItem, type VirtualChecklistItem,
  type ExtraReferenceItem, type CandidateAttachItem,
} from '../../api/client'

interface Props {
  projectId: string
  stage: string
  onOpenDocPreview: (docId: string) => void
  onOpenVirtualForm: (vkey: string) => void
  onOpenStakeholderCanvas?: () => void
}

export default function NewDocChecklist({ projectId, stage, onOpenDocPreview, onOpenVirtualForm, onOpenStakeholderCanvas }: Props) {
  const qc = useQueryClient()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['doc-checklist', projectId, stage],
    queryFn: () => getDocChecklist(projectId, stage),
    refetchInterval: 6000,
  })

  if (isLoading) {
    return (
      <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--rd-text-3)' }}>
        <Loader2 size={13} className="animate-spin" style={{ display: 'inline', marginRight: 4 }} /> 加载文档清单…
      </div>
    )
  }
  if (!data) return <div style={{ padding: 16, fontSize: 12, color: 'var(--rd-text-3)' }}>无法加载</div>
  if (!data.stage_has_checklist) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--rd-text-3)' }}>当前阶段「{stage}」未配置文档清单</div>
  }

  const c = data.completion
  const reqDone = c.required + c.virtual_required
  const reqTotal = c.required_total + c.virtual_required_total
  const recDone = c.recommended + c.virtual_recommended
  const recTotal = c.recommended_total + c.virtual_recommended_total

  const onRefresh = () => {
    refetch()
    qc.invalidateQueries({ queryKey: ['project-docs', projectId] })
    qc.invalidateQueries({ queryKey: ['insight-checkup', projectId] })
    qc.invalidateQueries({ queryKey: ['project', projectId] })
  }

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      // 不要给外层 backdrop-filter — 玻璃叠玻璃只剩白,会阻止子 row 看到颜色
      background: 'transparent',
      borderRight: '1px solid rgba(255,255,255,0.05)',
    }}>
      {/* 头部:完成度 */}
      <div style={{
        flexShrink: 0, padding: '10px 14px',
        borderBottom: '1px solid var(--rd-line)',
        background: 'linear-gradient(180deg, rgba(255,141,26,.08) 0%, transparent 100%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--rd-text)' }}>文档清单</span>
          <span style={{ fontSize: 12, color: 'var(--rd-text-3)' }}>· 项目洞察</span>
          {c.all_required_done && (
            <span style={{
              marginLeft: 'auto', padding: '1px 8px', borderRadius: 4,
              fontSize: 12, fontWeight: 600,
              color: '#34D399', background: 'rgba(5, 150, 105, .15)',
            }}>
              <CheckCircle2 size={9} style={{ display: 'inline', marginRight: 2 }} />可生成
            </span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <ProgressLine label="必需" done={reqDone} total={reqTotal} color="var(--rd-accent-2)" />
          {recTotal > 0 && <ProgressLine label="推荐" done={recDone} total={recTotal} color="#60A5FA" />}
        </div>
      </div>

      {/* 列表 */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Section title="必需 ★">
          {data.required_docs.map(d => (
            <DocRow
              key={d.doc_type} item={d} projectId={projectId}
              onPreview={onOpenDocPreview} onUploaded={onRefresh}
              onCanvas={d.doc_type === 'stakeholder_map' ? onOpenStakeholderCanvas : undefined}
            />
          ))}
          {data.virtual_required.map(v => (
            <VirtualRow key={v.key} item={v} onClick={() => onOpenVirtualForm(v.key)} />
          ))}
        </Section>

        {(data.recommended_docs.length + data.virtual_recommended.length) > 0 && (
          <Section title="推荐">
            {data.recommended_docs.map(d => (
              <DocRow
                key={d.doc_type} item={d} projectId={projectId}
                onPreview={onOpenDocPreview} onUploaded={onRefresh}
                onCanvas={d.doc_type === 'stakeholder_map' ? onOpenStakeholderCanvas : undefined}
              />
            ))}
            {data.virtual_recommended.map(v => (
              <VirtualRow key={v.key} item={v} onClick={() => onOpenVirtualForm(v.key)} />
            ))}
          </Section>
        )}

        <ExtraReferencesSection
          projectId={projectId}
          extraRefs={data.extra_references ?? []}
          candidates={data.candidates_to_attach ?? []}
          onPreview={onOpenDocPreview}
          onChanged={onRefresh}
        />
      </div>
    </div>
  )
}

function ProgressLine({ label, done, total, color }: { label: string; done: number; total: number; color: string }) {
  const pct = total > 0 ? (done / total) * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--rd-text-3)', width: 28, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 4, background: 'rgba(0,0,0,0.25)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, boxShadow: `0 0 4px ${color}`, transition: 'width .3s' }} />
      </div>
      <span className="rd-mono" style={{ fontSize: 12, color: 'var(--rd-text-3)', flexShrink: 0 }}>{done}/{total}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 12, color: 'var(--rd-text-3)', fontWeight: 600,
        padding: '0 4px 6px', textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>
    </div>
  )
}

function DocRow({ item, projectId, onPreview, onUploaded, onCanvas }: {
  item: DocChecklistItem
  projectId: string
  onPreview: (docId: string) => void
  onUploaded: () => void
  onCanvas?: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setUploading(true); setError(null)
    try {
      await uploadDocument(f, { project_id: projectId, doc_type: item.doc_type })
      onUploaded()
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || '上传失败')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // 状态色:已上传翠绿、必需未传暖红、其他白
  const tint = item.uploaded
    ? { border: 'rgba(16, 185, 129, .45)', glow: 'rgba(110, 231, 183, 0.75)', tint: 'rgba(16, 185, 129, 0.10)' }
    : item.necessity === 'required'
      ? { border: 'rgba(220, 38, 38, .35)', glow: 'rgba(252, 165, 165, 0.65)', tint: 'rgba(220, 38, 38, 0.07)' }
      : { border: 'rgba(255,255,255,0.10)', glow: 'rgba(255,255,255,0.12)', tint: 'rgba(255, 255, 255, 0.20)' }

  return (
    <div
      className="rd-doc-row"
      style={{
        padding: '10px 11px', borderRadius: 12,
        border: `1px solid ${tint.border}`,
        // 半透叠加色调:linear-gradient 从顶部高亮白到底部色调
        background: `linear-gradient(135deg, rgba(255,255,255,0.08) 0%, ${tint.tint} 100%), rgba(255,255,255,0.05)`,
        backdropFilter: 'blur(22px) saturate(180%)',
        WebkitBackdropFilter: 'blur(22px) saturate(180%)',
        // 顶高光 + 底阴影 + 外发光(玻璃片的层次)
        boxShadow: `
          inset 0 1px 0 ${tint.glow},
          inset 0 -1px 0 rgba(0,0,0,0.25),
          0 4px 14px -4px rgba(0,0,0,0.40)
        `,
        transition: 'transform .22s var(--rd-ease), border-color .18s, box-shadow .22s',
        position: 'relative',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = `
          inset 0 1px 0 ${tint.glow},
          inset 0 -1px 0 rgba(0,0,0,0.25),
          0 12px 24px -6px rgba(0,0,0,0.40)
        `
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = `
          inset 0 1px 0 ${tint.glow},
          inset 0 -1px 0 rgba(0,0,0,0.25),
          0 4px 14px -4px rgba(0,0,0,0.40)
        `
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
        {item.uploaded ? (
          <CheckCircle2 size={13} color="#34D399" style={{ marginTop: 2, flexShrink: 0 }} />
        ) : (
          <span style={{
            width: 12, height: 12, borderRadius: '50%',
            border: `2px solid ${item.necessity === 'required' ? '#F87171' : 'var(--rd-text-3)'}`,
            marginTop: 2, flexShrink: 0,
          }} />
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <FileText size={11} color="var(--rd-text-3)" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--rd-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
            {item.necessity === 'required' && !item.uploaded && (
              <span style={{ fontSize: 12, color: '#F87171', fontWeight: 600 }}>必需</span>
            )}
          </div>
          {item.documents.length > 0 && (
            <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {item.documents.map(doc => (
                <div key={doc.doc_id} className="group" style={{ display: 'flex', alignItems: 'flex-start', gap: 3 }}>
                  <button
                    onClick={() => onPreview(doc.doc_id)}
                    title={doc.filename}
                    style={{
                      flex: 1, minWidth: 0, textAlign: 'left', fontSize: 12,
                      color: 'var(--rd-text-2)', background: 'transparent', border: 'none', padding: 0,
                      cursor: 'pointer',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--rd-accent-2)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--rd-text-2)'}
                  >
                    {doc.status === 'retrying' && <Clock size={8} color="#D97706" style={{ display: 'inline', marginRight: 2 }} />}
                    {doc.status === 'failed' && <Clock size={8} color="#F87171" style={{ display: 'inline', marginRight: 2 }} />}
                    {(doc.status === 'converting' || doc.status === 'slicing' || doc.status === 'pending') &&
                      <Clock size={8} color="#2563EB" style={{ display: 'inline', marginRight: 2 }} />}
                    · {doc.filename}
                    {doc.status !== 'completed' && (
                      <span style={{ marginLeft: 4, fontSize: 9.5, color: 'var(--rd-text-3)' }}>
                        ({doc.status === 'retrying' ? '重试中' : doc.status === 'failed' ? '失败' : doc.status})
                      </span>
                    )}
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation()
                      if (!confirm(`删除文档「${doc.filename}」?\n\n此操作不可撤销。`)) return
                      try { await deleteDocument(doc.doc_id); onUploaded() }
                      catch (err: any) { alert(err?.response?.data?.detail || err?.message || '删除失败') }
                    }}
                    style={{
                      padding: 2, background: 'transparent', border: 'none', cursor: 'pointer',
                      color: 'var(--rd-text-3)', flexShrink: 0,
                      opacity: 0, transition: 'opacity .15s, color .15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#F87171' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--rd-text-3)' }}
                    className="group-hover-visible"
                    title="删除文档"
                  >
                    <Trash2 size={9} />
                  </button>
                </div>
              ))}
              {item.documents.some(d => d.error || d.progress) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                  {item.documents.filter(d => d.error).map(d => (
                    <div key={`err-${d.doc_id}`} style={{ fontSize: 9.5, color: '#F87171', paddingLeft: 12, lineHeight: 1.4 }} title={d.error || ''}>
                      ⚠ {(d.error || '').length > 80 ? (d.error || '').slice(0, 80) + '…' : d.error}
                    </div>
                  ))}
                  {item.documents.filter(d => !d.error && d.progress).map(d => (
                    <div key={`prog-${d.doc_id}`} style={{
                      fontSize: 9.5, color: '#2563EB', paddingLeft: 12, lineHeight: 1.4,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }} title={d.progress || ''}>⏳ {d.progress}</div>
                  ))}
                </div>
              )}
            </div>
          )}
          {error && <div style={{ fontSize: 12, color: '#F87171', marginTop: 4 }}>{error}</div>}
        </div>
        {onCanvas && (
          <button
            type="button"
            onClick={onCanvas}
            style={{
              padding: 4, background: 'transparent', border: 'none', cursor: 'pointer',
              color: '#A78BFA', flexShrink: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#A78BFA'}
            onMouseLeave={e => e.currentTarget.style.color = '#A78BFA'}
            title="在画布上手动编辑组织架构 / 干系人"
          >
            <Network size={11} />
          </button>
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{
            padding: 4, background: 'transparent', border: 'none', cursor: uploading ? 'not-allowed' : 'pointer',
            color: 'var(--rd-text-3)', flexShrink: 0, opacity: uploading ? 0.5 : 1,
          }}
          onMouseEnter={e => { if (!uploading) e.currentTarget.style.color = 'var(--rd-accent-2)' }}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--rd-text-3)'}
          title={item.uploaded ? '再上传一份' : '上传文档'}
        >
          {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
        </button>
        <input
          ref={fileRef} type="file" style={{ display: 'none' }}
          accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.csv,.md,.txt"
          onChange={onPick}
        />
      </div>
    </div>
  )
}

function VirtualRow({ item, onClick }: { item: VirtualChecklistItem; onClick: () => void }) {
  const Icon = item.key === 'v_success_metrics' ? Sparkles : Lightbulb
  const tint = item.filled
    ? { border: 'rgba(16, 185, 129, .45)', glow: 'rgba(110, 231, 183, 0.75)', tint: 'rgba(16, 185, 129, 0.10)' }
    : item.necessity === 'required'
      ? { border: 'rgba(124, 58, 237, .42)', glow: 'rgba(196, 181, 253, 0.70)', tint: 'rgba(124, 58, 237, 0.09)' }
      : { border: 'rgba(255,255,255,0.10)', glow: 'rgba(255,255,255,0.12)', tint: 'rgba(255, 255, 255, 0.20)' }

  return (
    <button
      onClick={onClick}
      className="rd-doc-row"
      style={{
        width: '100%', textAlign: 'left', padding: '10px 11px', borderRadius: 12,
        border: `1px solid ${tint.border}`,
        background: `linear-gradient(135deg, rgba(255,255,255,0.08) 0%, ${tint.tint} 100%), rgba(255,255,255,0.05)`,
        backdropFilter: 'blur(22px) saturate(180%)',
        WebkitBackdropFilter: 'blur(22px) saturate(180%)',
        boxShadow: `
          inset 0 1px 0 ${tint.glow},
          inset 0 -1px 0 rgba(0,0,0,0.25),
          0 4px 14px -4px rgba(0,0,0,0.40)
        `,
        cursor: 'pointer', fontFamily: 'inherit',
        transition: 'transform .22s var(--rd-ease), border-color .18s, box-shadow .22s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = `
          inset 0 1px 0 ${tint.glow},
          inset 0 -1px 0 rgba(0,0,0,0.25),
          0 12px 24px -6px rgba(0,0,0,0.40)
        `
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = `
          inset 0 1px 0 ${tint.glow},
          inset 0 -1px 0 rgba(0,0,0,0.25),
          0 4px 14px -4px rgba(0,0,0,0.40)
        `
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
        {item.filled ? (
          <CheckCircle2 size={13} color="#34D399" style={{ marginTop: 2, flexShrink: 0 }} />
        ) : (
          <span style={{
            width: 12, height: 12, borderRadius: '50%',
            border: `2px solid ${item.necessity === 'required' ? '#A78BFA' : 'var(--rd-text-3)'}`,
            marginTop: 2, flexShrink: 0,
          }} />
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon size={11} color="#A78BFA" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--rd-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
            <span style={{ fontSize: 12, color: 'var(--rd-text-3)' }}>问卷</span>
            {item.necessity === 'required' && !item.filled && (
              <span style={{ fontSize: 12, color: '#A78BFA', fontWeight: 600 }}>必填</span>
            )}
          </div>
          <div style={{
            fontSize: 12, color: 'var(--rd-text-3)', marginTop: 2,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{item.description}</div>
          {item.total_count > 0 && (
            <div style={{ fontSize: 12, color: 'var(--rd-text-3)', marginTop: 2 }}>已答 {item.filled_count}/{item.total_count}</div>
          )}
        </div>
        <ChevronRight size={11} color="var(--rd-text-3)" style={{ marginTop: 4, flexShrink: 0 }} />
      </div>
    </button>
  )
}

function ExtraReferencesSection({ projectId, extraRefs, candidates, onPreview, onChanged }: {
  projectId: string
  extraRefs: ExtraReferenceItem[]
  candidates: CandidateAttachItem[]
  onPreview: (docId: string) => void
  onChanged: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setUploading(true); setError(null)
    try { await uploadDocument(f, { project_id: projectId, doc_type: 'extra_reference' }); onChanged() }
    catch (err: any) { setError(err?.response?.data?.detail || err?.message || '上传失败') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const onDetach = async (docId: string) => {
    try { await updateDocumentMeta(docId, { doc_type: null }); onChanged() }
    catch (err: any) { setError(err?.response?.data?.detail || err?.message || '解除关联失败') }
  }

  const onDelete = async (docId: string, filename: string) => {
    if (!confirm(`删除文档「${filename}」?\n\n此操作不可撤销 — 文档会从项目里完全移除。`)) return
    try { await deleteDocument(docId); onChanged() }
    catch (err: any) { setError(err?.response?.data?.detail || err?.message || '删除失败') }
  }

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        fontSize: 12, fontWeight: 600, color: 'var(--rd-text-3)',
        padding: '0 4px 6px', textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        <Paperclip size={10} /> 附加参考
        <span style={{ fontSize: 12, textTransform: 'none', color: 'var(--rd-text-3)', opacity: 0.7, letterSpacing: 0 }}>· 喂给洞察的额外文档</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {extraRefs.map(d => (
          <div key={d.doc_id} style={{
            padding: '5px 9px', borderRadius: 6,
            border: '1px solid rgba(124, 58, 237, .18)',
            background: 'rgba(124, 58, 237, .04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <FileText size={11} color="#A78BFA" style={{ flexShrink: 0 }} />
              <button
                onClick={() => onPreview(d.doc_id)}
                style={{
                  flex: 1, fontSize: 12, color: 'var(--rd-text)',
                  background: 'transparent', border: 'none', padding: 0,
                  cursor: 'pointer', textAlign: 'left',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--rd-accent-2)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--rd-text)'}
                title={d.filename}
              >
                {d.filename}
                {d.status !== 'completed' && (
                  <span style={{ marginLeft: 4, fontSize: 12, color: 'var(--rd-text-3)' }}>
                    ({d.status === 'retrying' ? '重试中' : d.status === 'failed' ? '失败' : d.status})
                  </span>
                )}
              </button>
              {d.status !== 'completed' && <Clock size={9} color={d.status === 'failed' ? '#F87171' : '#D97706'} style={{ flexShrink: 0 }} />}
              <button onClick={() => onDetach(d.doc_id)} style={{
                padding: 2, background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--rd-text-3)', flexShrink: 0,
              }} title="解除关联(文档保留在项目里)">
                <X size={11} />
              </button>
              <button onClick={() => onDelete(d.doc_id, d.filename)} style={{
                padding: 2, background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--rd-text-3)', flexShrink: 0,
              }} title="彻底删除(从项目完全移除)">
                <Trash2 size={10} />
              </button>
            </div>
            {d.error && (
              <div style={{ fontSize: 12, color: '#F87171', marginTop: 2, lineHeight: 1.4 }} title={d.error}>
                ⚠ {d.error.length > 100 ? d.error.slice(0, 100) + '…' : d.error}
              </div>
            )}
            {!d.error && d.progress && (
              <div style={{
                fontSize: 12, color: '#2563EB', marginTop: 2, lineHeight: 1.4,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }} title={d.progress}>⏳ {d.progress}</div>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{
            flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            padding: '6px 8px', borderRadius: 6, fontSize: 12,
            color: 'var(--rd-text-3)',
            background: 'transparent',
            border: '1px dashed var(--rd-line)',
            cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.5 : 1,
            fontFamily: 'inherit', transition: 'color .15s, border-color .15s',
          }}
          onMouseEnter={e => { if (!uploading) { e.currentTarget.style.color = 'var(--rd-accent-2)'; e.currentTarget.style.borderColor = 'rgba(255, 141, 26, .35)' } }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--rd-text-3)'; e.currentTarget.style.borderColor = 'var(--rd-line)' }}
        >
          {uploading ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
          上传文件
        </button>
        <button
          onClick={() => setPickerOpen(true)}
          disabled={candidates.length === 0}
          style={{
            flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            padding: '6px 8px', borderRadius: 6, fontSize: 12,
            color: candidates.length === 0 ? 'var(--rd-text-3)' : 'var(--rd-text-3)',
            background: 'transparent',
            border: '1px dashed var(--rd-line)',
            cursor: candidates.length === 0 ? 'not-allowed' : 'pointer',
            opacity: candidates.length === 0 ? 0.4 : 1,
            fontFamily: 'inherit',
          }}
          title={candidates.length === 0 ? '项目里没有可关联的其他文档' : `从项目里 ${candidates.length} 份其他文档里选`}
        >
          <Link2 size={10} />
          关联已有 {candidates.length > 0 && <span style={{ color: 'var(--rd-text-3)', opacity: 0.6 }}>({candidates.length})</span>}
        </button>
      </div>
      {error && <div style={{ fontSize: 12, color: '#F87171', marginTop: 4, paddingLeft: 4 }}>{error}</div>}
      <input
        ref={fileRef} type="file" style={{ display: 'none' }}
        accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.csv,.md,.txt"
        onChange={onUpload}
      />

      {pickerOpen && (
        <AttachExistingPicker
          candidates={candidates}
          onClose={() => setPickerOpen(false)}
          onConfirm={async (docIds) => {
            try {
              await Promise.all(docIds.map(id => updateDocumentMeta(id, { doc_type: 'extra_reference' })))
              onChanged()
              setPickerOpen(false)
            } catch (err: any) {
              setError(err?.response?.data?.detail || err?.message || '关联失败')
            }
          }}
        />
      )}
    </div>
  )
}

function AttachExistingPicker({ candidates, onClose, onConfirm }: {
  candidates: CandidateAttachItem[]
  onClose: () => void
  onConfirm: (docIds: string[]) => Promise<void>
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  const toggle = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 480, maxHeight: '70vh', borderRadius: 16,
          background: 'rgba(255,255,255,0.12)',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 25px 50px -12px rgba(15, 18, 36, .25)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--rd-line)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Link2 size={13} color="#A78BFA" />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--rd-text)' }}>关联项目里的已有文档</span>
          <button onClick={onClose} className="rd-icon-btn" style={{ marginLeft: 'auto', width: 26, height: 26 }}><X size={13} /></button>
        </div>
        <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--rd-text-3)', background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid var(--rd-line)' }}>
          选中后这些文档会被作为「附加参考」喂给项目洞察生成。
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {candidates.length === 0 && (
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--rd-text-3)', padding: '32px 0' }}>项目里没有可关联的其他文档</div>
          )}
          {candidates.map(c => {
            const sel = selected.has(c.doc_id)
            return (
              <label key={c.doc_id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px', borderRadius: 6,
                border: `1px solid ${sel ? 'rgba(124, 58, 237, .35)' : 'var(--rd-line)'}`,
                background: sel ? 'rgba(124, 58, 237, .06)' : 'transparent',
                cursor: 'pointer',
              }}>
                <input type="checkbox" checked={sel} onChange={() => toggle(c.doc_id)} style={{ accentColor: '#A78BFA' }} />
                <FileText size={11} color="var(--rd-text-3)" style={{ flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div title={c.filename} style={{
                    fontSize: 12, color: 'var(--rd-text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{c.filename}</div>
                  <div style={{ fontSize: 12, color: 'var(--rd-text-3)' }}>
                    {c.doc_type_label || '未分类'}
                    {c.status !== 'completed' && <span style={{ color: '#D97706', marginLeft: 6 }}>· {c.status}</span>}
                  </div>
                </div>
              </label>
            )
          })}
        </div>
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--rd-line)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--rd-text-3)' }}>已选 {selected.size} 份</span>
          <button onClick={onClose} className="rd-btn" style={{ marginLeft: 'auto', padding: '5px 12px', fontSize: 12 }}>取消</button>
          <button
            onClick={async () => {
              if (selected.size === 0) return
              setSubmitting(true)
              try { await onConfirm(Array.from(selected)) }
              finally { setSubmitting(false) }
            }}
            disabled={selected.size === 0 || submitting}
            className="rd-btn rd-btn-primary"
            style={{ padding: '5px 12px', fontSize: 12 }}
          >
            {submitting ? <Loader2 size={11} className="animate-spin" /> : <Link2 size={11} />}
            关联选中
          </button>
        </div>
      </div>
    </div>
  )
}
