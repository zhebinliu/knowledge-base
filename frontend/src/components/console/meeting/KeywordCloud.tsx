/**
 * 词云 — 自绘 canvas(不引入任何新依赖)。
 *
 * 设计取舍:
 * - 布局用**确定性的阿基米德螺线**(r = a + bθ)逐词找位,不用 Math.random()。
 *   随机布点每次重渲染/截图位置都变,用户会以为数据变了。
 * - 逐词测包围盒做碰撞检测(collision detection),放不下就继续沿螺线往外走。
 * - 一次性绘制,不跑 rAF 动画 —— 持续动画在这类信息图上是纯负担。
 * - canvas 下方**必须**再渲染一份 top-15 词条 chip:既是 canvas 不可用时的兜底,
 *   也让数据可选中/可复制(canvas 里的文字选不中)。
 */
import { useEffect, useRef, useState } from 'react'
import type { InsightKeyword } from '../../../api/client'

// 会议详情页约定「不混用橙蓝」,这里只用暖色梯度
const PALETTE = ['#D96400', '#EA580C', '#FF8D1A', '#B45309', '#92400E', '#7C2D12']

const MIN_FONT = 13
const MAX_FONT = 36

function fontSize(weight: number, wMin: number, wMax: number): number {
  if (wMax <= wMin) return (MIN_FONT + MAX_FONT) / 2
  const t = (weight - wMin) / (wMax - wMin)
  return MIN_FONT + (MAX_FONT - MIN_FONT) * Math.max(0, Math.min(1, t))
}

type Rect = { x: number; y: number; w: number; h: number }

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

type Placed = { word: string; x: number; y: number; size: number; color: string }

/** 确定性螺线布局:逐词从中心向外找第一个不碰撞且不出界的位置。放不下就跳过该词。 */
function layout(
  ctx: CanvasRenderingContext2D,
  items: InsightKeyword[],
  w: number,
  h: number,
): Placed[] {
  const sorted = [...items].sort((a, b) => b.weight - a.weight)
  const weights = sorted.map((i) => i.weight)
  const wMin = Math.min(...weights)
  const wMax = Math.max(...weights)
  const rects: Rect[] = []
  const out: Placed[] = []
  const cx = w / 2
  const cy = h / 2
  const maxR = Math.hypot(w, h) / 2

  sorted.forEach((item, idx) => {
    const size = fontSize(item.weight, wMin, wMax)
    ctx.font = `700 ${size}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`
    const tw = ctx.measureText(item.word).width
    const th = size * 1.15
    const pad = 3

    // 螺线:x 方向拉伸 1.7 倍适配横向画布,y 方向压 0.85 倍
    for (let step = 0; step < 2400; step++) {
      const t = step * 0.22
      const r = 2.2 * t
      if (r > maxR) break
      const x = cx + r * Math.cos(t) * 1.7
      const y = cy + r * Math.sin(t) * 0.85
      const rect: Rect = {
        x: x - tw / 2 - pad,
        y: y - th / 2 - pad,
        w: tw + pad * 2,
        h: th + pad * 2,
      }
      if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > w || rect.y + rect.h > h) continue
      if (rects.some((p) => overlaps(p, rect))) continue
      rects.push(rect)
      out.push({ word: item.word, x, y, size, color: PALETTE[idx % PALETTE.length] })
      break
    }
  })
  return out
}

export default function KeywordCloud({ keywords }: { keywords: InsightKeyword[] }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)
  const [dropped, setDropped] = useState(0)

  const HEIGHT = 380

  // 容器宽度变化时重绘(侧栏可折叠、窗口可缩放)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      if (w > 0) setWidth(Math.floor(w))
    })
    ro.observe(el)
    setWidth(Math.floor(el.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width <= 0 || keywords.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = HEIGHT * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${HEIGHT}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, HEIGHT)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const placed = layout(ctx, keywords, width, HEIGHT)
    setDropped(keywords.length - placed.length)
    for (const p of placed) {
      ctx.font = `700 ${p.size}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`
      ctx.fillStyle = p.color
      ctx.fillText(p.word, p.x, p.y)
    }
  }, [keywords, width])

  const top = [...keywords].sort((a, b) => b.weight - a.weight).slice(0, 15)

  return (
    <div>
      <div ref={wrapRef} className="w-full">
        <canvas ref={canvasRef} className="block w-full" style={{ height: HEIGHT }} />
      </div>
      {dropped > 0 && (
        <p className="mt-1 text-xs text-ink-muted">
          画布空间有限,{dropped} 个权重较低的词未绘制(下方列表仍完整)
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {top.map((k) => (
          <span
            key={k.word}
            title={`出现 ${k.count} 次 · ${k.category}`}
            className="inline-flex items-center gap-1 rounded-md border border-line bg-canvas px-2 py-0.5 text-xs text-ink-secondary"
          >
            <span className="font-medium text-ink">{k.word}</span>
            <span className="text-ink-muted">{k.weight}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
