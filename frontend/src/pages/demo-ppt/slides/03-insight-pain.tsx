/**
 * P03 — 项目洞察 · 痛点
 * 核心洞察: 老模式靠人, 顾问个人有个人特色, 水平参差
 */
import type { ReactNode } from 'react'
import { SlideShell, SlideHeader, GradText, GlassCard, Chip } from '../Shell'
import { PPT, fz } from '../theme'

// 5 个顾问的洞察质量分数(0-100, 视觉化用)— 模拟"参差不齐"
const CONSULTANTS = [
  { name: '资深 A', score: 92, tag: '15 年经验', tone: 'green' as const },
  { name: '资深 B', score: 78, tag: '10 年经验', tone: 'green' as const },
  { name: '中级 C', score: 62, tag: '5 年经验',  tone: 'amber' as const },
  { name: '初级 D', score: 41, tag: '2 年经验',  tone: 'rose'  as const },
  { name: '新人 E', score: 28, tag: '< 1 年',    tone: 'rose'  as const },
]

type SymptomIconType = 'time' | 'miss' | 'repeat' | 'scale'

const SYMPTOMS: { icon: SymptomIconType; title: string; desc: string }[] = [
  { icon: 'time',   title: '接手慢',         desc: '翻 SOW、合同、交接单, 数小时起步' },
  { icon: 'miss',   title: '漏关键条款',     desc: 'kickoff 现场才发现, 已经晚了' },
  { icon: 'repeat', title: '老人重复劳动',   desc: '同一类信息, 每个项目都要再梳一遍' },
  { icon: 'scale',  title: '水平下限看人',   desc: '新人接手 = PM 决策依据不可控' },
]

export default function Slide03InsightPain() {
  return (
    <SlideShell>
      <SlideHeader
        index="03 / 15"
        tag="PAIN · 老模式"
        title={
          <>
            项目洞察, 现在<GradText>靠人扛</GradText>
          </>
        }
        sub={
          <>
            顾问个人有个人的特色, 经验、节奏、关注点全不一样。
            同一份合同, 让 5 个 PM 去接手, 拿到 5 份洞察底稿质量天差地别 —— 项目执行的<strong>下限完全看接手人</strong>。
          </>
        }
      />

      <div className="flex-1 grid grid-cols-[1fr_1.2fr] gap-[3cqi]" style={{ minHeight: 0 }}>

        {/* 左:症状清单 */}
        <div className="ppt-stagger-row flex flex-col justify-center gap-[1.6cqi]">
          {SYMPTOMS.map((s, i) => (
            <GlassCard key={i} pad="2cqi" className="flex items-start gap-[1.6cqi]">
              <div
                className="flex-shrink-0 flex items-center justify-center rounded-[1.2cqi]"
                style={{
                  width: '5cqi',
                  height: '5cqi',
                  background: 'rgba(251,113,133,0.12)',
                  border: '1px solid rgba(251,113,133,0.30)',
                  color: PPT.rose,
                }}
              >
                <SymptomIcon type={s.icon} />
              </div>
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: fz.h3, fontWeight: 700, color: PPT.fg, marginBottom: '0.3cqi' }}>
                  {s.title}
                </div>
                <div style={{ fontSize: fz.body, color: PPT.fgMuted, lineHeight: 1.4 }}>
                  {s.desc}
                </div>
              </div>
            </GlassCard>
          ))}
        </div>

        {/* 右:水平参差柱状图 */}
        <GlassCard className="ppt-stagger-row flex flex-col" pad="3cqi">
          <div className="flex items-center justify-between" style={{ marginBottom: '2cqi' }}>
            <div>
              <div style={{ fontSize: fz.h3, fontWeight: 700, color: PPT.fg }}>
                同一个项目, <GradText>5 个顾问</GradText>
              </div>
              <div style={{ fontSize: fz.body, color: PPT.fgMuted, marginTop: '0.4cqi' }}>
                输出的洞察质量参差不齐 ↓
              </div>
            </div>
            <Chip tone="rose">质量波动</Chip>
          </div>

          {/* 柱状图主体 — 固定高度容器, 柱子按比例填充 */}
          <div
            className="flex items-end gap-[1.6cqi]"
            style={{ paddingTop: '2cqi', height: '24cqi' }}
          >
            {CONSULTANTS.map((c, i) => (
              <ConsultantBar key={i} {...c} idx={i} />
            ))}
          </div>

          {/* 底部基线 */}
          <div
            style={{
              borderTop: `1px solid ${PPT.border}`,
              marginTop: '1cqi',
              paddingTop: '1cqi',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: fz.small,
              color: PPT.fgMuted,
              fontWeight: 500,
            }}
          >
            <span>同一个项目, 不同 PM 接手 →</span>
            <span style={{ color: PPT.rose }}>项目执行下限看运气</span>
          </div>
        </GlassCard>
      </div>
    </SlideShell>
  )
}

// ── 症状 SVG icon (统一 stroke + currentColor, 不会被 emoji 字体污染)──
function SymptomIcon({ type }: { type: SymptomIconType }) {
  const paths: Record<SymptomIconType, ReactNode> = {
    // 时钟 — 接手慢
    time: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2.2" />
      </>
    ),
    // 警告三角 — 漏关键条款
    miss: (
      <>
        <path d="M12 3L22 21H2L12 3z" />
        <path d="M12 10v5" />
        <circle cx="12" cy="18" r="0.6" fill="currentColor" stroke="none" />
      </>
    ),
    // 循环 — 老人重复劳动
    repeat: (
      <>
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <polyline points="21 3 21 8 16 8" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        <polyline points="3 21 3 16 8 16" />
      </>
    ),
    // 天平 — 水平下限看人
    scale: (
      <>
        <path d="M12 4v17M5 7h14" />
        <circle cx="12" cy="4" r="0.8" fill="currentColor" stroke="none" />
        <path d="M5 7l-3 6h6L5 7z" />
        <path d="M19 7l-3 6h6L19 7z" />
        <path d="M8 21h8" />
      </>
    ),
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width="55%"
      height="55%"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[type]}
    </svg>
  )
}

// ── 单个顾问柱 ──
function ConsultantBar({
  name, score, tag, tone, idx,
}: {
  name: string; score: number; tag: string; tone: 'green' | 'amber' | 'rose'; idx: number
}) {
  const colorMap = {
    green: '#34D399',
    amber: '#FBBF24',
    rose:  '#FB7185',
  }
  const color = colorMap[tone]
  return (
    <div className="flex-1 flex flex-col items-center gap-[0.8cqi]" style={{ minWidth: 0 }}>
      {/* 分数浮在柱上方 */}
      <div
        className="font-extrabold ppt-num-pop"
        style={{
          fontSize: fz.h3,
          color,
          textShadow: `0 0 18px ${color}99`,
          animationDelay: `${600 + idx * 120}ms`,
        }}
      >
        {score}
      </div>

      {/* 柱子(从底部生长) — 用 calc 算真实高度, 不用 % */}
      <div
        className="ppt-bar-grow w-full relative overflow-hidden rounded-t-[1cqi]"
        style={{
          height: `calc(${score} / 100 * 18cqi)`,
          minHeight: '1.5cqi',
          background: `linear-gradient(180deg, ${color}, ${color}33)`,
          boxShadow: `0 0 30px -8px ${color}aa, inset 0 1px 0 rgba(255,255,255,0.2)`,
          border: `1px solid ${color}55`,
          borderBottom: 'none',
          animationDelay: `${400 + idx * 100}ms`,
        }}
      >
        {/* 柱顶光晕 */}
        <div
          className="absolute top-0 left-0 right-0"
          style={{
            height: '2cqi',
            background: `linear-gradient(180deg, ${color}, transparent)`,
            opacity: 0.6,
          }}
        />
      </div>

      {/* 柱下方 label */}
      <div className="flex flex-col items-center gap-[0.3cqi]" style={{ minHeight: '4cqi' }}>
        <span style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg }}>{name}</span>
        <span
          style={{ fontSize: fz.small, color: PPT.fgMuted, letterSpacing: '0.05em' }}
        >
          {tag}
        </span>
      </div>

    </div>
  )
}
