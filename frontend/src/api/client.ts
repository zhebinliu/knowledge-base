import axios from 'axios'

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// ── Types ────────────────────────────────────────────────────────────────────

export interface Document {
  id: string
  filename: string
  original_format: string
  conversion_status: 'pending' | 'converting' | 'slicing' | 'completed' | 'failed'
  conversion_quality_score?: number
  created_at: string
  updated_at: string
}

export interface Chunk {
  id: string
  document_id: string
  content: string
  chunk_index: number
  ltc_stage: string
  ltc_stage_confidence: number
  industry: string
  module: string
  tags: string[]
  char_count: number
  review_status: 'pending' | 'approved' | 'rejected' | 'needs_review'
  reviewed_by?: string
  reviewed_at?: string
  created_at: string
}

export interface ReviewItem {
  id: string
  chunk_id: string
  reason: string
  created_at: string
  chunk_content?: string | null
  chunk_ltc_stage?: string | null
  chunk_index?: number | null
}

export interface Stats {
  documents: number
  chunks: number
  vectors: number
}

// ── Documents ────────────────────────────────────────────────────────────────

export const uploadDocument = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return api.post<Document>('/documents/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const listDocuments = () =>
  api.get<Document[]>('/documents').then(r => r.data)

export const deleteDocument = (id: string) =>
  api.delete(`/documents/${id}`)

export const getDocumentStatus = (id: string) =>
  api.get<{ id: string; conversion_status: string; chunk_count: number }>(`/documents/${id}/status`).then(r => r.data)

export const getDocumentMarkdown = (id: string) =>
  api.get<{ id: string; filename: string; status: string; markdown_content: string | null }>(`/documents/${id}`).then(r => r.data)

export const getDocumentChunks = (id: string) =>
  api.get<Chunk[]>(`/documents/${id}/chunks`).then(r => r.data)

// ── Chunks ───────────────────────────────────────────────────────────────────

export interface ChunkFilter {
  ltc_stage?: string
  industry?: string
  review_status?: string
  limit?: number
  offset?: number
}

export const listChunks = (params: ChunkFilter = {}) =>
  api.get<Chunk[]>('/chunks', { params }).then(r => r.data)

export const updateChunk = (id: string, body: Partial<Pick<Chunk, 'content' | 'ltc_stage' | 'industry' | 'module' | 'tags'>>) =>
  api.put(`/chunks/${id}`, body)

// ── QA ───────────────────────────────────────────────────────────────────────

export interface QARequest {
  question: string
  ltc_stage?: string
  industry?: string
}

export interface QAResponse {
  answer: string
  sources?: Chunk[]
  [key: string]: unknown
}

export const askQuestion = (body: QARequest) =>
  api.post<QAResponse>('/qa/ask', body).then(r => r.data)

// ── Challenge Schedules ─────────────────────────────────────────────────────

export interface ChallengeSchedule {
  id: string
  name: string
  stages: string[]
  questions_per_stage: number
  cron_expression: string
  enabled: boolean
  last_run_at?: string | null
}

export interface ScheduleBody {
  name?: string
  stages?: string[]
  questions_per_stage?: number
  cron_expression?: string
  enabled?: boolean
}

export const listChallengeSchedules = () =>
  api.get<ChallengeSchedule[]>('/challenge/schedules').then(r => r.data)

export const createChallengeSchedule = (body: ScheduleBody) =>
  api.post<{ id: string }>('/challenge/schedules', body).then(r => r.data)

export const updateChallengeSchedule = (id: string, body: ScheduleBody) =>
  api.put(`/challenge/schedules/${id}`, body)

export const deleteChallengeSchedule = (id: string) =>
  api.delete(`/challenge/schedules/${id}`)

export const toggleChallengeSchedule = (id: string) =>
  api.post<{ id: string; enabled: boolean }>(`/challenge/schedules/${id}/toggle`).then(r => r.data)

// ── Review ───────────────────────────────────────────────────────────────────

export const listReviewQueue = () =>
  api.get<ReviewItem[]>('/review/queue').then(r => r.data)

export const approveReview = (id: string, note?: string) =>
  api.post(`/review/${id}/approve`, { reviewer: 'admin', note })

export const rejectReview = (id: string, note?: string) =>
  api.post(`/review/${id}/reject`, { reviewer: 'admin', note })

// ── Agent Settings ──────────────────────────────────────────────────────────

export interface ModelEntry {
  key: string; provider: string; api_base: string; model_id: string
  api_key_env: string; max_context: number; best_for: string[]
}
export interface RoutingRule { task: string; primary: string; fallback: string }
export interface TaskParamsEntry { task: string; max_tokens: number; temperature: number; timeout: number }
export interface PromptEntry { key: string; template: string; variables: string[]; preview?: string }
export interface ApiKeyEntry { key: string; masked_value: string; source: string; is_set: boolean }

export const getModels = () => api.get<ModelEntry[]>('/settings/models').then(r => r.data)
export const createModel = (body: { key: string; provider: string; api_base: string; model_id: string; api_key_env: string; max_context: number; best_for: string[] }) =>
  api.post('/settings/models', body)
export const updateModel = (key: string, body: Partial<ModelEntry>) => api.put(`/settings/models/${key}`, body)
export const deleteModel = (key: string) => api.delete(`/settings/models/${key}`)
export const getRoutingRules = () => api.get<RoutingRule[]>('/settings/routing').then(r => r.data)
export const updateRoutingRule = (task: string, body: { primary: string; fallback: string }) => api.put(`/settings/routing/${task}`, body)
export const deleteRoutingRule = (task: string) => api.delete(`/settings/routing/${task}`)
export const getTaskParams = () => api.get<TaskParamsEntry[]>('/settings/task-params').then(r => r.data)
export const updateTaskParams = (task: string, body: { max_tokens: number; temperature: number; timeout: number }) => api.put(`/settings/task-params/${task}`, body)
export const getPrompts = () => api.get<PromptEntry[]>('/settings/prompts').then(r => r.data)
export const getPromptDetail = (key: string) => api.get<PromptEntry>(`/settings/prompts/${key}`).then(r => r.data)
export const updatePrompt = (key: string, body: { template: string }) => api.put(`/settings/prompts/${key}`, body)
export const resetPrompt = (key: string) => api.post(`/settings/prompts/${key}/reset`)
export const getApiKeys = () => api.get<ApiKeyEntry[]>('/settings/api-keys').then(r => r.data)
export const updateApiKey = (key: string, value: string) => api.put(`/settings/api-keys/${key}`, { value })
export const deleteApiKey = (key: string) => api.delete(`/settings/api-keys/${key}`)

// ── Stats ────────────────────────────────────────────────────────────────────

export const getStats = () =>
  api.get<Stats>('/stats').then(r => r.data)
