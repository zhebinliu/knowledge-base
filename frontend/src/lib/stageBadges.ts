/**
 * 项目卡片阶段徽章 —— 共享元数据 + 派生逻辑
 *
 * 背景:列表卡原来写死只显示「项目洞察 / 需求调研」两个徽章,后面阶段(方案设计 /
 * 实施 / 测试 / 验收 等)即便已生成,卡片上也看不出来。改成「生成了啥就显示一下」:
 * 两个核心阶段始终作基线占位,其余 kind 只要有 done / 生成中 的 bundle 就追加。
 *
 * 生产页(pages/console)与新前端(redesign/console)两份卡片复用这里,避免再次漂移。
 */
import {
  Lightbulb, Presentation, Globe, ListChecks, ClipboardCheck, ClipboardList,
  FileSearch, Workflow, FileText, Rocket, FlaskConical, BadgeCheck,
} from 'lucide-react'
import type { StageStatusRow } from '../api/client'

export type StageBadgeStatus = 'done' | 'inflight' | 'idle'

export interface KindMeta {
  label: string
  icon: typeof FileText
  color: string
  order: number
}

// 全量产出物 kind → 徽章元数据。颜色按宏观阶段成族:
//   洞察=violet / 调研=blue / 设计=emerald / 实施=teal / 测试=indigo / 验收=green
export const KIND_META: Record<string, KindMeta> = {
  insight:             { label: '项目洞察',   icon: Lightbulb,     color: '#8B5CF6', order: 10 },
  kickoff_pptx:        { label: '启动会PPT',  icon: Presentation,  color: '#8B5CF6', order: 12 },
  kickoff_html:        { label: '启动会页面', icon: Globe,         color: '#8B5CF6', order: 14 },
  survey_outline:      { label: '调研大纲',   icon: ListChecks,    color: '#2563EB', order: 20 },
  research_plan:       { label: '调研计划',   icon: ClipboardCheck, color: '#2563EB', order: 22 },
  survey:              { label: '需求调研',   icon: ClipboardList, color: '#2563EB', order: 24 },
  research_report:     { label: '调研报告',   icon: FileSearch,    color: '#2563EB', order: 26 },
  blueprint_design:    { label: '蓝图设计',   icon: Workflow,      color: '#10B981', order: 30 },
  object_field_layout: { label: '对象字段表', icon: FileText,      color: '#10B981', order: 32 },
  process_setup:       { label: '流程建设表', icon: Workflow,      color: '#10B981', order: 34 },
  implementation_plan: { label: '项目实施',   icon: Rocket,        color: '#0D9488', order: 40 },
  test_plan:           { label: '上线测试',   icon: FlaskConical,  color: '#6366F1', order: 50 },
  acceptance_report:   { label: '项目验收',   icon: BadgeCheck,    color: '#16A34A', order: 60 },
}

// 「啥都没生成」时作为占位灰显的两个核心阶段 —— 保证卡片有稳定骨架、引导用户从这里起步
const CORE_KINDS = ['insight', 'survey']

export interface DerivedBadge extends KindMeta {
  kind: string
  status: StageBadgeStatus
}

/**
 * 从 stage-summary 三元组里聚合出某项目要显示的徽章列表。
 *   - 两个核心阶段(项目洞察 / 需求调研)始终展示作基线
 *   - 其余 kind 只要有 done 或「生成中」的 bundle 就追加 —— 生成了啥就显示一下
 *   - 同一 kind 的多条 bundle:done 优先于 生成中
 *   - 按宏观流程顺序排序;未知 kind 不渲染
 */
export function deriveStageBadges(projectId: string, bundles: StageStatusRow[]): DerivedBadge[] {
  const status = new Map<string, StageBadgeStatus>()
  for (const b of bundles) {
    if (b.project_id !== projectId) continue
    if (!KIND_META[b.kind]) continue
    if (b.status === 'done') {
      status.set(b.kind, 'done')
    } else if (b.status === 'pending' || b.status === 'generating') {
      if (status.get(b.kind) !== 'done') status.set(b.kind, 'inflight')
    }
  }
  // 核心阶段没产出也保留占位灰显
  for (const k of CORE_KINDS) if (!status.has(k)) status.set(k, 'idle')

  return [...status.entries()]
    .map(([kind, st]) => ({ kind, status: st, ...KIND_META[kind] }))
    .sort((a, b) => a.order - b.order)
}
