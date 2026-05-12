/**
 * ConsoleMeetingDetail — 会议详情(多 tab)
 *
 * 6 个 tab:
 *  - overview: 元信息 + 关联项目编辑 + 主要操作
 *  - transcript: raw / polished 双栏(编辑保存)
 *  - minutes: 摘要 / 关键议题 / 决议 / 待办 / 未决(JSON 可视化)
 *  - requirements: 需求清单表格
 *  - stakeholders: 干系人列表 + 关系列表(reactflow 后续接入)
 *  - actions: 同步 KB / 飞书导出 / 多维表同步 / 单点 actions
 */
import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  ChevronLeft, Loader2, RefreshCw, Trash2, FolderKanban, CheckCircle2, AlertCircle, Mic,
  FileText, ListChecks, Users, Settings as SettingsIcon, Info, ExternalLink, Save,
  Download,
} from 'lucide-react'
import {
  getMeeting, deleteMeeting, processMeeting, patchMeeting, linkMeetingProject,
  runMeetingAction, syncMeetingToKB, syncMeetingStakeholdersToKB,
  exportMeetingToFeishu, syncMeetingRequirementsToBitable,
  listProjects, getFeishuCredentials, putFeishuCredentials, deleteFeishuCredentials,
  exportMeetingDocxUrl,
  type Meeting, type MeetingStatus, type MeetingMinutes, type MeetingRequirement,
} from '../../api/client'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'
type Tab = 'overview' | 'transcript' | 'minutes' | 'requirements' | 'stakeholders' | 'actions'

const TABS: Array<{ key: Tab; label: string; Icon: typeof Info }> = [
  { key: 'overview',     label: '概览',     Icon: Info },
  { key: 'transcript',   label: '转录',     Icon: FileText },
  { key: 'minutes',      label: '纪要',     Icon: ListChecks },
  { key: 'requirements', label: '需求清单', Icon: ListChecks },
  { key: 'stakeholders', label: '干系人',   Icon: Users },
  { key: 'actions',      label: '操作',     Icon: SettingsIcon },
]

function StatusBadge({ status }: { status: MeetingStatus }) {
  const cfg = {
    recording:  { cls: 'bg-amber-50 border-amber-200 text-amber-700',     Icon: Mic,           label: '录制中' },
    processing: { cls: 'bg-blue-50 border-blue-200 text-blue-700',         Icon: Loader2,       label: '处理中' },
    completed:  { cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', Icon: CheckCircle2, label: '已完成' },
    failed:     { cls: 'bg-rose-50 border-rose-200 text-rose-700',          Icon: AlertCircle,  label: '失败' },
  }[status]
  if (!cfg) return null
  const Icon = cfg.Icon
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${cfg.cls}`}>
      <Icon size={11} className={status === 'processing' ? 'animate-spin' : ''} />
      {cfg.label}
    </span>
  )
}

function fmt(iso: string | null | undefined) {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', { hour12: false })
}

// ── Tab: Overview ─────────────────────────────────────────────────────────

function OverviewTab({ meeting }: { meeting: Meeting }) {
  const qc = useQueryClient()
  const [projectId, setProjectId] = useState(meeting.project_id || '')
  useEffect(() => { setProjectId(meeting.project_id || '') }, [meeting.project_id])

  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => listProjects() })

  const linkMut = useMutation({
    mutationFn: () => linkMeetingProject(meeting.id, projectId || null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting', meeting.id] }),
  })

  return (
    <div className="space-y-4 max-w-2xl">
      <Field label="标题" value={meeting.title} />
      <Field label="状态">
        <div className="flex items-center gap-2">
          <StatusBadge status={meeting.status} />
          {meeting.asr_engine && (
            <span className="text-[11px] text-ink-muted">ASR: {meeting.asr_engine}</span>
          )}
        </div>
      </Field>
      <Field label="创建时间" value={fmt(meeting.created_at)} />
      {meeting.end_time && <Field label="结束时间" value={fmt(meeting.end_time)} />}

      <Field label="关联项目">
        <div className="flex items-center gap-2">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="flex-1 px-3 py-1.5 rounded-md border border-line text-sm bg-white"
          >
            <option value="">(不关联)</option>
            {(projects || []).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={() => linkMut.mutate()}
            disabled={linkMut.isPending || projectId === (meeting.project_id || '')}
            className="px-3 py-1.5 rounded-md text-sm bg-canvas hover:bg-canvas-elevated border border-line text-ink disabled:opacity-50"
          >
            {linkMut.isPending ? <Loader2 size={13} className="animate-spin" /> : '保存'}
          </button>
        </div>
      </Field>

      {(meeting.kb_doc_id || meeting.feishu_url) && (
        <Field label="已发布">
          <div className="space-y-1 text-sm">
            {meeting.kb_doc_id && (
              <div>
                <span className="text-ink-muted">KB 纪要:</span>{' '}
                <a className="text-brand hover:underline" href={meeting.kb_url || '#'} target="_blank" rel="noreferrer">
                  /documents/{meeting.kb_doc_id.slice(0, 8)}… <ExternalLink size={11} className="inline" />
                </a>
              </div>
            )}
            {meeting.stakeholder_kb_doc_id && (
              <div>
                <span className="text-ink-muted">KB 干系人:</span>{' '}
                <a className="text-brand hover:underline" href={meeting.stakeholder_kb_url || '#'} target="_blank" rel="noreferrer">
                  /documents/{meeting.stakeholder_kb_doc_id.slice(0, 8)}… <ExternalLink size={11} className="inline" />
                </a>
              </div>
            )}
            {meeting.feishu_url && (
              <div>
                <span className="text-ink-muted">飞书文档:</span>{' '}
                <a className="text-brand hover:underline" href={meeting.feishu_url} target="_blank" rel="noreferrer">
                  打开 <ExternalLink size={11} className="inline" />
                </a>
              </div>
            )}
          </div>
        </Field>
      )}
    </div>
  )
}

function Field({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 items-start">
      <div className="text-sm text-ink-muted pt-1">{label}</div>
      <div className="text-sm text-ink">{children ?? (value || <span className="text-ink-muted">-</span>)}</div>
    </div>
  )
}

// ── Tab: Transcript ──────────────────────────────────────────────────────

function TranscriptTab({ meeting }: { meeting: Meeting }) {
  const qc = useQueryClient()
  const [raw, setRaw] = useState(meeting.raw_transcript || '')
  const [polished, setPolished] = useState(meeting.polished_transcript || '')
  useEffect(() => {
    setRaw(meeting.raw_transcript || '')
    setPolished(meeting.polished_transcript || '')
  }, [meeting.id, meeting.raw_transcript, meeting.polished_transcript])

  const saveMut = useMutation({
    mutationFn: () => patchMeeting(meeting.id, { raw_transcript: raw, polished_transcript: polished }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting', meeting.id] }),
  })

  const polishMut = useMutation({
    mutationFn: () => runMeetingAction(meeting.id, 'polish'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting', meeting.id] }),
  })

  const dirty = raw !== (meeting.raw_transcript || '') || polished !== (meeting.polished_transcript || '')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-ink-muted">原始转写 + 润色版本。可手动编辑后保存,或重新触发润色。</div>
        <div className="flex gap-2">
          <button
            onClick={() => polishMut.mutate()}
            disabled={polishMut.isPending || !raw}
            className="px-3 py-1.5 rounded-md text-sm border border-line bg-canvas hover:bg-canvas-elevated disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {polishMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            重新润色
          </button>
          <button
            onClick={() => saveMut.mutate()}
            disabled={!dirty || saveMut.isPending}
            className="px-3 py-1.5 rounded-md text-sm text-white disabled:opacity-50 inline-flex items-center gap-1.5"
            style={{ background: BRAND_GRAD }}
          >
            {saveMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            保存
          </button>
        </div>
      </div>

      {/* 2026-05-12 加宽:用全宽 + 双栏 + 高 textarea(占据 viewport 65%) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="flex flex-col">
          <div className="text-xs font-medium text-ink-muted mb-1.5 flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-400" />
            原始转写(ASR 输出)
          </div>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-line text-sm font-mono leading-relaxed resize-y bg-white focus:outline-none focus:border-orange-300 focus:ring-1 focus:ring-orange-200"
            style={{ height: 'calc(100vh - 360px)', minHeight: 480 }}
          />
        </div>
        <div className="flex flex-col">
          <div className="text-xs font-medium text-ink-muted mb-1.5 flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
            润色版本
          </div>
          <textarea
            value={polished}
            onChange={(e) => setPolished(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-line text-sm leading-relaxed resize-y bg-white focus:outline-none focus:border-orange-300 focus:ring-1 focus:ring-orange-200"
            style={{ height: 'calc(100vh - 360px)', minHeight: 480 }}
          />
        </div>
      </div>
    </div>
  )
}

// ── Tab: Minutes ─────────────────────────────────────────────────────────

function MinutesTab({ meeting }: { meeting: Meeting }) {
  const qc = useQueryClient()
  const m: MeetingMinutes = meeting.meeting_minutes || {}

  const regenMut = useMutation({
    mutationFn: () => runMeetingAction(meeting.id, 'summarize'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting', meeting.id] }),
  })

  if (!meeting.meeting_minutes) {
    return (
      <div className="text-center py-12 text-ink-muted">
        <ListChecks size={28} className="mx-auto mb-2" />
        <p className="text-sm mb-3">尚未生成纪要</p>
        <button
          onClick={() => regenMut.mutate()}
          disabled={regenMut.isPending || !meeting.raw_transcript}
          className="px-4 py-1.5 rounded-md text-sm text-white inline-flex items-center gap-1.5 disabled:opacity-50"
          style={{ background: BRAND_GRAD }}
        >
          {regenMut.isPending ? <Loader2 size={13} className="animate-spin" /> : null}
          立即生成
        </button>
      </div>
    )
  }

  // 元信息字段(模板表头):优先 minutes 抽取的,缺时回退 meeting 自带
  const metaTime = m.meeting_time || (meeting.start_time
    ? new Date(meeting.start_time).toLocaleString('zh-CN', { hour12: false })
    : '')
  const metaTitle = m.meeting_title || meeting.title || '(未命名会议)'

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Top bar:操作按钮 */}
      <div className="flex justify-end gap-2">
        <a
          href={exportMeetingDocxUrl(meeting.id)}
          download
          className="px-3 py-1.5 rounded-md text-sm text-white inline-flex items-center gap-1.5 hover:opacity-90"
          style={{ background: BRAND_GRAD }}
          title="按模板生成 docx 下载"
        >
          <Download size={13} /> 导出 docx
        </a>
        <button
          onClick={() => regenMut.mutate()}
          disabled={regenMut.isPending}
          className="px-3 py-1.5 rounded-md text-sm border border-line bg-white hover:bg-canvas inline-flex items-center gap-1.5"
        >
          {regenMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          重新生成
        </button>
      </div>

      {/* 纪要主体:模板风格的表格化展示 */}
      <div className="border border-line rounded-lg overflow-hidden bg-white shadow-sm">
        {/* 标题栏 */}
        <div className="px-5 py-4 border-b-2 border-ink/10 text-center"
             style={{ background: 'linear-gradient(135deg, #FFF8F0, #FFF4E6)' }}>
          <h2 className="text-base font-bold text-ink tracking-wide">{metaTitle}</h2>
        </div>

        {/* 元信息表(2 列 × 多行) */}
        <div className="grid grid-cols-[120px_1fr_120px_1fr] text-[13px] border-b border-line">
          <MetaCell label="会议名称">{metaTitle}</MetaCell>
          <MetaCell label="召集人员">{m.organizer || '—'}</MetaCell>
          <MetaCell label="会议时间">{metaTime || '—'}</MetaCell>
          <MetaCell label="会议地点">{m.meeting_location || '—'}</MetaCell>
          <MetaCell label="会议主持">{m.meeting_host || '—'}</MetaCell>
          <MetaCell label="会议记录">{m.meeting_recorder || '—'}</MetaCell>
          <MetaCell label="会议形式" span={3}>{m.meeting_format || '—'}</MetaCell>
          <MetaCell label="参会人员" span={3}>
            {m.attendees && m.attendees.length > 0
              ? <div className="flex flex-wrap gap-1.5">
                  {m.attendees.map((a, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-[12px] text-ink">{a}</span>
                  ))}
                </div>
              : '—'}
          </MetaCell>
        </div>

        {/* 会议主题及内容 */}
        <div className="px-5 py-3 border-b border-line bg-canvas">
          <h3 className="text-sm font-bold text-ink">会议主题及内容</h3>
        </div>
        <div className="px-5 py-4 border-b border-line space-y-4 text-[13px] leading-relaxed">
          {m.summary && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-ink-muted font-medium mb-1">会议摘要</div>
              <p className="text-ink">{m.summary}</p>
            </div>
          )}
          {m.key_points && m.key_points.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-ink-muted font-medium mb-2">会议主题</div>
              <ol className="space-y-2.5 list-none">
                {m.key_points.map((kp, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-[11px] font-bold inline-flex items-center justify-center">{i + 1}</span>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-ink">{kp.topic}</div>
                      <div className="text-[12.5px] text-ink-secondary mt-0.5 whitespace-pre-wrap">{kp.content}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {m.decisions && m.decisions.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-ink-muted font-medium mb-2">决议事项</div>
              <ul className="space-y-1 text-[13px]">
                {m.decisions.map((d, i) => (
                  <li key={i} className="flex gap-2">
                    <CheckCircle2 size={14} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span className="flex-1 text-ink">
                      {d.content}
                      {d.owner && <span className="text-ink-muted text-[12px] ml-1">(负责人:{d.owner})</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 待办项 */}
        <div className="px-5 py-3 border-b border-line bg-canvas">
          <h3 className="text-sm font-bold text-ink">待办项</h3>
        </div>
        {m.action_items && m.action_items.length > 0 ? (
          <table className="w-full text-[12.5px] border-b border-line">
            <thead className="bg-slate-50/60 text-ink-muted">
              <tr>
                <Th className="w-12 text-center">序号</Th>
                <Th>事项</Th>
                <Th className="w-28">负责人</Th>
                <Th className="w-48">备注</Th>
              </tr>
            </thead>
            <tbody>
              {m.action_items.map((a, i) => (
                <tr key={i} className="border-t border-line/60 hover:bg-slate-50/30">
                  <td className="px-3 py-2 text-center text-ink-muted tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2 text-ink">{a.task}</td>
                  <td className="px-3 py-2 text-ink-secondary">{a.owner || '—'}</td>
                  <td className="px-3 py-2 text-ink-secondary">
                    {[
                      a.deadline ? `截止 ${a.deadline}` : null,
                      a.priority ? { high: '高优', medium: '中优', low: '低优' }[a.priority] : null,
                      a.remark,
                    ].filter(Boolean).join(' · ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-5 py-4 text-[12.5px] text-ink-muted text-center border-b border-line">暂无待办项</div>
        )}

        {/* 待确认项 */}
        <div className="px-5 py-3 border-b border-line bg-canvas">
          <h3 className="text-sm font-bold text-ink">待确认项</h3>
        </div>
        {m.unresolved && m.unresolved.length > 0 ? (
          <table className="w-full text-[12.5px]">
            <thead className="bg-slate-50/60 text-ink-muted">
              <tr>
                <Th className="w-12 text-center">序号</Th>
                <Th>事项</Th>
                <Th className="w-28">负责人</Th>
                <Th className="w-48">备注</Th>
              </tr>
            </thead>
            <tbody>
              {m.unresolved.map((u, i) => (
                <tr key={i} className="border-t border-line/60 hover:bg-slate-50/30">
                  <td className="px-3 py-2 text-center text-ink-muted tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2 text-ink">{u.issue}</td>
                  <td className="px-3 py-2 text-ink-secondary">{u.owner || '—'}</td>
                  <td className="px-3 py-2 text-ink-secondary">
                    {[u.reason ? `原因:${u.reason}` : null, u.remark].filter(Boolean).join(' · ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-5 py-4 text-[12.5px] text-ink-muted text-center">暂无待确认项</div>
        )}
      </div>

      <p className="text-[11px] text-ink-muted text-center">
        以上信息为本次会议沟通概要,部分细节可在后续阶段进一步细化落地。
      </p>
    </div>
  )
}

function MetaCell({ label, children, span }: { label: string; children: React.ReactNode; span?: number }) {
  return (
    <>
      <div className="px-4 py-2.5 bg-canvas/80 text-ink-muted font-medium border-r border-line text-[12px] flex items-center">
        {label}
      </div>
      <div
        className={`px-4 py-2.5 text-ink ${span && span > 1 ? `col-span-${span}` : ''} border-r border-line last:border-r-0`}
        style={span && span > 1 ? { gridColumn: `span ${span}` } : {}}
      >
        {children}
      </div>
    </>
  )
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-left font-medium text-[11px] uppercase tracking-wider ${className || ''}`}>{children}</th>
}

// ── Tab: Requirements ────────────────────────────────────────────────────

function RequirementsTab({ meeting }: { meeting: Meeting }) {
  const qc = useQueryClient()
  const reqs = meeting.requirements || []
  const [filter, setFilter] = useState<string>('all')

  const regenMut = useMutation({
    mutationFn: () => runMeetingAction(meeting.id, 'extract_requirements'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting', meeting.id] }),
  })

  const filtered = useMemo(() =>
    filter === 'all' ? reqs : reqs.filter(r => r.priority === filter),
  [reqs, filter])

  if (reqs.length === 0) {
    return (
      <div className="text-center py-12 text-ink-muted">
        <ListChecks size={28} className="mx-auto mb-2" />
        <p className="text-sm mb-3">尚未提取需求</p>
        <button
          onClick={() => regenMut.mutate()}
          disabled={regenMut.isPending || !meeting.raw_transcript}
          className="px-4 py-1.5 rounded-md text-sm text-white inline-flex items-center gap-1.5 disabled:opacity-50"
          style={{ background: BRAND_GRAD }}
        >
          {regenMut.isPending ? <Loader2 size={13} className="animate-spin" /> : null}
          立即提取
        </button>
      </div>
    )
  }

  // 按 priority 分桶统计
  const counts: Record<string, number> = { all: reqs.length, P0: 0, P1: 0, P2: 0, P3: 0 }
  for (const r of reqs) if (counts[r.priority] !== undefined) counts[r.priority]++

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Top bar:筛选 + 操作 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1.5 flex-wrap">
          {(['all', 'P0', 'P1', 'P2', 'P3'] as const).map(p => (
            <button
              key={p}
              onClick={() => setFilter(p)}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium border transition-colors ${
                filter === p ? 'border-orange-300 text-orange-700 bg-orange-50' : 'border-line text-ink-muted hover:text-ink hover:bg-canvas/60 bg-white'
              }`}
            >
              {p === 'all' ? `全部` : p} <span className="ml-0.5 tabular-nums text-ink-muted">{counts[p]}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => regenMut.mutate()}
          disabled={regenMut.isPending}
          className="px-3 py-1.5 rounded-md text-sm border border-line bg-white hover:bg-canvas inline-flex items-center gap-1.5"
        >
          {regenMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          重新提取
        </button>
      </div>

      {/* 需求清单:模板表格化 */}
      <div className="border border-line rounded-lg overflow-hidden bg-white shadow-sm">
        <div className="px-5 py-3 border-b-2 border-ink/10 text-center"
             style={{ background: 'linear-gradient(135deg, #FFF8F0, #FFF4E6)' }}>
          <h2 className="text-base font-bold text-ink tracking-wide">需求清单</h2>
          <p className="text-[11px] text-ink-muted mt-0.5">本次会议提取的 {reqs.length} 条 CRM 实施需求</p>
        </div>

        <table className="w-full text-[13px]">
          <thead className="bg-slate-50/60 text-ink-muted">
            <tr>
              <Th className="w-20 text-center">编号</Th>
              <Th className="w-28">模块</Th>
              <Th>需求描述</Th>
              <Th className="w-20 text-center">优先级</Th>
              <Th className="w-24">提出人</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r: MeetingRequirement, i) => (
              <tr key={r.id} className="border-t border-line/60 hover:bg-slate-50/30">
                <td className="px-3 py-2.5 text-center text-ink-muted font-mono text-[11px]" title={r.req_id}>{r.req_id}</td>
                <td className="px-3 py-2.5">
                  {r.module ? (
                    <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 text-[11px]">{r.module}</span>
                  ) : '—'}
                </td>
                <td className="px-3 py-2.5 text-ink leading-relaxed">
                  {r.description}
                  {r.source && (
                    <div className="text-[11px] text-ink-muted italic mt-1 pl-2 border-l-2 border-line">
                      原文:{r.source}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold ${
                    r.priority === 'P0' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                    r.priority === 'P1' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                    r.priority === 'P2' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                    'bg-gray-50 text-ink-muted border border-line'
                  }`}>{r.priority}</span>
                </td>
                <td className="px-3 py-2.5 text-ink-secondary text-[12px]">{r.speaker || '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-[12px] text-ink-muted">
                  没有匹配当前筛选条件的需求
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Tab: Stakeholders ────────────────────────────────────────────────────

function StakeholdersTab({ meeting }: { meeting: Meeting }) {
  const qc = useQueryClient()
  const smap = meeting.stakeholder_map || { stakeholders: [], relations: [] }

  const regenMut = useMutation({
    mutationFn: () => runMeetingAction(meeting.id, 'extract_stakeholders'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting', meeting.id] }),
  })

  const SIDE_LABEL: Record<string, { label: string; cls: string }> = {
    internal: { label: '我方',  cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    customer: { label: '客户',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    vendor:   { label: '合作方',cls: 'bg-purple-50 text-purple-700 border-purple-200' },
    unknown:  { label: '未知',  cls: 'bg-gray-50 text-ink-muted border-line' },
  }

  if (!smap.stakeholders || smap.stakeholders.length === 0) {
    return (
      <div className="text-center py-12 text-ink-muted">
        <Users size={28} className="mx-auto mb-2" />
        <p className="text-sm mb-3">尚未提取干系人</p>
        <button
          onClick={() => regenMut.mutate()}
          disabled={regenMut.isPending || !meeting.raw_transcript}
          className="px-4 py-1.5 rounded-md text-sm text-white inline-flex items-center gap-1.5 disabled:opacity-50"
          style={{ background: BRAND_GRAD }}
        >
          {regenMut.isPending ? <Loader2 size={13} className="animate-spin" /> : null}
          立即提取
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <p className="text-sm text-ink-muted">
          共识别 {smap.stakeholders.length} 个干系人 · {smap.relations?.length || 0} 条协作关系
        </p>
        <button
          onClick={() => regenMut.mutate()}
          disabled={regenMut.isPending}
          className="px-3 py-1.5 rounded-md text-sm border border-line bg-canvas hover:bg-canvas-elevated inline-flex items-center gap-1.5"
        >
          {regenMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          重新提取
        </button>
      </div>

      {/* Stakeholders */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {smap.stakeholders.map((s, i) => {
          const side = SIDE_LABEL[s.side || 'unknown'] || SIDE_LABEL.unknown
          return (
            <div key={i} className="rounded-lg border border-line bg-canvas-elevated p-3">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div>
                  <div className="font-semibold text-ink">{s.name}</div>
                  {s.role && <div className="text-[12px] text-ink-secondary">{s.role}</div>}
                </div>
                <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border ${side.cls}`}>{side.label}</span>
              </div>
              {s.organization && (
                <div className="text-[12px] text-ink-muted mb-1">{s.organization}</div>
              )}
              {s.aliases && s.aliases.length > 0 && (
                <div className="text-[11px] text-ink-muted mb-1">
                  别名:{s.aliases.join('、')}
                </div>
              )}
              {s.responsibilities && s.responsibilities.length > 0 && (
                <div className="text-[12px] text-ink mt-1.5">
                  <span className="text-ink-muted">职责:</span> {s.responsibilities.join('、')}
                </div>
              )}
              {s.key_points && s.key_points.length > 0 && (
                <ul className="text-[12px] text-ink mt-1.5 space-y-0.5">
                  {s.key_points.map((kp, j) => (
                    <li key={j}>· {kp}</li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      {/* Relations */}
      {smap.relations && smap.relations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink mb-2">协作关系</h3>
          <ul className="space-y-1 text-sm">
            {smap.relations.map((r, i) => (
              <li key={i} className="text-ink">
                <span className="font-medium">{r.from}</span>
                <span className="text-ink-muted mx-1.5">→</span>
                <span className="font-medium">{r.to}</span>
                {r.type && <span className="ml-2 text-[11px] text-ink-muted">{r.type}</span>}
                {r.description && <div className="text-[12px] text-ink-secondary ml-3">{r.description}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Tab: Actions ─────────────────────────────────────────────────────────

function FeishuCredsCard() {
  const qc = useQueryClient()
  const { data: status } = useQuery({ queryKey: ['feishu-creds'], queryFn: getFeishuCredentials })
  const [editing, setEditing] = useState(false)
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')

  const saveMut = useMutation({
    mutationFn: () => putFeishuCredentials({ app_id: appId.trim(), app_secret: appSecret.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feishu-creds'] })
      setEditing(false); setAppId(''); setAppSecret('')
    },
  })
  const delMut = useMutation({
    mutationFn: deleteFeishuCredentials,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feishu-creds'] }),
  })

  return (
    <div className="rounded-lg border border-line bg-canvas p-4">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <h3 className="text-sm font-semibold text-ink">飞书凭证</h3>
          <p className="text-[12px] text-ink-secondary mt-0.5">
            用于"导出飞书文档"和"同步多维表"。每个用户配置自己的飞书自建应用凭证。
            前往{' '}
            <a href="https://open.feishu.cn/app" target="_blank" rel="noreferrer" className="text-brand underline">
              飞书开放平台
            </a>
            {' '}创建自建应用拿到 App ID + Secret。
          </p>
        </div>
        {status?.configured && !editing && (
          <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0">
            已配置
          </span>
        )}
      </div>

      {!editing ? (
        <div className="flex items-center gap-2 mt-2">
          {status?.configured ? (
            <>
              <span className="text-[12px] text-ink-muted font-mono">App ID: {status.app_id}</span>
              <button onClick={() => setEditing(true)}
                className="text-[12px] px-2 py-1 rounded border border-line hover:bg-canvas-elevated">
                修改
              </button>
              <button onClick={() => { if (confirm('确认清除飞书凭证?')) delMut.mutate() }}
                className="text-[12px] px-2 py-1 rounded border border-line text-ink-muted hover:text-rose-600 hover:border-rose-200">
                清除
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)}
              className="text-sm px-3 py-1.5 rounded-md text-white"
              style={{ background: BRAND_GRAD }}>
              立即配置
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2 mt-2">
          <input
            value={appId} onChange={(e) => setAppId(e.target.value)}
            placeholder="App ID(形如 cli_xxx)"
            className="w-full px-3 py-1.5 rounded-md border border-line text-sm font-mono"
          />
          <input
            type="password"
            value={appSecret} onChange={(e) => setAppSecret(e.target.value)}
            placeholder="App Secret"
            className="w-full px-3 py-1.5 rounded-md border border-line text-sm font-mono"
          />
          <div className="flex gap-2">
            <button
              onClick={() => saveMut.mutate()}
              disabled={!appId.trim() || !appSecret.trim() || saveMut.isPending}
              className="px-3 py-1.5 rounded-md text-sm text-white disabled:opacity-50 inline-flex items-center gap-1.5"
              style={{ background: BRAND_GRAD }}
            >
              {saveMut.isPending ? <Loader2 size={13} className="animate-spin" /> : null}
              保存
            </button>
            <button
              onClick={() => { setEditing(false); setAppId(''); setAppSecret('') }}
              className="px-3 py-1.5 rounded-md text-sm border border-line text-ink hover:bg-canvas-elevated"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ActionsTab({ meeting }: { meeting: Meeting }) {
  const qc = useQueryClient()
  const [bitableToken, setBitableToken] = useState('')
  const [bitableTable, setBitableTable] = useState('')

  const { data: feishuStatus } = useQuery({
    queryKey: ['feishu-creds'],
    queryFn: getFeishuCredentials,
  })

  const syncKbMut = useMutation({
    mutationFn: () => syncMeetingToKB(meeting.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting', meeting.id] }),
  })
  const syncStakeKbMut = useMutation({
    mutationFn: () => syncMeetingStakeholdersToKB(meeting.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting', meeting.id] }),
  })
  const exportFeishuMut = useMutation({
    mutationFn: () => exportMeetingToFeishu(meeting.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting', meeting.id] }),
  })
  const syncBitableMut = useMutation({
    mutationFn: () => syncMeetingRequirementsToBitable(meeting.id, {
      bitable_app_token: bitableToken.trim(),
      table_id: bitableTable.trim(),
    }),
  })

  const feishuConfigured = feishuStatus?.configured

  return (
    <div className="space-y-6 max-w-2xl">
      <FeishuCredsCard />

      <ActionCard
        title="同步纪要到 KB"
        desc="把会议纪要作为一份 Markdown 文档写入 kb-system 知识库,关联到当前项目(若已关联)。"
        buttonText={meeting.kb_doc_id ? '重新同步(覆盖)' : '同步'}
        onClick={() => syncKbMut.mutate()}
        loading={syncKbMut.isPending}
        disabled={!meeting.meeting_minutes}
        hint={!meeting.meeting_minutes ? '需先生成纪要' : meeting.kb_doc_id ? `已同步:${meeting.kb_url}` : ''}
      />

      <ActionCard
        title="同步干系人图到 KB"
        desc="把干系人列表作为 Markdown 写入 KB,作为项目文档。"
        buttonText={meeting.stakeholder_kb_doc_id ? '重新同步' : '同步'}
        onClick={() => syncStakeKbMut.mutate()}
        loading={syncStakeKbMut.isPending}
        disabled={!meeting.stakeholder_map}
        hint={!meeting.stakeholder_map ? '需先提取干系人' : meeting.stakeholder_kb_doc_id ? `已同步` : ''}
      />

      <ActionCard
        title="导出到飞书文档"
        desc="把纪要以 docx 形式创建到你的飞书云空间。"
        buttonText="导出"
        onClick={() => exportFeishuMut.mutate()}
        loading={exportFeishuMut.isPending}
        disabled={!feishuConfigured || !meeting.meeting_minutes}
        hint={
          !feishuConfigured ? '请先在 设置 中配置飞书 App ID + Secret' :
          !meeting.meeting_minutes ? '需先生成纪要' :
          meeting.feishu_url ? `已导出:${meeting.feishu_url}` : ''
        }
      />

      <div className="rounded-lg border border-line bg-canvas-elevated p-4">
        <h3 className="text-sm font-semibold text-ink mb-1">同步需求到飞书多维表</h3>
        <p className="text-[12px] text-ink-secondary mb-3">
          请在飞书侧预先创建多维表 + 表,字段名对齐:req_id / module / description / priority / source / speaker / status
        </p>
        <div className="space-y-2">
          <input
            value={bitableToken}
            onChange={(e) => setBitableToken(e.target.value)}
            placeholder="多维表 app_token"
            className="w-full px-3 py-1.5 rounded-md border border-line text-sm font-mono"
          />
          <input
            value={bitableTable}
            onChange={(e) => setBitableTable(e.target.value)}
            placeholder="table_id"
            className="w-full px-3 py-1.5 rounded-md border border-line text-sm font-mono"
          />
          <button
            onClick={() => syncBitableMut.mutate()}
            disabled={!feishuConfigured || !bitableToken || !bitableTable || syncBitableMut.isPending || !meeting.requirements?.length}
            className="px-3 py-1.5 rounded-md text-sm text-white disabled:opacity-50 inline-flex items-center gap-1.5"
            style={{ background: BRAND_GRAD }}
          >
            {syncBitableMut.isPending ? <Loader2 size={13} className="animate-spin" /> : null}
            写入多维表
          </button>
          {syncBitableMut.data && (
            <div className="text-[12px] text-emerald-700">
              ✓ 已写入 {syncBitableMut.data.rows} 条 ·{' '}
              <a href={syncBitableMut.data.url} target="_blank" rel="noreferrer" className="underline">
                打开多维表
              </a>
            </div>
          )}
          {!feishuConfigured && (
            <p className="text-[12px] text-ink-muted">请先在 设置 中配置飞书凭证</p>
          )}
        </div>
      </div>
    </div>
  )
}

function ActionCard({ title, desc, buttonText, onClick, loading, disabled, hint }: {
  title: string; desc: string; buttonText: string; onClick: () => void
  loading: boolean; disabled: boolean; hint: string
}) {
  return (
    <div className="rounded-lg border border-line bg-canvas-elevated p-4">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <p className="text-[12px] text-ink-secondary mt-0.5">{desc}</p>
        </div>
        <button
          onClick={onClick}
          disabled={loading || disabled}
          className="shrink-0 px-3 py-1.5 rounded-md text-sm text-white disabled:opacity-40 inline-flex items-center gap-1.5"
          style={{ background: BRAND_GRAD }}
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : null}
          {buttonText}
        </button>
      </div>
      {hint && <p className="text-[11px] text-ink-muted mt-1">{hint}</p>}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────

export default function ConsoleMeetingDetail() {
  const { id } = useParams<{ id: string }>()
  const meetingId = Number(id)
  const nav = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('overview')

  const { data: meeting, isLoading, error } = useQuery({
    queryKey: ['meeting', meetingId],
    queryFn: () => getMeeting(meetingId),
    enabled: Number.isFinite(meetingId),
    refetchInterval: (qq) => {
      const m = qq.state.data as Meeting | undefined
      return m && (m.status === 'processing' || m.status === 'recording') ? 5000 : false
    },
  })

  const processMut = useMutation({
    mutationFn: () => processMeeting(meetingId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting', meetingId] }),
  })

  const delMut = useMutation({
    mutationFn: () => deleteMeeting(meetingId),
    onSuccess: () => nav('/console/meeting'),
  })

  if (!Number.isFinite(meetingId)) {
    return <div className="p-8 text-ink-muted">无效的会议 ID</div>
  }
  if (isLoading) {
    return <div className="p-8 text-ink-muted"><Loader2 size={16} className="inline animate-spin mr-2" /> 加载中…</div>
  }
  if (error || !meeting) {
    return <div className="p-8 text-rose-600">会议不存在或无权访问</div>
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-screen-2xl mx-auto px-6 py-5">
        {/* 返回列表 */}
        <button
          onClick={() => nav('/console/meeting')}
          className="inline-flex items-center gap-1 text-ink-muted hover:text-ink text-sm mb-3"
        >
          <ChevronLeft size={16} /> 返回列表
        </button>

        {/* Header 卡片 */}
        <div className="bg-white border border-line rounded-xl shadow-sm px-6 py-4 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-ink truncate">{meeting.title}</h1>
            <div className="flex items-center gap-3 mt-1 text-[12px] text-ink-muted">
              <StatusBadge status={meeting.status} />
              <span>·</span>
              <span>{fmt(meeting.created_at)}</span>
              {meeting.project_name && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <FolderKanban size={11} />
                    {meeting.project_name}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="shrink-0 flex gap-2">
            <button
              onClick={() => processMut.mutate()}
              disabled={processMut.isPending || !meeting.raw_transcript}
              className="px-3 py-1.5 rounded-md text-sm border border-line bg-white hover:bg-canvas disabled:opacity-50 inline-flex items-center gap-1.5"
              title="重新跑完整 AI pipeline"
            >
              {processMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              重新处理
            </button>
            <button
              onClick={() => {
                if (window.confirm(`确认删除「${meeting.title}」?`)) delMut.mutate()
              }}
              className="px-3 py-1.5 rounded-md text-sm border border-line text-ink-muted hover:text-rose-600 hover:border-rose-200 bg-white"
              title="删除"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Tabs(独立条,白底) */}
        <div className="mt-4 bg-white border border-line rounded-xl shadow-sm overflow-hidden">
          <div className="border-b border-line">
            <div className="flex overflow-x-auto">
              {TABS.map(t => {
                const Icon = t.Icon
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`px-5 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${
                      tab === t.key
                        ? 'border-brand text-brand bg-brand/5'
                        : 'border-transparent text-ink-muted hover:text-ink hover:bg-canvas/60'
                    }`}
                  >
                    <Icon size={14} /> {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="p-6">
            {tab === 'overview' && <OverviewTab meeting={meeting} />}
            {tab === 'transcript' && <TranscriptTab meeting={meeting} />}
            {tab === 'minutes' && <MinutesTab meeting={meeting} />}
            {tab === 'requirements' && <RequirementsTab meeting={meeting} />}
            {tab === 'stakeholders' && <StakeholdersTab meeting={meeting} />}
            {tab === 'actions' && <ActionsTab meeting={meeting} />}
          </div>
        </div>
      </div>
    </div>
  )
}
