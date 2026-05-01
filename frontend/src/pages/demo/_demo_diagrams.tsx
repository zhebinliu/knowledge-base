/**
 * 共用图表组件 — 给 InsightDemo / SurveyDemo / OutlineDemo 复用
 *
 * - PipelineDiagram:横向流程 pipeline,方框 hover 显示 tooltip,点击展开详情
 * - ArchitectureDiagram:分层架构图(输入层 / 引擎层 / 输出层)
 * - IOTable:输入/输出产物表(可点击行展开看示例)
 *
 * 设计原则:
 * - 不引入新 dep,用 Tailwind + 自绘 SVG
 * - 互动 hover/click 都靠 React state
 * - 移动端优雅降级(横向滚动)
 */
import { useState } from 'react'
import { ChevronRight, ChevronDown, Info } from 'lucide-react'

// ── 类型 ──────────────────────────────────────────────────────────────────────

export interface PipelineStage {
  key: string
  label: string
  short: string         // 一句话总结(显示在方框下)
  detail: string        // 展开后的详细说明
  color?: 'orange' | 'blue' | 'purple' | 'emerald' | 'slate'
  icon?: React.ReactNode
}

export interface ArchLayer {
  key: string
  label: string         // 层名(如"输入层")
  color: 'blue' | 'orange' | 'emerald' | 'purple' | 'slate'
  components: { name: string; description: string }[]
}

export interface IORow {
  key: string
  label: string
  source: string        // 来源(哪个表 / 哪个 API / 哪个文档)
  format: string        // 数据格式 / 字段
  example?: string      // 可选示例(展开显示)
}

// ── PipelineDiagram ────────────────────────────────────────────────────────

const COLOR_MAP: Record<NonNullable<PipelineStage['color']>, { bg: string; text: string; ring: string; box: string }> = {
  orange:  { bg: 'bg-orange-50',  text: 'text-orange-700',  ring: 'ring-orange-300',  box: 'bg-orange-500' },
  blue:    { bg: 'bg-sky-50',     text: 'text-sky-700',     ring: 'ring-sky-300',     box: 'bg-sky-500' },
  purple:  { bg: 'bg-purple-50',  text: 'text-purple-700',  ring: 'ring-purple-300',  box: 'bg-purple-500' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-300', box: 'bg-emerald-500' },
  slate:   { bg: 'bg-slate-50',   text: 'text-slate-700',   ring: 'ring-slate-300',   box: 'bg-slate-400' },
}

export function PipelineDiagram({
  stages,
  title = '生成流程',
  description,
}: {
  stages: PipelineStage[]
  title?: string
  description?: string
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const active = stages.find(s => s.key === activeKey)

  return (
    <section className="py-16 bg-white border-b border-line">
      <div className="max-w-[1500px] mx-auto px-8 sm:px-12">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="text-2xl font-bold text-ink">{title}</h2>
          <span className="text-xs text-ink-muted">点击任意阶段查看详情</span>
        </div>
        {description && (
          <p className="text-sm text-ink-secondary mb-6 leading-relaxed">{description}</p>
        )}

        {/* Pipeline */}
        <div className="overflow-x-auto pb-3 -mx-2 px-2">
          <div className="flex items-stretch gap-1 min-w-max">
            {stages.map((s, idx) => {
              const c = COLOR_MAP[s.color || 'slate']
              const isActive = activeKey === s.key
              return (
                <div key={s.key} className="flex items-stretch">
                  <button
                    onClick={() => setActiveKey(isActive ? null : s.key)}
                    className={`group min-w-[150px] max-w-[180px] px-4 py-4 rounded-lg border text-left transition ${
                      isActive ? `${c.bg} ring-2 ${c.ring} border-transparent` : 'bg-white border-line hover:border-orange-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-6 h-6 rounded ${c.box} text-white text-[11px] font-bold flex items-center justify-center`}>
                        {idx + 1}
                      </span>
                      {s.icon && <span className={c.text}>{s.icon}</span>}
                    </div>
                    <div className={`text-sm font-semibold ${isActive ? c.text : 'text-ink'}`}>{s.label}</div>
                    <div className="text-[11px] text-ink-muted mt-1.5 leading-snug">{s.short}</div>
                  </button>
                  {idx < stages.length - 1 && (
                    <div className="flex items-center px-1.5">
                      <ChevronRight size={16} className="text-ink-muted" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Active stage detail */}
        {active && (
          <div className={`mt-5 p-4 rounded-lg ${COLOR_MAP[active.color || 'slate'].bg} border border-line`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-xs font-semibold ${COLOR_MAP[active.color || 'slate'].text}`}>阶段详情 · {active.label}</span>
                </div>
                <p className="text-sm text-ink-secondary leading-relaxed whitespace-pre-line">{active.detail}</p>
              </div>
              <button
                onClick={() => setActiveKey(null)}
                className="text-[11px] text-ink-muted hover:text-ink shrink-0"
              >
                收起
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

// ── ArchitectureDiagram ─────────────────────────────────────────────────────

export function ArchitectureDiagram({
  layers,
  title = '系统架构',
  description,
}: {
  layers: ArchLayer[]
  title?: string
  description?: string
}) {
  const [activeComponent, setActiveComponent] = useState<string | null>(null)

  return (
    <section className="py-16 bg-canvas border-b border-line">
      <div className="max-w-[1500px] mx-auto px-8 sm:px-12">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="text-2xl font-bold text-ink">{title}</h2>
          <span className="text-xs text-ink-muted">点击组件查看说明</span>
        </div>
        {description && (
          <p className="text-sm text-ink-secondary mb-6 leading-relaxed">{description}</p>
        )}

        <div className="space-y-3">
          {layers.map((layer, lidx) => {
            const c = COLOR_MAP[layer.color]
            return (
              <div key={layer.key}>
                <div className="flex items-center gap-3 mb-2">
                  <span className={`text-[11px] font-semibold ${c.text} px-2 py-0.5 rounded ${c.bg}`}>
                    第 {lidx + 1} 层 · {layer.label}
                  </span>
                  <span className="flex-1 h-px bg-line" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2.5">
                  {layer.components.map(comp => {
                    const compKey = `${layer.key}::${comp.name}`
                    const isActive = activeComponent === compKey
                    return (
                      <button
                        key={comp.name}
                        onClick={() => setActiveComponent(isActive ? null : compKey)}
                        className={`px-3 py-2.5 rounded-lg border text-left transition ${
                          isActive ? `${c.bg} ring-2 ${c.ring} border-transparent` : 'bg-white border-line hover:border-orange-300'
                        }`}
                      >
                        <div className={`text-xs font-semibold ${isActive ? c.text : 'text-ink'}`}>{comp.name}</div>
                        {isActive && (
                          <div className="text-[11px] text-ink-secondary mt-1.5 leading-snug">{comp.description}</div>
                        )}
                      </button>
                    )
                  })}
                </div>
                {lidx < layers.length - 1 && (
                  <div className="flex justify-center my-1">
                    <ChevronDown size={14} className="text-ink-muted" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ── IO Table ────────────────────────────────────────────────────────────────

export function IOTable({
  title,
  rows,
  description,
  variant = 'input',
}: {
  title: string
  rows: IORow[]
  description?: string
  variant?: 'input' | 'output'
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const headerColor = variant === 'input' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'

  return (
    <section className="py-16 bg-white border-b border-line">
      <div className="max-w-[1500px] mx-auto px-8 sm:px-12">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="text-2xl font-bold text-ink">{title}</h2>
          <span className="text-xs text-ink-muted">点击 ⓘ 查看示例</span>
        </div>
        {description && (
          <p className="text-sm text-ink-secondary mb-6 leading-relaxed">{description}</p>
        )}
        <div className="border border-line rounded-lg overflow-hidden">
          <div className={`px-4 py-2 text-xs font-semibold ${headerColor} grid grid-cols-12 gap-3`}>
            <div className="col-span-3">名称</div>
            <div className="col-span-3">来源</div>
            <div className="col-span-5">数据格式</div>
            <div className="col-span-1 text-right">示例</div>
          </div>
          {rows.map(r => {
            const isExpanded = expanded === r.key
            return (
              <div key={r.key} className="border-t border-line first:border-t-0">
                <div className="px-4 py-2.5 grid grid-cols-12 gap-3 items-start hover:bg-slate-50/50 transition">
                  <div className="col-span-3 text-sm font-semibold text-ink">{r.label}</div>
                  <div className="col-span-3 text-xs text-ink-secondary">{r.source}</div>
                  <div className="col-span-5 text-xs text-ink-muted font-mono">{r.format}</div>
                  <div className="col-span-1 text-right">
                    {r.example && (
                      <button
                        onClick={() => setExpanded(isExpanded ? null : r.key)}
                        className="p-1 rounded hover:bg-slate-100 text-ink-muted hover:text-ink"
                      >
                        <Info size={14} />
                      </button>
                    )}
                  </div>
                </div>
                {isExpanded && r.example && (
                  <div className="px-4 pb-3 pt-1 bg-slate-50/40">
                    <pre className="text-[11px] text-ink-secondary bg-white border border-line rounded p-2 overflow-x-auto whitespace-pre-wrap">{r.example}</pre>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ── Section Header(简单标题块,各页通用) ──────────────────────────────────

export function DemoSectionHeader({
  title, subtitle, badge,
}: {
  title: string; subtitle?: string; badge?: string
}) {
  return (
    <div className="max-w-[1500px] mx-auto px-8 sm:px-12 pt-12 pb-6">
      {badge && (
        <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-orange-100 text-[#D96400]">{badge}</span>
      )}
      <h2 className="text-2xl font-bold text-ink mt-2">{title}</h2>
      {subtitle && <p className="text-sm text-ink-secondary mt-1.5 leading-relaxed">{subtitle}</p>}
    </div>
  )
}
