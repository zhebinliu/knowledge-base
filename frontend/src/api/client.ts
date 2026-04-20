import axios from 'axios'

export const TOKEN_STORAGE_KEY = 'kb_access_token'

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// 请求拦截：自动附加 Authorization
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY)
  if (token) {
    config.headers = config.headers ?? {}
    ;(config.headers as Record<string, string>).Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截：401 先尝试 refresh，成功则重试原请求；refresh 也失败才跳登录
let _refreshing = false
let _refreshQueue: Array<(token: string) => void> = []

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const status = err?.response?.status
    const url: string = err?.config?.url ?? ''
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/refresh')
    if (status === 401 && !isAuthEndpoint) {
      const original = err.config
      if (_refreshing) {
        // 等待正在进行的 refresh 完成后重试
        return new Promise((resolve) => {
          _refreshQueue.push((token) => {
            original.headers['Authorization'] = `Bearer ${token}`
            resolve(api(original))
          })
        })
      }
      _refreshing = true
      try {
        const res = await api.post<{ access_token: string }>('/auth/refresh')
        const newToken = res.data.access_token
        localStorage.setItem(TOKEN_STORAGE_KEY, newToken)
        _refreshQueue.forEach((cb) => cb(newToken))
        _refreshQueue = []
        original.headers['Authorization'] = `Bearer ${newToken}`
        return api(original)
      } catch {
        _refreshQueue = []
        localStorage.removeItem(TOKEN_STORAGE_KEY)
        if (window.location.pathname !== '/login') {
          const next = encodeURIComponent(window.location.pathname + window.location.search)
          window.location.assign(`/login?next=${next}`)
        }
        return Promise.reject(err)
      } finally {
        _refreshing = false
      }
    }
    return Promise.reject(err)
  },
)

export const refreshToken = () =>
  api.post<{ access_token: string; token_type: string }>('/auth/refresh').then(r => {
    localStorage.setItem(TOKEN_STORAGE_KEY, r.data.access_token)
    return r.data
  })

// ── Types ────────────────────────────────────────────────────────────────────

export interface Document {
  id: string
  filename: string
  original_format: string
  conversion_status: 'pending' | 'converting' | 'slicing' | 'completed' | 'failed'
  conversion_quality_score?: number
  uploader_id?: string | null
  uploader_name?: string | null
  project_id?: string | null
  project_name?: string | null
  doc_type?: string | null
  doc_type_label?: string | null
  created_at: string
  updated_at: string
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  username: string
  email: string | null
  full_name: string | null
  is_admin: boolean
  is_active: boolean
  must_change_password: boolean
  sso_provider: string | null
  allowed_modules: string[] | null  // null = 全部模块
  created_at: string
  last_login_at: string | null
}

export interface LoginResponse {
  access_token: string
  token_type: string
  user: AuthUser
}

export const login = (username: string, password: string) =>
  api.post<LoginResponse>('/auth/login', { username, password }).then(r => r.data)

export const register = (body: { username: string; password: string; email?: string; full_name?: string }) =>
  api.post<LoginResponse>('/auth/register', body).then(r => r.data)

export const fetchMe = () =>
  api.get<AuthUser>('/auth/me').then(r => r.data)

export const changePassword = (body: { old_password?: string; new_password: string }) =>
  api.post<{ ok: boolean }>('/auth/change-password', body).then(r => r.data)

export const getMcpKeyStatus = () =>
  api.get<{ has_key: boolean; preview: string | null }>('/auth/mcp-key').then(r => r.data)

export const generateMcpKey = () =>
  api.post<{ mcp_api_key: string }>('/auth/mcp-key').then(r => r.data)

export const revokeMcpKey = () =>
  api.delete('/auth/mcp-key')

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

export interface UploadOptions {
  project_id?: string | null
  doc_type?: string | null
}

export const uploadDocument = (file: File, opts: UploadOptions = {}) => {
  const form = new FormData()
  form.append('file', file)
  if (opts.project_id) form.append('project_id', opts.project_id)
  if (opts.doc_type) form.append('doc_type', opts.doc_type)
  return api.post<Document>('/documents/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export interface DocumentFilter {
  project_id?: string  // 'none' = 无项目
  doc_type?: string
}

export const listDocuments = (params: DocumentFilter = {}) =>
  api.get<Document[]>('/documents', { params }).then(r => r.data)

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

export interface GenerateDocRequest {
  template: string
  project_name: string
  industry: string
  query?: string
}

export const generateDoc = (body: GenerateDocRequest) =>
  api.post<{ content: string }>('/qa/generate-doc', body).then(r => r.data)

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

export const approveReview = (id: string, reviewer?: string, note?: string) =>
  api.post(`/review/${id}/approve`, { reviewer: reviewer || 'unknown', note })

export const rejectReview = (id: string, reviewer?: string, note?: string) =>
  api.post(`/review/${id}/reject`, { reviewer: reviewer || 'unknown', note })

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

// ── Projects ─────────────────────────────────────────────────────────────────

export interface ProjectMeta {
  modules: string[]
  doc_types: { value: string; label: string }[]
}

export interface Project {
  id: string
  name: string
  customer: string | null
  modules: string[]
  kickoff_date: string | null  // YYYY-MM-DD
  description: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  document_count: number
}

export interface ProjectInput {
  name: string
  customer?: string | null
  modules?: string[] | null
  kickoff_date?: string | null
  description?: string | null
}

export interface ProjectDocument {
  id: string
  filename: string
  original_format: string
  conversion_status: string
  doc_type: string | null
  doc_type_label: string | null
  uploader_id: string | null
  uploader_name: string | null
  created_at: string
  updated_at: string
}

export const getProjectMeta = () =>
  api.get<ProjectMeta>('/projects/meta').then(r => r.data)

export const listProjects = () =>
  api.get<Project[]>('/projects').then(r => r.data)

export const getProject = (id: string) =>
  api.get<Project>(`/projects/${id}`).then(r => r.data)

export const createProject = (body: ProjectInput) =>
  api.post<Project>('/projects', body).then(r => r.data)

export const updateProject = (id: string, body: Partial<ProjectInput>) =>
  api.patch<Project>(`/projects/${id}`, body).then(r => r.data)

export const deleteProject = (id: string, cascade = false) =>
  api.delete(`/projects/${id}`, { params: { cascade } })

export const listProjectDocuments = (id: string) =>
  api.get<ProjectDocument[]>(`/projects/${id}/documents`).then(r => r.data)

// ── Challenge runs (history) ─────────────────────────────────────────────────

export interface ChallengeRun {
  id: string
  trigger_type: 'manual' | 'scheduled'
  triggered_by: string | null
  triggered_by_name: string | null
  target_stages: string[]
  questions_per_stage: number
  started_at: string
  finished_at: string | null
  duration_seconds: number | null
  total: number
  passed: number
  failed: number
  pass_rate: number
  status: 'running' | 'completed' | 'failed'
  error_message: string | null
}

export interface ChallengeRunQuestion {
  chunk_id: string
  ltc_stage: string | null
  score: number | null
  review_status: string
  tags: string[]
  content: string
  created_at: string
}

export interface ChallengeRunDetail extends ChallengeRun {
  questions: ChallengeRunQuestion[]
}

export const listChallengeRuns = (limit = 50, offset = 0) =>
  api.get<{ total: number; items: ChallengeRun[] }>('/challenge/runs', {
    params: { limit, offset },
  }).then(r => r.data)

export const getChallengeRun = (id: string) =>
  api.get<ChallengeRunDetail>(`/challenge/runs/${id}`).then(r => r.data)

// ── User management (admin) ──────────────────────────────────────────────────

export const listUsers = () =>
  api.get<AuthUser[]>('/users').then(r => r.data)

export const createUser = (body: {
  username: string; password?: string; full_name?: string; email?: string;
  is_admin?: boolean; allowed_modules?: string[] | null
}) =>
  api.post<AuthUser & { initial_password?: string }>('/users', body).then(r => r.data)

export const updateUser = (id: string, body: {
  is_admin?: boolean; is_active?: boolean; full_name?: string; email?: string; allowed_modules?: string[] | null
}) =>
  api.patch<AuthUser>(`/users/${id}`, body).then(r => r.data)

export const resetUserPassword = (id: string, newPassword?: string) =>
  api.post<{ ok: true; must_change_password: boolean; new_password: string | null }>(
    `/users/${id}/reset-password`,
    { new_password: newPassword ?? null },
  ).then(r => r.data)

export const deleteUser = (id: string) =>
  api.delete(`/users/${id}`)

// ── Export ───────────────────────────────────────────────────────────────────

export const exportChunks = (params: { ltc_stage?: string; industry?: string } = {}) =>
  api.post<{ chunks: object[]; count: number }>('/transfer/export', params).then(r => r.data)

// ── Stats ────────────────────────────────────────────────────────────────────

export const getStats = () =>
  api.get<Stats>('/stats').then(r => r.data)
