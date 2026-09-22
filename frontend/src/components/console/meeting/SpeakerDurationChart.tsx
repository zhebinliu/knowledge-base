/**
 * 参会人发言时长条形图(recharts 横向 BarChart)。
 *
 * ⚠️ 数据如实性:本仓库的 ASR **没有声纹分离**,转写里不带说话人信息。
 * 因此时长有两来源,必须在图上明确标注,不能让用户误以为是精确识别结果:
 *   - mode="parsed"   :转写自带「说话人 N HH:MM:SS」表头 → 时间戳精确推算
 *   - mode="inferred" :由 AI 依据对话内容推断 → 仅供参考,并给出置信度与覆盖率
 * 「无法判断」单独一根灰柱,让未归属的量可见 —— 它同时也是置信度的可视化。
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { ShieldCheck, Sparkles, Info } from 'lucide-react'
import type { MeetingSpeakerStats } from '../../../api/client'

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

export default function SpeakerDurationChart({ stats }: { stats: MeetingSpeakerStats }) {
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
        {stats.total_seconds > 0 && (
          <span className="text-ink-muted">会议时长 {fmtDuration(stats.total_seconds)}</span>
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
