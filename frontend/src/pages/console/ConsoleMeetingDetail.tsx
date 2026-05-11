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
} from 'lucide-react'
import {
  getMeeting, deleteMeeting, processMeeting, patchMeeting, linkMeetingProject,
  runMeetingAction, syncMeetingToKB, syncMeetingStakeholdersToKB,
  exportMeetingToFeishu, syncMeetingRequirementsToBitable,
  listProjects, getFeishuCredentials, putFeishuCredentials, deleteFeishuCredentials,
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-medium text-ink-muted mb-1.5">原始转写(ASR 输出)</div>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={20}
            className="w-full px-3 py-2 rounded-md border border-line text-sm font-mono leading-relaxed resize-y"
          />
        </div>
        <div>
          <div className="text-xs font-medium text-ink-muted mb-1.5">润色版本</div>
          <textarea
            value={polished}
            onChange={(e) => setPolished(e.target.value)}
            rows={20}
            className="w-full px-3 py-2 rounded-md border border-line text-sm leading-relaxed resize-y"
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

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex justify-end">
        <button
          onClick={() => regenMut.mutate()}
          disabled={regenMut.isPending}
          className="px-3 py-1.5 rounded-md text-sm border border-line bg-canvas hover:bg-canvas-elevated inline-flex items-center gap-1.5"
        >
          {regenMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          重新生成
        </button>
      </div>

      {m.summary && (
        <Section title="会议摘要">
          <p className="text-sm leading-relaxed text-ink">{m.summary}</p>
        </Section>
      )}

      {m.attendees && m.attendees.length > 0 && (
        <Section title="参会人员">
          <div className="flex flex-wrap gap-1.5">
            {m.attendees.map((a, i) => (
              <span key={i} className="px-2 py-0.5 rounded-full bg-canvas border border-line text-[12px] text-ink">{a}</span>
            ))}
          </div>
        </Section>
      )}

      {m.key_points && m.key_points.length > 0 && (
        <Section title="关键议题">
          <ul className="space-y-2">
            {m.key_points.map((kp, i) => (
              <li key={i}>
                <div className="text-sm font-medium text-ink">{kp.topic}</div>
                <div className="text-sm text-ink-secondary mt-0.5">{kp.content}</div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {m.decisions && m.decisions.length > 0 && (
        <Section title="决议事项">
          <ul className="space-y-1.5 text-sm">
            {m.decisions.map((d, i) => (
              <li key={i} className="text-ink">
                ✓ {d.content}
                {d.owner && <span className="text-ink-muted text-[12px]">(负责人:{d.owner})</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {m.action_items && m.action_items.length > 0 && (
        <Section title="待办事项">
          <ul className="space-y-1.5 text-sm">
            {m.action_items.map((a, i) => (
              <li key={i} className="text-ink">
                ▸ {a.task}
                <span className="text-[12px] text-ink-muted ml-1">
                  {a.owner && ` · 负责人 ${a.owner}`}
                  {a.deadline && ` · 截止 ${a.deadline}`}
                  {a.priority && ` · ${a.priority}`}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {m.unresolved && m.unresolved.length > 0 && (
        <Section title="未决问题">
          <ul className="space-y-1.5 text-sm">
            {m.unresolved.map((u, i) => (
              <li key={i} className="text-ink">
                ⚠ {u.issue}
                {u.reason && <span className="text-[12px] text-ink-muted ml-1">(原因:{u.reason})</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink mb-2">{title}</h3>
      {children}
    </div>
  )
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

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1.5">
          {(['all', 'P0', 'P1', 'P2', 'P3'] as const).map(p => (
            <button
              key={p}
              onClick={() => setFilter(p)}
              className={`px-2.5 py-1 rounded-md text-[12px] border ${
                filter === p ? 'border-brand text-brand bg-brand/5' : 'border-line text-ink-muted hover:text-ink'
              }`}
            >
              {p === 'all' ? `全部(${reqs.length})` : `${p}(${reqs.filter(r => r.priority === p).length})`}
            </button>
          ))}
        </div>
        <button
          onClick={() => regenMut.mutate()}
          disabled={regenMut.isPending}
          className="px-3 py-1.5 rounded-md text-sm border border-line bg-canvas hover:bg-canvas-elevated inline-flex items-center gap-1.5"
        >
          {regenMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          重新提取
        </button>
      </div>

      <div className="rounded-md border border-line overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-canvas text-ink-muted text-[12px]">
            <tr>
              <th className="text-left px-3 py-2 font-medium">ID</th>
              <th className="text-left px-3 py-2 font-medium">模块</th>
              <th className="text-left px-3 py-2 font-medium">需求描述</th>
              <th className="text-left px-3 py-2 font-medium w-16">优先级</th>
              <th className="text-left px-3 py-2 font-medium w-20">提出人</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r: MeetingRequirement) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-3 py-2 text-ink-muted font-mono text-[12px]">{r.req_id}</td>
                <td className="px-3 py-2 text-ink">{r.module || '-'}</td>
                <td className="px-3 py-2 text-ink leading-relaxed">
                  {r.description}
                  {r.source && (
                    <div className="text-[11px] text-ink-muted italic mt-0.5">"{r.source}"</div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
                    r.priority === 'P0' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                    r.priority === 'P1' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                    r.priority === 'P2' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                    'bg-gray-50 text-ink-muted border border-line'
                  }`}>{r.priority}</span>
                </td>
                <td className="px-3 py-2 text-ink-secondary text-[12px]">{r.speaker || '-'}</td>
              </tr>
            ))}
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
    <div className="max-w-6xl mx-auto px-6 py-6">
      {/* Header */}
      <button
        onClick={() => nav('/console/meeting')}
        className="inline-flex items-center gap-1 text-ink-muted hover:text-ink text-sm mb-3"
      >
        <ChevronLeft size={16} /> 返回列表
      </button>

      <div className="flex items-start justify-between gap-4 mb-2">
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
            className="px-3 py-1.5 rounded-md text-sm border border-line bg-canvas hover:bg-canvas-elevated disabled:opacity-50 inline-flex items-center gap-1.5"
            title="重新跑完整 AI pipeline"
          >
            {processMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            重新处理
          </button>
          <button
            onClick={() => {
              if (window.confirm(`确认删除「${meeting.title}」?`)) delMut.mutate()
            }}
            className="px-3 py-1.5 rounded-md text-sm border border-line text-ink-muted hover:text-rose-600 hover:border-rose-200"
            title="删除"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-line mt-4">
        <div className="flex overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.Icon
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap inline-flex items-center gap-1.5 ${
                  tab === t.key
                    ? 'border-brand text-brand'
                    : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                <Icon size={14} /> {t.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="py-6">
        {tab === 'overview' && <OverviewTab meeting={meeting} />}
        {tab === 'transcript' && <TranscriptTab meeting={meeting} />}
        {tab === 'minutes' && <MinutesTab meeting={meeting} />}
        {tab === 'requirements' && <RequirementsTab meeting={meeting} />}
        {tab === 'stakeholders' && <StakeholdersTab meeting={meeting} />}
        {tab === 'actions' && <ActionsTab meeting={meeting} />}
      </div>
    </div>
  )
}
