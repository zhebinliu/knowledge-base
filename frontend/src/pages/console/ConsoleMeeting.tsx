/**
 * ConsoleMeeting — 会议纪要
 *
 * 直接内嵌外部 AI 会议系统(meeting.liii.in),iframe 占满工作台主区。
 * 头部 56px 已被 ConsoleLayout 占用,这里给 iframe 留出 calc(100vh - 56px)。
 *
 * 注意:依赖 meeting.liii.in 没设 X-Frame-Options: DENY / SAMEORIGIN。
 * 如果无法加载,浏览器控制台会有 "refused to display in a frame" 错误,
 * 届时改用新窗口打开方式。
 */
const MEETING_URL = 'https://meeting.liii.in/#/'

export default function ConsoleMeeting() {
  return (
    <div className="w-full h-[calc(100vh-56px)] bg-canvas">
      <iframe
        src={MEETING_URL}
        title="会议纪要"
        className="w-full h-full border-0"
        allow="clipboard-read; clipboard-write; microphone; camera"
      />
    </div>
  )
}
