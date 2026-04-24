import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, ClipboardList, Lightbulb, Clock, Sparkles, ArrowRight, Info, Download, RefreshCw, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { listProjects, generateOutput, listOutputs, type Project, type CuratedBundle } from '../../api/client'
import { TOKEN_STORAGE_KEY } from '../../api/client'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

interface OutputKind {
  id: 'kickoff_pptx' | 'survey' | 'insight'
  icon: typeof FileText
  title: string
  desc: string
  badge: string
  color: string
  iconColor: string
  preview: string[]
}

const KINDS: OutputKind[] = [
  {
    id: 'kickoff_pptx',
    icon: FileText,
    title: '启动会 PPT',
    desc: '基于项目基本信息和 LTC 9 阶段时间线，生成可直接开会用的启动会 PPT（.pptx）。',
    badge: '.pptx',
    color: 'from-orange-50 to-amber-50',
    iconColor: '#D96400',
    preview: ['封面 + 项目概况', 'LTC 9 阶段时间线', '关键里程碑与交付物', '项目风险与应对', '问答 & 下一步'],
  },
  {
    id: 'survey',
    icon: ClipboardList,
    title: '调研问卷',
    desc: '按 LTC 9 阶段从已批准切片中抽取高质量问题，按"业务流程 / 角色 / 数据 / 集成 / 风险"五类分组。',
    badge: '.md · .docx',
    color: 'from-sky-50 to-blue-50',
    iconColor: '#2563EB',
    preview: ['每阶段 5–10 题', '按 5 类主题分组', '可勾选/取消', '导出 Markdown + Word'],
  },
  {
    id: 'insight',
    icon: Lightbulb,
    title: '项目洞察报告',
    desc: '基于 PM 视角对项目多维度提问，LLM 汇总为结构化报告。',
    badge: '.md',
    color: 'from-purple-50 to-pink-50',
    iconColor: '#7C3AED',
    preview: ['项目概览', '关键决策点', '风险矩阵', '下一步建议'],
  },
]

const KIND_MAP = Object.fromEntries(KINDS.map(k => [k.id, k]))

function StatusBadge({ status }: { status: string }) {
  if (status === 'done') return <span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle size={12} />已完成</span>
  if (status === 'failed') return <span className="flex items-center gap-1 text-red-500 text-xs"><XCircle size={12} />失败</span>
  if (status === 'generating') return <span className="flex items-center gap-1 text-blue-500 text-xs"><Loader2 size={12} className="animate-spin" />生成中</span>
  return <span className="flex items-center gap-1 text-gray-400 text-xs"><Clock size={12} />排队中</span>
}

function fmt(dt: string) {
  return new Date(dt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function ConsoleOutputs() {
  const [selectedKind, setSelectedKind] = useState<OutputKind | null>(null)
  const [selectedProject, setSelectedProject] = useState<string>('')
  const qc = useQueryClient()

  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => listProjects() })
  const { data: outputs, refetch: refetchOutputs } = useQuery({
    queryKey: ['outputs'],
    queryFn: () => listOutputs({ page: 1 }),
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? []
      const hasActive = items.some((b: CuratedBundle) => b.status === 'pending' || b.status === 'generating')
      return hasActive ? 5000 : false
    },
  })

  const generateMutation = useMutation({
    mutationFn: (body: { kind: string; project_id: string }) => generateOutput(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['outputs'] })
    },
  })

  const handleGenerate = () => {
    if (!selectedKind || !selectedProject) return
    generateMutation.mutate({ kind: selectedKind.id, project_id: selectedProject })
  }

  const downloadBundle = (b: CuratedBundle) => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY)
    const a = document.createElement('a')
    a.href = `/api/outputs/${b.id}/download`
    // Pass token via URL isn't ideal; use fetch instead
    fetch(`/api/outputs/${b.id}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(async res => {
      if (!res.ok) { alert('下载失败'); return }
      const disposition = res.headers.get('content-disposition') || ''
      const match = disposition.match(/filename="([^"]+)"/)
      const filename = match ? match[1] : b.title
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a2 = document.createElement('a')
      a2.href = url
      a2.download = filename
      a2.click()
      URL.revokeObjectURL(url)
    })
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-medium mb-3">
          <Sparkles size={11} /> 输出中心
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-ink leading-tight mb-2">
          一键生成交付物
        </h1>
        <p className="text-sm text-ink-secondary max-w-xl">
          选择项目和交付物类型，系统会调用知识库里已审核的内容拼装成文档。生成是异步的——提交后可关闭页面，结果会出现在"我的输出"列表。
        </p>
      </div>

      {/* Kind cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {KINDS.map(k => {
          const active = selectedKind?.id === k.id
          return (
            <button
              key={k.id}
              type="button"
              onClick={() => setSelectedKind(k)}
              className={[
                'text-left rounded-2xl border p-5 transition-all bg-gradient-to-br',
                k.color,
                active ? 'border-[#FF8D1A] shadow-md ring-2 ring-[#FF8D1A]/30' : 'border-line hover:border-[#FF8D1A]/60 hover:shadow-sm',
              ].join(' ')}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                  <k.icon size={18} style={{ color: k.iconColor }} />
                </div>
                <span className="text-[10px] font-mono text-ink-muted bg-white px-1.5 py-0.5 rounded border border-line">
                  {k.badge}
                </span>
              </div>
              <p className="font-semibold text-ink mb-1">{k.title}</p>
              <p className="text-xs text-ink-secondary leading-relaxed">{k.desc}</p>
            </button>
          )
        })}
      </div>

      {/* Generation panel */}
      {selectedKind ? (
        <div className="rounded-2xl border border-line bg-white p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <selectedKind.icon size={18} style={{ color: selectedKind.iconColor }} />
            <h2 className="text-lg font-semibold text-ink">{selectedKind.title}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">包含内容</p>
              <ul className="space-y-1.5 text-sm text-ink-secondary">
                {selectedKind.preview.map(p => (
                  <li key={p} className="flex items-start gap-2">
                    <span className="w-1 h-1 rounded-full mt-2 flex-shrink-0" style={{ background: selectedKind.iconColor }} />
                    {p}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">选择项目</label>
              <select
                value={selectedProject}
                onChange={e => setSelectedProject(e.target.value)}
                className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="">-- 请选择 --</option>
                {(projects ?? []).map((p: Project) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.customer ? ` · ${p.customer}` : ''}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-ink-muted mt-2 flex items-start gap-1">
                <Info size={11} className="mt-0.5 flex-shrink-0" />
                生成的内容范围限定在该项目的文档与关联知识切片
              </p>
            </div>
          </div>

          {generateMutation.isSuccess && (
            <div className="mt-4 px-4 py-3 bg-green-50 border border-green-100 rounded-lg text-xs text-green-800 flex items-center gap-2">
              <CheckCircle size={13} className="text-green-600 shrink-0" />
              已提交生成任务，请在下方"我的输出"列表查看进度
            </div>
          )}
          {generateMutation.isError && (
            <div className="mt-4 px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700">
              提交失败，请稍后重试
            </div>
          )}

          <div className="mt-5 pt-5 border-t border-line flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-1.5 text-xs text-ink-muted">
              <Clock size={12} /> 生成用时预计 1–3 分钟
            </div>
            <button
              type="button"
              disabled={!selectedProject || generateMutation.isPending}
              onClick={handleGenerate}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: BRAND_GRAD }}
            >
              {generateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={13} />}
              {generateMutation.isPending ? '提交中…' : `生成 ${selectedKind.title}`}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center text-ink-muted text-sm mb-8">
          请先从上方选择一种交付物类型
        </div>
      )}

      {/* My outputs list */}
      <div className="rounded-2xl border border-line bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-ink">我的输出</h2>
          <button onClick={() => refetchOutputs()} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <RefreshCw size={13} />
          </button>
        </div>

        {!outputs || outputs.items.length === 0 ? (
          <p className="text-xs text-ink-muted text-center py-8">还没有生成记录，选择上方的交付物类型开始生成</p>
        ) : (
          <div className="space-y-2">
            {outputs.items.map((b: CuratedBundle) => {
              const kindInfo = KIND_MAP[b.kind as keyof typeof KIND_MAP]
              return (
                <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl border border-line hover:bg-gray-50 transition-colors">
                  {kindInfo && (
                    <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                      <kindInfo.icon size={15} style={{ color: kindInfo.iconColor }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{b.title}</p>
                    <p className="text-xs text-ink-muted">{fmt(b.created_at)}</p>
                  </div>
                  <StatusBadge status={b.status} />
                  {b.status === 'done' && (b.has_file || b.has_content) && (
                    <button
                      onClick={() => downloadBundle(b)}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 shrink-0"
                    >
                      <Download size={12} />
                      下载
                    </button>
                  )}
                  {b.status === 'failed' && b.error && (
                    <span className="text-[10px] text-red-500 max-w-32 truncate" title={b.error}>{b.error}</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
