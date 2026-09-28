/**
 * 参会人发言时长条形图(recharts 横向 BarChart)+ 人工校正。
 *
 * ⚠️ 数据如实性:本仓库的 ASR **没有声纹分离**,转写里不带说话人信息。
 * 因此时长有两来源,必须在图上明确标注,不能让用户误以为是精确识别结果:
 *   - mode="parsed"   :转写自带「说话人 N HH:MM:SS」表头 → 时间戳精确推算
 *   - mode="inferred" :由 AI 依据对话内容推断 → 仅供参考,并给出置信度与覆盖率
 * 「无法判断」单独一根灰柱,让未归属的量可见 —— 它同时也是置信度的可视化。
 *
 * 人工校正(2026-09):归因再准也会有错,必须给一条纠错出路。校正分改名与合并两种,
 * 底层是同一个「原始标签 → 最终姓名」映射(多个标签指向同一姓名就是合并)。
 * 校正后徽标加挂「已人工校正」—— 但**不摘掉**来源徽标:
 * 时长本身仍是推断值,人工只改了名字归属,这一点不能被模糊掉。
 */
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { Check, Info, Merge, PencilLine, RotateCcw, ShieldCheck, Sparkles, UserCheck } from 'lucide-react'
import { correctSpeakerStats, type MeetingSpeakerStats } from '../../../api/client'
import { toast } from '../../Toaster'

// 暖色梯度,与会议详情页「不混用橙蓝」的约定一致
const BAR_COLORS = ['#D96400', '#EA580C', '#FF8D1A', '#B45309', '#92400E', '#7C2D12']
const UNKNOWN_COLOR = '#9CA3AF'

const fmtDuration = (s: number) => {
  const t = Math.max(0, Math.round(s))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const sec = t % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

const CONFIDENCE_LABEL: Record<string, string> = { high: '高', medium: '中', low: '低' }

/** 一行的稳定键 = 它的原始标签串。用 `name` 做键会在改名后漂移(重渲染时对不上)。*/
const rowKey = (labels: string[]) => labels.join('\u0000')

export default function SpeakerDurationChart({
  stats, meetingId,
}: {
  stats: MeetingSpeakerStats
  meetingId: number
}) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [editKey, setEditKey] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [checked, setChecked] = useState<string[]>([])
  const [confirmReset, setConfirmReset] = useState(false)

  const mut = useMutation({
    mutationFn: (body: { mapping?: Record<string, string>; reset?: boolean }) =>
      correctSpeakerStats(meetingId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meeting', meetingId] })
      setEditKey(null)
      setChecked([])
      setConfirmReset(false)
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (e instanceof Error ? e.message : '校正失败')
      toast.error(msg)
    },
  })

  const rows = [
    ...stats.speakers.map((s) => ({ name: s.name, seconds: s.seconds, ratio: s.ratio, unknown: false })),
    ...(stats.unknown_seconds > 0
      ? [{
          name: '无法判断',
          seconds: stats.unknown_seconds,
          ratio: stats.total_seconds > 0
            ? Math.round((stats.unknown_seconds / stats.total_seconds) * 1000) / 10
            : 0,
          unknown: true,
        }]
      : []),
  ]

  const isParsed = stats.mode === 'parsed'
  // 校正的基准是 `raw_speakers`,而它只在本轮之后生成的数据里才有 —— 本次上线前生成的
  // 发言时长没有这个字段,后端 PATCH 会直接 400。所以这里必须一起判,不能只看有没有 speakers。
  // 「无法判断」不是人,不参与校正。
  const canCorrect = Array.isArray(stats.raw_speakers) && stats.raw_speakers.length > 0
  const editable = canCorrect ? stats.speakers : []
  const rowOf = (labels: string[]) => stats.speakers.find((s) => rowKey(s.labels ?? [s.name]) === rowKey(labels))

  /** 把 mapping 提交上去。仅提交改动的那几项 —— 后端是并入语义,不会碰其余校正。 */
  const submit = (mapping: Record<string, string>) => {
    if (Object.keys(mapping).length === 0) return
    mut.mutate({ mapping })
  }

  const commitRename = (labels: string[], next: string) => {
    const name = next.trim()
    const cur = rowOf(labels)?.name ?? ''
    setEditKey(null)
    if (!name || name === cur) return
    // 一行的所有原始标签都指向新名字 —— 已合并的行改名后不能散架
    submit(Object.fromEntries(labels.map((l) => [l, name])))
  }

  const doMerge = () => {
    const picked = editable.filter((s) => checked.includes(rowKey(s.labels ?? [s.name])))
    if (picked.length < 2) return
    // 并到「勾选的第一行」的名字上:符合直觉,也不用再弹一个输入框问新名字
    const target = picked[0].name
    const mapping: Record<string, string> = {}
    for (const s of picked) for (const l of (s.labels ?? [s.name])) mapping[l] = target
    submit(mapping)
  }

  const busy = mut.isPending

  return (
    <div>
      {/* 数据来源徽标 —— 必须显眼,用户要一眼看出这是精确值还是推断值 */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        {isParsed ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">
            <ShieldCheck size={12} /> 精确解析 · 转写自带说话人表头
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
            <Sparkles size={12} /> AI 推断 · 置信度{CONFIDENCE_LABEL[stats.confidence ?? ''] ?? '未知'}
            {stats.coverage > 0 && ` · 覆盖率 ${Math.round(stats.coverage * 100)}%`}
          </span>
        )}
        {/* 校正徽标是**加挂**不是替换:名字是人定的,时长仍是推断的 */}
        {stats.corrected && (
          <span className="inline-flex items-center gap-1 rounded-md border border-line bg-canvas px-2 py-0.5 text-ink-secondary">
            <UserCheck size={12} /> 已人工校正
            {stats.corrected_at && ` · ${stats.corrected_at.slice(0, 10)}`}
          </span>
        )}
        {stats.total_seconds > 0 && (
          <span className="text-ink-muted">会议时长 {fmtDuration(stats.total_seconds)}</span>
        )}
        {editable.length > 0 && (
          <button
            onClick={() => { setEditing((v) => !v); setEditKey(null); setChecked([]); setConfirmReset(false) }}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-ink-secondary hover:bg-canvas"
          >
            <PencilLine size={12} /> {editing ? '收起校正' : '校正发言人'}
          </button>
        )}
        {/* 旧数据没有校正基准,如实说明为什么没有入口,而不是让按钮凭空消失 */}
        {stats.speakers.length > 0 && !canCorrect && (
          <span className="ml-auto text-ink-muted">重新生成一次即可启用人工校正</span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 34 + 40)}>
        <BarChart
          layout="vertical"
          data={rows}
          margin={{ top: 4, right: 48, left: 8, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => fmtDuration(v)}
          />
          {/* 中文姓名需要留够宽度,否则会被截断 */}
          <YAxis type="category" dataKey="name" width={78} tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(value, _name, item) => {
              // recharts v3 的 value 类型是 ValueType | undefined,这里统一收敛成秒数
              const secs = typeof value === 'number' ? value : Number(value) || 0
              const ratio =
                (item as { payload?: { ratio?: number } } | undefined)?.payload?.ratio ?? 0
              return [`${fmtDuration(secs)}(${ratio}%)`, '发言时长'] as [string, string]
            }}
          />
          <Bar dataKey="seconds" radius={[0, 4, 4, 0]}>
            {rows.map((r, i) => (
              <Cell
                key={r.name}
                fill={r.unknown ? UNKNOWN_COLOR : BAR_COLORS[i % BAR_COLORS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* ── 人工校正面板 ───────────────────────────────────────────────── */}
      {editing && (
        <div className="mt-3 rounded-lg border border-line bg-canvas p-2.5">
          <p className="mb-2 text-[11px] text-ink-muted">
            点姓名可直接改;勾选两行及以上再点「合并所选」可把它们并成一行。
            校正会保留,重新生成发言时长也不会被覆盖。
          </p>
          <div className="space-y-1">
            {editable.map((s) => {
              const labels = s.labels ?? [s.name]
              const key = rowKey(labels)
              const isEditing = editKey === key
              const merged = labels.length > 1
              return (
                <div key={key} className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-white px-2 py-1 text-xs">
                  <input
                    type="checkbox"
                    checked={checked.includes(key)}
                    disabled={busy}
                    onChange={() => setChecked((c) => (c.includes(key) ? c.filter((x) => x !== key) : [...c, key]))}
                  />
                  {isEditing ? (
                    <input
                      autoFocus
                      value={draft}
                      disabled={busy}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(labels, draft)
                        if (e.key === 'Escape') setEditKey(null)
                      }}
                      onBlur={() => commitRename(labels, draft)}
                      className="w-32 rounded border border-line px-1.5 py-0.5 text-xs text-ink outline-none focus:border-brand"
                    />
                  ) : (
                    <button
                      onClick={() => { setEditKey(key); setDraft(s.name) }}
                      disabled={busy}
                      title="点击改名"
                      className="inline-flex items-center gap-1 rounded px-1 py-0.5 font-medium text-ink hover:bg-canvas"
                    >
                      {s.name}
                      <PencilLine size={10} className="text-ink-muted" />
                    </button>
                  )}
                  <span className="text-ink-muted">
                    {fmtDuration(s.seconds)}
                    {merged && <span className="ml-1.5">由 {labels.join('、')} 合并</span>}
                    {!merged && labels[0] !== s.name && <span className="ml-1.5">原:{labels[0]}</span>}
                  </span>
                  {isEditing && <Check size={12} className="text-emerald-600" />}
                </div>
              )
            })}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <button
              onClick={doMerge}
              disabled={busy || checked.length < 2}
              className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1 text-ink-secondary hover:bg-canvas disabled:opacity-40"
            >
              <Merge size={12} /> 合并所选{checked.length >= 2 ? `(${checked.length})` : ''}
            </button>
            {stats.corrected && (
              <button
                onClick={() => (confirmReset ? mut.mutate({ reset: true }) : setConfirmReset(true))}
                disabled={busy}
                className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 disabled:opacity-40 ${
                  confirmReset
                    ? 'border-red-300 bg-red-50 text-red-700'
                    : 'border-line bg-white text-ink-secondary hover:bg-canvas'
                }`}
              >
                <RotateCcw size={12} /> {confirmReset ? '再点一次确认撤销' : '撤销全部校正'}
              </button>
            )}
          </div>
        </div>
      )}

      {stats.note && (
        <p className="mt-2 flex items-start gap-1 text-xs text-ink-muted">
          <Info size={12} className="mt-0.5 shrink-0" />
          {stats.note}
        </p>
      )}
      {stats.candidates.length > 0 && (
        <p className="mt-1 text-xs text-ink-muted">
          本次归属使用的候选名单:{stats.candidates.join('、')}
        </p>
      )}
    </div>
  )
}
