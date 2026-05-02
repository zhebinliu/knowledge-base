/**
 * CenterWorkspace — 项目详情页(insight stage)中栏
 *
 * 根据 centerView 切换:
 *  - 'preparation' (默认):「准备状态」卡片 — 完成度 + Brief 按钮 + 开始生成 CTA
 *  - 'preview':显示某文档的 markdown(用户从左栏点击)
 *  - 'report':显示已生成报告 markdown(带角标)
 *  - 'gap_filler':显示 AgenticGapFiller(bundle invalid+short_circuited)
 *  - 'virtual':显示虚拟物问卷(成功指标/风险预警)
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText, Sparkles, Loader2, ArrowLeft, AlertCircle, CheckCircle2,
  Lightbulb, Eye, Download, RotateCw, Search, X, Pencil,
} from 'lucide-react'
import {
  getDocumentMarkdown, getDocChecklist,
  getVirtualArtifact, submitVirtualArtifact,
  generateOutput, getInsightCheckup,
  type CuratedBundle, type AgenticGapPrompt, type InsightCheckupResult,
} from '../../api/client'
import { useState } from 'react'
import MarkdownView from '../MarkdownView'
import AgenticGapFiller from '../AgenticGapFiller'
import CitedReportView from './CitedReportView'
import MarkdownEditor from './MarkdownEditor'
import StakeholderCanvas from './StakeholderCanvas'
import GenerationProgressCard from './GenerationProgressCard'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

export type CenterView =
  | { type: 'preparation' }
  | { type: 'preview'; docId: string }
  | { type: 'report' }
  | { type: 'gap_filler' }
  | { type: 'virtual'; vkey: string }
  | { type: 'canvas' }                     // 干系人图谱手动编辑

interface Props {
  projectId: string
  activeBundle: CuratedBundle | undefined
  activeInflight: CuratedBundle | undefined
  view: CenterView
  setView: (v: CenterView) => void
  onRefetch: () => void
  onCitationClick?: (moduleKey: string, refId: string) => void   // v3:报告角标点击 → 跳右栏
}

export default function CenterWorkspace({
  projectId, activeBundle, activeInflight, view, setView, onRefetch, onCitationClick,
}: Props) {
  return (
    <div className="flex-1 min-h-0 flex flex-col bg-white overflow-hidden">
      {/* 视图顶部:返回按钮(预览/虚拟物/canvas 时) */}
      {(view.type === 'preview' || view.type === 'virtual' || view.type === 'canvas') && (
        <div className="flex-shrink-0 px-4 py-2 bg-slate-50 border-b border-line flex items-center gap-2">
          <button
            onClick={() => setView({ type: activeBundle ? 'report' : 'preparation' })}
            className="flex items-center gap-1 px-2 py-1 text-xs text-ink-muted hover:text-ink rounded hover:bg-canvas"
          >
            <ArrowLeft size={11} />
            返回 {activeBundle ? '报告' : '准备'}
          </button>
          {view.type === 'preview' && <span className="text-[11px] text-ink-muted">· 文档预览</span>}
          {view.type === 'virtual' && <span className="text-[11px] text-ink-muted">· 虚拟物问卷</span>}
          {view.type === 'canvas'  && <span className="text-[11px] text-ink-muted">· 组织架构 / 干系人图谱</span>}
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

  // 已上传的所有文档(展平):必需 + 推荐 + 附加参考
  const uploadedDocs: { doc_id: string; filename: string; type_label: string; status: string }[] = []
  for (const d of (checklist?.required_docs || []).concat(checklist?.recommended_docs || [])) {
    for (const doc of d.documents) {
      uploadedDocs.push({
        doc_id: doc.doc_id, filename: doc.filename, type_label: d.label, status: doc.status,
      })
    }
  }
  // 附加参考文档(用户在清单底部手动加进来的额外资料)
  for (const ref of (checklist?.extra_references || [])) {
    uploadedDocs.push({
      doc_id: ref.doc_id, filename: ref.filename, type_label: '附加参考', status: ref.status,
    })
  }
  // 已填的虚拟物
  const filledVirtuals = (checklist?.virtual_required || []).concat(checklist?.virtual_recommended || [])
    .filter(v => v.filled)

  return (
    <div className="h-full overflow-auto bg-white">
      <div className="px-6 py-5 max-w-[1400px] mx-auto space-y-4">

        {/* —— 顶部 Hero —— inflight 时换成进度卡 —— */}
        {activeInflight ? (
          <GenerationProgressCard bundle={activeInflight} />
        ) : (
          <div className="bg-slate-50/50 rounded-xl border border-line overflow-hidden shadow-sm">
            <div className="px-6 py-5 flex items-start gap-4 border-b border-line"
                 style={{ background: 'linear-gradient(to right, #FFF7ED 0%, #FFFFFF 60%)' }}>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                   style={{ background: BRAND_GRAD }}>
                <Lightbulb size={20} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-ink">项目洞察</h2>
                <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                  基于上传文档 + 引导问卷生成项目诊断报告。
                  <br/>把左侧文档清单补齐,系统会自动从文档抽取信息并标注每段来源。
                </p>
              </div>
              {/* 完成度大数字 */}
              <div className="text-right shrink-0">
                <div className="text-2xl font-extrabold tabular-nums"
                     style={{ color: allReady ? '#10B981' : '#D96400' }}>
                  {reqDone}<span className="text-sm text-ink-muted font-normal"> / {reqTotal}</span>
                </div>
                <div className="text-[11px] text-ink-muted">必备资料</div>
              </div>
            </div>

            {/* 进度条 + 提示 + CTA */}
            <div className="px-6 py-4">
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
                <div className="h-full transition-all rounded-full" style={{
                  width: `${reqPct}%`,
                  background: allReady ? '#10B981' : BRAND_GRAD,
                }} />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-ink-secondary flex-1">
                  {allReady
                    ? '✅ 必备资料已齐,可以开始生成洞察'
                    : `还差 ${reqTotal - reqDone} 项必备资料(左栏 「+」 上传 / 「问卷」 填写)`}
                </span>
                {/* 先看体检 — 生成前预 plan,规则化不调 LLM,秒级出结果 */}
                <button
                  onClick={() => setCheckupOpen(true)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 border border-line rounded-lg text-xs text-ink-secondary hover:bg-canvas"
                  title="生成前看每个章节的字段够不够,缺什么提前补"
                >
                  <Search size={12} /> 先看体检
                </button>
                {activeBundle ? (
                  <button
                    onClick={() => genMut.mutate()}
                    disabled={genMut.isPending}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 border border-line rounded-lg text-sm text-ink hover:bg-canvas"
                  >
                    <RotateCw size={13} /> 重新生成
                  </button>
                ) : (
                  <button
                    onClick={() => genMut.mutate()}
                    disabled={genMut.isPending || !allReady}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: BRAND_GRAD }}
                    title={!allReady ? '必备资料未齐,请先到左栏补齐' : ''}
                  >
                    {genMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {allReady ? '开始生成洞察' : '请先补齐必备资料'}
                  </button>
                )}
              </div>
              {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
              {checkupOpen && (
                <InsightCheckupDrawer projectId={projectId} onClose={() => setCheckupOpen(false)} />
              )}
            </div>
          </div>
        )}

        {/* —— 中部三卡片网格 —— */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 必备资料 */}
          <StatCard
            label="必备资料"
            value={`${reqDone} / ${reqTotal}`}
            sub={allReady ? '已齐' : `还差 ${reqTotal - reqDone} 项`}
            color={allReady ? '#10B981' : '#D96400'}
            icon={CheckCircle2}
          />
          {/* 推荐资料 */}
          <StatCard
            label="推荐资料"
            value={`${recDone} / ${recTotal}`}
            sub={recDone === recTotal ? '已齐' : '建议补全'}
            color={recDone === recTotal ? '#10B981' : '#3B82F6'}
            icon={Lightbulb}
          />
          {/* 已上传文档总数 */}
          <StatCard
            label="已上传文档"
            value={`${uploadedDocs.length}`}
            sub={uploadedDocs.length > 0 ? '点击下方查看' : '尚未上传'}
            color="#8B5CF6"
            icon={FileText}
          />
        </div>

        {/* —— 已上传文档预览 —— */}
        {uploadedDocs.length > 0 && (
          <div className="bg-slate-50/50 rounded-xl border border-line overflow-hidden">
            <div className="px-5 py-3 border-b border-line flex items-center gap-2">
              <FileText size={13} className="text-ink-muted" />
              <h3 className="text-sm font-semibold text-ink">已上传文档</h3>
              <span className="text-[11px] text-ink-muted">{uploadedDocs.length} 份</span>
            </div>
            <div className="divide-y divide-line">
              {uploadedDocs.slice(0, 6).map(d => (
                <div key={d.doc_id} className="px-5 py-2.5 flex items-center gap-3 hover:bg-canvas">
                  <FileText size={12} className="text-ink-muted shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-ink truncate">{d.filename}</div>
                    <div className="text-[11px] text-ink-muted">
                      <span className="px-1.5 py-0 rounded bg-orange-50 text-[#D96400] mr-1.5">{d.type_label}</span>
                      {d.status === 'completed' ? '已索引' : <span className="text-amber-600">{d.status} 中…</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* —— 已填问卷预览 —— */}
        {filledVirtuals.length > 0 && (
          <div className="bg-slate-50/50 rounded-xl border border-line p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={13} className="text-purple-600" />
              <h3 className="text-sm font-semibold text-ink">已填问卷</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {filledVirtuals.map(v => (
                <div key={v.key} className="flex items-center gap-2 p-2.5 bg-emerald-50/40 border border-emerald-200 rounded">
                  <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-ink truncate">{v.label}</div>
                    <div className="text-[10px] text-ink-muted">已答 {v.filled_count}/{v.total_count}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* —— 操作提示 —— */}
        {!allReady && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-xs text-[#92400E] leading-relaxed">
            <strong>下一步:</strong> 在<strong>左侧文档清单</strong>里补齐带「★ 必需」的资料 —
            上传文档点 <span className="px-1 py-0.5 bg-white rounded text-[10px] border border-orange-300">+</span>
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
    <div className="bg-slate-50/50 rounded-xl border border-line p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
           style={{ background: `${color}15`, color }}>
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-ink-muted">{label}</div>
        <div className="text-lg font-bold tabular-nums" style={{ color }}>{value}</div>
        <div className="text-[10px] text-ink-muted">{sub}</div>
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
  if (isLoading) return <div className="h-full bg-white flex items-center justify-center text-xs text-ink-muted"><Loader2 size={16} className="inline animate-spin mr-2" /> 加载中…</div>
  if (!data) return <div className="h-full bg-white p-6 text-center text-xs text-ink-muted">文档不存在</div>
  return (
    <div className="h-full bg-white overflow-auto">
      <div className="max-w-[1100px] mx-auto px-6 py-6">
        <div className="mb-4 pb-3 border-b border-line flex items-center gap-2">
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
  // 编辑态走独立 fiber tree,避免 React error #310(hook 路径切换)
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
      <div className="h-full flex items-center justify-center text-xs text-ink-muted">
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
  // v3.4: 如果 list 已经带了 content_md (大概率不带,因为 list 不返回 content_md),
  //       直接用,否则才发起 getOutput(bundle.id)
  const { data, isLoading } = useQuery({
    queryKey: ['output', bundle.id],
    queryFn: () => import('../../api/client').then(m => m.getOutput(bundle.id)),
    enabled: !bundle.content_md,
    initialData: bundle.content_md ? bundle as any : undefined,
  })
  const validity = bundle.validity_status
  // v3 provenance:from bundle.provenance(via dto)or full output detail(若 dto 没透出)
  const provenance = bundle.provenance || {}

  return (
    <div className="h-full bg-canvas overflow-auto">
      <div className="max-w-[1600px] mx-auto px-5 py-5 space-y-4">
        {/* v3.6:挑战回合面板 + 单独的 validity 提示 已合并到 AgenticValidityBanner(报告页顶部),
            这里不再重复展示,避免双源头让用户混淆 */}
        {/* v3.4 M9 web 检索失败提示 — 不阻断阅读,只告诉用户 M9 章节质量可能下降 */}
        {bundle.web_search_status && !bundle.web_search_status.ok && (
          <div className="px-3 py-2 rounded text-xs bg-blue-50 text-blue-800 border border-blue-200">
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
        {/* 报告正文白色卡片容器:border + shadow 让内容有清晰边界 */}
        <div className="bg-white rounded-xl border border-line shadow-sm overflow-hidden">
          {/* 工具栏:编辑按钮 — 仅在已加载完成时显示 */}
          {data?.content_md && (
            <div className="flex items-center justify-end px-4 py-2 border-b border-line bg-slate-50/40">
              <button
                onClick={onEdit}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md text-ink-secondary hover:bg-white hover:text-ink"
                title="在线编辑 markdown 正文"
              >
                <Pencil size={11} /> 编辑
              </button>
            </div>
          )}
          <div className="px-8 py-7 overflow-x-auto">
            {isLoading ? (
              <div className="text-center text-xs text-ink-muted py-8">
                <Loader2 size={16} className="inline animate-spin" /> 加载报告内容…
              </div>
            ) : data?.content_md ? (
              <CitedReportView
                content={data.content_md}
                provenance={provenance}
                onCitationClick={onCitationClick || (() => {})}
              />
            ) : (
              <div className="text-sm text-ink-muted italic">没有 markdown 内容</div>
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
    <div className="h-full bg-white flex items-center justify-center text-xs text-ink-muted">
      <Loader2 size={16} className="inline animate-spin mr-2" /> 加载问卷…
    </div>
  )
  if (!data) return <div className="h-full bg-white p-6 text-xs text-ink-muted">无法加载</div>

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
  const valueOf = (p: AgenticGapPrompt) => {
    if (p.field_key in answers) return answers[p.field_key]
    const cell = data.current_values[p.field_key]
    return cell?.value
  }

  return (
    <div className="h-full bg-white overflow-auto">
      <div className="max-w-[1100px] mx-auto px-6 py-6 pb-20">
        <div className="mb-5 pb-4 border-b border-line">
          <h2 className="text-lg font-bold text-ink">{data.title}</h2>
          <p className="text-xs text-ink-muted mt-1">{data.description}</p>
        </div>
        <div className="space-y-4">
          {data.ask_user_prompts.map(p => (
            <PromptCard key={p.field_key} prompt={p} value={valueOf(p)}
                        onChange={v => setAnswer(p.field_key, v)} />
          ))}
        </div>
      </div>
      {/* 底部固定操作栏(白底 + 顶分割线) */}
      <div className="absolute bottom-0 left-0 right-0 px-6 py-3 bg-white border-t border-line flex items-center gap-3 shadow-[0_-2px_4px_rgba(0,0,0,0.03)]">
        {error && <span className="text-xs text-red-600">{error}</span>}
        <span className="ml-auto text-[11px] text-ink-muted">保存后会自动写入项目要点</span>
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded shadow-sm disabled:opacity-50"
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
  prompt: AgenticGapPrompt
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

// ── 体检报告 Drawer ──────────────────────────────────────────────────────────
// 「先看体检」按钮点击触发,跑 plan_insight(规则化,不调 LLM)显示每模块字段状态。
// 让 PM 在生成前知道哪些模块会成功 / 哪些缺信息,提前补,避免试错式生成。

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
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-line shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col"
           onClick={e => e.stopPropagation()}>
        {/* 顶栏 */}
        <div className="flex-shrink-0 px-5 py-3 border-b border-line bg-slate-50/50 flex items-center gap-2">
          <Search size={14} className="text-orange-600" />
          <h3 className="text-sm font-bold text-ink">体检报告 · 项目洞察</h3>
          {data && (
            <span className="ml-2 text-[11px] text-ink-muted">
              · 共 {data.modules.length} 个章节 · 已就绪 {data.stats.ready_n} · 待补 {data.stats.blocked_n + data.stats.ask_user_n}
            </span>
          )}
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-slate-100 text-ink-muted">
            <X size={14} />
          </button>
        </div>

        {/* 主体 */}
        <div className="flex-1 min-h-0 overflow-auto p-5 space-y-3">
          {isLoading && (
            <div className="text-center py-8 text-xs text-ink-muted">
              <Loader2 size={14} className="inline animate-spin mr-1.5" />
              正在体检…(纯规则,不调 LLM)
            </div>
          )}
          {error != null && (
            <div className="text-xs text-red-600 p-3 bg-red-50 rounded">
              体检失败:{(error as any)?.message || '未知错误'}
            </div>
          )}
          {data && (
            <>
              {/* 综合状态 */}
              <div className={`p-3 rounded-lg border text-sm ${
                data.sufficient_critical
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}>
                <div className="flex items-center gap-2 font-semibold">
                  {data.sufficient_critical ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  {data.sufficient_critical
                    ? '关键章节信息充足,可以开始生成'
                    : '关键章节信息不足,建议补全后再生成(避免 invalid 短路)'}
                </div>
                <div className="mt-1 text-[11px] opacity-90">
                  已上传文档 {data.stats.docs_total} 份 · Brief 字段 {data.stats.brief_fields_n} 个 · {data.stats.has_conversation ? '已有访谈' : '无访谈'}
                </div>
              </div>

              {/* 模块状态表 */}
              <div className="border border-line rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 text-[11px] text-ink-muted">
                  按章节看 — 点击展开看每个字段的状态
                </div>
                <div className="divide-y divide-line">
                  {data.modules.map(m => <CheckupModuleRow key={m.key} module={m} />)}
                </div>
              </div>

              {/* 待补字段(ask_user) */}
              {data.gap_actions.filter(g => g.action === 'ask_user').length > 0 && (
                <div className="border border-amber-200 rounded-lg overflow-hidden bg-amber-50/30">
                  <div className="px-3 py-2 bg-amber-50 text-xs font-semibold text-amber-800 flex items-center gap-2">
                    <AlertCircle size={12} />
                    需要你补充的字段({data.gap_actions.filter(g => g.action === 'ask_user').length} 项)
                  </div>
                  <ul className="p-3 space-y-1.5 text-xs">
                    {data.gap_actions.filter(g => g.action === 'ask_user').map((g, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-ink-muted shrink-0 w-32 truncate">{g.module_title}</span>
                        <span className="text-ink-secondary flex-1">{g.detail}</span>
                        {g.required && <span className="text-[10px] text-amber-700 shrink-0">必答</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* 底部操作 */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-line bg-slate-50/30 flex items-center gap-2">
          <span className="text-[11px] text-ink-muted flex-1">
            体检完了?可以去左栏补缺,或直接关闭体检窗口点「开始生成」
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs border border-line rounded text-ink-secondary hover:bg-slate-50"
          >
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
    ready:   { label: '就绪',     color: 'text-emerald-700', dot: 'bg-emerald-500' },
    blocked: { label: '关键缺失', color: 'text-red-700',     dot: 'bg-red-500' },
    skipped: { label: '跳过',     color: 'text-ink-muted',   dot: 'bg-slate-300' },
    planned: { label: '规划中',   color: 'text-blue-700',    dot: 'bg-blue-400' },
  }
  const meta = STATUS_META[m.status] || STATUS_META.planned
  const missingN = m.fields.filter(f => f.status === 'missing').length
  const necessityBadge = m.necessity === 'critical'
    ? <span className="text-[9px] font-semibold text-red-700 bg-red-50 px-1 rounded">关键</span>
    : <span className="text-[9px] font-semibold text-ink-muted bg-slate-100 px-1 rounded">可选</span>

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-3 py-2 flex items-center gap-2 text-xs hover:bg-slate-50 text-left"
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
        <span className="font-medium text-ink shrink-0 w-32 truncate">{m.title}</span>
        {necessityBadge}
        <span className={`text-[11px] font-medium shrink-0 w-20 ${meta.color}`}>{meta.label}</span>
        <span className="text-[11px] text-ink-muted truncate flex-1">
          {missingN > 0 ? `${missingN} 个字段缺失` : `${m.fields.length} 个字段全有`}
        </span>
        <span className="text-[10px] text-ink-muted shrink-0">{open ? '收起' : '展开'}</span>
      </button>
      {open && (
        <div className="px-3 pb-2.5 pt-0.5 bg-slate-50/40">
          <table className="w-full text-[11px]">
            <tbody className="divide-y divide-slate-200">
              {m.fields.map(f => (
                <tr key={f.key}>
                  <td className="py-1.5 pr-2 w-32 text-ink truncate">{f.label}</td>
                  <td className="py-1.5 pr-2 w-16">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                      f.status === 'available' ? 'bg-emerald-100 text-emerald-700' :
                      f.status === 'deferred'  ? 'bg-blue-100 text-blue-700' :
                                                  'bg-amber-100 text-amber-700'
                    }`}>
                      {f.status === 'available' ? '已有' : f.status === 'deferred' ? '推迟抽取' : '缺失'}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2 text-ink-muted truncate">
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
