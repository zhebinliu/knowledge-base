import { useEffect, useMemo, useState } from 'react'
import { X, Plus, Trash2, Loader2, Tag as TagIcon, Sparkles, Search } from 'lucide-react'
import { toast } from './Toaster'
import { getProjectMeta, type IndustryTree } from '../api/client'
import { updateScene, listAiCapabilities, type Scene, type RecommendedField, type AiCapability } from '../api/scenes'

const CAP_STATUS_CLS: Record<string, string> = {
  '已具备': 'bg-green-50 text-green-700 ring-green-200',
  '开发中': 'bg-amber-50 text-amber-700 ring-amber-200',
  '未开发': 'bg-slate-100 text-slate-500 ring-slate-200',
}

/**
 * SceneEditDrawer — 场景库中心的场景编辑抽屉(Block5)。
 * 可编辑:名称 / 标签(通用 + 四级行业,多选)/ 说明 / 业务规则 / 流程 / 推荐字段(表格增删改)。
 * 保存走 PATCH /scenes/{id},后端写 SceneChange 留痕。
 */
export default function SceneEditDrawer({
  scene, onClose, onSaved,
}: { scene: Scene | null; onClose: () => void; onSaved: (s: Scene) => void }) {
  const [tree, setTree] = useState<IndustryTree>({})
  const [name, setName] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [description, setDescription] = useState('')
  const [rules, setRules] = useState('')
  const [process, setProcess] = useState('')
  const [fields, setFields] = useState<RecommendedField[]>([])
  const [aiCaps, setAiCaps] = useState<number[]>([])
  const [allCaps, setAllCaps] = useState<AiCapability[]>([])
  const [capSearch, setCapSearch] = useState('')
  const [capOpen, setCapOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  // 行业级联选择
  const [l1, setL1] = useState(''); const [l2, setL2] = useState(''); const [l3, setL3] = useState(''); const [l4, setL4] = useState('')

  useEffect(() => { getProjectMeta().then(m => setTree(m.industry_tree || {})).catch(() => {}) }, [])
  useEffect(() => { listAiCapabilities().then(setAllCaps).catch(() => {}) }, [])
  useEffect(() => {
    if (!scene) return
    setName(scene.name || ''); setTags(scene.tags || [])
    setDescription(scene.description || ''); setRules(scene.business_rules || '')
    setProcess(scene.process || ''); setFields(scene.recommended_fields || [])
    setAiCaps(scene.ai_capabilities || [])
    setL1(''); setL2(''); setL3(''); setL4(''); setCapSearch(''); setCapOpen(false)
  }, [scene])

  const capById = useMemo(() => Object.fromEntries(allCaps.map(c => [c.id, c])), [allCaps])
  const capMatches = useMemo(() => {
    const q = capSearch.trim().toLowerCase()
    return allCaps.filter(c => !q || `${c.skill}${c.agent}${c.domain}`.toLowerCase().includes(q))
  }, [allCaps, capSearch])

  if (!scene) return null

  const addTag = (t: string) => { if (t && !tags.includes(t)) setTags([...tags, t]) }
  const addIndustryTag = () => {
    const path = [l1, l2, l3, l4].filter(Boolean).join('/')
    if (path) { addTag(path); setL1(''); setL2(''); setL3(''); setL4('') }
  }
  const tagLabel = (t: string) => t === '通用' ? '通用' : t.split('/').filter(Boolean).pop() || t

  const setField = (i: number, key: keyof RecommendedField, v: string | boolean) =>
    setFields(fs => fs.map((f, idx) => idx === i ? { ...f, [key]: v } : f))
  const addField = () => setFields(fs => [...fs, { name: '', type: '', note: '', required: false }])
  const delField = (i: number) => setFields(fs => fs.filter((_, idx) => idx !== i))

  const save = async () => {
    setSaving(true)
    try {
      const s = await updateScene(scene.id, {
        name: name.trim() || scene.name,
        description, business_rules: rules, process,
        recommended_fields: fields.filter(f => (f.name || '').trim()),
        tags,
        ai_capabilities: aiCaps,
      })
      toast.success('已保存')
      onSaved(s)
    } catch { /* 拦截器已 toast */ } finally { setSaving(false) }
  }

  const l2opts = l1 ? Object.keys(tree[l1] || {}) : []
  const l3opts = l1 && l2 ? Object.keys(tree[l1]?.[l2] || {}) : []
  const l4opts = l1 && l2 && l3 ? (tree[l1]?.[l2]?.[l3] || []) : []
  const sel = 'text-xs border border-line rounded px-1.5 py-1 bg-white max-w-[150px]'

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-2xl h-full bg-white shadow-2xl overflow-y-auto">
        {/* 头 */}
        <div className="sticky top-0 bg-white border-b border-line px-5 py-3 flex items-center gap-3 z-10">
          <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-canvas text-ink-secondary">{scene.domain} · {scene.code}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-ink truncate">{scene.stage_label || scene.stage}</div>
          </div>
          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-1.5 text-sm px-3.5 py-1.5 rounded-lg text-white font-medium disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#FF8D1A,#D96400)' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null} 保存
          </button>
          <button onClick={onClose} className="p-1.5 rounded text-ink-muted hover:bg-canvas"><X size={16} /></button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* 名称 */}
          <Field label="场景名称">
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full text-sm border border-line rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[#D96400]" />
          </Field>

          {/* 标签 */}
          <Field label="标签(通用 / 四级行业,多选)">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.length === 0 && <span className="text-xs text-ink-muted">暂无标签</span>}
              {tags.map(t => (
                <span key={t} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200">
                  <TagIcon size={10} />{tagLabel(t)}
                  <button onClick={() => setTags(tags.filter(x => x !== t))} className="hover:text-blue-900"><X size={10} /></button>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button onClick={() => addTag('通用')} className="text-xs px-2 py-1 rounded border border-line text-ink-secondary hover:bg-canvas">+ 通用</button>
              <select value={l1} onChange={e => { setL1(e.target.value); setL2(''); setL3(''); setL4('') }} className={sel}>
                <option value="">L1 大行业</option>{Object.keys(tree).map(k => <option key={k} value={k}>{k}</option>)}
              </select>
              <select value={l2} onChange={e => { setL2(e.target.value); setL3(''); setL4('') }} disabled={!l1} className={sel}>
                <option value="">L2</option>{l2opts.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
              <select value={l3} onChange={e => { setL3(e.target.value); setL4('') }} disabled={!l2} className={sel}>
                <option value="">L3</option>{l3opts.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
              <select value={l4} onChange={e => setL4(e.target.value)} disabled={!l3} className={sel}>
                <option value="">L4</option>{l4opts.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
              <button onClick={addIndustryTag} disabled={!l1}
                className="text-xs px-2 py-1 rounded bg-brand-light text-[#D96400] border border-[#F3D6B0] disabled:opacity-50">+ 加行业标签</button>
            </div>
          </Field>

          {/* 说明 / 业务规则 / 流程 */}
          <Field label="场景说明"><TextArea value={description} onChange={setDescription} rows={4} placeholder="留空即可,后续补充…" /></Field>
          <Field label="业务规则"><TextArea value={rules} onChange={setRules} rows={4} /></Field>
          <Field label="流程"><TextArea value={process} onChange={setProcess} rows={4} /></Field>

          {/* 推荐字段(可编辑表格) */}
          <Field label="推荐字段">
            <div className="border border-line rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-canvas text-ink-secondary">
                    <th className="text-left font-medium px-2 py-1.5 w-1/4">字段名</th>
                    <th className="text-left font-medium px-2 py-1.5 w-1/5">类型</th>
                    <th className="text-left font-medium px-2 py-1.5">说明</th>
                    <th className="text-center font-medium px-2 py-1.5 w-12">必填</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {fields.length === 0 && (
                    <tr><td colSpan={5} className="px-2 py-3 text-center text-ink-muted">暂无字段,点下方添加</td></tr>
                  )}
                  {fields.map((f, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="px-1 py-1"><input value={f.name} onChange={e => setField(i, 'name', e.target.value)} className="w-full px-1.5 py-1 border border-transparent hover:border-line rounded focus:outline-none focus:border-[#D96400]" /></td>
                      <td className="px-1 py-1"><input value={f.type || ''} onChange={e => setField(i, 'type', e.target.value)} placeholder="文本/数字/日期…" className="w-full px-1.5 py-1 border border-transparent hover:border-line rounded focus:outline-none focus:border-[#D96400]" /></td>
                      <td className="px-1 py-1"><input value={f.note || ''} onChange={e => setField(i, 'note', e.target.value)} className="w-full px-1.5 py-1 border border-transparent hover:border-line rounded focus:outline-none focus:border-[#D96400]" /></td>
                      <td className="px-1 py-1 text-center"><input type="checkbox" checked={!!f.required} onChange={e => setField(i, 'required', e.target.checked)} /></td>
                      <td className="px-1 py-1 text-center"><button onClick={() => delField(i)} className="text-ink-muted hover:text-red-600"><Trash2 size={12} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={addField} className="mt-2 inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-line text-ink-secondary hover:bg-canvas">
              <Plus size={12} /> 添加字段
            </button>
          </Field>

          {/* AI 能力匹配(场景的 AI 优化选择) */}
          <Field label="AI 能力匹配(纷享已预研能力,作为该场景的 AI 优化选择)">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {aiCaps.length === 0 && <span className="text-xs text-ink-muted">尚未匹配 AI 能力</span>}
              {aiCaps.map(id => {
                const c = capById[id]
                return (
                  <span key={id} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-orange-50 text-[#B45309] ring-1 ring-orange-200">
                    <Sparkles size={10} />{c ? c.skill : `#${id}`}
                    {c && <span className={`text-[9px] px-1 rounded ring-1 ${CAP_STATUS_CLS[c.status] || 'bg-slate-100 text-slate-500 ring-slate-200'}`}>{c.status}</span>}
                    <button onClick={() => setAiCaps(aiCaps.filter(x => x !== id))} className="hover:text-red-600"><X size={10} /></button>
                  </span>
                )
              })}
            </div>
            <button onClick={() => setCapOpen(o => !o)} className="text-xs px-2.5 py-1 rounded border border-line text-ink-secondary hover:bg-canvas inline-flex items-center gap-1">
              <Plus size={12} /> {capOpen ? '收起' : '匹配 AI 能力'}
            </button>
            {capOpen && (
              <div className="mt-2 border border-line rounded-lg overflow-hidden">
                <div className="relative border-b border-line">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <input value={capSearch} onChange={e => setCapSearch(e.target.value)} placeholder="搜索能力 / Agent / 领域"
                    className="w-full pl-8 pr-3 py-2 text-sm bg-white focus:outline-none" />
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {capMatches.length === 0 && <div className="px-3 py-4 text-center text-xs text-ink-muted">无匹配能力</div>}
                  {capMatches.map(c => {
                    const on = aiCaps.includes(c.id)
                    return (
                      <button key={c.id} onClick={() => setAiCaps(on ? aiCaps.filter(x => x !== c.id) : [...aiCaps, c.id])}
                        className={`w-full text-left px-3 py-2 border-t border-line flex items-start gap-2 hover:bg-canvas ${on ? 'bg-orange-50/50' : ''}`}>
                        <input type="checkbox" readOnly checked={on} className="mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-ink flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium">{c.skill}</span>
                            <span className={`text-[9px] px-1 py-0.5 rounded ring-1 ${CAP_STATUS_CLS[c.status] || 'bg-slate-100 text-slate-500 ring-slate-200'}`}>{c.status}</span>
                          </div>
                          <div className="text-[10.5px] text-ink-muted">{c.domain} · {c.agent}{c.description ? ` · ${c.description.slice(0, 40)}…` : ''}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </Field>

          <p className="text-[11px] text-ink-muted pt-1">保存后自动记入变更历史(编辑人 / 时间 / 改了哪些字段)。</p>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-ink-secondary mb-1.5">{label}</div>
      {children}
    </div>
  )
}
function TextArea({ value, onChange, rows, placeholder }: { value: string; onChange: (v: string) => void; rows: number; placeholder?: string }) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder}
      className="w-full text-sm border border-line rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[#D96400] resize-y" />
  )
}
