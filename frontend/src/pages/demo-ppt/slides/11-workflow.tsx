/**
 * P11 — PM 实际工作流整合
 *
 * 展示 PM 一天里 4 个工作面的 AI 辅助 — 不再单独讲每个功能, 而是看它们如何串联
 *   1. 接手 → 三栏工作区 看洞察 + 引用追溯
 *   2. 调研 → iPad 顾问勾选 + 顾问按钮触发追问
 *   3. 访谈 → 录音上传 → 飞书自动出纪要
 *   4. 复盘 → 项目知识链下游 = 下一阶段输入包
 */
import type { ReactNode } from 'react'
import { SlideShell, SlideHeader, GradText } from '../Shell'
import { PPT, fz } from '../theme'

const FACETS = [
  {
    n: '01',
    title: '接手',
    icon: 'workspace',
    sub: '三栏工作区',
    detail: '左文档 / 中报告 / 右引用 — 角标点跳原文',
    color: PPT.brand,
    visual: 'workspace',
  },
  {
    n: '02',
    title: '调研',
    icon: 'tablet',
    sub: '顾问当场勾选',
    detail: 'iPad 大按钮 + 父题选完点「+ 追问」',
    color: PPT.purple,
    visual: 'tablet',
  },
  {
    n: '03',
    title: '访谈',
    icon: 'meeting',
    sub: '录音 → 飞书',
    detail: 'ASR → AI 纪要 → 自动写飞书多维表',
    color: PPT.green,
    visual: 'meeting',
  },
  {
    n: '04',
    title: '下一步',
    icon: 'next',
    sub: '蓝图输入包',
    detail: '洞察 + 调研 + 纪要 打包给下一阶段',
    color: PPT.blue,
    visual: 'package',
  },
]

export default function Slide11Workflow() {
  return (
    <SlideShell>
      <SlideHeader
        index="11 / 15"
        tag="整合 · PM 实际工作流"
        title={<>PM 一天的 4 个工作面 · <GradText>都被 AI 串起来</GradText></>}
        sub="不是 4 个独立工具 — 而是一条「接手 → 调研 → 访谈 → 蓝图」的工作链, 每一步的 AI 产物都喂给下一步"
      />

      <div className="flex-1 grid grid-cols-4 gap-[1.2cqi]" style={{ minHeight: 0 }}>
        {FACETS.map((f, i) => (
          <FacetCard key={i} {...f} />
        ))}
      </div>

      {/* 底部:产物互喂示意 */}
      <div
        className="ppt-stagger-row mt-[1.4cqi] flex items-center justify-center gap-[0.6cqi] py-[0.8cqi] px-[1.4cqi] rounded-full mx-auto"
        style={{
          background: PPT.bgPanel,
          border: `1px solid ${PPT.borderHi}`,
          boxShadow: PPT.glowBrand,
          fontSize: fz.body,
          color: PPT.fg,
          maxWidth: '90%',
        }}
      >
        <span className="font-mono" style={{ fontSize: fz.tiny, color: PPT.brandMid, letterSpacing: '0.15em', fontWeight: 700 }}>
          KNOWLEDGE CHAIN
        </span>
        <span style={{ color: PPT.brand, fontWeight: 700 }}>洞察</span>
        <span style={{ color: PPT.fgMuted }}>↔</span>
        <span style={{ color: PPT.purple, fontWeight: 700 }}>调研</span>
        <span style={{ color: PPT.fgMuted }}>↔</span>
        <span style={{ color: PPT.green, fontWeight: 700 }}>纪要</span>
        <span style={{ color: PPT.fgMuted }}>→</span>
        <span style={{ color: PPT.blue, fontWeight: 700 }}>蓝图</span>
        <span style={{ color: PPT.fgMuted, fontSize: fz.small }}>· 项目知识链上下文不丢</span>
      </div>
    </SlideShell>
  )
}

function FacetCard({
  n, title, sub, detail, color, visual,
}: { n: string; title: string; sub: string; detail: string; color: string; visual: string; icon: string }) {
  return (
    <div
      className="ppt-stagger-row rounded-[1cqi] overflow-hidden flex flex-col"
      style={{
        background: PPT.bgPanel,
        border: `1px solid ${color}55`,
        boxShadow: `0 0 30px -15px ${color}99`,
      }}
    >
      {/* 顶部 header */}
      <div
        className="px-[1cqi] py-[0.6cqi] flex items-center justify-between"
        style={{
          background: `${color}1A`,
          borderBottom: `1px solid ${color}40`,
        }}
      >
        <div className="flex items-center gap-[0.5cqi]">
          <span
            className="font-mono font-extrabold flex items-center justify-center rounded-[0.4cqi]"
            style={{
              width: '2cqi', height: '2cqi',
              background: color,
              color: '#fff',
              fontSize: fz.tiny,
            }}
          >
            {n}
          </span>
          <span style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg }}>
            {title}
          </span>
        </div>
        <span
          className="font-mono"
          style={{ fontSize: fz.tiny, color, letterSpacing: '0.1em' }}
        >
          {sub}
        </span>
      </div>

      {/* 视觉 mockup */}
      <div
        className="flex-1 p-[1cqi] flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.25)', minHeight: 0 }}
      >
        <FacetVisual type={visual} color={color} />
      </div>

      {/* 描述 */}
      <div
        className="px-[1cqi] py-[0.6cqi]"
        style={{
          fontSize: fz.tiny,
          color: PPT.fgMuted,
          lineHeight: 1.4,
          textAlign: 'center',
          borderTop: `1px solid ${PPT.border}`,
        }}
      >
        {detail}
      </div>
    </div>
  )
}

// ── 4 个 mini mockup ──
function FacetVisual({ type, color }: { type: string; color: string }): ReactNode {
  if (type === 'workspace') return <WorkspaceMini color={color} />
  if (type === 'tablet')    return <TabletMini color={color} />
  if (type === 'meeting')   return <MeetingMini color={color} />
  if (type === 'package')   return <PackageMini color={color} />
  return null
}

function WorkspaceMini({ color }: { color: string }) {
  return (
    <div className="w-full h-full grid grid-cols-[1fr_2fr_1.4fr] gap-[0.3cqi]" style={{ minHeight: '8cqi' }}>
      <div className="rounded-[0.3cqi]" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-[0.4cqi] m-[0.3cqi]" style={{ background: PPT.fgDim, borderRadius: '999px' }} />
        <div className="h-[0.3cqi] mx-[0.3cqi] mb-[0.2cqi]" style={{ background: 'rgba(255,255,255,0.10)', borderRadius: '999px' }} />
        <div className="h-[0.3cqi] mx-[0.3cqi]" style={{ background: 'rgba(255,255,255,0.10)', borderRadius: '999px' }} />
      </div>
      <div className="rounded-[0.3cqi] p-[0.3cqi] flex flex-col gap-[0.2cqi]" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <div style={{ height: '0.3cqi', background: PPT.fgDim, borderRadius: '999px' }} />
        <div style={{ height: '0.25cqi', background: 'rgba(255,255,255,0.08)', borderRadius: '999px' }} />
        <div className="flex items-center gap-[0.2cqi]">
          <div style={{ height: '0.25cqi', flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: '999px' }} />
          <span className="font-mono" style={{ fontSize: '0.6cqi', color, background: `${color}33`, padding: '0 2px', borderRadius: '2px' }}>D1</span>
        </div>
        <div style={{ height: '0.25cqi', background: 'rgba(255,255,255,0.08)', borderRadius: '999px' }} />
      </div>
      <div className="rounded-[0.3cqi] p-[0.3cqi]" style={{ background: `${color}15`, border: `1px solid ${color}40` }}>
        <div className="font-mono" style={{ fontSize: '0.7cqi', color, marginBottom: '0.2cqi' }}>[D1]</div>
        <div style={{ height: '0.25cqi', background: `${color}aa`, borderRadius: '999px', marginBottom: '0.15cqi' }} />
        <div style={{ height: '0.25cqi', background: 'rgba(255,255,255,0.10)', borderRadius: '999px' }} />
      </div>
    </div>
  )
}

function TabletMini({ color }: { color: string }) {
  return (
    <div
      className="rounded-[0.6cqi] p-[0.4cqi] flex flex-col gap-[0.4cqi]"
      style={{
        width: '85%',
        aspectRatio: '4 / 3',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
      }}
    >
      <div style={{ height: '0.3cqi', width: '60%', background: PPT.fgDim, borderRadius: '999px' }} />
      <div style={{ height: '0.4cqi', background: 'rgba(255,255,255,0.18)', borderRadius: '999px' }} />
      <div className="flex gap-[0.2cqi]">
        <div style={{ flex: 1, height: '0.7cqi', background: 'rgba(255,255,255,0.08)', borderRadius: '999px' }} />
        <div style={{ flex: 1, height: '0.7cqi', background: color, borderRadius: '999px', boxShadow: `0 0 6px ${color}` }} />
        <div style={{ flex: 1, height: '0.7cqi', background: 'rgba(255,255,255,0.08)', borderRadius: '999px' }} />
      </div>
      <div className="ml-[0.6cqi] pl-[0.4cqi] mt-[0.2cqi]" style={{ borderLeft: `2px solid ${color}` }}>
        <div className="font-mono mb-[0.2cqi]" style={{ fontSize: '0.65cqi', color }}>+ 追问</div>
        <div className="flex gap-[0.15cqi] flex-wrap">
          {[0,1,2,3].map(i => (
            <div key={i} style={{ width: '0.9cqi', height: '0.4cqi', background: 'rgba(255,255,255,0.10)', borderRadius: '999px' }} />
          ))}
        </div>
      </div>
    </div>
  )
}

function MeetingMini({ color }: { color: string }) {
  return (
    <div className="w-full h-full flex flex-col gap-[0.4cqi]" style={{ minHeight: '8cqi' }}>
      <div className="flex items-center gap-[0.3cqi]">
        <div
          className="rounded-full"
          style={{ width: '1cqi', height: '1cqi', background: color, boxShadow: `0 0 6px ${color}` }}
        />
        <div style={{ flex: 1, height: '0.6cqi', background: `${color}33`, borderRadius: '999px' }}>
          <div style={{ width: '70%', height: '100%', background: color, borderRadius: '999px' }} />
        </div>
        <span className="font-mono" style={{ fontSize: '0.6cqi', color }}>ASR</span>
      </div>
      <div className="flex-1 rounded-[0.3cqi] p-[0.3cqi] flex flex-col gap-[0.15cqi]" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <div className="font-mono" style={{ fontSize: '0.55cqi', color: PPT.fgMuted }}>纪要 · 议题</div>
        {[0,1,2].map(i => (
          <div key={i} style={{ height: '0.2cqi', background: 'rgba(255,255,255,0.10)', borderRadius: '999px', width: `${85 - i*10}%` }} />
        ))}
      </div>
      <div
        className="rounded-[0.3cqi] p-[0.3cqi] flex items-center gap-[0.3cqi]"
        style={{ background: `${color}1A`, border: `1px solid ${color}40` }}
      >
        <span className="font-mono" style={{ fontSize: '0.55cqi', color, fontWeight: 700 }}>飞书</span>
        <div className="grid grid-cols-3 gap-[0.1cqi] flex-1">
          {[0,1,2,3,4,5].map(i => (
            <div key={i} style={{ height: '0.2cqi', background: 'rgba(255,255,255,0.18)', borderRadius: '999px' }} />
          ))}
        </div>
      </div>
    </div>
  )
}

function PackageMini({ color }: { color: string }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-[0.4cqi]">
      <div
        className="rounded-[0.5cqi] p-[0.5cqi] w-full flex flex-col gap-[0.3cqi]"
        style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}40` }}
      >
        <div className="font-mono" style={{ fontSize: '0.55cqi', color, letterSpacing: '0.1em', fontWeight: 700 }}>
          INPUT PACKAGE
        </div>
        {[
          { c: PPT.brand,  label: '洞察' },
          { c: PPT.purple, label: '调研' },
          { c: PPT.green,  label: '纪要' },
        ].map((it, i) => (
          <div key={i} className="flex items-center gap-[0.3cqi]">
            <div
              className="rounded-full"
              style={{ width: '0.5cqi', height: '0.5cqi', background: it.c, boxShadow: `0 0 4px ${it.c}` }}
            />
            <div style={{ height: '0.25cqi', background: 'rgba(255,255,255,0.08)', flex: 1, borderRadius: '999px' }} />
            <span style={{ fontSize: '0.55cqi', color: PPT.fgMuted }}>{it.label}</span>
          </div>
        ))}
      </div>
      <svg width="1.4cqi" height="1.4cqi" viewBox="0 0 24 24" fill="none">
        <path d="M12 5v14M5 12l7 7 7-7" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="font-mono" style={{ fontSize: '0.7cqi', color, fontWeight: 700, letterSpacing: '0.1em' }}>
        蓝 图 / 方 案
      </div>
    </div>
  )
}
