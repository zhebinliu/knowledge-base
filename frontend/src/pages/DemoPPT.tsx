/**
 * DemoPPT — 高层经营汇报 · HTML PPT
 * Route: /demo-ppt  (no auth)
 *
 * 设计目标:
 * - 16:9 全屏深色 PPT, 投屏汇报场景, 字号大、对比强
 * - 键盘 ←/→/Space/数字 切换, F 全屏, ESC 退
 * - Slide 切换有 stagger 进场动画
 * - 浏览器打印可导出 PDF (每页换页)
 *
 * 共 15 页 — 当前先做前 5 页验收风格
 */
import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import './demo-ppt/styles.css'

// 新结构(2 目的导向): 人效(P04-P06) + 专业性(P07-P10) + 整合(P11-P12) + 系统(P13-P14) + 收尾(P15)
import Slide01 from './demo-ppt/slides/01-cover'
import Slide02 from './demo-ppt/slides/02-purpose'              // NEW · 两目的论点
import Slide03 from './demo-ppt/slides/02-mainline'             // 实施主线 (旧 P02)
import Slide04 from './demo-ppt/slides/04-efficiency-pain'      // NEW · 人效痛点
import Slide05 from './demo-ppt/slides/05-efficiency-solution'  // NEW · 人效解法
import Slide06 from './demo-ppt/slides/06-efficiency-effect'    // NEW · 人效效果
import Slide07 from './demo-ppt/slides/07-quality-pain'         // NEW · 专业性痛点
import Slide08 from './demo-ppt/slides/05-insight-feel'         // 反幻觉三层 (旧 P05)
import Slide09 from './demo-ppt/slides/09-challenge'            // Critic + Challenger (旧 P09)
import Slide10 from './demo-ppt/slides/10-industry-advisor'     // NEW · 行业包 + AI 建议合并
import Slide11 from './demo-ppt/slides/11-workflow'             // NEW · PM 工作流整合
import Slide12 from './demo-ppt/slides/12-meeting'              // 会议纪要 (旧 P12)
import Slide13 from './demo-ppt/slides/13-architecture'         // 架构 (旧 P13)
import Slide14 from './demo-ppt/slides/14-ai-dev'               // NEW · AI 助产品迭代 单页
import Slide15 from './demo-ppt/slides/14-roadmap'              // NEW · 迭代路线图 三阶段
import Slide16 from './demo-ppt/slides/15-closing'              // 收尾(已重写)

type SlideDef = { id: string; title: string; component: () => ReactNode }

const SLIDES: SlideDef[] = [
  { id: '01', title: '封面',                          component: Slide01 },
  { id: '02', title: '核心论点 · 两个目的',           component: Slide02 },
  { id: '03', title: '实施项目主线',                  component: Slide03 },
  { id: '04', title: '人效 · 痛点',                   component: Slide04 },
  { id: '05', title: '人效 · 解法',                   component: Slide05 },
  { id: '06', title: '人效 · 效果',                   component: Slide06 },
  { id: '07', title: '专业性 · 痛点',                 component: Slide07 },
  { id: '08', title: '专业性 · 反幻觉三层',           component: Slide08 },
  { id: '09', title: '专业性 · Critic + Challenger',  component: Slide09 },
  { id: '10', title: '专业性 · 行业包 + AI 建议',     component: Slide10 },
  { id: '11', title: '整合 · PM 工作流',              component: Slide11 },
  { id: '12', title: '整合 · 会议纪要联动',           component: Slide12 },
  { id: '13', title: '整体架构',                      component: Slide13 },
  { id: '14', title: 'AI 助产品迭代',                 component: Slide14 },
  { id: '15', title: '迭代路线图 · 三阶段',           component: Slide15 },
  { id: '16', title: '收尾 · 呼应两目的',             component: Slide16 },
]

// ── 选页持久化 ──────────────────────────────────────────────────────────────
const SELECTED_LS_KEY = 'demo-ppt-selected-v1'

function loadSelected(): Set<string> {
  try {
    const raw = localStorage.getItem(SELECTED_LS_KEY)
    if (!raw) return new Set(SLIDES.map((s) => s.id))   // 默认全选
    const arr = JSON.parse(raw)
    if (Array.isArray(arr) && arr.length > 0) return new Set(arr)
    return new Set(SLIDES.map((s) => s.id))
  } catch {
    return new Set(SLIDES.map((s) => s.id))
  }
}

function saveSelected(ids: Set<string>) {
  try {
    localStorage.setItem(SELECTED_LS_KEY, JSON.stringify([...ids]))
  } catch {}
}

// 内置预设
const PRESETS: { name: string; ids: string[] }[] = [
  { name: '完整 16 页',    ids: SLIDES.map((s) => s.id) },
  { name: '核心叙事 (5)',   ids: ['01', '02', '03', '11', '16'] },
  { name: '人效段 (4)',     ids: ['01', '04', '05', '06'] },
  { name: '专业性段 (5)',   ids: ['01', '07', '08', '09', '10'] },
  { name: '仅创新点 (3)',   ids: ['09', '10', '11'] },
  { name: '5 分钟简版 (7)', ids: ['01', '02', '06', '11', '14', '15', '16'] },
]

export default function DemoPPT() {
  const [idx, setIdx] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [showToolbar, setShowToolbar] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => loadSelected())
  const stageRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<Array<HTMLDivElement | null>>([])
  const toolbarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 派生 visibleSlides — 只渲染选中的, 按原 SLIDES 顺序
  const visibleSlides = SLIDES.filter((s) => selectedIds.has(s.id))
  const total = visibleSlides.length || SLIDES.length          // 一个都没选时回退到全部(避免空白)
  const effectiveSlides = visibleSlides.length ? visibleSlides : SLIDES

  // 持久化 + 越界保护
  useEffect(() => {
    saveSelected(selectedIds)
  }, [selectedIds])
  useEffect(() => {
    if (idx >= total) setIdx(Math.max(0, total - 1))
  }, [total, idx])

  // ── 文档标题 + 隐藏滚动条 ─────────────────────────────────────────────
  useEffect(() => {
    const prevTitle = document.title
    document.title = '汇报 · 实施 AI 工作台'
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      document.title = prevTitle
      document.documentElement.style.overflow = ''
      document.body.style.overflow = ''
    }
  }, [])

  // ── 切换函数 ───────────────────────────────────────────────────────────
  const go = useCallback((next: number) => {
    setIdx((cur) => {
      const clamped = Math.max(0, Math.min(total - 1, next))
      setDirection(clamped >= cur ? 1 : -1)
      return clamped
    })
  }, [total])

  const next = useCallback(() => go(idx + 1), [go, idx])
  const prev = useCallback(() => go(idx - 1), [go, idx])

  // ── 键盘导航 ───────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      // picker 打开时 Esc 关掉, 不切页
      if (pickerOpen && e.key === 'Escape') {
        e.preventDefault(); setPickerOpen(false); return
      }
      if (pickerOpen) return                                  // picker 打开时不响应翻页
      switch (e.key) {
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          e.preventDefault(); next(); break
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault(); prev(); break
        case 'Home':
          e.preventDefault(); go(0); break
        case 'End':
          e.preventDefault(); go(total - 1); break
        case 'f':
        case 'F':
          e.preventDefault(); toggleFullscreen(); break
        case 'p':
        case 'P':
          e.preventDefault(); setPickerOpen((v) => !v); break
        default:
          // 数字键 1-9 跳页
          if (/^[1-9]$/.test(e.key)) {
            e.preventDefault()
            go(parseInt(e.key, 10) - 1)
          }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, go, total, pickerOpen])

  // ── 进场后, 给当前 slide 内所有 stagger 节点分配 animationDelay ──────
  useEffect(() => {
    const el = slideRefs.current[idx]
    if (!el) return
    const els = el.querySelectorAll<HTMLElement>(
      '.ppt-stagger-row, [data-stagger] > *'
    )
    els.forEach((node, i) => {
      const baseDelay = Number(
        node.closest('[data-stagger]')?.getAttribute('data-stagger-delay') ?? 0
      )
      const step = Number(
        node.closest('[data-stagger]')?.getAttribute('data-stagger-step') ?? 0.08
      )
      // 第一行 100ms 起, 之后每行加 step 秒
      const delayMs = 100 + baseDelay * 1000 + i * step * 1000
      node.style.animationDelay = `${delayMs}ms`
    })
  }, [idx])

  // ── 鼠标移动 → 显示 toolbar, 2.5s 后淡出 ────────────────────────────
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onMove = () => {
      setShowToolbar(true)
      if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current)
      toolbarTimerRef.current = setTimeout(() => setShowToolbar(false), 2500)
    }
    stage.addEventListener('mousemove', onMove)
    // 初始 2.5s 后自动隐藏
    toolbarTimerRef.current = setTimeout(() => setShowToolbar(false), 2500)
    return () => {
      stage.removeEventListener('mousemove', onMove)
      if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current)
    }
  }, [])

  // ── 全屏切换 ───────────────────────────────────────────────────────────
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      stageRef.current?.requestFullscreen?.().catch(() => {})
    } else {
      document.exitFullscreen?.().catch(() => {})
    }
  }

  return (
    <div
      ref={stageRef}
      className={`ppt-stage ${showToolbar ? 'show-toolbar' : ''}`}
      tabIndex={0}
    >
      {/* 顶部进度条 — 按可见页计算 */}
      <div
        className="ppt-progress-bar"
        style={{ width: `${((idx + 1) / total) * 100}%` }}
      />

      {/* 16:9 容器 — 纯净, 只渲染选中的页 */}
      <div className="ppt-frame">
        {effectiveSlides.map((s, i) => {
          const isActive = i === idx
          const isLeavingBack = !isActive && i < idx && direction === 1
          const Comp = s.component
          return (
            <div
              key={s.id}
              ref={(el) => { slideRefs.current[i] = el }}
              className={[
                'ppt-slide',
                isActive ? 'is-active' : '',
                isLeavingBack ? 'is-leaving-back' : '',
              ].join(' ')}
              aria-hidden={!isActive}
            >
              {Math.abs(i - idx) <= 1 ? <Comp /> : null}
            </div>
          )
        })}
      </div>

      {/* 水印 — 在 stage 右下黑边上, 不进 frame */}
      <div className="ppt-watermark">
        内部资料 · 请勿外传
      </div>

      {/* 浮动 toolbar — 在 stage 上(frame 外), 鼠标移动短暂显示 */}
      <div className="ppt-toolbar">
        <button onClick={prev} aria-label="上一页">←</button>
        <span className="font-mono">
          {String(idx + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </span>
        <button onClick={next} aria-label="下一页">→</button>
        <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)' }} />
        <div className="ppt-dots">
          {effectiveSlides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => go(i)}
              className={i === idx ? 'is-active' : ''}
              aria-label={`跳到 ${s.title}`}
              title={`${s.id} · ${s.title}`}
            />
          ))}
        </div>
        <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)' }} />
        <button onClick={() => setPickerOpen(true)} title="选择展示的页 (P)">☰ 选页</button>
        <button onClick={toggleFullscreen} title="全屏 (F)">⛶</button>
      </div>

      {/* ── 选页 drawer ── */}
      {pickerOpen && (
        <SlidePicker
          allSlides={SLIDES}
          selectedIds={selectedIds}
          onChange={setSelectedIds}
          onClose={() => setPickerOpen(false)}
          onJumpTo={(slideId) => {
            // 跳到该页(若它已被勾选);未勾选则先勾上
            setSelectedIds((cur) => {
              if (cur.has(slideId)) return cur
              const next = new Set(cur)
              next.add(slideId)
              return next
            })
            // 等下一个 effect tick 再算 idx
            setTimeout(() => {
              const newVisible = SLIDES.filter((s) => {
                const ids = loadSelected()
                return ids.has(s.id) || s.id === slideId
              })
              const targetIdx = newVisible.findIndex((s) => s.id === slideId)
              if (targetIdx >= 0) setIdx(targetIdx)
              setPickerOpen(false)
            }, 50)
          }}
        />
      )}
    </div>
  )
}

// ── SlidePicker ─────────────────────────────────────────────────────────────

function SlidePicker({
  allSlides, selectedIds, onChange, onClose, onJumpTo,
}: {
  allSlides: SlideDef[]
  selectedIds: Set<string>
  onChange: (next: Set<string>) => void
  onClose: () => void
  onJumpTo: (slideId: string) => void
}) {
  const toggle = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }
  const selectedCount = allSlides.filter((s) => selectedIds.has(s.id)).length
  const applyPreset = (ids: string[]) => onChange(new Set(ids))

  return (
    <>
      {/* 遮罩 */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(4px)', zIndex: 90, animation: 'ppt-stagger-in 200ms ease',
        }}
      />
      {/* 抽屉 */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(420px, 90vw)',
          background: 'rgba(20, 25, 40, 0.96)',
          backdropFilter: 'blur(24px)',
          borderLeft: '1px solid rgba(255, 141, 26, 0.30)',
          zIndex: 95, color: '#fff',
          display: 'flex', flexDirection: 'column',
          fontFamily: 'inherit',
          boxShadow: '-12px 0 48px rgba(0,0,0,0.7)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.3em', color: '#FFB066', fontWeight: 700, marginBottom: 4 }}>
              选 择 展 示 的 页
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
              已选 <strong style={{ color: '#fff' }}>{selectedCount}</strong> / {allSlides.length} 页
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
              color: 'rgba(255,255,255,0.85)', padding: '4px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
            }}
          >
            ✕ 关闭
          </button>
        </div>

        {/* Presets */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.45)', marginBottom: 8, fontWeight: 700 }}>
            预 设
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() => applyPreset(p.ids)}
                style={{
                  padding: '4px 10px', fontSize: 11,
                  background: 'rgba(255,141,26,0.10)',
                  color: '#FFB066', border: '1px solid rgba(255,141,26,0.35)',
                  borderRadius: 999, cursor: 'pointer', fontWeight: 500,
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* 列表 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
          {allSlides.map((s) => {
            const checked = selectedIds.has(s.id)
            return (
              <div
                key={s.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 8px',
                  borderRadius: 8,
                  background: checked ? 'rgba(255,141,26,0.08)' : 'transparent',
                  cursor: 'pointer',
                  marginBottom: 2,
                }}
                onClick={() => toggle(s.id)}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(s.id)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ accentColor: '#FF8D1A', cursor: 'pointer' }}
                />
                <span
                  className="font-mono"
                  style={{ width: 28, fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: 700 }}
                >
                  P{s.id}
                </span>
                <span style={{ flex: 1, fontSize: 13, color: checked ? '#fff' : 'rgba(255,255,255,0.65)' }}>
                  {s.title}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); onJumpTo(s.id) }}
                  title="跳到这一页(若未选会自动勾上)"
                  style={{
                    padding: '2px 8px', fontSize: 11,
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
                    color: 'rgba(255,255,255,0.65)', borderRadius: 6, cursor: 'pointer',
                  }}
                >
                  跳转 →
                </button>
              </div>
            )
          })}
        </div>

        {/* Footer 操作区 */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', gap: 8,
          }}
        >
          <button
            onClick={() => onChange(new Set(allSlides.map((s) => s.id)))}
            style={{
              flex: 1, padding: '8px', fontSize: 12,
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 8, cursor: 'pointer',
            }}
          >
            全选
          </button>
          <button
            onClick={() => onChange(new Set([allSlides[0].id]))}
            style={{
              flex: 1, padding: '8px', fontSize: 12,
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 8, cursor: 'pointer',
            }}
          >
            清空(留封面)
          </button>
        </div>

        <div style={{ padding: '4px 20px 12px', fontSize: 10, color: 'rgba(255,255,255,0.30)', textAlign: 'center' }}>
          快捷键: P 打开 / 关闭此面板 · Esc 关闭
        </div>
      </div>
    </>
  )
}
