/**
 * ImplementationWorkspace —— 项目实施阶段工作台(2026-05-29)
 *
 * 三栏布局:
 *   - 左:实施任务清单(按 sharedev skill 分组)
 *   - 中:当前 task 详情 / 报告 markdown 预览(view 切换)
 *   - 右(Phase 1 占位):凭证状态 + 部署面板(Phase 2 真接 sidecar)
 *
 * 数据流:
 *   - implementation_plan bundle 承载 markdown 报告 + bundle.extra.tasks
 *   - 顾问点 task → 中栏显示 task 详情 + (Phase 2) 生成 xml / Groovy 按钮
 *   - Phase 1 不接 sidecar,只展示骨架 + 下载 zip(Phase 2 上线)
 */
import { useMemo, useState } from 'react'
import {
  Loader2, Sparkles, Settings, Package, Code2, Layers,
  ChevronRight, FileText, AlertCircle,
} from 'lucide-react'
import {
  generateOutput,
  type CuratedBundle,
  type ImplementationTask,
  type ShareDevSkill,
} from '../../../api/client'
import MarkdownView from '../../MarkdownView'
import GenerationProgressCard from '../GenerationProgressCard'

// ── sharedev skill 分组 + 标签 ───────────────────────────────────────

interface SkillGroupDef {
  key: string
  label: string
  icon: typeof Settings
  skills: ShareDevSkill[]
}

const SKILL_GROUPS: SkillGroupDef[] = [
  {
    key: 'config',
    label: '配置类(对象 / 字段 / 校验 / 布局)',
    icon: Settings,
    skills: [
      'sharedev-object',
      'sharedev-field',
      'sharedev-validation-rule',
      'sharedev-layout',
      'sharedev-layout-rule',
    ],
  },
  {
    key: 'apl',
    label: 'APL 函数(Groovy)',
    icon: Code2,
    skills: [
      'sharedev-apl-implement',
      'sharedev-apl-lite',
      'sharedev-apl-code-review',
    ],
  },
  {
    key: 'pwc',
    label: 'PWC 组件',
    icon: Layers,
    skills: [
      'sharedev-pwc',
      'sharedev-pwc-write-prd-spec',
      'sharedev-pwc-write-arch',
      'sharedev-pwc-write-plans',
      'sharedev-pwc-execute-plans',
      'sharedev-pwc-subagent-driven-development',
      'sharedev-pwc-finish-development',
      'sharedev-pwc-review-code',
      'sharedev-pwc-fix-bug',
    ],
  },
  {
    key: 'meta',
    label: '智能编排',
    icon: Sparkles,
    skills: ['sharedev-auto'],
  },
]

const SKILL_LABEL: Record<string, string> = {
  'sharedev-auto': '智能编排',
  'sharedev-object': '对象定义',
  'sharedev-field': '字段定义',
  'sharedev-validation-rule': '校验规则',
  'sharedev-layout': '页面布局',
  'sharedev-layout-rule': '布局规则',
  'sharedev-apl-implement': 'APL 函数(全流程)',
  'sharedev-apl-lite': 'APL 函数(简版)',
  'sharedev-apl-code-review': 'APL 代码评审',
  'sharedev-pwc': 'PWC 组件',
  'sharedev-pwc-write-prd-spec': 'PWC · PRD',
  'sharedev-pwc-write-arch': 'PWC · 架构',
  'sharedev-pwc-write-plans': 'PWC · 计划',
  'sharedev-pwc-execute-plans': 'PWC · 执行',
  'sharedev-pwc-subagent-driven-development': 'PWC · 子 agent',
  'sharedev-pwc-finish-development': 'PWC · 收尾',
  'sharedev-pwc-review-code': 'PWC · 代码评审',
  'sharedev-pwc-fix-bug': 'PWC · 修 bug',
}

// Phase 1 已接入(其他 skill 显示但点不动)
const SKILLS_AVAILABLE_PHASE_1: Set<string> = new Set([
  'sharedev-object',
  'sharedev-field',
])

// ── 主组件 ──────────────────────────────────────────────────────────

interface Props {
  projectId: string
  planBundle: CuratedBundle | undefined
  planInflight: CuratedBundle | undefined
  onRefetch: () => void
}

type ImplementationView = 'preparation' | 'overview' | 'task_detail'

export default function ImplementationWorkspace({
  projectId, planBundle, planInflight, onRefetch,
}: Props) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [view, setView] = useState<ImplementationView>(planBundle ? 'overview' : 'preparation')

  const tasks: ImplementationTask[] = useMemo(
    () => planBundle?.implementation_tasks || [],
    [planBundle],
  )

  // 按 skill 分组的任务
  const tasksByGroup = useMemo(() => {
    const m: Record<string, ImplementationTask[]> = {}
    for (const g of SKILL_GROUPS) m[g.key] = []
    for (const t of tasks) {
      for (const g of SKILL_GROUPS) {
        if (g.skills.includes(t.sharedev_skill)) {
          m[g.key].push(t)
          break
        }
      }
    }
    return m
  }, [tasks])

  const selectedTask = selectedTaskId ? tasks.find(t => t.task_id === selectedTaskId) : null

  // ── PreparationView(尚未生成实施任务清单)──
  if (view === 'preparation' && !planBundle && !planInflight) {
    return (
      <PreparationView projectId={projectId} onRefetch={onRefetch} />
    )
  }

  // ── 生成中 ──
  if (planInflight) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="rounded-lg border border-line bg-white p-5 space-y-3">
          <div className="text-base font-semibold text-ink flex items-center gap-2">
            <Package size={15} className="text-orange-600" />
            实施任务清单(生成中)
          </div>
          <div className="text-sm text-ink-secondary">
            综合调研报告 + 蓝图设计,LLM 一次大调用产出 5 章 markdown + 结构化任务清单(15-80 条),约 2-4 分钟。
          </div>
          <GenerationProgressCard bundle={planInflight} />
        </div>
      </div>
    )
  }

  // ── 三栏工作台 ──
  return (
    <div className="flex-shrink-0 h-[calc(100vh-56px)] flex bg-canvas overflow-hidden">
      {/* 左栏:任务清单(按 skill 分组) */}
      <div className="w-[320px] flex-shrink-0 border-r border-line bg-white flex flex-col">
        <div className="flex-shrink-0 px-3 py-2 border-b border-line">
          <div className="text-[11px] text-ink-muted mb-1.5">实施任务({tasks.length} 条)</div>
          <button
            onClick={() => { setView('overview'); setSelectedTaskId(null) }}
            className={`w-full text-left px-2 py-1.5 rounded text-xs transition ${
              view === 'overview' ? 'bg-orange-50 text-orange-700 ring-1 ring-orange-200' : 'hover:bg-slate-50 text-ink'
            }`}
          >
            <FileText size={11} className="inline mr-1" />
            任务清单概览(markdown)
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-2 space-y-2">
          {SKILL_GROUPS.map(group => {
            const groupTasks = tasksByGroup[group.key] || []
            if (groupTasks.length === 0) return null
            return (
              <SkillGroup
                key={group.key}
                group={group}
                tasks={groupTasks}
                selectedTaskId={selectedTaskId}
                onPickTask={id => {
                  setSelectedTaskId(id)
                  setView('task_detail')
                }}
              />
            )
          })}
          {tasks.length === 0 && (
            <div className="text-center py-12 text-xs text-ink-muted">
              <AlertCircle size={20} className="mx-auto mb-2 opacity-50" />
              任务清单为空。可能 LLM 输出格式异常,建议重新生成。
            </div>
          )}
        </div>
      </div>

      {/* 中栏:当前 view 的主体 */}
      <div className="flex-1 min-h-0 flex flex-col bg-white overflow-hidden">
        {view === 'overview' && planBundle && (
          <div className="flex-1 min-h-0 overflow-auto p-6 max-w-[1200px] mx-auto w-full">
            <MarkdownView content={planBundle.content_md || ''} />
          </div>
        )}
        {view === 'task_detail' && selectedTask && (
          <TaskDetailPanel task={selectedTask} bundleId={planBundle?.id} />
        )}
        {view === 'task_detail' && !selectedTask && (
          <div className="text-center py-16 text-ink-muted text-sm">
            从左栏选一条任务
          </div>
        )}
      </div>

      {/* 右栏(Phase 1 占位)— Phase 2 接 sidecar */}
      <div className="w-[280px] flex-shrink-0 border-l border-line bg-slate-50/40 flex flex-col">
        <div className="px-3 py-2 border-b border-line">
          <div className="text-xs font-semibold text-ink">部署到客户租户</div>
        </div>
        <div className="flex-1 p-3 text-xs text-ink-secondary space-y-2 leading-relaxed">
          <div className="rounded border border-line bg-white p-2.5">
            <div className="font-medium text-ink mb-1">Phase 1 状态</div>
            <div className="text-[11px] text-ink-muted">
              凭证管理已上线(到「个人设置 → ShareDev 集成」填客户租户 PaaS token),
              但实际推送到租户的 sidecar 还没上,**下一轮交付**。
            </div>
          </div>
          <div className="rounded border border-line bg-white p-2.5">
            <div className="font-medium text-ink mb-1">已上线 skill</div>
            <ul className="text-[11px] space-y-0.5">
              {Array.from(SKILLS_AVAILABLE_PHASE_1).map(s => (
                <li key={s}>· {SKILL_LABEL[s] || s}</li>
              ))}
            </ul>
            <div className="text-[10px] text-ink-muted mt-1.5">
              其他 15 个 skill 待 Phase 2 / 3 接入
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── PreparationView(尚未生成实施任务清单)──

function PreparationView({ projectId, onRefetch }: { projectId: string; onRefetch: () => void }) {
  const [triggering, setTriggering] = useState(false)
  const trigger = async () => {
    setTriggering(true)
    try {
      await generateOutput({ kind: 'implementation_plan', project_id: projectId })
      onRefetch()
    } catch (e: any) {
      alert(e?.response?.data?.detail || e?.message || '触发生成失败。请确认本项目已生成「调研报告」和「蓝图设计」。')
    } finally {
      setTriggering(false)
    }
  }
  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="rounded-lg border border-line bg-white p-5 space-y-3">
        <div className="text-base font-semibold text-ink flex items-center gap-2">
          <Package size={15} className="text-orange-600" />
          实施任务清单
        </div>
        <div className="text-sm text-ink-secondary leading-relaxed">
          综合本项目的<strong>调研报告</strong> + <strong>蓝图设计</strong>,LLM 一次输出 5 章 markdown
          + 结构化任务清单(15-80 条原子任务,每条关联一个 sharedev skill)。
          顾问拿到任务清单 → 点单条任务 → (Phase 2)调对应 sharedev skill 的方法论生成 xml/Groovy
          → 部署到客户租户。
        </div>
        <div className="text-xs text-ink-muted">
          前置条件:本项目需先生成「调研报告」和「蓝图设计」。生成耗时 2-4 分钟。
        </div>
        <button
          onClick={trigger}
          disabled={triggering}
          className="inline-flex items-center gap-1 px-4 py-2 text-sm rounded border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 disabled:opacity-50"
        >
          {triggering ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          立即生成实施任务清单
        </button>
      </div>
    </div>
  )
}

// ── SkillGroup ─────────────────────────────────────────────────────

function SkillGroup({
  group, tasks, selectedTaskId, onPickTask,
}: {
  group: SkillGroupDef
  tasks: ImplementationTask[]
  selectedTaskId: string | null
  onPickTask: (id: string) => void
}) {
  const [open, setOpen] = useState(true)
  const Icon = group.icon
  const p0 = tasks.filter(t => t.priority === 'P0').length
  const p1 = tasks.filter(t => t.priority === 'P1').length
  return (
    <div className="rounded border border-line/60 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-2.5 py-1.5 bg-slate-50/60 hover:bg-slate-50 flex items-center gap-1.5 text-left"
      >
        <ChevronRight
          size={11}
          className={`transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <Icon size={11} className="text-ink-muted" />
        <span className="flex-1 text-[11px] font-medium text-ink truncate">{group.label}</span>
        <span className="text-[10px] text-ink-muted bg-slate-100 px-1 rounded shrink-0">
          {tasks.length}
        </span>
        {p0 > 0 && (
          <span className="text-[10px] text-red-700 bg-red-50 px-1 rounded shrink-0">P0·{p0}</span>
        )}
        {p1 > 0 && (
          <span className="text-[10px] text-orange-700 bg-orange-50 px-1 rounded shrink-0">P1·{p1}</span>
        )}
      </button>
      {open && (
        <div className="bg-white">
          {tasks.map(t => (
            <button
              key={t.task_id}
              onClick={() => onPickTask(t.task_id)}
              className={`w-full text-left px-2.5 py-1.5 border-t border-line/40 text-[11px] flex items-start gap-1.5 transition ${
                selectedTaskId === t.task_id ? 'bg-orange-50 ring-1 ring-orange-200' : 'hover:bg-slate-50'
              }`}
            >
              <span className={`shrink-0 inline-flex items-center justify-center w-9 h-4 rounded text-[9px] font-medium ${
                t.priority === 'P0' ? 'bg-red-100 text-red-700' :
                t.priority === 'P1' ? 'bg-orange-100 text-orange-700' :
                t.priority === 'P2' ? 'bg-slate-100 text-ink-secondary' :
                'bg-slate-100 text-ink-muted'
              }`}>
                {t.priority}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-ink truncate">{t.task_id}</div>
                <div className="text-[10px] text-ink-muted truncate">{t.description}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── TaskDetailPanel(中栏 task 详情)─────────────────────────────────

function TaskDetailPanel({ task, bundleId: _bundleId }: { task: ImplementationTask; bundleId?: string }) {
  const available = SKILLS_AVAILABLE_PHASE_1.has(task.sharedev_skill)
  return (
    <div className="flex-1 overflow-auto p-6 max-w-[1000px] mx-auto w-full space-y-4">
      <div className="rounded-lg border border-line bg-white p-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center justify-center w-10 h-5 rounded text-[10px] font-medium ${
            task.priority === 'P0' ? 'bg-red-100 text-red-700' :
            task.priority === 'P1' ? 'bg-orange-100 text-orange-700' :
            'bg-slate-100 text-ink-secondary'
          }`}>
            {task.priority}
          </span>
          <span className="text-sm font-mono text-ink">{task.task_id}</span>
          <span className="text-[11px] text-ink-muted">·</span>
          <span className="text-[11px] text-ink-muted">{SKILL_LABEL[task.sharedev_skill] || task.sharedev_skill}</span>
        </div>
        <div className="text-sm text-ink leading-relaxed">{task.description}</div>
        <div className="grid grid-cols-2 gap-2 text-[11px] text-ink-secondary mt-2">
          {task.object_api_name && <div>对象:<span className="font-mono">{task.object_api_name}</span></div>}
          {task.api_name && <div>API Name:<span className="font-mono">{task.api_name}</span></div>}
          {task.ltc_module && <div>LTC 模块:<span className="font-mono">{task.ltc_module}</span></div>}
          {task.estimated_hours > 0 && <div>预估工时:{task.estimated_hours} 小时</div>}
          {task.req_ids.length > 0 && <div>来源需求:{task.req_ids.join(', ')}</div>}
          {task.depends_on.length > 0 && <div>依赖:{task.depends_on.join(', ')}</div>}
        </div>
      </div>

      <div className="rounded-lg border border-line bg-white p-4 space-y-2">
        <div className="text-sm font-semibold text-ink flex items-center gap-1">
          <Sparkles size={13} className="text-orange-600" />
          生成配置文件
        </div>
        {available ? (
          <>
            <div className="text-xs text-ink-secondary">
              本任务可用 <code className="text-[11px] bg-slate-100 px-1 rounded">{task.sharedev_skill}</code> skill 的方法论 + 模板生成
              {task.sharedev_skill === 'sharedev-object' ? ' object-meta.xml' : ' field-meta.xml'} 配置文件。
            </div>
            <button
              disabled
              title="Phase 1.5 上线:本轮先做骨架,下一轮接 LLM 生成 xml"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded border border-orange-300 text-orange-700 bg-orange-50 opacity-50 cursor-not-allowed"
            >
              <Sparkles size={12} /> 生成配置(下一轮上线)
            </button>
          </>
        ) : (
          <div className="text-xs text-ink-muted">
            本 skill(<code className="text-[11px] bg-slate-100 px-1 rounded">{task.sharedev_skill}</code>) 在 Phase 2 / 3 接入,
            当前可手动用 sharedev CLI 完成对应配置。
          </div>
        )}
      </div>
    </div>
  )
}
