/**
 * P15 — 路线图 · 三阶段
 * 当前 → 第二战场行业 Know-How → 融入大黄蜂
 */
import { SlideShell, SlideHeader, GradText } from '../Shell'
import { PPT, fz } from '../theme'

type PhaseState = 'current' | 'next' | 'future'

const PHASES: {
  phase: string; when: string; title: string; sub: string; desc: string;
  deliverables: string[]; state: PhaseState;
}[] = [
  {
    phase: 'Phase 1',
    when:  'Now · 2026 上半年',
    title: '独立工作台',
    sub:   '当前你看到的版本',
    desc:  '顾问 / PM 各自上传积累, 验证产品力, 跑通项目主线 4 段',
    deliverables: ['项目洞察', '需求调研', '会议纪要', 'AI 实施建议'],
    state: 'current',
  },
  {
    phase: 'Phase 2',
    when:  'Next · 马上启动',
    title: '融合第二战场行业 Know-How',
    sub:   '把行业沉淀接进工作台',
    desc:  '把第二战场整理的行业方法论、案例资产接入工作台, 让 PM 共享同一份行业知识底座',
    deliverables: ['行业方法论接入', '案例资产对接', '跨项目复用', '知识底座统一'],
    state: 'next',
  },
  {
    phase: 'Phase 3',
    when:  'Future · Q3',
    title: '融入大黄蜂生态',
    sub:   '寻求大黄蜂的落地方案',
    desc:  '作为能力模块接入大黄蜂生态, 探索 Agent 在一线业务的落地路径, 与 CRM 深度联动',
    deliverables: ['大黄蜂接入', '落地方案', '业务联动', 'Agent 能力输出'],
    state: 'future',
  },
]

export default function Slide14Roadmap() {
  return (
    <SlideShell>
      <SlideHeader
        index="15 / 16"
        tag="ROADMAP · 路线图"
        title={<>从独立工作台 → 融合行业 Know-How → <GradText>融入大黄蜂</GradText></>}
        sub="诚实呈现现状 · 不把愿景吹成现状 · 当前阶段在跑通产品力, 后续才是规模化和业务融合"
      />

      <div className="flex-1 grid grid-cols-3 gap-[1.4cqi]" style={{ minHeight: 0 }}>
        {PHASES.map((p, i) => (
          <PhaseCard key={i} {...p} idx={i} />
        ))}
      </div>
    </SlideShell>
  )
}

function PhaseCard({
  phase, when, title, sub, desc, deliverables, state, idx,
}: {
  phase: string; when: string; title: string; sub: string; desc: string;
  deliverables: string[]; state: 'current' | 'next' | 'future'; idx: number
}) {
  const styles = {
    current: {
      bg: PPT.brandGrad,
      text: '#fff',
      label: '#fff',
      bullet: 'rgba(255,255,255,0.85)',
      delivBg: 'rgba(255,255,255,0.18)',
      delivBorder: 'rgba(255,255,255,0.3)',
      glow: PPT.glowBrand,
      border: 'rgba(255,255,255,0.25)',
      lab: '现在',
    },
    next: {
      bg: 'rgba(96,165,250,0.10)',
      text: PPT.fg,
      label: PPT.blue,
      bullet: PPT.blue,
      delivBg: 'rgba(96,165,250,0.12)',
      delivBorder: 'rgba(96,165,250,0.30)',
      glow: '0 0 60px -20px rgba(96,165,250,0.4)',
      border: 'rgba(96,165,250,0.4)',
      lab: '下一步',
    },
    future: {
      bg: 'rgba(255,255,255,0.04)',
      text: PPT.fgMuted,
      label: PPT.fgMuted,
      bullet: PPT.fgMuted,
      delivBg: 'rgba(255,255,255,0.04)',
      delivBorder: 'rgba(255,255,255,0.12)',
      glow: 'none',
      border: 'rgba(255,255,255,0.20)',
      lab: '远期',
    },
  }[state]

  return (
    <div
      className="ppt-stagger-row relative rounded-[1.2cqi] p-[1.6cqi] flex flex-col"
      style={{
        background: styles.bg,
        border: `2px ${state === 'future' ? 'dashed' : 'solid'} ${styles.border}`,
        boxShadow: styles.glow,
        animationDelay: `${300 + idx * 150}ms`,
      } as React.CSSProperties}
    >
      {/* 顶部:阶段标识 */}
      <div className="flex items-center justify-between mb-[1cqi]">
        <div>
          <div
            className="font-mono"
            style={{ fontSize: fz.tiny, color: styles.label, letterSpacing: '0.2em', fontWeight: 700, opacity: 0.85 }}
          >
            {phase.toUpperCase()}
          </div>
          <div
            style={{ fontSize: fz.tiny, color: styles.text, opacity: state === 'current' ? 0.85 : 0.6, marginTop: '0.2cqi' }}
          >
            {when}
          </div>
        </div>
        <PhaseNumber idx={idx + 1} state={state} />
      </div>

      {/* 主标题 */}
      <div
        className="font-extrabold leading-tight"
        style={{ fontSize: fz.h3, color: styles.text, marginBottom: '0.4cqi' }}
      >
        {title}
      </div>
      <div style={{ fontSize: fz.small, color: styles.text, opacity: state === 'current' ? 0.85 : 0.55, marginBottom: '1cqi' }}>
        {sub}
      </div>

      {/* 描述 */}
      <div
        style={{
          fontSize: fz.small,
          color: styles.text,
          opacity: state === 'current' ? 0.95 : 0.7,
          lineHeight: 1.5,
          marginBottom: '1cqi',
          flex: 1,
        }}
      >
        {desc}
      </div>

      {/* 交付物 */}
      <div className="flex flex-wrap gap-[0.4cqi]">
        {deliverables.map((d) => (
          <span
            key={d}
            className="px-[0.7cqi] py-[0.25cqi] rounded-full"
            style={{
              fontSize: fz.tiny,
              background: styles.delivBg,
              color: styles.text,
              border: `1px solid ${styles.delivBorder}`,
              opacity: state === 'current' ? 1 : 0.85,
            }}
          >
            {d}
          </span>
        ))}
      </div>

      {/* 阶段标签 (右上角徽标) */}
      <div
        className="absolute font-mono"
        style={{
          top: '-0.8cqi',
          right: '1.2cqi',
          padding: '0.2cqi 0.8cqi',
          background: state === 'current' ? '#fff' : PPT.bg,
          color: state === 'current' ? PPT.brandDeep : styles.label,
          border: state === 'current' ? 'none' : `1px solid ${styles.border}`,
          fontSize: fz.tiny,
          letterSpacing: '0.15em',
          fontWeight: 700,
          borderRadius: '999px',
        }}
      >
        {styles.lab}
      </div>
    </div>
  )
}

function PhaseNumber({ idx, state }: { idx: number; state: 'current' | 'next' | 'future' }) {
  return (
    <div
      className="flex items-center justify-center font-extrabold rounded-full"
      style={{
        width: '3cqi',
        height: '3cqi',
        background: state === 'current' ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.06)',
        color: state === 'current' ? '#fff' : PPT.fgMuted,
        border: state === 'future' ? '2px dashed rgba(255,255,255,0.30)' : 'none',
        fontSize: fz.body,
      }}
    >
      {idx}
    </div>
  )
}
