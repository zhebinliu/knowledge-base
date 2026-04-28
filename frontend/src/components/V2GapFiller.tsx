/**
 * V2GapFiller — 信息不足时,让用户在前端补全 ask_user_prompts 的问卷面板。
 *
 * 触发时机:bundle.agentic_version='v2' && bundle.validity_status='invalid' &&
 *           bundle.short_circuited(Planner 拦截)。
 * 流程:
 *   1. 列出每道 ask_user 问题,按 module 分组
 *   2. 用户选/填答案
 *   3. 提交 → 拉当前 brief → 合并新答案 → putBrief → generateOutput → 触发父组件 refetch
 *
 * 没有 options 的题渲染开放文本;有 options 的渲染单/多选 chip + 「其他(自填)」兜底。
 */
import { useState, useMemo } from 'react'
import { ShieldAlert, Sparkles, Loader2, CheckCircle2, AlertCircle, Plus } from 'lucide-react'
import {
  type CuratedBundle, type V2GapPrompt, type BriefFieldCell, type OutputKind,
  getBrief, putBrief, generateOutput,
} from '../api/client'

interface Props {
  bundle: CuratedBundle
  kind: OutputKind
  projectId: string
  onSubmitted: () => void          // 父组件应 refetch outputs
}

type AnswerValue =
  | { kind: 'text'; value: string }                               // 单选 chip 选中 / 开放题
  | { kind: 'list'; value: string[]; freetext?: string }          // 多选 chip + 其他

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

export default function V2GapFiller({ bundle, kind, projectId, onSubmitted }: Props) {
  const prompts = bundle.ask_user_prompts || []
  // 按 module 分组
  const grouped = useMemo(() => {
    const m = new Map<string, { title: string; prompts: V2GapPrompt[] }>()
    for (const p of prompts) {
      const k = p.module_key
      if (!m.has(k)) m.set(k, { title: p.module_title || p.module_key, prompts: [] })
      m.get(k)!.prompts.push(p)
    }
    return Array.from(m.entries())
  }, [prompts])

  // 答案本地状态
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setAnswer = (fieldKey: string, val: AnswerValue) => {
    setAnswers(a => ({ ...a, [fieldKey]: val }))
  }

  // 必填项是否都答完
  const requiredKeys = prompts.filter(p => p.required).map(p => p.field_key)
  const isAnswered = (fk: string) => {
    const a = answers[fk]
    if (!a) return false
    if (a.kind === 'text') return !!a.value.trim()
    if (a.kind === 'list') return a.value.length > 0 || !!a.freetext?.trim()
    return false
  }
  const requiredFilled = requiredKeys.filter(isAnswered).length
  const canSubmit = requiredKeys.every(isAnswered) && !submitting

  // 序列化 answer → BriefFieldCell value
  const valueOf = (a: AnswerValue): string | string[] | null => {
    if (a.kind === 'text') return a.value.trim() || null
    if (a.kind === 'list') {
      const items = [...a.value]
      if (a.freetext?.trim()) items.push(a.freetext.trim())
      return items.length ? items : null
    }
    return null
  }

  const onSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      // 1. 拉当前 brief(可能不存在)
      let existing: Record<string, BriefFieldCell> = {}
      try {
        const brief = await getBrief(kind, projectId)
        existing = brief.fields || {}
      } catch {
        existing = {}
      }
      // 2. 合并新答案
      const now = new Date().toISOString()
      const merged: Record<string, BriefFieldCell> = { ...existing }
      for (const [fk, ans] of Object.entries(answers)) {
        const v = valueOf(ans)
        if (v === null) continue
        merged[fk] = {
          value: v,
          confidence: 'high',         // 用户亲填的算 high
          sources: [{ type: 'user_input', ref: 'gap_filler', snippet: '前端补全' }],
          edited_at: now,
        }
      }
      // 3. putBrief
      await putBrief(kind, projectId, merged)
      // 4. 触发新一轮 generate
      await generateOutput({ kind, project_id: projectId })
      // 5. 通知父组件 refetch — 父组件拿到 inflight bundle 后会卸载本组件
      onSubmitted()
      // 6. 兜底:即便父组件没卸载,也归位 submitting + 清空 answers,避免按钮卡住
      setSubmitting(false)
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || '提交失败')
      setSubmitting(false)
    }
  }

  if (prompts.length === 0) {
    return (
      <div className="m-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
        <AlertCircle size={14} className="inline mr-1" />
        系统标本次为信息不足,但没产出可作答问题清单。请检查访谈记录或联系管理员。
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-canvas">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5">
        {/* 头部 */}
        <div className="mb-5 p-4 bg-red-50 border-l-4 border-red-400 rounded-r-lg">
          <div className="flex items-start gap-2">
            <ShieldAlert size={16} className="text-red-700 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-red-700">
                关键信息不足 · 本次未生成报告
              </div>
              <div className="mt-1 text-xs text-ink-secondary leading-relaxed">
                系统检测到关键模块缺少必要信息,直接拦截了生成 — 避免输出无依据的洞察 / 浪费算力。
                请在下方逐题作答,有选项的优先选,选不对就用「其他」自填。提交后会自动用你的答案
                更新项目要点并重新生成。
              </div>
            </div>
          </div>
        </div>

        {/* 进度 */}
        <div className="mb-5 flex items-center gap-3 px-4 py-2.5 bg-white border border-line rounded-lg">
          <div className="flex-1">
            <div className="text-xs text-ink-secondary">
              <strong className="text-ink">{requiredFilled}</strong> / {requiredKeys.length} 必答项已完成
              {prompts.length > requiredKeys.length && (
                <span className="text-ink-muted">(共 {prompts.length} 题,{prompts.length - requiredKeys.length} 选答)</span>
              )}
            </div>
            <div className="mt-1 h-1 bg-slate-100 rounded overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: requiredKeys.length ? `${(requiredFilled / requiredKeys.length) * 100}%` : '0%' }}
              />
            </div>
          </div>
        </div>

        {/* 分组问题 */}
        <div className="space-y-5">
          {grouped.map(([moduleKey, { title, prompts: ps }]) => (
            <div key={moduleKey} className="bg-white border border-line rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-line flex items-center gap-2">
                <span className="text-[10px] font-bold text-ink-muted tabular-nums">
                  {moduleKey.split('_')[0]}
                </span>
                <span className="text-sm font-semibold text-ink">{title}</span>
                <span className="ml-auto text-[11px] text-ink-muted">{ps.length} 题</span>
              </div>
              <div className="divide-y divide-line">
                {ps.map(p => (
                  <QuestionItem
                    key={p.field_key}
                    prompt={p}
                    answer={answers[p.field_key]}
                    onChange={v => setAnswer(p.field_key, v)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 底部提交 */}
        <div className="mt-6 flex items-center gap-3 sticky bottom-0 bg-canvas pt-4 pb-2">
          {error && (
            <span className="text-xs text-red-700">{error}</span>
          )}
          <span className="text-[11px] text-ink-muted ml-auto">
            提交会保存到项目要点并触发新一轮生成
          </span>
          <button
            onClick={onSubmit}
            disabled={!canSubmit}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: BRAND_GRAD }}
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {submitting ? '提交中…' : '提交并重新生成'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 单道题 ────────────────────────────────────────────────────────────────────

function QuestionItem({
  prompt, answer, onChange,
}: {
  prompt: V2GapPrompt
  answer: AnswerValue | undefined
  onChange: (a: AnswerValue) => void
}) {
  const isMulti = prompt.multi
  const hasOptions = prompt.options && prompt.options.length > 0

  // 默认 answer state
  const ans: AnswerValue = answer || (isMulti ? { kind: 'list', value: [] } : { kind: 'text', value: '' })

  // 单选(text)— 点选项即设值,「其他」打开输入框
  const [showFreeText, setShowFreeText] = useState(false)
  const isCustom = ans.kind === 'text' && ans.value !== '' && hasOptions && !prompt.options.includes(ans.value)

  return (
    <div className="px-4 py-3.5">
      <div className="flex items-baseline gap-1.5 mb-2">
        <span className="text-sm font-medium text-ink">{prompt.field_label || prompt.field_key}</span>
        {prompt.required && <span className="text-[10px] text-red-600 font-semibold">必答</span>}
      </div>
      <div className="text-xs text-ink-secondary mb-2.5">{prompt.question}</div>

      {/* 有选项 — 渲染 chip */}
      {hasOptions && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {prompt.options.map(opt => {
            const selected = isMulti
              ? (ans.kind === 'list' && ans.value.includes(opt))
              : (ans.kind === 'text' && ans.value === opt)
            return (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  if (isMulti && ans.kind === 'list') {
                    const next = selected ? ans.value.filter(x => x !== opt) : [...ans.value, opt]
                    onChange({ kind: 'list', value: next, freetext: ans.freetext })
                  } else {
                    onChange({ kind: 'text', value: opt })
                    setShowFreeText(false)
                  }
                }}
                className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                  selected
                    ? 'border-[#D96400] bg-orange-50 text-[#D96400] font-semibold'
                    : 'border-line text-ink-secondary hover:bg-canvas hover:border-slate-300'
                }`}
              >
                {selected && <CheckCircle2 size={10} className="inline mr-1" />}
                {opt}
              </button>
            )
          })}
          {/* 其他兜底 */}
          {!isMulti && (
            <button
              type="button"
              onClick={() => {
                setShowFreeText(true)
                if (!isCustom) onChange({ kind: 'text', value: '' })
              }}
              className={`px-2.5 py-1 text-xs rounded-md border ${
                isCustom || showFreeText
                  ? 'border-orange-300 bg-orange-50/50 text-[#D96400]'
                  : 'border-dashed border-line text-ink-muted hover:text-ink hover:border-slate-300'
              }`}
            >
              <Plus size={10} className="inline mr-0.5" /> 其他(自填)
            </button>
          )}
        </div>
      )}

      {/* 自填输入框:无 options / multi+其他 / 单选选了「其他」 */}
      {!hasOptions && (
        prompt.field_type === 'list' || isMulti ? (
          <textarea
            className="w-full px-3 py-2 text-sm border border-line rounded-md focus:outline-none focus:border-[#D96400]"
            rows={3}
            placeholder="每行一条;或用顿号、分号分隔"
            value={ans.kind === 'list' ? (ans.freetext || '') : (ans.kind === 'text' ? ans.value : '')}
            onChange={e => {
              if (isMulti && ans.kind === 'list') {
                onChange({ kind: 'list', value: ans.value, freetext: e.target.value })
              } else {
                // 把 textarea 拆分成 list
                const lines = e.target.value.split(/[\n、;;]/).map(s => s.trim()).filter(Boolean)
                onChange({ kind: 'list', value: lines })
              }
            }}
          />
        ) : (
          <textarea
            className="w-full px-3 py-2 text-sm border border-line rounded-md focus:outline-none focus:border-[#D96400]"
            rows={2}
            placeholder="请直接填写"
            value={ans.kind === 'text' ? ans.value : ''}
            onChange={e => onChange({ kind: 'text', value: e.target.value })}
          />
        )
      )}

      {/* 单选模式下,「其他」打开的输入框 */}
      {hasOptions && !isMulti && (showFreeText || isCustom) && (
        <input
          type="text"
          className="w-full px-3 py-1.5 text-sm border border-line rounded-md focus:outline-none focus:border-[#D96400] mt-1"
          placeholder="自填具体内容"
          value={isCustom ? (ans.kind === 'text' ? ans.value : '') : ''}
          onChange={e => onChange({ kind: 'text', value: e.target.value })}
        />
      )}

      {/* 多选模式下,additional「其他」自填 */}
      {hasOptions && isMulti && (
        <input
          type="text"
          className="w-full px-3 py-1.5 text-sm border border-line rounded-md focus:outline-none focus:border-[#D96400] mt-1"
          placeholder="补充其他选项(可选,逗号/分号/换行 分隔多条)"
          value={ans.kind === 'list' ? (ans.freetext || '') : ''}
          onChange={e => {
            if (ans.kind === 'list') {
              onChange({ kind: 'list', value: ans.value, freetext: e.target.value })
            }
          }}
        />
      )}
    </div>
  )
}
