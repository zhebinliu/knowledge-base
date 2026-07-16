import { useEffect, useState, useRef } from 'react'
import { Layers, Search, History, BookOpen, GitPullRequest, Check, X, Loader2, Upload, Download, Plus } from 'lucide-react'
import { toast } from '../components/Toaster'
import SceneEditDrawer from '../components/SceneEditDrawer'
import {
  listSceneDomains, listScenes, listRecentSceneChanges, aiMatchScenes,
  adminListProposals, approveProposal, rejectProposal,
  importScenes, createScene, downloadImportTemplate,
  type Scene, type SceneChange, type SceneDomains, type SceneProposal,
  type ImportResult,
} from '../api/scenes'
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

  // 导入 / 新增
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ domain: 'LTC', stage: '', stage_label: '', code: '', name: '', summary: '', description: '', business_rules: '', process: '', tags: '' })
  const [creating, setCreating] = useState(false)

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

  const doApprove = async (id: number) => {
    setBusyId(id)
    try { await approveProposal(id); toast.success('已通过并回写场景库'); setProposals(p => p.filter(x => x.id !== id)) }
    catch { /* 拦截器已 toast */ } finally { setBusyId(null) }
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
              {proposals.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={`text-[11px] px-1.5 py-0.5 rounded border ${p.change_type === 'new'
                    ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                    {p.change_type === 'new' ? '新增' : '优化'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink truncate">
                      {p.scene_code ? <span className="font-mono text-xs text-ink-secondary mr-1">{p.scene_code}</span> : null}
                      {p.name}
                    </div>
                    <div className="text-[11px] text-ink-muted truncate">
                      {p.project_name || '—'} · PM {p.pm_confirmed_by || '—'} 确认{p.summary ? ` · ${p.summary}` : ''}
                    </div>
                  </div>
                  <button onClick={() => doApprove(p.id)} disabled={busyId === p.id}
                    className="flex-shrink-0 inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                    {busyId === p.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} 通过回写
                  </button>
                  <button onClick={() => doReject(p.id)} disabled={busyId === p.id}
                    className="flex-shrink-0 inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-line text-ink-secondary hover:bg-canvas disabled:opacity-50">
                    <X size={12} /> 驳回
                  </button>
                </div>
              ))}
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
