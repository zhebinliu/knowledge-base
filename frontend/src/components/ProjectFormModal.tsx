import { useEffect, useState } from 'react'
import {
  ProjectInput,
  Project,
  ProjectMeta,
  createProject,
  updateProject,
} from '../api/client'
import Modal from './Modal'

export interface ProjectFormModalProps {
  open: boolean
  meta: ProjectMeta | undefined
  initial?: Project | null  // 编辑时传入，否则为新建
  onClose: () => void
  onSaved: (p: Project) => void
}

export default function ProjectFormModal({ open, meta, initial, onClose, onSaved }: ProjectFormModalProps) {
  const [name, setName] = useState('')
  const [customer, setCustomer] = useState('')
  const [industry, setIndustry] = useState('')
  const [modules, setModules] = useState<string[]>([])
  const [kickoff, setKickoff] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setCustomer(initial?.customer ?? '')
    setIndustry(initial?.industry ?? '')
    setModules(initial?.modules ?? [])
    setKickoff(initial?.kickoff_date ?? '')
    setDescription(initial?.description ?? '')
    setError(null)
  }, [open, initial])

  const toggleModule = (m: string) => {
    setModules((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('项目名称必填'); return }
    setSubmitting(true)
    try {
      const body: ProjectInput = {
        name: name.trim(),
        customer: customer.trim() || null,
        industry: industry || null,
        modules,
        kickoff_date: kickoff || null,
        description: description.trim() || null,
      }
      const saved = initial
        ? await updateProject(initial.id, body)
        : await createProject(body)
      onSaved(saved)
      onClose()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setError(e?.response?.data?.detail ?? '保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      title={initial ? '编辑项目' : '新建项目'}
      onClose={onClose}
      width="lg"
      footer={
        <>
          <button onClick={onClose} type="button" className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
          <button disabled={submitting} type="submit" form="project-form"
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg">
            {submitting ? '保存中...' : '保存'}
          </button>
        </>
      }
    >
      <form id="project-form" onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">项目名称 *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">客户</label>
          <input value={customer} onChange={(e) => setCustomer(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">所属行业</label>
          <select value={industry} onChange={(e) => setIndustry(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">— 不指定 —</option>
            {(meta?.industries ?? []).map((ind) => (
              <option key={ind.value} value={ind.value}>{ind.label}</option>
            ))}
          </select>
          <p className="text-[11px] text-gray-400 mt-1">行业标签会自动同步到该项目下的文档，用于向量检索过滤。</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">立项日期</label>
          <input type="date" value={kickoff} onChange={(e) => setKickoff(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">涉及模块</label>
          <div className="flex flex-wrap gap-1.5">
            {(meta?.modules ?? []).map((m) => {
              const on = modules.includes(m)
              return (
                <button
                  type="button" key={m} onClick={() => toggleModule(m)}
                  className={`text-xs px-2 py-1 rounded-full border ${on
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}
                >
                  {m}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">说明</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
