/**
 * P07 — 需求调研 · 新模式 (诚实版)
 *
 * 现状(已上线):
 *   industry_packs/ 4 个行业包(智能制造 / 能源 / 医药 / 科技)
 *   每行业 8-10 个专属字段, planner 按 project.industry 自动注入
 *
 * 路线图:
 *   行业 benchmark 数据库 — 用于答案对照
 *   类似项目案例库 — 用于参考建议
 */
import { SlideShell, SlideHeader, GradText, TierSection } from '../Shell'
import { PPT, fz } from '../theme'

// 真实 industry_packs 内容(按代码核对)
const INDUSTRY_PACKS = [
  {
    name: '智能制造',
    code: 'manufacturing',
    fields: 8,
    color: PPT.brand,
    samples: ['BOM 复杂度', 'MES / PLM', 'ERP 厂商', 'install base'],
  },
  {
    name: '能源',
    code: 'energy',
    fields: 9,
    color: PPT.amber,
    samples: ['电站规模', '运维半径', '调度对接', '补贴政策'],
  },
  {
    name: '医药 / 医疗',
    code: 'healthcare',
    fields: 8,
    color: PPT.green,
    samples: ['CSO 模式', '合规要求', '药代管理', '学术推广'],
  },
  {
    name: '科技 / SaaS',
    code: 'technology',
    fields: 7,
    color: PPT.blue,
    samples: ['ARR 体量', 'MRR 流失', 'PMF 阶段', 'PLG/SLG'],
  },
]

export default function Slide07SurveyNew() {
  return (
    <SlideShell>
      <SlideHeader
        index="07 / 15"
        tag="NEW · 加上 AI 之后"
        title={<>AI 基于<GradText>行业 know-how</GradText>, 给 PM 行业专属问题模板</>}
        sub="把过往项目的行业经验装进系统 — 现在已上线 4 个行业包, 后续接入对照尺和案例库"
      />

      <div className="flex-1 grid grid-rows-[auto_auto] gap-[1.6cqi]" style={{ minHeight: 0 }}>

        {/* 上半:已上线 — 4 个行业包 */}
        <TierSection
          status="now"
          title={<>4 个行业包 · 每个项目自动按客户行业注入</>}
          hint="planner.py 按 project.industry 命中 industry_pack, 把行业专属字段 patch 进调研大纲"
        >
          <div className="grid grid-cols-4 gap-[1cqi]">
            {INDUSTRY_PACKS.map((p) => (
              <IndustryCard key={p.code} {...p} />
            ))}
          </div>
        </TierSection>

        {/* 下半:路线图 — 对照尺 + 案例库 */}
        <TierSection
          status="next"
          title="下一步 · 把 行业 benchmark + 案例库 补齐"
          hint="目前 prompt 里有 benchmark / 类似案例 提示, LLM 只能凭训练知识答 — 接入真实数据库后, 对照和建议才有据可依"
        >
          <div className="grid grid-cols-2 gap-[1cqi]">
            <RoadmapCard
              icon="ruler"
              title="行业 benchmark 数据库"
              desc="客户答「1000 SKU」自动对比同行业平均 / 头部 — 让 PM 一眼看出"
              status="数据沉淀中"
            />
            <RoadmapCard
              icon="library"
              title="类似项目案例库"
              desc="基于答案匹配「类似客户用过什么方案 / 踩过什么坑」 — 转化为 PM 下一步动作"
              status="数据沉淀中"
            />
          </div>
        </TierSection>
      </div>
    </SlideShell>
  )
}

// ── 行业包卡(真实数据)──
function IndustryCard({
  name, code, fields, color, samples,
}: { name: string; code: string; fields: number; color: string; samples: string[] }) {
  return (
    <div
      className="flex flex-col gap-[0.5cqi] p-[1cqi] rounded-[0.8cqi]"
      style={{
        background: 'rgba(0,0,0,0.25)',
        border: `1px solid ${color}55`,
      }}
    >
      <div className="flex items-center justify-between">
        <span style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg }}>
          {name}
        </span>
        <span
          className="font-mono font-extrabold"
          style={{
            fontSize: fz.h3,
            color,
            textShadow: `0 0 12px ${color}99`,
          }}
        >
          {fields}
        </span>
      </div>
      <span
        className="font-mono"
        style={{ fontSize: fz.tiny, color: PPT.fgMuted, letterSpacing: '0.05em' }}
      >
        {code} · {fields} 字段
      </span>
      <div className="flex flex-wrap gap-[0.3cqi] mt-[0.2cqi]">
        {samples.map((s) => (
          <span
            key={s}
            className="px-[0.5cqi] py-[0.1cqi] rounded-full"
            style={{
              fontSize: fz.tiny,
              color,
              background: `${color}1A`,
              border: `1px solid ${color}40`,
            }}
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── 路线图卡 ──
function RoadmapCard({
  icon, title, desc, status,
}: { icon: 'ruler' | 'library'; title: string; desc: string; status: string }) {
  return (
    <div
      className="flex items-start gap-[1cqi] p-[1cqi] rounded-[0.8cqi]"
      style={{
        background: 'rgba(96,165,250,0.06)',
        border: '1px dashed rgba(96,165,250,0.40)',
      }}
    >
      <span
        className="flex-shrink-0 flex items-center justify-center rounded-[0.6cqi]"
        style={{
          width: '3cqi', height: '3cqi',
          background: 'rgba(96,165,250,0.14)',
          color: PPT.blue,
          border: '1px solid rgba(96,165,250,0.40)',
        }}
      >
        <RoadmapIcon type={icon} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-[0.6cqi] mb-[0.2cqi]">
          <span style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg }}>
            {title}
          </span>
          <span
            className="font-mono px-[0.4cqi] py-[0.1cqi] rounded-[0.3cqi]"
            style={{
              fontSize: fz.tiny,
              color: PPT.blue,
              background: 'rgba(96,165,250,0.18)',
              border: '1px solid rgba(96,165,250,0.30)',
              letterSpacing: '0.05em',
            }}
          >
            {status}
          </span>
        </div>
        <div style={{ fontSize: fz.small, color: PPT.fgMuted, lineHeight: 1.45 }}>
          {desc}
        </div>
      </div>
    </div>
  )
}

function RoadmapIcon({ type }: { type: 'ruler' | 'library' }) {
  return (
    <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {type === 'ruler' ? (
        <>
          <rect x="2" y="9" width="20" height="6" rx="0.5" />
          <path d="M6 9v3M10 9v4M14 9v3M18 9v4" />
        </>
      ) : (
        <>
          <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14H6a2 2 0 0 1 0-4h14" />
          <path d="M9 7h6M9 11h6" />
        </>
      )}
    </svg>
  )
}
