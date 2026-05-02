/**
 * StatusBadge — 统一的状态徽章组件
 *
 * 用于表达"对象当前处于何种状态"(进行中 / 已完成 / 失败 等)。
 * 不要拿来做"分类标签"(如 LTC 阶段 / 行业 / 模块名),那种用 Tag 组件。
 *
 * 6 种 tone:
 * - pending:  浅黄,等待开始(未触发任务)
 * - inflight: 浅蓝,进行中(已触发,LLM/Celery 在跑)— 自动转 spinner 图标
 * - done:     浅绿,已完成
 * - failed:   浅红,失败
 * - locked:   浅灰 + 虚线,未解锁(前置条件没满足)
 * - neutral:  灰色,中性信息(如计数 / 元信息)
 *
 * 设计依据:对应 /ds 页面"工作台模式 · 阶段步进器"的四态色板。
 */
import { Clock, Loader2, CheckCircle2, AlertCircle, Lock } from 'lucide-react'

export type StatusTone = 'pending' | 'inflight' | 'done' | 'failed' | 'locked' | 'neutral'

const TONE_STYLES: Record<StatusTone, string> = {
  pending:  'bg-yellow-50 text-yellow-700 border-yellow-100',
  inflight: 'bg-blue-50 text-blue-700 border-blue-100',
  done:     'bg-green-50 text-green-700 border-green-100',
  failed:   'bg-red-50 text-red-700 border-red-100',
  locked:   'bg-gray-50 text-gray-500 border-dashed border-gray-300',
  neutral:  'bg-gray-50 text-gray-600 border-gray-100',
}

// 用 lucide-react 的 LucideIcon 类型 — 直接用 typeof 取自一个具体图标
type IconType = typeof Clock
const TONE_ICONS: Record<StatusTone, IconType> = {
  pending:  Clock,
  inflight: Loader2,
  done:     CheckCircle2,
  failed:   AlertCircle,
  locked:   Lock,
  neutral:  Clock,  // 不展示
}

interface Props {
  tone: StatusTone
  label: string
  size?: 'sm' | 'md'
  /** 是否显示左侧图标(默认显示;neutral tone 默认不显示) */
  icon?: boolean
  /** 自定义额外 className */
  className?: string
}

export default function StatusBadge({ tone, label, size = 'sm', icon, className = '' }: Props) {
  const Icon = TONE_ICONS[tone]
  const showIcon = icon ?? (tone !== 'neutral')
  const sizeCls = size === 'sm'
    ? 'text-xs px-2 py-0.5 gap-1'
    : 'text-sm px-2.5 py-1 gap-1.5'
  const iconSize = size === 'sm' ? 11 : 13
  return (
    <span
      className={`inline-flex items-center rounded-full border whitespace-nowrap ${TONE_STYLES[tone]} ${sizeCls} ${className}`}
    >
      {showIcon && <Icon size={iconSize} className={tone === 'inflight' ? 'animate-spin' : ''} />}
      {label}
    </span>
  )
}
