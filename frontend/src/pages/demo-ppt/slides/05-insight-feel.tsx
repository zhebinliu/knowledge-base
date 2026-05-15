/**
 * P05 — 项目洞察 · PM 视角 · AI 可靠性兜底
 *
 * 改正:项目洞察是 PM 内部用的, 不是给客户看的。
 * 核心价值:让 PM 敢直接拿 AI 输出去用 — 即"反幻觉"。
 *
 * 三层兜底:
 *   1. 整篇喂入(全文上下文, 不切片漏意)
 *   2. 知识库召回(历史项目 / 行业 know-how 当事实底)
 *   3. 引用追溯(每条结论挂角标, PM 一键验证)
 */
import { SlideShell, SlideHeader, GradText, GlassCard } from '../Shell'
import { PPT, fz } from '../theme'

export default function Slide05InsightTrust() {
  return (
    <SlideShell>
      <SlideHeader
        index="05 / 15"
        tag="TRUST · 给 PM 的可靠性"
        title={<>AI 最大的雷是<GradText>幻觉</GradText> — 三层兜底让 PM 敢直接用</>}
        sub={<>项目洞察的产物是给<strong>交接 PM</strong> 用的认知地图 — 让接手人不必啃几天文档, 就能对项目阶段、风险、关键人物、未完事项有<strong>全面认知和风险评估</strong>。</>}
      />

      <div className="flex-1 grid grid-cols-[1.3fr_1fr] gap-[2cqi]" style={{ minHeight: 0 }}>

        {/* 左:三栏工作区 mockup —— PM 实际看到的样子 */}
        <div
          className="ppt-stagger-row relative rounded-[1.2cqi] overflow-hidden"
          style={{
            background: PPT.bgPanel,
            border: `1px solid ${PPT.border}`,
            backdropFilter: 'blur(20px)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 30px 60px -20px rgba(0,0,0,0.6)',
          }}
        >
          {/* 应用顶栏 */}
          <div
            className="flex items-center gap-[0.6cqi] px-[1.2cqi] py-[0.7cqi]"
            style={{ background: 'rgba(0,0,0,0.3)', borderBottom: `1px solid ${PPT.border}` }}
          >
            <span className="w-[0.7cqi] h-[0.7cqi] rounded-full" style={{ background: '#FB7185' }} />
            <span className="w-[0.7cqi] h-[0.7cqi] rounded-full" style={{ background: '#FBBF24' }} />
            <span className="w-[0.7cqi] h-[0.7cqi] rounded-full" style={{ background: '#34D399' }} />
            <span
              className="ml-[1cqi] font-mono"
              style={{ fontSize: fz.tiny, color: PPT.fgMuted, letterSpacing: '0.1em' }}
            >
              实施工作台 · 项目 · XX 客户 · 洞察报告
            </span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: fz.tiny, color: PPT.brandMid, letterSpacing: '0.1em' }}>
              PM 私域
            </span>
          </div>

          {/* 三栏 */}
          <div className="grid grid-cols-[1fr_1.8fr_1.4fr] h-[calc(100%-2.4cqi)]">

            {/* 左栏:文档清单 */}
            <div
              className="p-[1cqi] flex flex-col gap-[0.4cqi]"
              style={{ background: 'rgba(0,0,0,0.18)', borderRight: `1px solid ${PPT.border}` }}
            >
              <div
                className="font-mono"
                style={{ fontSize: fz.tiny, color: PPT.fgMuted, letterSpacing: '0.2em', marginBottom: '0.4cqi' }}
              >
                文 档
              </div>
              <DocItem name="SOW.docx"        active />
              <DocItem name="实施方案 v2.pdf" />
              <DocItem name="交接单.md"        />
              <DocItem name="会议纪要 ×3"     />
            </div>

            {/* 中栏:洞察报告(带角标)*/}
            <div className="p-[1.2cqi] flex flex-col gap-[0.6cqi]" style={{ borderRight: `1px solid ${PPT.border}` }}>
              <div
                className="font-mono"
                style={{ fontSize: fz.tiny, color: PPT.fgMuted, letterSpacing: '0.2em' }}
              >
                M3 · 项 目 健 康 雷 达
              </div>
              <div style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg }}>
                当前 · <GradText>合同签署</GradText>
              </div>
              <div style={{ fontSize: fz.small, color: PPT.fg, lineHeight: 1.6 }}>
                <p>
                  客户已明确签约意向 <CitationChip id="D1" type="doc" />,
                  法务正在 review 终稿。
                </p>
                <p style={{ marginTop: '0.4cqi' }}>
                  风险:验收口径与客户预期有差异 <CitationChip id="D2" type="doc" />,
                  行业 knowhow 提示这是制造业高发风险 <CitationChip id="K1" type="kb" />。
                </p>
              </div>
            </div>

            {/* 右栏:引用原文 - 区分项目文档 vs 知识库 */}
            <div className="p-[1cqi] flex flex-col gap-[0.6cqi]" style={{ background: 'rgba(255,141,26,0.05)' }}>
              <div
                className="font-mono flex items-center gap-[0.4cqi]"
                style={{ fontSize: fz.tiny, color: PPT.brandMid, letterSpacing: '0.15em' }}
              >
                <span style={{ color: PPT.brand }}>●</span>
                引 用
              </div>

              <CitationCard
                id="D1"
                type="doc"
                source="SOW.docx · 第 2.1 节"
                excerpt="王总(CIO) 已授权签字, 时间窗口 2026Q2"
                pulse
              />
              <CitationCard
                id="K1"
                type="kb"
                source="行业 knowhow · 智能制造包"
                excerpt="制造业项目验收口径差异是高发风险, 建议 kickoff 前签验收附件"
              />
            </div>
          </div>
        </div>

        {/* 右:反幻觉三层 */}
        <div className="ppt-stagger-row flex flex-col gap-[1cqi]">
          <div
            style={{
              fontSize: fz.body,
              fontWeight: 600,
              color: PPT.fg,
              marginBottom: '0.4cqi',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6cqi',
            }}
          >
            <ShieldIcon />
            <span>反幻觉 · <GradText>三层兜底</GradText></span>
          </div>

          <TrustLayer
            n="01"
            title="整篇喂入"
            color={PPT.brand}
            desc="SOW / 合同 / 交接单整篇进 prompt — 不切片, 关键条款的上下文不丢"
            tag="单份 ≥ 30k 字符 全文上下文"
          />
          <TrustLayer
            n="02"
            title="行业 know-how 召回"
            color={PPT.blue}
            desc="项目内文档 + 行业 knowhow 库联合作为事实底, AI 不能凭空编造 — 行业相关结论强制有出处"
            tag="industry_packs · 知识库二次评分注入"
            highlight
          />
          <TrustLayer
            n="03"
            title="引用追溯"
            color={PPT.green}
            desc="每条结论都挂 [D1] [K1] 角标 — PM 一键跳原文校验, 不必靠记忆"
            tag="角标即原文 · 0 误差核验"
          />
        </div>
      </div>
    </SlideShell>
  )
}

// ── 三层 · 单层卡 ──
function TrustLayer({
  n, title, color, desc, tag, highlight = false,
}: { n: string; title: string; color: string; desc: string; tag: string; highlight?: boolean }) {
  return (
    <GlassCard pad="1.2cqi" highlight={highlight} className="flex items-start gap-[1cqi]">
      <div
        className="flex-shrink-0 flex items-center justify-center font-extrabold rounded-[0.8cqi]"
        style={{
          width: '3cqi',
          height: '3cqi',
          background: `${color}1F`,
          color,
          fontSize: fz.body,
          border: `1.5px solid ${color}55`,
          boxShadow: `0 0 16px -6px ${color}99, inset 0 1px 0 rgba(255,255,255,0.06)`,
        }}
      >
        {n}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-[0.6cqi] mb-[0.2cqi]">
          <span style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg }}>
            {title}
          </span>
          <span
            className="font-mono px-[0.5cqi] py-[0.1cqi] rounded-[0.3cqi]"
            style={{
              fontSize: fz.tiny,
              color: PPT.fgMuted,
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${PPT.border}`,
              letterSpacing: '0.05em',
            }}
          >
            {tag}
          </span>
        </div>
        <div style={{ fontSize: fz.small, color: PPT.fgMuted, lineHeight: 1.45 }}>
          {desc}
        </div>
      </div>
    </GlassCard>
  )
}

// ── 文档项 ──
function DocItem({ name, active = false }: { name: string; active?: boolean }) {
  return (
    <div
      className="flex items-center gap-[0.5cqi] px-[0.6cqi] py-[0.5cqi] rounded-[0.5cqi]"
      style={{
        background: active ? 'rgba(255,141,26,0.15)' : 'transparent',
        border: active ? `1px solid ${PPT.borderHi}` : '1px solid transparent',
      }}
    >
      <span
        style={{
          width: '0.6cqi',
          height: '0.6cqi',
          borderRadius: '2px',
          background: active ? PPT.brand : 'rgba(255,255,255,0.20)',
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: fz.small,
          color: active ? PPT.fg : PPT.fgMuted,
          fontWeight: active ? 600 : 400,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {name}
      </span>
    </div>
  )
}

// ── 引用角标 [D1] / [K1] —— 区分项目文档 / 知识库 ──
function CitationChip({ id, type }: { id: string; type: 'doc' | 'kb' }) {
  const isKb = type === 'kb'
  return (
    <span
      className="font-mono inline-flex items-center px-[0.5cqi] rounded-[0.3cqi] cursor-pointer"
      style={{
        fontSize: '0.85em',
        background: isKb ? 'rgba(96,165,250,0.18)' : 'rgba(255,141,26,0.20)',
        color: isKb ? '#93C5FD' : PPT.brandMid,
        border: `1px solid ${isKb ? 'rgba(96,165,250,0.40)' : PPT.borderHi}`,
        boxShadow: isKb
          ? '0 0 10px rgba(96,165,250,0.30)'
          : '0 0 10px rgba(255,141,26,0.30)',
        margin: '0 1px',
      }}
    >
      [{id}]
    </span>
  )
}

// ── 引用卡片(右栏)──
function CitationCard({
  id, type, source, excerpt, pulse = false,
}: { id: string; type: 'doc' | 'kb'; source: string; excerpt: string; pulse?: boolean }) {
  const isKb = type === 'kb'
  const accent = isKb ? '#60A5FA' : PPT.brand
  const accentBg = isKb ? 'rgba(96,165,250,0.12)' : 'rgba(255,141,26,0.12)'
  return (
    <div
      className={`rounded-[0.6cqi] p-[0.8cqi] ${pulse ? 'ppt-pulse' : ''}`}
      style={{
        background: 'rgba(0,0,0,0.3)',
        border: `1px solid ${isKb ? 'rgba(96,165,250,0.40)' : PPT.borderHi}`,
        boxShadow: isKb
          ? '0 0 18px -6px rgba(96,165,250,0.50)'
          : PPT.glowBrand,
      }}
    >
      <div className="flex items-center gap-[0.4cqi] mb-[0.4cqi]">
        <span
          className="font-mono font-bold px-[0.4cqi] rounded-[0.2cqi]"
          style={{
            fontSize: fz.tiny,
            color: accent,
            background: accentBg,
            border: `1px solid ${accent}55`,
          }}
        >
          [{id}] {isKb ? '知识库' : '文档'}
        </span>
        <span
          className="font-mono"
          style={{ fontSize: fz.tiny, color: PPT.fgMuted, letterSpacing: '0.05em' }}
        >
          {source}
        </span>
      </div>
      <p style={{ fontSize: fz.small, color: PPT.fg, lineHeight: 1.4 }}>
        <span style={{ background: `${accent}33`, padding: '0 4px', borderRadius: '3px' }}>
          {excerpt}
        </span>
      </p>
    </div>
  )
}

// ── 盾牌图标 ──
function ShieldIcon() {
  return (
    <span
      className="flex items-center justify-center rounded-[0.6cqi]"
      style={{
        width: '2.2cqi',
        height: '2.2cqi',
        background: PPT.brandSoft,
        border: `1px solid ${PPT.borderHi}`,
      }}
    >
      <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none">
        <path
          d="M12 2L4 5v7c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V5l-8-3z"
          stroke={PPT.brand}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M9 12l2 2 4-4" stroke={PPT.brand} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}
