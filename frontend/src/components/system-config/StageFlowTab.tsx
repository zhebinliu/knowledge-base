/**
 * StageFlowTab — 项目阶段流程动态配置编辑器
 *
 * 功能:
 *  - 显示当前 stages 列表(按顺序)
 *  - 上下箭头调顺序
 *  - 启用/禁用开关
 *  - 内联编辑名称
 *  - 下拉选 kind / icon
 *  - 内测标记开关
 *  - 子产物(sub_kinds)展开编辑
 *  - 新增 / 删除阶段
 *  - 重置为默认
 *  - 保存(全量 PUT,带校验)
 */
import { useEffect, useState, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Loader2, Plus, Trash2, ChevronUp, ChevronDown, Save, RotateCcw,
  AlertCircle, CheckCircle2, ChevronRight,
  // —— 图标选择器要用的 ——
  FileText, Lightbulb, ClipboardList, Bot, Sparkles, Search,
  Settings, Box, MessageSquare, Target, Calendar, Package, Users,
} from 'lucide-react'
import {
  getStageFlow, putStageFlow, resetStageFlow, getStageFlowMeta,
  type StageDef, type StageSubKindDef,
} from '../../api/client'

// ── 图标名 → 组件 + 中文显示名 ────────────────────────────────────────────────
// 跟后端 stage_flow.ALLOWED_ICONS 对齐
const ICON_REGISTRY: Record<string, { Comp: typeof FileText; label: string }> = {
  FileText:      { Comp: FileText,      label: '文件' },
  Lightbulb:     { Comp: Lightbulb,     label: '灯泡' },
  ClipboardList: { Comp: ClipboardList, label: '清单' },
  Bot:           { Comp: Bot,           label: '机器人' },
  Sparkles:      { Comp: Sparkles,      label: '闪光' },
  Search:        { Comp: Search,        label: '搜索' },
  Settings:      { Comp: Settings,      label: '齿轮' },
  Box:           { Comp: Box,           label: '盒子' },
  MessageSquare: { Comp: MessageSquare, label: '消息' },
  Target:        { Comp: Target,        label: '靶心' },
  Calendar:      { Comp: Calendar,      label: '日历' },
  Package:       { Comp: Package,       label: '包裹' },
  Users:         { Comp: Users,         label: '用户' },
  CheckCircle2:  { Comp: CheckCircle2,  label: '对勾' },
}

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

export default function StageFlowTab() {
  const qc = useQueryClient()
  const { data: serverData, isLoading } = useQuery({
    queryKey: ['stage-flow-admin'], queryFn: getStageFlow,
  })
  const { data: meta } = useQuery({
    queryKey: ['stage-flow-meta'], queryFn: getStageFlowMeta,
  })

  // 工作副本(本地编辑,Save 时一次性 PUT)
  const [working, setWorking] = useState<StageDef[] | null>(null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    if (serverData && working === null) {
      setWorking(structuredClone(serverData.stages))
    }
  }, [serverData, working])

  const dirty = useMemo(() => {
    if (!working || !serverData) return false
    return JSON.stringify(working) !== JSON.stringify(serverData.stages)
  }, [working, serverData])

  const saveMut = useMutation({
    mutationFn: (stages: StageDef[]) => putStageFlow(stages),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['stage-flow-admin'] })
      await qc.invalidateQueries({ queryKey: ['stage-flow'] })  // 让前台 ConsoleProjectDetail 刷新
      setError(null)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
    },
    onError: (e: any) => setError(e?.response?.data?.detail || e?.message || '保存失败'),
  })

  const resetMut = useMutation({
    mutationFn: resetStageFlow,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['stage-flow-admin'] })
      await qc.invalidateQueries({ queryKey: ['stage-flow'] })
      setWorking(null)  // 触发 useEffect 重新拷贝
      setError(null)
    },
  })

  if (isLoading || !working) {
    return (
      <div className="p-8 text-center text-gray-500 text-sm">
        <Loader2 size={20} className="inline animate-spin mr-2" />加载中…
      </div>
    )
  }

  const updateStage = (idx: number, patch: Partial<StageDef>) => {
    const next = [...working]
    next[idx] = { ...next[idx], ...patch }
    setWorking(next)
  }

  const moveStage = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= working.length) return
    const next = [...working]
    ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
    setWorking(next)
  }

  const removeStage = (idx: number) => {
    if (working.length <= 1) {
      setError('至少保留 1 个阶段')
      return
    }
    if (!confirm(`删除阶段「${working[idx].label}」?`)) return
    setWorking(working.filter((_, i) => i !== idx))
  }

  const addStage = () => {
    const newKey = `stage_${Date.now().toString(36)}`
    setWorking([
      ...working,
      {
        key: newKey,
        label: '新阶段',
        kind: null,
        icon: 'FileText',
        active: false,
        beta: false,
        sub_kinds: [],
      },
    ])
    setExpandedKey(newKey)
  }

  const validate = (stages: StageDef[]): string | null => {
    const keys = new Set<string>()
    for (const s of stages) {
      if (!s.key.trim()) return `阶段「${s.label}」缺少 key`
      if (keys.has(s.key)) return `重复的 key: ${s.key}`
      keys.add(s.key)
      if (!s.label.trim()) return `阶段 ${s.key} 缺少显示名`
      if (s.active && !s.kind && (!s.sub_kinds || s.sub_kinds.length === 0)) {
        return `已启用的阶段「${s.label}」必须配置产物或子产物`
      }
      for (const sk of s.sub_kinds) {
        if (!sk.kind || !sk.label.trim()) return `阶段「${s.label}」子产物配置不完整`
      }
    }
    return null
  }

  const onSave = () => {
    const v = validate(working)
    if (v) { setError(v); return }
    setError(null)
    saveMut.mutate(working)
  }

  const onReset = () => {
    if (!confirm('确定重置为系统默认?会丢失所有自定义配置。')) return
    resetMut.mutate()
  }

  return (
    <div>
      {/* 顶部状态条 */}
      <div className="flex items-center gap-3 mb-4 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs">
        <span className="text-gray-500">当前状态:</span>
        {serverData?.is_default ? (
          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">默认配置(未自定义)</span>
        ) : (
          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">已自定义</span>
        )}
        <span className="text-gray-400">|</span>
        <span className="text-gray-600">{working.length} 个阶段({working.filter(s => s.active).length} 启用)</span>
        {dirty && (
          <span className="ml-auto text-amber-700 flex items-center gap-1">
            <AlertCircle size={12} />未保存的修改
          </span>
        )}
        {savedFlash && !dirty && (
          <span className="ml-auto text-emerald-700 flex items-center gap-1">
            <CheckCircle2 size={12} />已保存,前台已生效
          </span>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 flex items-center gap-1.5">
          <AlertCircle size={12} /> {error}
        </div>
      )}

      {/* 表头 */}
      <div className="grid grid-cols-[40px_50px_60px_1fr_140px_120px_60px_140px_50px] gap-2 px-3 py-2 text-[11px] font-semibold text-gray-500 border-b border-gray-200">
        <div>顺序</div>
        <div>启用</div>
        <div>序号</div>
        <div>显示名称</div>
        <div>产物类型</div>
        <div>图标</div>
        <div>内测</div>
        <div>子产物</div>
        <div></div>
      </div>

      {/* 阶段行 */}
      <div className="divide-y divide-gray-100">
        {working.map((s, i) => {
          const expanded = expandedKey === s.key
          const subKindCount = s.sub_kinds?.length ?? 0
          return (
            <div key={s.key}>
              <div className="grid grid-cols-[40px_50px_60px_1fr_140px_120px_60px_140px_50px] gap-2 px-3 py-2.5 items-center hover:bg-gray-50">
                {/* 顺序按钮 */}
                <div className="flex flex-col gap-0">
                  <button
                    onClick={() => moveStage(i, -1)}
                    disabled={i === 0}
                    className="p-0.5 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30"
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button
                    onClick={() => moveStage(i, 1)}
                    disabled={i === working.length - 1}
                    className="p-0.5 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30"
                  >
                    <ChevronDown size={12} />
                  </button>
                </div>
                {/* 启用 */}
                <div>
                  <Toggle checked={s.active} onChange={v => updateStage(i, { active: v })} />
                </div>
                {/* 序号 */}
                <div className="text-xs text-gray-400 tabular-nums">{i + 1}</div>
                {/* 名称 */}
                <input
                  value={s.label}
                  onChange={e => updateStage(i, { label: e.target.value })}
                  className="px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:border-orange-400"
                />
                {/* 产物 kind */}
                <select
                  value={s.kind || ''}
                  onChange={e => updateStage(i, { kind: e.target.value || null })}
                  className="px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-orange-400"
                  disabled={subKindCount > 0}
                  title={subKindCount > 0 ? '已配置子产物,kind 不生效' : ''}
                >
                  <option value="">— 无 / 占位 —</option>
                  {meta?.kinds.map(k => (
                    <option key={k} value={k}>{meta.kind_titles[k] || k}</option>
                  ))}
                </select>
                {/* 图标 — 弹出网格选择器(可视化) */}
                <IconPicker
                  value={s.icon}
                  options={meta?.icons || []}
                  onChange={ic => updateStage(i, { icon: ic })}
                />
                {/* 内测 */}
                <div>
                  <Toggle checked={s.beta} onChange={v => updateStage(i, { beta: v })} />
                </div>
                {/* 子产物 */}
                <button
                  onClick={() => setExpandedKey(expanded ? null : s.key)}
                  className={`text-xs px-2 py-1 rounded border ${
                    subKindCount > 0
                      ? 'border-orange-300 bg-orange-50 text-[#D96400]'
                      : 'border-gray-200 text-gray-500'
                  } hover:border-orange-400`}
                >
                  <ChevronRight size={11} className={`inline mr-0.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                  {subKindCount > 0 ? `${subKindCount} 个` : '无'}
                </button>
                {/* 删除 */}
                <button
                  onClick={() => removeStage(i)}
                  className="text-gray-400 hover:text-red-600"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {/* 展开:子产物编辑 */}
              {expanded && (
                <SubKindsEditor
                  subKinds={s.sub_kinds}
                  availableKinds={meta?.kinds || []}
                  kindTitles={meta?.kind_titles || {}}
                  onChange={sks => updateStage(i, { sub_kinds: sks })}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* 新增 */}
      <button
        onClick={addStage}
        className="mt-3 w-full px-3 py-2 text-sm text-gray-500 border border-dashed border-gray-300 rounded-md hover:border-orange-400 hover:text-[#D96400]"
      >
        <Plus size={14} className="inline mr-1" /> 新增阶段
      </button>

      {/* 底部操作栏 */}
      <div className="mt-6 pt-4 border-t border-gray-200 flex items-center gap-3">
        <button
          onClick={onReset}
          disabled={resetMut.isPending}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          <RotateCcw size={13} /> 重置为默认
        </button>
        <span className="ml-auto text-[11px] text-gray-500">
          保存后前台「项目阶段栏」立即生效(需刷新已打开的项目页)
        </span>
        <button
          onClick={onSave}
          disabled={!dirty || saveMut.isPending}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded shadow-sm disabled:opacity-50"
          style={{ background: BRAND_GRAD }}
        >
          {saveMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {saveMut.isPending ? '保存中…' : '保存'}
        </button>
      </div>

      {/* 帮助提示 */}
      <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded text-[11px] text-blue-900 leading-relaxed">
        <strong>提示:</strong>
        <ul className="list-disc list-inside mt-1 space-y-0.5">
          <li>「启用」开关关闭后,前台阶段栏仍显示但显示为锁定(灰色不可点)</li>
          <li>「子产物」用于"一个阶段下两个并列产物"场景(如「需求调研」下的大纲+问卷),配了子产物后主 kind 不生效</li>
          <li>「内测」标记仅影响图标(目前用 Bot 图标),后续可加 (β) 角标</li>
          <li>新增阶段的 kind 可选「无 / 占位」用于"未来阶段"占位(用户能看到但点不开)</li>
        </ul>
      </div>
    </div>
  )
}

// ── 小组件 ────────────────────────────────────────────────────────────────────

function IconPicker({
  value, options, onChange,
}: {
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // 点外面关闭
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const current = ICON_REGISTRY[value]
  const CurrentIcon = current?.Comp || FileText
  const currentLabel = current?.label || value

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-xs border border-gray-200 rounded hover:border-orange-400 focus:outline-none focus:border-orange-400 bg-white"
      >
        <CurrentIcon size={13} className="text-gray-700 shrink-0" />
        <span className="truncate text-gray-700">{currentLabel}</span>
        <ChevronDown size={11} className="ml-auto text-gray-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 p-2 bg-white border border-gray-200 rounded-lg shadow-lg w-[260px]">
          <div className="text-[10px] text-gray-400 mb-1.5 px-1">选个图标(共 {options.length} 个)</div>
          <div className="grid grid-cols-4 gap-1">
            {options.map(name => {
              const reg = ICON_REGISTRY[name]
              if (!reg) return null
              const { Comp, label } = reg
              const selected = name === value
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => { onChange(name); setOpen(false) }}
                  className={`flex flex-col items-center justify-center py-2 rounded hover:bg-orange-50 ${
                    selected ? 'bg-orange-100 ring-1 ring-orange-400' : ''
                  }`}
                  title={`${label}(${name})`}
                >
                  <Comp size={18} className={selected ? 'text-[#D96400]' : 'text-gray-700'} />
                  <span className={`text-[10px] mt-0.5 ${selected ? 'text-[#D96400] font-medium' : 'text-gray-500'}`}>
                    {label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  // 用 inline style 确定位置 — 避免 Tailwind JIT 漏抓动态 translate-x-* class
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-block rounded-full transition-colors ${checked ? 'bg-orange-500' : 'bg-gray-300'}`}
      style={{ width: 36, height: 20, flexShrink: 0 }}
      aria-pressed={checked}
    >
      <span
        className="absolute bg-white rounded-full shadow-sm transition-all"
        style={{
          width: 16, height: 16, top: 2,
          left: checked ? 18 : 2,
        }}
      />
    </button>
  )
}

function SubKindsEditor({
  subKinds, availableKinds, kindTitles, onChange,
}: {
  subKinds: StageSubKindDef[]
  availableKinds: string[]
  kindTitles: Record<string, string>
  onChange: (sks: StageSubKindDef[]) => void
}) {
  const update = (idx: number, patch: Partial<StageSubKindDef>) => {
    const next = [...subKinds]
    next[idx] = { ...next[idx], ...patch }
    onChange(next)
  }
  const remove = (idx: number) => onChange(subKinds.filter((_, i) => i !== idx))
  const add = () => onChange([...subKinds, { kind: availableKinds[0] || '', label: '新子产物' }])

  return (
    <div className="ml-[140px] mr-12 mb-3 mt-1 p-3 bg-orange-50/30 border border-orange-200 rounded">
      <div className="text-[11px] text-gray-500 mb-2 font-medium">子产物列表(配置后,本阶段的「主 kind」不生效)</div>
      {subKinds.length === 0 && (
        <div className="text-xs text-gray-400 italic mb-2">暂无子产物 — 点下方新增</div>
      )}
      <div className="space-y-2">
        {subKinds.map((sk, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={sk.label}
              onChange={e => update(i, { label: e.target.value })}
              placeholder="按钮显示名(如:调研大纲)"
              className="px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-orange-400 w-40"
            />
            <select
              value={sk.kind}
              onChange={e => update(i, { kind: e.target.value })}
              className="px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-orange-400 flex-1"
            >
              {availableKinds.map(k => (
                <option key={k} value={k}>{kindTitles[k] || k}</option>
              ))}
            </select>
            <button onClick={() => remove(i)} className="text-gray-400 hover:text-red-600">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={add}
        className="mt-2 text-[11px] text-orange-600 hover:text-orange-800"
      >
        <Plus size={11} className="inline" /> 新增子产物
      </button>
    </div>
  )
}
