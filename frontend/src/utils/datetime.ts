// 后端 datetime.utcnow() 序列化后不带时区后缀（naive ISO），JS 默认会按本地时区
// 解析，导致北京用户看到的时间比真实时间早 8 小时。统一用这里的 helper：
//   1. 无时区后缀 → 追加 Z 强制按 UTC 解析
//   2. 无论用户浏览器时区，都显式格式化为 Asia/Shanghai

const TZ_RE = /[Zz]|[+-]\d{2}:?\d{2}$/

function parseServerTime(s: string): Date {
  return new Date(TZ_RE.test(s) ? s : s + 'Z')
}

export function formatTime(
  s: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { hour12: false },
): string {
  if (!s) return '—'
  const d = parseServerTime(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', ...opts })
}

export function formatDate(s: string | null | undefined): string {
  if (!s) return '—'
  const d = parseServerTime(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })
}
