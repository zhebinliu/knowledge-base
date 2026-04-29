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
  ChevronRight, Clock, Network,
} from 'lucide-react'
import {
  getDocChecklist, uploadDocument,
  type DocChecklistItem, type VirtualChecklistItem,
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
