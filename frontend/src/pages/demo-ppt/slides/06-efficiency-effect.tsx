/**
 * P06 — 人效效果 · 时间被还回来了
 *
 * 用相对表述展示三件工序的"前后对比", 不编硬数字
 * 底部:把节省的时间投到哪里(AI 替不掉的事)
 */
import { SlideShell, SlideHeader, GradText, GlassCard } from '../Shell'
import { PPT, fz } from '../theme'

const COMPARISONS = [
  {
    task: '项目接手',
    old: '数小时',
    oldDesc: '翻文档 / 找条款',
    now: '几分钟',
    nowDesc: '一键生成 10 模块洞察',
  },
  {
    task: '调研启动',
    old: '半天起',
    oldDesc: '凭空设计问卷',
    now: '几分钟',
    nowDesc: 'LTC + 行业包 自动出',
  },
  {
    task: '会议复盘',
    old: '1-2 小时 / 场',
    oldDesc: '手写纪要 + 整理',
    now: '上传即出',
    nowDesc: 'ASR → 飞书全自动',
  },
]

const REDIRECTED = [
  { title: '客户判断',     desc: '识别客户真实痛点 / 决策链 / 关键人',  color: PPT.brand },
  { title: '方案设计',     desc: '基于客户特点定制方案, 不是模板套',     color: PPT.purple },
  { title: '客户关系',     desc: '陪客户、对齐预期、信任建设',          color: PPT.green },
  { title: '问题攻坚',     desc: '突发风险 / 跨部门协调 / 紧急决策',     color: PPT.amber },
]

export default function Slide06EfficiencyEffect() {
  return (
    <SlideShell>
      <SlideHeader
        index="06 / 15"
        tag="目的 1 · 人效 · 效果"
        title={<>时间<GradText>被还回来了</GradText> · 投到 AI 替不掉的事上</>}
        sub="不是单纯快了 — 而是把 PM 的注意力从机械工序解放, 让位给客户判断、方案设计、关系经营这些「高价值」的事"
      />

      <div className="flex-1 grid grid-rows-[1fr_auto] gap-[1.6cqi]" style={{ minHeight: 0 }}>

        {/* 上半:三组时间对比 */}
        <div className="ppt-stagger-row grid grid-cols-3 gap-[1.4cqi]">
          {COMPARISONS.map((c, i) => (
            <ComparisonCard key={i} {...c} />
          ))}
        </div>

        {/* 下半:节省的时间投到哪 */}
        <GlassCard className="ppt-stagger-row" pad="1.6cqi">
          <div className="flex items-center justify-between mb-[1cqi]">
            <div>
              <div style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg }}>
                这些时间, <GradText>投到 AI 替不掉的事</GradText>
              </div>
              <div style={{ fontSize: fz.small, color: PPT.fgMuted, marginTop: '0.2cqi' }}>
                客户付钱买的是 PM 的判断, 不是 PM 的整理
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-[0.8cqi]">
            {REDIRECTED.map((r, i) => (
              <div
                key={i}
                className="px-[1cqi] py-[0.8cqi] rounded-[0.6cqi]"
                style={{
                  background: `${r.color}10`,
                  border: `1px solid ${r.color}40`,
                }}
              >
                <div className="flex items-center gap-[0.4cqi] mb-[0.3cqi]">
                  <span
                    style={{
                      width: '0.6cqi', height: '0.6cqi',
                      borderRadius: '50%',
                      background: r.color,
                      flexShrink: 0,
                      boxShadow: `0 0 6px ${r.color}`,
                    }}
                  />
                  <span style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg }}>
                    {r.title}
                  </span>
                </div>
                <div style={{ fontSize: fz.tiny, color: PPT.fgMuted, lineHeight: 1.4 }}>
                  {r.desc}
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </SlideShell>
  )
}

function ComparisonCard({
  task, old, oldDesc, now, nowDesc,
}: { task: string; old: string; oldDesc: string; now: string; nowDesc: string }) {
  return (
    <GlassCard pad="1.4cqi" highlight className="flex flex-col text-center">
      {/* 任务名 */}
      <div
        className="font-mono mb-[0.6cqi]"
        style={{
          fontSize: fz.tiny,
          color: PPT.brandMid,
          letterSpacing: '0.2em',
          fontWeight: 700,
        }}
      >
        {task.toUpperCase()}
      </div>
      <div style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg, marginBottom: '1.2cqi' }}>
        {task}
      </div>

      {/* 老 */}
      <div className="mb-[0.4cqi]">
        <div
          className="ppt-num-pop font-extrabold"
          style={{
            fontSize: fz.h2,
            color: PPT.rose,
            opacity: 0.85,
            textDecoration: 'line-through',
            textDecorationColor: 'rgba(251,113,133,0.55)',
            textDecorationThickness: '3px',
            lineHeight: 1,
          }}
        >
          {old}
        </div>
        <div style={{ fontSize: fz.tiny, color: PPT.fgMuted, marginTop: '0.4cqi' }}>
          {oldDesc}
        </div>
      </div>

      {/* 箭头 */}
      <svg width="2cqi" height="2cqi" viewBox="0 0 24 24" fill="none" style={{ margin: '0.6cqi auto' }}>
        <path d="M12 5v14M5 12l7 7 7-7" stroke={PPT.brand} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      {/* 新 */}
      <div>
        <div
          className="ppt-num-pop font-extrabold"
          style={{
            fontSize: fz.h1,
            color: PPT.brand,
            textShadow: `0 0 30px ${PPT.brand}99`,
            lineHeight: 1,
            animationDelay: '600ms',
          }}
        >
          {now}
        </div>
        <div style={{ fontSize: fz.tiny, color: PPT.fgMuted, marginTop: '0.4cqi' }}>
          {nowDesc}
        </div>
      </div>
    </GlassCard>
  )
}
