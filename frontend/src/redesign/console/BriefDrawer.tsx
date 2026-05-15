/**
 * NewBriefDrawer — 项目 Brief 抽屉(Liquid Glass)
 * 功能 100% 等价 — getBrief / extractBriefStream(SSE 阶段流) / putBrief
 *                   + FieldEditor(list/date/text)+ ConfidenceDot + 来源面板
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  X, Loader2, Wand2, Save, Sparkles, AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Info,
} from 'lucide-react'
import {
  getBrief, extractBriefStream, putBrief,
  type BriefFieldCell, type BriefFieldDef, type BriefConfidence,
} from '../../api/client'

type StageState = { id: string; label: string; status: 'pending' | 'running' | 'done'; detail?: string }

interface Props {
  open: boolean
  kind: string
  projectId: string
  stageTitle: string
  onClose: () => void
  onGenerate: () => void
}

export default function NewBriefDrawer({ open, kind, projectId, stageTitle, onClose, onGenerate }: Props) {
  const qc = useQueryClient()
  const [fields, setFields] = useState<Record<string, BriefFieldCell>>({})
  const [schema, setSchema] = useState<BriefFieldDef[]>([])
  const [extracted, setExtracted] = useState(false)
  const [err, setErr] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

  const { data: briefData, isLoading } = useQuery({
    queryKey: ['brief', kind, projectId],
    queryFn: () => getBrief(kind, projectId),
    enabled: open,
    refetchOnWindowFocus: false, refetchOnMount: false, staleTime: Infinity,
  })

  const initedRef = useRef(false)
  useEffect(() => {
    if (briefData && !initedRef.current) {
      setFields(briefData.fields || {})
      setSchema(briefData.schema || [])
      initedRef.current = true
    }
  }, [briefData])

  const [stages, setStages] = useState<StageState[]>([])
  const [extracting, setExtracting] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const runExtract = async () => {
    setErr(''); setExtracting(true); setStages([])
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    try {
      await extractBriefStream(kind, projectId, (ev) => {
        if (ev.type === 'stage_start') {
          setStages(prev => prev.some(s => s.id === ev.id)
            ? prev.map(s => s.id === ev.id ? { ...s, status: 'running' } : s)
            : [...prev, { id: ev.id, label: ev.label, status: 'running' }])
        } else if (ev.type === 'stage_done') {
          setStages(prev => prev.map(s => s.id === ev.id ? { ...s, status: 'done', detail: ev.detail } : s))
        } else if (ev.type === 'done') {
          setFields(ev.fields || {}); setSchema(ev.schema || []); setExtracted(true)
        } else if (ev.type === 'error') {
          setErr(ev.message || '抽取失败')
        }
      }, ac.signal)
    } catch (e: any) { if (e?.name !== 'AbortError') setErr(e?.message || '抽取失败') }
    finally { setExtracting(false) }
  }

  useEffect(() => () => abortRef.current?.abort(), [])

  const saveMut = useMutation({
    mutationFn: () => putBrief(kind, projectId, fields),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brief', kind, projectId] }),
    onError: (e: any) => setErr(e?.response?.data?.detail || '保存失败'),
  })

  useEffect(() => {
    if (open && briefData && !briefData.exists && !extracting && !extracted) {
      setExtracted(true); runExtract()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, briefData, extracted])

  const groups = useMemo(() => {
    const map = new Map<string, BriefFieldDef[]>()
    for (const f of schema) {
      const g = f.group || '其他'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(f)
    }
    return Array.from(map.entries())
  }, [schema])

  const updateField = (key: string, patch: Partial<BriefFieldCell>) => {
    setFields(prev => {
      const old = prev[key] || { value: null, confidence: null, sources: [] }
      return { ...prev, [key]: { ...old, ...patch, edited_at: new Date().toISOString() } }
    })
  }

  const requiredMissing = schema.filter(f => {
    if (!f.required) return false
    const v = fields[f.key]?.value
    return v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0)
  })

  const handleSaveAndGenerate = async () => {
    setErr('')
    try { await saveMut.mutateAsync(); onGenerate(); onClose() }
    catch { /* */ }
  }

  if (!open) return null

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 40,
      display: 'flex', justifyContent: 'flex-end',
      background: 'rgba(15, 18, 36, 0.20)',
      backdropFilter: 'blur(4px)',
      WebkitBackdropFilter: 'blur(4px)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(720px, 100vw)', height: '100%',
        background: 'rgba(255,255,255,0.08)',
        backdropFilter: 'blur(40px) saturate(180%)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
        display: 'flex', flexDirection: 'column',
        borderLeft: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 25px 50px -12px rgba(15, 18, 36, .25), inset 1px 0 0 rgba(255,255,255,0.10)',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--rd-line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10, flexShrink: 0,
              background: 'linear-gradient(135deg, var(--rd-accent), var(--rd-accent-2))',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
              boxShadow: '0 4px 12px -2px rgba(255,141,26,.45)',
            }}>
              <Sparkles size={14} />
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--rd-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                项目 Brief · {stageTitle}
              </p>
              <p style={{ fontSize: 12, color: 'var(--rd-text-3)', margin: '2px 0 0' }}>先确认这一份,再生成交付物。系统已基于已有素材自动预填。</p>
            </div>
          </div>
          <button onClick={onClose} className="rd-icon-btn" style={{ width: 28, height: 28 }}><X size={14} /></button>
        </div>

        {/* Toolbar */}
        <div style={{
          padding: '8px 20px', borderBottom: '1px solid var(--rd-line)',
          background: 'rgba(15, 18, 36, .025)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--rd-text-3)' }}>
            <Info size={11} />
            <span>字段右上角圆点表示置信度(绿=高 / 黄=中 / 灰=低)。空白和低置信项请确认或补全。</span>
          </div>
          <button
            onClick={runExtract}
            disabled={extracting}
            className="rd-btn"
            style={{ padding: '4px 10px', fontSize: 12, color: 'var(--rd-accent-2)', borderColor: 'rgba(255, 141, 26, .35)' }}
            title="重新跑一次自动抽取(已编辑过的字段不会被覆盖)"
          >
            {extracting ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
            {extracting ? '抽取中…' : '重新抽取'}
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px', position: 'relative', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {isLoading && schema.length === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '48px 0', fontSize: 12, color: 'var(--rd-text-3)' }}>
              <Loader2 size={13} className="animate-spin" /> 加载 Brief…
            </div>
          )}

          {!isLoading && !extracting && schema.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', fontSize: 12, color: 'var(--rd-text-3)' }}>该交付物没有 Brief 模板</div>
          )}

          {extracting && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 10,
              background: 'rgba(255,255,255,0.10)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: 360, borderRadius: 16,
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255, 141, 26, .25)',
                boxShadow: '0 16px 40px -12px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.10)',
                padding: '18px 22px',
                display: 'flex', flexDirection: 'column', gap: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 12, flexShrink: 0,
                    background: 'linear-gradient(135deg, var(--rd-accent), var(--rd-accent-2))',
                    color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Loader2 size={16} className="animate-spin" />
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--rd-text)', margin: 0 }}>AI 正在思考中…</p>
                    <p style={{ fontSize: 12, color: 'var(--rd-text-3)', margin: '2px 0 0' }}>逐步采集素材 → 综合抽取字段</p>
                  </div>
                </div>
                {(() => {
                  const gather = stages.filter(s => s.id !== 'llm')
                  const llm = stages.find(s => s.id === 'llm')
                  const gatherDone = gather.length > 0 && gather.every(s => s.status === 'done')
                  return (
                    <>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {gather.map(s => (
                          <li key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12 }}>
                            <span style={{ marginTop: 2, flexShrink: 0 }}>
                              {s.status === 'done' ? <CheckCircle2 size={13} color="#34D399" />
                                : s.status === 'running' ? <Loader2 size={13} className="animate-spin" color="var(--rd-accent)" />
                                : <span style={{ display: 'inline-block', width: 13, height: 13, borderRadius: '50%', border: '1px solid var(--rd-line)' }} />}
                            </span>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <span style={{
                                color: s.status === 'done' ? 'var(--rd-text)' : s.status === 'running' ? 'var(--rd-text)' : 'var(--rd-text-3)',
                                fontWeight: s.status === 'running' ? 600 : 400,
                              }}>{s.label}</span>
                              {s.detail && s.status === 'done' && (
                                <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--rd-text-3)' }}>· {s.detail}</span>
                              )}
                            </div>
                          </li>
                        ))}
                        {gather.length === 0 && (
                          <li style={{ fontSize: 12, color: 'var(--rd-text-3)', fontStyle: 'italic' }}>准备中…</li>
                        )}
                      </ul>
                      {gatherDone && (
                        <div style={{ paddingTop: 10, borderTop: '1px solid var(--rd-line)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                            {llm?.status === 'done'
                              ? <CheckCircle2 size={13} color="#34D399" />
                              : <Loader2 size={13} className="animate-spin" color="var(--rd-accent)" />}
                            <span style={{ fontWeight: 600, color: 'var(--rd-accent-2)' }}>
                              {llm?.status === 'done' ? '生成完成' : 'AI 生成中…'}
                            </span>
                            {llm?.detail && llm.status === 'done' && (
                              <span style={{ fontSize: 12, color: 'var(--rd-text-3)' }}>· {llm.detail}</span>
                            )}
                          </div>
                          {llm?.status !== 'done' && (
                            <p style={{ fontSize: 12, color: 'var(--rd-text-3)', margin: '4px 0 0 20px' }}>综合素材抽取字段,通常 30–90 秒</p>
                          )}
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>
          )}

          {schema.length > 0 && groups.map(([groupName, defs]) => {
            const collapsed = collapsedGroups[groupName] === true
            return (
              <section key={groupName} style={{
                borderRadius: 12, overflow: 'hidden',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.06)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)',
              }}>
                <button
                  onClick={() => setCollapsedGroups(prev => ({ ...prev, [groupName]: !collapsed }))}
                  style={{
                    width: '100%', padding: '10px 14px',
                    background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid var(--rd-line)',
                    display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: 12, fontWeight: 700, color: 'var(--rd-text)',
                    border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  }}
                >
                  {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  {groupName}
                  <span style={{ fontSize: 12, color: 'var(--rd-text-3)', fontWeight: 400, marginLeft: 4 }}>{defs.length} 项</span>
                </button>
                {!collapsed && (
                  <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {defs.map(def => (
                      <FieldEditor
                        key={def.key}
                        def={def}
                        cell={fields[def.key] || { value: null, confidence: null, sources: [] }}
                        onChange={patch => updateField(def.key, patch)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--rd-line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
          background: 'rgba(255,255,255,0.06)',
        }}>
          <div style={{ fontSize: 12, color: 'var(--rd-text-3)' }}>
            {requiredMissing.length > 0 ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#FBBF24' }}>
                <AlertCircle size={11} /> {requiredMissing.length} 项必填未完成
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#34D399' }}>
                <CheckCircle2 size={11} /> 必填项已就绪
              </span>
            )}
            {err && <span style={{ marginLeft: 10, color: '#F87171' }}>{err}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="rd-btn" style={{ padding: '6px 12px', fontSize: 12 }}>
              {saveMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
              保存草稿
            </button>
            <button onClick={handleSaveAndGenerate} disabled={saveMut.isPending} className="rd-btn rd-btn-primary" style={{ padding: '7px 14px', fontSize: 12 }}>
              <Sparkles size={11} /> 保存并生成
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ConfidenceDot({ c }: { c: BriefConfidence }) {
  const map: Record<string, { color: string; label: string }> = {
    high:   { color: '#10B981', label: '高置信' },
    medium: { color: '#F59E0B', label: '中置信' },
    low:    { color: '#9CA3AF', label: '低置信' },
  }
  const cfg = c ? map[c] : { color: '#E5E7EB', label: '无依据' }
  return <span title={cfg.label} style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block', background: cfg.color, boxShadow: `0 0 4px ${cfg.color}` }} />
}

function FieldEditor({ def, cell, onChange }: {
  def: BriefFieldDef; cell: BriefFieldCell; onChange: (patch: Partial<BriefFieldCell>) => void
}) {
  const isList = def.type === 'list'
  const isDate = def.type === 'date'
  const value = cell.value
  const isEmpty = value == null || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && value.length === 0)
  const requiredMissing = def.required && isEmpty
  const lowConfidence = cell.confidence === 'low' || (cell.confidence == null && !cell.edited_at)
  const sources = cell.sources || []
  const edited = !!cell.edited_at

  return (
    <div style={{
      borderRadius: 10,
      border: `1px solid ${requiredMissing ? 'rgba(245, 158, 11, .35)' : 'var(--rd-line)'}`,
      background: requiredMissing ? 'rgba(245, 158, 11, .06)' : lowConfidence && !edited ? 'rgba(0,0,0,0.25)' : 'transparent',
    }}>
      <div style={{
        padding: '7px 12px', borderBottom: '1px solid var(--rd-line)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
          <ConfidenceDot c={cell.confidence} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--rd-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{def.label}</span>
          {def.required && <span style={{ fontSize: 12, color: '#FBBF24' }}>*</span>}
          {edited && <span style={{ fontSize: 12, color: '#34D399', marginLeft: 3 }}>已编辑</span>}
        </div>
        {sources.length > 0 && (
          <details style={{ position: 'relative' }}>
            <summary style={{
              listStyle: 'none', cursor: 'pointer',
              fontSize: 12, color: 'var(--rd-text-3)',
              padding: '1px 6px', borderRadius: 4,
              border: '1px solid var(--rd-line)', background: '#fff',
            }}>{sources.length} 个来源</summary>
            <div style={{
              position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 10,
              width: 280, padding: 8,
              background: '#fff', border: '1px solid var(--rd-line)', borderRadius: 10,
              boxShadow: '0 8px 24px -8px rgba(0,0,0,0.40)',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              {sources.map((s, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--rd-text-2)' }}>
                  <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.25)', color: 'var(--rd-text-3)', fontSize: 12, marginRight: 4 }}>{s.type}</span>
                  <span style={{ fontWeight: 500 }}>{s.ref || '—'}</span>
                  {s.snippet && <p style={{ margin: '2px 0 0', color: 'var(--rd-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.snippet}</p>}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
      <div style={{ padding: '8px 12px' }}>
        {def.hint && <p style={{ fontSize: 12, color: 'var(--rd-text-3)', margin: '0 0 6px' }}>{def.hint}</p>}
        {isList ? (
          <ListEditor
            value={Array.isArray(value) ? value : (value ? [String(value)] : [])}
            onChange={v => onChange({ value: v })}
          />
        ) : isDate ? (
          <input
            type="date"
            value={typeof value === 'string' ? value : ''}
            onChange={e => onChange({ value: e.target.value || null })}
            className="rd-input"
            style={{ fontSize: 12, padding: '6px 10px' }}
          />
        ) : (
          <textarea
            value={typeof value === 'string' ? value : (value ? String(value) : '')}
            onChange={e => onChange({ value: e.target.value || null })}
            rows={3}
            className="rd-input"
            style={{ fontSize: 12, padding: '6px 10px', resize: 'vertical' }}
          />
        )}
      </div>
    </div>
  )
}

function ListEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const setAt = (i: number, v: string) => onChange(value.map((x, idx) => idx === i ? v : x))
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i))
  const add = () => onChange([...value, ''])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {value.length === 0 && <p style={{ fontSize: 12, color: 'var(--rd-text-3)', fontStyle: 'italic', margin: 0 }}>(空,点下面 + 添加)</p>}
      {value.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <textarea
            value={item}
            onChange={e => setAt(i, e.target.value)}
            rows={1}
            className="rd-input"
            style={{ flex: 1, fontSize: 12, padding: '4px 8px', resize: 'vertical' }}
          />
          <button onClick={() => remove(i)} className="rd-icon-btn" style={{ width: 24, height: 24, color: '#F87171' }} title="删除">
            <X size={11} />
          </button>
        </div>
      ))}
      <button onClick={add} style={{
        fontSize: 12, color: 'var(--rd-accent-2)', background: 'transparent',
        border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, fontFamily: 'inherit',
      }}>+ 添加一项</button>
    </div>
  )
}
