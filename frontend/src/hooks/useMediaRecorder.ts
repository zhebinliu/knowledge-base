/**
 * useMediaRecorder — 浏览器端录音(MediaRecorder),停止后产出音频 File 交给后端 ASR。
 *
 * 为什么不是 Web Speech 实时转写:Web Speech API 是单人听写引擎,多人会议(插话 / 远场 / 房间音)
 * 直接歇菜(用户实测「前几句行,人一多就不行」)。会议转写本就该走后端 xiaomi ASR(扛多人)。
 * 所以「实时录音」= 浏览器录音 → 停止 → 把音频 blob 包成 File → 复用现有 uploadMeetingAudio →
 * 后端 ASR 异步转写 → 跑 AI pipeline。不是逐字实时,但多人质量有保证。
 *
 * 计时 seconds:start 归零、录音中累加、stop 保留最后值(组件用来显示"已录 mm:ss")。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export interface MediaRecorderState {
  supported: boolean
  recording: boolean
  seconds: number
  error: string | null
  start: () => void
  stop: () => void
}

function tsLabel(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export function useMediaRecorder(opts: {
  /** 停止后回调,拿到录好的音频 File(交给上传管线) */
  onComplete: (file: File) => void
}): MediaRecorderState {
  const supported = typeof window !== 'undefined'
    && typeof (window as any).MediaRecorder !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia

  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const mrRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const onCompleteRef = useRef(opts.onComplete)
  onCompleteRef.current = opts.onComplete

  const clearTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }
  const stopStream = () => { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null }

  const start = useCallback(async () => {
    if (!supported || mrRef.current) return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = (window as any).MediaRecorder?.isTypeSupported?.('audio/webm') ? 'audio/webm' : ''
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = (e: BlobEvent) => { if (e.data && e.data.size) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        const type = mr.mimeType || 'audio/webm'
        const ext = type.includes('webm') ? 'webm' : type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'wav'
        const blob = new Blob(chunksRef.current, { type })
        stopStream()
        if (blob.size > 0) onCompleteRef.current(new File([blob], `录音_${tsLabel()}.${ext}`, { type }))
      }
      mr.start()
      mrRef.current = mr
      setSeconds(0)
      setRecording(true)
      clearTimer()
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
    } catch (e: any) {
      setError(e?.name === 'NotAllowedError'
        ? '麦克风权限被拒绝,请在浏览器允许麦克风后重试'
        : (e?.message || '无法开始录音'))
      stopStream()
    }
  }, [supported])

  const stop = useCallback(() => {
    setRecording(false)
    clearTimer()
    const mr = mrRef.current
    mrRef.current = null
    if (mr && mr.state !== 'inactive') { try { mr.stop() } catch { /* ignore */ } }
  }, [])

  // 卸载清理:停录音器 + 释放麦克风轨道 + 清计时器
  useEffect(() => () => {
    clearTimer()
    const mr = mrRef.current
    mrRef.current = null
    if (mr && mr.state !== 'inactive') { try { mr.stop() } catch { /* ignore */ } }
    stopStream()
  }, [])

  return { supported, recording, seconds, error, start, stop }
}
