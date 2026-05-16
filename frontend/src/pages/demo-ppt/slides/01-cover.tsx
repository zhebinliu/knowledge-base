/**
 * P01 — 封面
 * 大标题 + 副标题 + 汇报背景 + "按 → 开始" 提示
 */
import type { CSSProperties } from 'react'
import { SlideShell, GradText } from '../Shell'
import { PPT, fz } from '../theme'

export default function Slide01Cover() {
  return (
    <SlideShell variant="cover" pad={false}>
      {/* 主体 — 居中 */}
      <div className="relative w-full h-full flex flex-col items-center justify-center px-[6cqi] text-center">

        {/* 顶部小标识 */}
        <div className="ppt-stagger-row flex items-center gap-[1.2cqi] mb-[5cqi]">
          <span
            className="w-[4cqi] h-[4cqi] rounded-[1cqi] flex items-center justify-center"
            style={{ background: PPT.brandGrad, boxShadow: PPT.glowBrand }}
          >
            <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none">
              <path d="M4 7l8-4 8 4v10l-8 4-8-4V7z" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M4 7l8 4 8-4M12 11v10" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          </span>
          <span
            className="font-mono font-semibold"
            style={{ fontSize: fz.small, color: PPT.fgMuted, letterSpacing: '0.4em' }}
          >
            实 施 AI 工 作 组
          </span>
        </div>

        {/* 主标题 */}
        <h1
          className="ppt-stagger-row font-extrabold leading-[0.95] tracking-tight"
          style={{ fontSize: fz.hero, marginBottom: '6cqi' }}
        >
          实施体系 AI 工具
          <br />
          <GradText>建设成果分享</GradText>
        </h1>

        {/* 汇报背景三段 */}
        <div
          className="ppt-stagger-row flex items-center gap-[3cqi]"
          style={{ marginBottom: '8cqi' }}
        >
          {[
            { k: '汇报对象', v: '公司高层 · 经营侧' },
            { k: '聚焦阶段', v: '项目洞察 + 需求调研' },
          ].map((item, i) => (
            <div key={i} className="flex flex-col items-center gap-[0.4cqi]">
              <span
                className="font-mono"
                style={{ fontSize: fz.tiny, color: PPT.fgDim, letterSpacing: '0.3em' }}
              >
                {item.k}
              </span>
              <span style={{ fontSize: fz.body, color: PPT.fg, fontWeight: 500 }}>
                {item.v}
              </span>
            </div>
          ))}
        </div>

        {/* 开始按钮(呼吸动画) */}
        <div
          className="ppt-stagger-row inline-flex items-center gap-[1cqi] px-[2.4cqi] py-[1.2cqi] rounded-full ppt-pulse"
          style={{
            background: PPT.brandGrad,
            color: '#fff',
            fontSize: fz.body,
            fontWeight: 600,
            boxShadow: PPT.glowBrand,
            letterSpacing: '0.05em',
          }}
        >
          <span>按 → 开始</span>
          <svg width="1.6em" height="1.6em" viewBox="0 0 24 24" fill="none">
            <path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* 角落装饰 */}
      <CornerDeco position="tl" />
      <CornerDeco position="br" />

      {/* 底部小字 */}
      <div
        className="absolute left-[3cqi] bottom-[2.5cqi] font-mono"
        style={{ fontSize: fz.tiny, color: PPT.fgDim, letterSpacing: '0.3em' }}
      >
        2026 · 实 施 工 作 台
      </div>
    </SlideShell>
  )
}

function CornerDeco({ position }: { position: 'tl' | 'br' }) {
  const isTL = position === 'tl'
  return (
    <svg
      className="absolute pointer-events-none"
      style={{
        [isTL ? 'top' : 'bottom']: '3cqi',
        [isTL ? 'left' : 'right']: '3cqi',
        width: '6cqi',
        height: '6cqi',
        opacity: 0.4,
      } as CSSProperties}
      viewBox="0 0 100 100"
      fill="none"
    >
      <path
        d={isTL ? 'M0 30 L0 0 L30 0' : 'M100 70 L100 100 L70 100'}
        stroke={PPT.brand}
        strokeWidth="2"
      />
      <path
        d={isTL ? 'M10 0 L10 10 L0 10' : 'M90 100 L90 90 L100 90'}
        stroke={PPT.brand}
        strokeWidth="1"
        opacity="0.5"
      />
    </svg>
  )
}
