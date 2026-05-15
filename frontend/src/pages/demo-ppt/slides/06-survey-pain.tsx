/**
 * P06 — 需求调研 · 痛点
 *
 * 真痛点:针对不同行业, 没有可参考的行业专属问题模板去辅助 PM 做业务调研。
 *   PM 凭空设计 → 经验薄的会漏问 → 客户答了也没对照尺 → 没有 next step 建议
 */
import type { ReactNode } from 'react'
import { SlideShell, SlideHeader, GradText, GlassCard, Chip } from '../Shell'
import { PPT, fz } from '../theme'

type IconType = 'wand' | 'ruler' | 'compass' | 'recycle'

const SYMPTOMS: { icon: IconType; title: string; desc: string }[] = [
  { icon: 'wand',    title: '行业问题靠拍脑袋', desc: '制造业 / 零售 / 医药 / SaaS 该问的角度全不一样, 但没人沉淀过模板' },
  { icon: 'ruler',   title: '客户答了没对照尺', desc: '客户说"1000 个 SKU"是多是少? 同行业怎么管? PM 心里没数' },
  { icon: 'compass', title: '没有参考建议',     desc: '拿到答案 PM 还要凭空判断"该用什么方案", 经验不到位就靠猜' },
  { icon: 'recycle', title: '同行业坑反复踩',   desc: '同一行业新项目, 新 PM 重新走弯路, 经验不沉淀' },
]

// 通用问题:谁都能想到的 LTC 字段
const GENERAL_QS = [
  '销售线索来源',
  '商机阶段定义',
  '合同审批流程',
  '客户决策链',
  '数据迁移规模',
]

// 行业专属(取自 industry_packs/smart_manufacturing 真实字段)
const INDUSTRY_QS = [
  'BOM 复杂度 / 嵌套层数',
  'MES / PLM 厂商集成',
  'install base 体量与序列号管理',
  '渠道结构(直销 vs 经销)',
  '售后服务收入占比',
]

export default function Slide06SurveyPain() {
  return (
    <SlideShell>
      <SlideHeader
        index="06 / 15"
        tag="PAIN · 老模式"
        title={<>业务调研, 缺的不是工具, 是<GradText>行业 know-how</GradText></>}
        sub={<>PM 接新项目要做行业调研, 但没有<strong>行业专属问题模板</strong>可参考, 全靠 PM 自己经验拍脑袋 — 经验薄就会漏关键, 客户答完了也<strong>没有对照尺</strong>判断好坏。</>}
      />

      <div className="flex-1 grid grid-cols-[1fr_1.2fr] gap-[2cqi]" style={{ minHeight: 0 }}>
        {/* 左:症状清单 */}
        <div className="ppt-stagger-row flex flex-col justify-center gap-[1.2cqi]">
          {SYMPTOMS.map((s, i) => (
            <GlassCard key={i} pad="1.4cqi" className="flex items-start gap-[1.2cqi]">
              <div
                className="flex-shrink-0 flex items-center justify-center rounded-[1cqi]"
                style={{
                  width: '4cqi',
                  height: '4cqi',
                  background: 'rgba(251,113,133,0.12)',
                  border: '1px solid rgba(251,113,133,0.30)',
                  color: PPT.rose,
                }}
              >
                <SymptomIcon type={s.icon} />
              </div>
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg, marginBottom: '0.2cqi' }}>
                  {s.title}
                </div>
                <div style={{ fontSize: fz.small, color: PPT.fgMuted, lineHeight: 1.4 }}>
                  {s.desc}
                </div>
              </div>
            </GlassCard>
          ))}
        </div>

        {/* 右:通用 vs 行业专属对比 */}
        <GlassCard className="ppt-stagger-row flex flex-col" pad="1.6cqi">
          <div className="mb-[0.8cqi]">
            <div style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg }}>
              示例 · <GradText>制造业</GradText> 项目要问的题
            </div>
            <div style={{ fontSize: fz.small, color: PPT.fgMuted, marginTop: '0.2cqi' }}>
              通用问题谁都想到, 行业专属经验薄就漏 ↓
            </div>
          </div>

          <div className="flex-1 grid grid-cols-2 gap-[1cqi]" style={{ minHeight: 0 }}>
            {/* 左:通用问题 */}
            <div className="flex flex-col gap-[0.4cqi]">
              <div className="flex items-center gap-[0.4cqi] mb-[0.3cqi]">
                <Chip tone="green">通用</Chip>
                <span style={{ fontSize: fz.tiny, color: PPT.fgMuted }}>谁都想得到</span>
              </div>
              {GENERAL_QS.map((q, i) => (
                <QuestionRow key={i} text={q} kind="general" idx={i} />
              ))}
            </div>

            {/* 右:行业专属 */}
            <div className="flex flex-col gap-[0.4cqi]">
              <div className="flex items-center gap-[0.4cqi] mb-[0.3cqi]">
                <Chip tone="rose">行业专属</Chip>
                <span style={{ fontSize: fz.tiny, color: PPT.fgMuted }}>没经验就漏</span>
              </div>
              {INDUSTRY_QS.map((q, i) => (
                <QuestionRow key={i} text={q} kind="industry" idx={i} />
              ))}
            </div>
          </div>

          <div
            className="flex justify-between items-center"
            style={{
              borderTop: `1px solid ${PPT.border}`,
              marginTop: '0.8cqi',
              paddingTop: '0.6cqi',
              fontSize: fz.small,
              color: PPT.fgMuted,
              fontWeight: 500,
            }}
          >
            <span>同一个项目 →</span>
            <span style={{ color: PPT.rose }}>行业专属题没模板就靠 PM 经验</span>
          </div>
        </GlassCard>
      </div>
    </SlideShell>
  )
}

// ── 问题行(通用 / 行业专属)──
function QuestionRow({ text, kind, idx }: { text: string; kind: 'general' | 'industry'; idx: number }) {
  const isInd = kind === 'industry'
  return (
    <div
      className="flex items-center gap-[0.5cqi] px-[0.8cqi] py-[0.5cqi] rounded-[0.5cqi]"
      style={{
        background: isInd ? 'rgba(251,113,133,0.08)' : 'rgba(52,211,153,0.05)',
        border: `1px solid ${isInd ? 'rgba(251,113,133,0.25)' : 'rgba(52,211,153,0.18)'}`,
        animation: 'ppt-funnel-grow 500ms cubic-bezier(.2,.7,.25,1) backwards',
        animationDelay: `${500 + idx * 60}ms`,
        transformOrigin: 'left',
      } as React.CSSProperties}
    >
      <span
        style={{
          width: '0.5cqi', height: '0.5cqi',
          borderRadius: '50%',
          background: isInd ? PPT.rose : PPT.green,
          flexShrink: 0,
        }}
      />
      <div
        style={{
          fontSize: fz.small,
          color: PPT.fg,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {text}
      </div>
    </div>
  )
}

// ── SVG icons ──
function SymptomIcon({ type }: { type: IconType }) {
  const paths: Record<IconType, ReactNode> = {
    // 魔法棒 — 拍脑袋
    wand: (
      <>
        <path d="M3 21l9-9M14 5l5 5M16 3l5 5M9 16l-3 3" />
        <circle cx="14.5" cy="9.5" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    // 标尺 — 没对照尺
    ruler: (
      <>
        <rect x="2" y="9" width="20" height="6" rx="0.5" />
        <path d="M6 9v3M10 9v4M14 9v3M18 9v4" />
      </>
    ),
    // 指南针 — 没参考
    compass: (
      <>
        <circle cx="12" cy="12" r="9" />
        <polygon points="14,10 12,16 10,14 16,12" fill="currentColor" stroke="none" />
      </>
    ),
    // 循环 — 反复踩坑
    recycle: (
      <>
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <polyline points="21 3 21 8 16 8" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        <polyline points="3 21 3 16 8 16" />
      </>
    ),
  }
  return (
    <svg viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[type]}
    </svg>
  )
}
