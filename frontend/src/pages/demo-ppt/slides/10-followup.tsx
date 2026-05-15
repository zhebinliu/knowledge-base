/**
 * P10 — 创新 2 · 调研追问 (智能联动)
 *
 * 主线呼应:降信息不确定性
 *   AI 知道客户答了 A 之后, 还需要追问 B C D 才能拿到完整信息。
 *   传统问卷给出固定题目, AI 调研问卷会按答案动态展开。
 */
import { SlideShell, SlideHeader, GradText, GlassCard, Chip } from '../Shell'
import { PPT, fz } from '../theme'

export default function Slide10Followup() {
  return (
    <SlideShell>
      <SlideHeader
        index="10 / 15"
        tag="INNOVATION 2 · 智能追问"
        title={<>顾问点一下「追问」, AI 基于答案<GradText>生成 1-3 道深挖题</GradText></>}
        sub="传统问卷题目固定, 客户答完就完事 —— 顾问遇到值得挖的答案, 点一下按钮, AI 基于客户的具体回答生成追问题(顾问主导节奏, 不每次自动跑, 避免成本失控)"
      />

      <div className="flex-1 grid grid-cols-[1.4fr_1fr] gap-[2cqi]" style={{ minHeight: 0 }}>

        {/* 左:追问展开树状图 */}
        <GlassCard className="ppt-stagger-row flex flex-col" pad="1.6cqi">
          <div className="flex items-center justify-between mb-[1cqi]">
            <div style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg }}>
              示例 · 客户答完 → 顾问点「追问」 → AI 生成 3 道深挖题
            </div>
            <Chip tone="brand">顾问触发</Chip>
          </div>

          {/* 父题 */}
          <div className="flex items-start gap-[1cqi] mb-[0.8cqi]">
            <NodeBubble n="Q" color={PPT.brand}>
              客户当前的 CRM 使用情况?
            </NodeBubble>
          </div>

          {/* 客户答案 */}
          <div className="ml-[3cqi] flex items-center gap-[0.6cqi] mb-[1cqi]">
            <svg width="2cqi" height="2cqi" viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14M13 6l6 6-6 6" stroke={PPT.fgMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <AnswerPill>有自建 / 第三方</AnswerPill>
          </div>

          {/* 顾问点击追问后, AI 生成的三个深挖题 */}
          <div className="ml-[3cqi]" style={{ borderLeft: `2px dashed ${PPT.borderHi}`, paddingLeft: '1.6cqi' }}>
            <div className="flex items-center gap-[0.6cqi] mb-[0.6cqi]">
              <button
                style={{
                  padding: '0.3cqi 0.8cqi',
                  fontSize: fz.tiny,
                  background: PPT.brandGrad,
                  color: '#fff',
                  border: 0,
                  borderRadius: '999px',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  boxShadow: PPT.glowBrand,
                }}
              >
                + 生成追问
              </button>
              <span className="font-mono" style={{ fontSize: fz.tiny, color: PPT.brandMid, letterSpacing: '0.15em' }}>
                顾 问 点 后 → AI 给 3 道
              </span>
            </div>
            <div className="flex flex-col gap-[0.6cqi]">
              <FollowupBubble
                label="具体哪家产品?"
                options={['Salesforce', '销售易', 'Zoho', '自建', '其他']}
              />
              <FollowupBubble
                label="用了多久?"
                options={['< 1 年', '1-3 年', '3-5 年', '> 5 年']}
              />
              <FollowupBubble
                label="为什么考虑换 / 加新工具?"
                options={['功能不全', '体验差', '集成困难', '成本高']}
                multi
              />
            </div>
          </div>
        </GlassCard>

        {/* 右:6 题型 + 价值卡 */}
        <div className="ppt-stagger-row flex flex-col gap-[1.2cqi]">
          {/* 6 题型 */}
          <GlassCard pad="1.4cqi">
            <div style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg, marginBottom: '0.6cqi' }}>
              支持 <GradText>6 种题型</GradText>
            </div>
            <div className="grid grid-cols-2 gap-[0.5cqi]">
              {[
                { k: 'single',       v: '单选' },
                { k: 'multi',        v: '多选' },
                { k: 'single+probe', v: '单选 + 追问' },
                { k: 'multi+probe',  v: '多选 + 追问' },
                { k: 'matrix',       v: '矩阵' },
                { k: 'text',         v: '简述' },
              ].map((t) => (
                <div
                  key={t.k}
                  className="px-[0.8cqi] py-[0.5cqi] rounded-[0.5cqi]"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${PPT.border}`,
                  }}
                >
                  <div className="font-mono" style={{ fontSize: fz.tiny, color: PPT.brandMid, letterSpacing: '0.05em' }}>
                    {t.k}
                  </div>
                  <div style={{ fontSize: fz.small, color: PPT.fg, fontWeight: 500 }}>
                    {t.v}
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* 主线呼应:降不确定性 */}
          <GlassCard pad="1.4cqi" highlight>
            <div className="flex items-center gap-[0.6cqi] mb-[0.6cqi]">
              <ShieldIcon />
              <span style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg }}>
                降信息<GradText>不确定性</GradText>
              </span>
            </div>
            <div style={{ fontSize: fz.small, color: PPT.fgMuted, lineHeight: 1.5 }}>
              传统问卷:题目固定, 客户答完就完事 → 关键场景缺细节。
              <br />
              AI 调研:顾问遇到值得挖的答案点一下 → <strong style={{ color: PPT.brandMid }}>AI 紧扣具体答案给追问</strong>, 不是泛问。
            </div>
          </GlassCard>
        </div>
      </div>
    </SlideShell>
  )
}

// ── 题目气泡 ──
function NodeBubble({ n, color, children }: { n: string; color: string; children: React.ReactNode }) {
  return (
    <>
      <div
        className="flex-shrink-0 flex items-center justify-center font-extrabold rounded-full"
        style={{
          width: '2.4cqi',
          height: '2.4cqi',
          background: color,
          color: '#fff',
          fontSize: fz.small,
          boxShadow: `0 0 16px -4px ${color}`,
        }}
      >
        {n}
      </div>
      <div
        className="flex-1 px-[1.2cqi] py-[0.8cqi] rounded-[0.8cqi]"
        style={{
          background: PPT.bgPanel2,
          border: `1px solid ${PPT.borderHi}`,
          fontSize: fz.body,
          color: PPT.fg,
          fontWeight: 600,
        }}
      >
        {children}
      </div>
    </>
  )
}

// ── 客户答案 pill ──
function AnswerPill({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-[1cqi] py-[0.4cqi] rounded-full font-mono"
      style={{
        fontSize: fz.small,
        background: PPT.brandSoft,
        color: PPT.brandMid,
        border: `1px solid ${PPT.borderHi}`,
        fontWeight: 600,
        letterSpacing: '0.05em',
      }}
    >
      客户答 · {children}
    </div>
  )
}

// ── 追问气泡 ──
function FollowupBubble({ label, options, multi }: { label: string; options: string[]; multi?: boolean }) {
  return (
    <div
      className="px-[1cqi] py-[0.6cqi] rounded-[0.6cqi]"
      style={{
        background: 'rgba(96,165,250,0.08)',
        border: '1px solid rgba(96,165,250,0.30)',
      }}
    >
      <div className="flex items-center gap-[0.5cqi] mb-[0.4cqi]">
        <span
          className="font-mono"
          style={{
            fontSize: fz.tiny,
            color: PPT.blue,
            background: 'rgba(96,165,250,0.18)',
            padding: '0 0.4cqi',
            borderRadius: '0.2cqi',
            fontWeight: 700,
          }}
        >
          {multi ? '多选' : '单选'}
        </span>
        <span style={{ fontSize: fz.small, color: PPT.fg, fontWeight: 500 }}>
          {label}
        </span>
      </div>
      <div className="flex flex-wrap gap-[0.4cqi]">
        {options.map((o) => (
          <span
            key={o}
            className="px-[0.6cqi] py-[0.15cqi] rounded-full"
            style={{
              fontSize: fz.tiny,
              background: 'rgba(255,255,255,0.04)',
              color: PPT.fgMuted,
              border: `1px solid ${PPT.border}`,
            }}
          >
            {o}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── 盾牌图标(主线呼应)──
function ShieldIcon() {
  return (
    <span
      className="flex items-center justify-center rounded-[0.5cqi]"
      style={{
        width: '2cqi', height: '2cqi',
        background: PPT.brandSoft,
        border: `1px solid ${PPT.borderHi}`,
      }}
    >
      <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none">
        <path d="M12 2L4 5v7c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V5l-8-3z" stroke={PPT.brand} strokeWidth="2" strokeLinejoin="round" />
        <path d="M9 12l2 2 4-4" stroke={PPT.brand} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}
