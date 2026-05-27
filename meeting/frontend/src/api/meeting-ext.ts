/**
 * 会议扩展 API — 音频播放 + 智能问答(2026-05-21)。
 *
 * 从 ./client 引入宿主 kb-system 的 api 实例。
 */
import { api } from './client'

// ── 音频 ──────────────────────────────────────────────────────────────────

/** 获取会议录音的播放 URL(直接返回 blob URL 或用作 <audio src>)。 */
export function getMeetingAudioUrl(meetingId: number): string {
  return `/api/meeting/${meetingId}/audio`
}

// ── 智能问答 ──────────────────────────────────────────────────────────────

export interface ChatResponse {
  answer: string
  model: string
}

/** 基于会议内容进行智能问答。 */
export function chatWithMeeting(meetingId: number, question: string) {
  return api.post<ChatResponse>(`/meeting/${meetingId}/chat`, { question }).then(res => res.data)
}
