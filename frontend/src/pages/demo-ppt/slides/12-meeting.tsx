/**
 * P12 — 会议纪要 · 知识链承上启下 (诚实版)
 *
 * 现状(已上线):
 *   - 纪要 ASR → 打磨 → AI 纪要 → 需求/Stakeholder 提取 → 飞书写入(全链路)
 *   - 纪要作为下一阶段(蓝图/方案)的输入
 *
 * 路线图:
 *   - 反向校验调研覆盖率(纪要里客户提到的需求点 → 自动比对调研问卷漏问)
 */
import { SlideShell, SlideHeader, GradText, TierSection } from '../Shell'
import { PPT, fz } from '../theme'

export default function Slide12Meeting() {
  return (
    <SlideShell>
      <SlideHeader
        index="12 / 15"
        tag="MEETING · 会议纪要"
        title={<>会议纪要不是独立板块, 是<GradText>项目知识链的一环</GradText></>}
        sub="ASR → AI 纪要 → 需求/Stakeholder 提取 — 现在已经能作为下一阶段(蓝图/方案)的完整输入, 反查调研覆盖率是下一步"
      />

      <div className="flex-1 grid grid-rows-[auto_1fr] gap-[1.4cqi]" style={{ minHeight: 0 }}>

        {/* 上半:已上线 — 纪要 5 阶段流水线 */}
        <TierSection
          status="now"
          title="纪要全链路 5 阶段"
          hint="录音文件进来 → 走完整条流水线 → 结构化产物自动写飞书文档 / 多维表"
        >
          <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] items-center gap-[0.5cqi]">
            <PipelineStep n={1} icon="mic"     label="ASR 转写"    sub="讯飞/小米/Whisper" color={PPT.brand} />
            <Arrow />
            <PipelineStep n={2} icon="wand"    label="文本打磨"    sub="去口语 / 修标点"   color={PPT.purple} />
            <Arrow />
            <PipelineStep n={3} icon="doc"     label="AI 纪要"     sub="议题 / 结论 / 待办" color={PPT.blue} />
            <Arrow />
            <PipelineStep n={4} icon="extract" label="需求 / 干系人" sub="结构化提取"        color={PPT.amber} />
            <Arrow />
            <PipelineStep n={5} icon="bitable" label="写飞书"      sub="文档 + 多维表"      color={PPT.green} />
          </div>
        </TierSection>

        {/* 下半:左路线图(反查) + 右已上线(前喂)*/}
        <div className="grid grid-cols-2 gap-[1.4cqi]" style={{ minHeight: 0 }}>

          {/* 左:路线图 — 反查覆盖率 */}
          <TierSection status="next" pad="1.4cqi" className="flex flex-col">
            <div className="flex items-center justify-between mb-[0.6cqi]" style={{ marginTop: '0.4cqi' }}>
              <span style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg }}>
                反查 · 调研覆盖率
              </span>
              <DirectionBadge dir="back" />
            </div>
            <div style={{ fontSize: fz.small, color: PPT.fgMuted, lineHeight: 1.5, marginBottom: '0.6cqi' }}>
              纪要里客户提到的需求点 → 自动比对调研问卷 → 标"已覆盖 / 漏问"
            </div>
            <div className="flex-1 flex flex-col gap-[0.4cqi]">
              <CoverageRow label="销售线索来源"   status="covered" />
              <CoverageRow label="商机阶段管控"   status="covered" />
              <CoverageRow label="存量数据迁移"   status="missing" />
              <CoverageRow label="移动端使用场景" status="missing" />
            </div>
            <div
              className="mt-[0.6cqi] pt-[0.5cqi] text-center font-mono"
              style={{
                borderTop: '1px dashed rgba(96,165,250,0.30)',
                fontSize: fz.tiny,
                color: PPT.blue,
                letterSpacing: '0.15em',
              }}
            >
              依赖 · 调研问卷与纪要的语义对齐
            </div>
          </TierSection>

          {/* 右:已上线 — 前喂下一阶段 */}
          <TierSection status="now" pad="1.4cqi" className="flex flex-col">
            <div className="flex items-center justify-between mb-[0.6cqi]" style={{ marginTop: '0.4cqi' }}>
              <span style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg }}>
                前喂 · 下一阶段输入包
              </span>
              <DirectionBadge dir="forward" />
            </div>
            <div style={{ fontSize: fz.small, color: PPT.fgMuted, lineHeight: 1.5, marginBottom: '0.6cqi' }}>
              纪要 + 调研结果 + 洞察报告 → 打包成蓝图 / 实施方案的完整输入
            </div>

            <div
              className="rounded-[0.8cqi] p-[0.8cqi] flex-1"
              style={{
                background: 'rgba(0,0,0,0.3)',
                border: `1px solid ${PPT.borderHi}`,
              }}
            >
              <div className="font-mono mb-[0.5cqi]" style={{ fontSize: fz.tiny, color: PPT.brandMid, letterSpacing: '0.15em' }}>
                INPUT PACKAGE
              </div>
              <div className="flex flex-col gap-[0.3cqi]">
                <PackageItem label="项目洞察 · 10 模块"     color={PPT.brand} />
                <PackageItem label="需求调研 · 结构化字段"   color={PPT.purple} />
                <PackageItem label="会议纪要 · N 次访谈整合" color={PPT.green} />
              </div>
              <div
                className="mt-[0.5cqi] pt-[0.5cqi] flex items-center justify-center gap-[0.4cqi]"
                style={{
                  borderTop: `1px dashed ${PPT.borderHi}`,
                  fontSize: fz.tiny,
                  color: PPT.fg,
                }}
              >
                <span>→</span>
                <strong style={{ color: PPT.brandMid }}>蓝图 / 实施方案</strong>
                <span style={{ color: PPT.fgMuted }}>一键生成输入</span>
              </div>
            </div>
          </TierSection>
        </div>
      </div>
    </SlideShell>
  )
}

// ── 流水线节点 ──
function PipelineStep({
  n, icon, label, sub, color,
}: { n: number; icon: string; label: string; sub: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-[0.3cqi]">
      <div
        className="relative flex items-center justify-center rounded-[0.8cqi]"
        style={{
          width: '3.4cqi', height: '3.4cqi',
          background: `${color}1F`,
          color,
          border: `1.5px solid ${color}55`,
          boxShadow: `0 0 16px -6px ${color}99`,
        }}
      >
        <PipelineIcon type={icon} />
        <span
          className="font-mono absolute"
          style={{
            top: '-0.6cqi', right: '-0.6cqi',
            width: '1.4cqi', height: '1.4cqi',
            borderRadius: '50%',
            background: color,
            color: '#fff',
            fontSize: fz.tiny,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {n}
        </span>
      </div>
      <div style={{ fontSize: fz.small, fontWeight: 600, color: PPT.fg, textAlign: 'center' }}>
        {label}
      </div>
      <div style={{ fontSize: fz.tiny, color: PPT.fgMuted, textAlign: 'center', letterSpacing: '0.05em' }}>
        {sub}
      </div>
    </div>
  )
}

function Arrow() {
  return (
    <svg width="1.6cqi" height="1.4cqi" viewBox="0 0 24 14" fill="none">
      <path d="M2 7h18M16 2l5 5-5 5" stroke={PPT.fgMuted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PipelineIcon({ type }: { type: string }) {
  const paths: Record<string, React.ReactNode> = {
    mic:     <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M9 22h6" /></>,
    wand:    <><path d="M3 21l9-9M14 5l5 5M16 3l5 5M9 16l-3 3" /></>,
    doc:     <><rect x="6" y="3" width="14" height="18" rx="1.5" /><path d="M9 9h8M9 13h8M9 17h5" /></>,
    extract: <><circle cx="9" cy="8" r="3.5" /><path d="M2 21c0-4 3-7 7-7s7 3 7 7" /><circle cx="17" cy="6" r="2.5" /></>,
    bitable: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></>,
  }
  return (
    <svg viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[type]}
    </svg>
  )
}

// ── 方向 badge ──
function DirectionBadge({ dir }: { dir: 'back' | 'forward' }) {
  return (
    <span
      className="flex items-center justify-center rounded-[0.5cqi] flex-shrink-0"
      style={{
        width: '2cqi', height: '2cqi',
        background: dir === 'back' ? 'rgba(96,165,250,0.18)' : 'rgba(255,141,26,0.18)',
        border: `1px solid ${dir === 'back' ? 'rgba(96,165,250,0.40)' : 'rgba(255,141,26,0.40)'}`,
      }}
    >
      <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none">
        {dir === 'back' ? (
          <path d="M19 12H5M11 5l-6 7 6 7" stroke={PPT.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M5 12h14M13 5l6 7-6 7" stroke={PPT.brand} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </span>
  )
}

// ── 覆盖行 ──
function CoverageRow({ label, status }: { label: string; status: 'covered' | 'missing' }) {
  const isCovered = status === 'covered'
  const color = isCovered ? PPT.green : PPT.rose
  return (
    <div
      className="flex items-center gap-[0.5cqi] px-[0.7cqi] py-[0.4cqi] rounded-[0.4cqi]"
      style={{
        background: isCovered ? 'rgba(52,211,153,0.06)' : 'rgba(251,113,133,0.10)',
        border: `1px solid ${isCovered ? 'rgba(52,211,153,0.20)' : 'rgba(251,113,133,0.30)'}`,
      }}
    >
      <span
        className="font-mono px-[0.3cqi] py-[0.05cqi] rounded-[0.2cqi] flex-shrink-0"
        style={{
          fontSize: fz.tiny,
          background: isCovered ? 'rgba(52,211,153,0.20)' : 'rgba(251,113,133,0.20)',
          color,
          fontWeight: 700,
          letterSpacing: '0.05em',
        }}
      >
        {isCovered ? '已覆盖' : '漏问'}
      </span>
      <span style={{ flex: 1, fontSize: fz.small, color: PPT.fg, fontWeight: 500 }}>
        {label}
      </span>
    </div>
  )
}

// ── 输入包 item ──
function PackageItem({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-[0.5cqi]">
      <span
        style={{
          width: '0.6cqi', height: '0.6cqi',
          background: color,
          borderRadius: '50%',
          flexShrink: 0,
          boxShadow: `0 0 6px ${color}99`,
        }}
      />
      <span style={{ fontSize: fz.small, color: PPT.fg }}>
        {label}
      </span>
    </div>
  )
}

