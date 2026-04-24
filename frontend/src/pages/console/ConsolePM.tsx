import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Brain, Folder, ArrowRight, Info } from 'lucide-react'
import QA from '../QA'
import { listProjects, type Project } from '../../api/client'

/**
 * Console PM 视角入口：先让用户选择项目，然后进入 QA（本身就支持 PM persona 切换）。
 * 后续 C3 会改为一个锁定 persona=pm 的专用 UI，并输出结构化四段式答案。
 */
export default function ConsolePM() {
  const [entered, setEntered] = useState(false)
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => listProjects() })

  if (entered) {
    return (
      <div className="-mx-4 sm:-mx-6 -my-6">
        <QA />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-50 border border-purple-100 text-purple-700 text-xs font-medium mb-3">
          <Brain size={11} /> PM 视角分析
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-ink leading-tight mb-2">
          选择一个项目，开始提问
        </h1>
        <p className="text-sm text-ink-secondary max-w-xl">
          PM 视角会限定只在该项目的文档范围内检索，并按"状态 / 决策 / 风险 / 下一步"四维回答。
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-white p-6 mb-4">
        <p className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
          <Folder size={14} className="text-purple-600" />
          可用的客户项目
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(projects ?? []).length === 0 && (
            <p className="col-span-full text-xs text-ink-muted text-center py-6">
              暂无项目。请让管理员在知识库后台创建项目后再试。
            </p>
          )}
          {(projects ?? []).map((p: Project) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setEntered(true)}
              className="text-left rounded-xl border border-line bg-canvas p-4 hover:border-purple-300 hover:shadow-sm transition-all group"
            >
              <p className="font-medium text-ink group-hover:text-purple-700 mb-0.5 truncate">{p.name}</p>
              {p.customer && <p className="text-xs text-ink-muted mb-2">{p.customer}</p>}
              <div className="flex items-center gap-1 text-xs text-purple-600">
                进入对话 <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800 flex items-start gap-2">
        <Info size={13} className="mt-0.5 flex-shrink-0 text-blue-500" />
        <span>
          进入对话后，在右上角切换 persona 为 "PM 视角"并选中项目即可开始问答。下一次上线会把这一步做成自动化。
        </span>
      </div>
    </div>
  )
}
