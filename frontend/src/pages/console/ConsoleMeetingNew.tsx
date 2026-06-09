/**
 * ConsoleMeetingNew — 新建会议(2026-05-11)
 *
 * 提供三种入口:
 *  - upload:上传音频文件 → MinIO → xiaomi ASR → AI pipeline
 *  - record:浏览器端实时录音 + 实时转写(Web Speech API)→ 文本走 AI pipeline
 *  - text:粘贴/输入文本 → 直接走 AI pipeline(跳 ASR)
 */
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Upload, Type, ChevronLeft, Loader2, Mic, Square } from 'lucide-react'
import {
  uploadMeetingAudio,
  createMeetingFromText,
  listProjects,
  type Project,
} from '../../api/client'
import { useMediaRecorder } from '../../hooks/useMediaRecorder'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'
const MAX_FILE_SIZE_MB = 500
type Mode = 'upload' | 'record' | 'text'

const fmtDuration = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export default function ConsoleMeetingNew() {
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<Mode>('upload')
  const [title, setTitle] = useState('')
  // 从项目详情「关联会议」抽屉点「新建」过来时,URL 带 ?project_id=,预填到下拉
  const [projectId, setProjectId] = useState<string>(() => searchParams.get('project_id') || '')
  const [file, setFile] = useState<File | null>(null)
  const [fileSizeError, setFileSizeError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState('')
  const [recordedFile, setRecordedFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 浏览器录音:停止后产出音频 File,走和「上传录音」同一条 uploadMeetingAudio → 后端 ASR 管线
  const recorder = useMediaRecorder({ onComplete: (f) => setRecordedFile(f) })

  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: () => listProjects() })

  const handleFileChange = (f: File | null) => {
    setFileSizeError(null)
    if (f && f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setFileSizeError(`音频文件 ${(f.size / 1024 / 1024).toFixed(1)} MB 超过 ${MAX_FILE_SIZE_MB} MB 限制，请压缩或裁剪后重试`)
      return
    }
    setFile(f)
  }

  const uploadMut = useMutation({
    mutationFn: () => {
      const f = mode === 'record' ? recordedFile : file
      if (!f) throw new Error(mode === 'record' ? '请先录音' : '请选择音频文件')
      return uploadMeetingAudio(f, {
        title: title || f.name,
        project_id: projectId || null,
      })
    },
    onSuccess: (res) => nav(`/console/meeting/${res.meeting_id}${projectId ? `?from_project=${projectId}` : ''}`),
    onError: (e: Error) => setError(e?.message || '上传失败'),
  })

  const textMut = useMutation({
    mutationFn: () => {
      if (!transcript.trim()) throw new Error('请输入文本')
      return createMeetingFromText({
        title: title || '文本会议 ' + new Date().toLocaleString(),
        transcript: transcript.trim(),
        project_id: projectId || null,
      })
    },
    onSuccess: (m) => nav(`/console/meeting/${m.id}${projectId ? `?from_project=${projectId}` : ''}`),
    onError: (e: Error) => setError(e?.message || '创建失败'),
  })

  const submitting = uploadMut.isPending || textMut.isPending

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <button
        onClick={() => nav(projectId ? `/console/projects/${projectId}` : '/console/meeting')}
        className="inline-flex items-center gap-1 text-ink-muted hover:text-ink text-sm mb-4"
      >
        <ChevronLeft size={16} /> {projectId ? '返回项目' : '返回列表'}
      </button>

      <h1 className="text-2xl font-extrabold text-ink mb-1">新建会议</h1>
      <p className="text-sm text-ink-secondary mb-6">
        上传录音(自动转写)或直接粘贴会议文本,系统会生成纪要、待办、需求、业务流程图和干系人图谱。
      </p>

      {/* Mode tabs */}
      <div className="flex border-b border-line mb-6">
        {([
          { v: 'upload' as const, label: '上传录音', Icon: Upload },
          { v: 'record' as const, label: '实时录音', Icon: Mic },
          { v: 'text' as const, label: '粘贴文本', Icon: Type },
        ]).map(t => (
          <button
            key={t.v}
            onClick={() => { if (recorder.recording) recorder.stop(); setMode(t.v); setError(null) }}
            className={`px-4 py-2.5 text-sm font-medium flex items-center gap-2 border-b-2 -mb-px ${
              mode === t.v
                ? 'border-brand text-brand'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            <t.Icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {/* 标题 */}
        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">会议标题</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={mode === 'upload' ? '默认使用音频文件名' : '默认按时间生成'}
            className="w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:border-brand"
          />
        </div>

        {/* 关联项目 */}
        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">关联项目(可选)</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-line text-sm bg-white focus:outline-none focus:border-brand"
          >
            <option value="">(不关联,后续也可在详情页修改)</option>
            {(projects || []).map((p: Project) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.customer ? ` · ${p.customer}` : ''}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-ink-muted mt-1">
            关联项目后,纪要可一键同步到 KB,干系人可叠加到项目的干系人图谱里。
          </p>
        </div>

        {/* Mode-specific content */}
        {mode === 'upload' ? (
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">音频文件</label>
            <input
              type="file"
              accept="audio/*,video/*"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              className="w-full text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-line file:bg-canvas file:text-ink hover:file:bg-canvas-elevated"
            />
            {fileSizeError && (
              <p className="text-[11px] text-rose-600 mt-1 font-medium">{fileSizeError}</p>
            )}
            <p className="text-[11px] text-ink-muted mt-1">
              支持 wav / mp3 / m4a / webm 等。最大 500 MB。上传后会异步走 xiaomi ASR 转写,完成后自动跑 AI pipeline。
            </p>
          </div>
        ) : mode === 'record' ? (
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">录音(支持多人会议)</label>
            {!recorder.supported ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-800 text-sm px-3 py-2.5 leading-relaxed">
                当前浏览器不支持录音。请使用 Chrome / Edge 桌面浏览器,或改用「上传录音」。
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-line bg-canvas/40 px-5 py-6 flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => { if (recorder.recording) { recorder.stop() } else { setRecordedFile(null); recorder.start() } }}
                  title={recorder.recording ? '停止录音' : '开始录音'}
                  className={`w-16 h-16 rounded-full flex items-center justify-center text-white transition-all ${
                    recorder.recording ? 'bg-red-500 ring-4 ring-red-100' : 'shadow-md hover:shadow-lg'
                  }`}
                  style={recorder.recording ? undefined : { background: BRAND_GRAD }}
                >
                  {recorder.recording ? <Square size={22} /> : <Mic size={24} />}
                </button>
                <div className="font-mono text-xl font-bold text-ink flex items-center gap-2">
                  {recorder.recording && <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                  {fmtDuration(recorder.seconds)}
                </div>
                <p className="text-xs text-ink-muted text-center max-w-lg">
                  {recorder.recording
                    ? '正在录音…讲完点停止'
                    : recordedFile
                      ? `已录制 ${fmtDuration(recorder.seconds)} · 点下方「上传并转写」提交`
                      : '点麦克风开始录音。录完上传后端 ASR 转写(支持多人会议)'}
                </p>
                {recordedFile && !recorder.recording && (
                  <button
                    type="button"
                    onClick={() => { setRecordedFile(null); recorder.start() }}
                    className="text-xs px-3 py-1 rounded-md border border-line text-ink-secondary hover:bg-canvas"
                  >
                    重新录制
                  </button>
                )}
              </div>
            )}
            {recorder.error && <p className="text-[11px] text-rose-600 mt-2">{recorder.error}</p>}
            <p className="text-[11px] text-ink-muted mt-2">
              录音不离开本次会话,停止后才上传;转写由后端 xiaomi ASR 完成(几十秒到几分钟),完成后自动跑 AI 流水线。
            </p>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">会议文本</label>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="粘贴或输入会议转写内容…"
              rows={12}
              className="w-full px-3 py-2 rounded-lg border border-line text-sm font-mono focus:outline-none focus:border-brand resize-y"
            />
            <p className="text-[11px] text-ink-muted mt-1">
              提交后立即触发 AI 流水线(润色 / 纪要 / 需求 / 流程 / 干系人)。一般 30 秒到 2 分钟出结果。
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 text-rose-700 text-sm px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={() => nav(projectId ? `/console/projects/${projectId}` : '/console/meeting')}
            disabled={submitting}
            className="px-4 py-2 rounded-lg border border-line text-sm text-ink hover:bg-canvas disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={() => {
              setError(null)
              if (mode === 'text') textMut.mutate()
              else uploadMut.mutate()
            }}
            disabled={submitting || recorder.recording || (
              mode === 'text' ? !transcript.trim()
              : mode === 'record' ? !recordedFile
              : (!file || !!fileSizeError)
            )}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2"
            style={{ background: BRAND_GRAD }}
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {mode === 'text' ? '提交并生成' : '上传并转写'}
          </button>
        </div>
      </div>
    </div>
  )
}
