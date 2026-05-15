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
import Slide15 from './demo-ppt/slides/15-closing'              // 收尾(已重写)

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
  { id: '15', title: '收尾 · 呼应两目的',             component: Slide15 },
]

export default function DemoPPT() {
  const [idx, setIdx] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [showToolbar, setShowToolbar] = useState(true)
  const stageRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<Array<HTMLDivElement | null>>([])
  const toolbarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      const clamped = Math.max(0, Math.min(SLIDES.length - 1, next))
      setDirection(clamped >= cur ? 1 : -1)
      return clamped
    })
  }, [])

  const next = useCallback(() => go(idx + 1), [go, idx])
  const prev = useCallback(() => go(idx - 1), [go, idx])

  // ── 键盘导航 ───────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
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
          e.preventDefault(); go(SLIDES.length - 1); break
        case 'f':
        case 'F':
          e.preventDefault(); toggleFullscreen(); break
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
  }, [next, prev, go])

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
      {/* 顶部进度条(贴 stage 顶, 不是 frame)*/}
      <div
        className="ppt-progress-bar"
        style={{ width: `${((idx + 1) / SLIDES.length) * 100}%` }}
      />

      {/* 16:9 容器 — 纯净, 不放任何 UI chrome */}
      <div className="ppt-frame">
        {SLIDES.map((s, i) => {
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
          {String(idx + 1).padStart(2, '0')} / {String(SLIDES.length).padStart(2, '0')}
        </span>
        <button onClick={next} aria-label="下一页">→</button>
        <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)' }} />
        <div className="ppt-dots">
          {SLIDES.map((s, i) => (
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
        <button onClick={toggleFullscreen} title="全屏 (F)">⛶</button>
      </div>
    </div>
  )
}
