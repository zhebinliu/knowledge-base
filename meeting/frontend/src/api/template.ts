/**
 * 会议纪要模板管理 API 客户端。
 *
 * 提供模板列表、活跃模板、创建、激活以及触发演化的接口。
 *
 * ## 在宿主 kb-system 中的集成
 *
 * 后端:在 kb-system 的 main.py 注册路由:
 *   from api.template import router as template_router
 *   app.include_router(template_router, prefix="/api/templates", tags=["templates"])
 *
 * 前端:在 ConsoleMeetingDetail 或独立设置页引入本模块:
 *   import { listTemplates, getActiveTemplate, activateTemplate, evolveTemplate }
 *   from '../../api/template'
 */
import { api } from './client'

// ── 类型定义 ─────────────────────────────────────────────────────────────

export interface MeetingTemplate {
  id: number
  name: string
  description: string
  schema_structure: string
  format_requirements: string
  style_preferences: string
  version: number
  is_active: boolean
  source_meeting_ids: number[]
  source_kb_doc_refs: string[]
  evolution_method: string
  change_log: string
  created_at: string
  updated_at: string
}

// ── API ──────────────────────────────────────────────────────────────────

/** 列出所有模板 */
export function listTemplates() {
  return api.get<MeetingTemplate[]>('/api/templates')
}

/** 获取当前活跃模板 */
export function getActiveTemplate() {
  return api.get<MeetingTemplate | Record<string, never>>('/api/templates/active')
}

/** 获取单个模板 */
export function getTemplate(id: number) {
  return api.get<MeetingTemplate>(`/api/templates/${id}`)
}

/** 手动创建模板 */
export function createTemplate(data: Partial<MeetingTemplate>) {
  return api.post<MeetingTemplate>('/api/templates', data)
}

/** 激活指定模板 */
export function activateTemplate(id: number) {
  return api.post<MeetingTemplate>(`/api/templates/${id}/activate`)
}

/** 触发后台模板演化 */
export function evolveTemplate(method: 'user_edit' | 'kb_analysis' | 'combined' = 'combined') {
  return api.post<{ status: string; method: string; message: string }>(
    `/api/templates/evolve?method=${method}`,
  )
}

/** 保存用户编辑后的会议纪要（用于模板演化） */
export function saveEditedMinutes(meetingId: number, editedMinutes: Record<string, unknown>) {
  return api.put<{ status: string; edited_minutes: Record<string, unknown> }>(
    `/api/meeting/${meetingId}/edited-minutes`,
    { edited_minutes: editedMinutes },
  )
}
