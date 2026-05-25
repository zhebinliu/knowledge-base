/**
 * AudioPlayer — 会议录音在线播放器(2026-05-21)。
 *
 * 暴露 seekTo(seconds) 方法供外部通过 ref 调用,实现点击时间戳跳转播放。
 * 通过 React.forwardRef + useImperativeHandle 暴露给父组件。
 */
import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react'
import { Play, Pause, Volume2, VolumeX } from 'lucide-react'

export interface AudioPlayerHandle {
  seekTo: (seconds: number) => void
}

interface Props {
  audioUrl: string
  className?: string
}

const AudioPlayer = forwardRef<AudioPlayerHandle, Props>(function AudioPlayer(
  { audioUrl, className },
  ref,
) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [muted, setMuted] = useState(false)
  const [ready, setReady] = useState(false)

  useImperativeHandle(ref, () => ({
    seekTo(seconds: number) {
      const el = audioRef.current
      if (el) {
        el.currentTime = Math.max(0, Math.min(seconds, el.duration || seconds))
        el.play().catch(() => {})
      }
    },
  }))

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onMeta = () => { setDuration(el.duration); setReady(true) }
    const onTime = () => setCurrentTime(el.currentTime)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    return () => {
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
    }
  }, [audioUrl])

  const fmtTime = (s: number) => {
    if (!Number.isFinite(s)) return '00:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  const togglePlay = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) el.play().catch(() => {})
    else el.pause()
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border border-line bg-white shadow-sm ${className || ''}`}>
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      <button
        onClick={togglePlay}
        disabled={!ready}
        className="p-1 rounded-full bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 flex-shrink-0"
        style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {playing ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
      </button>

      <span className="text-[11px] font-mono text-ink-muted w-[42px] text-right tabular-nums flex-shrink-0">
        {fmtTime(currentTime)}
      </span>

      {/* 进度条 */}
      <div
        className="flex-1 h-1.5 rounded-full bg-orange-100 cursor-pointer relative"
        onClick={(e) => {
          const el = audioRef.current
          if (!el || !duration) return
          const rect = (e.target as HTMLElement).getBoundingClientRect()
          const pct = (e.clientX - rect.left) / rect.width
          el.currentTime = pct * duration
        }}
      >
        <div
          className="h-full rounded-full transition-all duration-150"
          style={{ width: `${progress}%`, background: 'linear-gradient(135deg,#FF8D1A,#D96400)' }}
        />
      </div>

      <span className="text-[11px] font-mono text-ink-muted w-[42px] flex-shrink-0 tabular-nums">
        {fmtTime(duration)}
      </span>

      <button
        onClick={() => setMuted(!muted)}
        className="p-1 text-ink-muted hover:text-ink flex-shrink-0"
      >
        {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
      </button>
    </div>
  )
})

export default AudioPlayer
