/**
 * P05 — 人效解法 · AI 接管三件机械工序
 *
 * 把 P04 三个痛点对应到 AI 解法:
 *   1. 项目接手 → 项目洞察自动生成(整篇喂入文档)
 *   2. 调研启动 → 调研问卷自动生成(LTC + 行业包)
 *   3. 会议复盘 → 纪要全链路自动化(ASR → 飞书)
 */
import type { ReactNode } from 'react'
import { SlideShell, SlideHeader, GradText, GlassCard } from '../Shell'
import { PPT, fz } from '../theme'

type IconType = 'inbox' | 'pencil' | 'mic'

const SOLUTIONS: {
  icon: IconType; n: string; title: string; from: string; to: string;
  desc: string; how: string[]
}[] = [
  {
    icon: 'inbox',
    n: '01',
    title: '项目洞察自动生成',
    from: '数小时翻文档',
    to: '几分钟出 10 模块',
    desc: 'PM 把项目文档丢进来, AI 整篇喂入(不切片), 输出 10 模块结构化洞察',
    how: ['SOW / 合同 / 交接单 整篇入 prompt', '10 模块化生成(执行摘要 / 健康雷达 / RAID / 下一步...)', '挂引用角标 [D1] · 一键跳原文校验'],
  },
  {
    icon: 'pencil',
    n: '02',
    title: '调研问卷自动生成',
    from: '半天凭空想',
    to: '几分钟出问卷',
    desc: '基于 LTC 字典 + 4 个行业包, 自动出大纲 + 6 题型问卷, 选项 LLM 预填',
    how: ['LTC 通用维度 + 行业专属字段 融合', '6 种题型(单选/多选/+追问/矩阵/简述)', '选项预填 — 顾问当场勾, 不打字'],
  },
  {
    icon: 'mic',
    n: '03',
    title: '会议纪要全链路',
    from: '1-2 小时手写',
    to: '上传录音即出',
    desc: 'ASR → 文本打磨 → AI 纪要 → 需求/Stakeholder 提取 → 直接写飞书文档',
    how: ['ASR 多引擎(讯飞 / 小米 / Whisper)', 'AI 纪要 + 需求 / Stakeholder 提取', '一键写飞书文档 + 多维表'],
  },
]

export default function Slide05EfficiencySolution() {
  return (
    <SlideShell>
      <SlideHeader
        index="05 / 15"
        tag="目的 1 · 人效 · 解法"
        title={<>AI 接管<GradText>三件机械工序</GradText> · 时间还给 PM</>}
        sub="所有的「前置准备」工序都自动化, PM 的精力让位给判断、决策、客户关系这些 AI 替不掉的事"
      />

      <div className="flex-1 grid grid-cols-3 gap-[1.4cqi]" style={{ minHeight: 0 }}>
        {SOLUTIONS.map((s) => (
          <SolutionCard key={s.n} {...s} />
        ))}
      </div>

      {/* 底部:三件事联动一句话 */}
      <div
        className="ppt-stagger-row mt-[1.4cqi] flex items-center justify-center gap-[1cqi] py-[0.8cqi] px-[1.6cqi] rounded-full mx-auto"
        style={{
          background: PPT.brandGrad,
          color: '#fff',
          maxWidth: '85%',
          fontSize: fz.body,
          boxShadow: PPT.glowBrand,
          fontWeight: 600,
        }}
      >
        三件事的产物联动 · 洞察 ↔ 调研 ↔ 纪要 互喂, 形成项目知识链
      </div>
    </SlideShell>
  )
}

function SolutionCard({
  icon, n, title, from, to, desc, how,
}: { icon: IconType; n: string; title: string; from: string; to: string; desc: string; how: string[] }) {
  return (
    <GlassCard pad="1.4cqi" highlight className="flex flex-col">
      {/* 顶部:序号 + 图标 */}
      <div className="flex items-center justify-between mb-[0.8cqi]">
        <div className="flex items-center gap-[0.6cqi]">
          <span
            className="font-mono font-extrabold flex items-center justify-center rounded-[0.5cqi]"
            style={{
              width: '2.4cqi', height: '2.4cqi',
              background: PPT.brand,
              color: '#fff',
              fontSize: fz.small,
            }}
          >
            {n}
          </span>
          <span
            className="flex items-center justify-center rounded-[0.6cqi]"
            style={{
              width: '2.4cqi', height: '2.4cqi',
              background: PPT.brandSoft,
              color: PPT.brand,
              border: `1px solid ${PPT.borderHi}`,
            }}
          >
            <SolIcon type={icon} />
          </span>
        </div>
      </div>

      {/* 标题 */}
      <div style={{ fontSize: fz.h3, fontWeight: 700, color: PPT.fg, marginBottom: '0.6cqi', lineHeight: 1.2 }}>
        {title}
      </div>

      {/* before → after 大字 */}
      <div
        className="rounded-[0.6cqi] p-[0.8cqi] mb-[0.8cqi] flex items-center justify-between gap-[0.4cqi]"
        style={{
          background: 'rgba(0,0,0,0.25)',
          border: `1px solid ${PPT.border}`,
        }}
      >
        <span
          style={{
            fontSize: fz.small,
            color: PPT.rose,
            fontWeight: 600,
            textDecoration: 'line-through',
            textDecorationColor: 'rgba(251,113,133,0.5)',
            opacity: 0.85,
          }}
        >
          {from}
        </span>
        <svg width="1.6cqi" height="1.6cqi" viewBox="0 0 24 24" fill="none">
          <path d="M5 12h14M13 6l6 6-6 6" stroke={PPT.brand} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span
          className="ppt-num-pop"
          style={{
            fontSize: fz.body,
            color: PPT.brand,
            fontWeight: 700,
            textShadow: `0 0 14px ${PPT.brand}99`,
          }}
        >
          {to}
        </span>
      </div>

      {/* 描述 — 字号加大 */}
      <div style={{ fontSize: fz.body, color: PPT.fgMuted, lineHeight: 1.45, marginBottom: '1cqi' }}>
        {desc}
      </div>

      {/* 怎么做 — 字号 + 行高加大, 用方块序号代替小箭头 */}
      <div className="flex-1 flex flex-col gap-[0.7cqi]" style={{ paddingTop: '1cqi', borderTop: `1px solid ${PPT.border}` }}>
        {how.map((h, i) => (
          <div
            key={i}
            className="flex items-start gap-[0.7cqi]"
            style={{ fontSize: fz.body, color: PPT.fg, lineHeight: 1.4 }}
          >
            <span
              className="font-mono flex items-center justify-center rounded-[0.3cqi] flex-shrink-0"
              style={{
                width: '1.6cqi',
                height: '1.6cqi',
                marginTop: '0.2cqi',
                background: PPT.brandSoft,
                color: PPT.brand,
                fontSize: fz.tiny,
                fontWeight: 700,
                border: `1px solid ${PPT.borderHi}`,
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <span>{h}</span>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}

function SolIcon({ type }: { type: IconType }) {
  const paths: Record<IconType, ReactNode> = {
    inbox:  <><path d="M3 17l4-4h10l4 4M3 17v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3M3 17V7a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10" /></>,
    pencil: <><path d="M11 4H4v16h16v-7M18.5 2.5a2.1 2.1 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></>,
    mic:    <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M9 22h6" /></>,
  }
  return (
    <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[type]}
    </svg>
  )
}
