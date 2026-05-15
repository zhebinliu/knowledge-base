/**
 * P09 — 创新 1 · 挑战回合 (Critic + Challenger)
 *
 * 主线呼应:AI 输出最大的雷是不确定性。
 *   P05 解决了"输入端的事实可靠"(整篇喂入 + 知识库召回 + 引用追溯)
 *   P09 是"输出端的对抗式审查" — 给所有 AI 产出加内审 + 反方辩论
 */
import { SlideShell, SlideHeader, GradText, GlassCard, Chip } from '../Shell'
import { PPT, fz } from '../theme'

// 中文为主, 英文为辅
const CRITIC_DIMS = [
  { zh: '具体性',    en: 'Specificity' },
  { zh: '证据',      en: 'Evidence' },
  { zh: '时效性',    en: 'Timeliness' },
  { zh: '下一步',    en: 'Next Step' },
]

const CHALLENGER_DIMS = [
  { zh: '具体性',    en: 'Specificity' },
  { zh: '证据',      en: 'Evidence' },
  { zh: '下一步',    en: 'Next Step' },
  { zh: '完整性',    en: 'Completeness' },
  { zh: '一致性',    en: 'Consistency' },
  { zh: '行话',      en: 'Jargon' },
]

export default function Slide09Challenge() {
  return (
    <SlideShell>
      <SlideHeader
        index="09 / 15"
        tag="INNOVATION 1 · 挑战回合"
        title={<>给 AI 配一个内部 <GradText>Critic + Challenger</GradText></>}
        sub={<>AI 输出最大的雷是不确定性 —— 输入端我们已经做了反幻觉(P05), 这层是<strong>给所有 AI 产物加的对抗式审查</strong>, 让输出质量稳定可衡量。</>}
      />

      <div className="flex-1 grid grid-cols-[1fr_1fr] gap-[1.6cqi]" style={{ minHeight: 0 }}>

        {/* 左:Critic */}
        <GlassCard className="ppt-stagger-row flex flex-col" pad="1.6cqi">
          <div className="flex items-center justify-between mb-[1cqi]">
            <div className="flex items-center gap-[0.6cqi]">
              <RoleBadge label="CRITIC" color={PPT.purple} />
              <span style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg }}>
                单模块 4 维评分
              </span>
            </div>
            <Chip tone="default">内审 · 自我反省</Chip>
          </div>

          <div style={{ fontSize: fz.small, color: PPT.fgMuted, lineHeight: 1.5, marginBottom: '0.8cqi' }}>
            AI 输出某段内容后, 切换 Critic 角色对自己打分 — 任一维度 &lt; 3 分 → 当模块返工重写, 直到全部 ≥ 3。
          </div>

          {/* 4 维度 — 中文为主, 英文为辅 */}
          <div className="grid grid-cols-2 gap-[0.6cqi] mb-[0.8cqi]">
            {CRITIC_DIMS.map((d) => (
              <div
                key={d.en}
                className="px-[1cqi] py-[0.7cqi] rounded-[0.6cqi] flex items-center justify-between"
                style={{
                  background: 'rgba(192,132,252,0.08)',
                  border: '1px solid rgba(192,132,252,0.30)',
                }}
              >
                <span style={{ fontSize: fz.body, color: PPT.fg, fontWeight: 700 }}>
                  {d.zh}
                </span>
                <span className="font-mono" style={{ fontSize: fz.tiny, color: PPT.purple, opacity: 0.75 }}>
                  {d.en}
                </span>
              </div>
            ))}
          </div>

          {/* 评分示例 */}
          <div style={{ fontSize: fz.tiny, color: PPT.fgMuted, letterSpacing: '0.15em', marginBottom: '0.4cqi', fontWeight: 700 }}>
            评 分 示 例
          </div>
          <ScoreRow label="模块 M3 健康雷达" scores={[4, 5, 3, 5]} pass />
          <ScoreRow label="模块 M7 风险预警" scores={[4, 2, 4, 5]} pass={false} />

          {/* 失败处理流程 — 补留白 */}
          <div
            className="mt-auto pt-[1cqi]"
            style={{ borderTop: `1px dashed ${PPT.border}` }}
          >
            <div className="font-mono mb-[0.6cqi]" style={{ fontSize: fz.tiny, color: PPT.fgMuted, letterSpacing: '0.15em', fontWeight: 700 }}>
              失 败 维 度 → 当 模 块 返 工
            </div>
            <div className="flex items-center gap-[0.5cqi]">
              <FlowChip label="返工重写" color={PPT.rose} />
              <FlowArrow color={PPT.fgMuted} />
              <FlowChip label="重新评分" color={PPT.purple} />
              <FlowArrow color={PPT.fgMuted} />
              <FlowChip label="全 ≥ 3 → PASS" color={PPT.green} />
            </div>
          </div>
        </GlassCard>

        {/* 右:Challenger */}
        <GlassCard className="ppt-stagger-row flex flex-col" pad="1.6cqi" highlight>
          <div className="flex items-center justify-between mb-[1cqi]">
            <div className="flex items-center gap-[0.6cqi]">
              <RoleBadge label="CHALLENGER" color={PPT.rose} />
              <span style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg }}>
                整文 6 维反方辩护
              </span>
            </div>
            <Chip tone="rose">外审 · 站到对面</Chip>
          </div>

          <div style={{ fontSize: fz.small, color: PPT.fgMuted, lineHeight: 1.5, marginBottom: '0.8cqi' }}>
            Critic 全过后, 启 Challenger 整文盘问 — 6 维度逐一发难, verdict = major_issues 就按 issue 列表逐条修复, 再来一轮。
          </div>

          {/* 6 维度 — 中文为主, 英文为辅 */}
          <div className="grid grid-cols-3 gap-[0.5cqi] mb-[0.8cqi]">
            {CHALLENGER_DIMS.map((d) => (
              <div
                key={d.en}
                className="text-center px-[0.5cqi] py-[0.6cqi] rounded-[0.4cqi]"
                style={{
                  background: 'rgba(251,113,133,0.10)',
                  border: '1px solid rgba(251,113,133,0.30)',
                }}
              >
                <div style={{ fontSize: fz.body, color: PPT.fg, fontWeight: 700, lineHeight: 1.1 }}>
                  {d.zh}
                </div>
                <div className="font-mono" style={{ fontSize: fz.tiny, color: PPT.rose, opacity: 0.75, marginTop: '0.1cqi' }}>
                  {d.en}
                </div>
              </div>
            ))}
          </div>

          {/* 例子:Challenger 提的反问 */}
          <div
            className="rounded-[0.6cqi] p-[1cqi]"
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px dashed rgba(251,113,133,0.40)',
            }}
          >
            <div className="font-mono mb-[0.4cqi]" style={{ fontSize: fz.tiny, color: PPT.rose, letterSpacing: '0.1em' }}>
              CHALLENGER 反问示例
            </div>
            <div style={{ fontSize: fz.small, color: PPT.fg, lineHeight: 1.5 }}>
              「M3 说健康良好, 但 M7 提了 3 个风险都标 'high' — 这是<GradText>不一致</GradText>。要么提高 M3 风险等级, 要么解释为什么 M7 不影响整体判断。」
            </div>
          </div>

          {/* verdict 三档 — 补留白 */}
          <div
            className="mt-auto pt-[1cqi]"
            style={{ borderTop: `1px dashed ${PPT.border}` }}
          >
            <div className="font-mono mb-[0.6cqi]" style={{ fontSize: fz.tiny, color: PPT.fgMuted, letterSpacing: '0.15em', fontWeight: 700 }}>
              VERDICT 三 档 → 决 定 是 否 入 库
            </div>
            <div className="grid grid-cols-3 gap-[0.5cqi]">
              <VerdictBox tag="PASS" color={PPT.green} desc="全文通过, 直接入库" />
              <VerdictBox tag="MINOR" color={PPT.amber} desc="部分修复, 局部返工" />
              <VerdictBox tag="MAJOR" color={PPT.rose} desc="全文返工, 再来一轮" />
            </div>
          </div>
        </GlassCard>
      </div>

      {/* 底部一句话:把质量内化为系统能力 */}
      <div
        className="ppt-stagger-row mt-[1.2cqi] flex items-center justify-center gap-[1cqi] py-[0.8cqi] px-[1.4cqi] rounded-full mx-auto"
        style={{
          background: PPT.brandSoft,
          border: `1px solid ${PPT.borderHi}`,
          fontSize: fz.body,
          color: PPT.fg,
          maxWidth: '80%',
          boxShadow: PPT.glowBrand,
        }}
      >
        <span style={{ color: PPT.fgMuted }}>裸 LLM 一次性输出</span>
        <span>→</span>
        <strong style={{ color: PPT.brandMid }}>同行评审 + 反方辩论 内化进系统</strong>
        <span>→</span>
        <strong style={{ color: PPT.green }}>输出质量稳定可衡量</strong>
      </div>
    </SlideShell>
  )
}

// ── 流程 chip ──
function FlowChip({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="px-[0.7cqi] py-[0.4cqi] rounded-full font-mono"
      style={{
        fontSize: fz.tiny,
        color,
        background: `${color}1F`,
        border: `1px solid ${color}55`,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}

function FlowArrow({ color }: { color: string }) {
  return (
    <svg width="1.4cqi" height="1cqi" viewBox="0 0 24 14" fill="none" style={{ flexShrink: 0 }}>
      <path d="M2 7h18M16 2l5 5-5 5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── verdict 框 ──
function VerdictBox({ tag, color, desc }: { tag: string; color: string; desc: string }) {
  return (
    <div
      className="px-[0.7cqi] py-[0.5cqi] rounded-[0.4cqi]"
      style={{
        background: `${color}10`,
        border: `1px solid ${color}55`,
      }}
    >
      <div
        className="font-mono"
        style={{ fontSize: fz.tiny, color, fontWeight: 700, letterSpacing: '0.1em', marginBottom: '0.2cqi' }}
      >
        {tag}
      </div>
      <div style={{ fontSize: fz.tiny, color: PPT.fgMuted, lineHeight: 1.3 }}>
        {desc}
      </div>
    </div>
  )
}

// ── 角色 badge ──
function RoleBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="font-mono font-bold px-[0.8cqi] py-[0.3cqi] rounded-[0.4cqi]"
      style={{
        fontSize: fz.tiny,
        background: '#fff',
        color,
        letterSpacing: '0.15em',
      }}
    >
      {label}
    </span>
  )
}

// ── 评分行 ──
function ScoreRow({ label, scores, pass }: { label: string; scores: number[]; pass: boolean }) {
  return (
    <div className="flex items-center gap-[0.8cqi] mt-[0.4cqi]">
      <div style={{ flex: 1, fontSize: fz.tiny, color: PPT.fg, fontWeight: 500 }}>
        {label}
      </div>
      <div className="flex gap-[0.3cqi]">
        {scores.map((s, i) => (
          <span
            key={i}
            className="font-mono inline-flex items-center justify-center"
            style={{
              width: '1.6cqi', height: '1.6cqi',
              borderRadius: '0.3cqi',
              fontSize: fz.tiny,
              fontWeight: 700,
              background: s >= 3 ? 'rgba(52,211,153,0.18)' : 'rgba(251,113,133,0.20)',
              color: s >= 3 ? PPT.green : PPT.rose,
              border: `1px solid ${s >= 3 ? 'rgba(52,211,153,0.4)' : 'rgba(251,113,133,0.4)'}`,
            }}
          >
            {s}
          </span>
        ))}
      </div>
      <span
        className="font-mono px-[0.4cqi] py-[0.1cqi] rounded-[0.3cqi]"
        style={{
          fontSize: fz.tiny,
          color: pass ? PPT.green : PPT.rose,
          background: pass ? 'rgba(52,211,153,0.15)' : 'rgba(251,113,133,0.18)',
          border: `1px solid ${pass ? 'rgba(52,211,153,0.4)' : 'rgba(251,113,133,0.4)'}`,
          fontWeight: 700,
          minWidth: '2.4cqi',
          textAlign: 'center',
        }}
      >
        {pass ? 'PASS' : '返工'}
      </span>
    </div>
  )
}
