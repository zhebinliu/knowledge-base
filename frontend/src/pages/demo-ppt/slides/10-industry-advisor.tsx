/**
 * P10 — 行业 know-how 落地两件事
 *
 * 核心:把"行业经验"装进系统的两个具体形态
 *   1. 行业包(industry_packs)— 给题(已上线)
 *   2. AI 实施建议(best_practice_advisor)— 给建议(已上线)
 *
 * 路线图:
 *   - 行业 benchmark 数据库 → 答案对照
 *   - 类似案例库 → 主动建议(方案/风险/资源)
 */
import { SlideShell, SlideHeader, GradText, TierSection } from '../Shell'
import { PPT, fz } from '../theme'

const INDUSTRY_PACKS = [
  { name: '智能制造', code: 'manufacturing', fields: 8, color: PPT.brand },
  { name: '能源',      code: 'energy',         fields: 9, color: PPT.amber },
  { name: '医药',      code: 'healthcare',     fields: 8, color: PPT.green },
  { name: 'SaaS',      code: 'technology',     fields: 7, color: PPT.blue },
]

export default function Slide10IndustryAdvisor() {
  return (
    <SlideShell>
      <SlideHeader
        index="10 / 15"
        tag="目的 2 · 专业性 · 解法 3"
        title={<>行业 know-how 落地两件事 · <GradText>给题 + 给建议</GradText></>}
        sub="行业包提供该问的题 · AI 实施建议给每题写贴合的方案 — 都基于跨项目沉淀的最佳实践库"
      />

      <div className="flex-1 grid grid-rows-[auto_1fr] gap-[1.4cqi]" style={{ minHeight: 0 }}>

        {/* 上半:已上线两件事 + 行业包 */}
        <TierSection
          status="now"
          title="已上线 · 4 个行业包 + 每题 AI 建议"
        >
          <div className="grid grid-cols-[1.4fr_1.6fr] gap-[1.4cqi]">
            {/* 左:4 行业包 */}
            <div className="grid grid-cols-2 gap-[0.8cqi]">
              {INDUSTRY_PACKS.map((p) => (
                <div
                  key={p.code}
                  className="px-[1cqi] py-[0.7cqi] rounded-[0.6cqi] flex items-center justify-between"
                  style={{
                    background: 'rgba(0,0,0,0.25)',
                    border: `1px solid ${p.color}55`,
                  }}
                >
                  <div>
                    <div style={{ fontSize: fz.small, fontWeight: 700, color: PPT.fg }}>
                      {p.name}
                    </div>
                    <div className="font-mono" style={{ fontSize: fz.tiny, color: PPT.fgMuted }}>
                      {p.code}
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className="font-mono font-extrabold"
                      style={{
                        fontSize: fz.h3,
                        color: p.color,
                        textShadow: `0 0 12px ${p.color}99`,
                      }}
                    >
                      {p.fields}
                    </span>
                    <div style={{ fontSize: fz.tiny, color: PPT.fgMuted, marginTop: '0.1cqi' }}>
                      字段
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 右:AI 实施建议示例 */}
            <div
              className="rounded-[0.8cqi] p-[1cqi] flex flex-col gap-[0.5cqi]"
              style={{
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderLeft: `3px solid ${PPT.brand}`,
              }}
            >
              <div>
                <span
                  className="font-mono inline-block mb-[0.2cqi] px-[0.4cqi] py-[0.05cqi] rounded-[0.2cqi]"
                  style={{
                    fontSize: fz.tiny,
                    color: PPT.brandMid,
                    background: PPT.brandSoft,
                    border: `1px solid ${PPT.borderHi}`,
                  }}
                >
                  M05_contract
                </span>
                <div style={{ fontSize: fz.small, fontWeight: 600, color: PPT.fg, lineHeight: 1.3 }}>
                  合同审批流程? 法务介入时机?
                </div>
              </div>
              <div className="flex items-center gap-[0.4cqi]">
                <SparkIcon />
                <span className="font-mono" style={{ fontSize: fz.tiny, color: PPT.brandMid, letterSpacing: '0.15em', fontWeight: 700 }}>
                  AI 实施建议(best_practice_advisor)
                </span>
              </div>
              <p style={{ fontSize: fz.tiny, color: PPT.fg, lineHeight: 1.5 }}>
                建议「商务初稿 → 法务预审(3 天) → 商务对客 → 法务复审 → 高管签」五步。法务预审在初稿阶段而不是终稿可减少返工。验收口径单独走附件,避免主合同来回改。
              </p>
            </div>
          </div>
        </TierSection>

        {/* 下半:路线图 */}
        <TierSection
          status="next"
          title="路线图 · 让 know-how 从「给题/给建议」升级到「主动浮出」"
        >
          <div className="grid grid-cols-3 gap-[1cqi]">
            <RoadmapCard
              icon="ruler"
              title="行业 benchmark"
              desc="客户答数据时,自动对照同行业平均/头部"
            />
            <RoadmapCard
              icon="library"
              title="类似项目案例库"
              desc="基于客户特征匹配过往成功案例 + 经典踩坑"
            />
            <RoadmapCard
              icon="bell"
              title="主动建议三类"
              desc="方案推荐 / 风险预警 / 资源建议 主动浮出"
            />
          </div>
        </TierSection>
      </div>
    </SlideShell>
  )
}

function RoadmapCard({
  icon, title, desc,
}: { icon: 'ruler' | 'library' | 'bell'; title: string; desc: string }) {
  return (
    <div
      className="flex items-start gap-[0.8cqi] p-[1cqi] rounded-[0.8cqi]"
      style={{
        background: 'rgba(96,165,250,0.06)',
        border: '1px dashed rgba(96,165,250,0.40)',
      }}
    >
      <span
        className="flex-shrink-0 flex items-center justify-center rounded-[0.5cqi]"
        style={{
          width: '2.4cqi', height: '2.4cqi',
          background: 'rgba(96,165,250,0.14)',
          color: PPT.blue,
          border: '1px solid rgba(96,165,250,0.40)',
        }}
      >
        <RIcon type={icon} />
      </span>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg, marginBottom: '0.2cqi' }}>
          {title}
        </div>
        <div style={{ fontSize: fz.tiny, color: PPT.fgMuted, lineHeight: 1.4 }}>
          {desc}
        </div>
      </div>
    </div>
  )
}

function SparkIcon() {
  return (
    <svg width="1.2cqi" height="1.2cqi" viewBox="0 0 24 24" fill="none">
      <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" fill={PPT.brand} stroke={PPT.brand} strokeWidth="0.5" strokeLinejoin="round" />
    </svg>
  )
}

function RIcon({ type }: { type: 'ruler' | 'library' | 'bell' }) {
  const paths: Record<string, React.ReactNode> = {
    ruler:   <><rect x="2" y="9" width="20" height="6" rx="0.5" /><path d="M6 9v3M10 9v4M14 9v3M18 9v4" /></>,
    library: <><path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14H6a2 2 0 0 1 0-4h14" /><path d="M9 7h6M9 11h6" /></>,
    bell:    <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
  }
  return (
    <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[type]}
    </svg>
  )
}
