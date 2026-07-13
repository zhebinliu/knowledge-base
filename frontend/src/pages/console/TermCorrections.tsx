/**
 * TermCorrections — 名词校正词典管理页(2026-07-13)
 *
 * 功能:
 *  - 词云可视化:以高频词地图形式展示,正确名词字体大,错误→正确连线
 *  - 手动增删改
 *  - 批量导入(粘贴 CSV/TSV/JSON)
 *  - 仅对当前账号可见和有效
 */
import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft, Plus, Trash2, Upload, X, Loader2, SpellCheck, Check, Pencil,
} from 'lucide-react'
import {
  listTermCorrections,
  createTermCorrection,
  updateTermCorrection,
  deleteTermCorrection,
  batchImportTermCorrections,
  type TermCorrection,
} from '../../api/client'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

// ── 词云节点 ──────────────────────────────────────────────────────────────

interface CloudNode {
  term: string
  type: 'correct' | 'wrong'
  size: number
  x: number
  y: number
  color: string
  vx: number
  vy: number
  linkTo?: string  // 错误词指向正确词
}

/** 词云 Canvas 组件:动态浮动 + 连线。 */
function WordCloudCanvas({ terms }: { terms: TermCorrection[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const nodesRef = useRef<CloudNode[]>([])

  // 构建节点
  useEffect(() => {
    if (!terms.length) {
      nodesRef.current = []
      return
    }
    const correctColors = ['#FF8D1A', '#2563eb', '#059669', '#7c3aed', '#dc2626', '#d97706', '#0891b2']
    const wrongColor = '#9ca3af'
    const nodes: CloudNode[] = []
    // 统计每个正确词出现的次数(决定大小)
    const correctCounts = new Map<string, number>()
    for (const t of terms) {
      correctCounts.set(t.correct_term, (correctCounts.get(t.correct_term) || 0) + 1)
    }
    const correctTerms = [...new Set(terms.map(t => t.correct_term))]
    const canvasW = canvasRef.current?.parentElement?.clientWidth || 800
    const canvasH = 360

    // 放置正确词(较大,居中偏散)
    correctTerms.forEach((term, i) => {
      const count = correctCounts.get(term) || 1
      const angle = (i / correctTerms.length) * Math.PI * 2
      const radius = Math.min(canvasW, canvasH) * 0.3
      nodes.push({
        term,
        type: 'correct',
        size: 14 + Math.min(count * 3, 12),
        x: canvasW / 2 + Math.cos(angle) * radius,
        y: canvasH / 2 + Math.sin(angle) * radius * 0.7,
        color: correctColors[i % correctColors.length],
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
      })
    })

    // 放置错误词(较小,围绕对应正确词)
    terms.forEach((t) => {
      const parent = nodes.find(n => n.term === t.correct_term && n.type === 'correct')
      const offsetAngle = Math.random() * Math.PI * 2
      const offsetRadius = 50 + Math.random() * 30
      nodes.push({
        term: t.wrong_term,
        type: 'wrong',
        size: 10,
        x: (parent?.x || canvasW / 2) + Math.cos(offsetAngle) * offsetRadius,
        y: (parent?.y || canvasH / 2) + Math.sin(offsetAngle) * offsetRadius,
        color: wrongColor,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        linkTo: t.correct_term,
      })
    })
    nodesRef.current = nodes
  }, [terms])

  // 动画循环
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const parent = canvas.parentElement
      if (parent) {
        canvas.width = parent.clientWidth
        canvas.height = 360
      }
    }
    resize()
    window.addEventListener('resize', resize)

    const animate = () => {
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      // 渐变背景
      const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
      grad.addColorStop(0, '#1a1a2e')
      grad.addColorStop(1, '#0f0f1e')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)

      const nodes = nodesRef.current
      if (!nodes.length) {
        ctx.fillStyle = '#6b7280'
        ctx.font = '14px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('暂无名词校正数据，请添加或导入', w / 2, h / 2)
        animRef.current = requestAnimationFrame(animate)
        return
      }

      // 更新位置 + 边界反弹
      for (const n of nodes) {
        n.x += n.vx
        n.y += n.vy
        if (n.x < n.size || n.x > w - n.size) n.vx *= -1
        if (n.y < n.size || n.y > h - n.size) n.vy *= -1
        n.x = Math.max(n.size, Math.min(w - n.size, n.x))
        n.y = Math.max(n.size, Math.min(h - n.size, n.y))
      }

      // 画连线(wrong → correct)
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'
      ctx.lineWidth = 1
      for (const n of nodes) {
        if (n.type === 'wrong' && n.linkTo) {
          const target = nodes.find(m => m.term === n.linkTo && m.type === 'correct')
          if (target) {
            ctx.beginPath()
            ctx.moveTo(n.x, n.y)
            ctx.lineTo(target.x, target.y)
            ctx.stroke()
          }
        }
      }

      // 画节点
      for (const n of nodes) {
        // 光晕
        if (n.type === 'correct') {
          const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.size * 1.5)
          glow.addColorStop(0, n.color + '40')
          glow.addColorStop(1, n.color + '00')
          ctx.fillStyle = glow
          ctx.beginPath()
          ctx.arc(n.x, n.y, n.size * 1.5, 0, Math.PI * 2)
          ctx.fill()
        }

        ctx.font = `${n.size}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = n.color
        ctx.fillText(n.term, n.x, n.y)
      }

      animRef.current = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <div className="relative rounded-xl overflow-hidden shadow-lg">
      <canvas ref={canvasRef} className="w-full" style={{ height: 360 }} />
      <div className="absolute top-3 right-3 flex gap-3 text-[11px]">
        <span className="flex items-center gap-1 text-white/70">
          <span className="w-2 h-2 rounded-full bg-orange-400" /> 正确名称
        </span>
        <span className="flex items-center gap-1 text-white/50">
          <span className="w-2 h-2 rounded-full bg-gray-400" /> 错误/不确定词
        </span>
      </div>
    </div>
  )
}

// ── 主页面 ───────────────────────────────────────────────────────────────

export default function TermCorrectionsPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [importText, setImportText] = useState('')
  const [importResult, setImportResult] = useState<{ created: number; skipped: number } | null>(null)

  // 表单状态
  const [wrongTerm, setWrongTerm] = useState('')
  const [correctTerm, setCorrectTerm] = useState('')
  const [note, setNote] = useState('')
  const [editCorrect, setEditCorrect] = useState('')
  const [editNote, setEditNote] = useState('')

  const { data: terms = [], isLoading } = useQuery({
    queryKey: ['term-corrections'],
    queryFn: listTermCorrections,
  })

  const addMut = useMutation({
    mutationFn: () => createTermCorrection({
      wrong_term: wrongTerm.trim(),
      correct_term: correctTerm.trim(),
      note: note.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['term-corrections'] })
      setShowAdd(false)
      setWrongTerm(''); setCorrectTerm(''); setNote('')
    },
  })

  const delMut = useMutation({
    mutationFn: (id: number) => deleteTermCorrection(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['term-corrections'] }),
  })

  const updateMut = useMutation({
    mutationFn: () => updateTermCorrection(editingId!, {
      correct_term: editCorrect.trim(),
      note: editNote.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['term-corrections'] })
      setEditingId(null)
    },
  })

  const importMut = useMutation({
    mutationFn: (text: string) => {
      // 解析粘贴文本:支持 CSV/TSV/JSON
      const items: Record<string, unknown>[] = []
      const trimmed = text.trim()
      if (!trimmed) return Promise.resolve({ created: 0, skipped: 0 })

      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        // JSON 格式
        const parsed = JSON.parse(trimmed)
        const arr = Array.isArray(parsed) ? parsed : [parsed]
        for (const item of arr) {
          items.push({
            wrong: item.wrong || item.wrong_term || '',
            correct: item.correct || item.correct_term || '',
            note: item.note || null,
          })
        }
      } else {
        // 每行一个,tab/逗号/空格分隔
        for (const line of trimmed.split('\n')) {
          const parts = line.split(/[\t,，]/).map(s => s.trim()).filter(Boolean)
          if (parts.length >= 2) {
            items.push({ wrong: parts[0], correct: parts[1], note: parts[2] || null })
          }
        }
      }
      return batchImportTermCorrections(items)
    },
    onSuccess: (data) => {
      setImportResult(data)
      qc.invalidateQueries({ queryKey: ['term-corrections'] })
    },
  })

  const startEdit = (t: TermCorrection) => {
    setEditingId(t.id)
    setEditCorrect(t.correct_term)
    setEditNote(t.note || '')
  }

  const stats = useMemo(() => {
    const correctSet = new Set(terms.map(t => t.correct_term))
    return { total: terms.length, uniqueCorrect: correctSet.size }
  }, [terms])

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* 返回 */}
      <button
        onClick={() => nav('/console/meeting')}
        className="inline-flex items-center gap-1 text-ink-muted hover:text-ink text-sm mb-4"
      >
        <ChevronLeft size={16} /> 返回会议列表
      </button>

      {/* 标题区 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-ink mb-1 flex items-center gap-2">
            <SpellCheck size={24} className="text-brand" /> 名词校正
          </h1>
          <p className="text-sm text-ink-secondary">
            维护你的专属名词清单,AI 润色时会自动将不确定名词替换为准确名称。
            <span className="text-ink-muted">仅对你的账号可见和有效。</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-line bg-white hover:bg-slate-50 text-ink-secondary transition-colors"
          >
            <Upload size={16} /> 导入
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium shadow-sm hover:opacity-90"
            style={{ background: BRAND_GRAD }}
          >
            <Plus size={16} /> 新增
          </button>
        </div>
      </div>

      {/* 统计 */}
      <div className="flex gap-4 mb-4 text-sm">
        <div className="rounded-lg bg-white border border-line px-4 py-2">
          <span className="text-ink-muted">校正条目</span>
          <span className="ml-2 font-bold text-ink">{stats.total}</span>
        </div>
        <div className="rounded-lg bg-white border border-line px-4 py-2">
          <span className="text-ink-muted">唯一正确名词</span>
          <span className="ml-2 font-bold text-ink">{stats.uniqueCorrect}</span>
        </div>
      </div>

      {/* 词云可视化 */}
      <div className="mb-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-[360px] rounded-xl bg-slate-900">
            <Loader2 className="animate-spin text-brand" size={24} />
          </div>
        ) : (
          <WordCloudCanvas terms={terms} />
        )}
      </div>

      {/* 列表 */}
      <div className="rounded-xl border border-line bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-line bg-slate-50">
          <span className="text-sm font-semibold text-ink">校正清单</span>
        </div>
        {terms.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-ink-muted">
            暂无校正数据。点击「新增」手动添加,或「导入」批量粘贴。
          </div>
        ) : (
          <div className="divide-y divide-line">
            {terms.map((t) => (
              <div key={t.id} className="px-4 py-3 flex items-center gap-3 group hover:bg-slate-50/50">
                {editingId === t.id ? (
                  // 编辑模式
                  <>
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-sm text-gray-400 line-through min-w-[120px]">{t.wrong_term}</span>
                      <span className="text-gray-300">→</span>
                      <input
                        value={editCorrect}
                        onChange={e => setEditCorrect(e.target.value)}
                        className="flex-1 px-2 py-1 text-sm border border-line rounded focus:outline-none focus:border-brand"
                      />
                      <input
                        value={editNote}
                        onChange={e => setEditNote(e.target.value)}
                        placeholder="备注(可选)"
                        className="w-32 px-2 py-1 text-sm border border-line rounded focus:outline-none focus:border-brand"
                      />
                    </div>
                    <button
                      onClick={() => updateMut.mutate()}
                      disabled={updateMut.isPending || !editCorrect.trim()}
                      className="p-1.5 rounded text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                    >
                      {updateMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 rounded text-ink-muted hover:bg-slate-100">
                      <X size={16} />
                    </button>
                  </>
                ) : (
                  // 展示模式
                  <>
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      <span className="text-sm text-gray-400 line-through min-w-[120px] truncate">{t.wrong_term}</span>
                      <span className="text-gray-300 shrink-0">→</span>
                      <span className="text-sm font-medium text-ink truncate">{t.correct_term}</span>
                      {t.note && <span className="text-[11px] text-ink-muted truncate ml-2">({t.note})</span>}
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                      <button onClick={() => startEdit(t)} className="p-1.5 rounded text-ink-muted hover:text-brand hover:bg-slate-100" title="编辑">
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => delMut.mutate(t.id)}
                        className="p-1.5 rounded text-ink-muted hover:text-rose-600 hover:bg-rose-50"
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 新增弹窗 */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-[420px] max-w-[90vw] p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-ink">新增名词校正</h2>
              <button onClick={() => setShowAdd(false)} className="text-ink-muted hover:text-ink"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-ink mb-1">错误/不确定词</label>
                <input
                  value={wrongTerm}
                  onChange={e => setWrongTerm(e.target.value)}
                  placeholder="如：纷享消客"
                  className="w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">正确名称</label>
                <input
                  value={correctTerm}
                  onChange={e => setCorrectTerm(e.target.value)}
                  placeholder="如：纷享销客"
                  className="w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">备注(可选)</label>
                <input
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="如：客户公司名"
                  className="w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:border-brand"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg border border-line text-sm text-ink hover:bg-slate-50">
                取消
              </button>
              <button
                onClick={() => addMut.mutate()}
                disabled={addMut.isPending || !wrongTerm.trim() || !correctTerm.trim()}
                className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2"
                style={{ background: BRAND_GRAD }}
              >
                {addMut.isPending && <Loader2 size={14} className="animate-spin" />}
                确认添加
              </button>
            </div>
            {addMut.isError && (
              <p className="text-xs text-rose-600 mt-2">{(addMut.error as Error)?.message}</p>
            )}
          </div>
        </div>
      )}

      {/* 导入弹窗 */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setShowImport(false); setImportResult(null) }}>
          <div className="bg-white rounded-xl shadow-2xl w-[600px] max-w-[90vw] p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-ink">批量导入名词校正</h2>
              <button onClick={() => { setShowImport(false); setImportResult(null) }} className="text-ink-muted hover:text-ink"><X size={18} /></button>
            </div>
            <p className="text-sm text-ink-secondary mb-3">
              每行一条,用 Tab 或逗号分隔。格式：<code className="text-xs bg-slate-100 px-1 rounded">错误词,正确词,备注(可选)</code>
              <br />也支持 JSON 数组格式：<code className="text-xs bg-slate-100 px-1 rounded">[{'{wrong:"A",correct:"B"}'}]</code>
            </p>
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={'纷享消客,纷享销客\n消客云,销客云\n...'}
              rows={10}
              className="w-full px-3 py-2 rounded-lg border border-line text-sm font-mono focus:outline-none focus:border-brand resize-y"
            />
            {importResult && (
              <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
                <Check size={14} className="inline mr-1" />
                导入完成：新增 {importResult.created} 条，跳过 {importResult.skipped} 条(已存在或格式错误)
              </div>
            )}
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => { setShowImport(false); setImportResult(null) }} className="px-4 py-2 rounded-lg border border-line text-sm text-ink hover:bg-slate-50">
                {importResult ? '关闭' : '取消'}
              </button>
              {!importResult && (
                <button
                  onClick={() => importMut.mutate(importText)}
                  disabled={importMut.isPending || !importText.trim()}
                  className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2"
                  style={{ background: BRAND_GRAD }}
                >
                  {importMut.isPending && <Loader2 size={14} className="animate-spin" />}
                  <Upload size={14} /> 开始导入
                </button>
              )}
            </div>
            {importMut.isError && (
              <p className="text-xs text-rose-600 mt-2">
                导入失败：{(importMut.error as Error)?.message}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
