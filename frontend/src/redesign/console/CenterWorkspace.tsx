/**
 * CenterWorkspace — 项目详情页(insight stage)中栏(Liquid Glass 版)
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText, Sparkles, Loader2, ArrowLeft, AlertCircle, CheckCircle2,
  Lightbulb, RotateCw, Search, X, Pencil,
} from 'lucide-react'
import {
  getDocumentMarkdown, getDocChecklist,
  getVirtualArtifact, submitVirtualArtifact,
  generateOutput, getInsightCheckup,
  type CuratedBundle, type AgenticGapPrompt, type InsightCheckupResult,
} from '../../api/client'
import { useState } from 'react'
import MarkdownView from '../../components/MarkdownView'
import AgenticGapFiller from '../AgenticGapFiller'
import CitedReportView from '../../components/console/CitedReportView'
import MarkdownEditor from '../../components/console/MarkdownEditor'
import StakeholderCanvas from '../../components/console/StakeholderCanvas'
import GenerationProgressCard from './GenerationProgressCard'

export type CenterView =
  | { type: 'preparation' }
  | { type: 'preview'; docId: string }
  | { type: 'report' }
  | { type: 'gap_filler' }
  | { type: 'virtual'; vkey: string }
  | { type: 'canvas' }

interface Props {
  projectId: string
  activeBundle: CuratedBundle | undefined
  activeInflight: CuratedBundle | undefined
  view: CenterView
  setView: (v: CenterView) => void
  onRefetch: () => void
  onCitationClick?: (moduleKey: string, refId: string) => void
}

export default function CenterWorkspace({
  projectId, activeBundle, activeInflight, view, setView, onRefetch, onCitationClick,
}: Props) {
  return (
    <div
      className="flex-1 min-h-0 flex flex-col overflow-hidden"
      style={{ background: 'transparent' }}
    >
      {(view.type === 'preview' || view.type === 'virtual' || view.type === 'canvas') && (
        <div
          className="flex-shrink-0 px-4 py-2 flex items-center gap-2"
          style={{
            borderBottom: '1px solid var(--rd-line)',
            background: 'rgba(255,255,255,0.06)',
          }}
        >
          <button
            onClick={() => setView({ type: activeBundle ? 'report' : 'preparation' })}
            className="rd-btn flex items-center gap-1 px-2 py-1 text-xs"
          >
            <ArrowLeft size={11} />
            返回 {activeBundle ? '报告' : '准备'}
          </button>
          {view.type === 'preview' && <span className="text-xs" style={{ color: 'var(--rd-text-3)' }}>· 文档预览</span>}
          {view.type === 'virtual' && <span className="text-xs" style={{ color: 'var(--rd-text-3)' }}>· 虚拟物问卷</span>}
          {view.type === 'canvas'  && <span className="text-xs" style={{ color: 'var(--rd-text-3)' }}>· 组织架构 / 干系人图谱</span>}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        {view.type === 'preparation' && (
          <PreparationView projectId={projectId} activeBundle={activeBundle}
                           activeInflight={activeInflight} onRefetch={onRefetch} />
        )}
        {view.type === 'preview' && (
          <DocPreview docId={view.docId} />
        )}
        {view.type === 'report' && activeBundle && (
          <ReportView bundle={activeBundle} onCitationClick={onCitationClick} />
        )}
        {view.type === 'gap_filler' && activeBundle && (
          <AgenticGapFiller
            key={`gap-${activeBundle.id}`}
            bundle={activeBundle}
            kind="insight"
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
        {view.type === 'canvas' && (
          <StakeholderCanvas projectId={projectId} />
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
    queryKey: ['doc-checklist', projectId, 'insight'],
    queryFn: () => getDocChecklist(projectId, 'insight'),
  })
  const [error, setError] = useState<string | null>(null)
  const [checkupOpen, setCheckupOpen] = useState(false)
  const genMut = useMutation({
    mutationFn: () => generateOutput({ kind: 'insight', project_id: projectId }),
    onSuccess: () => { onRefetch(); setError(null) },
    onError: (e: any) => setError(e?.response?.data?.detail || e?.message || '触发失败'),
  })

  const c = checklist?.completion
  const reqDone   = (c?.required ?? 0) + (c?.virtual_required ?? 0)
  const reqTotal  = (c?.required_total ?? 0) + (c?.virtual_required_total ?? 0)
  const recDone   = (c?.recommended ?? 0) + (c?.virtual_recommended ?? 0)
  const recTotal  = (c?.recommended_total ?? 0) + (c?.virtual_recommended_total ?? 0)
  const allReady  = c?.all_required_done ?? false
  const reqPct    = reqTotal > 0 ? Math.round(reqDone / reqTotal * 100) : 0

  const uploadedDocs: { doc_id: string; filename: string; type_label: string; status: string }[] = []
  for (const d of (checklist?.required_docs || []).concat(checklist?.recommended_docs || [])) {
    for (const doc of d.documents) {
      uploadedDocs.push({
        doc_id: doc.doc_id, filename: doc.filename, type_label: d.label, status: doc.status,
      })
    }
  }
  for (const ref of (checklist?.extra_references || [])) {
    uploadedDocs.push({
      doc_id: ref.doc_id, filename: ref.filename, type_label: '附加参考', status: ref.status,
    })
  }
  const filledVirtuals = (checklist?.virtual_required || []).concat(checklist?.virtual_recommended || [])
    .filter(v => v.filled)

  return (
    <div className="h-full overflow-auto" style={{ background: 'transparent' }}>
      <div className="px-6 py-5 max-w-[1400px] mx-auto space-y-4">

        {activeInflight ? (
          <GenerationProgressCard bundle={activeInflight} />
        ) : (
          <div
            className="rd-card overflow-hidden"
            style={{ padding: 0 }}
          >
            <div
              className="px-6 py-5 flex items-start gap-4"
              style={{
                borderBottom: '1px solid var(--rd-line)',
                background: 'linear-gradient(to right, rgba(255,141,26,0.10) 0%, rgba(255,255,255,0.06) 60%)',
              }}
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: 'linear-gradient(135deg, var(--rd-accent), var(--rd-accent-2))',
                  boxShadow: '0 6px 18px rgba(255,141,26,0.25)',
                }}
              >
                <Lightbulb size={20} color="#fff" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold" style={{ color: 'var(--rd-text)' }}>项目洞察</h2>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--rd-text-2)' }}>
                  基于上传文档 + 引导问卷生成项目诊断报告。
                  <br/>把左侧文档清单补齐,系统会自动从文档抽取信息并标注每段来源。
                </p>
              </div>
              <div className="text-right shrink-0">
                <div
                  className="text-2xl font-extrabold tabular-nums"
                  style={{ color: allReady ? '#10B981' : 'var(--rd-accent)' }}
                >
                  {reqDone}<span className="text-sm font-normal" style={{ color: 'var(--rd-text-3)' }}> / {reqTotal}</span>
                </div>
                <div className="text-xs" style={{ color: 'var(--rd-text-3)' }}>必备资料</div>
              </div>
            </div>

            <div className="px-6 py-4">
              <div
                className="h-2 rounded-full overflow-hidden mb-3"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--rd-line)' }}
              >
                <div
                  className="h-full transition-all rounded-full"
                  style={{
                    width: `${reqPct}%`,
                    background: allReady ? '#10B981' : 'linear-gradient(135deg, var(--rd-accent), var(--rd-accent-2))',
                  }}
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs flex-1" style={{ color: 'var(--rd-text-2)' }}>
                  {allReady
                    ? '✅ 必备资料已齐,可以开始生成洞察'
                    : `还差 ${reqTotal - reqDone} 项必备资料(左栏 「+」 上传 / 「问卷」 填写)`}
                </span>
                <button
                  onClick={() => setCheckupOpen(true)}
                  className="rd-btn flex items-center justify-center gap-1.5 px-3 py-2 text-xs"
                  title="生成前看每个章节的字段够不够,缺什么提前补"
                >
                  <Search size={12} /> 先看体检
                </button>
                {activeBundle ? (
                  <button
                    onClick={() => genMut.mutate()}
                    disabled={genMut.isPending}
                    className="rd-btn flex items-center justify-center gap-2 px-5 py-2 text-sm"
                  >
                    <RotateCw size={13} /> 重新生成
                  </button>
                ) : (
                  <button
                    onClick={() => genMut.mutate()}
                    disabled={genMut.isPending || !allReady}
                    className="rd-btn rd-btn-primary flex items-center justify-center gap-2 px-5 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    title={!allReady ? '必备资料未齐,请先到左栏补齐' : ''}
                  >
                    {genMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {allReady ? '开始生成洞察' : '请先补齐必备资料'}
                  </button>
                )}
              </div>
              {error && <div className="mt-2 text-xs" style={{ color: '#dc2626' }}>{error}</div>}
              {checkupOpen && (
                <InsightCheckupDrawer projectId={projectId} onClose={() => setCheckupOpen(false)} />
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            label="必备资料"
            value={`${reqDone} / ${reqTotal}`}
            sub={allReady ? '已齐' : `还差 ${reqTotal - reqDone} 项`}
            color={allReady ? '#10B981' : '#FF8D1A'}
            icon={CheckCircle2}
          />
          <StatCard
            label="推荐资料"
            value={`${recDone} / ${recTotal}`}
            sub={recDone === recTotal ? '已齐' : '建议补全'}
            color={recDone === recTotal ? '#10B981' : '#3B82F6'}
            icon={Lightbulb}
          />
          <StatCard
            label="已上传文档"
            value={`${uploadedDocs.length}`}
            sub={uploadedDocs.length > 0 ? '点击下方查看' : '尚未上传'}
            color="#8B5CF6"
            icon={FileText}
          />
        </div>

        {uploadedDocs.length > 0 && (
          <div className="rd-card overflow-hidden" style={{ padding: 0 }}>
            <div
              className="px-5 py-3 flex items-center gap-2"
              style={{ borderBottom: '1px solid var(--rd-line)' }}
            >
              <FileText size={13} style={{ color: 'var(--rd-text-3)' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--rd-text)' }}>已上传文档</h3>
              <span className="text-xs" style={{ color: 'var(--rd-text-3)' }}>{uploadedDocs.length} 份</span>
            </div>
            <div>
              {uploadedDocs.slice(0, 6).map((d, idx) => (
                <div
                  key={d.doc_id}
                  className="px-5 py-2.5 flex items-center gap-3 transition"
                  style={{
                    borderTop: idx === 0 ? 'none' : '1px solid var(--rd-line)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <FileText size={12} className="shrink-0" style={{ color: 'var(--rd-text-3)' }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate" style={{ color: 'var(--rd-text)' }}>{d.filename}</div>
                    <div className="text-xs" style={{ color: 'var(--rd-text-3)' }}>
                      <span
                        className="px-1.5 py-0 rounded mr-1.5"
                        style={{
                          background: 'rgba(255,141,26,0.10)',
                          color: 'var(--rd-accent)',
                          border: '1px solid rgba(255,141,26,0.20)',
                        }}
                      >{d.type_label}</span>
                      {d.status === 'completed' ? '已索引' : <span style={{ color: '#d97706' }}>{d.status} 中…</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {filledVirtuals.length > 0 && (
          <div className="rd-card" style={{ padding: '18px 20px' }}>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={13} style={{ color: '#8B5CF6' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--rd-text)' }}>已填问卷</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {filledVirtuals.map(v => (
                <div
                  key={v.key}
                  className="flex items-center gap-2 p-2.5 rounded"
                  style={{
                    background: 'rgba(16,185,129,0.10)',
                    border: '1px solid rgba(16,185,129,0.25)',
                  }}
                >
                  <CheckCircle2 size={13} style={{ color: '#10B981' }} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate" style={{ color: 'var(--rd-text)' }}>{v.label}</div>
                    <div className="text-xs" style={{ color: 'var(--rd-text-3)' }}>已答 {v.filled_count}/{v.total_count}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!allReady && (
          <div
            className="rounded-xl p-4 text-xs leading-relaxed"
            style={{
              background: 'rgba(255,141,26,0.10)',
              border: '1px solid rgba(255,141,26,0.25)',
              color: '#FBBF24',
            }}
          >
            <strong>下一步:</strong> 在<strong>左侧文档清单</strong>里补齐带「★ 必需」的资料 —
            上传文档点 <span className="px-1 py-0.5 rounded text-xs" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,141,26,0.30)' }}>+</span>
             按钮、问卷点对应行打开作答。补完后回到这里点「开始生成」。
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({
  label, value, sub, color, icon: Icon,
}: {
  label: string; value: string; sub: string; color: string
  icon: typeof Lightbulb
}) {
  return (
    <div className="rd-card flex items-center gap-3" style={{ padding: '16px' }}>
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${color}1A`, color }}
      >
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs" style={{ color: 'var(--rd-text-3)' }}>{label}</div>
        <div className="text-lg font-bold tabular-nums" style={{ color }}>{value}</div>
        <div className="text-xs" style={{ color: 'var(--rd-text-3)' }}>{sub}</div>
      </div>
    </div>
  )
}

// ── 文档预览 ─────────────────────────────────────────────────────────────────

function DocPreview({ docId }: { docId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['document', docId],
    queryFn: () => getDocumentMarkdown(docId),
  })
  if (isLoading) return (
    <div className="h-full flex items-center justify-center text-xs" style={{ color: 'var(--rd-text-3)' }}>
      <Loader2 size={16} className="inline animate-spin mr-2" /> 加载中…
    </div>
  )
  if (!data) return <div className="h-full p-6 text-center text-xs" style={{ color: 'var(--rd-text-3)' }}>文档不存在</div>
  return (
    <div className="h-full overflow-auto">
      <div className="max-w-[1100px] mx-auto px-6 py-6">
        <div className="mb-4 pb-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--rd-line)' }}>
          <FileText size={14} style={{ color: 'var(--rd-text-3)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--rd-text)' }}>{data.filename}</h3>
        </div>
        {data.markdown_content ? (
          <MarkdownView content={data.markdown_content} />
        ) : (
          <div className="text-sm italic" style={{ color: 'var(--rd-text-3)' }}>
            {data.status === 'completed' ? '该文档无 Markdown 内容(可能转换异常)' : `转换中(${data.status})…`}
          </div>
        )}
      </div>
    </div>
  )
}

// ── 已生成报告 ───────────────────────────────────────────────────────────────

function ReportView({
  bundle, onCitationClick,
}: {
  bundle: CuratedBundle
  onCitationClick?: (moduleKey: string, refId: string) => void
}) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <ReportEditorView bundle={bundle} onDone={() => setEditing(false)} />
    )
  }
  return (
    <ReportReadView bundle={bundle} onEdit={() => setEditing(true)} onCitationClick={onCitationClick} />
  )
}

function ReportEditorView({
  bundle, onDone,
}: {
  bundle: CuratedBundle
  onDone: () => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['output', bundle.id],
    queryFn: () => import('../../api/client').then(m => m.getOutput(bundle.id)),
    enabled: !bundle.content_md,
    initialData: bundle.content_md ? bundle as any : undefined,
  })
  if (isLoading || !data?.content_md) {
    return (
      <div className="h-full flex items-center justify-center text-xs" style={{ color: 'var(--rd-text-3)' }}>
        <Loader2 size={14} className="inline animate-spin mr-1" /> 加载报告内容…
      </div>
    )
  }
  return (
    <MarkdownEditor
      bundle={bundle}
      initialContent={data.content_md}
      onClose={onDone}
      onSaved={onDone}
    />
  )
}

function ReportReadView({
  bundle, onEdit, onCitationClick,
}: {
  bundle: CuratedBundle
  onEdit: () => void
  onCitationClick?: (moduleKey: string, refId: string) => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['output', bundle.id],
    queryFn: () => import('../../api/client').then(m => m.getOutput(bundle.id)),
    enabled: !bundle.content_md,
    initialData: bundle.content_md ? bundle as any : undefined,
  })
  const provenance = bundle.provenance || {}

  return (
    <div className="h-full overflow-auto" style={{ background: 'transparent' }}>
      <div className="max-w-[1600px] mx-auto px-5 py-5 space-y-4">
        {bundle.web_search_status && !bundle.web_search_status.ok && (
          <div
            className="px-3 py-2 rounded text-xs"
            style={{
              background: 'rgba(59,130,246,0.10)',
              color: '#1e40af',
              border: '1px solid rgba(59,130,246,0.25)',
            }}
          >
            <AlertCircle size={11} className="inline mr-1" />
            Web 检索 {{
              no_provider: '未配置(后台「API 密钥」可加 Bocha / Tavily)',
              no_hits: '返回 0 条结果',
              exception: '调用异常',
              no_industry: '项目未设行业,跳过',
            }[bundle.web_search_status.reason as string] || bundle.web_search_status.reason}
            — M9「行业最佳实践对照」章节可能仅依赖知识库内案例
          </div>
        )}
        <div className="rd-card overflow-hidden" style={{ padding: 0 }}>
          {data?.content_md && (
            <div
              className="flex items-center justify-end px-4 py-2"
              style={{
                borderBottom: '1px solid var(--rd-line)',
                background: 'rgba(255,255,255,0.06)',
              }}
            >
              <button
                onClick={onEdit}
                className="rd-btn flex items-center gap-1 px-2.5 py-1 text-xs"
                title="在线编辑 markdown 正文"
              >
                <Pencil size={11} /> 编辑
              </button>
            </div>
          )}
          <div className="px-8 py-7 overflow-x-auto">
            {isLoading ? (
              <div className="text-center text-xs py-8" style={{ color: 'var(--rd-text-3)' }}>
                <Loader2 size={16} className="inline animate-spin" /> 加载报告内容…
              </div>
            ) : data?.content_md ? (
              <CitedReportView
                content={data.content_md}
                provenance={provenance}
                onCitationClick={onCitationClick || (() => {})}
              />
            ) : (
              <div className="text-sm italic" style={{ color: 'var(--rd-text-3)' }}>没有 markdown 内容</div>
            )}
          </div>
        </div>
      </div>
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

  if (isLoading) return (
    <div className="h-full flex items-center justify-center text-xs" style={{ color: 'var(--rd-text-3)' }}>
      <Loader2 size={16} className="inline animate-spin mr-2" /> 加载问卷…
    </div>
  )
  if (!data) return <div className="h-full p-6 text-xs" style={{ color: 'var(--rd-text-3)' }}>无法加载</div>

  const setAnswer = (fk: string, val: any) => setAnswers(a => ({ ...a, [fk]: val }))

  const onSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
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

  const valueOf = (p: AgenticGapPrompt) => {
    if (p.field_key in answers) return answers[p.field_key]
    const cell = data.current_values[p.field_key]
    return cell?.value
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-[1100px] mx-auto px-6 py-6">
          <div className="mb-5 pb-4" style={{ borderBottom: '1px solid var(--rd-line)' }}>
            <h2 className="text-lg font-bold" style={{ color: 'var(--rd-text)' }}>{data.title}</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--rd-text-3)' }}>{data.description}</p>
          </div>
          <div className="space-y-4">
            {data.ask_user_prompts.map(p => (
              <PromptCard key={p.field_key} prompt={p} value={valueOf(p)}
                          onChange={v => setAnswer(p.field_key, v)} />
            ))}
          </div>
        </div>
      </div>
      <div
        className="flex-shrink-0 px-6 py-3 flex items-center gap-3"
        style={{
          borderTop: '1px solid var(--rd-line)',
          background: 'rgba(255,255,255,0.06)',
          boxShadow: '0 -2px 10px rgba(20,20,40,0.05), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {error && <span className="text-xs" style={{ color: '#dc2626' }}>{error}</span>}
        <span className="ml-auto text-xs" style={{ color: 'var(--rd-text-3)' }}>保存后会自动写入项目要点</span>
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="rd-btn rd-btn-primary flex items-center gap-1.5 px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {submitting ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
          {submitting ? '保存中…' : '保存到项目要点'}
        </button>
      </div>
    </div>
  )
}

function PromptCard({ prompt, value, onChange }: {
  prompt: AgenticGapPrompt
  value: any
  onChange: (v: any) => void
}) {
  const isMulti = prompt.multi
  const hasOpts = prompt.options && prompt.options.length > 0
  const arr: string[] = Array.isArray(value) ? value : (value ? [String(value)] : [])
  const single: string = !Array.isArray(value) && value != null ? String(value) : ''

  const [draft, setDraft] = useState('')
  const optsSet = new Set(prompt.options || [])
  const customs = arr.filter(x => !optsSet.has(x))
  const commitDraft = () => {
    const lines = draft.split(/[\n、;;,,]/).map(s => s.trim()).filter(Boolean)
    if (lines.length === 0) return
    const merged = Array.from(new Set([...arr, ...lines]))
    onChange(merged)
    setDraft('')
  }
  const removeCustom = (item: string) => {
    onChange(arr.filter(x => x !== item))
  }

  return (
    <div className="rd-card" style={{ padding: '16px' }}>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-sm font-semibold" style={{ color: 'var(--rd-text)' }}>{prompt.field_label}</span>
        {prompt.required && <span className="text-xs font-semibold" style={{ color: '#dc2626' }}>必答</span>}
      </div>
      <div className="text-xs mb-3" style={{ color: 'var(--rd-text-2)' }}>{prompt.question}</div>

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
                className="px-2.5 py-1 text-xs rounded-md transition"
                style={{
                  background: sel ? 'rgba(255,141,26,0.10)' : 'rgba(255,255,255,0.06)',
                  border: sel ? '1px solid rgba(255,141,26,0.45)' : '1px solid var(--rd-line)',
                  color: sel ? 'var(--rd-accent)' : 'var(--rd-text-2)',
                  fontWeight: sel ? 600 : 400,
                }}
              >
                {sel && <CheckCircle2 size={10} className="inline mr-1" />}
                {opt}
              </button>
            )
          })}
        </div>
      )}

      {isMulti && customs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {customs.map(item => (
            <span
              key={item}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md"
              style={{
                background: 'rgba(16,185,129,0.10)',
                border: '1px solid rgba(16,185,129,0.30)',
                color: '#34D399',
              }}
            >
              <span>{item}</span>
              <button
                type="button"
                onClick={() => removeCustom(item)}
                className="leading-none"
                style={{ color: 'rgba(16,185,129,0.65)' }}
                title="删除该自填项"
              >×</button>
            </span>
          ))}
        </div>
      )}

      {(!hasOpts || isMulti) && (
        prompt.field_type === 'list' ? (
          isMulti ? (
            <textarea
              className="rd-input w-full text-sm mt-1"
              rows={2}
              placeholder="其他自填(用逗号/换行/顿号分隔多项,失焦或按 Enter 追加)"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commitDraft}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  commitDraft()
                }
              }}
            />
          ) : (
            <textarea
              className="rd-input w-full text-sm mt-1"
              rows={2}
              placeholder="每行一条 / 或顿号分隔"
              value={Array.isArray(value) ? value.join('\n') : ''}
              onChange={e => {
                const lines = e.target.value.split(/[\n、;;,,]/).map(s => s.trim()).filter(Boolean)
                onChange(lines)
              }}
            />
          )
        ) : (
          <textarea
            className="rd-input w-full text-sm mt-1"
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

// ── 体检报告 Drawer ──────────────────────────────────────────────────────────

function InsightCheckupDrawer({
  projectId, onClose,
}: { projectId: string; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['insight-checkup', projectId],
    queryFn: () => getInsightCheckup(projectId),
    staleTime: 0,
    refetchOnWindowFocus: false,
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="rd-card w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
        style={{ padding: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="flex-shrink-0 px-5 py-3 flex items-center gap-2"
          style={{
            borderBottom: '1px solid var(--rd-line)',
            background: 'rgba(255,255,255,0.06)',
          }}
        >
          <Search size={14} style={{ color: 'var(--rd-accent)' }} />
          <h3 className="text-sm font-bold" style={{ color: 'var(--rd-text)' }}>体检报告 · 项目洞察</h3>
          {data && (
            <span className="ml-2 text-xs" style={{ color: 'var(--rd-text-3)' }}>
              · 共 {data.modules.length} 个章节 · 已就绪 {data.stats.ready_n} · 待补 {data.stats.blocked_n + data.stats.ask_user_n}
            </span>
          )}
          <button onClick={onClose} className="rd-icon-btn ml-auto" title="关闭">
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-5 space-y-3">
          {isLoading && (
            <div className="text-center py-8 text-xs" style={{ color: 'var(--rd-text-3)' }}>
              <Loader2 size={14} className="inline animate-spin mr-1.5" />
              正在体检…(纯规则,不调 LLM)
            </div>
          )}
          {error != null && (
            <div
              className="text-xs p-3 rounded"
              style={{ color: '#dc2626', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)' }}
            >
              体检失败:{(error as any)?.message || '未知错误'}
            </div>
          )}
          {data && (
            <>
              <div
                className="p-3 rounded-lg text-sm"
                style={{
                  background: data.sufficient_critical ? 'rgba(16,185,129,0.10)' : 'rgba(245,158,11,0.10)',
                  border: data.sufficient_critical ? '1px solid rgba(16,185,129,0.25)' : '1px solid rgba(245,158,11,0.25)',
                  color: data.sufficient_critical ? '#34D399' : '#FBBF24',
                }}
              >
                <div className="flex items-center gap-2 font-semibold">
                  {data.sufficient_critical ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  {data.sufficient_critical
                    ? '关键章节信息充足,可以开始生成'
                    : '关键章节信息不足,建议补全后再生成(避免 invalid 短路)'}
                </div>
                <div className="mt-1 text-xs opacity-90">
                  已上传文档 {data.stats.docs_total} 份 · Brief 字段 {data.stats.brief_fields_n} 个 · {data.stats.has_conversation ? '已有访谈' : '无访谈'}
                </div>
              </div>

              <div
                className="rounded-lg overflow-hidden"
                style={{ border: '1px solid var(--rd-line)' }}
              >
                <div
                  className="px-3 py-2 text-xs"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--rd-text-3)' }}
                >
                  按章节看 — 点击展开看每个字段的状态
                </div>
                <div>
                  {data.modules.map((m, idx) => (
                    <div key={m.key} style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--rd-line)' }}>
                      <CheckupModuleRow module={m} />
                    </div>
                  ))}
                </div>
              </div>

              {data.gap_actions.filter(g => g.action === 'ask_user').length > 0 && (
                <div
                  className="rounded-lg overflow-hidden"
                  style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}
                >
                  <div
                    className="px-3 py-2 text-xs font-semibold flex items-center gap-2"
                    style={{ background: 'rgba(245,158,11,0.10)', color: '#FBBF24' }}
                  >
                    <AlertCircle size={12} />
                    需要你补充的字段({data.gap_actions.filter(g => g.action === 'ask_user').length} 项)
                  </div>
                  <ul className="p-3 space-y-1.5 text-xs">
                    {data.gap_actions.filter(g => g.action === 'ask_user').map((g, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="shrink-0 w-32 truncate" style={{ color: 'var(--rd-text-3)' }}>{g.module_title}</span>
                        <span className="flex-1" style={{ color: 'var(--rd-text-2)' }}>{g.detail}</span>
                        {g.required && <span className="text-xs shrink-0" style={{ color: '#b45309' }}>必答</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        <div
          className="flex-shrink-0 px-5 py-3 flex items-center gap-2"
          style={{
            borderTop: '1px solid var(--rd-line)',
            background: 'rgba(255,255,255,0.06)',
          }}
        >
          <span className="text-xs flex-1" style={{ color: 'var(--rd-text-3)' }}>
            体检完了?可以去左栏补缺,或直接关闭体检窗口点「开始生成」
          </span>
          <button onClick={onClose} className="rd-btn px-3 py-1.5 text-xs">
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

function CheckupModuleRow({ module: m }: { module: InsightCheckupResult['modules'][number] }) {
  const [open, setOpen] = useState(false)
  const STATUS_META: Record<string, { label: string; color: string; dot: string }> = {
    ready:   { label: '就绪',     color: '#34D399', dot: '#10B981' },
    blocked: { label: '关键缺失', color: '#b91c1c', dot: '#ef4444' },
    skipped: { label: '跳过',     color: 'var(--rd-text-3)', dot: '#cbd5e1' },
    planned: { label: '规划中',   color: '#1d4ed8', dot: '#60a5fa' },
  }
  const meta = STATUS_META[m.status] || STATUS_META.planned
  const missingN = m.fields.filter(f => f.status === 'missing').length
  const necessityBadge = m.necessity === 'critical'
    ? <span className="text-xs font-semibold px-1 rounded" style={{ color: '#b91c1c', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.20)' }}>关键</span>
    : <span className="text-xs font-semibold px-1 rounded" style={{ color: 'var(--rd-text-3)', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--rd-line)' }}>可选</span>

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-3 py-2 flex items-center gap-2 text-xs text-left transition"
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.dot }} />
        <span className="font-medium shrink-0 w-32 truncate" style={{ color: 'var(--rd-text)' }}>{m.title}</span>
        {necessityBadge}
        <span className="text-xs font-medium shrink-0 w-20" style={{ color: meta.color }}>{meta.label}</span>
        <span className="text-xs truncate flex-1" style={{ color: 'var(--rd-text-3)' }}>
          {missingN > 0 ? `${missingN} 个字段缺失` : `${m.fields.length} 个字段全有`}
        </span>
        <span className="text-xs shrink-0" style={{ color: 'var(--rd-text-3)' }}>{open ? '收起' : '展开'}</span>
      </button>
      {open && (
        <div className="px-3 pb-2.5 pt-0.5" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <table className="w-full text-xs">
            <tbody>
              {m.fields.map((f, idx) => (
                <tr key={f.key} style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--rd-line)' }}>
                  <td className="py-1.5 pr-2 w-32 truncate" style={{ color: 'var(--rd-text)' }}>{f.label}</td>
                  <td className="py-1.5 pr-2 w-16">
                    <span
                      className="px-1.5 py-0.5 rounded text-xs"
                      style={
                        f.status === 'available'
                          ? { background: 'rgba(16,185,129,0.15)', color: '#34D399' }
                          : f.status === 'deferred'
                          ? { background: 'rgba(59,130,246,0.15)', color: '#1d4ed8' }
                          : { background: 'rgba(245,158,11,0.15)', color: '#FBBF24' }
                      }
                    >
                      {f.status === 'available' ? '已有' : f.status === 'deferred' ? '推迟抽取' : '缺失'}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2 truncate" style={{ color: 'var(--rd-text-3)' }}>
                    {f.status === 'available' && f.source ? `来源:${f.source}` :
                     f.status === 'deferred' && f.note ? f.note :
                     f.note || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
