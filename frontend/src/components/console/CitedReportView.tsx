/**
 * CitedReportView — 带可点击角标的报告渲染(亮色主题)
 *
 * 现在是 ReportMarkdown 的薄封装:只提供亮色报告主题(className 里的元素样式)+ 开启引用 chip。
 * 清洗 / 表格分隔行修复 / mermaid / 角标这些行为统一收敛在 ReportMarkdown,详见该文件注释。
 *
 * Executor 后处理把 [D1] 转成 `[D1](#cite-<module_key>-D1)`,ReportMarkdown 检测 `#cite-` 前缀
 * 渲染为可点击 chip + tooltip:hover 看原文摘要,click 触发 onCitationClick → 父组件跳右栏引用面板。
 */
import { type ProvenanceEntry } from '../../api/client'
import ReportMarkdown from '../markdown/ReportMarkdown'

interface Props {
  content: string
  provenance: Record<string, Record<string, ProvenanceEntry>>   // {module_key: {D1/K1/W1: entry}}
  onCitationClick: (moduleKey: string, refId: string) => void
}

// 亮色报告主题 — 用 [&_xxx]: arbitrary descendant 选择器控制各元素样式,不依赖 prose 插件。
const REPORT_LIGHT_CLS = [
  'text-[14px] text-ink leading-relaxed',
  '[&_h1]:text-[26px] [&_h1]:font-extrabold [&_h1]:text-ink [&_h1]:mb-5 [&_h1]:pb-3 [&_h1]:border-b [&_h1]:border-line',
  '[&_h2]:text-[19px] [&_h2]:font-bold [&_h2]:text-ink [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:pb-1.5 [&_h2]:border-b [&_h2]:border-orange-100',
  '[&_h3]:text-[16px] [&_h3]:font-bold [&_h3]:text-[#D96400] [&_h3]:mt-5 [&_h3]:mb-2',
  '[&_h4]:text-[14px] [&_h4]:font-semibold [&_h4]:text-ink [&_h4]:mt-4 [&_h4]:mb-1.5',
  '[&_p]:my-2.5 [&_p]:leading-[1.75]',
  '[&_ul]:my-2.5 [&_ul]:pl-6 [&_ul]:list-disc',
  '[&_ol]:my-2.5 [&_ol]:pl-6 [&_ol]:list-decimal',
  '[&_li]:my-1 [&_li]:leading-[1.7]',
  '[&_table]:border-collapse [&_table]:my-4 [&_table]:w-full [&_table]:text-[13px]',
  '[&_th]:border [&_th]:border-line [&_th]:bg-orange-50/60 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-ink',
  '[&_td]:border [&_td]:border-line [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_td]:text-ink-secondary',
  '[&_strong]:text-ink [&_strong]:font-semibold',
  '[&_em]:italic [&_em]:text-ink-secondary',
  '[&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[12.5px] [&_code]:font-mono',
  '[&_a:not(.not-prose_a)]:text-[#D96400] [&_a:not(.not-prose_a)]:no-underline hover:[&_a:not(.not-prose_a)]:underline',
  '[&_blockquote]:border-l-4 [&_blockquote]:border-orange-300 [&_blockquote]:bg-orange-50/30 [&_blockquote]:py-2 [&_blockquote]:px-4 [&_blockquote]:my-3 [&_blockquote]:text-ink-secondary [&_blockquote_p]:my-1',
  '[&_hr]:my-6 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-line',
  '[&_pre]:bg-slate-50 [&_pre]:border [&_pre]:border-line [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:text-[12.5px]',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
].join(' ')

export default function CitedReportView({ content, provenance, onCitationClick }: Props) {
  return (
    <ReportMarkdown
      content={content}
      className={REPORT_LIGHT_CLS}
      citation={{ provenance, onCitationClick }}
    />
  )
}
