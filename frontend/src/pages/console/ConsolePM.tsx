import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Brain, Search, ArrowRight, Info, ArrowLeft } from 'lucide-react'
import QA from '../QA'
import { listProjects, type Project } from '../../api/client'

/**
 * Console PM 视角入口：先让用户选择项目，然后进入 QA（本身就支持 PM persona 切换）。
 * 后续 C3 会改为一个锁定 persona=pm 的专用 UI，并输出结构化四段式答案。
 */
export default function ConsolePM() {
  const [entered, setEntered] = useState<Project | null>(null)
  const [q, setQ] = useState('')
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => listProjects() })

  const filtered = useMemo(() => {
    const list = projects ?? []
    if (!q.trim()) return list
    const kw = q.trim().toLowerCase()
    return list.filter(p =>
      p.name.toLowerCase().includes(kw) ||
      (p.customer ?? '').toLowerCase().includes(kw)
    )
  }, [projects, q])

  if (entered) {
    return (
      <div className="-mx-4 sm:-mx-6 -my-6 h-[calc(100vh-56px)] flex flex-col">
        <div className="flex-shrink-0 px-4 sm:px-6 py-2 border-b border-line bg-white flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setEntered(null)}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-canvas text-ink-secondary"
          >
            <ArrowLeft size={12} /> 换一个项目
          </button>
          <span className="text-ink-muted">·</span>
          <span className="text-ink">
            当前项目：<b className="text-purple-700">{entered.name}</b>
          </span>
          <span className="ml-auto text-ink-muted hidden sm:inline">
            右上角 persona 切到 <b>PM 视角</b> 后即可结构化提问
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <QA />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-purple-50 border border-purple-100 text-purple-700 text-[11px] font-medium mb-2">
            <Brain size={10} /> PM 视角分析
          </div>
          <h1 className="text-xl font-bold text-ink leading-tight">选择一个项目，开始提问</h1>
          <p className="text-xs text-ink-muted mt-0.5">按"状态 / 决策 / 风险 / 下一步"四维回答，仅在该项目文档范围内检索</p>
        </div>
        <div className="relative flex-shrink-0 w-56">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="搜项目或客户名..."
            className="w-full border border-line rounded-lg pl-7 pr-2 py-1.5 text-sm bg-white focus:border-purple-300 focus:ring-1 focus:ring-purple-100 outline-none"
          />
        </div>
      </div>

      <div className="rounded-xl border border-line bg-white overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-line">
          {filtered.length === 0 && (
            <p className="col-span-full text-xs text-ink-muted text-center py-8 bg-white">
              {projects?.length ? '没有匹配的项目' : '暂无项目，请让管理员在后台创建后再试'}
            </p>
          )}
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setEntered(p)}
              className="text-left bg-white p-3 hover:bg-purple-50/60 transition-colors group"
              title={p.customer ? `${p.name} · ${p.customer}` : p.name}
            >
              <p className="text-sm font-medium text-ink group-hover:text-purple-700 truncate">{p.name}</p>
              <p className="text-[11px] text-ink-muted truncate mt-0.5">
                {p.customer || '—'}
              </p>
              <div className="flex items-center gap-0.5 text-[11px] text-purple-600 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                进入 <ArrowRight size={10} />
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-[11px] text-blue-800 flex items-start gap-1.5">
        <Info size={11} className="mt-0.5 flex-shrink-0 text-blue-500" />
        <span>共 {projects?.length ?? 0} 个项目。进入后，下一次上线会把 persona 自动锁为 PM 视角。</span>
      </div>
    </div>
  )
}
