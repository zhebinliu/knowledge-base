/**
 * 会前问卷按角色导出按钮 + 弹出菜单。
 *
 * 用户操作流:点击「导出会前问卷 ⏷」 → 弹 popover →
 *   1. 选角色(高管 / 部门负责人 / 一线 / IT / 全部)
 *   2. 选格式(Word / Excel / PDF)
 *   - Word / Excel:直接下载二进制
 *   - PDF:新窗口打开 HTML,用户用浏览器打印 → 另存为 PDF
 */
import { useState, useRef, useEffect } from 'react'
import { Download, FileText, FileSpreadsheet, Printer, Loader2 } from 'lucide-react'
import { exportPreMeeting, type ExportRole, type ExportFormat } from '../../../api/client'

const ROLES: { value: ExportRole; label: string; desc: string }[] = [
  { value: 'all',       label: '全部角色', desc: '会前所有题目合订(给客户内部传阅一份)' },
  { value: 'executive', label: '高管',     desc: '战略 / KPI / 决策诉求' },
  { value: 'dept_head', label: '部门负责人', desc: '业务流程 / 协同规则' },
  { value: 'frontline', label: '一线',     desc: '日常操作 / 痛点' },
  { value: 'it',        label: 'IT',       desc: '集成 / 数据 / 权限' },
]

interface Props {
  bundleId: string
  /** 紧凑模式(顶部工具栏)用 size=11,默认 size=12 */
  compact?: boolean
}

export default function ExportPreMeetingButton({ bundleId, compact }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // 点外面关闭
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const [error, setError] = useState<string | null>(null)
  const trigger = async (role: ExportRole, fmt: ExportFormat) => {
    setBusy(true)
    setError(null)
    try {
      await exportPreMeeting(bundleId, role, fmt)
      setOpen(false)
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || '导出失败')
    } finally {
      setBusy(false)
    }
  }

  const sz = compact ? 11 : 12
  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        className={`flex items-center gap-1 ${
          compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'
        } rounded border border-line text-ink-secondary bg-white hover:bg-slate-50 disabled:opacity-50`}
        title="会前问卷可按受访角色导出空白模板,发给客户填写"
      >
        {busy
          ? <Loader2 size={sz} className="animate-spin" />
          : <Download size={sz} />}
        <span>导出会前问卷</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-[320px] bg-white rounded-lg border border-line shadow-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-line bg-slate-50/60">
            <div className="text-xs font-semibold text-ink">会前问卷 · 按角色导出</div>
            <div className="text-[10px] text-ink-muted mt-0.5">
              纯空白模板,客户拿到从零填。会中题不外发。
            </div>
          </div>
          <div className="divide-y divide-line/60">
            {ROLES.map(r => (
              <div key={r.value} className="px-3 py-2 hover:bg-slate-50/60">
                <div className="flex items-center justify-between mb-1">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-ink">{r.label}</div>
                    <div className="text-[10px] text-ink-muted truncate" title={r.desc}>{r.desc}</div>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <FmtBtn icon={<FileText size={10} />} label="Word"  onClick={() => trigger(r.value, 'docx')} />
                  <FmtBtn icon={<FileSpreadsheet size={10} />} label="Excel" onClick={() => trigger(r.value, 'xlsx')} />
                  <FmtBtn icon={<Printer size={10} />} label="PDF"   onClick={() => trigger(r.value, 'html')}
                          title="新窗口打开打印预览 → 浏览器「另存为 PDF」" />
                </div>
              </div>
            ))}
          </div>
          {error && (
            <div className="px-3 py-2 border-t border-line bg-red-50 text-[11px] text-red-600">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FmtBtn({
  icon, label, onClick, title,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[10.5px] rounded border border-line text-ink-secondary hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
