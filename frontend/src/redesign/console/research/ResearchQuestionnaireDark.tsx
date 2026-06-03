/**
 * 调研问卷录入界面(MVP)— 深色版
 *
 * 顾问拿着大纲口头问客户 → 在系统勾选答案 → 自动保存
 * 当前 MVP 支持题型:single / multi / text / rating(简版)
 * 不支持:number / node_pick(下期)
 *
 * 答案持久化:每改一次 → upsertResearchResponse(debounce 600ms)
 * Scope 标签:每题右下角 ScopeBadgeEditor 可点击切换四分类
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Tag, Save, BookOpen, ChevronDown, ChevronRight,
  Pencil, Trash2, Plus, X, Sparkles, Loader2, CornerDownRight,
} from 'lucide-react'
import {
  listResearchResponses, upsertResearchResponse, classifyResearchScope,
  upsertQuestionnaireItem, deleteQuestionnaireItem, generateFollowUp,
  RESEARCH_INTERVIEW_STAGE_ORDER, RESEARCH_INTERVIEW_STAGE_LABELS,
  type CuratedBundle, type ResearchQuestionItem, type ResearchOptionItem,
  type ResearchResponseItem, type ResearchScopeLabel,
  type ResearchBestPracticeRef,
  type ResearchAudienceRole,
  type ResearchQuestionPhase,
  type ResearchInterviewStage,
  type ResearchLtcDictionaryEntry,
} from '../../../api/client'
import ExportPreMeetingButton from '../../../components/console/research/ExportPreMeetingButton'

const BEST_PRACTICE_SOURCE_LABELS: Record<string, string> = {
  industry_pack:    '行业实践包',
  kb:               '知识库',
  ltc_dictionary:   'LTC 字典',
  manual:           '人工录入',
}

type PhaseFilter = ResearchQuestionPhase | 'all'

const PHASE_TAB_META: Record<PhaseFilter, { label: string; hint: string }> = {
  all:         { label: '全部',  hint: '当前角色 / 模块的全部题目' },
  pre_meeting: { label: '会前',  hint: '会前发给客户自填 — 客观、闭合、低门槛' },
  in_meeting:  { label: '会中',  hint: '会中由 PM 主导追问 — 开放、深入、需要顾问引导' },
}

interface Props {
  bundle: CuratedBundle
  /** 分组方式 — 决定主筛选轴(role / ltc_module_key / topic_cluster / session_id) */
  groupBy: 'role' | 'ltc' | 'topic' | 'session'
  selectedRole: ResearchAudienceRole | null
  selectedLtcKey: string | null
  /** 主题模式下父传:选中的 cluster 名(null = 展示全部 cluster) */
  selectedTopic?: string | null
  /** 场次模式下父传:选中的 session_id(null = 全部,'__none__' = 未挂场次) */
  selectedSession?: string | null
  /** 大纲场次列表 */
  outlineSessions?: import('../../../api/client').OutlineSession[]
  /** 阶段筛选 — 会前 / 会中 / 全部 */
  selectedPhase: PhaseFilter
  onChangePhase: (p: PhaseFilter) => void
  /** 写操作完成后让父刷新 outputs(拉新的 questionnaire_items) */
  onRefetch?: () => void
  /** LTC 字典 — 编辑题目时让用户在合法 ltc_module_key 中选 */
  ltcModules: ResearchLtcDictionaryEntry[]
}

// 编辑态机:
//   null                                            → 闲态
//   { mode: 'edit', itemKey }                       → 替换该题为 editor
//   { mode: 'new', insertAfter: string | null }     → 在 insertAfter 这道题之后插入 editor
//                                                     ""(空字符串)= 插到最前
//                                                     null = 追加到末尾(底部按钮触发)
type EditingState =
  | null
  | { mode: 'edit'; itemKey: string }
  | { mode: 'new'; insertAfter: string | null }


export default function ResearchQuestionnaire({
  bundle, groupBy, selectedRole, selectedLtcKey, selectedTopic, selectedSession,
  outlineSessions, selectedPhase, onChangePhase,
  onRefetch, ltcModules,
}: Props) {
  const [editing, setEditing] = useState<EditingState>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedClusters, setCollapsedClusters] = useState<Set<string>>(new Set())
  // 2026-06-03 场次模式下二级 facet + 访谈剧本折叠
  const [facetRole, setFacetRole] = useState<ResearchAudienceRole | null>(null)
  const [facetCluster, setFacetCluster] = useState<string | null>(null)
  const [scriptOpen, setScriptOpen] = useState(true)
  useEffect(() => { setFacetRole(null); setFacetCluster(null); setScriptOpen(true) }, [selectedSession])
  const qc2 = useQueryClient()
  const refreshAll = () => {
    qc2.invalidateQueries({ queryKey: ['research-responses', bundle.id] })
    onRefetch?.()
  }
  const allItems: ResearchQuestionItem[] = useMemo(
    () => (bundle.questionnaire_items as ResearchQuestionItem[]) ?? [],
    [bundle.questionnaire_items]
  )

  // 主轴筛选(角色 / LTC 模块 / 主题)— 只对**主干题**(无 parent_item_key)应用过滤;
  // 子题(follow-up)永远跟着它的父题走,不参与 axis / phase 过滤,避免「父题在子题不在」的割裂体验。
  // 主题模式(2026-06-03):若 selectedTopic 为空则展开全部 cluster,否则按 cluster 过滤
  const axisItems = useMemo(() => {
    const mains = allItems.filter(it => !it.parent_item_key)
    if (groupBy === 'role') {
      if (!selectedRole) return mains
      return mains.filter(it => (it.audience_roles || []).includes(selectedRole))
    }
    if (groupBy === 'topic') {
      if (!selectedTopic) return mains
      return mains.filter(it => (it.topic_cluster || '其他') === selectedTopic)
    }
    if (groupBy === 'session') {
      let pool = mains
      if (selectedSession === '__none__') pool = pool.filter(it => !it.session_id)
      else if (selectedSession) pool = pool.filter(it => it.session_id === selectedSession)
      if (facetRole) pool = pool.filter(it => (it.audience_roles || []).includes(facetRole))
      if (facetCluster) pool = pool.filter(it => (it.topic_cluster || '其他') === facetCluster)
      return pool
    }
    if (!selectedLtcKey) return mains
    return mains.filter(it => it.ltc_module_key === selectedLtcKey)
  }, [allItems, groupBy, selectedRole, selectedLtcKey, selectedTopic, selectedSession, facetRole, facetCluster])

  // 阶段计数(只数主干题)
  const phaseCounts = useMemo(() => {
    let pre = 0, meeting = 0
    for (const q of axisItems) {
      if ((q.phase || 'in_meeting') === 'pre_meeting') pre += 1
      else meeting += 1
    }
    return { all: axisItems.length, pre_meeting: pre, in_meeting: meeting }
  }, [axisItems])

  // item_key → 它的所有 follow-up 子题(保持原顺序)
  const followUpsByParent = useMemo(() => {
    const m: Record<string, ResearchQuestionItem[]> = {}
    for (const it of allItems) {
      const p = it.parent_item_key
      if (!p) continue
      if (!m[p]) m[p] = []
      m[p].push(it)
    }
    return m
  }, [allItems])

  // 阶段二次筛选 + 搜索过滤 + 主题模式排序 + 挂载子题(2026-06-03):
  //   - 主干题先过 phase / 搜索关键词
  //   - 主题模式下,按 topic_cluster + interview_stage(opening→current_state→pain_point→aspiration)排
  //   - 然后每道主干题挂的所有 follow-up 子题紧跟其后插入,子题不参与 phase / 搜索过滤,父在子在
  const items = useMemo(() => {
    let mainsAfterPhase = selectedPhase === 'all'
      ? axisItems
      : axisItems.filter(it => (it.phase || 'in_meeting') === selectedPhase)

    const q = searchQuery.trim().toLowerCase()
    if (q) {
      mainsAfterPhase = mainsAfterPhase.filter(it => {
        const hay = `${it.question || ''} ${it.why || ''} ${it.topic_cluster || ''}`.toLowerCase()
        return hay.includes(q)
      })
    }

    if (groupBy === 'topic' || groupBy === 'session') {
      const stageOrder: Record<string, number> = {}
      RESEARCH_INTERVIEW_STAGE_ORDER.forEach((s, i) => { stageOrder[s] = i })
      mainsAfterPhase = [...mainsAfterPhase].sort((a, b) => {
        if (groupBy === 'topic') {
          const ca = a.topic_cluster || '其他'
          const cb = b.topic_cluster || '其他'
          if (ca !== cb) return ca.localeCompare(cb, 'zh')
        }
        const sa = stageOrder[a.interview_stage || 'current_state'] ?? 1
        const sb = stageOrder[b.interview_stage || 'current_state'] ?? 1
        return sa - sb
      })
    }

    const result: ResearchQuestionItem[] = []
    for (const it of mainsAfterPhase) {
      result.push(it)
      const followUps = followUpsByParent[it.item_key] || []
      for (const fu of followUps) result.push(fu)
    }
    return result
  }, [axisItems, selectedPhase, searchQuery, groupBy, followUpsByParent])

  // 每个 item_key 已挂的追问计数(全局,不受当前筛选影响)
  const followUpCount = useMemo(() => {
    const m: Record<string, number> = {}
    for (const it of allItems) {
      const p = it.parent_item_key
      if (p) m[p] = (m[p] || 0) + 1
    }
    return m
  }, [allItems])

  const qc = useQueryClient()
  const { data: responses } = useQuery({
    queryKey: ['research-responses', bundle.id],
    queryFn: () => listResearchResponses(bundle.id),
    enabled: !!bundle.id,
  })

  // item_key → response 索引
  const responseByKey = useMemo(() => {
    const m: Record<string, ResearchResponseItem> = {}
    for (const r of (responses?.items ?? [])) m[r.item_key] = r
    return m
  }, [responses])

  const classifyMut = useMutation({
    mutationFn: () => classifyResearchScope({
      bundle_id: bundle.id,
      ltc_module_key: selectedLtcKey,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['research-responses', bundle.id] }),
  })

  if (allItems.length === 0) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="rounded border border-[rgba(245,158,11,0.28)] bg-[rgba(245,158,11,0.14)] p-4 text-xs text-[#FBBF24]">
          ⚠️ 当前 bundle 没有结构化题目数据(<code>extra.questionnaire_items</code> 为空)。
          可能 LLM 输出格式异常,建议重新生成。
        </div>
      </div>
    )
  }

  // 2026-06-03 场次模式 facet 可选值 + 当前 session 对象
  const sessionRawItems = useMemo(() => {
    if (groupBy !== 'session') return [] as ResearchQuestionItem[]
    const mains = allItems.filter(it => !it.parent_item_key)
    if (!selectedSession) return mains
    if (selectedSession === '__none__') return mains.filter(it => !it.session_id)
    return mains.filter(it => it.session_id === selectedSession)
  }, [allItems, groupBy, selectedSession])
  const sessionAvailableRoles = useMemo(() => {
    const s = new Set<ResearchAudienceRole>()
    for (const it of sessionRawItems) for (const r of (it.audience_roles || [])) s.add(r as ResearchAudienceRole)
    const order: ResearchAudienceRole[] = ['executive', 'dept_head', 'frontline', 'it']
    return order.filter(r => s.has(r))
  }, [sessionRawItems])
  const sessionAvailableClusters = useMemo(() => {
    const m: Record<string, number> = {}
    for (const it of sessionRawItems) {
      const c = (it.topic_cluster || '其他').trim()
      m[c] = (m[c] || 0) + 1
    }
    return Object.entries(m).map(([cluster, count]) => ({ cluster, count })).sort((a, b) => b.count - a.count)
  }, [sessionRawItems])
  const currentSession = useMemo(() => {
    if (groupBy !== 'session' || !selectedSession || selectedSession === '__none__') return undefined
    return (outlineSessions || []).find(s => s.session_id === selectedSession)
  }, [groupBy, selectedSession, outlineSessions])

  const sessionLabel = useMemo(() => {
    if (!selectedSession) return '场次 · 全部'
    if (selectedSession === '__none__') return '场次 · 未挂场次'
    const s = (outlineSessions || []).find(x => x.session_id === selectedSession)
    if (!s) return `场次 · ${selectedSession}`
    return `场次 · ${s.week} ${s.time_slot} · ${s.topic_summary || s.participants}`
  }, [selectedSession, outlineSessions])

  const axisLabel = groupBy === 'role'
    ? (selectedRole ? `角色 · ${({
        executive: '高管', dept_head: '部门负责人', frontline: '一线', it: 'IT',
      } as Record<ResearchAudienceRole, string>)[selectedRole]}` : '请选择左侧角色')
    : groupBy === 'topic'
      ? (selectedTopic ? `主题 · ${selectedTopic}` : '主题 · 全部')
      : groupBy === 'session'
        ? sessionLabel
        : (selectedLtcKey ? `模块 · ${selectedLtcKey}` : '请选择左侧模块')

  // 主题模式 cluster 列表 + cluster 起点标记(2026-06-03)
  const topicGroups = useMemo(() => {
    if (groupBy !== 'topic') return [] as { cluster: string; items: ResearchQuestionItem[]; answered: number }[]
    const map: Record<string, ResearchQuestionItem[]> = {}
    for (const it of items) {
      if (it.parent_item_key) continue
      const c = it.topic_cluster || '其他'
      if (!map[c]) map[c] = []
      map[c].push(it)
    }
    return Object.entries(map).map(([cluster, list]) => ({
      cluster,
      items: list,
      answered: list.filter(it => responseByKey[it.item_key]?.answer_value != null).length,
    }))
  }, [items, groupBy, responseByKey])

  const clusterStartMarkers = useMemo(() => {
    if (groupBy !== 'topic') return {} as Record<string, { cluster: string; total: number; answered: number }>
    const out: Record<string, { cluster: string; total: number; answered: number }> = {}
    const seen = new Set<string>()
    for (const it of items) {
      if (it.parent_item_key) continue
      const c = it.topic_cluster || '其他'
      if (seen.has(c)) continue
      seen.add(c)
      const g = topicGroups.find(g => g.cluster === c)
      out[it.item_key] = { cluster: c, total: g?.items.length || 0, answered: g?.answered || 0 }
    }
    return out
  }, [items, groupBy, topicGroups])

  const answeredN = items.filter(it => responseByKey[it.item_key]?.answer_value != null).length

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-3">
      {/* 工具栏 */}
      <div className="flex items-center gap-3 sticky top-0 bg-transparent z-10 py-2 -mt-2 border-b border-[rgba(255,255,255,0.10)]">
        <div className="text-sm font-semibold text-white">
          调研问卷 · {axisLabel}
        </div>
        <div className="text-xs text-[rgba(255,255,255,0.55)]">
          已答 {answeredN} / {items.length}
        </div>
        <div className="flex-1" />
        {/* 会前问卷按角色导出 — 任何 phase 视图下都可用,因为导出固定只取 pre_meeting */}
        <ExportPreMeetingButton bundleId={bundle.id} compact />
        <button
          disabled={answeredN === 0 || classifyMut.isPending}
          onClick={() => classifyMut.mutate()}
          className="text-xs px-2.5 py-1 rounded border border-[rgba(255,255,255,0.10)] text-[rgba(255,255,255,0.78)] hover:bg-[rgba(255,255,255,0.04)] disabled:opacity-50"
          title="基于已答内容,LLM 自动给每题打范围四分类(顾问可手改)"
        >
          {classifyMut.isPending ? 'AI 分类中...' : '触发 AI 范围分类'}
        </button>
      </div>

      {/* 2026-06-03 场次模式访谈剧本卡片 */}
      {groupBy === 'session' && currentSession && (currentSession.interview_script || currentSession.participants) && (
        <div className="rounded px-3 py-2" style={{
          border: '1px solid rgba(255,141,26,0.32)',
          background: 'rgba(255,141,26,0.10)',
        }}>
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setScriptOpen(o => !o)}>
            {scriptOpen ? <ChevronDown size={12} className="text-[#FFB066]" /> : <ChevronRight size={12} className="text-[#FFB066]" />}
            <span className="text-xs font-semibold text-[#FFB066]">访谈剧本</span>
            <span className="text-[11px] text-[rgba(255,255,255,0.55)]">
              {currentSession.week} {currentSession.time_slot} · {currentSession.session_type}
              {currentSession.duration_minutes ? ` · ${currentSession.duration_minutes}min` : ''}
              {currentSession.participants ? ` · ${currentSession.participants}` : ''}
            </span>
          </div>
          {scriptOpen && currentSession.interview_script && (
            <div className="mt-2 text-xs leading-relaxed whitespace-pre-wrap pl-5" style={{ color: 'var(--rd-text)' }}>
              {currentSession.interview_script}
            </div>
          )}
        </div>
      )}

      {/* 2026-06-03 场次模式二级 facet */}
      {groupBy === 'session' && selectedSession && selectedSession !== '__none__' && (sessionAvailableRoles.length > 0 || sessionAvailableClusters.length > 1) && (
        <div className="flex flex-col gap-1.5 px-1">
          {sessionAvailableRoles.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[11px] mr-1" style={{ color: 'var(--rd-text-2)' }}>角色:</span>
              <button onClick={() => setFacetRole(null)}
                className={`text-[11px] px-2 py-0.5 rounded transition`}
                style={!facetRole
                  ? { background: 'rgba(255,141,26,0.16)', color: '#FFB066', border: '1px solid rgba(255,141,26,0.32)' }
                  : { background: 'rgba(255,255,255,0.05)', color: 'var(--rd-text-2)', border: '1px solid transparent' }}
              >全部</button>
              {sessionAvailableRoles.map((r: ResearchAudienceRole) => {
                const active = r === facetRole
                const label = ({ executive: '高管', dept_head: '部门负责人', frontline: '一线', it: 'IT' } as Record<ResearchAudienceRole, string>)[r]
                return (
                  <button key={r} onClick={() => setFacetRole(active ? null : r)}
                    className="text-[11px] px-2 py-0.5 rounded transition"
                    style={active
                      ? { background: 'rgba(255,141,26,0.16)', color: '#FFB066', border: '1px solid rgba(255,141,26,0.32)' }
                      : { background: 'rgba(255,255,255,0.05)', color: 'var(--rd-text-2)', border: '1px solid transparent' }}
                  >{label}</button>
                )
              })}
            </div>
          )}
          {sessionAvailableClusters.length > 1 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[11px] mr-1" style={{ color: 'var(--rd-text-2)' }}>主题:</span>
              <button onClick={() => setFacetCluster(null)}
                className="text-[11px] px-2 py-0.5 rounded transition"
                style={!facetCluster
                  ? { background: 'rgba(255,141,26,0.16)', color: '#FFB066', border: '1px solid rgba(255,141,26,0.32)' }
                  : { background: 'rgba(255,255,255,0.05)', color: 'var(--rd-text-2)', border: '1px solid transparent' }}
              >全部</button>
              {sessionAvailableClusters.map(({ cluster, count }) => {
                const active = cluster === facetCluster
                return (
                  <button key={cluster} onClick={() => setFacetCluster(active ? null : cluster)}
                    className="text-[11px] px-2 py-0.5 rounded transition"
                    style={active
                      ? { background: 'rgba(255,141,26,0.16)', color: '#FFB066', border: '1px solid rgba(255,141,26,0.32)' }
                      : { background: 'rgba(255,255,255,0.05)', color: 'var(--rd-text-2)', border: '1px solid transparent' }}
                  >{cluster} <span className="text-[10px]" style={{ color: 'var(--rd-text-3)' }}>{count}</span></button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* 顶部搜索框(2026-06-03) */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索题目(题干 / 为什么问 / 主题)…"
          className="flex-1 max-w-md px-2.5 py-1 text-xs bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.12)] rounded text-white placeholder-[rgba(255,255,255,0.45)] focus:outline-none focus:border-[#FB923C]"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="text-xs text-[rgba(255,255,255,0.55)] hover:text-white"
            title="清空搜索"
          >
            <X size={12} />
          </button>
        )}
        {searchQuery && (
          <span className="text-[10px] text-[rgba(255,255,255,0.55)]">
            匹配 {items.filter(it => !it.parent_item_key).length} / {axisItems.length} 主干题
          </span>
        )}
      </div>

      {/* 阶段筛选(会前 / 会中 / 全部) */}
      <div className="flex items-center gap-1 bg-[rgba(255,255,255,0.04)] p-0.5 rounded w-fit">
        {(['all', 'pre_meeting', 'in_meeting'] as const).map(p => {
          const meta = PHASE_TAB_META[p]
          const count = p === 'all' ? phaseCounts.all : (p === 'pre_meeting' ? phaseCounts.pre_meeting : phaseCounts.in_meeting)
          const active = selectedPhase === p
          return (
            <button
              key={p}
              onClick={() => onChangePhase(p)}
              title={meta.hint}
              className={`px-2.5 py-1 text-[11px] rounded transition flex items-center gap-1 ${
                active
                  ? p === 'pre_meeting'
                    ? 'bg-transparent text-[#60A5FA] ring-1 ring-[rgba(96,165,250,0.28)] shadow-sm'
                    : p === 'in_meeting'
                      ? 'bg-transparent text-[#34D399] ring-1 ring-[rgba(52,211,153,0.28)] shadow-sm'
                      : 'bg-transparent text-white ring-1 ring-[rgba(255,255,255,0.10)] shadow-sm'
                  : 'text-[rgba(255,255,255,0.78)] hover:text-white'
              }`}
            >
              <span>{meta.label}</span>
              <span className={`text-[10px] px-1 rounded ${active ? 'bg-[rgba(255,255,255,0.07)] text-[rgba(255,255,255,0.55)]' : 'text-[rgba(255,255,255,0.55)]'}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {classifyMut.isError && (
        <div className="text-xs text-[#FB7185]">分类失败:{(classifyMut.error as any)?.message}</div>
      )}
      {classifyMut.isSuccess && classifyMut.data && (
        <div className="text-xs text-[#34D399]">
          AI 已给 {classifyMut.data.items.length} 题打标(跳过 {classifyMut.data.skipped} 题未答)
        </div>
      )}

      {/* 题目列表 */}
      {items.length === 0 && (!editing || editing.mode !== 'new') ? (
        <div className="text-sm text-[rgba(255,255,255,0.55)] text-center py-12">
          {axisItems.length === 0
            ? '当前轴下没有匹配的题目。试试切换左栏其他角色 / 模块。'
            : `当前「${PHASE_TAB_META[selectedPhase].label}」筛选下没有题目。试试切「全部」或另一个阶段。`}
        </div>
      ) : (
        <QuestionsList
          items={items}
          bundle={bundle}
          ltcModules={ltcModules}
          editing={editing}
          setEditing={setEditing}
          responseByKey={responseByKey}
          followUpCount={followUpCount}
          refreshAll={refreshAll}
          clusterStartMarkers={clusterStartMarkers}
          collapsedClusters={collapsedClusters}
          onToggleCluster={(c) => setCollapsedClusters(prev => {
            const next = new Set(prev)
            if (next.has(c)) next.delete(c); else next.add(c)
            return next
          })}
          editorDefaults={{
            ltc_module_key: groupBy === 'ltc' && selectedLtcKey
              ? selectedLtcKey
              : (axisItems[0]?.ltc_module_key || ltcModules[0]?.key || ''),
            audience_roles: groupBy === 'role' && selectedRole ? [selectedRole] : ['dept_head'],
            phase: selectedPhase === 'pre_meeting' ? 'pre_meeting' : 'in_meeting',
          }}
        />
      )}

      {(!editing || editing.mode !== 'new') && items.length > 0 && (
        <button
          onClick={() => setEditing({ mode: 'new', insertAfter: null })}
          className="mt-3 w-full flex items-center justify-center gap-1 px-3 py-2 text-xs rounded border border-dashed border-[rgba(255,255,255,0.10)] text-[rgba(255,255,255,0.78)] hover:border-[rgba(255,141,26,0.32)] hover:text-[#FFB066] hover:bg-[rgba(255,141,26,0.14)]"
          title="在末尾追加一道题(在题间 hover 也可以「+」插入)"
        >
          <Plus size={12} /> 新增题目(末尾)
        </button>
      )}
    </div>
  )
}


// ── 题目列表(含 hover 插槽 + 编辑/新建 editor 内联展开 + 右侧题号 minimap) ──

interface EditorDefaults {
  ltc_module_key: string
  audience_roles: string[]
  phase: ResearchQuestionPhase
}

function QuestionsList({
  items, bundle, ltcModules, editing, setEditing,
  responseByKey, followUpCount, refreshAll, editorDefaults,
  clusterStartMarkers, collapsedClusters, onToggleCluster,
}: {
  items: ResearchQuestionItem[]
  bundle: CuratedBundle
  ltcModules: ResearchLtcDictionaryEntry[]
  editing: EditingState
  setEditing: (s: EditingState) => void
  responseByKey: Record<string, ResearchResponseItem>
  followUpCount: Record<string, number>
  refreshAll: () => void
  editorDefaults: EditorDefaults
  // 主题模式专用(2026-06-03)
  clusterStartMarkers?: Record<string, { cluster: string; total: number; answered: number }>
  collapsedClusters?: Set<string>
  onToggleCluster?: (cluster: string) => void
}) {
  const isNewAt = (insertAfter: string | null): boolean =>
    !!editing && editing.mode === 'new' && editing.insertAfter === insertAfter

  const renderEditor = (insertAfter: string | null) => (
    <QuestionEditor
      bundleId={bundle.id}
      ltcModules={ltcModules}
      initial={editorDefaults}
      insertAfterItemKey={insertAfter}
      onCancel={() => setEditing(null)}
      onSaved={() => { setEditing(null); refreshAll() }}
    />
  )

  return (
    <div className="flex gap-3">
      {/* 主区:题目列表 */}
      <div className="flex-1 min-w-0 space-y-3">
        {/* 顶部插槽(insertAfter = ""即插到最前) */}
        {isNewAt('') ? renderEditor('') : (
          <InsertSlot onClick={() => setEditing({ mode: 'new', insertAfter: '' })}
                      hint="在最前插入" />
        )}
        {(() => {
          const markers = clusterStartMarkers || {}
          const collapsed = collapsedClusters || new Set<string>()
          let currentCluster: string | null = null
          let currentCollapsed = false
          const out: React.ReactNode[] = []
          items.forEach((it, idx) => {
            const marker = markers[it.item_key]
            if (marker) {
              currentCluster = marker.cluster
              currentCollapsed = collapsed.has(marker.cluster)
              out.push(
                <ClusterDivider
                  key={`cluster-${marker.cluster}`}
                  cluster={marker.cluster}
                  total={marker.total}
                  answered={marker.answered}
                  collapsed={currentCollapsed}
                  onToggle={() => onToggleCluster?.(marker.cluster)}
                />
              )
            }
            if (currentCollapsed && currentCluster) return
            out.push(
              <div key={it.item_key} id={`q-${it.item_key}`} className="space-y-3 scroll-mt-20">
                {editing && editing.mode === 'edit' && editing.itemKey === it.item_key ? (
                  <QuestionEditor
                    bundleId={bundle.id}
                    ltcModules={ltcModules}
                    initial={it}
                    onCancel={() => setEditing(null)}
                    onSaved={() => { setEditing(null); refreshAll() }}
                  />
                ) : (
                  <QuestionRow
                    item={it}
                    index={idx + 1}
                    response={responseByKey[it.item_key]}
                    bundle={bundle}
                    followUpCount={followUpCount[it.item_key] || 0}
                    onEdit={() => setEditing({ mode: 'edit', itemKey: it.item_key })}
                    onDeleted={() => refreshAll()}
                    onFollowUpGenerated={() => refreshAll()}
                  />
                )}
                {/* 题后插槽 */}
                {isNewAt(it.item_key) ? renderEditor(it.item_key) : (
                  <InsertSlot onClick={() => setEditing({ mode: 'new', insertAfter: it.item_key })} />
                )}
              </div>
            )
          })
          return out
        })()}
      </div>

      {/* 右侧题号 minimap — sticky 浮在右边 */}
      <QuestionsMiniMap items={items} responseByKey={responseByKey} />
    </div>
  )
}


// ── 主题模式 cluster 分隔条(深色,2026-06-03) ───────────────────────────────
function ClusterDivider({
  cluster, total, answered, collapsed, onToggle,
}: {
  cluster: string
  total: number
  answered: number
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <div
      onClick={onToggle}
      className="flex items-center gap-2 px-3 py-2 my-2 rounded border cursor-pointer sticky top-12 z-[5]"
      style={{
        background: 'rgba(255,141,26,0.10)',
        borderColor: 'rgba(255,141,26,0.32)',
        backdropFilter: 'blur(12px)',
      }}
      title={collapsed ? '展开本主题题目' : '折叠本主题题目'}
    >
      {collapsed ? <ChevronRight size={14} className="text-[#FFB066]" /> : <ChevronDown size={14} className="text-[#FFB066]" />}
      <span className="text-sm font-semibold text-[#FFB066]">{cluster}</span>
      <span className="text-xs text-[rgba(255,255,255,0.55)]">{total} 题</span>
      <div className="flex-1" />
      <span className="text-xs text-[#34D399]">已答 {answered} / {total}</span>
    </div>
  )
}


// ── 题间 hover 插槽 ─────────────────────────────────────────────────────────

function InsertSlot({
  onClick, hint,
}: {
  onClick: () => void
  hint?: string
}) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick() }}
      className="group h-3 -my-1 flex items-center justify-center cursor-pointer relative"
      title={hint || '在此处插入新题'}
    >
      {/* 平时只占 3px 高度;hover 显示一条橙色细线 + 中央 + 按钮 */}
      <div className="w-full h-px bg-transparent group-hover:bg-[rgba(255,141,26,0.32)] transition-colors" />
      <button
        type="button"
        tabIndex={-1}
        onClick={(e) => { e.stopPropagation(); onClick() }}
        className="absolute opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-orange-600 text-white shadow"
      >
        <Plus size={10} />
        <span>{hint || '插入'}</span>
      </button>
    </div>
  )
}


// ── 题号 minimap(sticky 右侧) ───────────────────────────────────────────────

function QuestionsMiniMap({
  items, responseByKey,
}: {
  items: ResearchQuestionItem[]
  responseByKey: Record<string, ResearchResponseItem>
}) {
  // viewport 中第一道题的 item_key,用于左侧 active 高亮
  const [activeKey, setActiveKey] = useState<string | null>(null)

  useEffect(() => {
    if (items.length === 0) return
    // IntersectionObserver:任何题进入视窗 50%-上方 时记下来
    const observer = new IntersectionObserver(
      (entries) => {
        // 取最靠上的 intersecting entry
        const visible = entries
          .filter(e => e.isIntersecting)
          .map(e => ({ key: e.target.id.replace('q-', ''), top: e.boundingClientRect.top }))
          .sort((a, b) => a.top - b.top)
        if (visible.length > 0) setActiveKey(visible[0].key)
      },
      { rootMargin: '-15% 0px -55% 0px', threshold: 0 }
    )
    for (const it of items) {
      const el = document.getElementById(`q-${it.item_key}`)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [items])

  if (items.length === 0) return null

  // 已答数 / 总数(主干题)— 进度条用
  const mains = items.filter(it => !it.parent_item_key)
  const answeredMains = mains.filter(it =>
    responseByKey[it.item_key]?.answer_value != null
    && responseByKey[it.item_key]?.answer_value !== ''
  ).length
  const pct = mains.length === 0 ? 0 : Math.round(answeredMains / mains.length * 100)

  const jump = (item_key: string) => {
    const el = document.getElementById(`q-${item_key}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <aside className="hidden lg:block w-[140px] flex-shrink-0">
      <div className="sticky top-2 max-h-[calc(100vh-120px)] overflow-y-auto py-1 pr-1">
        {/* 顶栏:进度 */}
        <div className="px-2 py-1.5 mb-1">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-[10px] text-[rgba(255,255,255,0.55)] font-medium tracking-wide">本卷进度</span>
            <span className="text-[10px] tabular-nums text-[rgba(255,255,255,0.78)]">{answeredMains}/{mains.length}</span>
          </div>
          <div className="h-1 rounded-full bg-[rgba(255,255,255,0.07)] overflow-hidden">
            <div className="h-full bg-orange-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* 题号大纲 */}
        <div className="space-y-px">
          {items.map((it, idx) => {
            const answered = responseByKey[it.item_key]?.answer_value != null
                          && responseByKey[it.item_key]?.answer_value !== ''
            const isFollowUp = !!it.parent_item_key
            const phase = it.phase || 'in_meeting'
            const isActive = activeKey === it.item_key

            const phaseColor = phase === 'pre_meeting' ? 'bg-blue-400' : 'bg-emerald-400'

            return (
              <button
                key={it.item_key}
                onClick={() => jump(it.item_key)}
                title={`#${idx + 1} · ${phase === 'pre_meeting' ? '会前' : '会中'} · ${answered ? '已答' : '未答'}\n${it.question}`}
                className={`
                  w-full flex items-center gap-1.5 pr-2 py-[3px] rounded-r text-left transition-colors
                  border-l-2
                  ${isActive
                    ? 'bg-[rgba(255,141,26,0.14)] border-orange-500'
                    : 'border-transparent hover:bg-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.14)]'}
                  ${isFollowUp ? 'pl-5' : 'pl-2'}
                `}
              >
                {/* phase 色点 */}
                <span className={`shrink-0 w-1 h-1 rounded-full ${phaseColor} ${
                  answered ? '' : 'opacity-40'
                }`} />

                {/* 题号(follow-up 用「└ 追问」) */}
                <span className={`flex-1 text-[10.5px] tabular-nums truncate ${
                  isActive ? 'text-[#FFB066] font-semibold' :
                  answered ? 'text-white' : 'text-[rgba(255,255,255,0.55)]'
                }`}>
                  {isFollowUp ? <span className="opacity-60">└ 追问</span> : `${idx + 1}`}
                </span>

                {/* 已答勾(克制款 — 仅小圆点填充) */}
                {answered && !isFollowUp && (
                  <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${
                    phase === 'pre_meeting' ? 'bg-blue-500' : 'bg-emerald-500'
                  }`} />
                )}
              </button>
            )
          })}
        </div>

        {/* 图例(底部克制说明) */}
        <div className="mt-3 px-2 pt-2 border-t border-[rgba(255,255,255,0.10)] space-y-0.5 text-[9.5px] text-[rgba(255,255,255,0.55)]">
          <div className="flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-blue-400" />
            <span>会前</span>
            <span className="w-1 h-1 rounded-full bg-emerald-400 ml-2" />
            <span>会中</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            <span>已答</span>
          </div>
        </div>
      </div>
    </aside>
  )
}

// ── 单题渲染 ─────────────────────────────────────────────────────────────────

function QuestionRow({
  item, index, response, bundle, followUpCount, onEdit, onDeleted, onFollowUpGenerated,
}: {
  item: ResearchQuestionItem
  index: number
  response: ResearchResponseItem | undefined
  bundle: CuratedBundle
  followUpCount?: number
  onEdit?: () => void
  onDeleted?: () => void
  onFollowUpGenerated?: () => void
}) {
  const qc = useQueryClient()
  const upsert = useMutation({
    mutationFn: (body: Parameters<typeof upsertResearchResponse>[0]) => upsertResearchResponse(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['research-responses', bundle.id] }),
  })

  const delMut = useMutation({
    mutationFn: () => deleteQuestionnaireItem(bundle.id, item.item_key),
    onSuccess: () => onDeleted?.(),
  })

  const followUpMut = useMutation({
    mutationFn: () => generateFollowUp({
      bundle_id: bundle.id,
      parent_item_key: item.item_key,
      answer_value: response?.answer_value,
    }),
    onSuccess: (data) => {
      if (data.items.length > 0) {
        onFollowUpGenerated?.()
      }
    },
  })

  const handleDelete = () => {
    const tail = item.source === 'ai' ? '\n(AI 自动生成,删除后下次重新生成可能再次出现。)' : ''
    if (window.confirm(`确认删除该题?\n「${item.question}」${tail}`)) {
      delMut.mutate()
    }
  }

  const isFollowUp = !!item.parent_item_key
  const isAnswered = response?.answer_value != null && response.answer_value !== ''
  const canFollowUp = !isFollowUp && isAnswered && (followUpCount || 0) === 0

  const save = (answer_value: any, scope_label?: ResearchScopeLabel | null) => {
    upsert.mutate({
      bundle_id: bundle.id,
      project_id: bundle.project_id ?? null,
      item_key: item.item_key,
      answer_value,
      ...(scope_label !== undefined ? { scope_label, scope_label_source: 'manual' } : {}),
    })
  }

  return (
    <div
      className={`rounded-lg border p-3.5 space-y-2.5 ${
        isFollowUp
          ? 'ml-6 border-[rgba(52,211,153,0.28)] bg-[rgba(52,211,153,0.14)] border-l-4 border-l-emerald-400'
          : 'border-[rgba(255,255,255,0.10)] bg-transparent'
      }`}
    >
      {/* 题干 */}
      <div className="flex items-start gap-2">
        {isFollowUp ? (
          <span
            className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-[#34D399] bg-[rgba(52,211,153,0.22)]"
            title="动态追问 — 由 LLM 根据父题答案生成"
          >
            <CornerDownRight size={11} />
          </span>
        ) : (
          <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-[10px] bg-[rgba(255,255,255,0.07)] text-[rgba(255,255,255,0.55)]">
            {index}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-white leading-relaxed">
            {item.question}
            {item.required && <span className="text-red-500 ml-1">*</span>}
          </div>
          {item.why && (
            <div className="text-[11px] text-[rgba(255,255,255,0.55)] mt-0.5">为什么问:{item.why}</div>
          )}
          {item.hint && (
            <div className="text-[11px] text-[#FFB066] mt-0.5">{item.hint}</div>
          )}
        </div>
        {item.phase && (
          <span
            className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ring-1 ${
              item.phase === 'pre_meeting'
                ? 'bg-[rgba(96,165,250,0.14)] text-[#60A5FA] ring-[rgba(96,165,250,0.28)]'
                : 'bg-[rgba(52,211,153,0.14)] text-[#34D399] ring-[rgba(52,211,153,0.28)]'
            }`}
            title={item.phase === 'pre_meeting' ? '会前自填题' : '会中追问题'}
          >
            {item.phase === 'pre_meeting' ? '会前' : '会中'}
          </span>
        )}
        {/* 编辑 / 删除 */}
        {onEdit && (
          <button
            onClick={onEdit}
            className="shrink-0 p-1 rounded text-[rgba(255,255,255,0.55)] hover:text-[#FFB066] hover:bg-[rgba(255,141,26,0.14)]"
            title="编辑该题"
          >
            <Pencil size={11} />
          </button>
        )}
        {onDeleted && (
          <button
            onClick={handleDelete}
            disabled={delMut.isPending}
            className="shrink-0 p-1 rounded text-[rgba(255,255,255,0.55)] hover:text-[#FB7185] hover:bg-[rgba(244,63,94,0.14)] disabled:opacity-50"
            title="删除该题"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>

      {/* AI 实施建议折叠区:有 advice 时优先展示;否则若有旧版 refs 也兼容 */}
      {(item.best_practice_advice && item.best_practice_advice.trim()) ? (
        <BestPracticeAdviceBlock advice={item.best_practice_advice} refs={item.best_practice_refs || []} />
      ) : (item.best_practice_refs?.length ?? 0) > 0 ? (
        <BestPracticeRefsBlock refs={item.best_practice_refs!} />
      ) : null}

      {/* 输入控件(按 type 分发) */}
      <div className="pl-7">
        {item.type === 'single' && (
          <SingleInput item={item} value={response?.answer_value} onChange={save} />
        )}
        {item.type === 'multi' && (
          <MultiInput item={item} value={response?.answer_value} onChange={save} />
        )}
        {item.type === 'text' && (
          <TextInput value={response?.answer_value || ''} onSave={save} />
        )}
        {item.type === 'rating' && (
          <RatingInput item={item} value={response?.answer_value} onChange={save} />
        )}
        {item.type === 'number' && (
          <TextInput
            value={response?.answer_value != null ? String(response.answer_value) : ''}
            onSave={(v) => save(v ? Number(v) : null)}
            placeholder={item.number_unit ? `数值(${item.number_unit})` : '数值'}
          />
        )}
        {item.type === 'node_pick' && (
          <MultiInput item={item} value={response?.answer_value} onChange={save} />
        )}
      </div>

      {/* 底部:scope badge + 追问触发 — 未答 + 无追问时整行不显示,避免空白底栏 */}
      {(isAnswered || (followUpCount || 0) > 0) && (
      <div className="pl-7 pt-1 border-t border-[rgba(255,255,255,0.10)] flex items-center gap-2 flex-wrap">
        {/* scope badge 只在(已答 + 该题需要分类)时显示 — 战略 / 价值 / KPI 类题 needs_scope=false */}
        {isAnswered && item.needs_scope !== false && (
          <ScopeBadgeEditor
            value={response?.scope_label ?? null}
            source={response?.scope_label_source ?? null}
            disabled={false}
            onChange={(v) => save(response?.answer_value ?? null, v)}
          />
        )}
        {upsert.isPending && (
          <span className="text-[10px] text-[rgba(255,255,255,0.55)]">保存中…</span>
        )}
        {upsert.isSuccess && !upsert.isPending && (
          <span className="text-[10px] text-[#34D399]">已保存</span>
        )}

        <div className="flex-1" />

        {/* 已挂的追问数 */}
        {(followUpCount || 0) > 0 && (
          <span className="text-[10px] text-[#34D399] inline-flex items-center gap-0.5">
            <CornerDownRight size={10} /> {followUpCount} 道追问
          </span>
        )}

        {/* 动态追问按钮:仅父题 + 已答 + 尚无追问时展示 */}
        {canFollowUp && (
          <button
            onClick={() => followUpMut.mutate()}
            disabled={followUpMut.isPending}
            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-[rgba(52,211,153,0.28)] text-[#34D399] bg-[rgba(52,211,153,0.14)] hover:bg-[rgba(52,211,153,0.22)] disabled:opacity-50"
            title="基于客户回答,LLM 自动挖深 1-3 道追问题"
          >
            {followUpMut.isPending
              ? <Loader2 size={10} className="animate-spin" />
              : <Sparkles size={10} />}
            {followUpMut.isPending ? '生成中…' : '生成追问'}
          </button>
        )}
        {followUpMut.isSuccess && followUpMut.data?.items.length === 0 && (
          <span className="text-[10px] text-[rgba(255,255,255,0.55)]" title={followUpMut.data?.skipped_reason || ''}>
            无需追问
          </span>
        )}
        {followUpMut.isError && (
          <span className="text-[10px] text-[#FB7185]">追问生成失败</span>
        )}
      </div>
      )}
    </div>
  )
}

// ── 题目编辑器(新增 / 编辑) ─────────────────────────────────────────────────

const AUDIENCE_ROLES_FOR_EDITOR: { value: ResearchAudienceRole; label: string }[] = [
  { value: 'executive', label: '高管' },
  { value: 'dept_head', label: '部门负责人' },
  { value: 'frontline', label: '一线' },
  { value: 'it',        label: 'IT' },
]

const QUESTION_TYPES_FOR_EDITOR: { value: ResearchQuestionItem['type']; label: string }[] = [
  { value: 'single', label: '单选' },
  { value: 'multi',  label: '多选' },
  { value: 'rating', label: '分级量表' },
  { value: 'number', label: '数值' },
  { value: 'text',   label: '短文本' },
  { value: 'node_pick', label: '节点勾选' },
]

interface EditorInitial extends Partial<ResearchQuestionItem> {
  ltc_module_key: string
  audience_roles: string[]
}

function QuestionEditor({
  bundleId, ltcModules, initial, onCancel, onSaved, insertAfterItemKey,
}: {
  bundleId: string
  ltcModules: ResearchLtcDictionaryEntry[]
  initial: EditorInitial
  onCancel: () => void
  onSaved: () => void
  /** 仅新建态生效:把新题插入到该 item_key 后面;""=插到最前;null/undef=追加末尾 */
  insertAfterItemKey?: string | null
}) {
  const isEdit = !!initial.item_key
  const [question, setQuestion] = useState(initial.question || '')
  const [why, setWhy] = useState(initial.why || '')
  const [hint, setHint] = useState(initial.hint || '')
  const [type, setType] = useState<ResearchQuestionItem['type']>(initial.type || 'single')
  const [ltcKey, setLtcKey] = useState(initial.ltc_module_key)
  const [phase, setPhase] = useState<ResearchQuestionPhase>(initial.phase || 'in_meeting')
  const [required, setRequired] = useState(!!initial.required)
  const [roles, setRoles] = useState<ResearchAudienceRole[]>(
    (initial.audience_roles?.filter(r => AUDIENCE_ROLES_FOR_EDITOR.some(a => a.value === r)) as ResearchAudienceRole[])
    || ['dept_head']
  )
  const [options, setOptions] = useState<ResearchOptionItem[]>(
    (initial.options || []).filter(o => !o.is_other && !o.is_not_applicable)
  )
  const [ratingScale, setRatingScale] = useState(initial.rating_scale || 5)
  const [numberUnit, setNumberUnit] = useState(initial.number_unit || '')
  const [error, setError] = useState<string | null>(null)

  const needsOptions = type === 'single' || type === 'multi' || type === 'node_pick'

  const saveMut = useMutation({
    mutationFn: () => upsertQuestionnaireItem({
      bundle_id: bundleId,
      item_key: initial.item_key ?? null,
      ltc_module_key: ltcKey,
      audience_roles: roles,
      type,
      question: question.trim(),
      why,
      hint,
      phase,
      required,
      options: needsOptions ? options : [],
      rating_scale: ratingScale,
      number_unit: numberUnit,
      best_practice_refs: initial.best_practice_refs || [],
      parent_item_key: initial.parent_item_key ?? null,
      // 仅新建生效:后端按这个 key 之后的位置插入,而不是默认追加末尾
      insert_after_item_key: initial.item_key ? null : (insertAfterItemKey ?? null),
    }),
    onSuccess: () => onSaved(),
    onError: (e: any) => setError(e?.response?.data?.detail || e?.message || '保存失败'),
  })

  const submit = () => {
    setError(null)
    if (!question.trim()) { setError('题干不能为空'); return }
    if (!ltcKey) { setError('必须指定 LTC 模块'); return }
    if (!roles.length) { setError('至少选择一个受访角色'); return }
    if (needsOptions && options.length === 0) { setError('单选/多选/节点勾选必须至少 1 个候选选项(系统会自动追加「其他/不适用」)'); return }
    saveMut.mutate()
  }

  return (
    <div className="rounded-lg border border-[rgba(255,141,26,0.32)] bg-[rgba(255,141,26,0.14)] p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-white">
          {isEdit ? '编辑题目' : '新增题目'}
        </div>
        <button onClick={onCancel} className="p-1 text-[rgba(255,255,255,0.55)] hover:text-white" title="取消">
          <X size={13} />
        </button>
      </div>

      {/* 题干 */}
      <Field label="题干" required>
        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          rows={2}
          placeholder="例:贵司目前是否有线索管理流程?"
          className="w-full px-2 py-1.5 text-xs border border-[rgba(255,255,255,0.14)] bg-[rgba(0,0,0,0.32)] text-white placeholder:text-[rgba(255,255,255,0.4)] rounded focus:border-[rgba(255,141,26,0.55)] outline-none resize-y"
        />
      </Field>

      {/* 类型 + LTC + Phase 一行 */}
      <div className="grid grid-cols-3 gap-2">
        <Field label="题型" required>
          <select
            value={type}
            onChange={e => setType(e.target.value as any)}
            className="w-full px-2 py-1.5 text-xs border border-[rgba(255,255,255,0.14)] bg-[rgba(0,0,0,0.32)] text-white rounded focus:border-[rgba(255,141,26,0.55)] outline-none"
          >
            {QUESTION_TYPES_FOR_EDITOR.map(t =>
              <option key={t.value} value={t.value}>{t.label}</option>
            )}
          </select>
        </Field>
        <Field label="LTC 模块" required>
          <select
            value={ltcKey}
            onChange={e => setLtcKey(e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-[rgba(255,255,255,0.14)] bg-[rgba(0,0,0,0.32)] text-white rounded focus:border-[rgba(255,141,26,0.55)] outline-none"
          >
            {ltcModules.map(m =>
              <option key={m.key} value={m.key}>{m.label}</option>
            )}
          </select>
        </Field>
        <Field label="调研阶段">
          <div className="flex gap-1 p-0.5 bg-[rgba(255,255,255,0.07)] rounded">
            <PhaseRadio active={phase === 'pre_meeting'} onClick={() => setPhase('pre_meeting')} label="会前" color="blue" />
            <PhaseRadio active={phase === 'in_meeting'}  onClick={() => setPhase('in_meeting')}  label="会中" color="emerald" />
          </div>
        </Field>
      </div>

      {/* 受访角色 */}
      <Field label="受访角色">
        <div className="flex gap-2 flex-wrap">
          {AUDIENCE_ROLES_FOR_EDITOR.map(r => {
            const checked = roles.includes(r.value)
            return (
              <label
                key={r.value}
                className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded border cursor-pointer ${
                  checked ? 'border-[rgba(255,141,26,0.32)] bg-[rgba(255,141,26,0.14)] text-[#FFB066]' : 'border-[rgba(255,255,255,0.10)] text-[rgba(255,255,255,0.78)] hover:bg-[rgba(255,255,255,0.04)]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    setRoles(checked ? roles.filter(x => x !== r.value) : [...roles, r.value])
                  }}
                  className="accent-orange-500"
                />
                {r.label}
              </label>
            )
          })}
        </div>
      </Field>

      {/* 选项编辑(只在 single/multi/node_pick 下显示) */}
      {needsOptions && (
        <Field label="候选选项">
          <OptionsEditor options={options} onChange={setOptions} />
          <div className="text-[10px] text-[rgba(255,255,255,0.55)] mt-1">
            「其他(请说明)」与「不适用」会自动作为兜底选项添加,无需手动加。
          </div>
        </Field>
      )}

      {type === 'rating' && (
        <Field label="量表上限">
          <input
            type="number" min={3} max={10}
            value={ratingScale}
            onChange={e => setRatingScale(parseInt(e.target.value) || 5)}
            className="w-20 px-2 py-1 text-xs border border-[rgba(255,255,255,0.14)] bg-[rgba(0,0,0,0.32)] text-white placeholder:text-[rgba(255,255,255,0.4)] rounded focus:border-[rgba(255,141,26,0.55)] outline-none"
          />
        </Field>
      )}

      {type === 'number' && (
        <Field label="单位提示">
          <input
            type="text"
            value={numberUnit}
            onChange={e => setNumberUnit(e.target.value)}
            placeholder="例:天 / 万元 / %"
            className="w-32 px-2 py-1 text-xs border border-[rgba(255,255,255,0.14)] bg-[rgba(0,0,0,0.32)] text-white placeholder:text-[rgba(255,255,255,0.4)] rounded focus:border-[rgba(255,141,26,0.55)] outline-none"
          />
        </Field>
      )}

      {/* why + hint */}
      <div className="grid grid-cols-2 gap-2">
        <Field label="为什么问(给顾问看)">
          <input
            type="text" value={why} onChange={e => setWhy(e.target.value)}
            placeholder="影响哪个 CRM 决策"
            className="w-full px-2 py-1 text-xs border border-[rgba(255,255,255,0.14)] bg-[rgba(0,0,0,0.32)] text-white placeholder:text-[rgba(255,255,255,0.4)] rounded focus:border-[rgba(255,141,26,0.55)] outline-none"
          />
        </Field>
        <Field label="答题提示(显示给客户)">
          <input
            type="text" value={hint} onChange={e => setHint(e.target.value)}
            placeholder="补充说明"
            className="w-full px-2 py-1 text-xs border border-[rgba(255,255,255,0.14)] bg-[rgba(0,0,0,0.32)] text-white placeholder:text-[rgba(255,255,255,0.4)] rounded focus:border-[rgba(255,141,26,0.55)] outline-none"
          />
        </Field>
      </div>

      <label className="flex items-center gap-1.5 text-xs text-[rgba(255,255,255,0.78)] cursor-pointer">
        <input
          type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)}
          className="accent-orange-500"
        />
        必答题
      </label>

      {error && (
        <div className="text-xs text-[#FB7185] bg-[rgba(244,63,94,0.14)] px-2 py-1 rounded">{error}</div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={saveMut.isPending}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50"
        >
          <Save size={11} />
          {saveMut.isPending ? '保存中…' : (isEdit ? '保存修改' : '新增题目')}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs rounded border border-[rgba(255,255,255,0.10)] text-[rgba(255,255,255,0.78)] hover:bg-[rgba(255,255,255,0.04)]"
        >
          取消
        </button>
      </div>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-[rgba(255,255,255,0.78)] mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </div>
      {children}
    </div>
  )
}

function PhaseRadio({
  active, onClick, label, color,
}: {
  active: boolean
  onClick: () => void
  label: string
  color: 'blue' | 'emerald'
}) {
  const cls = active
    ? color === 'blue'
      ? 'bg-transparent text-[#60A5FA] ring-1 ring-[rgba(96,165,250,0.28)] shadow-sm'
      : 'bg-transparent text-[#34D399] ring-1 ring-[rgba(52,211,153,0.28)] shadow-sm'
    : 'text-[rgba(255,255,255,0.78)] hover:text-white'
  return (
    <button onClick={onClick} className={`flex-1 px-2 py-1 text-[11px] rounded transition ${cls}`}>
      {label}
    </button>
  )
}

function OptionsEditor({
  options, onChange,
}: {
  options: ResearchOptionItem[]
  onChange: (next: ResearchOptionItem[]) => void
}) {
  const update = (idx: number, patch: Partial<ResearchOptionItem>) => {
    onChange(options.map((o, i) => i === idx ? { ...o, ...patch } : o))
  }
  const remove = (idx: number) => onChange(options.filter((_, i) => i !== idx))
  const add = () => onChange([...options, { value: `opt_${options.length + 1}`, label: '' }])

  return (
    <div className="space-y-1">
      {options.map((o, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="text-[10px] text-[rgba(255,255,255,0.55)] w-5">{i + 1}.</span>
          <input
            type="text"
            value={o.label}
            onChange={e => update(i, { label: e.target.value })}
            placeholder="选项中文文案"
            className="flex-1 px-2 py-1 text-xs border border-[rgba(255,255,255,0.14)] bg-[rgba(0,0,0,0.32)] text-white placeholder:text-[rgba(255,255,255,0.4)] rounded focus:border-[rgba(255,141,26,0.55)] outline-none"
          />
          <input
            type="text"
            value={o.value}
            onChange={e => update(i, { value: e.target.value })}
            placeholder="value (英文小写)"
            className="w-32 px-2 py-1 text-[11px] text-[rgba(255,255,255,0.55)] border border-[rgba(255,255,255,0.14)] bg-[rgba(0,0,0,0.32)] placeholder:text-[rgba(255,255,255,0.4)] rounded focus:border-[rgba(255,141,26,0.55)] outline-none"
          />
          <button
            onClick={() => remove(i)}
            className="p-1 text-[rgba(255,255,255,0.55)] hover:text-[#FB7185]"
            title="删除"
          >
            <Trash2 size={11} />
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="text-[11px] text-[#FFB066] hover:text-[#FFB066] flex items-center gap-1"
      >
        <Plus size={11} /> 新增选项
      </button>
    </div>
  )
}

// ── AI 实施建议折叠区(新版,主路径) ──────────────────────────────────────────

function BestPracticeAdviceBlock({
  advice, refs,
}: {
  advice: string
  refs: ResearchBestPracticeRef[]
}) {
  const [open, setOpen] = useState(false)
  const [refsOpen, setRefsOpen] = useState(false)

  return (
    <div className="pl-7">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] rounded text-[#34D399] bg-[rgba(52,211,153,0.14)] hover:bg-[rgba(52,211,153,0.14)] transition-colors"
        title="基于跨项目实施最佳实践库,AI 针对本题给出的建议"
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <BookOpen size={11} />
        <span className="font-medium">AI 实施建议</span>
      </button>
      {open && (
        <div className="mt-1.5 ml-3 pl-3 border-l-2 border-[rgba(52,211,153,0.28)]">
          {/* advice 文本主体:支持 markdown 风格的换行 / 列表(简单实现:按段拆) */}
          <div className="text-[12px] text-white leading-relaxed whitespace-pre-wrap">
            {advice}
          </div>
          {/* 来源脚注 */}
          {refs.length > 0 && (
            <div className="mt-2 pt-1.5 border-t border-[rgba(52,211,153,0.28)]">
              <button
                onClick={() => setRefsOpen(o => !o)}
                className="text-[10px] text-[#34D399] hover:text-[#6EE7B7] inline-flex items-center gap-0.5"
              >
                {refsOpen ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
                参考来源 · {refs.length} 条
              </button>
              {refsOpen && (
                <div className="mt-1 space-y-0.5">
                  {refs.map((r, i) => (
                    <div key={i} className="text-[10.5px] text-[rgba(255,255,255,0.55)]">
                      · <span className="text-[rgba(255,255,255,0.78)]">{r.title}</span>
                      {r.source_id && <span className="text-[10px] ml-1 opacity-70">({r.source_id})</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// ── 最佳实践参考折叠区(旧版,advice 为空时回落) ──────────────────────────────

function BestPracticeRefsBlock({ refs }: { refs: ResearchBestPracticeRef[] }) {
  const [open, setOpen] = useState(false)
  const n = refs.length
  return (
    <div className="pl-7">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] rounded text-[#34D399] bg-[rgba(52,211,153,0.14)] hover:bg-[rgba(52,211,153,0.14)] transition-colors"
        title="展开参考的行业最佳实践,辅助顾问提问"
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <BookOpen size={11} />
        <span className="font-medium">最佳实践参考</span>
        <span className="text-[10px] text-[#34D399]">{n} 条</span>
      </button>
      {open && (
        <div className="mt-1.5 ml-3 pl-2.5 border-l-2 border-[rgba(52,211,153,0.28)] space-y-1.5">
          {refs.map((r, i) => (
            <BestPracticeRefItem key={i} item={r} />
          ))}
        </div>
      )}
    </div>
  )
}

function BestPracticeRefItem({ item }: { item: ResearchBestPracticeRef }) {
  const sourceLabel = BEST_PRACTICE_SOURCE_LABELS[item.source ?? ''] ?? item.source ?? ''
  return (
    <div className="text-[11px] leading-relaxed">
      <div className="text-white font-medium flex items-center gap-1.5 flex-wrap">
        <span>{item.title}</span>
        {sourceLabel && (
          <span className="text-[10px] text-[#34D399] bg-transparent px-1 rounded ring-1 ring-[rgba(52,211,153,0.28)]">
            {sourceLabel}{item.source_id ? ` · ${item.source_id}` : ''}
          </span>
        )}
      </div>
      {item.summary && (
        <div className="text-[rgba(255,255,255,0.78)] mt-0.5">{item.summary}</div>
      )}
    </div>
  )
}

// ── 各题型输入控件 ────────────────────────────────────────────────────────────

function SingleInput({
  item, value, onChange,
}: {
  item: ResearchQuestionItem
  value: any
  onChange: (v: any) => void
}) {
  const isOther = typeof value === 'string' && value.startsWith('__other__:')
  const otherText = isOther ? (value as string).slice('__other__:'.length) : ''
  const [otherDraft, setOtherDraft] = useState(otherText)
  useEffect(() => { setOtherDraft(otherText) }, [otherText])

  return (
    <div className="space-y-1">
      {item.options.map(opt => {
        const isSelected = opt.is_other ? isOther : value === opt.value
        return (
          <label key={opt.value}
                 className={`flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer ${
                   isSelected ? 'bg-[rgba(255,141,26,0.14)] ring-1 ring-[rgba(255,141,26,0.28)]' : 'hover:bg-[rgba(255,255,255,0.04)]'
                 }`}>
            <input
              type="radio"
              checked={isSelected}
              onChange={() => onChange(opt.is_other ? '__other__:' : opt.value)}
              className="accent-orange-500"
            />
            <span>{opt.label}</span>
          </label>
        )
      })}
      {isOther && (
        <input
          type="text"
          value={otherDraft}
          onChange={e => setOtherDraft(e.target.value)}
          onBlur={() => onChange(`__other__:${otherDraft}`)}
          placeholder="请说明..."
          className="ml-6 w-[calc(100%-1.5rem)] mt-1 px-2 py-1 text-xs border border-[rgba(255,255,255,0.14)] bg-[rgba(0,0,0,0.32)] text-white placeholder:text-[rgba(255,255,255,0.4)] rounded focus:border-[rgba(255,141,26,0.55)] outline-none"
        />
      )}
    </div>
  )
}

function MultiInput({
  item, value, onChange,
}: {
  item: ResearchQuestionItem
  value: any
  onChange: (v: any) => void
}) {
  const arr: string[] = Array.isArray(value) ? value : []
  const toggle = (v: string) => {
    const has = arr.includes(v)
    const next = has ? arr.filter(x => x !== v) : [...arr, v]
    onChange(next)
  }
  return (
    <div className="space-y-1">
      {item.options.map(opt => {
        const isSelected = arr.includes(opt.value)
        return (
          <label key={opt.value}
                 className={`flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer ${
                   isSelected ? 'bg-[rgba(255,141,26,0.14)] ring-1 ring-[rgba(255,141,26,0.28)]' : 'hover:bg-[rgba(255,255,255,0.04)]'
                 }`}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggle(opt.value)}
              className="accent-orange-500"
            />
            <span>{opt.label}</span>
          </label>
        )
      })}
    </div>
  )
}

function TextInput({
  value, onSave, placeholder,
}: {
  value: string
  onSave: (v: string) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  return (
    <textarea
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onSave(draft) }}
      rows={2}
      placeholder={placeholder ?? '顾问速记...'}
      className="w-full px-2 py-1.5 text-xs border border-[rgba(255,255,255,0.14)] bg-[rgba(0,0,0,0.32)] text-white placeholder:text-[rgba(255,255,255,0.4)] rounded focus:border-[rgba(255,141,26,0.55)] outline-none resize-y"
    />
  )
}

function RatingInput({
  item, value, onChange,
}: {
  item: ResearchQuestionItem
  value: any
  onChange: (v: number) => void
}) {
  const max = item.rating_scale ?? 5
  const cur = typeof value === 'number' ? value : 0
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: max }).map((_, i) => {
        const n = i + 1
        return (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={`w-7 h-7 rounded text-xs ${
              n <= cur ? 'bg-orange-500 text-white' : 'bg-[rgba(255,255,255,0.07)] text-[rgba(255,255,255,0.55)] hover:bg-[rgba(255,255,255,0.10)]'
            }`}
          >{n}</button>
        )
      })}
      <span className="text-[11px] text-[rgba(255,255,255,0.55)] ml-2">{cur || '—'} / {max}</span>
    </div>
  )
}

// ── ScopeBadgeEditor ────────────────────────────────────────────────────────

const SCOPE_LABELS: Record<ResearchScopeLabel, { label: string; color: string }> = {
  new:           { label: '需新建',         color: 'bg-[rgba(96,165,250,0.14)] text-[#60A5FA] ring-[rgba(96,165,250,0.28)]' },
  digitize:      { label: '已有线下,需数字化', color: 'bg-[rgba(245,158,11,0.14)] text-[#FBBF24] ring-[rgba(245,158,11,0.28)]' },
  migrate:       { label: '已有,需搬迁',     color: 'bg-[rgba(192,132,252,0.14)] text-[#C084FC] ring-[rgba(192,132,252,0.28)]' },
  out_of_scope:  { label: '不纳入一期',       color: 'bg-[rgba(255,255,255,0.04)] text-[rgba(255,255,255,0.62)] ring-[rgba(255,255,255,0.14)]' },
}

function ScopeBadgeEditor({
  value, source, disabled, onChange,
}: {
  value: ResearchScopeLabel | null
  source: 'ai' | 'manual' | null
  disabled?: boolean
  onChange: (v: ResearchScopeLabel | null) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // 全局 mousedown 监听,点 menu 之外即关闭(取代旧 backdrop div,避免嵌套 button + 事件冒泡问题)
  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  const pick = (v: ResearchScopeLabel | null) => {
    onChange(v)
    setOpen(false)
  }

  const meta = value ? SCOPE_LABELS[value] : null

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        className={
          meta
            ? `text-[10px] px-1.5 py-0.5 rounded ring-1 ${meta.color}`
            : "text-[10px] px-1.5 py-0.5 rounded border border-dashed border-[rgba(255,255,255,0.14)] text-[rgba(255,255,255,0.55)] hover:bg-[rgba(255,255,255,0.04)] disabled:opacity-50"
        }
        title={
          disabled ? '请先答题'
            : meta ? `点击修改 · 来源:${source === 'ai' ? 'AI 自动' : '顾问手改'}`
            : '设置范围分类(新建 / 已有数字化 / 搬迁 / 不纳入一期)'
        }
      >
        <Tag size={9} className="inline mr-0.5" />
        {meta ? meta.label : '待分类'}
        {meta && (
          <span className="opacity-50 ml-1">({source === 'ai' ? 'AI' : '手'})</span>
        )}
      </button>
      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 bg-transparent border border-[rgba(255,255,255,0.10)] rounded shadow-lg py-1 min-w-[160px]">
          {(Object.entries(SCOPE_LABELS) as [ResearchScopeLabel, typeof SCOPE_LABELS[ResearchScopeLabel]][])
            .map(([k, m]) => (
              <button
                key={k}
                onClick={() => pick(k)}
                className={`w-full text-left px-2 py-1 text-[11px] hover:bg-[rgba(255,255,255,0.04)] ${
                  value === k ? 'font-semibold text-[#FFB066]' : 'text-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          {value && (
            <>
              <div className="border-t border-[rgba(255,255,255,0.10)] my-0.5" />
              <button
                onClick={() => pick(null)}
                className="w-full text-left px-2 py-1 text-[11px] text-[rgba(255,255,255,0.55)] hover:bg-[rgba(255,255,255,0.04)]"
              >
                清除分类
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
