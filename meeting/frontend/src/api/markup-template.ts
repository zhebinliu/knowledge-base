/**
 * 会议纪要版面模板 API。
 * 对应后端 /api/markup-templates 路由。
 */
import { api } from './client'

// ── 类型 ──────────────────────────────────────────────────────────────────

export interface MarkupTemplate {
  id: number
  name: string
  description: string
  content: string
  category: 'preset' | 'user_upload'
  source_format: 'markdown' | 'docx' | 'image'
  is_builtin: boolean
  created_at: string | null
  updated_at: string | null
}

export interface TemplateRenderResult {
  template_id: number
  template_name: string
  meeting_id: number
  meeting_title: string
  rendered: string
}

export interface PlaceholderInfo {
  [key: string]: string
}

// ── API ───────────────────────────────────────────────────────────────────

/** 列出所有版面模板 */
export function listMarkupTemplates() {
  return api.get<MarkupTemplate[]>('/markup-templates').then(r => r.data)
}

/** 获取可用占位符说明 */
export function getPlaceholderHelp() {
  return api.get<PlaceholderInfo>('/markup-templates/placeholders').then(r => r.data)
}

/** 按 ID 获取模板 */
export function getMarkupTemplate(id: number) {
  return api.get<MarkupTemplate>(`/markup-templates/${id}`).then(r => r.data)
}

/** 手动创建模板（输入 Markdown） */
export function createMarkupTemplate(data: { name: string; description?: string; content: string }) {
  return api.post<MarkupTemplate>('/markup-templates', data).then(r => r.data)
}

/** 上传模板文件（.md / .docx / 图片），自动解析 */
export function uploadMarkupTemplate(file: File, name?: string, description?: string) {
  const form = new FormData()
  form.append('file', file)
  if (name) form.append('name', name)
  if (description) form.append('description', description)
  return api.post<MarkupTemplate>('/markup-templates/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

/** 更新模板 */
export function updateMarkupTemplate(id: number, data: { name?: string; description?: string; content?: string }) {
  return api.patch<MarkupTemplate>(`/markup-templates/${id}`, data).then(r => r.data)
}

/** 删除模板 */
export function deleteMarkupTemplate(id: number) {
  return api.delete(`/markup-templates/${id}`)
}

/** 用模板渲染会议数据（预览） */
export function renderTemplate(templateId: number, meetingId: number) {
  return api.post<TemplateRenderResult>(`/markup-templates/${templateId}/render`, { meeting_id: meetingId }).then(r => r.data)
}

/** 导出为 DOCX（返回 blob） */
export function exportTemplateDocx(templateId: number, meetingId: number) {
  return api.post(`/markup-templates/${templateId}/export-docx`, { meeting_id: meetingId }, { responseType: 'blob' }).then(r => r.data)
}

/** 导出为 Markdown（返回 blob） */
export function exportTemplateMd(templateId: number, meetingId: number) {
  return api.post(`/markup-templates/${templateId}/export-md`, { meeting_id: meetingId }, { responseType: 'blob' }).then(r => r.data)
}
