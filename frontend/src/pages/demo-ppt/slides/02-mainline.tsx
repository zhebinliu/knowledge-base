/**
 * P02 — 实施项目主线
 * 4 阶段时间轴, 高亮 "项目洞察" + "需求调研" 两个本次重点
 */
import type { CSSProperties } from 'react'
import { SlideShell, SlideHeader, GradText } from '../Shell'
import { PPT, fz } from '../theme'

const PHASES = [
  { id: '01', name: '立项',     desc: '项目接手 · 信息梳理',  focus: true,  detail: '项目洞察' },
  { id: '02', name: '调研',     desc: '客户访谈 · 需求挖掘',  focus: true,  detail: '需求调研' },
  { id: '03', name: '蓝图',     desc: '方案设计 · 启动会',    focus: false, detail: '' },
  { id: '04', name: '配置',     desc: 'CRM 字段 / 流程',       focus: false, detail: '' },
  { id: '05', name: '测试',     desc: 'UAT / 集成验证',        focus: false, detail: '' },
  { id: '06', name: '培训',     desc: '管理员 / 终端用户',     focus: false, detail: '' },
  { id: '07', name: '上线',     desc: '切换 · 验收',           focus: false, detail: '' },
]

export default function Slide02Mainline() {
  return (
    <SlideShell>
      <SlideHeader
        index="01"
        tag="MAINLINE"
        title={<>实施项目<GradText>主线</GradText> · 顾问每天在跑的路径</>}
        sub="本次汇报聚焦最前面两段 — 顾问最耗精力, 也是 AI 提效最有杠杆的位置"
      />

      <div className="flex-1 flex flex-col justify-center" style={{ padding: '0 2cqi' }}>
        {/* Timeline */}
        <div className="relative ppt-stagger-row" style={{ marginBottom: '6cqi' }}>
          {/* 背景轴线 */}
          <svg
            className="absolute"
            style={{ left: '4%', right: '4%', top: '50%', transform: 'translateY(-50%)', height: '6px', width: '92%' }}
            viewBox="0 0 1000 6"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="mainline-grad" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0"   stopColor="#FF8D1A" stopOpacity="0.9" />
                <stop offset="0.5" stopColor="#FF8D1A" stopOpacity="0.4" />
                <stop offset="1"   stopColor="#FFFFFF" stopOpacity="0.1" />
              </linearGradient>
            </defs>
            <rect x="0" y="2" width="1000" height="2" fill="rgba(255,255,255,0.08)" rx="1" />
            <rect x="0" y="2" width="1000" height="2" fill="url(#mainline-grad)" rx="1"
                  className="ppt-line-draw" style={{ '--len': 1000 } as CSSProperties} />
          </svg>

          {/* 节点 — 7 阶段 */}
          <div className="relative grid grid-cols-7 gap-0">
            {PHASES.map((p, i) => (
              <PhaseNode key={p.id} phase={p} idx={i} />
            ))}
          </div>
        </div>

        {/* 底部强调 — 聚焦两段 */}
        <div className="ppt-stagger-row flex items-center justify-center gap-[1.2cqi]">
          <span style={{ fontSize: fz.body, color: PPT.fgMuted, fontWeight: 300 }}>
            本次汇报聚焦
          </span>
          <span
            className="px-[1.6cqi] py-[0.6cqi] rounded-full font-bold"
            style={{
              fontSize: fz.body,
              background: PPT.brandGrad,
              color: '#fff',
              boxShadow: PPT.glowBrand,
              letterSpacing: '0.05em',
            }}
          >
            01 项目洞察 · 02 需求调研
          </span>
          <span style={{ fontSize: fz.body, color: PPT.fgMuted, fontWeight: 300 }}>
            两段
          </span>
        </div>
      </div>
    </SlideShell>
  )
}

// ── 单个阶段节点 ──
function PhaseNode({ phase, idx }: { phase: typeof PHASES[number]; idx: number }) {
  const focused = phase.focus
  return (
    <div className="flex flex-col items-center gap-[1.2cqi]">
      {/* 上方:阶段编号 */}
      <div
        className="font-mono font-bold"
        style={{
          fontSize: fz.tiny,
          color: focused ? PPT.brand : PPT.fgDim,
          letterSpacing: '0.3em',
          minHeight: '2cqi',
        }}
      >
        PHASE {phase.id}
      </div>

      {/* 节点圆点 */}
      <div className="relative" style={{ height: '8cqi', display: 'flex', alignItems: 'center' }}>
        {focused ? (
          <FocusedDot label={phase.name} idx={idx} />
        ) : (
          <DimDot label={phase.name} />
        )}
      </div>

      {/* 下方:描述 */}
      <div
        className="text-center"
        style={{
          fontSize: fz.body,
          color: focused ? PPT.fg : PPT.fgDim,
          fontWeight: focused ? 600 : 400,
        }}
      >
        {phase.desc}
      </div>

      {/* 高亮节点的额外 detail label */}
      {focused && phase.detail && (
        <div
          className="font-mono px-[1cqi] py-[0.3cqi] rounded-full mt-[0.5cqi]"
          style={{
            fontSize: fz.tiny,
            background: PPT.brandSoft,
            color: PPT.brandMid,
            border: `1px solid ${PPT.borderHi}`,
            letterSpacing: '0.1em',
          }}
        >
          ★ {phase.detail}
        </div>
      )}
    </div>
  )
}

function FocusedDot({ label, idx }: { label: string; idx: number }) {
  return (
    <div
      className="relative ppt-num-pop"
      style={{
        animationDelay: `${600 + idx * 120}ms`,
      }}
    >
      {/* 外光晕呼吸 */}
      <div
        className="absolute rounded-full ppt-pulse"
        style={{
          inset: '-30%',
          background: 'radial-gradient(circle, rgba(255,141,26,0.45), transparent 70%)',
        }}
      />
      {/* 主圆 */}
      <div
        className="relative flex items-center justify-center font-extrabold"
        style={{
          width: '7cqi',
          height: '7cqi',
          borderRadius: '50%',
          background: PPT.brandGrad,
          color: '#fff',
          fontSize: fz.h3,
          boxShadow: PPT.glowBrand + ', inset 0 1px 0 rgba(255,255,255,0.3)',
          border: '2px solid rgba(255,255,255,0.4)',
        }}
      >
        {label}
      </div>
    </div>
  )
}

function DimDot({ label }: { label: string }) {
  return (
    <div
      className="flex items-center justify-center font-medium"
      style={{
        width: '5.5cqi',
        height: '5.5cqi',
        borderRadius: '50%',
        background: PPT.bg,  // 实色, 遮住背后的水平线
        color: PPT.fgMuted,
        fontSize: fz.body,
        border: `1.5px solid rgba(255,255,255,0.18)`,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04), 0 0 12px -4px rgba(0,0,0,0.5)',
      }}
    >
      {label}
    </div>
  )
}
