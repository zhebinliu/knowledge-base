import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getRoutingRules, updateRoutingRule,
  getTaskParams, updateTaskParams as updateTaskParamsApi,
  getModels,
  type RoutingRule, type TaskParamsEntry,
} from '../../api/client'
import { Save, Loader, ChevronDown, ChevronRight, HelpCircle } from 'lucide-react'

// 2026-05-28:细粒度 routing task 拆分。组结构 + 中文标签同步 ROUTING_RULES。
// 组顺序就是 UI 渲染顺序;组内 task 顺序就是行渲染顺序。
// label 用纯中文,desc 用一句话说明 "这一步在做什么、什么时候会触发"。
type GroupDef = {
  key: string
  label: string
  desc: string
  defaultOpen: boolean
  tasks: { task: string; label: string; hint?: string }[]
}

const TASK_GROUPS: GroupDef[] = [
  {
    key: 'meeting',
    label: '会议处理',
    desc: '上传录音 / 输入文本之后的整个会议加工流水线',
    defaultOpen: false,
    tasks: [
      { task: 'meeting_transcript_polish',     label: '会议转写润色',         hint: '把语音识别出来的口语化文字整理成规整段落(长稿自动分块并行)' },
      { task: 'meeting_live_advice',           label: '现场调研实时副驾',     hint: '会议进行中根据转写流持续输出 4-5 类建议(澄清/歧义/遗漏/行业/共识)' },
      { task: 'meeting_minutes_extract',       label: '会议纪要生成',         hint: '从转写抽出摘要 / 议题 / 决议 / 待办,结构化输出' },
      { task: 'meeting_requirements_extract',  label: '会议需求提取',         hint: '识别本次会议提出的需求条目(P0-P3 + 模块)' },
      { task: 'meeting_process_flows_extract', label: '会议业务流程提取',     hint: '从纪要识别 As-Is / To-Be 流程,生成 mermaid 流程图' },
      { task: 'meeting_stakeholders_extract',  label: '会议干系人识别',       hint: '从会议内容中识别人物 / 角色 / 组织关系' },
      { task: 'meeting_illustrations_extract', label: '会议解释图生成',       hint: '从纪要提取关键概念,生成 mermaid 解释图(架构 / 关系 / 时序)' },
      { task: 'meeting_qa_answer',             label: '会议内容问答',         hint: '用户在会议详情页里向 AI 提问,基于本次会议作答' },
      { task: 'meeting_template_evolve',       label: '会议纪要模板演化',     hint: '基于历史编辑过的纪要,优化纪要模板偏好' },
    ],
  },
  {
    key: 'document',
    label: '文档处理',
    desc: '文档上传到入库的整个加工流水线',
    defaultOpen: false,
    tasks: [
      { task: 'doc_markdown_convert',        label: '文档转写为正文格式',     hint: '把原始文本 / Word / PDF 转写成统一的 markdown' },
      { task: 'doc_markdown_refine',         label: '文档转写后复核润色',     hint: '对比原文找漏抽 / 错位 / 格式问题,再走一遍校对' },
      { task: 'doc_section_slice',           label: '文档切片分类',           hint: '把文档切成段落,给每段打 LTC 阶段 / 行业 / 模块标签' },
      { task: 'doc_section_review_lowconf',  label: '文档切片复审(低置信)',   hint: '首次分类置信度不够时,自动再过一遍以提高准确率' },
      { task: 'doc_summary_faq',             label: '文档摘要与常见问题',     hint: '为每份文档生成一段摘要 + 3-5 条常见问题' },
      { task: 'doc_type_classify',           label: '文档类型自动识别',       hint: '判断文档是 SOW / 方案 / 合同 / 会议纪要等' },
      { task: 'doc_amount_extraction',       label: '文档金额识别(用于脱敏)', hint: '识别文中的金额,加密后入库防泄露' },
      { task: 'pdf_ocr',                     label: '扫描件 / 图像 OCR',     hint: '没有文字层的 PDF 直接调多模态模型逐页转写' },
    ],
  },
  {
    key: 'kb',
    label: '知识库问答',
    desc: '用户在 console 跟知识库交互的所有问答场景',
    defaultOpen: false,
    tasks: [
      { task: 'kb_qa_answer',         label: '知识库问答',                hint: '完整回答返回,适合后台 / API 调用' },
      { task: 'kb_qa_answer_stream',  label: '知识库问答(打字机流式)',     hint: '前端边生成边显示,首字延迟更敏感' },
      { task: 'kb_doc_generate',      label: '基于知识库片段生成文档段落',  hint: '检索出相关 chunk 后,套模板写出文档片段' },
    ],
  },
  {
    key: 'output',
    label: '项目与输出',
    desc: '项目维度的资料生成 / 客户画像 / 报告生成',
    defaultOpen: false,
    tasks: [
      { task: 'project_audience_profile', label: '客户画像生成',           hint: '根据行业 / 客户名 / 已有资料,生成一段客户画像' },
      { task: 'output_doc_generate',      label: '输出中心通用文档生成',    hint: '洞察 / 调研问卷 / 方案 / 报告等长文档生成' },
      { task: 'kickoff_pptx_codegen',     label: '启动会 PPT 代码生成',     hint: '基于项目资料生成可直接执行的 python-pptx 代码 → PPT' },
      { task: 'revision_learning',        label: '产物编辑学习',           hint: '用户编辑过的产物里抽规律,沉淀偏好喂回下次生成' },
    ],
  },
  {
    key: 'challenge',
    label: '挑战练习',
    desc: '基于知识库出题考顾问 / 答题判分的训练系统',
    defaultOpen: false,
    tasks: [
      { task: 'challenge_question_kb',       label: '基于知识库出题',     hint: '从知识库切片里挑材料,生成考题' },
      { task: 'challenge_question_freeform', label: '自由命题出题',       hint: '不基于知识库,凭模型自己构造业务场景题' },
      { task: 'challenge_answer_judge',      label: '答题判分',           hint: '对比参考答案给学员的作答打分' },
      { task: 'challenge_verdict_reformat',  label: '判分结果格式修复',   hint: '上一步判分输出格式有问题时,重新整理成规范结构' },
    ],
  },
]

// task → 中文 label 平面索引(回显用)
const TASK_LABEL_MAP: Record<string, string> = (() => {
  const m: Record<string, string> = {}
  for (const g of TASK_GROUPS) for (const t of g.tasks) m[t.task] = t.label
  return m
})()

function taskLabel(key: string) {
  return TASK_LABEL_MAP[key] ?? key
}

const gradientStyle = { background: 'linear-gradient(135deg, #FF8D1A, #FF7A00)' }
const inputCls = 'border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white'


export default function RoutingTab() {
  const qc = useQueryClient()
  const { data: rules, isLoading: loadingRules } = useQuery({ queryKey: ['routing'], queryFn: getRoutingRules })
  const { data: params, isLoading: loadingParams } = useQuery({ queryKey: ['task-params'], queryFn: getTaskParams })
  const { data: models } = useQuery({ queryKey: ['models'], queryFn: getModels })

  const modelKeys = models?.map(m => m.key) ?? []

  // 把 rules/params 按 task → entry 索引,渲染时按 group 顺序取
  const ruleByTask = new Map((rules ?? []).map(r => [r.task, r]))
  const paramsByTask = new Map((params ?? []).map(p => [p.task, p]))

  // 未在分组里出现的 task(可能是 DB 残留 / 灰度新 task)单独显示在 "其他" 组
  const knownTaskSet = new Set<string>(TASK_GROUPS.flatMap(g => g.tasks.map(t => t.task)))
  const extraRules = (rules ?? []).filter(r => !knownTaskSet.has(r.task))
  const extraParams = (params ?? []).filter(p => !knownTaskSet.has(p.task))

  return (
    <div className="space-y-6">
      {/* Routing Rules */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">路由规则</h2>
          <p className="text-xs text-gray-400 mt-0.5">每个操作可独立配置主 / 备模型 — 改完无需重启,立刻生效</p>
        </div>
        {loadingRules ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader size={18} className="animate-spin mr-2" /> 加载中...
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {TASK_GROUPS.map(g => (
              <RoutingGroup
                key={g.key}
                group={g}
                ruleByTask={ruleByTask}
                modelKeys={modelKeys}
                qc={qc}
              />
            ))}
            {extraRules.length > 0 && (
              <RoutingGroup
                key="_other"
                group={{
                  key: '_other',
                  label: '其他(未分组)',
                  desc: '可能是数据库残留或代码未同步的 task',
                  defaultOpen: false,
                  tasks: extraRules.map(r => ({ task: r.task, label: r.task })),
                }}
                ruleByTask={ruleByTask}
                modelKeys={modelKeys}
                qc={qc}
              />
            )}
          </div>
        )}
      </div>

      {/* Task Params */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">任务参数</h2>
          <p className="text-xs text-gray-400 mt-0.5">每个操作的 max_tokens / temperature / timeout</p>
        </div>
        {loadingParams ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader size={18} className="animate-spin mr-2" /> 加载中...
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {TASK_GROUPS.map(g => (
              <TaskParamsGroup
                key={g.key}
                group={g}
                paramsByTask={paramsByTask}
                qc={qc}
              />
            ))}
            {extraParams.length > 0 && (
              <TaskParamsGroup
                key="_other"
                group={{
                  key: '_other',
                  label: '其他(未分组)',
                  desc: '',
                  defaultOpen: false,
                  tasks: extraParams.map(p => ({ task: p.task, label: p.task })),
                }}
                paramsByTask={paramsByTask}
                qc={qc}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}


/* ── Routing 组(可折叠) ───────────────────────────────────────────────── */

function RoutingGroup({
  group, ruleByTask, modelKeys, qc,
}: {
  group: GroupDef
  ruleByTask: Map<string, RoutingRule>
  modelKeys: string[]
  qc: ReturnType<typeof useQueryClient>
}) {
  const [open, setOpen] = useState(group.defaultOpen)
  const present = group.tasks.filter(t => ruleByTask.has(t.task))

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-6 py-3 flex items-center gap-2 hover:bg-gray-50 transition-colors text-left"
      >
        {open ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-400" />}
        <span className="font-medium text-sm text-gray-800">{group.label}</span>
        <span className="text-[10px] text-gray-400 ml-1">{present.length} 个</span>
        <span className="text-xs text-gray-400 ml-2">{group.desc}</span>
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-gray-100 text-left text-[10px] text-gray-500 uppercase tracking-wider bg-gray-50/50">
                <th className="pl-12 pr-4 py-2 font-medium">操作</th>
                <th className="px-4 py-2 font-medium">主模型</th>
                <th className="px-4 py-2 font-medium">备选模型</th>
                <th className="px-4 py-2 font-medium w-1 whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {group.tasks.map(t => {
                const r = ruleByTask.get(t.task)
                if (!r) {
                  return (
                    <tr key={t.task} className="text-xs text-gray-400">
                      <td className="pl-12 pr-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <span>{t.label}</span>
                          {t.hint && (
                            <span title={t.hint} className="cursor-help inline-flex">
                              <HelpCircle size={11} className="text-gray-300 hover:text-gray-500" />
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono">{t.task}</div>
                      </td>
                      <td colSpan={3} className="px-4 py-2 italic">未初始化(后端启动后自动建)</td>
                    </tr>
                  )
                }
                return <RoutingRow key={t.task} rule={r} label={t.label} hint={t.hint} modelKeys={modelKeys} qc={qc} />
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}


function RoutingRow({
  rule, label, hint, modelKeys, qc,
}: {
  rule: RoutingRule
  label: string
  hint?: string
  modelKeys: string[]
  qc: ReturnType<typeof useQueryClient>
}) {
  const [primary, setPrimary] = useState(rule.primary)
  const [fallback, setFallback] = useState(rule.fallback)
  const dirty = primary !== rule.primary || fallback !== rule.fallback

  const mut = useMutation({
    mutationFn: () => updateRoutingRule(rule.task, { primary, fallback }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routing'] }),
    onError: (e: any) => alert(`保存失败: ${e?.response?.data?.detail ?? e.message}`),
  })

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="pl-12 pr-4 py-2">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-sm text-gray-800">{label}</span>
          {hint && (
            <span title={hint} className="cursor-help shrink-0 inline-flex">
              <HelpCircle size={12} className="text-gray-300 hover:text-gray-500" />
            </span>
          )}
        </div>
        <div className="text-[10px] text-gray-400 font-mono mt-0.5" title="代码内部 task key">{rule.task}</div>
      </td>
      <td className="px-4 py-2">
        <select value={primary} onChange={e => setPrimary(e.target.value)} className={inputCls}>
          {modelKeys.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </td>
      <td className="px-4 py-2">
        <select value={fallback} onChange={e => setFallback(e.target.value)} className={inputCls}>
          {modelKeys.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </td>
      <td className="px-4 py-2">
        <button
          onClick={() => mut.mutate()}
          disabled={!dirty || mut.isPending}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-white text-xs rounded-lg disabled:opacity-40 transition-all whitespace-nowrap"
          style={gradientStyle}
        >
          <Save size={12} /> {mut.isPending ? '...' : '保存'}
        </button>
      </td>
    </tr>
  )
}


/* ── Task Params 组(可折叠) ─────────────────────────────────────────── */

function TaskParamsGroup({
  group, paramsByTask, qc,
}: {
  group: GroupDef
  paramsByTask: Map<string, TaskParamsEntry>
  qc: ReturnType<typeof useQueryClient>
}) {
  const [open, setOpen] = useState(group.defaultOpen)

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-6 py-3 flex items-center gap-2 hover:bg-gray-50 transition-colors text-left"
      >
        {open ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-400" />}
        <span className="font-medium text-sm text-gray-800">{group.label}</span>
        <span className="text-[10px] text-gray-400 ml-1">{group.tasks.length} 个</span>
        {group.desc && (
          <span title={group.desc} className="cursor-help inline-flex" onClick={e => e.stopPropagation()}>
            <HelpCircle size={12} className="text-gray-300 hover:text-gray-500" />
          </span>
        )}
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-gray-100 text-left text-[10px] text-gray-500 uppercase tracking-wider bg-gray-50/50">
                <th className="pl-12 pr-4 py-2 font-medium">操作</th>
                <th className="px-4 py-2 font-medium">最大 Token</th>
                <th className="px-4 py-2 font-medium">温度</th>
                <th className="px-4 py-2 font-medium">超时(秒)</th>
                <th className="px-4 py-2 font-medium w-1 whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {group.tasks.map(t => {
                const p = paramsByTask.get(t.task)
                if (!p) {
                  return (
                    <tr key={t.task} className="text-xs text-gray-400">
                      <td className="pl-12 pr-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <span>{t.label}</span>
                          {t.hint && (
                            <span title={t.hint} className="cursor-help inline-flex">
                              <HelpCircle size={11} className="text-gray-300 hover:text-gray-500" />
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono">{t.task}</div>
                      </td>
                      <td colSpan={4} className="px-4 py-2 italic">使用默认值</td>
                    </tr>
                  )
                }
                return <TaskParamsRow key={t.task} entry={p} label={t.label} hint={t.hint} qc={qc} />
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}


function TaskParamsRow({
  entry, label, hint, qc,
}: {
  entry: TaskParamsEntry
  label: string
  hint?: string
  qc: ReturnType<typeof useQueryClient>
}) {
  const [maxTokens, setMaxTokens] = useState(entry.max_tokens)
  const [temperature, setTemperature] = useState(entry.temperature)
  const [timeout, setTimeout_] = useState(entry.timeout)
  const dirty = maxTokens !== entry.max_tokens || temperature !== entry.temperature || timeout !== entry.timeout

  const mut = useMutation({
    mutationFn: () => updateTaskParamsApi(entry.task, { max_tokens: maxTokens, temperature, timeout }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-params'] }),
    onError: (e: any) => alert(`保存失败: ${e?.response?.data?.detail ?? e.message}`),
  })

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="pl-12 pr-4 py-2">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-sm text-gray-800">{label}</span>
          {hint && (
            <span title={hint} className="cursor-help shrink-0 inline-flex">
              <HelpCircle size={12} className="text-gray-300 hover:text-gray-500" />
            </span>
          )}
        </div>
        <div className="text-[10px] text-gray-400 font-mono mt-0.5" title="代码内部 task key">{entry.task}</div>
      </td>
      <td className="px-4 py-2">
        <input
          type="number" min={1} max={200000}
          value={maxTokens}
          onChange={e => setMaxTokens(Number(e.target.value))}
          className={`w-24 ${inputCls}`}
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="number" min={0} max={2} step={0.1}
          value={temperature}
          onChange={e => setTemperature(Number(e.target.value))}
          className={`w-20 ${inputCls}`}
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="number" min={1} max={600}
          value={timeout}
          onChange={e => setTimeout_(Number(e.target.value))}
          className={`w-20 ${inputCls}`}
        />
      </td>
      <td className="px-4 py-2 whitespace-nowrap">
        <button
          onClick={() => mut.mutate()}
          disabled={!dirty || mut.isPending}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-white text-xs rounded-lg disabled:opacity-40 transition-all whitespace-nowrap"
          style={gradientStyle}
        >
          <Save size={12} /> {mut.isPending ? '...' : '保存'}
        </button>
      </td>
    </tr>
  )
}
