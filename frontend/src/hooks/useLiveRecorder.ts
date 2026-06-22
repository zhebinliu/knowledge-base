/**
 * useLiveRecorder — 半实时「边录边传」录音(2026-06-22)。
 *
 * 为什么是「分段独立录音」而不是 MediaRecorder.start(timeslice):
 * timeslice 吐出的后续分片没有 webm 头,服务端无法独立解码。所以每段都开一个**新的**
 * MediaRecorder(start → 定时 stop → 拿到完整可解码 webm → 回调上传 → 立刻开下一段),
 * 段边界丢几十 ms,换来每段都能独立送 ASR、转写稿一段段实时冒出来。
 *
 * - onSegment(blob, seq, startMs):每段录完回调。startMs = 该段开始时相对录音起点的毫秒数,
 *   用于服务端拼会议级时间戳。调用方应**串行**上传(段长 >> 上传耗时,天然不重叠)。
 * - onStopped():用户 stop 后、最后一段也回调完 onSegment 之后触发,调用方在此 finalize。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export interface LiveRecorderState {
  supported: boolean
  recording: boolean
  seconds: number
  error: string | null
  start: () => void
  stop: () => void
}

export function useLiveRecorder(opts: {
  segmentMs?: number
  onSegment: (blob: Blob, seq: number, startMs: number) => void
  onStopped?: () => void
  onError?: (msg: string) => void
}): LiveRecorderState {
  const segmentMs = opts.segmentMs ?? 10000
  const supported = typeof window !== 'undefined'
    && typeof (window as any).MediaRecorder !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia

  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const mrRef = useRef<MediaRecorder | null>(null)
  const recordingRef = useRef(false)
  const seqRef = useRef(0)
  const startTsRef = useRef(0)            // performance.now() at recording start
  const segTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 回调存 ref,保证每段拿到最新闭包(projectId / nav 等)
  const onSegmentRef = useRef(opts.onSegment); onSegmentRef.current = opts.onSegment
  const onStoppedRef = useRef(opts.onStopped); onStoppedRef.current = opts.onStopped
  const onErrorRef = useRef(opts.onError); onErrorRef.current = opts.onError

  const clearTimers = () => {
    if (segTimerRef.current) { clearTimeout(segTimerRef.current); segTimerRef.current = null }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
  }
  const stopStream = () => { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null }

  const recordSegment = useCallback(() => {
    const stream = streamRef.current
    if (!stream || !recordingRef.current) { stopStream(); return }
    const mime = (window as any).MediaRecorder?.isTypeSupported?.('audio/webm') ? 'audio/webm' : ''
    const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
    const chunks: Blob[] = []
    const segStartMs = Math.max(0, Math.round(performance.now() - startTsRef.current))
    const mySeq = seqRef.current
    seqRef.current = mySeq + 1
    mr.ondataavailable = (e: BlobEvent) => { if (e.data && e.data.size) chunks.push(e.data) }
    mr.onstop = () => {
      const type = mr.mimeType || 'audio/webm'
      const blob = new Blob(chunks, { type })
      if (blob.size > 0) { try { onSegmentRef.current(blob, mySeq, segStartMs) } catch { /* ignore */ } }
      if (recordingRef.current) {
        recordSegment()              // 继续录下一段
      } else {
        stopStream()
        try { onStoppedRef.current?.() } catch { /* ignore */ }   // 最后一段:收尾
      }
    }
    mr.start()
    mrRef.current = mr
    segTimerRef.current = setTimeout(() => {
      if (mr.state !== 'inactive') { try { mr.stop() } catch { /* ignore */ } }
    }, segmentMs)
  }, [segmentMs])

  const start = useCallback(async () => {
    if (!supported || recordingRef.current) return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      seqRef.current = 0
      startTsRef.current = performance.now()
      recordingRef.current = true
      setRecording(true)
      setSeconds(0)
      clearTimers()
      tickRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
      recordSegment()
    } catch (e: any) {
      const msg = e?.name === 'NotAllowedError'
        ? '麦克风权限被拒绝,请在浏览器允许麦克风后重试'
        : (e?.message || '无法开始录音')
      setError(msg)
      onErrorRef.current?.(msg)
      stopStream()
    }
  }, [supported, recordSegment])

  const stop = useCallback(() => {
    recordingRef.current = false
    setRecording(false)
    if (segTimerRef.current) { clearTimeout(segTimerRef.current); segTimerRef.current = null }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
    const mr = mrRef.current
    mrRef.current = null
    if (mr && mr.state !== 'inactive') {
      try { mr.stop() } catch { /* ignore */ }   // onstop 会上传最后一段并触发 onStopped
    } else {
      stopStream()
      try { onStoppedRef.current?.() } catch { /* ignore */ }
    }
  }, [])

  // 卸载清理
  useEffect(() => () => {
    recordingRef.current = false
    clearTimers()
    const mr = mrRef.current
    mrRef.current = null
    if (mr && mr.state !== 'inactive') { try { mr.stop() } catch { /* ignore */ } }
    stopStream()
  }, [])

  return { supported, recording, seconds, error, start, stop }
}
