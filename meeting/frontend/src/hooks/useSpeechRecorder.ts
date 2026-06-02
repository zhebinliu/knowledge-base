/**
 * useSpeechRecorder — 浏览器端实时录音 + 实时转写(Web Speech API)
 *
 * 用 webkitSpeechRecognition / SpeechRecognition 做客户端流式语音转文字(lang 默认 zh-CN)。
 * - continuous + interimResults:边说边出字;interim 为「临时识别中」文本,final 段落通过 onFinalText 回调追加。
 * - onend 自动重启:Chrome 静音数秒会自动结束一段,这里在仍处于录音态时无缝重启,保证长会议不断流。
 * - 计时 seconds 给 UI 显示已录时长。
 *
 * 仅 Chrome / Edge 等基于 Chromium 的桌面浏览器支持;不支持时 supported=false,调用方降级到「上传录音」。
 * 注:Web Speech API 把音频送云端识别(Chrome 用 Google),不离线;适合实时草稿,正式高保真转写仍走上传 ASR。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export interface SpeechRecorderState {
  supported: boolean
  recording: boolean
  seconds: number
  interim: string
  error: string | null
  start: () => void
  stop: () => void
}

function getSR(): any {
  if (typeof window === 'undefined') return null
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null
}

export function useSpeechRecorder(opts: {
  lang?: string
  /** 每识别出一段「最终」文本时回调(调用方负责追加到 transcript) */
  onFinalText: (text: string) => void
}): SpeechRecorderState {
  const supported = !!getSR()
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recogRef = useRef<any>(null)
  const recordingRef = useRef(false)        // 给回调里读最新录音态(避免闭包旧值)
  const manualStopRef = useRef(false)       // 区分「用户主动停」与「Chrome 自动结束」
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const onFinalRef = useRef(opts.onFinalText)
  onFinalRef.current = opts.onFinalText
  const lang = opts.lang || 'zh-CN'

  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  const buildRecognition = useCallback(() => {
    const SR = getSR()
    if (!SR) return null
    const r = new SR()
    r.lang = lang
    r.continuous = true
    r.interimResults = true
    r.onresult = (e: any) => {
      let interimText = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        const txt = res[0]?.transcript ?? ''
        if (res.isFinal) {
          const finalTxt = txt.trim()
          if (finalTxt) onFinalRef.current(finalTxt)
        } else {
          interimText += txt
        }
      }
      setInterim(interimText)
    }
    r.onerror = (e: any) => {
      // no-speech / aborted 是正常静音 / 重启产生的,不当错误提示
      if (e?.error && e.error !== 'no-speech' && e.error !== 'aborted') {
        const map: Record<string, string> = {
          'not-allowed': '麦克风权限被拒绝,请在浏览器允许麦克风后重试',
          'audio-capture': '未检测到麦克风设备',
          'network': '语音识别网络异常,请检查网络后重试',
          'service-not-allowed': '当前浏览器/环境不允许语音识别',
        }
        setError(map[e.error] || `语音识别出错:${e.error}`)
      }
    }
    r.onend = () => {
      // 仍在录音态且非用户主动停 → 无缝重启,保证不断流
      if (recordingRef.current && !manualStopRef.current) {
        try { r.start() } catch { /* 偶发 already-started,忽略 */ }
      }
    }
    return r
  }, [lang])

  const start = useCallback(() => {
    if (!supported || recordingRef.current) return
    setError(null)
    setInterim('')
    setSeconds(0)
    manualStopRef.current = false
    const r = buildRecognition()
    if (!r) { setError('当前浏览器不支持实时语音识别,请改用「上传录音」'); return }
    recogRef.current = r
    try {
      r.start()
    } catch (err: any) {
      setError(err?.message || '无法启动录音')
      return
    }
    recordingRef.current = true
    setRecording(true)
    clearTimer()
    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
  }, [supported, buildRecognition])

  const stop = useCallback(() => {
    manualStopRef.current = true
    recordingRef.current = false
    setRecording(false)
    setInterim('')
    clearTimer()
    const r = recogRef.current
    if (r) { try { r.stop() } catch { /* ignore */ } }
    recogRef.current = null
  }, [])

  // 卸载时清理(防止离开页面后识别器还在跑 / 计时器泄漏)
  useEffect(() => {
    return () => {
      manualStopRef.current = true
      recordingRef.current = false
      clearTimer()
      const r = recogRef.current
      if (r) { try { r.stop() } catch { /* ignore */ } }
      recogRef.current = null
    }
  }, [])

  return { supported, recording, seconds, interim, error, start, stop }
}
