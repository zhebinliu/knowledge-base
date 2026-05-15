/**
 * P07 — 专业性痛点
 * 两个并列痛点:
 *   1. 顾问个人特色 → 输出参差(同一项目 5 个 PM 5 种质量)
 *   2. 行业 know-how 缺失 → PM 凭空摸索行业问题, 经验薄就漏
 */
import { SlideShell, SlideHeader, GradText, GlassCard } from '../Shell'
import { PPT, fz } from '../theme'

const CONSULTANTS = [
  { name: '资深 A', score: 92, tag: '15 年经验' },
  { name: '资深 B', score: 78, tag: '10 年经验' },
  { name: '中级 C', score: 62, tag: '5 年经验' },
  { name: '初级 D', score: 41, tag: '2 年经验' },
  { name: '新人 E', score: 28, tag: '< 1 年' },
]

const GENERAL_QS = ['销售线索来源', '商机阶段定义', '合同审批流程', '客户决策链', '数据迁移规模', '权限角色设计']
const INDUSTRY_QS = ['BOM 复杂度 / 嵌套', 'MES / PLM 厂商', 'install base 体量', '渠道分级结构', '售后服务收入占比', '项目型销售流程']

export default function Slide07QualityPain() {
  return (
    <SlideShell>
      <SlideHeader
        index="07 / 15"
        tag="目的 2 · 专业性 · 痛点"
        title={<><GradText>靠人扛</GradText> · 经验<GradText>不沉淀</GradText></>}
        sub="同一个项目, 5 个 PM 拿到 5 份质量截然不同的产物 · 同一行业的坑, 新 PM 重新踩一遍 · 行业 know-how 没装进系统"
      />

      <div className="flex-1 grid grid-cols-2 gap-[1.4cqi]" style={{ minHeight: 0 }}>

        {/* 左:顾问参差柱图 */}
        <GlassCard pad="1.6cqi" className="flex flex-col">
          <div className="flex items-center justify-between mb-[0.8cqi]">
            <div>
              <div style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg }}>
                痛点 1 · 同一个项目 5 个 PM
              </div>
              <div style={{ fontSize: fz.small, color: PPT.fgMuted, marginTop: '0.2cqi' }}>
                输出质量天差地别 — 项目执行下限完全看人
              </div>
            </div>
          </div>

          {/* 柱图 */}
          <div className="flex items-end gap-[1.2cqi] flex-1" style={{ paddingTop: '1cqi', minHeight: 0 }}>
            {CONSULTANTS.map((c, i) => {
              const tone = c.score >= 75 ? PPT.green : c.score >= 50 ? PPT.amber : PPT.rose
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-[0.4cqi]" style={{ minWidth: 0 }}>
                  <span
                    className="font-extrabold ppt-num-pop"
                    style={{
                      fontSize: fz.h3,
                      color: tone,
                      textShadow: `0 0 14px ${tone}99`,
                      animationDelay: `${500 + i * 100}ms`,
                    }}
                  >
                    {c.score}
                  </span>
                  <div
                    className="ppt-bar-grow w-full rounded-t-[0.6cqi]"
                    style={{
                      height: `calc(${c.score} / 100 * 11cqi)`,
                      minHeight: '1cqi',
                      background: `linear-gradient(180deg, ${tone}, ${tone}33)`,
                      boxShadow: `0 0 20px -6px ${tone}99`,
                      border: `1px solid ${tone}55`,
                      borderBottom: 'none',
                      animationDelay: `${400 + i * 90}ms`,
                    }}
                  />
                  <div className="text-center">
                    <div style={{ fontSize: fz.small, color: PPT.fg, fontWeight: 700 }}>
                      {c.name}
                    </div>
                    <div style={{ fontSize: fz.tiny, color: PPT.fgMuted }}>
                      {c.tag}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div
            className="flex justify-between items-center mt-[0.8cqi] pt-[0.6cqi]"
            style={{
              borderTop: `1px solid ${PPT.border}`,
              fontSize: fz.small,
              color: PPT.fgMuted,
              fontWeight: 500,
            }}
          >
            <span>资深</span>
            <span>新 PM 接手 →</span>
            <span style={{ color: PPT.rose }}>下限不可控</span>
          </div>
        </GlassCard>

        {/* 右:行业 know-how 缺失 */}
        <GlassCard pad="1.6cqi" className="flex flex-col">
          <div className="mb-[0.8cqi]">
            <div style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg }}>
              痛点 2 · <GradText>制造业</GradText> 项目要问的题
            </div>
            <div style={{ fontSize: fz.small, color: PPT.fgMuted, marginTop: '0.2cqi' }}>
              通用问题谁都想得到 · 行业专属经验薄就漏
            </div>
          </div>

          <div className="flex-1 grid grid-cols-2 gap-[0.8cqi]" style={{ minHeight: 0 }}>
            {/* 通用 */}
            <div className="flex flex-col gap-[0.4cqi]">
              <div
                className="font-mono px-[0.6cqi] py-[0.2cqi] rounded-full inline-flex items-center gap-[0.4cqi] mb-[0.2cqi]"
                style={{
                  fontSize: fz.tiny,
                  color: PPT.green,
                  background: 'rgba(52,211,153,0.12)',
                  border: '1px solid rgba(52,211,153,0.30)',
                  alignSelf: 'flex-start',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                }}
              >
                通 用 · 谁 都 想 到
              </div>
              {GENERAL_QS.map((q, i) => (
                <QRow key={i} text={q} kind="general" idx={i} />
              ))}
            </div>

            {/* 行业专属 */}
            <div className="flex flex-col gap-[0.4cqi]">
              <div
                className="font-mono px-[0.6cqi] py-[0.2cqi] rounded-full inline-flex items-center gap-[0.4cqi] mb-[0.2cqi]"
                style={{
                  fontSize: fz.tiny,
                  color: PPT.rose,
                  background: 'rgba(251,113,133,0.12)',
                  border: '1px solid rgba(251,113,133,0.30)',
                  alignSelf: 'flex-start',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                }}
              >
                行 业 专 属 · 没 经 验 漏
              </div>
              {INDUSTRY_QS.map((q, i) => (
                <QRow key={i} text={q} kind="industry" idx={i} />
              ))}
            </div>
          </div>

          <div
            className="flex justify-between items-center mt-[0.8cqi] pt-[0.6cqi]"
            style={{
              borderTop: `1px solid ${PPT.border}`,
              fontSize: fz.small,
              color: PPT.fgMuted,
              fontWeight: 500,
            }}
          >
            <span>同行业坑反复踩 →</span>
            <span style={{ color: PPT.rose }}>经验不沉淀为资产</span>
          </div>
        </GlassCard>
      </div>
    </SlideShell>
  )
}

function QRow({ text, kind, idx }: { text: string; kind: 'general' | 'industry'; idx: number }) {
  const isInd = kind === 'industry'
  return (
    <div
      className="flex items-center gap-[0.5cqi] px-[0.7cqi] py-[0.4cqi] rounded-[0.5cqi]"
      style={{
        background: isInd ? 'rgba(251,113,133,0.06)' : 'rgba(52,211,153,0.05)',
        border: `1px solid ${isInd ? 'rgba(251,113,133,0.22)' : 'rgba(52,211,153,0.18)'}`,
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
