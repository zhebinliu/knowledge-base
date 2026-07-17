import { useEffect, useState, useRef } from 'react'
import { Layers, Search, History, BookOpen, GitPullRequest, Check, X, Loader2, Upload, Download, Plus, ChevronDown } from 'lucide-react'
import { toast } from '../components/Toaster'
import SceneEditDrawer from '../components/SceneEditDrawer'
import {
  listSceneDomains, listScenes, listRecentSceneChanges, aiMatchScenes,
  adminListProposals, approveProposal, rejectProposal,
  importScenes, createScene, downloadImportTemplate, listStages,
  type Scene, type SceneChange, type SceneDomains, type SceneProposal,
  type ImportResult, type ApprovePayload, type StageOption,
} from '../api/scenes'
import { getProjectMeta, type IndustryTree } from '../api/client'
import { Sparkles } from 'lucide-react'

/**
 * 场景库中心 — Harness P3/P4 底座的后台管理页。
 * 预览全部标准 Core 场景(LTC/ITR/MCR/MPR/MTL),查看变更历史(何时/哪个项目/新增或优化)。
 */
export default function SceneLibrary() {
  const [tab, setTab] = useState<'scenes' | 'changes' | 'review'>('scenes')
  const [domains, setDomains] = useState<SceneDomains | null>(null)
  const [activeDomain, setActiveDomain] = useState<string>('')
  const [q, setQ] = useState('')
  const [scenes, setScenes] = useState<Scene[]>([])
  const [changes, setChanges] = useState<SceneChange[]>([])
  const [proposals, setProposals] = useState<SceneProposal[]>([])
  const [busyId, setBusyId] = useState<number | null>(null)
  const [editScene, setEditScene] = useState<Scene | null>(null)
  const [matching, setMatching] = useState(false)
  const [loading, setLoading] = useState(false)
  const [openProposalIds, setOpenProposalIds] = useState<Set<number>>(new Set())
  const toggleProposal = (id: number) => setOpenProposalIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  // 导入 / 新增
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ domain: 'LTC', stage: '', stage_label: '', code: '', name: '', summary: '', description: '', business_rules: '', process: '', tags: '' })
  const [creating, setCreating] = useState(false)

  // 审核表单
  const [approveTarget, setApproveTarget] = useState<SceneProposal | null>(null)
  const [approveForm, setApproveForm] = useState({ code: '', stage: '', stage_label: '', note: '' })
  const [approveTags, setApproveTags] = useState<string[]>([])
  const [stageOptions, setStageOptions] = useState<StageOption[]>([])
  const [industryTree, setIndustryTree] = useState<IndustryTree>({})
  const [indL1, setIndL1] = useState(''); const [indL2, setIndL2] = useState(''); const [indL3, setIndL3] = useState(''); const [indL4, setIndL4] = useState('')
  const [customStage, setCustomStage] = useState(false)

  const runAiMatch = async () => {
    if (!confirm(`对${activeDomain ? ` ${activeDomain} 域` : '全部'}场景运行 AI 自动匹配?会写入每个场景的 AI 能力匹配(可再手动改)。`)) return
    setMatching(true)
    try {
      const r = await aiMatchScenes(activeDomain || undefined)
      toast.success(`AI 匹配完成:${r.matched_scenes} 个场景 / 共 ${r.assignments} 处能力匹配`)
      const list = await listScenes({ domain: activeDomain || undefined, q: q || undefined })
      setScenes(list)
    } catch { /* 拦截器已 toast */ } finally { setMatching(false) }
  }

  const refreshScenes = () => {
    listScenes({ domain: activeDomain || undefined, q: q || undefined }).then(setScenes).catch(() => {})
    listSceneDomains().then(setDomains).catch(() => {})
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setImporting(true)
    setImportResult(null)
    try {
      const r = await importScenes(f)
      setImportResult(r)
      if (r.created > 0 || r.updated > 0) {
        toast.success(`导入完成:新增 ${r.created}、更新 ${r.updated}${r.skipped ? `、跳过 ${r.skipped}` : ''}`)
        refreshScenes()
      } else if (r.skipped > 0 && r.errors.length > 0) {
        toast.error(`导入失败:${r.errors[0]}`)
      } else {
        toast.info('没有需要导入的数据')
      }
    } catch { /* 拦截器已 toast */ } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleCreate = async () => {
    if (!createForm.code.trim() || !createForm.name.trim() || !createForm.stage.trim()) {
      toast.error('域、阶段、编码、名称为必填')
      return
    }
    setCreating(true)
    try {
      const tags = createForm.tags.split(';').map(t => t.trim()).filter(Boolean)
      await createScene({
        domain: createForm.domain, stage: createForm.stage.trim(),
        stage_label: createForm.stage_label.trim() || undefined,
        code: createForm.code.trim(), name: createForm.name.trim(),
        summary: createForm.summary.trim() || undefined,
        description: createForm.description.trim() || undefined,
        business_rules: createForm.business_rules.trim() || undefined,
        process: createForm.process.trim() || undefined,
        tags: tags.length ? tags : undefined,
      })
      toast.success('场景创建成功')
      setShowCreate(false)
      setCreateForm({ domain: 'LTC', stage: '', stage_label: '', code: '', name: '', summary: '', description: '', business_rules: '', process: '', tags: '' })
      refreshScenes()
    } catch { /* 拦截器已 toast */ } finally { setCreating(false) }
  }

  useEffect(() => { listSceneDomains().then(setDomains).catch(() => {}) }, [])

  useEffect(() => {
    if (tab !== 'scenes') return
    setLoading(true)
    const t = setTimeout(() => {
      listScenes({ domain: activeDomain || undefined, q: q || undefined })
        .then(setScenes).catch(() => {}).finally(() => setLoading(false))
    }, q ? 300 : 0)
    return () => clearTimeout(t)
  }, [tab, activeDomain, q])

  useEffect(() => {
    if (tab !== 'changes') return
    setLoading(true)
    listRecentSceneChanges().then(setChanges).catch(() => {}).finally(() => setLoading(false))
  }, [tab])

  const loadProposals = () => {
    setLoading(true)
    adminListProposals('admin_pending').then(setProposals).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { if (tab === 'review') loadProposals() }, [tab])

  const openApproveForm = (p: SceneProposal) => {
    setApproveForm({ code: p.scene_code || '', stage: '', stage_label: '', note: '' })
    setApproveTags([])
    setCustomStage(false)
    setIndL1(''); setIndL2(''); setIndL3(''); setIndL4('')
    setApproveTarget(p)
    listStages(p.domain || undefined).then(setStageOptions).catch(() => {})
    getProjectMeta().then(m => setIndustryTree(m.industry_tree || {})).catch(() => {})
  }
  const onSelectStage = (v: string) => {
    if (v === '__custom__') {
      setCustomStage(true)
      setApproveForm(f => ({ ...f, stage: '', stage_label: '' }))
    } else {
      setCustomStage(false)
      const opt = stageOptions.find(s => s.stage === v)
      setApproveForm(f => ({ ...f, stage: v, stage_label: opt?.stage_label || '' }))
    }
  }
  const addIndustryTag = () => {
    const path = [indL1, indL2, indL3, indL4].filter(Boolean).join('/')
    if (path && !approveTags.includes(path)) setApproveTags(t => [...t, path])
    setIndL1(''); setIndL2(''); setIndL3(''); setIndL4('')
  }
  const doApprove = async () => {
    if (!approveTarget) return
    const id = approveTarget.id
    const isNew = approveTarget.change_type === 'new'
    if (isNew && !approveForm.code.trim()) {
      toast.error('新增场景必须填写场景编号')
      return
    }
    setBusyId(id)
    try {
      const payload: ApprovePayload = {
        note: approveForm.note.trim() || undefined,
        code: approveForm.code.trim() || undefined,
        stage: approveForm.stage.trim() || undefined,
        stage_label: approveForm.stage_label.trim() || undefined,
        tags: approveTags.length ? approveTags : undefined,
      }
      await approveProposal(id, payload)
      toast.success('已通过并回写场景库')
      setProposals(p => p.filter(x => x.id !== id))
      setApproveTarget(null)
    } catch { /* 拦截器已 toast */ } finally { setBusyId(null) }
  }
  const doReject = async (id: number) => {
    setBusyId(id)
    try { await rejectProposal(id); toast.info('已驳回'); setProposals(p => p.filter(x => x.id !== id)) }
    catch { /* 拦截器已 toast */ } finally { setBusyId(null) }
  }

  const DOMAIN_LABEL: Record<string, string> = {
    LTC: 'LTC 线索到回款', MTL: 'MTL 市场到线索', MCR: 'MCR 客户关系',
    MPR: 'MPR 伙伴关系', ITR: 'ITR 问题到解决',
  }

  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* 头部 */}
      <div className="flex items-center gap-3 mb-1">
        <div className="w-9 h-9 rounded-xl bg-brand-light flex items-center justify-center">
          <Layers size={18} className="text-[#D96400]" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-ink">场景库中心</h1>
          <p className="text-xs text-ink-muted">标准 Core 场景库 · 场景命中与蓝图回流的知识底座</p>
        </div>
        {domains && (
          <span className="ml-auto text-xs text-ink-muted">
            共 <span className="font-semibold text-ink">{domains.total}</span> 个标准场景
          </span>
        )}
      </div>

      {/* Tab */}
      <div className="flex items-center gap-1 border-b border-line mt-4 mb-4">
        <TabBtn active={tab === 'scenes'} onClick={() => setTab('scenes')} icon={BookOpen} label="场景清单" />
        <TabBtn active={tab === 'changes'} onClick={() => setTab('changes')} icon={History} label="变更历史" />
        <TabBtn active={tab === 'review'} onClick={() => setTab('review')} icon={GitPullRequest} label="待审核回流" />
      </div>

      {tab === 'scenes' ? (
        <>
          {/* 域过滤 + 搜索 */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <DomainChip label="全部" count={domains?.total} active={!activeDomain} onClick={() => setActiveDomain('')} />
            {domains?.domains.map(d => (
              <DomainChip key={d.domain} label={d.domain} count={d.count}
                active={activeDomain === d.domain} onClick={() => setActiveDomain(d.domain)} />
            ))}
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[#D96400] text-[#D96400] font-medium hover:bg-brand-light">
                <Plus size={13} /> 新增场景
              </button>
              <button onClick={() => downloadImportTemplate().catch(() => {})}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-line text-ink-secondary font-medium hover:bg-canvas">
                <Download size={13} /> 下载模板
              </button>
              <button onClick={() => fileRef.current?.click()} disabled={importing}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-line text-ink-secondary font-medium hover:bg-canvas disabled:opacity-60">
                {importing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                导入场景
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportFile} />
              <button onClick={runAiMatch} disabled={matching}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-white font-medium disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#FF8D1A,#D96400)' }}
                title={`对${activeDomain || '全部'}场景自动匹配 AI 能力`}>
                {matching ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                AI 匹配{activeDomain ? `（${activeDomain}）` : ''}
              </button>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                value={q} onChange={e => setQ(e.target.value)}
                placeholder="搜索场景名称 / 编码"
                className="pl-8 pr-3 py-1.5 text-sm border border-line rounded-lg w-56 bg-white focus:outline-none focus:border-[#D96400]"
              />
            </div>
          </div>

          {activeDomain && DOMAIN_LABEL[activeDomain] && (
            <p className="text-xs text-ink-muted mb-2">{DOMAIN_LABEL[activeDomain]}</p>
          )}

          <div className="border border-line rounded-xl overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-canvas text-ink-secondary text-xs">
                  <th className="text-left font-medium px-3 py-2 w-16">域</th>
                  <th className="text-left font-medium px-3 py-2 w-40">阶段</th>
                  <th className="text-left font-medium px-3 py-2 w-24">编码</th>
                  <th className="text-left font-medium px-3 py-2">场景名称</th>
                  <th className="text-left font-medium px-3 py-2 w-28">来源</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-ink-muted text-sm">加载中…</td></tr>
                ) : scenes.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-ink-muted text-sm">无匹配场景</td></tr>
                ) : scenes.map(s => (
                  <tr key={s.id} onClick={() => setEditScene(s)} className="border-t border-line hover:bg-canvas/60 cursor-pointer" title="点击编辑">
                    <td className="px-3 py-2"><span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-canvas text-ink-secondary">{s.domain}</span></td>
                    <td className="px-3 py-2 text-ink-secondary text-xs">{s.stage_label || s.stage}</td>
                    <td className="px-3 py-2 font-mono text-xs text-ink-secondary">{s.code}</td>
                    <td className="px-3 py-2 text-ink">
                      {s.name}
                      {(s.tags?.length || 0) > 0 && (
                        <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                          {s.tags.slice(0, 3).map(t => (
                            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200">{t === '通用' ? '通用' : t.split('/').filter(Boolean).pop()}</span>
                          ))}
                          {s.tags.length > 3 && <span className="text-[10px] text-ink-muted">+{s.tags.length - 3}</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {s.source_type === 'project'
                        ? <span className="text-[11px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">项目{s.source_project_name ? `·${s.source_project_name}` : ''}</span>
                        : <span className="text-[11px] px-1.5 py-0.5 rounded bg-canvas text-ink-muted">标准</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : tab === 'changes' ? (
        <div className="border border-line rounded-xl overflow-hidden bg-white">
          {loading ? (
            <div className="px-3 py-8 text-center text-ink-muted text-sm">加载中…</div>
          ) : changes.length === 0 ? (
            <div className="px-3 py-10 text-center text-ink-muted text-sm">
              暂无变更记录<br />
              <span className="text-xs">项目蓝图回流经审核通过后,新增/优化的场景会在此留痕(何时 · 哪个项目 · 变更类型)。</span>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-canvas text-ink-secondary text-xs">
                  <th className="text-left font-medium px-3 py-2 w-40">时间</th>
                  <th className="text-left font-medium px-3 py-2 w-20">类型</th>
                  <th className="text-left font-medium px-3 py-2 w-24">场景</th>
                  <th className="text-left font-medium px-3 py-2 w-36">来源项目</th>
                  <th className="text-left font-medium px-3 py-2">说明</th>
                </tr>
              </thead>
              <tbody>
                {changes.map(c => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="px-3 py-2 text-ink-muted text-xs">{new Date(c.created_at).toLocaleString('zh-CN')}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[11px] px-1.5 py-0.5 rounded border ${c.change_type === 'new'
                        ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                        {c.change_type === 'new' ? '新增' : c.change_type === 'optimize' ? '优化' : '编辑'}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-ink-secondary">{c.scene_code}</td>
                    <td className="px-3 py-2 text-ink-secondary text-xs">{c.project_name || '—'}</td>
                    <td className="px-3 py-2 text-ink text-xs">{c.summary || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        /* 待审核回流(管理员):PM 已确认的场景提案,通过则回写场景库 */
        <div className="border border-line rounded-xl overflow-hidden bg-white">
          {loading ? (
            <div className="px-3 py-8 text-center text-ink-muted text-sm">加载中…</div>
          ) : proposals.length === 0 ? (
            <div className="px-3 py-10 text-center text-ink-muted text-sm">
              暂无待审核回流<br />
              <span className="text-xs">项目侧「蓝图完成·识别回流」并经 PM 确认后,提案在此等待管理员审核回写。</span>
            </div>
          ) : (
            <div className="divide-y divide-line">
              {proposals.map(p => {
                const open = openProposalIds.has(p.id)
                const ct = p.content || {}
                const fields = ct.recommended_fields || []
                const hasDetail = !!(ct.blueprint_evidence || ct.description || ct.business_rules || ct.process || fields.length)
                return (
                <div key={p.id}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className={`flex-shrink-0 text-[11px] px-1.5 py-0.5 rounded border ${p.change_type === 'new'
                      ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                      {p.change_type === 'new' ? '新增' : '优化'}
                    </span>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => hasDetail && toggleProposal(p.id)}>
                      <div className="text-sm text-ink truncate">
                        {p.scene_code ? <span className="font-mono text-xs text-ink-secondary mr-1">{p.scene_code}</span> : null}
                        {p.name}
                      </div>
                      <div className="text-[11px] text-ink-muted truncate">
                        {p.project_name || '—'} · PM {p.pm_confirmed_by || '—'} 确认{p.summary ? ` · ${p.summary}` : ''}
                      </div>
                    </div>
                    {hasDetail && (
                      <button onClick={() => toggleProposal(p.id)}
                        className="flex-shrink-0 inline-flex items-center gap-1 text-xs text-ink-secondary hover:text-ink">
                        详情 <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                    <button onClick={() => openApproveForm(p)} disabled={busyId === p.id}
                      className="flex-shrink-0 inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                      {busyId === p.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} 通过回写
                    </button>
                    <button onClick={() => doReject(p.id)} disabled={busyId === p.id}
                      className="flex-shrink-0 inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-line text-ink-secondary hover:bg-canvas disabled:opacity-50">
                      <X size={12} /> 驳回
                    </button>
                  </div>
                  {open && hasDetail && (
                    <div className="px-4 pb-3 pt-0 space-y-3">
                      {ct.blueprint_evidence && (
                        <div className="border-l-2 border-purple-400 bg-purple-50/50 rounded-r-lg px-3 py-2">
                          <div className="text-[10px] font-bold text-purple-700 tracking-wide mb-1">蓝图原文依据</div>
                          <div className="text-xs text-ink-secondary leading-relaxed">「{ct.blueprint_evidence}」</div>
                        </div>
                      )}
                      {ct.description && (
                        <div>
                          <div className="text-[10px] font-bold text-ink-secondary tracking-wide mb-1">场景说明</div>
                          <div className="text-xs text-ink leading-relaxed whitespace-pre-wrap">{ct.description}</div>
                        </div>
                      )}
                      {ct.business_rules && (
                        <div>
                          <div className="text-[10px] font-bold text-ink-secondary tracking-wide mb-1">业务规则</div>
                          <div className="text-xs text-ink leading-relaxed whitespace-pre-wrap">{ct.business_rules}</div>
                        </div>
                      )}
                      {ct.process && (
                        <div>
                          <div className="text-[10px] font-bold text-ink-secondary tracking-wide mb-1">流程</div>
                          <div className="text-xs text-ink leading-relaxed whitespace-pre-wrap">{ct.process}</div>
                        </div>
                      )}
                      {fields.length > 0 && (
                        <div>
                          <div className="text-[10px] font-bold text-ink-secondary tracking-wide mb-1.5">推荐字段 · {fields.length}</div>
                          <div className="flex flex-wrap gap-1.5">
                            {fields.map((f, i) => (
                              <span key={i} className="text-[11px] px-2 py-0.5 rounded-full border border-line bg-canvas text-ink">
                                {f.name}{f.type ? <span className="text-ink-muted"> · {f.type}</span> : null}{f.required ? <span className="text-[#D96400]"> *</span> : null}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* 导入结果提示 */}
      {importResult && (importResult.errors.length > 0) && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm">
          <div className="font-medium text-amber-800 mb-1">导入提示(共 {importResult.errors.length} 条警告)</div>
          <ul className="list-disc list-inside text-xs text-amber-700 space-y-0.5 max-h-32 overflow-y-auto">
            {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
          <button onClick={() => setImportResult(null)} className="mt-2 text-xs text-amber-600 hover:underline">关闭</button>
        </div>
      )}

      {/* 新增场景弹窗 */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <h2 className="text-base font-bold text-ink">新增场景</h2>
              <button onClick={() => setShowCreate(false)} className="text-ink-muted hover:text-ink"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-ink-secondary">域 <span className="text-red-500">*</span></span>
                  <select value={createForm.domain} onChange={e => setCreateForm(f => ({ ...f, domain: e.target.value }))}
                    className="mt-1 block w-full text-sm border border-line rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:border-[#D96400]">
                    {['LTC', 'MTL', 'MCR', 'MPR', 'ITR'].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-ink-secondary">场景编码 <span className="text-red-500">*</span></span>
                  <input value={createForm.code} onChange={e => setCreateForm(f => ({ ...f, code: e.target.value }))}
                    placeholder="如 LM-01" className="mt-1 block w-full text-sm border border-line rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#D96400]" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-ink-secondary">阶段 <span className="text-red-500">*</span></span>
                  <input value={createForm.stage} onChange={e => setCreateForm(f => ({ ...f, stage: e.target.value }))}
                    placeholder="如 LeadManagement" className="mt-1 block w-full text-sm border border-line rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#D96400]" />
                </label>
                <label className="block">
                  <span className="text-xs text-ink-secondary">阶段显示名</span>
                  <input value={createForm.stage_label} onChange={e => setCreateForm(f => ({ ...f, stage_label: e.target.value }))}
                    placeholder="如 LeadManagement 线索管理" className="mt-1 block w-full text-sm border border-line rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#D96400]" />
                </label>
              </div>
              <label className="block">
                <span className="text-xs text-ink-secondary">场景名称 <span className="text-red-500">*</span></span>
                <input value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="如 管理线索录入" className="mt-1 block w-full text-sm border border-line rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#D96400]" />
              </label>
              <label className="block">
                <span className="text-xs text-ink-secondary">阶段定义</span>
                <textarea value={createForm.summary} onChange={e => setCreateForm(f => ({ ...f, summary: e.target.value }))}
                  rows={2} placeholder="该阶段的整体说明" className="mt-1 block w-full text-sm border border-line rounded-lg px-3 py-1.5 resize-none focus:outline-none focus:border-[#D96400]" />
              </label>
              <label className="block">
                <span className="text-xs text-ink-secondary">场景说明</span>
                <textarea value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} placeholder="场景的详细描述" className="mt-1 block w-full text-sm border border-line rounded-lg px-3 py-1.5 resize-none focus:outline-none focus:border-[#D96400]" />
              </label>
              <label className="block">
                <span className="text-xs text-ink-secondary">业务规则</span>
                <textarea value={createForm.business_rules} onChange={e => setCreateForm(f => ({ ...f, business_rules: e.target.value }))}
                  rows={2} placeholder="该场景涉及的业务规则" className="mt-1 block w-full text-sm border border-line rounded-lg px-3 py-1.5 resize-none focus:outline-none focus:border-[#D96400]" />
              </label>
              <label className="block">
                <span className="text-xs text-ink-secondary">流程</span>
                <textarea value={createForm.process} onChange={e => setCreateForm(f => ({ ...f, process: e.target.value }))}
                  rows={2} placeholder="该场景的执行流程" className="mt-1 block w-full text-sm border border-line rounded-lg px-3 py-1.5 resize-none focus:outline-none focus:border-[#D96400]" />
              </label>
              <label className="block">
                <span className="text-xs text-ink-secondary">标签(分号分隔)</span>
                <input value={createForm.tags} onChange={e => setCreateForm(f => ({ ...f, tags: e.target.value }))}
                  placeholder="如 通用;制造/装备制造" className="mt-1 block w-full text-sm border border-line rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#D96400]" />
              </label>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-line">
              <button onClick={() => setShowCreate(false)} className="px-4 py-1.5 text-sm rounded-lg border border-line text-ink-secondary hover:bg-canvas">取消</button>
              <button onClick={handleCreate} disabled={creating}
                className="px-4 py-1.5 text-sm rounded-lg text-white font-medium disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#FF8D1A,#D96400)' }}>
                {creating ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 审核通过弹窗:填写编号 + 阶段 + 行业标签 */}
      {approveTarget && (() => {
        const isNew = approveTarget.change_type === 'new'
        const l2opts = indL1 ? Object.keys(industryTree[indL1] || {}) : []
        const l3opts = indL1 && indL2 ? Object.keys(industryTree[indL1]?.[indL2] || {}) : []
        const l4opts = indL1 && indL2 && indL3 ? (industryTree[indL1]?.[indL2]?.[indL3] || []) : []
        const tagLabel = (t: string) => t === '通用' ? '通用' : t.split('/').filter(Boolean).pop() || t
        const sel = 'flex-1 min-w-0 text-xs border border-line rounded px-1.5 py-1.5 bg-white focus:outline-none focus:border-[#D96400]'
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setApproveTarget(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <h2 className="text-base font-bold text-ink">审核通过 · 补充信息</h2>
              <button onClick={() => setApproveTarget(null)} className="text-ink-muted hover:text-ink"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="text-xs text-ink-muted mb-1">
                <span className={`inline-block text-[11px] px-1.5 py-0.5 rounded border mr-1.5 ${isNew
                  ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                  {isNew ? '新增' : '优化'}
                </span>
                {approveTarget.name}
                {approveTarget.domain && <span className="ml-1.5 font-mono text-[11px] px-1 py-0.5 rounded bg-canvas">{approveTarget.domain}</span>}
              </div>

              {isNew && (
                <>
                  <label className="block">
                    <span className="text-xs text-ink-secondary">场景编号 <span className="text-red-500">*</span></span>
                    <input value={approveForm.code} onChange={e => setApproveForm(f => ({ ...f, code: e.target.value }))}
                      placeholder="如 LM-01" className="mt-1 block w-full text-sm border border-line rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#D96400]" />
                  </label>

                  <div>
                    <span className="text-xs text-ink-secondary">阶段</span>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <select value={customStage ? '__custom__' : approveForm.stage}
                        onChange={e => onSelectStage(e.target.value)}
                        className="text-sm border border-line rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:border-[#D96400]">
                        <option value="">选择已有阶段…</option>
                        {stageOptions.map(s => (
                          <option key={s.stage} value={s.stage}>{s.stage_label ? `${s.stage_label}（${s.stage}）` : s.stage}</option>
                        ))}
                        <option value="__custom__">+ 新建阶段</option>
                      </select>
                      {!customStage && approveForm.stage_label && (
                        <div className="flex items-center text-xs text-ink-muted px-2">显示名：{approveForm.stage_label}</div>
                      )}
                    </div>
                    {customStage && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <input value={approveForm.stage} onChange={e => setApproveForm(f => ({ ...f, stage: e.target.value }))}
                          placeholder="阶段标识 如 LeadManagement" className="text-sm border border-line rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#D96400]" />
                        <input value={approveForm.stage_label} onChange={e => setApproveForm(f => ({ ...f, stage_label: e.target.value }))}
                          placeholder="显示名 如 线索管理" className="text-sm border border-line rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#D96400]" />
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* 行业标签 */}
              <div>
                <span className="text-xs text-ink-secondary">行业标签</span>
                {approveTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5 mb-2">
                    {approveTags.map(t => (
                      <span key={t} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200">
                        {tagLabel(t)}
                        <button onClick={() => setApproveTags(ts => ts.filter(x => x !== t))} className="hover:text-blue-900"><X size={10} /></button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <button onClick={() => { if (!approveTags.includes('通用')) setApproveTags(t => [...t, '通用']) }}
                    className="text-xs px-2 py-1 rounded border border-line text-ink-secondary hover:bg-canvas">+ 通用</button>
                  <select value={indL1} onChange={e => { setIndL1(e.target.value); setIndL2(''); setIndL3(''); setIndL4('') }} className={sel}>
                    <option value="">L1 大行业</option>{Object.keys(industryTree).map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <select value={indL2} onChange={e => { setIndL2(e.target.value); setIndL3(''); setIndL4('') }} disabled={!indL1} className={sel}>
                    <option value="">L2</option>{l2opts.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <select value={indL3} onChange={e => { setIndL3(e.target.value); setIndL4('') }} disabled={!indL2} className={sel}>
                    <option value="">L3</option>{l3opts.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <select value={indL4} onChange={e => setIndL4(e.target.value)} disabled={!indL3} className={sel}>
                    <option value="">L4</option>{l4opts.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <button onClick={addIndustryTag} disabled={!indL1}
                    className="text-xs px-2 py-1 rounded bg-brand-light text-[#D96400] border border-[#F3D6B0] disabled:opacity-50">+ 加标签</button>
                </div>
              </div>

              <label className="block">
                <span className="text-xs text-ink-secondary">审核备注</span>
                <input value={approveForm.note} onChange={e => setApproveForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="可选" className="mt-1 block w-full text-sm border border-line rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#D96400]" />
              </label>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-line">
              <button onClick={() => setApproveTarget(null)} className="px-4 py-1.5 text-sm rounded-lg border border-line text-ink-secondary hover:bg-canvas">取消</button>
              <button onClick={doApprove} disabled={busyId === approveTarget.id}
                className="px-4 py-1.5 text-sm rounded-lg text-white font-medium disabled:opacity-60 bg-emerald-600 hover:bg-emerald-700">
                {busyId === approveTarget.id ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
                确认通过
              </button>
            </div>
          </div>
        </div>
        )
      })()}

      {/* 场景编辑抽屉(Block5):点场景行打开 */}
      <SceneEditDrawer
        scene={editScene}
        onClose={() => setEditScene(null)}
        onSaved={(s) => { setScenes(prev => prev.map(x => x.id === s.id ? s : x)); setEditScene(null) }}
      />
    </div>
  )
}

function TabBtn({ active, onClick, icon: Icon, label }: {
  active: boolean; onClick: () => void; icon: typeof Layers; label: string
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
        active ? 'border-[#D96400] text-[#D96400] font-medium' : 'border-transparent text-ink-secondary hover:text-ink'}`}>
      <Icon size={14} /> {label}
    </button>
  )
}

function DomainChip({ label, count, active, onClick }: {
  label: string; count?: number; active: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors border ${
        active ? 'bg-brand-light text-[#D96400] border-[#F3D6B0] font-medium'
               : 'bg-white text-ink-secondary border-line hover:bg-canvas'}`}>
      {label}{count != null && <span className="text-[10px] opacity-70">{count}</span>}
    </button>
  )
}
