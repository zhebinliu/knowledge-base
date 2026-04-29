/**
 * CenterWorkspace — 项目详情页(insight_v2 stage)中栏
 *
 * 根据 centerView 切换:
 *  - 'preparation' (默认):「准备状态」卡片 — 完成度 + Brief 按钮 + 开始生成 CTA
 *  - 'preview':显示某文档的 markdown(用户从左栏点击)
 *  - 'report':显示已生成报告 markdown(带角标)
 *  - 'gap_filler':显示 V2GapFiller(bundle invalid+short_circuited)
 *  - 'virtual':显示虚拟物问卷(成功指标/风险预警)
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText, Sparkles, Loader2, ArrowLeft, AlertCircle, CheckCircle2,
  Lightbulb, Eye, Download, RotateCw,
} from 'lucide-react'
import {
  getDocumentMarkdown, getDocChecklist,
  getVirtualArtifact, submitVirtualArtifact,
  generateOutput,
  type CuratedBundle, type V2GapPrompt,
} from '../../api/client'
import { useState } from 'react'
import MarkdownView from '../MarkdownView'
import V2GapFiller from '../V2GapFiller'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

export type CenterView =
  | { type: 'preparation' }
  | { type: 'preview'; docId: string }
  | { type: 'report' }
  | { type: 'gap_filler' }
  | { type: 'virtual'; vkey: string }

interface Props {
  projectId: string
  activeBundle: CuratedBundle | undefined
  activeInflight: CuratedBundle | undefined
  view: CenterView
  setView: (v: CenterView) => void
  onRefetch: () => void
}

export default function CenterWorkspace({
  projectId, activeBundle, activeInflight, view, setView, onRefetch,
}: Props) {
  return (
    <div className="flex-1 min-h-0 flex flex-col bg-canvas overflow-hidden">
      {/* 视图顶部:返回按钮(预览/虚拟物时) */}
      {(view.type === 'preview' || view.type === 'virtual') && (
        <div className="flex-shrink-0 px-4 py-2 bg-white border-b border-line flex items-center gap-2">
          <button
            onClick={() => setView({ type: activeBundle ? 'report' : 'preparation' })}
            className="flex items-center gap-1 px-2 py-1 text-xs text-ink-muted hover:text-ink rounded hover:bg-canvas"
          >
            <ArrowLeft size={11} />
            返回 {activeBundle ? '报告' : '准备'}
          </button>
          {view.type === 'preview' && <span className="text-[11px] text-ink-muted">· 文档预览</span>}
          {view.type === 'virtual' && <span className="text-[11px] text-ink-muted">· 虚拟物问卷</span>}
        </div>
      )}

      {/* 主体:根据 view 切换 */}
      <div className="flex-1 min-h-0 overflow-auto">
        {view.type === 'preparation' && (
          <PreparationView projectId={projectId} activeBundle={activeBundle}
                           activeInflight={activeInflight} onRefetch={onRefetch} />
        )}
        {view.type === 'preview' && (
          <DocPreview docId={view.docId} />
        )}
        {view.type === 'report' && activeBundle && (
          <ReportView bundle={activeBundle} />
        )}
        {view.type === 'gap_filler' && activeBundle && (
          <V2GapFiller
            key={`gap-${activeBundle.id}`}
            bundle={activeBundle}
            kind="insight_v2"
            projectId={projectId}
            onSubmitted={() => { onRefetch(); setView({ type: 'preparation' }) }}
          />
        )}
        {view.type === 'virtual' && (
          <VirtualForm
            vkey={view.vkey}
            projectId={projectId}
            onDone={() => { setView({ type: 'preparation' }); onRefetch() }}
          />
        )}
      </div>
    </div>
  )
}

// ── 准备状态视图 ─────────────────────────────────────────────────────────────

function PreparationView({
  projectId, activeBundle, activeInflight, onRefetch,
}: {
  projectId: string
  activeBundle: CuratedBundle | undefined
  activeInflight: CuratedBundle | undefined
  onRefetch: () => void
}) {
  const { data: checklist } = useQuery({
    queryKey: ['doc-checklist', projectId, 'insight_v2'],
    queryFn: () => getDocChecklist(projectId, 'insight_v2'),
  })
  const [error, setError] = useState<string | null>(null)
  const genMut = useMutation({
    mutationFn: () => generateOutput({ kind: 'insight_v2', project_id: projectId }),
    onSuccess: () => { onRefetch(); setError(null) },
    onError: (e: any) => setError(e?.response?.data?.detail || e?.message || '触发失败'),
  })

  const c = checklist?.completion
  const reqDone   = (c?.required ?? 0) + (c?.virtual_required ?? 0)
  const reqTotal  = (c?.required_total ?? 0) + (c?.virtual_required_total ?? 0)
  const allReady  = c?.all_required_done ?? false
  const reqPct    = reqTotal > 0 ? Math.round(reqDone / reqTotal * 100) : 0

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* Hero */}
      <div className="bg-white rounded-xl border border-line p-6 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
               style={{ background: BRAND_GRAD }}>
            <Lightbulb size={18} className="text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-ink">项目洞察(新版)</h2>
            <p className="text-xs text-ink-muted mt-0.5">
              基于上传文档 + 引导问卷生成项目诊断报告。先把左侧文档清单补齐,再点开始生成。
            </p>
          </div>
        </div>

        {/* 完成度卡 */}
        <div className="border border-slate-200 rounded-lg p-4 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-ink">必备资料完成度</span>
            <span className="ml-auto tabular-nums text-sm font-bold"
                  style={{ color: allReady ? '#10B981' : '#D96400' }}>
              {reqDone}/{reqTotal}
              {allReady && ' ✓'}
            </span>
          </div>
          <div className="h-2 bg-slate-100 rounded overflow-hidden">
            <div className="h-full transition-all" style={{
              width: `${reqPct}%`,
              background: allReady ? '#10B981' : BRAND_GRAD,
            }} />
          </div>
          <p className="text-[11px] text-ink-muted mt-2">
            {allReady
              ? '✅ 必备资料已齐,可以开始生成。'
              : `还需补齐 ${reqTotal - reqDone} 项必需资料(左栏「+」 上传 / 「问卷」 填写)。`}
          </p>
        </div>

        {/* 行动按钮 */}
        <div className="flex items-center gap-2">
          {activeInflight ? (
            <button disabled
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm font-medium">
              <Loader2 size={14} className="animate-spin" />
              正在生成中… 大约 60-180 秒
            </button>
          ) : activeBundle ? (
            <>
              <button
                onClick={() => genMut.mutate()}
                disabled={genMut.isPending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-line rounded-lg text-sm text-ink hover:bg-canvas"
              >
                <RotateCw size={13} /> 重新生成
              </button>
            </>
          ) : (
            <button
              onClick={() => genMut.mutate()}
              disabled={genMut.isPending || !allReady}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: BRAND_GRAD }}
              title={!allReady ? '必备资料未齐,请先到左栏补齐' : ''}
            >
              {genMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {allReady ? '开始生成洞察' : '请先补齐必备资料'}
            </button>
          )}
        </div>
        {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
      </div>

      {/* 状态说明 */}
      {activeBundle && !activeInflight && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-xs text-emerald-900">
          <CheckCircle2 size={13} className="inline mr-1" />
          已有一份生成的报告,点切到右上角「在线预览」或重新生成。
        </div>
      )}
    </div>
  )
}

// ── 文档预览 ─────────────────────────────────────────────────────────────────

function DocPreview({ docId }: { docId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['document', docId],
    queryFn: () => getDocumentMarkdown(docId),
  })
  if (isLoading) return <div className="p-6 text-center text-xs text-ink-muted"><Loader2 size={16} className="inline animate-spin" /> 加载中…</div>
  if (!data) return <div className="p-6 text-center text-xs text-ink-muted">文档不存在</div>
  return (
    <div className="max-w-4xl mx-auto px-6 py-6">
      <div className="mb-3 flex items-center gap-2">
        <FileText size={14} className="text-ink-muted" />
        <h3 className="text-sm font-semibold text-ink">{data.filename}</h3>
      </div>
      {data.markdown_content ? (
        <MarkdownView content={data.markdown_content} />
      ) : (
        <div className="text-sm text-ink-muted italic">
          {data.status === 'completed' ? '该文档无 Markdown 内容(可能转换异常)' : `转换中(${data.status})…`}
        </div>
      )}
    </div>
  )
}

// ── 已生成报告 ───────────────────────────────────────────────────────────────

function ReportView({ bundle }: { bundle: CuratedBundle }) {
  const { data, isLoading } = useQuery({
    queryKey: ['output', bundle.id],
    queryFn: () => import('../../api/client').then(m => m.getOutput(bundle.id)),
  })
  const validity = bundle.validity_status
  return (
    <div className="max-w-4xl mx-auto px-6 py-6">
      {validity && validity !== 'valid' && (
        <div className={`mb-3 px-3 py-2 rounded text-xs ${
          validity === 'invalid' ? 'bg-red-50 text-red-800 border border-red-200' :
                                   'bg-amber-50 text-amber-800 border border-amber-200'
        }`}>
          <AlertCircle size={11} className="inline mr-1" />
          报告 validity:{validity === 'invalid' ? '信息不足' : '部分通过'} — 检查右上角 banner 详情
        </div>
      )}
      {isLoading ? (
        <div className="text-center text-xs text-ink-muted py-8"><Loader2 size={16} className="inline animate-spin" /> 加载报告内容…</div>
      ) : data?.content_md ? (
        <MarkdownView content={data.content_md} />
      ) : (
        <div className="text-sm text-ink-muted italic">没有 markdown 内容</div>
      )}
    </div>
  )
}

// ── 虚拟物问卷 ────────────────────────────────────────────────────────────────

function VirtualForm({ vkey, projectId, onDone }: {
  vkey: string; projectId: string; onDone: () => void
}) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['virtual', vkey, projectId],
    queryFn: () => getVirtualArtifact(vkey, projectId),
  })
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (isLoading) return <div className="p-6 text-center text-xs text-ink-muted"><Loader2 size={16} className="inline animate-spin" /> 加载问卷…</div>
  if (!data) return <div className="p-6 text-xs text-ink-muted">无法加载</div>

  const setAnswer = (fk: string, val: any) => setAnswers(a => ({ ...a, [fk]: val }))

  const onSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      // 合并 current_values 里已有的(没改的部分),再覆盖 answers 里新填的
      const final: Record<string, any> = {}
      for (const [k, cell] of Object.entries(data.current_values || {})) {
        final[k] = cell
      }
      for (const [k, v] of Object.entries(answers)) {
        final[k] = v
      }
      await submitVirtualArtifact(vkey, projectId, final)
      qc.invalidateQueries({ queryKey: ['doc-checklist', projectId] })
      qc.invalidateQueries({ queryKey: ['virtual', vkey, projectId] })
      onDone()
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || '提交失败')
      setSubmitting(false)
    }
  }

  // 当前值映射(用户没改之前显示已存)
  const valueOf = (p: V2GapPrompt) => {
    if (p.field_key in answers) return answers[p.field_key]
    const cell = data.current_values[p.field_key]
    return cell?.value
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-6">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-ink">{data.title}</h2>
        <p className="text-xs text-ink-muted mt-1">{data.description}</p>
      </div>
      <div className="space-y-4">
        {data.ask_user_prompts.map(p => (
          <PromptCard key={p.field_key} prompt={p} value={valueOf(p)} onChange={v => setAnswer(p.field_key, v)} />
        ))}
      </div>
      <div className="mt-6 flex items-center gap-3 sticky bottom-0 bg-canvas pt-4 pb-2">
        {error && <span className="text-xs text-red-600">{error}</span>}
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="ml-auto flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded shadow-sm disabled:opacity-50"
          style={{ background: BRAND_GRAD }}
        >
          {submitting ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
          {submitting ? '保存中…' : '保存到项目要点'}
        </button>
      </div>
    </div>
  )
}

function PromptCard({ prompt, value, onChange }: {
  prompt: V2GapPrompt
  value: any
  onChange: (v: any) => void
}) {
  const isMulti = prompt.multi
  const hasOpts = prompt.options && prompt.options.length > 0
  const arr: string[] = Array.isArray(value) ? value : (value ? [String(value)] : [])
  const single: string = !Array.isArray(value) && value != null ? String(value) : ''

  return (
    <div className="bg-white border border-line rounded-lg p-4">
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-sm font-semibold text-ink">{prompt.field_label}</span>
        {prompt.required && <span className="text-[10px] text-red-600 font-semibold">必答</span>}
      </div>
      <div className="text-xs text-ink-secondary mb-3">{prompt.question}</div>

      {hasOpts && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {prompt.options.map(opt => {
            const sel = isMulti ? arr.includes(opt) : single === opt
            return (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  if (isMulti) {
                    onChange(sel ? arr.filter(x => x !== opt) : [...arr, opt])
                  } else {
                    onChange(opt)
                  }
                }}
                className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                  sel ? 'border-[#D96400] bg-orange-50 text-[#D96400] font-semibold'
                      : 'border-line text-ink-secondary hover:bg-canvas'
                }`}
              >
                {sel && <CheckCircle2 size={10} className="inline mr-1" />}
                {opt}
              </button>
            )
          })}
        </div>
      )}

      {/* 自填(无选项 / 多选追加) */}
      {(!hasOpts || isMulti) && (
        prompt.field_type === 'list' ? (
          <textarea
            className="w-full px-3 py-2 text-sm border border-line rounded-md focus:outline-none focus:border-[#D96400] mt-1"
            rows={2}
            placeholder={isMulti ? '其他自填(逗号/换行 分隔)' : '每行一条 / 或顿号分隔'}
            value={isMulti ? '' : (Array.isArray(value) ? value.join('\n') : '')}
            onChange={e => {
              const lines = e.target.value.split(/[\n、;;,]/).map(s => s.trim()).filter(Boolean)
              if (isMulti) {
                onChange([...arr, ...lines])
              } else {
                onChange(lines)
              }
            }}
          />
        ) : (
          <textarea
            className="w-full px-3 py-2 text-sm border border-line rounded-md focus:outline-none focus:border-[#D96400] mt-1"
            rows={2}
            placeholder="请直接填写"
            value={single}
            onChange={e => onChange(e.target.value)}
          />
        )
      )}
    </div>
  )
}
