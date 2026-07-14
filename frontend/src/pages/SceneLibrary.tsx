import { useEffect, useState } from 'react'
import { Layers, Search, History, BookOpen, GitPullRequest, Check, X, Loader2 } from 'lucide-react'
import { toast } from '../components/Toaster'
import SceneEditDrawer from '../components/SceneEditDrawer'
import {
  listSceneDomains, listScenes, listRecentSceneChanges, aiMatchScenes, batchGenSceneQuestions,
  adminListProposals, approveProposal, rejectProposal,
  type Scene, type SceneChange, type SceneDomains, type SceneProposal,
} from '../api/scenes'
import { Sparkles, MessageCircleQuestion } from 'lucide-react'

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
  const [genning, setGenning] = useState(false)
  const [loading, setLoading] = useState(false)

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

  const runGenQuestions = async () => {
    if (!confirm(`对${activeDomain ? ` ${activeDomain} 域` : '全部'}场景批量 AI 生成「关键调研问题」?只补尚无问题的场景,已有的不覆盖(可进场景手动改)。`)) return
    setGenning(true)
    try {
      const r = await batchGenSceneQuestions(activeDomain || undefined)
      toast.success(`已生成:${r.generated_scenes} 个场景 / 共 ${r.questions} 个问题${r.skipped ? `(跳过 ${r.skipped} 个已有的)` : ''}`)
      const list = await listScenes({ domain: activeDomain || undefined, q: q || undefined })
      setScenes(list)
    } catch { /* 拦截器已 toast */ } finally { setGenning(false) }
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
            <button onClick={runGenQuestions} disabled={genning || matching}
              className="ml-auto inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium border border-[#F3D6B0] bg-brand-light text-[#D96400] disabled:opacity-60"
              title={`对${activeDomain || '全部'}场景批量生成关键调研问题`}>
              {genning ? <Loader2 size={13} className="animate-spin" /> : <MessageCircleQuestion size={13} />}
              AI 生成调研问题{activeDomain ? `（${activeDomain}）` : ''}
            </button>
            <button onClick={runAiMatch} disabled={matching || genning}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-white font-medium disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#FF8D1A,#D96400)' }}
              title={`对${activeDomain || '全部'}场景自动匹配 AI 能力`}>
              {matching ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              AI 自动匹配{activeDomain ? `（${activeDomain}）` : ''}
            </button>
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
