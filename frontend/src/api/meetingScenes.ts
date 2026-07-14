// 会议涉及场景（闭环③）API — 独立文件,避免 meeting overlay 覆盖。
import { api } from './client'

export interface MeetingScene {
  domain: string
  code: string
  name: string
}
export interface MeetingScenes {
  meeting_id: number
  detected: boolean
  in_scope: MeetingScene[]
  out_of_scope: MeetingScene[]
  detected_at?: string | null
  stale?: boolean
}

export const getMeetingScenes = (meetingId: number) =>
  api.get<MeetingScenes>(`/meetings/${meetingId}/scenes`).then(r => r.data)

export const detectMeetingScenes = (meetingId: number) =>
  api.post<MeetingScenes>(`/meetings/${meetingId}/scenes/detect`).then(r => r.data)
