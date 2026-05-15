/**
 * P11 — 创新 3 · AI 实施建议 (诚实版)
 *
 * 现状(已上线):
 *   best_practice_advisor.py — 给每道调研题旁边写一段 AI 实施建议
 *   基于"跨项目最佳实践库", subsection 级批量 LLM 调用, 80-180 字/题
 *
 * 路线图:
 *   主动建议三类(方案推荐 / 风险预警 / 资源建议)
 *   带置信度 + 数据来源 + 采纳/忽略
 */
import { SlideShell, SlideHeader, GradText, GlassCard, TierSection } from '../Shell'
import { PPT, fz } from '../theme'

export default function Slide11AiSuggest() {
  return (
    <SlideShell>
      <SlideHeader
        index="11 / 15"
        tag="INNOVATION 3 · AI 实施建议"
        title={<>AI 给每道调研题, 写一段<GradText>贴合的实施建议</GradText></>}
        sub="基于跨项目最佳实践库 — 现状是题目级建议(已上线), 路线图是主动型建议(方案 / 风险 / 资源)"
      />

      <div className="flex-1 grid grid-rows-[1.2fr_1fr] gap-[1.6cqi]" style={{ minHeight: 0 }}>

        {/* 上半:已上线 — 题目级 AI 实施建议(真实形态)*/}
        <TierSection
          status="now"
          title={<>每道调研题旁 · AI 写的<GradText>实施建议</GradText></>}
          hint="best_practice_advisor.py · subsection 级批量 LLM 调用 · 综合最佳实践库 · 80-180 字 / 题"
        >
          <div className="grid grid-cols-2 gap-[1cqi]" style={{ minHeight: 0 }}>
            <QuestionWithAdvice
              questionTag="M02_opportunity"
              question="商机阶段如何定义? 阶段切换的判定标准是什么?"
              advice="建议在 CRM 配置 5-7 个阶段(线索 → 初判 → 深度沟通 → 方案 → 商务 → 中标 / 失败)。每个阶段的进入条件用客户行为而非主观判断,如「客户高层确认需求」要求附会议纪要。设置「阶段返工」字段防止 PM 跳阶段。同行业 80% 项目用此结构。"
            />
            <QuestionWithAdvice
              questionTag="M05_contract"
              question="合同审批流程? 法务介入时机?"
              advice="建议「商务初稿 → 法务预审(3 天)→ 商务对客 → 法务复审 → 高管签」五步。法务预审在初稿阶段而不是终稿,可减少返工。验收口径单独走附件,避免主合同来回改。智能制造行业曾因终稿才让法务看,平均延期 2-3 周。"
              highlight
            />
          </div>
        </TierSection>

        {/* 下半:路线图 — 主动建议三类 */}
        <TierSection
          status="next"
          title="下一步 · 从「被动答题」升级到「主动建议」"
          hint="不仅每题给建议, 而是基于洞察 + 调研 + 历史项目, 主动浮出方案推荐 / 风险预警 / 资源建议, 带置信度供 PM 一键采纳"
        >
          <div className="grid grid-cols-3 gap-[1cqi]">
            <RoadmapKind
              kind="方案推荐"
              icon="lamp"
              color={PPT.brand}
              desc="基于客户答案匹配类似项目用过的成功方案"
            />
            <RoadmapKind
              kind="风险预警"
              icon="alert"
              color={PPT.rose}
              desc="同行业类似项目踩过的坑, 提前提醒 PM 规避"
            />
            <RoadmapKind
              kind="资源建议"
              icon="team"
              color={PPT.blue}
              desc="基于项目复杂度推荐人员配置 / 周期 / 工具"
            />
          </div>
        </TierSection>
      </div>
    </SlideShell>
  )
}

// ── 调研题 + AI 建议 (真实形态)──
function QuestionWithAdvice({
  questionTag, question, advice, highlight = false,
}: { questionTag: string; question: string; advice: string; highlight?: boolean }) {
  return (
    <GlassCard pad="1cqi" highlight={highlight} className="flex flex-col gap-[0.6cqi]">
      {/* 题目 */}
      <div>
        <span
          className="font-mono inline-block mb-[0.3cqi] px-[0.4cqi] py-[0.05cqi] rounded-[0.2cqi]"
          style={{
            fontSize: fz.tiny,
            color: PPT.brandMid,
            background: PPT.brandSoft,
            border: `1px solid ${PPT.borderHi}`,
          }}
        >
          {questionTag}
        </span>
        <div style={{ fontSize: fz.body, fontWeight: 600, color: PPT.fg, lineHeight: 1.35 }}>
          {question}
        </div>
      </div>

      {/* AI 建议 */}
      <div
        className="flex-1 p-[0.8cqi] rounded-[0.6cqi]"
        style={{
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderLeft: `3px solid ${PPT.brand}`,
        }}
      >
        <div className="flex items-center gap-[0.4cqi] mb-[0.4cqi]">
          <SparkIcon />
          <span className="font-mono" style={{ fontSize: fz.tiny, color: PPT.brandMid, letterSpacing: '0.15em', fontWeight: 700 }}>
            AI 实施建议
          </span>
        </div>
        <p style={{ fontSize: fz.small, color: PPT.fg, lineHeight: 1.5 }}>
          {advice}
        </p>
      </div>
    </GlassCard>
  )
}

// ── 路线图 · 三类主动建议 ──
function RoadmapKind({
  kind, icon, color, desc,
}: { kind: string; icon: 'lamp' | 'alert' | 'team'; color: string; desc: string }) {
  return (
    <div
      className="flex flex-col items-center text-center gap-[0.4cqi] p-[1cqi] rounded-[0.8cqi]"
      style={{
        background: 'rgba(96,165,250,0.04)',
        border: '1px dashed rgba(96,165,250,0.40)',
      }}
    >
      <span
        className="flex items-center justify-center rounded-[0.6cqi]"
        style={{
          width: '3cqi', height: '3cqi',
          background: `${color}1F`,
          color,
          border: `1px solid ${color}55`,
        }}
      >
        <KindIcon type={icon} />
      </span>
      <div style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg }}>
        {kind}
      </div>
      <div style={{ fontSize: fz.tiny, color: PPT.fgMuted, lineHeight: 1.4 }}>
        {desc}
      </div>
    </div>
  )
}

function SparkIcon() {
  return (
    <svg width="1.4cqi" height="1.4cqi" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z"
        fill={PPT.brand}
        stroke={PPT.brand}
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function KindIcon({ type }: { type: 'lamp' | 'alert' | 'team' }) {
  const paths: Record<string, React.ReactNode> = {
    lamp:  <><path d="M9 18h6M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.5c1 1 1.5 2 1.5 3.5h5c0-1.5.5-2.5 1.5-3.5A7 7 0 0 0 12 2z" /></>,
    alert: <><path d="M12 3L22 21H2L12 3z" /><path d="M12 10v5" /><circle cx="12" cy="18" r="0.6" fill="currentColor" stroke="none" /></>,
    team:  <><circle cx="9" cy="8" r="3.5" /><path d="M2 21c0-4 3-7 7-7s7 3 7 7" /><circle cx="17" cy="6" r="2.5" /><path d="M14 14c3-1 7 1 7 6" /></>,
  }
  return (
    <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[type]}
    </svg>
  )
}
