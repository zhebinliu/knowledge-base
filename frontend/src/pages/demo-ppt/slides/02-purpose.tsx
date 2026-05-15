/**
 * P02 — 核心论点 · 这套工具解决两件事
 *
 * 整个汇报的"提纲挈领" — 后续所有页归到这两个目的下:
 *   1. 提高人效(量 · 宽度)— 把 PM 从机械工序解放
 *   2. 增加专业性(质 · 高度)— 让交付水平下限齐到资深线
 */
import { SlideShell, SlideHeader, GradText } from '../Shell'
import { PPT, fz } from '../theme'

export default function Slide02Purpose() {
  return (
    <SlideShell>
      <SlideHeader
        index="02 / 15"
        tag="WHY · 这套工具为什么存在"
        title={<>解决<GradText>两件事</GradText> · 人效 + 专业性</>}
        sub="本次汇报围绕这两个目的展开 · 后面 13 页都可以挂回到这两点"
      />

      <div className="flex-1 grid grid-cols-[1fr_auto_1fr] gap-[2cqi]" style={{ minHeight: 0 }}>

        {/* 目的 1 · 人效 */}
        <PurposeCard
          n="01"
          dimension="量 · 宽度"
          title="提高人效"
          tagline="把 PM 从机械工序里解放"
          color={PPT.brand}
          before="数小时"
          after="几分钟"
          beforeLabel="老:翻文档 / 写大纲 / 整理纪要"
          afterLabel="新:AI 自动生成, PM 校审 + 决策"
          examples={[
            '项目接手:翻 SOW / 合同 / 交接单',
            '调研启动:凭空设计问卷',
            '会议复盘:手写纪要 + 整理需求',
          ]}
        />

        {/* 中间符号 */}
        <div className="flex flex-col items-center justify-center" style={{ minWidth: '6cqi' }}>
          <div
            className="font-extrabold ppt-pulse"
            style={{
              fontSize: fz.numM,
              color: PPT.brandMid,
              textShadow: `0 0 30px ${PPT.brand}aa`,
              lineHeight: 1,
            }}
          >
            +
          </div>
          <div
            className="font-mono mt-[1cqi]"
            style={{
              fontSize: fz.tiny,
              color: PPT.fgMuted,
              letterSpacing: '0.2em',
              writingMode: 'vertical-rl',
            }}
          >
            两 者 缺 一 不 可
          </div>
        </div>

        {/* 目的 2 · 专业性 */}
        <PurposeCard
          n="02"
          dimension="质 · 高度"
          title="增加专业性"
          tagline="让交付水平下限齐到资深线"
          color={PPT.blue}
          before="参差不齐"
          after="对齐资深线"
          beforeLabel="老:顾问个人经验为主, 新人不可控"
          afterLabel="新:行业 know-how + 反幻觉 + 评审兜底"
          examples={[
            '反幻觉三层(整篇喂入 + 知识库召回 + 引用)',
            'Critic + Challenger 双层评审',
            '4 行业包 + AI 实施建议',
          ]}
        />
      </div>

      {/* 底部小标 */}
      <div
        className="ppt-stagger-row mt-[1.6cqi] flex items-center justify-center gap-[1cqi]"
        style={{ fontSize: fz.small, color: PPT.fgMuted }}
      >
        <span>本次汇报后续</span>
        <span style={{ color: PPT.brandMid, fontWeight: 600 }}>P04 ~ P06</span>
        <span>讲人效</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span style={{ color: PPT.blue, fontWeight: 600 }}>P07 ~ P10</span>
        <span>讲专业性</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span style={{ color: PPT.fgMuted, fontWeight: 600 }}>P11 ~ P15</span>
        <span>整合 + 系统视角</span>
      </div>
    </SlideShell>
  )
}

// ── 目的卡 ──
function PurposeCard({
  n, dimension, title, tagline, color, before, after, beforeLabel, afterLabel, examples,
}: {
  n: string; dimension: string; title: string; tagline: string; color: string;
  before: string; after: string; beforeLabel: string; afterLabel: string;
  examples: string[]
}) {
  return (
    <div
      className="ppt-stagger-row relative rounded-[1.6cqi] flex flex-col"
      style={{
        background: `${color}0E`,
        border: `1px solid ${color}55`,
        padding: '1.6cqi',
        boxShadow: `0 0 60px -20px ${color}99`,
      }}
    >
      {/* 顶部:序号 + 维度 */}
      <div className="flex items-center justify-between mb-[1cqi]">
        <span
          className="font-mono font-extrabold flex items-center justify-center rounded-[0.6cqi]"
          style={{
            width: '3cqi', height: '3cqi',
            background: color,
            color: '#fff',
            fontSize: fz.h3,
            boxShadow: `0 0 20px ${color}aa`,
          }}
        >
          {n}
        </span>
        <span
          className="font-mono px-[0.8cqi] py-[0.3cqi] rounded-full"
          style={{
            fontSize: fz.tiny,
            color,
            background: `${color}1F`,
            border: `1px solid ${color}55`,
            letterSpacing: '0.2em',
            fontWeight: 700,
          }}
        >
          {dimension}
        </span>
      </div>

      {/* 主标题 */}
      <h3
        className="font-extrabold leading-tight"
        style={{ fontSize: fz.h2, color: PPT.fg, marginBottom: '0.4cqi' }}
      >
        {title}
      </h3>
      <p style={{ fontSize: fz.body, color: PPT.fgMuted, marginBottom: '1.4cqi' }}>
        {tagline}
      </p>

      {/* 大字对比:before → after — 字号上限调小到 56px, 容器加溢出保护 */}
      <div
        className="rounded-[1cqi] p-[1.2cqi] mb-[1cqi] flex items-center justify-between gap-[0.6cqi]"
        style={{
          background: 'rgba(0,0,0,0.25)',
          border: `1px solid ${color}30`,
          overflow: 'hidden',
        }}
      >
        <div className="flex-1 text-center" style={{ minWidth: 0, overflow: 'hidden' }}>
          <div
            className="font-extrabold ppt-num-pop"
            style={{
              fontSize: 'clamp(22px, 3.6cqi, 56px)',
              color: PPT.fgMuted,
              opacity: 0.55,
              textDecoration: 'line-through',
              textDecorationColor: 'rgba(255,255,255,0.3)',
              textDecorationThickness: '2px',
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}
          >
            {before}
          </div>
          <div style={{ fontSize: fz.tiny, color: PPT.fgDim, marginTop: '0.4cqi' }}>
            {beforeLabel}
          </div>
        </div>

        <svg width="2cqi" height="2cqi" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <path d="M5 12h14M13 6l6 6-6 6" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        <div className="flex-1 text-center" style={{ minWidth: 0, overflow: 'hidden' }}>
          <div
            className="font-extrabold ppt-num-pop"
            style={{
              fontSize: 'clamp(22px, 3.6cqi, 56px)',
              color,
              textShadow: `0 0 30px ${color}99`,
              lineHeight: 1,
              animationDelay: '500ms',
              whiteSpace: 'nowrap',
            }}
          >
            {after}
          </div>
          <div style={{ fontSize: fz.tiny, color: PPT.fgDim, marginTop: '0.4cqi' }}>
            {afterLabel}
          </div>
        </div>
      </div>

      {/* 涉及功能 */}
      <div className="flex-1 flex flex-col gap-[0.4cqi]">
        <div
          className="font-mono"
          style={{
            fontSize: fz.tiny,
            color: PPT.fgMuted,
            letterSpacing: '0.2em',
            marginBottom: '0.2cqi',
          }}
        >
          涉及功能 ↓
        </div>
        {examples.map((ex, i) => (
          <div
            key={i}
            className="flex items-center gap-[0.6cqi] px-[0.8cqi] py-[0.5cqi] rounded-[0.5cqi]"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${PPT.border}`,
            }}
          >
            <span
              style={{
                width: '0.5cqi', height: '0.5cqi',
                borderRadius: '50%',
                background: color,
                flexShrink: 0,
                boxShadow: `0 0 6px ${color}`,
              }}
            />
            <span style={{ fontSize: fz.small, color: PPT.fg }}>
              {ex}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
