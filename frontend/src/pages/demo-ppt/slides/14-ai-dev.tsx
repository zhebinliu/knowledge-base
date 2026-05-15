/**
 * P14 — AI 助产品迭代 (单页)
 *
 * 双向叙事:
 *   - 左:开发硬数字(可核对的 git stats)
 *   - 右:方法论(AI 是开发合伙人)
 */
import { SlideShell, SlideHeader, GradText, GlassCard } from '../Shell'
import { PPT, fz } from '../theme'

export default function Slide14AiDev() {
  return (
    <SlideShell>
      <SlideHeader
        index="14 / 16"
        tag="META · AI 助产品迭代"
        title={<>这套系统本身, 也是 <GradText>AI 助产品迭代</GradText> 的样本</>}
        sub="20 天 4 轮迭代从零到生产上线 · 用 Claude Code 协作开发 · 把「AI 接管基础工序, 人做判断」也用到自己身上"
      />

      <div className="flex-1 grid grid-cols-2 gap-[1.6cqi]" style={{ minHeight: 0 }}>

        {/* 左:硬数字 */}
        <GlassCard className="ppt-stagger-row flex flex-col" pad="1.6cqi">
          <div className="font-mono mb-[1cqi]" style={{ fontSize: fz.tiny, color: PPT.brandMid, letterSpacing: '0.2em' }}>
            开 发 硬 数 字 · 可 核 对
          </div>
          <div className="grid grid-cols-2 gap-[1cqi] flex-1">
            <StatBox value="20"  unit="天"   caption="日历周期 · 0 到上线"  color={PPT.brand} />
            <StatBox value="4"   unit="轮"   caption="主要迭代"             color={PPT.purple} />
            <StatBox value="~15" unit="人天" caption="实际工作投入"          color={PPT.green} />
            <StatBox value="357" unit=""     caption="次 Git 提交"           color={PPT.brand} />
          </div>
          <div
            className="mt-[1cqi] pt-[0.8cqi] text-center"
            style={{ borderTop: `1px solid ${PPT.border}`, fontSize: fz.small, color: PPT.fgMuted, lineHeight: 1.5 }}
          >
            传统节奏:同等复杂度需 3-6 个月 + 3-5 人团队 · 100+ 人天<br />
            <strong style={{ color: PPT.brandMid }}>AI 协作:1 人 · 20 天 · ~15 人天 上线</strong>
          </div>
        </GlassCard>

        {/* 右:方法论 */}
        <GlassCard className="ppt-stagger-row flex flex-col" pad="1.6cqi" highlight>
          <div className="font-mono mb-[1cqi]" style={{ fontSize: fz.tiny, color: PPT.brandMid, letterSpacing: '0.2em' }}>
            方 法 论 · AI 是 开 发 合 伙 人
          </div>
          <div className="flex-1 flex flex-col gap-[0.8cqi]">
            <MethodItem
              no="01"
              title="AI 写代码 / 人定方向"
              desc="架构、产品判断、用户体验由人主导;AI 接管脚手架 / 样板 / 数据流连接"
            />
            <MethodItem
              no="02"
              title="对抗式评审内化进流程"
              desc="同样的 Critic + Challenger 用在开发上 — 让 AI 自己审自己, 输出稳定"
            />
            <MethodItem
              no="03"
              title="一切产出都有出处"
              desc="每次提交带 task 链接, 改动可追溯 — 跟项目洞察的「引用追溯」是一套精神"
            />
          </div>
        </GlassCard>
      </div>
    </SlideShell>
  )
}

function StatBox({
  value, unit, caption, color,
}: { value: string; unit: string; caption: string; color: string }) {
  return (
    <div
      className="ppt-num-pop rounded-[0.8cqi] p-[1cqi] flex flex-col items-center justify-center"
      style={{
        background: 'rgba(0,0,0,0.25)',
        border: `1px solid ${color}40`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04)`,
        animationDelay: '500ms',
      }}
    >
      <div
        className="font-extrabold leading-none flex items-baseline gap-[0.3cqi]"
        style={{
          fontSize: fz.numM,
          color,
          textShadow: `0 0 30px ${color}66, 0 0 12px ${color}88`,
        }}
      >
        <span>{value}</span>
        {unit && <span style={{ fontSize: fz.h3, color: PPT.fgMuted, fontWeight: 600 }}>{unit}</span>}
      </div>
      <div style={{ fontSize: fz.small, color: PPT.fgMuted, marginTop: '0.4cqi', fontWeight: 500 }}>
        {caption}
      </div>
    </div>
  )
}

function MethodItem({ no, title, desc }: { no: string; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-[0.8cqi]">
      <span
        className="flex-shrink-0 font-mono font-extrabold flex items-center justify-center rounded-[0.5cqi]"
        style={{
          width: '2.4cqi', height: '2.4cqi',
          background: PPT.brandSoft,
          color: PPT.brand,
          fontSize: fz.small,
          border: `1px solid ${PPT.borderHi}`,
        }}
      >
        {no}
      </span>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg, marginBottom: '0.2cqi' }}>
          {title}
        </div>
        <div style={{ fontSize: fz.small, color: PPT.fgMuted, lineHeight: 1.45 }}>
          {desc}
        </div>
      </div>
    </div>
  )
}
