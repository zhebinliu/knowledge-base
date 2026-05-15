/**
 * P08 — 需求调研 · 客户感知
 * 客户在屏前真实看到的 — 大按钮 / 追问气泡 / 矩阵, 顾问陪着过一遍
 */
import { SlideShell, SlideHeader, GradText, GlassCard } from '../Shell'
import { PPT, fz } from '../theme'

export default function Slide08SurveyFeel() {
  return (
    <SlideShell>
      <SlideHeader
        index="08 / 15"
        tag="FEEL · 客户感知"
        title={<>客户面前是<GradText>大按钮 + 追问气泡</GradText> · 不是 Excel 问卷</>}
        sub="顾问拿 iPad 坐到客户对面, 一题一题过 — 客户感受到的是被专业访谈, 不是被甩了一份家庭作业"
      />

      <div className="flex-1 grid grid-cols-[1.1fr_1fr] gap-[2cqi]" style={{ minHeight: 0 }}>

        {/* 左:iPad mockup */}
        <div className="ppt-stagger-row flex items-center justify-center">
          <IpadMockup />
        </div>

        {/* 右:客户体验三段 */}
        <div className="ppt-stagger-row flex flex-col justify-center gap-[1.2cqi]">
          <ExperienceCard
            title="大按钮 / 矩阵勾选"
            desc="选项预填好, 客户口头答顾问一点就过 —— 全程零打字"
            tone="brand"
          />
          <ExperienceCard
            title="父题选完自动弹追问"
            desc='选了"有自建 CRM" → 立刻显追问"具体哪家? 用了多久?", 引导客户不漏'
            tone="blue"
          />
          <ExperienceCard
            title="结构化字段答案"
            desc="勾选答案就是结构化数据, 不用 Excel → Word 再整理一遍"
            tone="green"
          />

          {/* 总结一句 */}
          <div
            className="mt-[0.4cqi] px-[1.4cqi] py-[1cqi] rounded-[1cqi]"
            style={{
              background: PPT.brandSoft,
              border: `1px solid ${PPT.borderHi}`,
              fontSize: fz.body,
              color: PPT.fg,
              textAlign: 'center',
              boxShadow: PPT.glowBrand,
            }}
          >
            客户感受是"<strong style={{ color: PPT.brandMid }}>被专业访谈</strong>",
            而不是"<strong style={{ color: PPT.rose }}>在做家庭作业</strong>"
          </div>
        </div>
      </div>
    </SlideShell>
  )
}

// ── iPad mockup ──
function IpadMockup() {
  return (
    <div
      className="relative"
      style={{
        width: '90%',
        aspectRatio: '4 / 3',
        background: 'linear-gradient(135deg, #1A1F30, #0F1424)',
        borderRadius: '1.6cqi',
        border: '1px solid rgba(255,255,255,0.12)',
        padding: '1cqi',
        boxShadow: '0 30px 60px -20px rgba(0,0,0,0.7), 0 0 80px -30px rgba(255,141,26,0.25)',
      }}
    >
      {/* 屏幕内容 */}
      <div
        className="w-full h-full flex flex-col gap-[0.8cqi] p-[1.2cqi]"
        style={{
          background: 'rgba(0,0,0,0.5)',
          borderRadius: '1cqi',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* 顶栏:进度 */}
        <div className="flex items-center justify-between">
          <span
            className="font-mono"
            style={{ fontSize: fz.tiny, color: PPT.fgMuted, letterSpacing: '0.15em' }}
          >
            调 研 问 卷 · 第 7 / 24 题
          </span>
          <div className="flex items-center gap-[0.4cqi]">
            <div
              style={{
                width: '8cqi', height: '0.4cqi',
                background: 'rgba(255,255,255,0.10)',
                borderRadius: '999px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: '30%', height: '100%',
                  background: PPT.brandGrad,
                  borderRadius: '999px',
                }}
              />
            </div>
            <span style={{ fontSize: fz.tiny, color: PPT.brandMid }}>30%</span>
          </div>
        </div>

        {/* 题目 */}
        <div style={{ fontSize: fz.body, color: PPT.fg, fontWeight: 600, marginTop: '0.4cqi' }}>
          客户当前的 CRM 使用情况?
        </div>

        {/* 选项 */}
        <div className="flex flex-wrap gap-[0.6cqi]" style={{ marginTop: '0.4cqi' }}>
          <OptionPill label="无 CRM, 完全手工" />
          <OptionPill label="有自建 / 第三方" active />
          <OptionPill label="用过但已弃用" />
        </div>

        {/* 追问 */}
        <div
          className="ml-[1.6cqi] pl-[1.4cqi] mt-[0.4cqi] flex flex-col gap-[0.6cqi]"
          style={{ borderLeft: `2px solid ${PPT.borderHi}` }}
        >
          <div className="flex items-center gap-[0.4cqi]" style={{ fontSize: fz.small, color: PPT.brandMid }}>
            <svg width="1.2cqi" height="1.2cqi" viewBox="0 0 24 24" fill="none">
              <path d="M9 18l6-6-6-6" stroke={PPT.brand} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontStyle: 'italic' }}>追问 · 具体哪家? 用了多久?</span>
          </div>
          <div className="flex flex-wrap gap-[0.4cqi]">
            {['Salesforce', '销售易', '自建', '其他'].map((c) => (
              <span
                key={c}
                className="px-[0.6cqi] py-[0.2cqi] rounded-full"
                style={{
                  fontSize: fz.tiny,
                  background: 'rgba(255,255,255,0.04)',
                  color: PPT.fgMuted,
                  border: `1px solid ${PPT.border}`,
                }}
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex-1" />
        <div className="flex items-center justify-between">
          <button
            style={{
              padding: '0.5cqi 1cqi',
              fontSize: fz.tiny,
              color: PPT.fgMuted,
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${PPT.border}`,
              borderRadius: '999px',
            }}
          >
            ← 上一题
          </button>
          <button
            className="ppt-pulse"
            style={{
              padding: '0.5cqi 1.4cqi',
              fontSize: fz.tiny,
              color: '#fff',
              background: PPT.brandGrad,
              border: 0,
              borderRadius: '999px',
              fontWeight: 600,
              boxShadow: '0 0 16px rgba(255,141,26,0.5)',
            }}
          >
            下一题 →
          </button>
        </div>
      </div>

      {/* iPad 边框装饰 — Home 键 */}
      <div
        className="absolute"
        style={{
          left: '50%',
          bottom: '-2cqi',
          transform: 'translateX(-50%)',
          width: '0.6cqi',
          height: '0.6cqi',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.10)',
        }}
      />

      {/* 标签 — 顾问 */}
      <div
        className="absolute"
        style={{
          left: '-3cqi',
          top: '20%',
          transform: 'rotate(-90deg)',
          transformOrigin: 'right center',
          fontSize: fz.tiny,
          color: PPT.fgMuted,
          letterSpacing: '0.3em',
          fontWeight: 500,
        }}
      >
        顾 问 拿 着
      </div>
    </div>
  )
}

function OptionPill({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <div
      className="flex items-center gap-[0.5cqi] px-[1cqi] py-[0.5cqi] rounded-full"
      style={{
        fontSize: fz.small,
        background: active ? PPT.brandSoft : 'rgba(255,255,255,0.04)',
        color: active ? PPT.fg : PPT.fgMuted,
        border: `1px solid ${active ? PPT.borderHi : PPT.border}`,
        fontWeight: active ? 600 : 400,
        boxShadow: active ? '0 0 12px rgba(255,141,26,0.30)' : undefined,
      }}
    >
      {active && (
        <span
          style={{
            width: '0.7cqi', height: '0.7cqi',
            borderRadius: '50%',
            background: PPT.brand,
            boxShadow: '0 0 8px rgba(255,141,26,0.7)',
          }}
        />
      )}
      {label}
    </div>
  )
}

// ── 体验卡 ──
function ExperienceCard({
  title, desc, tone,
}: { title: string; desc: string; tone: 'brand' | 'blue' | 'green' }) {
  const colorMap = {
    brand: { c: PPT.brand,  bg: 'rgba(255,141,26,0.12)', bd: 'rgba(255,141,26,0.30)' },
    blue:  { c: PPT.blue,   bg: 'rgba(96,165,250,0.12)', bd: 'rgba(96,165,250,0.30)' },
    green: { c: PPT.green,  bg: 'rgba(52,211,153,0.12)', bd: 'rgba(52,211,153,0.30)' },
  }
  const t = colorMap[tone]
  return (
    <GlassCard pad="1.2cqi" className="flex items-start gap-[1cqi]">
      <span
        className="flex-shrink-0 flex items-center justify-center rounded-[0.6cqi]"
        style={{
          width: '2.4cqi', height: '2.4cqi',
          background: t.bg, color: t.c, border: `1px solid ${t.bd}`,
          fontSize: fz.body, fontWeight: 700,
        }}
      >
        ✓
      </span>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg, marginBottom: '0.2cqi' }}>
          {title}
        </div>
        <div style={{ fontSize: fz.small, color: PPT.fgMuted, lineHeight: 1.4 }}>
          {desc}
        </div>
      </div>
    </GlassCard>
  )
}
