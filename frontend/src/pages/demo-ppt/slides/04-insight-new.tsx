/**
 * P04 — 项目洞察 · 新模式 + 数字对比
 * 核心: 加上 AI 后, 输出齐头, 短板被齐到资深线
 */
import { type ReactNode } from 'react'
import { SlideShell, SlideHeader, GradText, GlassCard } from '../Shell'
import { PPT, fz } from '../theme'

const OLD_SCORES = [92, 78, 62, 41, 28]   // P03 数据
const NEW_SCORES = [94, 90, 88, 86, 85]   // 都齐到 85+ 资深线

const PIPELINE = [
  { id: 1, label: '核心文档',    sub: 'SOW · 合同 · 交接单', color: PPT.blue },
  { id: 2, label: '整篇喂入 AI', sub: '不切片 · 全文上下文', color: PPT.brand },
  { id: 3, label: '挑战回合',    sub: 'Critic + Challenger', color: PPT.purple },
  { id: 4, label: '10 模块洞察', sub: '结构化 · 带原文引用', color: PPT.green },
]

export default function Slide04InsightNew() {
  return (
    <SlideShell>
      <SlideHeader
        index="04 / 15"
        tag="NEW · 加上 AI 之后"
        title={<>同一个项目, 同样 5 人 — 这次<GradText>输出齐头</GradText></>}
        sub="AI 接管基础工序, 把短板齐到资深线;人腾出时间投到客户判断这种 AI 替不掉的板上"
      />

      <div className="flex-1 flex flex-col gap-[2.4cqi]" style={{ minHeight: 0 }}>

        {/* 上半:对比柱图 */}
        <div className="ppt-stagger-row grid grid-cols-[1fr_auto_1fr] gap-[2cqi] items-stretch" style={{ flex: 1, minHeight: 0 }}>
          {/* 左:老模式 */}
          <CompareCard
            label="老模式 · 靠人扛"
            chip="数小时 · 水平参差"
            chipTone="rose"
            scores={OLD_SCORES}
            barColor="#FB7185"
            dim
          />

          {/* 中央:大箭头 + 一句话 */}
          <div className="flex flex-col items-center justify-center gap-[1cqi]" style={{ minWidth: '8cqi' }}>
            <svg width="6cqi" height="6cqi" viewBox="0 0 60 60" fill="none">
              <defs>
                <linearGradient id="arrow-grad" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0" stopColor="#FF8D1A" />
                  <stop offset="1" stopColor="#D96400" />
                </linearGradient>
              </defs>
              <circle cx="30" cy="30" r="28" fill="url(#arrow-grad)" opacity="0.18" />
              <path d="M14 30 L42 30 M32 20 L42 30 L32 40" stroke="url(#arrow-grad)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span
              className="font-mono font-bold text-center"
              style={{
                fontSize: fz.tiny,
                color: PPT.brandMid,
                letterSpacing: '0.2em',
                writingMode: 'horizontal-tb',
              }}
            >
              + AI
            </span>
          </div>

          {/* 右:新模式 */}
          <CompareCard
            label="新模式 · AI 接管基础工序"
            chip="几分钟 · 齐头起跳"
            chipTone="green"
            scores={NEW_SCORES}
            barColor="#34D399"
          />
        </div>

        {/* 下半:流程 4 节点 */}
        <GlassCard className="ppt-stagger-row" pad="1.4cqi">
          <div className="flex items-center justify-between mb-[0.8cqi]">
            <div style={{ fontSize: fz.body, fontWeight: 600, color: PPT.fg }}>
              新模式的实现路径
            </div>
            <div style={{ fontSize: fz.tiny, color: PPT.fgMuted, letterSpacing: '0.15em' }}>
              PIPELINE
            </div>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-center gap-[1cqi]">
            {PIPELINE.flatMap((p, i) => {
              const items: ReactNode[] = [
                <PipelineNode key={p.id} {...p} idx={i} />,
              ]
              if (i < PIPELINE.length - 1) {
                items.push(
                  <svg key={`arrow-${i}`} width="2cqi" height="2cqi" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14M13 6l6 6-6 6" stroke={PPT.fgDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )
              }
              return items
            })}
          </div>
        </GlassCard>
      </div>
    </SlideShell>
  )
}

// ── 对比柱图卡片 ──
function CompareCard({
  label, chip, chipTone, scores, barColor, dim = false,
}: {
  label: string; chip: string; chipTone: 'rose' | 'green'; scores: number[]; barColor: string; dim?: boolean
}) {
  const chipBg = chipTone === 'rose'
    ? { bg: 'rgba(251,113,133,0.14)', fg: '#FB7185', border: 'rgba(251,113,133,0.35)' }
    : { bg: 'rgba(52,211,153,0.14)',  fg: '#34D399', border: 'rgba(52,211,153,0.35)' }

  return (
    <GlassCard pad="2cqi" highlight={!dim} className="flex flex-col" style={{ opacity: dim ? 0.85 : 1 }}>
      {/* 顶部 label + chip */}
      <div className="flex items-center justify-between mb-[1.2cqi]">
        <div style={{ fontSize: fz.body, fontWeight: 600, color: dim ? PPT.fgMuted : PPT.fg }}>
          {label}
        </div>
        <span
          className="px-[1cqi] py-[0.3cqi] rounded-full font-semibold"
          style={{
            fontSize: fz.tiny,
            background: chipBg.bg,
            color: chipBg.fg,
            border: `1px solid ${chipBg.border}`,
          }}
        >
          {chip}
        </span>
      </div>

      {/* 柱图区 — 固定高度容器, 柱子用 calc 算 */}
      <div className="flex items-end gap-[1cqi]" style={{ height: '10cqi' }}>
        {scores.map((s, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end gap-[0.4cqi] h-full" style={{ minWidth: 0 }}>
            <span
              className="font-bold"
              style={{
                fontSize: fz.small,
                color: barColor,
                opacity: dim ? 0.75 : 1,
                textShadow: dim ? undefined : `0 0 12px ${barColor}88`,
              }}
            >
              {s}
            </span>
            <div
              className="ppt-bar-grow w-full rounded-t-[0.6cqi]"
              style={{
                height: `calc(${s} / 100 * 8cqi)`,
                minHeight: '0.8cqi',
                background: `linear-gradient(180deg, ${barColor}, ${barColor}33)`,
                boxShadow: dim ? undefined : `0 0 20px -6px ${barColor}99`,
                border: `1px solid ${barColor}55`,
                borderBottom: 'none',
                animationDelay: `${500 + i * 90}ms`,
              }}
            />
          </div>
        ))}
      </div>

      <div
        className="flex justify-between items-center"
        style={{ borderTop: `1px solid ${PPT.border}`, marginTop: '1cqi', paddingTop: '0.6cqi', fontSize: fz.small, color: PPT.fgMuted, fontWeight: 500 }}
      >
        <span>资深</span>
        <span>同一项目, 不同顾问</span>
        <span>新人</span>
      </div>
    </GlassCard>
  )
}

// ── 流程节点 ──
function PipelineNode({
  id, label, sub, color, idx,
}: { id: number; label: string; sub: string; color: string; idx: number }) {
  return (
    <div
      className="flex flex-col items-center gap-[0.4cqi] ppt-num-pop"
      style={{ animationDelay: `${800 + idx * 120}ms` }}
    >
      <div
        className="flex items-center justify-center font-extrabold rounded-[1cqi]"
        style={{
          width: '3.6cqi',
          height: '3.6cqi',
          background: `${color}1A`,
          color,
          fontSize: fz.body,
          border: `1.5px solid ${color}55`,
          boxShadow: `0 0 20px -8px ${color}99, inset 0 1px 0 rgba(255,255,255,0.08)`,
        }}
      >
        {id}
      </div>
      <div style={{ fontSize: fz.body, fontWeight: 600, color: PPT.fg, textAlign: 'center' }}>
        {label}
      </div>
      <div style={{ fontSize: fz.tiny, color: PPT.fgDim, textAlign: 'center', letterSpacing: '0.05em' }}>
        {sub}
      </div>
    </div>
  )
}
