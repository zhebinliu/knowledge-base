/**
 * P15 — 收尾 · 呼应两个目的
 *
 * - 顶部:再次点题两目的(P02 的回响)
 * - 中央:核心立场 — 分工换了, 不是替代
 * - 底部:THANK YOU
 */
import { SlideShell, GradText } from '../Shell'
import { PPT, fz } from '../theme'

export default function Slide15Closing() {
  return (
    <SlideShell variant="hero">
      <div className="relative w-full h-full flex flex-col items-center justify-center px-[6cqi] text-center">

        {/* 顶部小 tag */}
        <div className="ppt-stagger-row mb-[3cqi]">
          <span
            className="font-mono"
            style={{ fontSize: fz.tiny, color: PPT.fgDim, letterSpacing: '0.4em' }}
          >
            15 / 15 · CLOSING
          </span>
        </div>

        {/* 两目的回响 */}
        <div
          className="ppt-stagger-row flex items-center gap-[3cqi] mb-[4cqi]"
          style={{ fontSize: fz.h2, fontWeight: 700, color: PPT.fg }}
        >
          <span style={{ color: PPT.brand, textShadow: `0 0 30px ${PPT.brand}88` }}>
            人效 ↑
          </span>
          <span style={{ color: PPT.fgMuted, fontWeight: 300 }}>+</span>
          <span style={{ color: PPT.blue, textShadow: `0 0 30px ${PPT.blue}88` }}>
            专业性 ↑
          </span>
          <span style={{ color: PPT.fgMuted, fontWeight: 300 }}>=</span>
          <GradText>
            交付价值 ↑
          </GradText>
        </div>

        {/* 核心立场 */}
        <h2
          className="ppt-stagger-row font-extrabold leading-[1.1] tracking-tight mb-[2cqi]"
          style={{ fontSize: fz.h1 }}
        >
          分工换了, <span style={{ textDecoration: 'line-through', opacity: 0.45 }}>不是替代</span>
        </h2>
        <p
          className="ppt-stagger-row"
          style={{
            fontSize: fz.h3,
            color: PPT.fgMuted,
            fontWeight: 300,
            lineHeight: 1.5,
            maxWidth: '70%',
            marginBottom: '5cqi',
          }}
        >
          AI 接管基础工序 · 人做 AI 替不掉的判断
          <br />
          <span style={{ fontSize: fz.body, color: PPT.fgDim }}>
            顾问的角色不是被取代, 而是从「文档工」回到「咨询师」
          </span>
        </p>

        {/* 三段总结 */}
        <div
          className="ppt-stagger-row grid grid-cols-3 gap-[2cqi] w-full"
          style={{ maxWidth: '85%', marginBottom: '4cqi' }}
        >
          <SummaryItem
            n="01"
            color={PPT.brand}
            title="提高人效"
            desc="数小时 → 几分钟"
          />
          <SummaryItem
            n="02"
            color={PPT.blue}
            title="增加专业性"
            desc="水平参差 → 齐到资深线"
          />
          <SummaryItem
            n="03"
            color={PPT.green}
            title="沉淀为资产"
            desc="行业 know-how 不再靠人记"
          />
        </div>

        {/* 致谢 */}
        <div
          className="ppt-stagger-row font-mono"
          style={{
            fontSize: fz.h3,
            color: PPT.brandMid,
            letterSpacing: '0.4em',
            fontWeight: 600,
            textShadow: `0 0 20px ${PPT.brand}66`,
          }}
        >
          T H A N K   Y O U
        </div>

        {/* 角落小字 */}
        <div
          className="absolute font-mono"
          style={{
            left: '3cqi',
            bottom: '2cqi',
            fontSize: fz.tiny,
            color: PPT.fgDim,
            letterSpacing: '0.3em',
          }}
        >
          实 施 工 作 台 · 2026
        </div>
        <div
          className="absolute font-mono"
          style={{
            right: '3cqi',
            bottom: '2cqi',
            fontSize: fz.tiny,
            color: PPT.fgDim,
            letterSpacing: '0.3em',
          }}
        >
          Q & A
        </div>
      </div>
    </SlideShell>
  )
}

function SummaryItem({ n, color, title, desc }: { n: string; color: string; title: string; desc: string }) {
  return (
    <div
      className="rounded-[1cqi] p-[1.4cqi] flex flex-col items-center text-center"
      style={{
        background: `${color}10`,
        border: `1px solid ${color}55`,
        boxShadow: `0 0 30px -15px ${color}99`,
      }}
    >
      <span
        className="font-mono font-extrabold"
        style={{
          fontSize: fz.h3,
          color,
          textShadow: `0 0 20px ${color}99`,
          marginBottom: '0.4cqi',
        }}
      >
        {n}
      </span>
      <div style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg, marginBottom: '0.2cqi' }}>
        {title}
      </div>
      <div style={{ fontSize: fz.small, color: PPT.fgMuted }}>
        {desc}
      </div>
    </div>
  )
}
