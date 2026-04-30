/**
 * 调研问卷录入界面(MVP)
 *
 * 顾问拿着大纲口头问客户 → 在系统勾选答案 → 自动保存
 * 当前 MVP 支持题型:single / multi / text / rating(简版)
 * 不支持:number / node_pick(下期)
 *
 * 答案持久化:每改一次 → upsertResearchResponse(debounce 600ms)
 * Scope 标签:每题右下角 ScopeBadgeEditor 可点击切换四分类
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Tag, Save } from 'lucide-react'
import {
  listResearchResponses, upsertResearchResponse, classifyResearchScope,
  type CuratedBundle, type ResearchQuestionItem,
  type ResearchResponseItem, type ResearchScopeLabel,
} from '../../../api/client'

interface Props {
  bundle: CuratedBundle
  selectedLtcKey: string | null
}

export default function ResearchQuestionnaire({ bundle, selectedLtcKey }: Props) {
  const allItems: ResearchQuestionItem[] = useMemo(
    () => (bundle.questionnaire_items as ResearchQuestionItem[]) ?? [],
    [bundle.questionnaire_items]
  )

  const items = useMemo(() => {
    if (!selectedLtcKey) return allItems
    return allItems.filter(it => it.ltc_module_key === selectedLtcKey)
  }, [allItems, selectedLtcKey])

  const qc = useQueryClient()
  const { data: responses } = useQuery({
    queryKey: ['research-responses', bundle.id],
    queryFn: () => listResearchResponses(bundle.id),
    enabled: !!bundle.id,
  })

  // item_key → response 索引
  const responseByKey = useMemo(() => {
    const m: Record<string, ResearchResponseItem> = {}
    for (const r of (responses?.items ?? [])) m[r.item_key] = r
    return m
  }, [responses])

  const classifyMut = useMutation({
    mutationFn: () => classifyResearchScope({
      bundle_id: bundle.id,
      ltc_module_key: selectedLtcKey,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['research-responses', bundle.id] }),
  })

  if (allItems.length === 0) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="rounded border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
          ⚠️ 当前 bundle 没有结构化题目数据(<code>extra.questionnaire_items</code> 为空)。
          可能 LLM 输出格式异常,建议重新生成。
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="text-sm text-ink-muted text-center py-12">
          当前 LTC 模块下没有匹配的题目。试试切换左栏其他模块,或选「全部模块」。
        </div>
      </div>
    )
  }

  const answeredN = items.filter(it => responseByKey[it.item_key]?.answer_value != null).length

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-3">
      {/* 工具栏 */}
      <div className="flex items-center gap-3 sticky top-0 bg-white z-10 py-2 -mt-2 border-b border-line">
        <div className="text-sm font-semibold text-ink">
          调研问卷 · {selectedLtcKey ?? '全部'}
        </div>
        <div className="text-xs text-ink-muted">
          已答 {answeredN} / {items.length}
        </div>
        <div className="flex-1" />
        <button
          disabled={answeredN === 0 || classifyMut.isPending}
          onClick={() => classifyMut.mutate()}
          className="text-xs px-2.5 py-1 rounded border border-line text-ink-secondary hover:bg-slate-50 disabled:opacity-50"
          title="基于已答内容,LLM 自动给每题打范围四分类(顾问可手改)"
        >
          {classifyMut.isPending ? 'AI 分类中...' : '触发 AI 范围分类'}
        </button>
      </div>

      {classifyMut.isError && (
        <div className="text-xs text-red-600">分类失败:{(classifyMut.error as any)?.message}</div>
      )}
      {classifyMut.isSuccess && classifyMut.data && (
        <div className="text-xs text-emerald-700">
          AI 已给 {classifyMut.data.items.length} 题打标(跳过 {classifyMut.data.skipped} 题未答)
        </div>
      )}

      {/* 题目列表 */}
      <div className="space-y-3">
        {items.map((it, idx) => (
          <QuestionRow
            key={it.item_key}
            item={it}
            index={idx + 1}
            response={responseByKey[it.item_key]}
            bundle={bundle}
          />
        ))}
      </div>
    </div>
  )
}

// ── 单题渲染 ─────────────────────────────────────────────────────────────────

function QuestionRow({
  item, index, response, bundle,
}: {
  item: ResearchQuestionItem
  index: number
  response: ResearchResponseItem | undefined
  bundle: CuratedBundle
}) {
  const qc = useQueryClient()
  const upsert = useMutation({
    mutationFn: (body: Parameters<typeof upsertResearchResponse>[0]) => upsertResearchResponse(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['research-responses', bundle.id] }),
  })

  const save = (answer_value: any, scope_label?: ResearchScopeLabel | null) => {
    upsert.mutate({
      bundle_id: bundle.id,
      project_id: bundle.project_id ?? null,
      item_key: item.item_key,
      answer_value,
      ...(scope_label !== undefined ? { scope_label, scope_label_source: 'manual' } : {}),
    })
  }

  return (
    <div className="rounded-lg border border-line bg-white p-3.5 space-y-2.5">
      {/* 题干 */}
      <div className="flex items-start gap-2">
        <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-[10px] bg-slate-100 text-ink-muted">
          {index}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-ink leading-relaxed">
            {item.question}
            {item.required && <span className="text-red-500 ml-1">*</span>}
          </div>
          {item.why && (
            <div className="text-[11px] text-ink-muted mt-0.5">为什么问:{item.why}</div>
          )}
          {item.hint && (
            <div className="text-[11px] text-orange-600 mt-0.5">{item.hint}</div>
          )}
        </div>
        <span className="shrink-0 text-[10px] text-ink-muted bg-slate-50 px-1.5 py-0.5 rounded">
          {item.type}
        </span>
      </div>

      {/* 输入控件(按 type 分发) */}
      <div className="pl-7">
        {item.type === 'single' && (
          <SingleInput item={item} value={response?.answer_value} onChange={save} />
        )}
        {item.type === 'multi' && (
          <MultiInput item={item} value={response?.answer_value} onChange={save} />
        )}
        {item.type === 'text' && (
          <TextInput value={response?.answer_value || ''} onSave={save} />
        )}
        {item.type === 'rating' && (
          <RatingInput item={item} value={response?.answer_value} onChange={save} />
        )}
        {item.type === 'number' && (
          <TextInput
            value={response?.answer_value != null ? String(response.answer_value) : ''}
            onSave={(v) => save(v ? Number(v) : null)}
            placeholder={item.number_unit ? `数值(${item.number_unit})` : '数值'}
          />
        )}
        {item.type === 'node_pick' && (
          <MultiInput item={item} value={response?.answer_value} onChange={save} />
        )}
      </div>

      {/* 底部:scope badge */}
      <div className="pl-7 pt-1 border-t border-slate-100 flex items-center gap-2">
        <ScopeBadgeEditor
          value={response?.scope_label ?? null}
          source={response?.scope_label_source ?? null}
          disabled={response?.answer_value == null}
          onChange={(v) => save(response?.answer_value ?? null, v)}
        />
        {upsert.isPending && (
          <span className="text-[10px] text-ink-muted">保存中…</span>
        )}
        {upsert.isSuccess && !upsert.isPending && (
          <span className="text-[10px] text-emerald-600">已保存</span>
        )}
      </div>
    </div>
  )
}

// ── 各题型输入控件 ────────────────────────────────────────────────────────────

function SingleInput({
  item, value, onChange,
}: {
  item: ResearchQuestionItem
  value: any
  onChange: (v: any) => void
}) {
  const isOther = typeof value === 'string' && value.startsWith('__other__:')
  const otherText = isOther ? (value as string).slice('__other__:'.length) : ''
  const [otherDraft, setOtherDraft] = useState(otherText)
  useEffect(() => { setOtherDraft(otherText) }, [otherText])

  return (
    <div className="space-y-1">
      {item.options.map(opt => {
        const isSelected = opt.is_other ? isOther : value === opt.value
        return (
          <label key={opt.value}
                 className={`flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer ${
                   isSelected ? 'bg-orange-50 ring-1 ring-orange-200' : 'hover:bg-slate-50'
                 }`}>
            <input
              type="radio"
              checked={isSelected}
              onChange={() => onChange(opt.is_other ? '__other__:' : opt.value)}
              className="accent-orange-500"
            />
            <span>{opt.label}</span>
          </label>
        )
      })}
      {isOther && (
        <input
          type="text"
          value={otherDraft}
          onChange={e => setOtherDraft(e.target.value)}
          onBlur={() => onChange(`__other__:${otherDraft}`)}
          placeholder="请说明..."
          className="ml-6 w-[calc(100%-1.5rem)] mt-1 px-2 py-1 text-xs border border-line rounded focus:border-orange-300 outline-none"
        />
      )}
    </div>
  )
}

function MultiInput({
  item, value, onChange,
}: {
  item: ResearchQuestionItem
  value: any
  onChange: (v: any) => void
}) {
  const arr: string[] = Array.isArray(value) ? value : []
  const toggle = (v: string) => {
    const has = arr.includes(v)
    const next = has ? arr.filter(x => x !== v) : [...arr, v]
    onChange(next)
  }
  return (
    <div className="space-y-1">
      {item.options.map(opt => {
        const isSelected = arr.includes(opt.value)
        return (
          <label key={opt.value}
                 className={`flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer ${
                   isSelected ? 'bg-orange-50 ring-1 ring-orange-200' : 'hover:bg-slate-50'
                 }`}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggle(opt.value)}
              className="accent-orange-500"
            />
            <span>{opt.label}</span>
          </label>
        )
      })}
    </div>
  )
}

function TextInput({
  value, onSave, placeholder,
}: {
  value: string
  onSave: (v: string) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  return (
    <textarea
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onSave(draft) }}
      rows={2}
      placeholder={placeholder ?? '顾问速记...'}
      className="w-full px-2 py-1.5 text-xs border border-line rounded focus:border-orange-300 outline-none resize-y"
    />
  )
}

function RatingInput({
  item, value, onChange,
}: {
  item: ResearchQuestionItem
  value: any
  onChange: (v: number) => void
}) {
  const max = item.rating_scale ?? 5
  const cur = typeof value === 'number' ? value : 0
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: max }).map((_, i) => {
        const n = i + 1
        return (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={`w-7 h-7 rounded text-xs ${
              n <= cur ? 'bg-orange-500 text-white' : 'bg-slate-100 text-ink-muted hover:bg-slate-200'
            }`}
          >{n}</button>
        )
      })}
      <span className="text-[11px] text-ink-muted ml-2">{cur || '—'} / {max}</span>
    </div>
  )
}

// ── ScopeBadgeEditor ────────────────────────────────────────────────────────

const SCOPE_LABELS: Record<ResearchScopeLabel, { label: string; color: string }> = {
  new:           { label: '需新建',         color: 'bg-blue-50 text-blue-700 ring-blue-200' },
  digitize:      { label: '已有线下,需数字化', color: 'bg-amber-50 text-amber-700 ring-amber-200' },
  migrate:       { label: '已有,需搬迁',     color: 'bg-purple-50 text-purple-700 ring-purple-200' },
  out_of_scope:  { label: '不纳入一期',       color: 'bg-slate-50 text-slate-600 ring-slate-200' },
}

function ScopeBadgeEditor({
  value, source, disabled, onChange,
}: {
  value: ResearchScopeLabel | null
  source: 'ai' | 'manual' | null
  disabled?: boolean
  onChange: (v: ResearchScopeLabel | null) => void
}) {
  const [open, setOpen] = useState(false)

  if (!value) {
    return (
      <button
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        className="text-[10px] px-1.5 py-0.5 rounded border border-dashed border-slate-300 text-ink-muted hover:bg-slate-50 disabled:opacity-50 relative"
        title={disabled ? '请先答题' : '设置范围分类'}
      >
        <Tag size={9} className="inline mr-0.5" />
        待分类
        {open && <ScopeMenu onPick={v => { onChange(v); setOpen(false) }} onClose={() => setOpen(false)} />}
      </button>
    )
  }

  const meta = SCOPE_LABELS[value]
  return (
    <button
      onClick={() => setOpen(o => !o)}
      className={`text-[10px] px-1.5 py-0.5 rounded ring-1 relative ${meta.color}`}
      title={`点击修改 · 来源:${source === 'ai' ? 'AI 自动' : '顾问手改'}`}
    >
      <Tag size={9} className="inline mr-0.5" />
      {meta.label}
      <span className="opacity-50 ml-1">({source === 'ai' ? 'AI' : '手'})</span>
      {open && <ScopeMenu current={value} onPick={v => { onChange(v); setOpen(false) }} onClose={() => setOpen(false)} />}
    </button>
  )
}

function ScopeMenu({
  current, onPick, onClose,
}: {
  current?: ResearchScopeLabel
  onPick: (v: ResearchScopeLabel | null) => void
  onClose: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute z-50 left-0 top-full mt-1 bg-white border border-line rounded shadow-lg py-1 min-w-[160px]">
        {(Object.entries(SCOPE_LABELS) as [ResearchScopeLabel, typeof SCOPE_LABELS[ResearchScopeLabel]][])
          .map(([k, m]) => (
            <button
              key={k}
              onClick={(e) => { e.stopPropagation(); onPick(k) }}
              className={`w-full text-left px-2 py-1 text-[11px] hover:bg-slate-50 ${
                current === k ? 'font-semibold text-orange-700' : 'text-ink'
              }`}
            >
              {m.label}
            </button>
          ))}
        {current && (
          <>
            <div className="border-t border-line my-0.5" />
            <button
              onClick={(e) => { e.stopPropagation(); onPick(null) }}
              className="w-full text-left px-2 py-1 text-[11px] text-ink-muted hover:bg-slate-50"
            >
              清除分类
            </button>
          </>
        )}
      </div>
    </>
  )
}
