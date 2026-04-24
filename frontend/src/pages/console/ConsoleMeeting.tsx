import { Mic, Clock, ArrowRight } from 'lucide-react'

export default function ConsoleMeeting() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 border border-gray-200 text-gray-600 text-xs font-medium mb-3">
          <Clock size={11} /> 即将上线
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-ink leading-tight mb-2">
          会议纪要接入
        </h1>
        <p className="text-sm text-ink-secondary max-w-xl">
          对接 AI 会议系统后，可以自动导入会议录音或逐字稿，生成结构化纪要并沉淀到对应项目的知识库。
        </p>
      </div>

      <div className="rounded-2xl border border-dashed border-line bg-white p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
          <Mic size={20} className="text-gray-400" />
        </div>
        <p className="text-sm text-ink-secondary mb-1">功能建设中</p>
        <p className="text-xs text-ink-muted max-w-md mx-auto leading-relaxed">
          预留接口 <span className="font-mono text-ink">POST /api/meeting/ingest</span> 已就位，支持输入协议：
          audio_url / transcript / project_id。正式会议系统对接后自动启用。
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-line bg-white p-6">
        <p className="text-sm font-semibold text-ink mb-3">未来能力规划</p>
        <ul className="space-y-2 text-sm text-ink-secondary">
          <li className="flex items-start gap-2">
            <ArrowRight size={13} className="mt-0.5 text-ink-muted flex-shrink-0" />
            <span>上传录音 / 视频 / 转录稿，自动生成会议纪要</span>
          </li>
          <li className="flex items-start gap-2">
            <ArrowRight size={13} className="mt-0.5 text-ink-muted flex-shrink-0" />
            <span>自动识别行动项（Action Item）并带责任人 + 截止日期</span>
          </li>
          <li className="flex items-start gap-2">
            <ArrowRight size={13} className="mt-0.5 text-ink-muted flex-shrink-0" />
            <span>纪要沉淀到项目知识库，支持 PM 视角检索</span>
          </li>
          <li className="flex items-start gap-2">
            <ArrowRight size={13} className="mt-0.5 text-ink-muted flex-shrink-0" />
            <span>关键决策 / 风险自动关联到项目洞察报告</span>
          </li>
        </ul>
      </div>
    </div>
  )
}
