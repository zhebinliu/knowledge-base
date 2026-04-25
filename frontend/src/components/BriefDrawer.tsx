import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  X, Loader2, Wand2, Save, Sparkles, AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Info,
} from 'lucide-react'
import {
  getBrief, extractBrief, putBrief,
  type BriefFieldCell, type BriefFieldDef, type BriefDoc, type BriefConfidence,
} from '../api/client'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

interface Props {
  open: boolean
  kind: string
  projectId: string
  stageTitle: string
  onClose: () => void
  /** 用户点「保存并生成」时触发；父组件负责调 generate API */
  onGenerate: () => void
}

export default function BriefDrawer({ open, kind, projectId, stageTitle, onClose, onGenerate }: Props) {
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
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: Infinity,
  })

  // 仅在第一次拿到 briefData 时初始化；之后不让 GET 覆盖用户编辑或抽取结果
  const initedRef = useRef(false)
  useEffect(() => {
    if (briefData && !initedRef.current) {
      setFields(briefData.fields || {})
      setSchema(briefData.schema || [])
      initedRef.current = true
    }
  }, [briefData])

  const extractMut = useMutation({
    mutationFn: () => extractBrief(kind, projectId),
    onSuccess: (res: BriefDoc) => {
      setFields(res.fields || {})
      setSchema(res.schema || [])
      setExtracted(true)
    },
    onError: (e: any) => setErr(e?.response?.data?.detail || '抽取失败'),
  })

  const saveMut = useMutation({
    mutationFn: () => putBrief(kind, projectId, fields),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brief', kind, projectId] })
    },
    onError: (e: any) => setErr(e?.response?.data?.detail || '保存失败'),
  })

  // 进入时若 brief 不存在，自动跑一次 extract
  useEffect(() => {
    if (open && briefData && !briefData.exists && !extractMut.isPending && !extracted) {
      setExtracted(true)
      extractMut.mutate()
    }
  }, [open, briefData, extracted, extractMut])

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
      return {
        ...prev,
        [key]: {
          ...old,
          ...patch,
          edited_at: new Date().toISOString(),
        },
      }
    })
  }

  const requiredMissing = schema.filter(f => {
    if (!f.required) return false
    const v = fields[f.key]?.value
    return v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0)
  })

  const handleSaveAndGenerate = async () => {
    setErr('')
    try {
      await saveMut.mutateAsync()
      onGenerate()
      onClose()
    } catch {/* err state set in onError */}
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex justify-end" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full sm:w-[680px] bg-white h-full flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-line flex items-center justify-between flex-shrink-0">
          <div className="min-w-0 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: BRAND_GRAD }}>
              <Sparkles size={14} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink truncate">项目 Brief · {stageTitle}</p>
              <p className="text-[11px] text-ink-muted">先确认这一份，再生成交付物。系统已基于已有素材自动预填。</p>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink p-1 rounded hover:bg-canvas">
            <X size={16} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-5 py-2.5 bg-canvas border-b border-line flex items-center justify-between flex-shrink-0">
          <div className="text-[11px] text-ink-muted flex items-center gap-1.5">
            <Info size={11} />
            <span>
              字段右上角圆点表示置信度（绿=高 / 黄=中 / 灰=低）。空白和低置信项请确认或补全。
            </span>
          </div>
          <button
            onClick={() => extractMut.mutate()}
            disabled={extractMut.isPending}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-lg border border-orange-200 text-orange-700 hover:bg-orange-50 disabled:opacity-50"
            title="重新跑一次自动抽取（已编辑过的字段不会被覆盖）"
          >
            {extractMut.isPending ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
            {extractMut.isPending ? '抽取中…' : '重新抽取'}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 relative">
          {isLoading && schema.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-ink-muted py-12 justify-center">
              <Loader2 size={13} className="animate-spin" /> 加载 Brief…
            </div>
          )}

          {!isLoading && !extractMut.isPending && schema.length === 0 && (
            <div className="text-center py-12 text-xs text-ink-muted">该交付物没有 Brief 模板</div>
          )}

          {extractMut.isPending && (
            <div className="absolute inset-0 z-10 bg-white/75 backdrop-blur-[1px] flex items-center justify-center pointer-events-auto">
              <div className="flex flex-col items-center gap-3 px-8 py-6 rounded-2xl bg-white border border-orange-200 shadow-lg max-w-sm">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white" style={{ background: BRAND_GRAD }}>
                  <Loader2 size={20} className="animate-spin" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-ink">AI 正在思考中…</p>
                  <p className="text-[11px] text-ink-muted mt-1 leading-relaxed">
                    从项目元数据 / 关联文档 / 知识库中抽取字段
                    <br />通常需要 30–90 秒
                  </p>
                </div>
              </div>
            </div>
          )}

          {schema.length > 0 && groups.map(([groupName, defs]) => {
            const collapsed = collapsedGroups[groupName] === true
            return (
              <section key={groupName} className="border border-line rounded-xl overflow-hidden">
                <button
                  onClick={() => setCollapsedGroups(prev => ({ ...prev, [groupName]: !collapsed }))}
                  className="w-full px-4 py-2.5 bg-canvas border-b border-line flex items-center gap-1.5 text-xs font-semibold text-ink"
                >
                  {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  {groupName}
                  <span className="text-[10px] text-ink-muted font-normal ml-1">{defs.length} 项</span>
                </button>
                {!collapsed && (
                  <div className="p-4 space-y-4">
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
        <div className="border-t border-line px-5 py-3 flex items-center justify-between flex-shrink-0 bg-white">
          <div className="text-[11px] text-ink-muted">
            {requiredMissing.length > 0 ? (
              <span className="text-amber-700 flex items-center gap-1">
                <AlertCircle size={11} /> {requiredMissing.length} 项必填未完成
              </span>
            ) : (
              <span className="text-emerald-700 flex items-center gap-1">
                <CheckCircle2 size={11} /> 必填项已就绪
              </span>
            )}
            {err && <span className="ml-3 text-red-600">{err}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-line text-ink-secondary hover:bg-canvas disabled:opacity-50"
            >
              {saveMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
              保存草稿
            </button>
            <button
              onClick={handleSaveAndGenerate}
              disabled={saveMut.isPending}
              className="flex items-center gap-1 px-3.5 py-1.5 text-xs font-semibold text-white rounded-lg shadow-sm disabled:opacity-50"
              style={{ background: BRAND_GRAD }}
            >
              <Sparkles size={11} /> 保存并生成
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────

function ConfidenceDot({ c }: { c: BriefConfidence }) {
  const map: Record<string, { color: string; label: string }> = {
    high: { color: '#10B981', label: '高置信' },
    medium: { color: '#F59E0B', label: '中置信' },
    low: { color: '#9CA3AF', label: '低置信' },
  }
  const cfg = c ? map[c] : { color: '#E5E7EB', label: '无依据' }
  return (
    <span
      className="w-2 h-2 rounded-full inline-block"
      title={cfg.label}
      style={{ background: cfg.color }}
    />
  )
}

function FieldEditor({ def, cell, onChange }: {
  def: BriefFieldDef
  cell: BriefFieldCell
  onChange: (patch: Partial<BriefFieldCell>) => void
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
    <div className={`rounded-lg border ${requiredMissing ? 'border-amber-300 bg-amber-50/40' : lowConfidence && !edited ? 'border-line bg-canvas/40' : 'border-line'}`}>
      <div className="px-3 py-2 flex items-center justify-between gap-2 border-b border-line">
        <div className="flex items-center gap-1.5 min-w-0">
          <ConfidenceDot c={cell.confidence} />
          <span className="text-[12px] font-semibold text-ink truncate">{def.label}</span>
          {def.required && <span className="text-[10px] text-amber-700">*</span>}
          {edited && <span className="text-[10px] text-emerald-700 ml-1">已编辑</span>}
        </div>
        {sources.length > 0 && (
          <details className="relative">
            <summary className="list-none cursor-pointer text-[10px] text-ink-muted hover:text-ink px-1.5 py-0.5 rounded border border-line bg-white">
              {sources.length} 个来源
            </summary>
            <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-line rounded-lg shadow-lg z-10 p-2 space-y-1.5">
              {sources.map((s, i) => (
                <div key={i} className="text-[11px] text-ink-secondary">
                  <span className="inline-block px-1.5 py-0.5 rounded bg-canvas text-ink-muted text-[10px] mr-1">{s.type}</span>
                  <span className="font-medium">{s.ref || '—'}</span>
                  {s.snippet && <p className="mt-0.5 text-ink-muted truncate">{s.snippet}</p>}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
      <div className="px-3 py-2">
        {def.hint && <p className="text-[10.5px] text-ink-muted mb-1.5">{def.hint}</p>}
        {isList ? (
          <ListEditor
            value={Array.isArray(value) ? value : (value ? [String(value)] : [])}
            onChange={(v) => onChange({ value: v })}
          />
        ) : isDate ? (
          <input
            type="date"
            value={typeof value === 'string' ? value : ''}
            onChange={e => onChange({ value: e.target.value || null })}
            className="w-full border border-line rounded-lg px-2.5 py-1.5 text-xs"
          />
        ) : (
          <textarea
            value={typeof value === 'string' ? value : (value ? String(value) : '')}
            onChange={e => onChange({ value: e.target.value || null })}
            rows={3}
            className="w-full border border-line rounded-lg px-2.5 py-1.5 text-xs resize-y focus:outline-none focus:ring-1 focus:ring-orange-300"
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
    <div className="space-y-1.5">
      {value.length === 0 && (
        <p className="text-[11px] text-ink-muted italic">（空，点下面 + 添加）</p>
      )}
      {value.map((item, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <textarea
            value={item}
            onChange={e => setAt(i, e.target.value)}
            rows={1}
            className="flex-1 border border-line rounded-lg px-2 py-1 text-xs resize-y focus:outline-none focus:ring-1 focus:ring-orange-300"
          />
          <button
            onClick={() => remove(i)}
            className="text-ink-muted hover:text-red-600 p-1 rounded hover:bg-canvas"
            title="删除"
          >
            <X size={11} />
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="text-[11px] text-orange-700 hover:underline"
      >
        + 添加一项
      </button>
    </div>
  )
}
