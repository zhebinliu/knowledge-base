/**
 * P04 — 人效痛点 · PM 时间花在哪
 *
 * 三个高耗时机械工序:
 *   1. 项目接手:翻 SOW / 合同 / 交接单
 *   2. 调研启动:凭空设计问卷
 *   3. 会议复盘:手写纪要 + 整理需求
 */
import type { ReactNode } from 'react'
import { SlideShell, SlideHeader, GradText, GlassCard } from '../Shell'
import { PPT, fz } from '../theme'

type IconType = 'inbox' | 'pencil' | 'mic'

const TASKS: { icon: IconType; title: string; sub: string; oldTime: string; tasks: string[] }[] = [
  {
    icon: 'inbox',
    title: '项目接手',
    sub: '新项目接到手, PM 要先把项目摸清楚',
    oldTime: '数小时',
    tasks: ['翻 SOW · 找关键条款', '看合同 · 找验收口径', '读交接单 · 找未完事项', '梳风险 · 列 Stakeholder'],
  },
  {
    icon: 'pencil',
    title: '调研启动',
    sub: '客户访谈前, PM 要凭空想该问什么',
    oldTime: '半天起',
    tasks: ['按 LTC 流程拆模块', '想行业专属问题', '设计问卷选项', '排访谈日程'],
  },
  {
    icon: 'mic',
    title: '会议复盘',
    sub: '每场访谈结束, PM 要花时间整理',
    oldTime: '1-2 小时/场',
    tasks: ['听录音转文字', '修标点 / 去口语', '整理结论 / 待办', '提取需求 / 风险'],
  },
]

export default function Slide04EfficiencyPain() {
  return (
    <SlideShell>
      <SlideHeader
        index="04 / 15"
        tag="目的 1 · 人效 · 痛点"
        title={<>PM 大量时间花在<GradText>机械、可标准化</GradText>的工序上</>}
        sub="不是判断 / 不是客户关系 / 不是方案设计 — 而是翻文档、写大纲、整理纪要这些「谁来做都一样」的活"
      />

      <div className="flex-1 grid grid-cols-3 gap-[1.4cqi]" style={{ minHeight: 0 }}>
        {TASKS.map((t, i) => (
          <TaskCard key={i} {...t} />
        ))}
      </div>

      {/* 底部 punchline */}
      <div
        className="ppt-stagger-row mt-[1.6cqi] text-center py-[1cqi] px-[2cqi] rounded-full mx-auto"
        style={{
          background: 'rgba(251,113,133,0.10)',
          border: '1px solid rgba(251,113,133,0.40)',
          maxWidth: '85%',
          fontSize: fz.body,
          color: PPT.fg,
        }}
      >
        这些活<strong style={{ color: PPT.rose }}> 重复、机械、消耗精力</strong>, 但客户不为此付钱 ——
        <strong style={{ color: PPT.brandMid }}>客户为 PM 的判断和方案付钱</strong>
      </div>
    </SlideShell>
  )
}

function TaskCard({
  icon, title, sub, oldTime, tasks,
}: { icon: IconType; title: string; sub: string; oldTime: string; tasks: string[] }) {
  return (
    <GlassCard pad="1.4cqi" className="flex flex-col">
      {/* 顶部:图标 + 老耗时 */}
      <div className="flex items-center justify-between mb-[0.8cqi]">
        <span
          className="flex items-center justify-center rounded-[0.8cqi]"
          style={{
            width: '3.4cqi', height: '3.4cqi',
            background: 'rgba(251,113,133,0.12)',
            color: PPT.rose,
            border: '1px solid rgba(251,113,133,0.30)',
          }}
        >
          <TaskIcon type={icon} />
        </span>
        <div className="text-right">
          <div
            className="font-extrabold ppt-num-pop"
            style={{
              fontSize: fz.h3,
              color: PPT.rose,
              textShadow: `0 0 18px rgba(251,113,133,0.5)`,
              lineHeight: 1,
            }}
          >
            {oldTime}
          </div>
          <div style={{ fontSize: fz.tiny, color: PPT.fgMuted, marginTop: '0.3cqi' }}>
            老模式耗时
          </div>
        </div>
      </div>

      {/* 标题 */}
      <div style={{ fontSize: fz.h2, fontWeight: 700, color: PPT.fg, marginBottom: '0.3cqi' }}>
        {title}
      </div>
      <div style={{ fontSize: fz.body, color: PPT.fgMuted, marginBottom: '1.2cqi', lineHeight: 1.4 }}>
        {sub}
      </div>

      {/* 任务清单 — 字号加大, 间距加大 */}
      <div className="flex-1 flex flex-col" style={{ paddingTop: '1cqi', borderTop: `1px solid ${PPT.border}` }}>
        <div
          className="font-mono mb-[0.8cqi]"
          style={{
            fontSize: fz.tiny,
            color: PPT.fgMuted,
            letterSpacing: '0.2em',
            fontWeight: 700,
          }}
        >
          PM 要 做 的 活 ↓
        </div>
        <div className="flex flex-col gap-[0.7cqi]">
          {tasks.map((task, i) => (
            <div
              key={i}
              className="flex items-center gap-[0.8cqi]"
              style={{ fontSize: fz.body, color: PPT.fg }}
            >
              <span
                className="flex items-center justify-center rounded-[0.3cqi] flex-shrink-0"
                style={{
                  width: '1.6cqi', height: '1.6cqi',
                  background: 'rgba(251,113,133,0.15)',
                  border: '1px solid rgba(251,113,133,0.30)',
                  color: PPT.rose,
                  fontSize: fz.tiny,
                  fontWeight: 700,
                  fontFamily: 'ui-monospace, monospace',
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              {task}
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  )
}

function TaskIcon({ type }: { type: IconType }) {
  const paths: Record<IconType, ReactNode> = {
    inbox:  <><path d="M3 17l4-4h10l4 4M3 17v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3M3 17V7a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10" /></>,
    pencil: <><path d="M11 4H4v16h16v-7M18.5 2.5a2.1 2.1 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></>,
    mic:    <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M9 22h6" /></>,
  }
  return (
    <svg viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[type]}
    </svg>
  )
}
