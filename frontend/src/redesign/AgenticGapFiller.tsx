/**
 * NewAgenticGapFiller — 信息不足时的问卷面板(Liquid Glass)
 * 功能 100% 等价 — 单选/多选 chip + 其他兜底 + 跳过问卷直接重生成 + Web suggest
 */
import { useState, useMemo } from 'react'
import {
  ShieldAlert, Sparkles, Loader2, CheckCircle2, AlertCircle, Plus,
  Globe, ExternalLink, X,
} from 'lucide-react'
import {
  type CuratedBundle, type AgenticGapPrompt, type BriefFieldCell, type OutputKind,
  type WebSuggestCandidate,
  getBrief, putBrief, generateOutput, webSuggest,
} from '../api/client'

interface Props {
  bundle: CuratedBundle
  kind: OutputKind
  projectId: string
  onSubmitted: () => void
}

type AnswerValue =
  | { kind: 'text'; value: string }
  | { kind: 'list'; value: string[]; freetext?: string }

export default function NewAgenticGapFiller({ bundle, kind, projectId, onSubmitted }: Props) {
  const prompts = bundle.ask_user_prompts || []
  const grouped = useMemo(() => {
    const m = new Map<string, { title: string; prompts: AgenticGapPrompt[] }>()
    for (const p of prompts) {
      const k = p.module_key
      if (!m.has(k)) m.set(k, { title: p.module_title || p.module_key, prompts: [] })
      m.get(k)!.prompts.push(p)
    }
    return Array.from(m.entries())
  }, [prompts])

  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setAnswer = (fieldKey: string, val: AnswerValue) => setAnswers(a => ({ ...a, [fieldKey]: val }))

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
    setSubmitting(true); setError(null)
    try {
      let existing: Record<string, BriefFieldCell> = {}
      try { const brief = await getBrief(kind, projectId); existing = brief.fields || {} } catch { existing = {} }
      const now = new Date().toISOString()
      const merged: Record<string, BriefFieldCell> = { ...existing }
      for (const [fk, ans] of Object.entries(answers)) {
        const v = valueOf(ans)
        if (v === null) continue
        merged[fk] = {
          value: v, confidence: 'high',
          sources: [{ type: 'user_input', ref: 'gap_filler', snippet: '前端补全' }],
          edited_at: now,
        }
      }
      await putBrief(kind, projectId, merged)
      await generateOutput({ kind, project_id: projectId })
      onSubmitted()
      setSubmitting(false)
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || '提交失败')
      setSubmitting(false)
    }
  }

  if (prompts.length === 0) {
    return (
      <div style={{
        margin: 16, padding: 16, borderRadius: 12,
        background: 'rgba(245, 158, 11, .08)',
        border: '1px solid rgba(245, 158, 11, .28)',
        color: '#92400E', fontSize: 13,
      }}>
        <AlertCircle size={14} style={{ display: 'inline', marginRight: 4 }} />
        系统标本次为信息不足,但没产出可作答问题清单。请检查访谈记录或联系管理员。
      </div>
    )
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px 24px' }}>
        {/* 头部警示 */}
        <div style={{
          marginBottom: 20, padding: 14, borderRadius: 12,
          background: 'rgba(220, 38, 38, .07)',
          borderLeft: '4px solid #DC2626',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <ShieldAlert size={15} color="#B91C1C" style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#B91C1C' }}>关键信息不足 · 本次未生成报告</div>
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--rd-text-2)', lineHeight: 1.6 }}>
                系统检测到关键模块缺少必要信息,直接拦截了生成 — 避免输出无依据的洞察 / 浪费算力。
                请在下方逐题作答,有选项的优先选,选不对就用「其他」自填。提交后会自动用你的答案更新项目要点并重新生成。
              </div>
            </div>
          </div>
          <div style={{
            marginTop: 12, paddingTop: 12,
            borderTop: '1px solid rgba(220, 38, 38, .2)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 12, color: 'var(--rd-text-2)', flex: 1 }}>
              已经上传足够文档?可以跳过问卷,直接重新生成 — planner 现在会从文档抽信息。
            </span>
            <button
              onClick={async () => {
                if (!confirm('跳过问卷,直接用已上传文档重新生成洞察?')) return
                setSubmitting(true); setError(null)
                try { await generateOutput({ kind, project_id: projectId }); onSubmitted() }
                catch (e: any) { setError(e?.response?.data?.detail || e?.message || '触发失败'); setSubmitting(false) }
              }}
              disabled={submitting}
              className="rd-btn"
              style={{ fontSize: 12, padding: '5px 12px', color: 'var(--rd-accent-2)', borderColor: 'rgba(255, 141, 26, .4)' }}
            >
              ⚡ 跳过 → 直接重新生成
            </button>
          </div>
        </div>

        {/* 进度 */}
        <div style={{
          marginBottom: 20, padding: '10px 16px', borderRadius: 10,
          background: 'rgba(255,255,255,0.55)',
          border: '1px solid var(--rd-line)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--rd-text-2)' }}>
              <strong style={{ color: 'var(--rd-text)' }}>{requiredFilled}</strong> / {requiredKeys.length} 必答项已完成
              {prompts.length > requiredKeys.length && (
                <span style={{ color: 'var(--rd-text-3)' }}>(共 {prompts.length} 题,{prompts.length - requiredKeys.length} 选答)</span>
              )}
            </div>
            <div style={{ marginTop: 4, height: 4, background: 'rgba(15, 18, 36, .06)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: requiredKeys.length ? `${(requiredFilled / requiredKeys.length) * 100}%` : '0%',
                background: 'linear-gradient(90deg, #10B981, #059669)',
                boxShadow: '0 0 6px rgba(5, 150, 105, .55)',
                transition: 'width .3s',
              }} />
            </div>
          </div>
        </div>

        {/* 分组问题 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {grouped.map(([moduleKey, { title, prompts: ps }]) => (
            <div key={moduleKey} style={{
              borderRadius: 12, overflow: 'hidden',
              background: 'rgba(255,255,255,0.55)',
              border: '1px solid rgba(255,255,255,0.55)',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, .75), 0 1px 3px rgba(15, 18, 36, .04)',
            }}>
              <div style={{
                padding: '10px 16px',
                background: 'rgba(15, 18, 36, .03)',
                borderBottom: '1px solid var(--rd-line)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span className="rd-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--rd-text-3)' }}>{moduleKey.split('_')[0]}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--rd-text)' }}>{title}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--rd-text-3)' }}>{ps.length} 题</span>
              </div>
              <div>
                {ps.map((p, idx) => (
                  <div key={p.field_key} style={{ borderTop: idx > 0 ? '1px solid var(--rd-line)' : 'none' }}>
                    <QuestionItem
                      prompt={p}
                      answer={answers[p.field_key]}
                      onChange={v => setAnswer(p.field_key, v)}
                      projectId={projectId}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 底部提交 */}
        <div style={{
          marginTop: 24, paddingTop: 16,
          position: 'sticky', bottom: 0,
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'linear-gradient(to top, var(--rd-bg) 50%, transparent)',
        }}>
          {error && <span style={{ fontSize: 12, color: '#B91C1C' }}>{error}</span>}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--rd-text-3)' }}>提交会保存到项目要点并触发新一轮生成</span>
          <button
            onClick={onSubmit}
            disabled={!canSubmit}
            className="rd-btn rd-btn-primary"
            style={{ padding: '8px 18px', fontSize: 13 }}
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {submitting ? '提交中…' : '提交并重新生成'}
          </button>
        </div>
      </div>
    </div>
  )
}

function QuestionItem({ prompt, answer, onChange, projectId }: {
  prompt: AgenticGapPrompt
  answer: AnswerValue | undefined
  onChange: (a: AnswerValue) => void
  projectId: string
}) {
  const isMulti = prompt.multi
  const hasOptions = prompt.options && prompt.options.length > 0
  const ans: AnswerValue = answer || (isMulti ? { kind: 'list', value: [] } : { kind: 'text', value: '' })

  const [showFreeText, setShowFreeText] = useState(false)
  const isCustom = ans.kind === 'text' && ans.value !== '' && hasOptions && !prompt.options.includes(ans.value)

  const [webOpen, setWebOpen] = useState(false)
  const [webLoading, setWebLoading] = useState(false)
  const [webError, setWebError] = useState<string | null>(null)
  const [webCandidates, setWebCandidates] = useState<WebSuggestCandidate[] | null>(null)

  const onTryWeb = async () => {
    setWebOpen(true); setWebLoading(true); setWebError(null); setWebCandidates(null)
    try {
      const res = await webSuggest({
        project_id: projectId, field_key: prompt.field_key,
        field_label: prompt.field_label, question: prompt.question, field_type: prompt.field_type,
      })
      setWebCandidates(res.candidates || [])
    } catch (e: any) {
      const status = e?.response?.status
      const msg = e?.response?.data?.detail || e?.message || '获取失败'
      setWebError(status === 503 ? '管理员未配置 Web 搜索 API key,联系管理员开启' : msg)
    } finally { setWebLoading(false) }
  }

  const adoptCandidate = (c: WebSuggestCandidate) => {
    if (isMulti && ans.kind === 'list') {
      onChange({ kind: 'list', value: [...ans.value, c.text], freetext: ans.freetext })
    } else {
      onChange({ kind: 'text', value: c.text })
    }
    setWebOpen(false)
  }

  const textareaStyle: React.CSSProperties = { fontSize: 13, padding: '8px 12px', resize: 'vertical' }
  const inputStyle: React.CSSProperties = { fontSize: 13, padding: '6px 12px' }

  return (
    <div style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 6 }}>
        <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--rd-text)' }}>{prompt.field_label || prompt.field_key}</span>
        {prompt.required && <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>必答</span>}
        <button
          type="button"
          onClick={onTryWeb}
          style={{
            marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '2px 8px', borderRadius: 4,
            fontSize: 12, color: '#7C3AED',
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', transition: 'background .15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(124, 58, 237, .08)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          title="试试从公开互联网抓取候选答案"
        >
          <Globe size={10} /> 试试网络获取
        </button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--rd-text-2)', marginBottom: 10 }}>{prompt.question}</div>

      {webOpen && (
        <div style={{
          marginBottom: 12, padding: 12, borderRadius: 8,
          background: 'rgba(124, 58, 237, .05)',
          border: '1px solid rgba(124, 58, 237, .25)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
            <Globe size={11} color="#7C3AED" />
            <span style={{ fontSize: 12, fontWeight: 500, color: '#5B21B6' }}>网络候选答案</span>
            <button
              onClick={() => setWebOpen(false)}
              style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: '#7C3AED' }}
            ><X size={11} /></button>
          </div>
          {webLoading && (
            <div style={{ fontSize: 12, color: 'var(--rd-text-3)', padding: '6px 0' }}>
              <Loader2 size={11} className="animate-spin" style={{ display: 'inline', marginRight: 4 }} /> 搜索中…
            </div>
          )}
          {webError && (
            <div style={{
              fontSize: 12, color: '#B91C1C',
              background: 'rgba(220, 38, 38, .08)', border: '1px solid rgba(220, 38, 38, .25)',
              borderRadius: 4, padding: 8,
            }}>{webError}</div>
          )}
          {webCandidates && webCandidates.length === 0 && !webLoading && (
            <div style={{ fontSize: 12, color: 'var(--rd-text-3)', fontStyle: 'italic' }}>没找到相关结果,建议直接填</div>
          )}
          {webCandidates && webCandidates.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {webCandidates.map((c, i) => (
                <div key={i} style={{
                  background: '#fff', border: '1px solid rgba(124, 58, 237, .25)',
                  borderRadius: 4, padding: 10,
                }}>
                  <div style={{ fontSize: 12, color: 'var(--rd-text)', lineHeight: 1.6 }}>{c.text}</div>
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <a href={c.source_url} target="_blank" rel="noopener noreferrer" style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      fontSize: 12, color: '#7C3AED', textDecoration: 'none',
                      maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      <ExternalLink size={9} /> {c.source_domain}
                    </a>
                    <button
                      onClick={() => adoptCandidate(c)}
                      style={{
                        marginLeft: 'auto', padding: '2px 8px', borderRadius: 4,
                        fontSize: 12, color: '#7C3AED',
                        background: 'transparent', border: '1px solid #7C3AED',
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      <CheckCircle2 size={9} style={{ display: 'inline', marginRight: 2 }} />采纳
                    </button>
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 12, color: 'var(--rd-text-3)', fontStyle: 'italic' }}>
                结果来自互联网公开信息,仅供参考。建议交叉验证后采纳。
              </div>
            </div>
          )}
        </div>
      )}

      {hasOptions && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
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
                className={`rd-chip${selected ? ' is-active' : ''}`}
                style={{ fontSize: 12, padding: '5px 11px' }}
              >
                {selected && <CheckCircle2 size={10} />}
                {opt}
              </button>
            )
          })}
          {!isMulti && (
            <button
              type="button"
              onClick={() => {
                setShowFreeText(true)
                if (!isCustom) onChange({ kind: 'text', value: '' })
              }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '5px 11px', borderRadius: 999, fontSize: 12,
                background: (isCustom || showFreeText) ? 'rgba(255, 141, 26, .10)' : 'transparent',
                color: (isCustom || showFreeText) ? 'var(--rd-accent-2)' : 'var(--rd-text-3)',
                border: `1px dashed ${(isCustom || showFreeText) ? 'rgba(255, 141, 26, .35)' : 'var(--rd-line)'}`,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <Plus size={10} /> 其他(自填)
            </button>
          )}
        </div>
      )}

      {!hasOptions && (
        prompt.field_type === 'list' || isMulti ? (
          <textarea
            className="rd-input" rows={3} style={textareaStyle}
            placeholder="每行一条;或用顿号、分号分隔"
            value={ans.kind === 'list' ? (ans.freetext || '') : (ans.kind === 'text' ? ans.value : '')}
            onChange={e => {
              if (isMulti && ans.kind === 'list') {
                onChange({ kind: 'list', value: ans.value, freetext: e.target.value })
              } else {
                const lines = e.target.value.split(/[\n、;;]/).map(s => s.trim()).filter(Boolean)
                onChange({ kind: 'list', value: lines })
              }
            }}
          />
        ) : (
          <textarea
            className="rd-input" rows={2} style={textareaStyle}
            placeholder="请直接填写"
            value={ans.kind === 'text' ? ans.value : ''}
            onChange={e => onChange({ kind: 'text', value: e.target.value })}
          />
        )
      )}

      {hasOptions && !isMulti && (showFreeText || isCustom) && (
        <input
          type="text" className="rd-input" style={{ ...inputStyle, marginTop: 4 }}
          placeholder="自填具体内容"
          value={isCustom ? (ans.kind === 'text' ? ans.value : '') : ''}
          onChange={e => onChange({ kind: 'text', value: e.target.value })}
        />
      )}

      {hasOptions && isMulti && (
        <input
          type="text" className="rd-input" style={{ ...inputStyle, marginTop: 4 }}
          placeholder="补充其他选项(可选,逗号/分号/换行 分隔多条)"
          value={ans.kind === 'list' ? (ans.freetext || '') : ''}
          onChange={e => { if (ans.kind === 'list') onChange({ kind: 'list', value: ans.value, freetext: e.target.value }) }}
        />
      )}
    </div>
  )
}
