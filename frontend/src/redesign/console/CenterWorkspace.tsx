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
import InsightReportDark from './InsightReportDark'
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

  // 缺什么 — 用于焦点卡里的「精确指引」
  const missingRequired: { kind: 'doc' | 'virtual'; label: string; key: string }[] = []
  for (const d of (checklist?.required_docs || [])) {
    if (d.documents.length === 0) missingRequired.push({ kind: 'doc', label: d.label, key: d.doc_type })
  }
  for (const v of (checklist?.virtual_required || [])) {
    if (!v.filled) missingRequired.push({ kind: 'virtual', label: v.label, key: v.key })
  }

  // 当前应该突出哪个动作
  const title = allReady
    ? (activeBundle ? '可以重新生成项目洞察' : '资料已齐 — 可以生成项目洞察了')
    : `还差 ${reqTotal - reqDone} 项必备资料,补齐后即可生成`

  return (
    <FocusPreparationView
      reqDone={reqDone}
      reqTotal={reqTotal}
      recDone={recDone}
      recTotal={recTotal}
      reqPct={reqPct}
      allReady={allReady}
      title={title}
      hasBundle={!!activeBundle}
      missingRequired={missingRequired}
      uploadedDocs={uploadedDocs}
      filledVirtuals={filledVirtuals}
      checklist={checklist}
      isGenerating={genMut.isPending}
      onGenerate={() => genMut.mutate()}
      onOpenCheckup={() => setCheckupOpen(true)}
      checkupOpen={checkupOpen}
      onCloseCheckup={() => setCheckupOpen(false)}
      projectId={projectId}
      error={error}
      isInflight={!!activeInflight}
      inflightBundle={activeInflight}
    />
  )
}

// ── PreparationView · 方案 A · Focus 版 ────────────────────────────────────
function FocusPreparationView(p: {
  reqDone: number; reqTotal: number; recDone: number; recTotal: number
  reqPct: number; allReady: boolean; title: string; hasBundle: boolean
  missingRequired: { kind: 'doc' | 'virtual'; label: string; key: string }[]
  uploadedDocs: { doc_id: string; filename: string; type_label: string; status: string }[]
  filledVirtuals: { key: string; label: string; filled_count: number; total_count: number }[]
  checklist: any
  isGenerating: boolean
  onGenerate: () => void
  onOpenCheckup: () => void
  checkupOpen: boolean
  onCloseCheckup: () => void
  projectId: string
  error: string | null
  isInflight: boolean
  inflightBundle: CuratedBundle | undefined
}) {
  // 当前展开的折叠区(同时最多一个)
  const [expanded, setExpanded] = useState<string | null>(null)
  const toggle = (k: string) => setExpanded(prev => prev === k ? null : k)

  if (p.isInflight && p.inflightBundle) {
    return (
      <div className="h-full overflow-auto" style={{ background: 'transparent' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '36px 28px' }}>
          <GenerationProgressCard bundle={p.inflightBundle} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto" style={{ background: 'transparent' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '36px 28px 60px' }}>

        {/* ─── 焦点卡 ─── */}
        <div
          style={{
            position: 'relative',
            background: 'var(--rd-surface)',
            border: '1px solid var(--rd-line)',
            borderRadius: 18,
            padding: '30px 32px 26px',
            backdropFilter: 'blur(24px) saturate(140%)',
            WebkitBackdropFilter: 'blur(24px) saturate(140%)',
            boxShadow: '0 20px 60px -20px rgba(0,0,0,.5), 0 0 60px -20px rgba(255,141,26,.15)',
            overflow: 'hidden',
          }}
        >
          {/* 顶部装饰渐变 */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(circle at 0% 0%, rgba(255,141,26,.12), transparent 55%)',
            pointerEvents: 'none',
          }} />

          <div style={{ position: 'relative' }}>
            {/* 状态药丸 */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 12px',
              background: p.allReady ? 'rgba(52,211,153,.14)' : 'rgba(255,141,26,.14)',
              border: `1px solid ${p.allReady ? 'rgba(52,211,153,.35)' : 'rgba(255,141,26,.35)'}`,
              borderRadius: 999,
              fontSize: 10.5, fontWeight: 600,
              color: p.allReady ? 'var(--rd-green)' : 'var(--rd-accent-2)',
              letterSpacing: '.12em', textTransform: 'uppercase',
              marginBottom: 16,
            }}>
              <Sparkles size={11} />
              {p.allReady ? '可以生成' : '准备阶段'}
            </div>

            {/* 主标题 */}
            <h2 style={{
              fontSize: 22, fontWeight: 700, lineHeight: 1.35,
              color: 'var(--rd-text)', margin: 0, marginBottom: 8,
            }}>
              {p.title}
            </h2>
            <p style={{
              fontSize: 13, color: 'var(--rd-text-2)', lineHeight: 1.65,
              margin: 0, marginBottom: 22,
            }}>
              基于上传文档 + 引导问卷,自动抽取业务底盘 / 系统现状 / 关键人 / 风险点,每段标注来源。
            </p>

            {/* 进度条 */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 16px',
              background: 'rgba(255,255,255,.04)',
              border: '1px solid var(--rd-line)',
              borderRadius: 12,
              marginBottom: 20,
            }}>
              <div style={{
                fontSize: 26, fontWeight: 800,
                color: p.allReady ? 'var(--rd-green)' : 'var(--rd-accent)',
                fontVariantNumeric: 'tabular-nums', lineHeight: 1,
              }}>
                {p.reqDone}
                <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--rd-text-3)' }}> / {p.reqTotal}</span>
              </div>
              <div className="rd-progress-shimmer" style={{ flex: 1, height: 6, background: 'rgba(255,255,255,.06)', borderRadius: 999, overflow: 'hidden', position: 'relative' }}>
                <div style={{
                  height: '100%', width: `${p.reqPct}%`,
                  background: p.allReady
                    ? 'linear-gradient(90deg, var(--rd-green), #6EE7B7)'
                    : 'linear-gradient(90deg, var(--rd-accent), var(--rd-accent-2))',
                  borderRadius: 999,
                  boxShadow: p.allReady ? '0 0 12px rgba(52,211,153,.5)' : '0 0 12px rgba(255,141,26,.5)',
                  transition: 'width .3s',
                  position: 'relative',
                  zIndex: 1,
                }} />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--rd-text-3)' }}>
                已完成 <strong style={{ color: 'var(--rd-text-2)' }}>{p.reqPct}%</strong>
              </div>
            </div>

            {/* 缺什么 — 资料未齐时直接列前 3 项 */}
            {!p.allReady && p.missingRequired.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{
                  fontSize: 10.5, color: 'var(--rd-text-3)',
                  letterSpacing: '.12em', textTransform: 'uppercase',
                  fontWeight: 600, marginBottom: 8,
                }}>还需要补齐</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {p.missingRequired.slice(0, 3).map(m => (
                    <div key={m.key} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 12px',
                      background: 'rgba(255,141,26,.06)',
                      border: '1px solid rgba(255,141,26,.20)',
                      borderRadius: 10,
                      fontSize: 12.5,
                    }}>
                      {m.kind === 'doc'
                        ? <FileText size={12} style={{ color: 'var(--rd-accent-2)', flexShrink: 0 }} />
                        : <Pencil size={12} style={{ color: 'var(--rd-accent-2)', flexShrink: 0 }} />}
                      <span style={{ color: 'var(--rd-text)', flex: 1 }}>{m.label}</span>
                      <span style={{ fontSize: 10.5, color: 'var(--rd-text-3)' }}>
                        {m.kind === 'doc' ? '左栏上传' : '左栏作答'}
                      </span>
                    </div>
                  ))}
                  {p.missingRequired.length > 3 && (
                    <div style={{ fontSize: 11.5, color: 'var(--rd-text-3)', marginTop: 2, paddingLeft: 2 }}>
                      还有 {p.missingRequired.length - 3} 项 — 在左栏资料清单查看
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* CTA */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                onClick={p.onGenerate}
                disabled={p.isGenerating || (!p.allReady && !p.hasBundle)}
                className={p.allReady || p.hasBundle ? 'rd-btn rd-btn-primary' : 'rd-btn'}
                style={{
                  flex: 1, padding: '12px 18px', fontSize: 13.5, fontWeight: 600,
                  justifyContent: 'center',
                  opacity: (!p.allReady && !p.hasBundle) ? .45 : 1,
                  cursor: (p.isGenerating || (!p.allReady && !p.hasBundle)) ? 'not-allowed' : 'pointer',
                }}
                title={!p.allReady && !p.hasBundle ? '必备资料未齐,请先到左栏补齐' : ''}
              >
                {p.isGenerating
                  ? <><Loader2 size={14} className="animate-spin" /> 提交中…</>
                  : p.hasBundle
                    ? <><RotateCw size={13} /> 重新生成洞察</>
                    : p.allReady
                      ? <><Sparkles size={14} /> 开始生成洞察</>
                      : <><Sparkles size={14} /> 请先补齐必备资料</>}
              </button>
              <button
                onClick={p.onOpenCheckup}
                className="rd-btn"
                style={{ padding: '12px 14px', fontSize: 12.5 }}
                title="生成前看每个章节的字段够不够"
              >
                <Search size={12} /> 先看体检
              </button>
            </div>

            {p.error && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--rd-red)' }}>{p.error}</div>
            )}
          </div>
        </div>
        {/* ─── 焦点卡结束 ─── */}

        {/* ─── 折叠详情区 ─── */}
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <CollapsibleRow
            icon={<CheckCircle2 size={13} />}
            iconColor={p.allReady ? 'var(--rd-green)' : 'var(--rd-accent-2)'}
            label="必备资料"
            count={`${p.reqDone} / ${p.reqTotal}`}
            countTone={p.allReady ? 'done' : 'warn'}
            open={expanded === 'required'}
            onToggle={() => toggle('required')}
          >
            <ChecklistDetail
              items={(p.checklist?.required_docs || []).map((d: any) => ({
                kind: 'doc', label: d.label, done: d.documents.length > 0,
                sub: d.documents.length > 0 ? `${d.documents.length} 份已传` : '尚未上传',
              })).concat(
                (p.checklist?.virtual_required || []).map((v: any) => ({
                  kind: 'virtual', label: v.label, done: v.filled,
                  sub: v.filled ? `已答 ${v.filled_count}/${v.total_count}` : '尚未作答',
                }))
              )}
            />
          </CollapsibleRow>

          <CollapsibleRow
            icon={<Lightbulb size={13} />}
            iconColor={p.recDone === p.recTotal ? 'var(--rd-green)' : 'var(--rd-blue)'}
            label="推荐资料"
            count={`${p.recDone} / ${p.recTotal}`}
            countTone={p.recDone === p.recTotal ? 'done' : 'info'}
            open={expanded === 'recommended'}
            onToggle={() => toggle('recommended')}
          >
            <ChecklistDetail
              items={(p.checklist?.recommended_docs || []).map((d: any) => ({
                kind: 'doc', label: d.label, done: d.documents.length > 0,
                sub: d.documents.length > 0 ? `${d.documents.length} 份已传` : '建议补全',
              })).concat(
                (p.checklist?.virtual_recommended || []).map((v: any) => ({
                  kind: 'virtual', label: v.label, done: v.filled,
                  sub: v.filled ? `已答 ${v.filled_count}/${v.total_count}` : '建议作答',
                }))
              )}
            />
          </CollapsibleRow>

          {p.filledVirtuals.length > 0 && (
            <CollapsibleRow
              icon={<Pencil size={13} />}
              iconColor="var(--rd-violet)"
              label="已填问卷"
              count={`${p.filledVirtuals.length}`}
              countTone="done"
              open={expanded === 'virtuals'}
              onToggle={() => toggle('virtuals')}
            >
              <div style={{ padding: '8px 14px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {p.filledVirtuals.map(v => (
                  <div key={v.key} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px',
                    background: 'rgba(192,132,252,.08)',
                    border: '1px solid rgba(192,132,252,.22)',
                    borderRadius: 8,
                  }}>
                    <CheckCircle2 size={12} style={{ color: 'var(--rd-violet)', flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontSize: 12, fontWeight: 500, color: 'var(--rd-text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{v.label}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--rd-text-3)' }}>已答 {v.filled_count}/{v.total_count}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleRow>
          )}

          {p.uploadedDocs.length > 0 && (
            <CollapsibleRow
              icon={<FileText size={13} />}
              iconColor="var(--rd-text-2)"
              label="已上传文档"
              count={`${p.uploadedDocs.length} 份`}
              countTone="muted"
              open={expanded === 'uploaded'}
              onToggle={() => toggle('uploaded')}
            >
              <div>
                {p.uploadedDocs.slice(0, 20).map((d, idx) => (
                  <div key={d.doc_id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 14px',
                    borderTop: idx === 0 ? 'none' : '1px solid var(--rd-line)',
                    fontSize: 12,
                  }}>
                    <FileText size={11} style={{ color: 'var(--rd-text-3)', flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ color: 'var(--rd-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.filename}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--rd-text-3)' }}>
                        <span style={{
                          padding: '0 6px', marginRight: 8,
                          background: 'rgba(255,141,26,.10)',
                          color: 'var(--rd-accent)',
                          border: '1px solid rgba(255,141,26,.20)',
                          borderRadius: 4,
                        }}>{d.type_label}</span>
                        {d.status === 'completed' ? '已索引' : `${d.status} 中…`}
                      </div>
                    </div>
                  </div>
                ))}
                {p.uploadedDocs.length > 20 && (
                  <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--rd-text-3)', textAlign: 'center' }}>
                    另有 {p.uploadedDocs.length - 20} 份未列出
                  </div>
                )}
              </div>
            </CollapsibleRow>
          )}
        </div>

        {p.checkupOpen && (
          <InsightCheckupDrawer projectId={p.projectId} onClose={p.onCloseCheckup} />
        )}
      </div>
    </div>
  )
}

// ── 折叠区行(详情默认收起)─────────────────────────────────────
function CollapsibleRow({
  icon, iconColor, label, count, countTone, open, onToggle, children,
}: {
  icon: React.ReactNode; iconColor: string
  label: string; count: string
  countTone: 'done' | 'warn' | 'info' | 'muted'
  open: boolean; onToggle: () => void
  children: React.ReactNode
}) {
  const countBg =
    countTone === 'done' ? 'rgba(52,211,153,.12)' :
    countTone === 'warn' ? 'rgba(255,141,26,.12)' :
    countTone === 'info' ? 'rgba(96,165,250,.12)' :
                           'var(--rd-surface-elev)'
  const countText =
    countTone === 'done' ? 'var(--rd-green)' :
    countTone === 'warn' ? 'var(--rd-accent-2)' :
    countTone === 'info' ? 'var(--rd-blue)' :
                           'var(--rd-text-3)'
  return (
    <div style={{
      border: '1px solid var(--rd-line)',
      borderRadius: 10,
      background: 'rgba(255,255,255,.025)',
      overflow: 'hidden',
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px',
          background: 'transparent', border: 'none',
          cursor: 'pointer', fontFamily: 'inherit',
          color: 'var(--rd-text-2)', textAlign: 'left',
        }}
      >
        <span style={{ color: iconColor, display: 'inline-flex' }}>{icon}</span>
        <span style={{ flex: 1, fontSize: 13, color: 'var(--rd-text)' }}>{label}</span>
        <span style={{
          padding: '1px 8px',
          background: countBg, color: countText,
          borderRadius: 999, fontSize: 11, fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
        }}>{count}</span>
        <span style={{
          color: 'var(--rd-text-3)',
          transition: 'transform .2s',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          display: 'inline-flex',
        }}>▾</span>
      </button>
      {open && (
        <div style={{ borderTop: '1px solid var(--rd-line)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function ChecklistDetail({ items }: { items: { kind: 'doc' | 'virtual'; label: string; done: boolean; sub: string }[] }) {
  return (
    <div>
      {items.map((it, idx) => (
        <div key={idx} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 14px',
          borderTop: idx === 0 ? 'none' : '1px solid var(--rd-line)',
          fontSize: 12,
        }}>
          {it.done
            ? <CheckCircle2 size={12} style={{ color: 'var(--rd-green)', flexShrink: 0 }} />
            : <span style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid var(--rd-text-3)', flexShrink: 0 }} />}
          <span style={{ flex: 1, color: 'var(--rd-text)' }}>{it.label}</span>
          <span style={{ fontSize: 10.5, color: it.done ? 'var(--rd-green)' : 'var(--rd-text-3)' }}>{it.sub}</span>
        </div>
      ))}
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
              <InsightReportDark
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
