/**
 * 会议扩展 API — 音频播放 + 智能问答(2026-05-21)。
 *
 * 从 ./client 引入宿主 kb-system 的 api 实例。
 */
import { api, TOKEN_STORAGE_KEY } from './client'

// ── 音频 ──────────────────────────────────────────────────────────────────

/** 获取会议录音的播放 URL(包含 ?token=JWT，因为浏览器 <audio> 无法携带 Authorization 头)。 */
export function getMeetingAudioUrl(meetingId: number): string {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY)
  const params = token ? `?token=${encodeURIComponent(token)}` : ''
  return `/api/meeting/${meetingId}/audio${params}`
}

// ── 智能问答 ──────────────────────────────────────────────────────────────

export interface ChatResponse {
  answer: string
  model: string
}

/** 基于会议内容进行智能问答。 */
export async function chatWithMeeting(meetingId: number, question: string): Promise<ChatResponse> {
  const { data } = await api.post<ChatResponse>(`/meeting/${meetingId}/chat`, { question })
  return data
}
