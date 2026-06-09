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
import { useMutation } from '@tanstack/react-query'
import {
  Loader2, Sparkles, Settings, Package, Code2, Layers,
  ChevronRight, FileText, AlertCircle, CheckCircle2, AlertTriangle,
  Download, FileCode2, Pencil,
} from 'lucide-react'
import {
  generateTaskConfig,
  tenantConfigZipUrl,
  projectHandoffBundleUrl,
  TOKEN_STORAGE_KEY,
  getOutput,
  type CuratedBundle,
  type ImplementationTask,
  type ShareDevSkill,
} from '../../../api/client'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import MarkdownView from '../../MarkdownView'
import MarkdownEditor from '../MarkdownEditor'
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

// Phase 2 已接入配置生成的 skill(其他 skill 显示但点不动 → 留 Phase 3 接 APL/PWC)
const SKILLS_AVAILABLE: Set<string> = new Set([
  'sharedev-object',
  'sharedev-field',
  'sharedev-validation-rule',
  'sharedev-layout',
  'sharedev-layout-rule',
])

// ── 主组件 ──────────────────────────────────────────────────────────

interface Props {
  projectId: string
  planBundle: CuratedBundle | undefined
  planInflight: CuratedBundle | undefined
  onRefetch: () => Promise<unknown> | unknown
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
  const configuredCount = tasks.filter(t => t.config?.ok).length

  // ── 未生成实施任务清单 ──(2026-06-05 改:本阶段引导用户去 APL 工作台,不再在
  // 这里生成「实施任务清单」。HandoffBanner 大卡片是这阶段的主入口。)
  if (view === 'preparation' && !planBundle && !planInflight) {
    return (
      <div className="overflow-auto h-[calc(100vh-56px)]">
        <HandoffBanner projectId={projectId} />
      </div>
    )
  }

  // ── 生成中 ──
  if (planInflight) {
    return (
      <div className="overflow-auto h-[calc(100vh-56px)]">
        <HandoffBanner projectId={projectId} />
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
      </div>
    )
  }

  // ── 三栏工作台 ──
  return (
    <div className="flex-shrink-0 h-[calc(100vh-56px)] flex flex-col bg-canvas overflow-hidden">
      <HandoffBanner projectId={projectId} compact />
      <div className="flex-1 min-h-0 flex overflow-hidden">
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
          <PlanOverviewView bundle={planBundle} onRefetch={onRefetch} />
        )}
        {view === 'task_detail' && selectedTask && (
          <TaskDetailPanel
            task={selectedTask}
            bundleId={planBundle?.id}
            onRefetch={onRefetch}
          />
        )}
        {view === 'task_detail' && !selectedTask && (
          <div className="text-center py-16 text-ink-muted text-sm">
            从左栏选一条任务
          </div>
        )}
      </div>

      {/* 右栏:部署面板 — 下载 zip(Phase 2)/ 推送租户(Phase 3) */}
      <div className="w-[280px] flex-shrink-0 border-l border-line bg-slate-50/40 flex flex-col">
        <div className="px-3 py-2 border-b border-line">
          <div className="text-xs font-semibold text-ink">部署到客户租户</div>
        </div>
        <div className="flex-1 p-3 text-xs text-ink-secondary space-y-2 leading-relaxed overflow-auto">
          <div className="rounded border border-line bg-white p-2.5 space-y-2">
            <div className="font-medium text-ink flex items-center gap-1">
              <FileCode2 size={11} className="text-orange-600" />
              tenant-config zip
            </div>
            <div className="text-[11px] text-ink-muted">
              {configuredCount > 0
                ? `已生成 ${configuredCount} / ${tasks.length} 条 task 的配置 xml,可打包下载。`
                : '尚无任务生成配置 xml。在左栏选 task → 中栏「生成配置」开始。'}
            </div>
            {planBundle && configuredCount > 0 && (
              <a
                href={tenantConfigZipUrl(planBundle.id)}
                download
                className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] rounded bg-orange-600 text-white hover:bg-orange-700"
              >
                <Download size={11} /> 下载 tenant-config.zip
              </a>
            )}
            <div className="text-[10px] text-ink-muted">
              本地解压后:<br />
              <code className="text-[10px] bg-slate-100 px-1 rounded">
                cd tenant-config && sharedev object-dev push --all
              </code>
            </div>
          </div>

          <div className="rounded border border-line bg-white p-2.5">
            <div className="font-medium text-ink mb-1">直接推送到租户</div>
            <div className="text-[11px] text-ink-muted">
              Phase 3 上线 — Node sidecar 跑 sharedev CLI 直接 push,
              先用 zip 下载 + 本地推送闭环。
            </div>
          </div>

          <div className="rounded border border-line bg-white p-2.5">
            <div className="font-medium text-ink mb-1">已支持生成配置的 skill</div>
            <ul className="text-[11px] space-y-0.5">
              {Array.from(SKILLS_AVAILABLE).map(s => (
                <li key={s}>· {SKILL_LABEL[s] || s}</li>
              ))}
            </ul>
            <div className="text-[10px] text-ink-muted mt-1.5">
              APL / PWC(12 个 skill)Phase 3 上线
            </div>
          </div>
        </div>
      </div>
      </div>{/* /flex-1 min-h-0 flex */}
    </div>
  )
}

// ── 任务清单概览(读 / 编辑 双态) ──────────────────────────────────────────
// 拆出独立子组件,让 editing → 独立 fiber tree,避免 React #310 hook 顺序异常。

function PlanOverviewView({
  bundle, onRefetch,
}: {
  bundle: CuratedBundle
  onRefetch: () => Promise<unknown> | unknown
}) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <PlanOverviewEditor
        bundle={bundle}
        onDone={() => { setEditing(false); void onRefetch() }}
      />
    )
  }
  return (
    <div className="flex-1 min-h-0 overflow-auto p-6 max-w-[1200px] mx-auto w-full relative">
      <div className="absolute top-3 right-3 z-10">
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-md border border-line bg-white text-ink-secondary hover:bg-orange-50 hover:text-orange-700 hover:border-orange-200 shadow-sm"
          title="在线编辑任务清单 markdown(保存后覆盖)"
        >
          <Pencil size={11} /> 编辑
        </button>
      </div>
      <MarkdownView content={bundle.content_md || ''} />
    </div>
  )
}

function PlanOverviewEditor({
  bundle, onDone,
}: {
  bundle: CuratedBundle
  onDone: () => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['output', bundle.id],
    queryFn: () => getOutput(bundle.id),
    enabled: !bundle.content_md,
    initialData: bundle.content_md ? bundle as any : undefined,
  })
  if (isLoading || !data?.content_md) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-ink-muted">
        <Loader2 size={14} className="inline animate-spin mr-1" /> 加载报告内容…
      </div>
    )
  }
  return (
    <MarkdownEditor
      bundle={bundle}
      initialContent={data.content_md}
      onClose={onDone}
      onSaved={onDone}
    />
  )
}

// ── HandoffBanner(2026-06-05) ───────────────────────────────────────────────
// 引导顾问到 APL 工作台:一键打包 SOW + 蓝图 + 字段表 + 流程表,然后跳外部平台。
// compact=true 时是顶部窄条;否则是大卡片。

const HANDOFF_PLATFORM_URL = 'http://58.87.103.20/v2/'

function HandoffBanner({ projectId, compact = false }: { projectId: string; compact?: boolean }) {
  const [downloading, setDownloading] = useState(false)
  const downloadHandoff = async () => {
    if (downloading) return
    setDownloading(true)
    try {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY) || ''
      const res = await fetch(projectHandoffBundleUrl(projectId), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        let msg = `下载失败(HTTP ${res.status})`
        try { const j = await res.json(); msg = j.detail || msg } catch {}
        alert(msg)
        return
      }
      const disposition = res.headers.get('content-disposition') || ''
      const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
      const asciiMatch = disposition.match(/filename="([^"]+)"/)
      const filename = decodeURIComponent(
        utf8Match ? utf8Match[1] : (asciiMatch ? asciiMatch[1] : '实施交接包.zip')
      )
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e: any) {
      alert(e?.message || '下载失败')
    } finally {
      setDownloading(false)
    }
  }

  if (compact) {
    return (
      <div className="flex-shrink-0 flex items-center gap-3 px-3 py-2 bg-gradient-to-r from-orange-50 to-amber-50 border-b border-orange-200/60 text-[12px]">
        <Package size={14} className="text-orange-600 flex-shrink-0" />
        <span className="text-ink truncate">
          建议在 APL 工作台完成后续工作:打包本项目的 SOW + 蓝图 + 字段表 + 流程表,带去平台
        </span>
        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={downloadHandoff}
            disabled={downloading}
            className="inline-flex items-center gap-1 px-3 py-1 text-[11px] rounded bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {downloading ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
            {downloading ? '打包中…' : '下载交接包'}
          </button>
          <a
            href={HANDOFF_PLATFORM_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1 text-[11px] rounded border border-orange-300 text-orange-700 bg-white hover:bg-orange-50"
          >
            <ExternalLink size={11} /> 前往 APL 工作台
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="px-6 pt-6">
      <div className="rounded-lg border border-orange-300 bg-gradient-to-r from-orange-50 to-amber-50 p-4">
        <div className="flex items-start gap-3">
          <Package size={20} className="text-orange-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold text-ink mb-1">在 APL 工作台完成需求分析与部署</div>
            <div className="text-sm text-ink-secondary leading-relaxed mb-3">
              项目实施阶段建议在 APL 工作台上完成。一键打包本项目的:
              <strong className="text-ink">SOW 需求说明书</strong>、
              <strong className="text-ink">蓝图方案设计</strong>、
              <strong className="text-ink">对象字段表</strong>、
              <strong className="text-ink">流程建设表</strong>
              ,然后登录 APL 工作台上传 zip,继续后续工作。
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={downloadHandoff}
                disabled={downloading}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                {downloading ? '打包中…' : '一键下载交接包(zip)'}
              </button>
              <a
                href={HANDOFF_PLATFORM_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded border border-orange-300 text-orange-700 bg-white hover:bg-orange-50"
              >
                <ExternalLink size={14} /> 前往 APL 工作台
              </a>
              <span className="text-[11px] text-ink-muted">
                平台地址:<code className="bg-white border border-orange-200 px-1.5 py-0.5 rounded text-[10px]">{HANDOFF_PLATFORM_URL}</code>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// PreparationView 已下线(2026-06-05):本阶段引导用户去 APL 工作台,不再在系统内生成
// 「实施任务清单」。如需恢复,git log 找回。

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
                <div className="text-ink truncate flex items-center gap-1">
                  {t.task_id}
                  {t.config?.ok && <CheckCircle2 size={9} className="text-emerald-600 shrink-0" />}
                  {t.config && !t.config.ok && <AlertTriangle size={9} className="text-red-500 shrink-0" />}
                </div>
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

function TaskDetailPanel({
  task, bundleId, onRefetch,
}: {
  task: ImplementationTask
  bundleId?: string
  onRefetch: () => Promise<unknown> | unknown
}) {
  const available = SKILLS_AVAILABLE.has(task.sharedev_skill)
  const config = task.config

  const genMut = useMutation({
    mutationFn: () => {
      if (!bundleId) throw new Error('bundle id 缺失')
      return generateTaskConfig(bundleId, task.task_id)
    },
    onSuccess: async () => { await onRefetch() },
  })

  return (
    <div className="flex-1 overflow-auto p-6 max-w-[1000px] mx-auto w-full space-y-4">
      {/* Task 信息 */}
      <div className="rounded-lg border border-line bg-white p-4 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
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
          {config?.ok && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full ring-1 ring-emerald-200">
              <CheckCircle2 size={9} /> 已生成配置
            </span>
          )}
          {config && !config.ok && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-red-700 bg-red-50 px-1.5 py-0.5 rounded-full ring-1 ring-red-200">
              <AlertTriangle size={9} /> 生成失败
            </span>
          )}
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

      {/* 生成配置 */}
      <div className="rounded-lg border border-line bg-white p-4 space-y-3">
        <div className="text-sm font-semibold text-ink flex items-center gap-1">
          <Sparkles size={13} className="text-orange-600" />
          生成配置文件
        </div>
        {!available ? (
          <div className="text-xs text-ink-muted">
            本 skill(<code className="text-[11px] bg-slate-100 px-1 rounded">{task.sharedev_skill}</code>) 在 Phase 3 接入,
            当前可手动用 sharedev CLI 完成对应配置。
          </div>
        ) : (
          <>
            <div className="text-xs text-ink-secondary">
              用 <code className="text-[11px] bg-slate-100 px-1 rounded">{task.sharedev_skill}</code> skill 的 SKILL.md + assets 模板,
              结合本项目调研报告 / 蓝图设计,LLM 一次产出 xml 文件。
            </div>
            <button
              onClick={() => genMut.mutate()}
              disabled={genMut.isPending || !bundleId}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 disabled:opacity-50"
            >
              {genMut.isPending
                ? <Loader2 size={12} className="animate-spin" />
                : <Sparkles size={12} />}
              {genMut.isPending ? '生成中…(约 30-60 秒)' : config?.ok ? '重新生成' : '生成配置'}
            </button>
            {genMut.isError && (
              <div className="text-xs text-red-600">
                生成失败:{(genMut.error as any)?.response?.data?.detail || (genMut.error as any)?.message}
              </div>
            )}
            {config && (
              <ConfigPreview config={config} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ConfigPreview({ config }: { config: NonNullable<ImplementationTask['config']> }) {
  const [showXml, setShowXml] = useState(false)
  if (!config.ok) {
    return (
      <div className="rounded border border-red-200 bg-red-50/50 p-2.5 space-y-1">
        <div className="text-[11px] font-medium text-red-700">生成失败</div>
        <div className="text-[10.5px] text-red-700/80">{config.error || '未知错误'}</div>
      </div>
    )
  }
  return (
    <div className="rounded border border-emerald-200 bg-emerald-50/40 p-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px]">
        <CheckCircle2 size={11} className="text-emerald-600 shrink-0" />
        <span className="text-emerald-800 font-medium">已生成</span>
        {config.generated_at && (
          <span className="text-[10px] text-ink-muted">· {new Date(config.generated_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
        )}
        {config.generated_by && (
          <span className="text-[10px] text-ink-muted">· by {config.generated_by}</span>
        )}
      </div>
      <div className="text-[11px] text-ink-secondary font-mono break-all">
        {config.file_path}
      </div>
      <button
        onClick={() => setShowXml(v => !v)}
        className="text-[11px] text-orange-700 hover:underline inline-flex items-center gap-0.5"
      >
        <FileCode2 size={10} />
        {showXml ? '收起 xml' : '查看 xml 内容'}
      </button>
      {showXml && config.file_content && (
        <pre className="text-[10.5px] bg-white border border-emerald-100 rounded p-2 overflow-auto max-h-[400px] font-mono leading-relaxed whitespace-pre-wrap">
          {config.file_content}
        </pre>
      )}
    </div>
  )
}
