/**
 * DocChecklist — 项目详情页左栏「文档清单 + 虚拟物」
 *
 * 渲染:
 *  - 必需文档(★) :上传/未上传 状态 + 「+ 上传」按钮 + 已上传文档列表(可点击预览)
 *  - 推荐文档:同上但标记弱
 *  - 虚拟物(成功指标 / 风险预警):点击触发问卷面板(由父组件接管)
 *  - 顶部:完成度统计
 *
 * 父组件需提供:
 *  - onOpenDocPreview(docId)  打开文档预览
 *  - onOpenVirtualForm(vkey)   打开虚拟物问卷
 *  - onUploaded()             上传成功后刷新清单
 */
import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2, Upload, Loader2, FileText, Lightbulb, Sparkles,
  ChevronRight, Clock, Network, Paperclip, Plus, Link2, X,
} from 'lucide-react'
import {
  getDocChecklist, uploadDocument, updateDocumentMeta,
  type DocChecklistItem, type VirtualChecklistItem,
  type ExtraReferenceItem, type CandidateAttachItem,
} from '../../api/client'

interface Props {
  projectId: string
  stage: string                    // 默认 insight_v2
  onOpenDocPreview: (docId: string) => void
  onOpenVirtualForm: (vkey: string) => void
  onOpenStakeholderCanvas?: () => void   // 干系人图谱 canvas 编辑入口
}

const BRAND = '#D96400'

export default function DocChecklist({ projectId, stage, onOpenDocPreview, onOpenVirtualForm, onOpenStakeholderCanvas }: Props) {
  const qc = useQueryClient()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['doc-checklist', projectId, stage],
    queryFn: () => getDocChecklist(projectId, stage),
    refetchInterval: 6000,         // 文档转换中,定时刷新
  })

  if (isLoading) {
    return (
      <div className="p-4 text-center text-xs text-ink-muted">
        <Loader2 size={14} className="inline animate-spin mr-1" />加载文档清单…
      </div>
    )
  }
  if (!data) {
    return <div className="p-4 text-xs text-ink-muted">无法加载</div>
  }
  if (!data.stage_has_checklist) {
    return (
      <div className="p-4 text-xs text-ink-muted">
        当前阶段「{stage}」未配置文档清单
      </div>
    )
  }

  const c = data.completion
  const reqDone = c.required + c.virtual_required
  const reqTotal = c.required_total + c.virtual_required_total
  const recDone = c.recommended + c.virtual_recommended
  const recTotal = c.recommended_total + c.virtual_recommended_total

  const onRefresh = () => {
    refetch()
    qc.invalidateQueries({ queryKey: ['project-docs', projectId] })
  }

  return (
    <div className="h-full flex flex-col bg-white border-r border-line">
      {/* 头部:完成度 */}
      <div className="flex-shrink-0 px-3 py-2.5 border-b border-line bg-gradient-to-b from-orange-50/40 to-white">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-sm font-semibold text-ink">文档清单</span>
          <span className="text-[10px] text-ink-muted">· 项目洞察</span>
          {c.all_required_done && (
            <span className="ml-auto px-1.5 py-0.5 text-[10px] rounded bg-emerald-100 text-emerald-700 font-medium">
              <CheckCircle2 size={9} className="inline mr-0.5" />可生成
            </span>
          )}
        </div>
        <div className="space-y-1">
          <ProgressLine label="必需" done={reqDone} total={reqTotal} color="bg-[#D96400]" />
          {recTotal > 0 && (
            <ProgressLine label="推荐" done={recDone} total={recTotal} color="bg-blue-400" />
          )}
        </div>
      </div>

      {/* 列表(可滚动) */}
      <div className="flex-1 min-h-0 overflow-auto p-2 space-y-3">
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

        {/* 附加参考文档 — 不在 7 类预设里,用户手动添加 */}
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

// ── 附加参考文档 section ─────────────────────────────────────────────────────

function ExtraReferencesSection({
  projectId, extraRefs, candidates, onPreview, onChanged,
}: {
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
    try {
      await uploadDocument(f, { project_id: projectId, doc_type: 'extra_reference' })
      onChanged()
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || '上传失败')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // 解除关联(把 extra_reference doc_type 清掉,文档仍在项目里)
  const onDetach = async (docId: string) => {
    try {
      await updateDocumentMeta(docId, { doc_type: null })
      onChanged()
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || '解除关联失败')
    }
  }

  return (
    <div>
      <div className="text-[10px] text-ink-muted font-medium px-1 mb-1.5 uppercase tracking-wider flex items-center gap-1">
        <Paperclip size={10} /> 附加参考
        <span className="text-[9px] normal-case text-ink-muted/70">· 喂给洞察的额外文档</span>
      </div>

      {/* 已挂的附加文档 */}
      <div className="space-y-1">
        {extraRefs.map(d => (
          <div key={d.doc_id}
               className="px-2 py-1.5 rounded border border-purple-100 bg-purple-50/30 flex items-center gap-1.5">
            <FileText size={11} className="text-purple-600 shrink-0" />
            <button onClick={() => onPreview(d.doc_id)}
                    className="text-[11px] text-ink hover:text-[#D96400] truncate text-left flex-1"
                    title={d.filename}>
              {d.filename}
            </button>
            {d.status !== 'completed' && <Clock size={9} className="text-amber-600 shrink-0" />}
            <button onClick={() => onDetach(d.doc_id)}
                    className="shrink-0 p-0.5 text-ink-muted hover:text-red-600"
                    title="解除关联(文档保留在项目里)">
              <X size={11} />
            </button>
          </div>
        ))}
      </div>

      {/* 操作按钮组 */}
      <div className="mt-1.5 flex items-center gap-1.5">
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] text-ink-muted hover:text-[#D96400] border border-dashed border-line hover:border-orange-300 rounded transition-colors disabled:opacity-50">
          {uploading ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
          上传文件
        </button>
        <button onClick={() => setPickerOpen(true)} disabled={candidates.length === 0}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] text-ink-muted hover:text-[#D96400] border border-dashed border-line hover:border-orange-300 rounded transition-colors disabled:opacity-40 disabled:hover:text-ink-muted disabled:hover:border-line"
          title={candidates.length === 0 ? '项目里没有可关联的其他文档' : `从项目里 ${candidates.length} 份其他文档里选`}>
          <Link2 size={10} />
          关联已有 {candidates.length > 0 && <span className="text-ink-muted/60">({candidates.length})</span>}
        </button>
      </div>
      {error && <div className="text-[10px] text-red-600 mt-1 px-1">{error}</div>}
      <input ref={fileRef} type="file" className="hidden"
             accept=".pdf,.docx,.pptx,.xlsx,.csv,.md,.txt"
             onChange={onUpload} />

      {/* 选择器:列出项目里的其他文档供多选 */}
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

function AttachExistingPicker({
  candidates, onClose, onConfirm,
}: {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[480px] max-h-[70vh] flex flex-col"
           onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-line flex items-center gap-2">
          <Link2 size={13} className="text-purple-600" />
          <span className="text-sm font-semibold text-ink">关联项目里的已有文档</span>
          <button onClick={onClose} className="ml-auto p-1 text-ink-muted hover:text-ink">
            <X size={14} />
          </button>
        </div>
        <div className="px-4 py-2 text-[11px] text-ink-muted bg-slate-50 border-b border-line">
          选中后这些文档会被作为「附加参考」喂给项目洞察生成。
        </div>
        <div className="flex-1 overflow-auto p-3 space-y-1.5">
          {candidates.length === 0 && (
            <div className="text-center text-xs text-ink-muted py-8">项目里没有可关联的其他文档</div>
          )}
          {candidates.map(c => (
            <label key={c.doc_id}
                   className={`flex items-center gap-2 px-2.5 py-2 rounded border cursor-pointer transition-colors ${
                     selected.has(c.doc_id) ? 'border-purple-300 bg-purple-50/40' : 'border-line hover:border-purple-200'
                   }`}>
              <input type="checkbox" checked={selected.has(c.doc_id)} onChange={() => toggle(c.doc_id)}
                     className="accent-purple-600" />
              <FileText size={11} className="text-ink-muted shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-ink truncate" title={c.filename}>{c.filename}</div>
                <div className="text-[10px] text-ink-muted">
                  {c.doc_type_label || '未分类'}
                  {c.status !== 'completed' && <span className="text-amber-600 ml-1.5">· {c.status}</span>}
                </div>
              </div>
            </label>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-line flex items-center gap-2">
          <span className="text-[11px] text-ink-muted">已选 {selected.size} 份</span>
          <button onClick={onClose}
            className="ml-auto px-3 py-1.5 text-xs text-ink-muted border border-line rounded hover:bg-canvas">
            取消
          </button>
          <button
            onClick={async () => {
              if (selected.size === 0) return
              setSubmitting(true)
              try { await onConfirm(Array.from(selected)) }
              finally { setSubmitting(false) }
            }}
            disabled={selected.size === 0 || submitting}
            className="px-3 py-1.5 text-xs text-white rounded shadow-sm disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#FF8D1A,#D96400)' }}>
            {submitting ? <Loader2 size={11} className="inline animate-spin mr-1" /> : <Link2 size={11} className="inline mr-1" />}
            关联选中
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 子组件 ────────────────────────────────────────────────────────────────────

function ProgressLine({ label, done, total, color }: { label: string; done: number; total: number; color: string }) {
  const pct = total > 0 ? (done / total) * 100 : 0
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-ink-muted w-8 shrink-0">{label}</span>
      <div className="flex-1 h-1 bg-slate-100 rounded overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-ink-muted shrink-0">{done}/{total}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-ink-muted font-medium px-1 mb-1.5 uppercase tracking-wider">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function DocRow({
  item, projectId, onPreview, onUploaded, onCanvas,
}: {
  item: DocChecklistItem
  projectId: string
  onPreview: (docId: string) => void
  onUploaded: () => void
  onCanvas?: () => void          // 仅 stakeholder_map 支持画图入口
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setUploading(true)
    setError(null)
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

  return (
    <div className={`px-2 py-2 rounded border transition-colors ${
      item.uploaded
        ? 'border-emerald-200 bg-emerald-50/30'
        : item.necessity === 'required'
          ? 'border-red-100 bg-red-50/20 hover:border-red-200'
          : 'border-slate-200 hover:border-slate-300'
    }`}>
      <div className="flex items-start gap-1.5">
        {item.uploaded
          ? <CheckCircle2 size={13} className="text-emerald-600 mt-0.5 shrink-0" />
          : <span className={`w-3 h-3 rounded-full border-2 mt-0.5 shrink-0 ${
              item.necessity === 'required' ? 'border-red-400' : 'border-slate-300'
            }`} />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <FileText size={11} className="text-ink-muted shrink-0" />
            <span className="text-xs font-medium text-ink truncate">{item.label}</span>
            {item.necessity === 'required' && !item.uploaded && (
              <span className="text-[9px] text-red-600 font-semibold">必需</span>
            )}
          </div>
          {/* 已上传文档列表(可点击预览) */}
          {item.documents.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {item.documents.map(doc => (
                <button
                  key={doc.doc_id}
                  onClick={() => onPreview(doc.doc_id)}
                  className="block w-full text-left text-[10.5px] text-ink-secondary hover:text-[#D96400] truncate"
                  title={doc.filename}
                >
                  {doc.status !== 'completed' && <Clock size={8} className="inline mr-0.5 text-amber-600" />}
                  · {doc.filename}
                </button>
              ))}
            </div>
          )}
          {error && (
            <div className="text-[10px] text-red-600 mt-1">{error}</div>
          )}
        </div>
        {/* 干系人图谱专属:画图入口 */}
        {onCanvas && (
          <button
            type="button"
            onClick={onCanvas}
            className="shrink-0 p-1 text-purple-500 hover:text-purple-700"
            title="在画布上手动编辑组织架构 / 干系人"
          >
            <Network size={11} />
          </button>
        )}
        {/* 上传按钮 */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="shrink-0 p-1 text-ink-muted hover:text-[#D96400] disabled:opacity-50"
          title={item.uploaded ? '再上传一份' : '上传文档'}
        >
          {uploading
            ? <Loader2 size={11} className="animate-spin" />
            : <Upload size={11} />}
        </button>
        <input ref={fileRef} type="file" className="hidden"
               accept=".pdf,.docx,.pptx,.xlsx,.csv,.md,.txt"
               onChange={onPick} />
      </div>
    </div>
  )
}

function VirtualRow({ item, onClick }: { item: VirtualChecklistItem; onClick: () => void }) {
  const Icon = item.key === 'v_success_metrics' ? Sparkles : Lightbulb
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-2 py-2 rounded border transition-colors ${
        item.filled
          ? 'border-emerald-200 bg-emerald-50/30'
          : item.necessity === 'required'
            ? 'border-purple-100 bg-purple-50/20 hover:border-purple-200'
            : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex items-start gap-1.5">
        {item.filled
          ? <CheckCircle2 size={13} className="text-emerald-600 mt-0.5 shrink-0" />
          : <span className={`w-3 h-3 rounded-full border-2 mt-0.5 shrink-0 ${
              item.necessity === 'required' ? 'border-purple-400' : 'border-slate-300'
            }`} />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <Icon size={11} className="text-purple-600 shrink-0" />
            <span className="text-xs font-medium text-ink truncate">{item.label}</span>
            <span className="text-[9px] text-ink-muted">问卷</span>
            {item.necessity === 'required' && !item.filled && (
              <span className="text-[9px] text-purple-600 font-semibold">必填</span>
            )}
          </div>
          <div className="text-[10.5px] text-ink-muted mt-0.5 line-clamp-2">{item.description}</div>
          {item.total_count > 0 && (
            <div className="text-[10px] text-ink-muted mt-0.5">
              已答 {item.filled_count}/{item.total_count}
            </div>
          )}
        </div>
        <ChevronRight size={11} className="text-ink-muted shrink-0 mt-1" />
      </div>
    </button>
  )
}
