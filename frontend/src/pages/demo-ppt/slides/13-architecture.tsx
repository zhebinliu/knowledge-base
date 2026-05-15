/**
 * P13 — 整体架构
 * 后台沉淀 + 前台消费 双向架构图
 */
import { type ReactNode } from 'react'
import { SlideShell, SlideHeader, GradText, GlassCard } from '../Shell'
import { PPT, fz } from '../theme'

const BACKEND = [
  { icon: 'upload',  label: '文档上传',   sub: 'SOW / 方案 / 合同 / 纪要' },
  { icon: 'layers',  label: 'LLM 切片',   sub: '按业务语义, 不按段落' },
  { icon: 'brain',   label: '向量化索引', sub: 'Qdrant 语义检索 + rerank' },
  { icon: 'edit',    label: '人工审核',   sub: 'review queue · 质量第一关' },
  { icon: 'shield',  label: '对抗式挑战', sub: '一攻一守 · 知识质量底线' },
]

const FRONTEND = [
  { icon: 'bot',      label: '项目洞察生成', sub: '10 模块 · 反幻觉三层兜底' },
  { icon: 'survey',   label: '需求调研',     sub: '勾选式 · 大纲 + 6 题型' },
  { icon: 'qa',       label: '智能问答',     sub: 'RAG 检索 · 答案带引用' },
  { icon: 'mic',      label: '会议纪要',     sub: 'ASR → 打磨 → 飞书多维表' },
  { icon: 'lamp',     label: 'AI 实施建议',  sub: '主动给 PM 提方案 / 风险' },
]

export default function Slide13Architecture() {
  return (
    <SlideShell>
      <SlideHeader
        index="13 / 15"
        tag="ARCHITECTURE · 整体架构"
        title={<><GradText>后台沉淀</GradText> + 前台消费 · 一体化设计</>}
        sub="后台是知识的沉淀积累, 前台是 PM 日常的实战工具 — 所有产出从后台召回, 又反向写回沉淀"
      />

      <div className="flex-1 grid grid-cols-[1fr_auto_1fr] gap-[1.4cqi]" style={{ minHeight: 0 }}>

        {/* 左:Backend */}
        <GlassCard className="ppt-stagger-row flex flex-col" pad="1.6cqi">
          <div className="flex items-center justify-between mb-[1cqi]">
            <div className="flex items-center gap-[0.6cqi]">
              <ColumnBadge color={PPT.blue} label="BACKEND" />
              <div>
                <div style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg }}>
                  知识的沉淀积累
                </div>
                <div style={{ fontSize: fz.tiny, color: PPT.fgMuted, marginTop: '0.2cqi' }}>
                  从原始资料 → 结构化、可检索的项目知识
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-[0.5cqi]">
            {BACKEND.map((b, i) => (
              <ArchRow key={i} {...b} color={PPT.blue} />
            ))}
          </div>

          <div
            className="mt-[0.8cqi] pt-[0.6cqi] font-mono text-center"
            style={{
              borderTop: `1px solid rgba(96,165,250,0.20)`,
              fontSize: fz.tiny,
              color: PPT.blue,
              letterSpacing: '0.15em',
            }}
          >
            PostgreSQL · Qdrant · MinIO · Celery · Redis
          </div>
        </GlassCard>

        {/* 中间桥梁 */}
        <div className="flex flex-col items-center justify-center gap-[2cqi]" style={{ minWidth: '8cqi' }}>
          <BridgeArrow direction="right" label="召回 · 引用" color={PPT.fgMuted} />
          <BridgeArrow direction="left"  label="沉淀 · 写回" color={PPT.brand} />
        </div>

        {/* 右:Frontend */}
        <GlassCard className="ppt-stagger-row flex flex-col" pad="1.6cqi" highlight>
          <div className="flex items-center justify-between mb-[1cqi]">
            <div className="flex items-center gap-[0.6cqi]">
              <ColumnBadge color={PPT.brand} label="FRONTEND" />
              <div>
                <div style={{ fontSize: fz.body, fontWeight: 700, color: PPT.fg }}>
                  PM 日常实战工具
                </div>
                <div style={{ fontSize: fz.tiny, color: PPT.fgMuted, marginTop: '0.2cqi' }}>
                  一切产出都带证据溯源, 一切操作都向后台沉淀
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-[0.5cqi]">
            {FRONTEND.map((f, i) => (
              <ArchRow key={i} {...f} color={PPT.brand} />
            ))}
          </div>

          <div
            className="mt-[0.8cqi] pt-[0.6cqi] font-mono text-center"
            style={{
              borderTop: `1px solid ${PPT.borderHi}`,
              fontSize: fz.tiny,
              color: PPT.brandMid,
              letterSpacing: '0.15em',
            }}
          >
            React · 三栏工作区 · 引用即原文 · 实时编辑
          </div>
        </GlassCard>
      </div>
    </SlideShell>
  )
}

// ── Column 标识 ──
function ColumnBadge({ color, label }: { color: string; label: string }) {
  return (
    <span
      className="font-mono px-[0.6cqi] py-[0.3cqi] rounded-[0.3cqi]"
      style={{
        fontSize: fz.tiny,
        color: '#fff',
        background: color,
        letterSpacing: '0.2em',
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  )
}

// ── 架构行(图标 + 标题 + 描述)──
function ArchRow({ icon, label, sub, color }: { icon: string; label: string; sub: string; color: string }) {
  return (
    <div
      className="flex items-center gap-[0.8cqi] px-[0.8cqi] py-[0.5cqi] rounded-[0.5cqi]"
      style={{
        background: 'rgba(0,0,0,0.18)',
        border: `1px solid rgba(255,255,255,0.06)`,
      }}
    >
      <span
        className="flex items-center justify-center rounded-[0.4cqi] flex-shrink-0"
        style={{
          width: '2cqi', height: '2cqi',
          background: `${color}1F`,
          color,
          border: `1px solid ${color}55`,
        }}
      >
        <ArchIcon type={icon} />
      </span>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: fz.small, fontWeight: 600, color: PPT.fg }}>
          {label}
        </div>
        <div style={{ fontSize: fz.tiny, color: PPT.fgMuted, lineHeight: 1.3 }}>
          {sub}
        </div>
      </div>
    </div>
  )
}

// ── 桥梁箭头 ──
function BridgeArrow({ direction, label, color }: { direction: 'left' | 'right'; label: string; color: string }) {
  const isRight = direction === 'right'
  return (
    <div className="flex flex-col items-center gap-[0.4cqi]">
      <svg width="6cqi" height="2cqi" viewBox="0 0 60 20" fill="none">
        {isRight ? (
          <>
            <line x1="2" y1="10" x2="52" y2="10" stroke={color} strokeWidth="2" strokeDasharray="3 3" />
            <polygon points="58,10 48,4 48,16" fill={color} />
          </>
        ) : (
          <>
            <line x1="58" y1="10" x2="8" y2="10" stroke={color} strokeWidth="2" strokeDasharray="3 3" />
            <polygon points="2,10 12,4 12,16" fill={color} />
          </>
        )}
      </svg>
      <span
        className="font-mono"
        style={{ fontSize: fz.tiny, color, letterSpacing: '0.1em', whiteSpace: 'nowrap' }}
      >
        {label}
      </span>
    </div>
  )
}

// ── 架构图标(SVG)──
function ArchIcon({ type }: { type: string }) {
  const paths: Record<string, ReactNode> = {
    upload: <><path d="M12 17V3M5 10l7-7 7 7M3 21h18" /></>,
    layers: <><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" /></>,
    brain:  <><path d="M9 4a3 3 0 0 0-3 3v2a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-2a3 3 0 0 0 3-3v-2a3 3 0 0 0-3-3V7a3 3 0 0 0-3-3H9z" /><path d="M12 4v16" /></>,
    edit:   <><path d="M11 4H4v16h16v-7M18.5 2.5a2.1 2.1 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></>,
    shield: <><path d="M12 2L4 5v7c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V5l-8-3z" /><path d="M9 12l2 2 4-4" /></>,
    bot:    <><rect x="3" y="8" width="18" height="12" rx="2" /><circle cx="9" cy="14" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="14" r="1" fill="currentColor" stroke="none" /><path d="M12 4v4M9 4h6" /></>,
    survey: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 9l1.5 1.5L14 7M9 14l1.5 1.5L14 12" /></>,
    qa:     <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 4M12 17.5h.01" /></>,
    mic:    <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M9 22h6" /></>,
    lamp:   <><path d="M9 18h6M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.5c1 1 1.5 2 1.5 3.5h5c0-1.5.5-2.5 1.5-3.5A7 7 0 0 0 12 2z" /></>,
  }
  return (
    <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[type]}
    </svg>
  )
}
