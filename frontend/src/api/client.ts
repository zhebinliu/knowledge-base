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

    // 2026-05-12:其他失败(非 401 / 非 auth 端点)统一弹 toast
    // 避免重复弹:同一 url + status 在 1.5s 内只弹一次
    if (status !== 401 && status !== 422 /* 表单校验由调用方自己处理 */) {
      try {
        const detail = err?.response?.data?.detail
        const msg = (typeof detail === 'string' && detail) || err?.message || '请求失败'
        // 静态 import 会形成循环依赖,用动态 import
        import('../components/Toaster').then(({ toast }) => {
          toast.error(status ? `[${status}] ${msg}` : msg)
        }).catch(() => {})
      } catch { /* ignore */ }
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
  conversion_status: 'pending' | 'converting' | 'slicing' | 'retrying' | 'completed' | 'failed'
  conversion_error?: string | null
  conversion_quality_score?: number
  uploader_id?: string | null
  uploader_name?: string | null
  project_id?: string | null
  project_name?: string | null
  doc_type?: string | null
  doc_type_label?: string | null
  industry?: string | null
  convert_duration_s?: number | null
  slice_duration_s?: number | null
  embed_duration_s?: number | null
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
  role: 'admin' | 'console_user' | string  // 对外工作台分流
  is_active: boolean
  must_change_password: boolean
  sso_provider: string | null
  allowed_modules: string[] | null  // null = 全部模块
  api_enabled: boolean
  created_at: string
  last_login_at: string | null
}

export interface LoginResponse {
  access_token: string
  token_type: string
  user: AuthUser
}

export const login = (body: {
  username: string
  password: string
  captcha_id?: string
  captcha_answer?: string
}) => api.post<LoginResponse>('/auth/login', body).then(r => r.data)

export const register = (body: {
  username: string
  password: string
  email?: string
  full_name?: string
  invite_code: string
  captcha_id: string
  captcha_answer: string
}) => api.post<LoginResponse>('/auth/register', body).then(r => r.data)

// 图形验证码:GET 拿一次,5 分钟有效 + 一次性消费;前端展示 PNG + 用户填答案
export interface CaptchaChallenge {
  captcha_id: string
  image_b64: string   // data:image/png;base64,...
}
export const getCaptcha = () =>
  api.get<CaptchaChallenge>('/auth/captcha').then(r => r.data)

// ── 后台:邀请码管理 ─────────────────────────────────────────────────────────

export interface InviteCode {
  id: string
  code: string
  created_by: string | null
  max_uses: number              // 0 = 无限
  used_count: number
  expires_at: string | null     // null = 永久
  target_role: 'console_user' | 'admin'
  revoked: boolean
  note: string | null
  status: 'active' | 'expired' | 'exhausted' | 'revoked'
  created_at: string
  updated_at: string
}

export const listInviteCodes = (limit = 100) =>
  api.get<{ items: InviteCode[] }>('/admin/invite-codes', { params: { limit } }).then(r => r.data)

export const createInviteCode = (body: {
  max_uses: number
  expires_in_days: number
  target_role: 'console_user' | 'admin'
  note?: string | null
}) => api.post<InviteCode>('/admin/invite-codes', body).then(r => r.data)

export const revokeInviteCode = (id: string) =>
  api.post<InviteCode>(`/admin/invite-codes/${id}/revoke`).then(r => r.data)

// ── 后台:修订学习记忆管理(2026-06-08)──────────────────────────────────────

export type BundleMemoryKind =
  | 'insight'
  | 'survey'
  | 'survey_outline'
  | 'research_plan'
  | 'research_report'
  | 'blueprint_design'
  | 'object_field_layout'
  | 'process_setup'
  | 'implementation_plan'
  | 'test_plan'
  | 'acceptance_report'

export interface BundleMemory {
  id: string
  bundle_kind: BundleMemoryKind
  source_bundle_id: string | null
  source_bundle_title: string | null
  source_project_id: string | null
  source_project_name: string | null
  source_user_id: string | null
  source_username: string | null
  notes_md: string
  enabled: boolean
  original_chars: number | null
  new_chars: number | null
  llm_model: string | null
  created_at: string
  updated_at: string
}

export const listBundleMemories = (params: {
  kind?: BundleMemoryKind
  enabled?: boolean
  limit?: number
  offset?: number
}) =>
  api.get<{ items: BundleMemory[]; total: number; limit: number; offset: number }>(
    '/admin/bundle-memories', { params }
  ).then(r => r.data)

export const fetchBundleMemoriesKindsSummary = () =>
  api.get<{ summary: Record<BundleMemoryKind, { enabled: number; total: number }> }>(
    '/admin/bundle-memories/kinds'
  ).then(r => r.data)

export const updateBundleMemory = (id: string, body: { enabled?: boolean; notes_md?: string }) =>
  api.patch<BundleMemory>(`/admin/bundle-memories/${id}`, body).then(r => r.data)

export const deleteBundleMemory = (id: string) =>
  api.delete<{ ok: boolean }>(`/admin/bundle-memories/${id}`).then(r => r.data)

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
  citation_count?: number
  last_cited_at?: string | null
  source_section?: string | null
  generated_by_model?: string | null
}

export interface ReviewItem {
  id: string
  chunk_id: string
  reason: string
  created_at: string
  chunk_content?: string | null
  chunk_ltc_stage?: string | null
  chunk_ltc_stage_confidence?: number | null
  chunk_index?: number | null
  chunk_industry?: string | null
  chunk_module?: string | null
  chunk_tags?: string[] | null
  chunk_source_section?: string | null
  chunk_generated_by_model?: string | null
}

export interface IndustryStat {
  key: string
  label: string
  documents: number
  chunks: number
}

export interface DocTypeStat {
  key: string
  label: string
  documents: number
}

export interface Stats {
  documents: number
  chunks: number
  vectors: number
  status_distribution?: Record<string, number>
  industry_distribution?: IndustryStat[]
  doctype_distribution?: DocTypeStat[]
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
  limit?: number
  offset?: number
}

export interface DocumentPage {
  total: number
  items: Document[]
}

export const listDocuments = (params: DocumentFilter = {}) =>
  api.get<DocumentPage>('/documents', { params }).then(r => r.data)

export const deleteDocument = (id: string) =>
  api.delete(`/documents/${id}`)

export const updateDocumentMeta = (id: string, body: { project_id?: string | null; doc_type?: string | null; industry?: string | null }) =>
  api.patch<{ id: string; project_id: string | null; project_name: string | null; doc_type: string | null; doc_type_label: string | null; industry: string | null }>(
    `/documents/${id}`, body
  ).then(r => r.data)

export const getDocumentStatus = (id: string) =>
  api.get<{ id: string; conversion_status: string; chunk_count: number }>(`/documents/${id}/status`).then(r => r.data)

export interface DocumentFaqItem { q: string; a: string }

export const getDocumentMarkdown = (id: string) =>
  api.get<{
    id: string; filename: string; status: string; markdown_content: string | null
    summary?: string | null; faq?: DocumentFaqItem[] | null
    convert_duration_s?: number | null; slice_duration_s?: number | null; embed_duration_s?: number | null
  }>(`/documents/${id}`).then(r => r.data)

export const getDocumentChunks = (id: string) =>
  api.get<Chunk[]>(`/documents/${id}/chunks`).then(r => r.data)

/** 在线编辑保存文档 markdown(用户在预览框直接改提取出来的 md)。
 *  后端覆盖式更新 markdown_content 并异步重新切片+重新嵌入。
 *  已生成的洞察 / 调研报告不变,下一次 RAG 检索会用新切片。 */
export const updateDocumentMarkdown = (id: string, content_md: string) =>
  api.put<{ ok: boolean; bytes: number; reslice_enqueued: boolean }>(
    `/documents/${id}/markdown`, { content_md }
  ).then(r => r.data)

// ── Chunks ───────────────────────────────────────────────────────────────────

export interface ChunkFilter {
  ltc_stage?: string
  industry?: string
  review_status?: string
  usage?: 'hot' | 'unused'
  limit?: number
  offset?: number
}

export interface ChunkPage {
  total: number
  items: Chunk[]
}

export const listChunks = (params: ChunkFilter = {}) =>
  api.get<ChunkPage>('/chunks', { params }).then(r => r.data)

export const updateChunk = (id: string, body: Partial<Pick<Chunk, 'content' | 'ltc_stage' | 'industry' | 'module' | 'tags'>>) =>
  api.put(`/chunks/${id}`, body)

// ── QA ───────────────────────────────────────────────────────────────────────

export type QAPersona = 'general' | 'pm'

export interface QAHistoryItem {
  role: 'user' | 'assistant'
  content: string
}

export interface QARequest {
  question: string
  ltc_stage?: string
  industry?: string
  history?: QAHistoryItem[]
  persona?: QAPersona
  project_id?: string | null
  conversation_id?: string | null
}

export interface QASource {
  id: string
  score?: number
  ltc_stage?: string | null
  content?: string
  document_id?: string
  source_section?: string
}

export interface QAResponse {
  answer: string
  model?: string | null
  sources?: QASource[]
  question_log_id?: string
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

// Conversations
export interface QAConversation {
  id: string
  title: string
  persona: QAPersona
  project_id: string | null
  ltc_stage: string | null
  industry: string | null
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
    sources?: QASource[]
    model?: string | null
    question_log_id?: string
    ts?: string
  }>
  created_at: string
  updated_at: string
}

export const listConversations = (limit = 30, offset = 0) =>
  api.get<{ items: QAConversation[] }>('/qa/conversations', { params: { limit, offset } }).then(r => r.data.items)

export const createConversation = (body: {
  title?: string
  persona?: QAPersona
  project_id?: string | null
  ltc_stage?: string | null
  industry?: string | null
}) => api.post<QAConversation>('/qa/conversations', body).then(r => r.data)

export const getConversation = (id: string) =>
  api.get<QAConversation>(`/qa/conversations/${id}`).then(r => r.data)

export const patchConversation = (id: string, body: { messages: QAConversation['messages']; title?: string }) =>
  api.patch<QAConversation>(`/qa/conversations/${id}`, body).then(r => r.data)

export const deleteConversation = (id: string) =>
  api.delete(`/qa/conversations/${id}`)

// Feedback
export const submitAnswerFeedback = (body: { question_log_id: string; rating: 'up' | 'down' | 'star'; comment?: string }) =>
  api.post<{ ok: boolean; rating: string }>('/qa/feedback', body).then(r => r.data)

// Unanswered queue
export interface UnansweredItem {
  id: string
  question: string
  answer_preview: string | null
  persona: QAPersona
  project_id: string | null
  user_id: string | null
  created_at: string
}

export const listUnanswered = (limit = 20, offset = 0) =>
  api.get<{ total: number; items: UnansweredItem[] }>('/qa/unanswered', { params: { limit, offset } }).then(r => r.data)

export const resolveUnanswered = (id: string) =>
  api.post(`/qa/unanswered/${id}/resolve`)

// ── Challenge Schedules ─────────────────────────────────────────────────────

export interface ChallengeSchedule {
  id: string
  name: string
  stages: string[]
  questions_per_stage: number
  question_mode?: 'kb_based' | 'free_form'
  cron_expression: string
  enabled: boolean
  last_run_at?: string | null
}

export interface ScheduleBody {
  name?: string
  stages?: string[]
  questions_per_stage?: number
  question_mode?: 'kb_based' | 'free_form'
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

export const batchApproveReview = (reviewer: string, reviewIds?: string[]) =>
  api.post<{ ok: boolean; approved: number }>('/review/batch-approve', {
    reviewer,
    review_ids: reviewIds,
  }).then(r => r.data)

// ── Coverage gaps ────────────────────────────────────────────────────────────

export interface CoverageGap {
  id: string
  ltc_stage: string | null
  ltc_stage_label: string | null
  industry: string | null
  industry_label: string | null
  fail_count: number
  keywords: string[]
  sample_questions: string[]
  last_seen_at: string
  created_at: string
}

export const listCoverageGaps = (limit = 10) =>
  api.get<{ total: number; items: CoverageGap[] }>('/coverage/gaps', { params: { limit } }).then(r => r.data)

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

/** 四级行业树:L1 → L2 → L3 → L4 名称列表(后端 backend/prompts/industry_tree.py) */
export type IndustryTree = Record<string, Record<string, Record<string, string[]>>>

export interface ProjectMeta {
  modules: string[]
  doc_types: { value: string; label: string }[]
  /** 老一级行业枚举,向后兼容(已有项目 / 文档打标用) */
  industries: { value: string; label: string }[]
  /** 新四级行业树(2026-05 起新建项目走这个);项目 industry 字段存 "L1/L2/L3/L4" */
  industry_tree?: IndustryTree
}

export type ProjectRole = 'owner' | 'read_write' | 'read' | 'admin' | 'none'

export interface Project {
  id: string
  name: string
  customer: string | null
  industry: string | null
  modules: string[]
  kickoff_date: string | null  // YYYY-MM-DD
  description: string | null
  customer_profile: string | null
  aliases?: string[]            // 客户名 / 项目名变体 — 文档脱敏用
  created_by: string | null
  created_at: string
  updated_at: string
  document_count: number
  /** 当前用户对该项目的角色(后端按权限计算)— 用于前端控制按钮 disable */
  my_role?: ProjectRole
}

export interface ProjectInput {
  name: string
  customer?: string | null
  industry?: string | null
  modules?: string[] | null
  kickoff_date?: string | null
  description?: string | null
  customer_profile?: string | null
  aliases?: string[] | null
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

/** 删除项目。
 *  - cascade: 仅解除关联文档的 project_id(不删文档)
 *  - purgeDocuments: 连带彻底删除关联文档(切片向量 + minio 原文件),不可恢复 */
export const deleteProject = (id: string, opts: { cascade?: boolean; purgeDocuments?: boolean } = {}) =>
  api.delete(`/projects/${id}`, {
    params: { cascade: opts.cascade ?? false, purge_documents: opts.purgeDocuments ?? false },
  })

export const generateCustomerProfile = (id: string) =>
  api.post<{ profile: string }>(`/projects/${id}/generate_profile`).then(r => r.data)

// ── 协作者(项目权限) ───────────────────────────────────────────────────────

export type CollaboratorRole = 'read' | 'read_write'
export type ProjectMemberRole = 'pm' | 'consultant' | 'customer'   // 项目角色分类(与访问 ProjectRole 正交)

export interface ProjectOwner {
  user_id: string | null
  username: string | null
  full_name: string | null
  email: string | null
  is_pm?: boolean          // owner 默认即项目经理(除非某协作者被指派 pm)
}

export interface ProjectCollaborator {
  id: string
  project_id: string
  user_id: string
  username: string | null
  full_name: string | null
  email: string | null
  role: CollaboratorRole
  project_role?: ProjectMemberRole | null   // Harness:项目角色分类
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface UserSearchResult {
  id: string
  username: string
  full_name: string | null
  email: string | null
}

export const listCollaborators = (project_id: string) =>
  api.get<{ owner: ProjectOwner | null; collaborators: ProjectCollaborator[]; pm_user_id?: string | null }>(
    `/projects/${project_id}/collaborators`,
  ).then(r => r.data)

export const setCollaboratorProjectRole = (project_id: string, user_id: string, project_role: ProjectMemberRole | null) =>
  api.patch<ProjectCollaborator>(`/projects/${project_id}/collaborators/${user_id}/project-role`, { project_role }).then(r => r.data)

export const addCollaborator = (project_id: string, user_id: string, role: CollaboratorRole = 'read') =>
  api.post<ProjectCollaborator>(`/projects/${project_id}/collaborators`, { user_id, role }).then(r => r.data)

export const updateCollaboratorRole = (project_id: string, user_id: string, role: CollaboratorRole) =>
  api.patch<ProjectCollaborator>(`/projects/${project_id}/collaborators/${user_id}`, { role }).then(r => r.data)

export const removeCollaborator = (project_id: string, user_id: string) =>
  api.delete<{ ok: boolean }>(`/projects/${project_id}/collaborators/${user_id}`).then(r => r.data)

export const searchUsersForCollab = (q: string, limit = 10) =>
  api.get<UserSearchResult[]>('/projects/_/users/search', { params: { q, limit } }).then(r => r.data)

/** 转让项目所有权 — 旧 owner 自动转成 read_write 协作者,新 owner 若是协作者会被自动移除协作者记录 */
export const transferProjectOwner = (project_id: string, new_owner_user_id: string) =>
  api.post<Project>(`/projects/${project_id}/transfer-owner`, { new_owner_user_id }).then(r => r.data)


export const listProjectDocuments = (id: string) =>
  api.get<ProjectDocument[]>(`/projects/${id}/documents`).then(r => r.data)

// ── Insight 体检(生成前预 plan,规则化不调 LLM) ──────────────────────────

export interface InsightCheckupField {
  key: string
  label: string
  status: 'available' | 'deferred' | 'missing'
  source: string | null
  note: string
}

export interface InsightCheckupModule {
  key: string
  title: string
  necessity: 'critical' | 'optional'
  status: 'ready' | 'blocked' | 'skipped' | 'planned'
  reason: string
  fields: InsightCheckupField[]
}

export interface InsightCheckupGap {
  module_key: string
  field_key: string
  field_label: string
  module_title: string
  necessity: string
  action: 'kb_search' | 'web_search' | 'ask_user' | 'downgrade'
  detail: string
  required: boolean
}

export interface InsightCheckupResult {
  industry: string | null
  sufficient_critical: boolean
  modules: InsightCheckupModule[]
  gap_actions: InsightCheckupGap[]
  stats: {
    ready_n: number
    blocked_n: number
    skipped_n: number
    ask_user_n: number
    kb_search_n: number
    docs_total: number
    brief_fields_n: number
    has_conversation: boolean
  }
}

export const getInsightCheckup = (id: string) =>
  api.post<InsightCheckupResult>(`/projects/${id}/insight-checkup`).then(r => r.data)

// ── Challenge runs (history) ─────────────────────────────────────────────────

export interface ChallengeRun {
  id: string
  trigger_type: 'manual' | 'scheduled'
  triggered_by: string | null
  triggered_by_name: string | null
  target_stages: string[]
  questions_per_stage: number
  question_mode?: 'kb_based' | 'free_form'
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
  is_admin?: boolean; is_active?: boolean; full_name?: string; email?: string; allowed_modules?: string[] | null; api_enabled?: boolean
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

// ── Skills ───────────────────────────────────────────────────────────────────

export interface Skill {
  id: string
  name: string
  description: string | null
  prompt_snippet: string
  created_at: string
}

export interface SkillBody {
  name: string
  description?: string
  prompt_snippet: string
}

export const listSkills = () => api.get<Skill[]>('/settings/skills').then(r => r.data)
export const createSkill = (body: SkillBody) => api.post<Skill>('/settings/skills', body).then(r => r.data)
export const updateSkill = (id: string, body: SkillBody) => api.put<Skill>(`/settings/skills/${id}`, body).then(r => r.data)
export const deleteSkill = (id: string) => api.delete(`/settings/skills/${id}`)

// ── Output Agents ─────────────────────────────────────────────────────────────

export interface OutputAgentConfig {
  key: string
  prompt: string
  skill_ids: string[]
  model: string | null
}

export const listOutputAgents = () => api.get<OutputAgentConfig[]>('/settings/output-agents').then(r => r.data)
export const updateOutputAgent = (key: string, body: { prompt: string; skill_ids: string[]; model: string | null }) =>
  api.put(`/settings/output-agents/${key}`, body)

// ── Doc Checklist (项目文档清单 + 虚拟物状态) ──────────────────────────────

export interface DocChecklistItem {
  doc_type: string
  label: string
  necessity: 'required' | 'recommended'
  uploaded: boolean
  uploaded_count: number
  documents: { doc_id: string; filename: string; status: string; error?: string | null; progress?: string | null; uploaded_at: string | null }[]
  kind: 'doc'
}
export interface VirtualChecklistItem {
  key: string                                  // v_success_metrics / v_risk_alert / v_guided_questionnaire
  label: string
  description: string
  necessity: 'required' | 'recommended'
  filled: boolean
  filled_count: number
  total_count: number
  kind: 'virtual'
}
export interface ExtraReferenceItem {
  doc_id: string
  filename: string
  status: string
  error?: string | null
  progress?: string | null
  uploaded_at: string | null
}
export interface CandidateAttachItem {
  doc_id: string
  filename: string
  doc_type: string | null
  doc_type_label: string | null
  status: string
  uploaded_at: string | null
}
export interface DocChecklistDto {
  stage: string
  stage_has_checklist: boolean
  required_docs: DocChecklistItem[]
  recommended_docs: DocChecklistItem[]
  virtual_required: VirtualChecklistItem[]
  virtual_recommended: VirtualChecklistItem[]
  extra_references?: ExtraReferenceItem[]            // 附加参考文档(已挂在洞察的)
  candidates_to_attach?: CandidateAttachItem[]       // 项目里其他可被关联进来的文档
  completion: {
    required: number; required_total: number
    recommended: number; recommended_total: number
    virtual_required: number; virtual_required_total: number
    virtual_recommended: number; virtual_recommended_total: number
    all_required_done: boolean
  }
}


export const getDocChecklist = (projectId: string, stage = 'insight') =>
  api.get<DocChecklistDto>(`/doc-checklist/${projectId}`, { params: { stage } }).then(r => r.data)


// ── Smart Advice (项目级 AI 智能建议) ────────────────────────────────────────

export interface SmartAdviceDto {
  exists?: boolean
  project_id?: string
  advice_md?: string
  next_steps?: string[]
  risks?: string[]
  is_stale?: boolean
  is_fresh?: boolean
  model_used?: string | null
  error?: string | null
  generated_at?: string | null
}

/** GET 智能建议 — 默认 cache miss 时同步生成(可能等几秒);fresh_only=true 仅读不触发 */
export const getSmartAdvice = (projectId: string, freshOnly = false) =>
  api.get<SmartAdviceDto>(`/projects/${projectId}/smart-advice`, { params: freshOnly ? { fresh_only: true } : {} }).then(r => r.data)

/** 强制刷新智能建议(用户手动点) */
export const refreshSmartAdvice = (projectId: string) =>
  api.post<SmartAdviceDto>(`/projects/${projectId}/smart-advice/refresh`).then(r => r.data)


// ── Virtual Artifacts (成功指标 / 风险预警 等问卷型虚拟物) ──────────────────

export interface VirtualArtifactDto {
  vkey: string
  title: string
  description: string
  ask_user_prompts: AgenticGapPrompt[]              // 复用 GapFiller 类型
  current_values: Record<string, BriefFieldCell>
}

export const getVirtualArtifact = (vkey: string, projectId: string) =>
  api.get<VirtualArtifactDto>(`/virtual/${vkey}`, { params: { project_id: projectId } }).then(r => r.data)

export const submitVirtualArtifact = (vkey: string, projectId: string, fields: Record<string, any>) =>
  api.post<{ ok: boolean; vkey: string; fields_saved: number }>(
    `/virtual/${vkey}/submit`, { fields }, { params: { project_id: projectId } },
  ).then(r => r.data)

// ── Web Suggest (字段试探 Web 抓取建议) ────────────────────────────────────

export interface WebSuggestCandidate {
  text: string
  source_title: string
  source_url: string
  source_domain: string
}
export interface WebSuggestResponse {
  ok: boolean
  query: string
  candidates: WebSuggestCandidate[]
  note?: string
}

export const webSuggest = (body: {
  project_id: string; field_key: string; field_label: string; question: string; field_type?: string
}) => api.post<WebSuggestResponse>('/web-suggest', body).then(r => r.data)

// ── 干系人图谱(stakeholder graph)— canvas 编辑入口 ──────────────────────────

export interface StakeholderNode {
  id: string
  type: 'department' | 'person'
  name: string
  title?: string | null
  dept?: string | null
  x: number
  y: number
}

export interface StakeholderEdge {
  id: string
  source: string
  target: string
  label?: string | null
}

export interface StakeholderGraph {
  nodes: StakeholderNode[]
  edges: StakeholderEdge[]
  updated_at?: string | null
}

export const getStakeholderGraph = (projectId: string) =>
  api.get<StakeholderGraph>(`/stakeholder-graph/${projectId}`).then(r => r.data)

export const saveStakeholderGraph = (projectId: string, payload: { nodes: StakeholderNode[]; edges: StakeholderEdge[] }) =>
  api.put<StakeholderGraph>(`/stakeholder-graph/${projectId}`, payload).then(r => r.data)

// ── 项目画布(workflow canvas)— 节点式编排视图持久化 ──────────────────────────
// 只存布局(节点类型/kind/坐标/连线);节点实时状态由前端从 latest-by-kind 合并,不入库。

export interface WorkflowCanvasNode {
  id: string
  type: 'generation' | 'material' | 'note' | 'webpage' | 'file'
  kind?: OutputKind | null          // generation 节点对应的 OutputKind
  materialKind?: string | null      // material 节点:docs/meetings/brief/research
  label?: string | null             // 可选,前端一般运行时从 stage-flow 派生
  data?: Record<string, any> | null // 自定义输入内容:note→{text}、webpage→{url}、file→{docId,filename}
  x: number
  y: number
}

export interface WorkflowCanvasEdge {
  id: string
  source: string
  target: string
  label?: string | null
}

export interface WorkflowCanvas {
  nodes: WorkflowCanvasNode[]
  edges: WorkflowCanvasEdge[]
  updated_at?: string | null
}

export const getWorkflowCanvas = (projectId: string) =>
  api.get<WorkflowCanvas>(`/workflow-canvas/${projectId}`).then(r => r.data)

export const saveWorkflowCanvas = (projectId: string, payload: { nodes: WorkflowCanvasNode[]; edges: WorkflowCanvasEdge[] }) =>
  api.put<WorkflowCanvas>(`/workflow-canvas/${projectId}`, payload).then(r => r.data)

// (uploadDocument 已在文档管理章节定义,见 line ~206)

// ── Stage Flow (项目阶段流程动态配置) ──────────────────────────────────────

export interface StageSubKindDef {
  kind: string
  label: string
}
export interface StageDef {
  key: string
  label: string
  kind: string | null
  icon: string                    // lucide-react 图标名(白名单)
  active: boolean
  beta: boolean
  sub_kinds: StageSubKindDef[]
}
export interface StageFlowDto {
  stages: StageDef[]
  is_default: boolean
}
export interface StageFlowMeta {
  icons: string[]
  kinds: string[]
  kind_titles: Record<string, string>
}

export const getStageFlow = () =>
  api.get<StageFlowDto>('/settings/stage-flow').then(r => r.data)

export const putStageFlow = (stages: StageDef[]) =>
  api.put<{ ok: boolean; stages_n: number }>('/settings/stage-flow', { stages }).then(r => r.data)

export const resetStageFlow = () =>
  api.post<{ ok: boolean }>('/settings/stage-flow/reset').then(r => r.data)

export const getStageFlowMeta = () =>
  api.get<StageFlowMeta>('/settings/stage-flow/meta').then(r => r.data)

// ── 项目闸门(Harness P1 · 人工确认闸门)─────────────────────────────────────
export interface ProjectGate {
  key: string                    // 'asis' | 'tobe'
  label: string
  guards_stage: string           // 该闸门守在哪个下游阶段前
  desc: string
  status: 'open' | 'confirmed'
  confirmed_by?: string | null
  confirmed_at?: string | null
  note?: string | null
}
export const listGates = (project_id: string) =>
  api.get<ProjectGate[]>(`/projects/${project_id}/gates`).then(r => r.data)
export const confirmGate = (project_id: string, gate_key: string, note?: string) =>
  api.post<ProjectGate>(`/projects/${project_id}/gates/${gate_key}/confirm`, { note }).then(r => r.data)
export const reopenGate = (project_id: string, gate_key: string) =>
  api.post<ProjectGate>(`/projects/${project_id}/gates/${gate_key}/reopen`).then(r => r.data)

// ── Output Chats (对话式产出) ───────────────────────────────────────────────

export type OutputKind =
  | 'kickoff_pptx' | 'kickoff_html'
  | 'insight' | 'survey' | 'survey_outline'
  | 'research_plan' | 'research_report'
  | 'blueprint_design'
  | 'object_field_layout'
  | 'process_setup'
  | 'implementation_plan'
  | 'test_plan' | 'acceptance_report'

export interface OutputChatMessage {
  role: 'user' | 'assistant'
  content: string
  tool_uses?: { name: string; arguments: string }[]
}

export interface OutputChat {
  id: string
  kind: OutputKind
  project_id: string | null
  industry: string | null
  skill_ids: string[]
  model: string | null
  messages: OutputChatMessage[]
  refs_count: number
  status: 'active' | 'generating' | 'done' | 'failed'
  bundle_id: string | null
  created_at: string
  updated_at: string
}

export const createOutputChat = (body: { kind: OutputKind; project_id?: string | null; industry?: string | null }) =>
  api.post<OutputChat>('/output-chats', body).then(r => r.data)

export const listOutputChats = (params: { kind?: OutputKind; project_id?: string; limit?: number } = {}) =>
  api.get<OutputChat[]>('/output-chats', { params }).then(r => r.data)

export const sendOutputChatMessage = (id: string, content: string) =>
  api.post<{ reply: string; tool_uses: { name: string; arguments: string }[]; refs_added: number; total_refs: number }>(
    `/output-chats/${id}/message`,
    { content },
  ).then(r => r.data)

export const getOutputChat = (id: string) =>
  api.get<OutputChat>(`/output-chats/${id}`).then(r => r.data)

export const finalizeOutputChat = (id: string) =>
  api.post<{ bundle_id: string; status: string }>(`/output-chats/${id}/generate`).then(r => r.data)

// ── Call Logs ─────────────────────────────────────────────────────────────────

export interface CallLogItem {
  id: string
  user_id: string | null
  username: string | null
  token_type: string
  call_type: string
  endpoint: string
  status_code: number | null
  created_at: string
  // 2026-05-28 LLM 调用专有字段(其他类型为 null)
  model_name: string | null
  caller_module: string | null
  task: string | null
  input_tokens: number | null
  output_tokens: number | null
  duration_ms: number | null
  error_message: string | null
}

export interface CallLogPage {
  total: number
  page: number
  page_size: number
  items: CallLogItem[]
}

export const listCallLogs = (
  page = 1,
  page_size = 50,
  call_type?: string,
  model_name?: string,
  caller_module?: string,
) =>
  api.get<CallLogPage>('/call-logs', {
    params: { page, page_size, call_type, model_name, caller_module },
  }).then(r => r.data)

export interface LlmStatsItem {
  model_name: string
  calls: number
  input_tokens: number
  output_tokens: number
  avg_duration_ms: number | null
  errors: number
}

export const getLlmStats = (since_hours = 24) =>
  api.get<{ since_hours: number; models: LlmStatsItem[] }>(
    '/call-logs/llm/stats',
    { params: { since_hours } },
  ).then(r => r.data)

// ── Embedding / Rerank 配置(2026-05-28) ────────────────────────────────────

export interface EmbRerankConfig {
  api_base: string
  api_base_source: 'database' | 'env'
  api_base_raw_set: boolean
  model: string
  model_source: 'database' | 'env'
  model_raw_set: boolean
  api_key: string  // masked
  api_key_source: 'database' | 'env'
  api_key_raw_set: boolean
}

export interface EmbRerankPatch {
  api_base?: string
  model?: string
  api_key?: string
}

export const getEmbeddingConfig = () =>
  api.get<EmbRerankConfig>('/settings/embedding').then(r => r.data)

export const updateEmbeddingConfig = (body: EmbRerankPatch) =>
  api.put<{ ok: boolean; changed: string[] }>('/settings/embedding', body).then(r => r.data)

export const resetEmbeddingField = (key: 'api_base' | 'model' | 'api_key') =>
  api.delete<{ ok: boolean }>(`/settings/embedding/${key}`).then(r => r.data)

export const getRerankConfig = () =>
  api.get<EmbRerankConfig>('/settings/rerank').then(r => r.data)

export const updateRerankConfig = (body: EmbRerankPatch) =>
  api.put<{ ok: boolean; changed: string[] }>('/settings/rerank', body).then(r => r.data)

export const resetRerankField = (key: 'api_base' | 'model' | 'api_key') =>
  api.delete<{ ok: boolean }>(`/settings/rerank/${key}`).then(r => r.data)

// ── Outputs ───────────────────────────────────────────────────────────────────

// v3:报告引用追溯 — 每个 module 的 sources_index 项
export interface ProvenanceEntry {
  type: 'doc' | 'kb' | 'web' | 'prior'
  label: string
  snippet: string
  // doc/kb 字段
  doc_id?: string
  filename?: string
  doc_type?: string
  chunk_id?: string
  section?: string
  // web 字段
  url?: string
  domain?: string
  // prior 字段(v3.2 上游 stage 产物)
  prior_kind?: string                // insight / kickoff_pptx / survey_outline / ...
  prior_bundle_id?: string
  stage_label?: string               // 中文 stage 标签(如 "项目洞察")
}

// v2 agentic 用 — 一道"补充信息"问题(Planner 标记的 ask_user gap)
export interface AgenticGapPrompt {
  module_key: string
  field_key: string
  question: string                       // 给用户看的问题
  field_label: string                    // 字段中文标签
  field_type: 'text' | 'list' | 'number' | 'date' | string
  options: string[]                      // 选项 chip;空表示纯开放题
  multi: boolean                         // options 是否多选
  required: boolean                      // critical-required 字段
  module_title: string                   // 字段所属模块的中文标题
  necessity: 'critical' | 'optional' | string
}

export interface CuratedBundle {
  id: string
  kind: string
  project_id: string | null
  title: string
  status: 'pending' | 'generating' | 'done' | 'failed'
  error: string | null
  /** 2026-06-05 全链路追踪 id:触发请求的 X-Request-ID,贯穿 API → bundle.extra → Celery 日志 → 错误提示。
   *  失败时把这个给后台,grep 日志能拉出该次生成全部上下文。 */
  trace_id?: string | null
  /** Harness P2 软闸警告(不阻塞,随产物持续显示) */
  soft_warnings?: { code: string; message: string }[]
  has_content: boolean
  has_file: boolean
  file_ext?: string
  kb_calls?: { query: string; hits: number; error?: string }[]
  created_at: string
  updated_at: string
  content_md?: string
  // agentic 字段(只在 kind ∈ {'insight','survey','survey_outline'} 时有值)
  agentic_version?: 'v2' | null
  validity_status?: 'valid' | 'partial' | 'invalid' | null
  short_circuited?: boolean       // true=Planner 拦截,未跑 LLM
  ask_user_prompts?: AgenticGapPrompt[]
  // v3 文档驱动 — 引用追溯
  provenance?: Record<string, Record<string, ProvenanceEntry>>    // {module_key: {D1/K1/W1: entry}}
  module_states?: Record<string, {
    key: string
    title: string
    necessity?: 'critical' | 'optional'
    layer?: 'L1' | 'L2'
    target_roles?: string[]
    status: string                         // ready | done | done_with_warnings | insufficient | blocked | skipped | failed
    score?: {
      module_key?: string
      subsection_key?: string
      scores?: Record<string, number>
      overall: 'pass' | 'needs_rework' | 'insufficient'
      issues?: string[]
    } | null
    missing_fields?: { key: string; label: string; note: string }[]
    reason?: string
  }>
  // v3.1 进度卡片 (生成中显示)
  progress?: {
    stage: 'planning' | 'executing' | 'critiquing' | 'challenging' | 'regenerating' | 'finalizing' | 'done'
    message: string
    round_idx: number | null
    modules_in_flight: string[]
    updated_at: string
  } | null
  // v3.1 挑战循环结果摘要
  challenge_summary?: {
    rounds_total: number
    final_verdict: 'pass' | 'minor_issues' | 'major_issues' | 'parse_failed' | 'skipped' | 'skipped_invalid'
    issues_remaining: number
  } | null
  // v3.4 M9 web 检索状态 (失败时前端 banner 提示)
  web_search_status?: {
    ok: boolean
    reason: 'no_provider' | 'no_hits' | 'exception' | 'no_industry' | string
    queries_n?: number
    hits_n?: number
    error?: string
  } | null
  // research v1 — 需求调研工作区(survey_outline / survey kind 才有值)
  questionnaire_items?: ResearchQuestionItem[]
  ltc_module_map?: { sow_term: string; mapped_ltc_key: string | null; confidence: number; is_extra: boolean }[]
  // 2026-06-03 大纲 M3 场次结构化(只有 survey_outline kind 才有值)
  outline_sessions?: OutlineSession[]
  // 2026-06-03 计划日程抽出的场次(只有 research_plan kind 才有值;
  // 用户编辑计划 markdown 保存后会重抽,问卷按场次生成时优先用这个)
  plan_sessions?: OutlineSession[]
  // 按角色逐步生成进度(2026-06-03,仅 survey kind):key=audience_role,value=当前状态
  role_progress?: Partial<Record<'executive' | 'dept_head' | 'frontline' | 'it',
    'pending' | 'generating' | 'done' | 'failed'>>
  // 按场次手动触发生成进度(2026-06-03,仅 survey kind):key=session_id
  session_progress?: Record<string, 'generating' | 'done' | 'failed'>
  // implementation_plan kind — 项目实施工作台前端用
  implementation_tasks?: ImplementationTask[]
  // 通用 extra(后端 _bundle_dto 不直接返回所有 extra 字段,但有些工作台需要 sources_summary 等)
  extra?: Record<string, any>
}

// v3.1 挑战回合详情 (GET /api/outputs/{id}/challenges)
export interface ChallengeIssue {
  module_key: string                       // module key 或 '_global'
  dimension: 'specificity' | 'evidence' | 'timeliness' | 'next_step' | 'completeness' | 'consistency' | 'jargon' | string
  severity: 'blocker' | 'major' | 'minor'
  text: string
  suggestion: string
}

export interface ChallengeCritique {
  verdict: 'pass' | 'minor_issues' | 'major_issues' | 'parse_failed'
  summary: string
  issues: ChallengeIssue[]
}

export interface ChallengeRound {
  id: string
  round_idx: number
  status: 'critiquing' | 'regenerating' | 'done' | 'final'
  critique: ChallengeCritique | null
  critique_raw?: string | null                  // parse 失败时的原始 LLM 输出 (debug 用)
  modules_regenerated: string[]
  challenger_model?: string | null
  regen_model?: string | null
  regen_chars?: number | null
  duration_ms?: number | null
  created_at: string | null
}

export interface ChallengeRoundsDto {
  bundle_id: string
  rounds: ChallengeRound[]
}

export const getChallengeRounds = (bundleId: string) =>
  api.get<ChallengeRoundsDto>(`/outputs/${bundleId}/challenges`).then(r => r.data)

export interface OutputPage {
  total: number
  page: number
  page_size: number
  items: CuratedBundle[]
}

export const generateOutput = (body: { kind: string; project_id: string }) =>
  api.post<CuratedBundle>('/outputs/generate', body).then(r => r.data)

/** 按单个角色增量生成调研问卷题目(2026-06-03)。
 *  仅 kind=='survey' 的 bundle 可调,返回更新后的 bundle(role_progress[role]='generating')。
 *  Celery 异步执行,前端按现有 bundle 轮询机制感知 role_progress 状态变化。*/
export const generateSurveyForRole = (
  bundleId: string,
  role: 'executive' | 'dept_head' | 'frontline' | 'it',
) =>
  api.post<CuratedBundle>(`/outputs/${bundleId}/generate-role`, { role })
    .then(r => r.data)

/** 按单个场次手动触发生成调研问卷题目(2026-06-03)。
 *  仅 kind=='survey' 的 bundle 可调,返回更新后的 bundle(session_progress[session_id]='generating')。
 *  调用前置:对应 outline bundle 已生成且含该 session_id 的 outline_sessions。*/
export const generateSurveyForSession = (
  bundleId: string,
  sessionId: string,
  extraContext: string = '',
) =>
  api.post<CuratedBundle>(`/outputs/${bundleId}/generate-session`, {
    session_id: sessionId,
    extra_context: extraContext || undefined,
  }).then(r => r.data)

/** 单题手动重新生成(2026-06-03)。
 *  同步调 LLM(约 5-15s),成功后返回更新后的 bundle。
 *  保留 item_key / session_id / topic_cluster / interview_stage / audience_roles /
 *  ltc_module_key / phase / type 不变;只改 question / why / options / hint / rating_scale / number_unit。*/
export const regenerateSurveyItem = (
  bundleId: string,
  itemKey: string,
) =>
  api.post<CuratedBundle>(`/outputs/${bundleId}/items/${encodeURIComponent(itemKey)}/regenerate`)
    .then(r => r.data)

export const listOutputs = (params: { project_id?: string; kind?: string; page?: number; page_size?: number } = {}) =>
  // page_size 默认 100(后端最大值):防御性堵 ConsoleProjectDetail 按 kind 找 done bundle 时
  // 被一组失败 bundle 把第一页打爆 → chip 全显示「尚未生成」(2026-06-05 实际事故)。
  api.get<OutputPage>('/outputs', { params: { page_size: 100, ...params } }).then(r => r.data)

/** 轻量阶段状态:每个项目每种 kind 是否已生成 / 生成中。列表页阶段徽章专用,不分页 —
 *  避免老项目的 bundle 被全局最近 N 条挤掉导致徽章误回落成「未开始」。 */
export interface StageStatusRow { project_id: string | null; kind: string; status: string }
export const listStageSummary = () =>
  api.get<{ items: StageStatusRow[] }>('/outputs/stage-summary').then(r => r.data.items)

/** 项目详情页 chip 专用:返回该项目下每个 kind 的最新 done / inflight / failed bundle。
 *  - chip(已生成 / 生成中 / 未开始)只看 done + inflight,跟 failed 数量彻底脱钩(2026-06-05 事故根因)。
 *  - failed slot 暴露最近一条失败的 bundle,前端在状态行显示 trace_id 让用户复制给后台查日志。 */
export type LatestByKind = Record<string, {
  done: CuratedBundle | null
  inflight: CuratedBundle | null
  failed: CuratedBundle | null
}>
export const listLatestByKind = (project_id: string) =>
  api.get<LatestByKind>('/outputs/latest-by-kind', { params: { project_id } }).then(r => r.data)

export const getOutput = (id: string) =>
  api.get<CuratedBundle>(`/outputs/${id}`).then(r => r.data)

export const downloadOutputUrl = (id: string) => `/api/outputs/${id}/download`
export const viewOutputUrl = (id: string) => `/api/outputs/${id}/view`

// ── 交付物公开分享(免登录只读) ──────────────────────────────────────────
export interface BundleShareInfo { shared: boolean; share_path?: string | null }
/** 仅这些「客户向」kind 可生成公开分享链接(与后端 PUBLIC_SHAREABLE_KINDS 对齐) */
export const PUBLIC_SHAREABLE_KINDS = new Set<string>([
  'kickoff_html', 'research_plan', 'survey_outline',
  'blueprint_design', 'test_plan', 'acceptance_report',
])
export const getBundleShare = (bundleId: string) =>
  api.get<BundleShareInfo>(`/outputs/${bundleId}/share`).then(r => r.data)
export const createBundleShare = (bundleId: string) =>
  api.post<BundleShareInfo>(`/outputs/${bundleId}/share`).then(r => r.data)
export const revokeBundleShare = (bundleId: string) =>
  api.delete<BundleShareInfo>(`/outputs/${bundleId}/share`).then(r => r.data)
/** share_path 形如 /api/public/share/{token},拼成完整可分享链接 */
export const fullShareUrl = (sharePath: string) => `${window.location.origin}${sharePath}`

/** 在线编辑保存 — 适用 markdown 类产物(insight / survey_outline / survey / research_plan)。
 *  权限:created_by 或 admin。覆盖式更新,不存历史,不动 provenance。 */
export const saveOutputContent = (id: string, content_md: string) =>
  api.put<{ ok: boolean; bytes: number }>(`/outputs/${id}/content`, { content_md }).then(r => r.data)

/** 人工修订上传覆盖 — 适用方案设计三件套 + 调研报告
 * (research_report / blueprint_design / object_field_layout / process_setup)。
 *
 * 两种输入形态:
 *  - 文件上传(.md / .markdown / .txt / .docx)→ 传 `file`
 *  - 粘贴文本                                  → 传 `content_md`
 *
 * 后端按 Content-Type 自动分支:有 file 走 multipart,否则走 JSON。
 * 覆盖后 bundle.extra.user_modified_history 累加最近 5 条修订记录,
 * 智能建议会被 mark_stale,下游对象字段表 / 流程建设表再生成时自动吃修订版作 [B1]。 */
export interface OverrideMarkdownResp {
  ok: boolean
  bundle_id: string
  kind: string
  source: string  // "upload-md" | "upload-docx" | "paste"
  original_chars: number
  new_chars: number
  modified_at: string
}

export const overrideBundleMarkdown = (
  bundleId: string,
  payload: { file: File } | { content_md: string },
  sourceLabel?: string,
) => {
  if ('file' in payload) {
    const form = new FormData()
    form.append('file', payload.file)
    if (sourceLabel) form.append('source_label', sourceLabel)
    return api.post<OverrideMarkdownResp>(
      `/outputs/${bundleId}/markdown-override`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    ).then(r => r.data)
  }
  // 粘贴形态:JSON body
  return api.post<OverrideMarkdownResp>(
    `/outputs/${bundleId}/markdown-override`,
    { content_md: payload.content_md },
    { headers: { 'Content-Type': 'application/json' } },
  ).then(r => r.data)
}

// ── Project Brief ────────────────────────────────────────────────────────────

export type BriefConfidence = 'high' | 'medium' | 'low' | null
export interface BriefSource { type: string; ref?: string; snippet?: string }
export interface BriefFieldCell {
  value: string | string[] | null
  confidence: BriefConfidence
  sources: BriefSource[]
  auto_filled_at?: string | null
  edited_at?: string | null
}
export interface BriefFieldDef {
  key: string
  label: string
  hint?: string
  group?: string
  type?: 'text' | 'list' | 'date'
  required?: boolean
}
export interface BriefDoc {
  project_id: string
  output_kind: string
  fields: Record<string, BriefFieldCell>
  schema: BriefFieldDef[]
  exists: boolean
  updated_at: string | null
}

export const getBrief = (kind: string, project_id: string) =>
  api.get<BriefDoc>(`/briefs/${kind}`, { params: { project_id } }).then(r => r.data)

export const extractBrief = (kind: string, project_id: string) =>
  api.post<BriefDoc>(`/briefs/${kind}/extract`, null, { params: { project_id } }).then(r => r.data)

export const putBrief = (kind: string, project_id: string, fields: Record<string, BriefFieldCell>) =>
  api.put<BriefDoc>(`/briefs/${kind}`, { fields }, { params: { project_id } }).then(r => r.data)

export type BriefStreamEvent =
  | { type: 'stage_start'; id: string; label: string }
  | { type: 'stage_done'; id: string; detail?: string }
  | { type: 'done'; fields: Record<string, BriefFieldCell>; schema: BriefFieldDef[] }
  | { type: 'error'; message: string }

export async function extractBriefStream(
  kind: string,
  project_id: string,
  onEvent: (ev: BriefStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY)
  const res = await fetch(`/api/briefs/${kind}/extract/stream?project_id=${encodeURIComponent(project_id)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token ?? ''}` },
    signal,
  })
  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => '')
    throw new Error(`extract stream failed: ${res.status} ${txt.slice(0, 200)}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const parts = buf.split('\n\n')
    buf = parts.pop() ?? ''
    for (const block of parts) {
      const line = block.split('\n').find(l => l.startsWith('data:'))
      if (!line) continue
      const json = line.slice(5).trim()
      if (!json) continue
      try {
        onEvent(JSON.parse(json) as BriefStreamEvent)
      } catch { /* ignore malformed event */ }
    }
  }
}

// ── Research v1(需求调研工作区) ─────────────────────────────────────────────

export type ResearchScopeLabel = 'new' | 'digitize' | 'migrate' | 'out_of_scope'

export interface ResearchOptionItem {
  value: string
  label: string
  is_other?: boolean
  is_not_applicable?: boolean
}

export type ResearchAudienceRole = 'executive' | 'dept_head' | 'frontline' | 'it'
export type ResearchQuestionPhase = 'pre_meeting' | 'in_meeting'
export type ResearchQuestionSource = 'ai' | 'manual' | 'follow_up'
// 访谈阶段 — 同主题 cluster 内题按此顺序排,让客户思路按节奏走(2026-06-03)
export type ResearchInterviewStage = 'opening' | 'current_state' | 'pain_point' | 'aspiration'
export const RESEARCH_INTERVIEW_STAGE_ORDER: ResearchInterviewStage[] = ['opening', 'current_state', 'pain_point', 'aspiration']
export const RESEARCH_INTERVIEW_STAGE_LABELS: Record<ResearchInterviewStage, string> = {
  opening: '开场',
  current_state: '现状',
  pain_point: '痛点',
  aspiration: '期望',
}

export interface ResearchBestPracticeRef {
  title: string
  summary?: string
  source?: string         // industry_pack / kb / ltc_dictionary / manual
  source_id?: string
}

export interface ResearchQuestionItem {
  item_key: string
  ltc_module_key: string
  audience_roles: string[]    // 严格情况下应为 ResearchAudienceRole[],老数据可能含其他值
  type: 'single' | 'multi' | 'rating' | 'number' | 'text' | 'node_pick'
  question: string
  why?: string
  options: ResearchOptionItem[]
  rating_scale?: number
  number_unit?: string
  required?: boolean
  hint?: string
  scope_label?: ResearchScopeLabel | null
  scope_label_source?: 'ai' | 'manual' | null
  sow_evidence?: string
  kb_refs?: any[]
  phase?: ResearchQuestionPhase            // 默认 in_meeting
  best_practice_refs?: ResearchBestPracticeRef[]
  best_practice_advice?: string            // AI 综合最佳实践库后,针对本题写的一段贴合建议
  needs_scope?: boolean                    // 答完后是否标范围四分类(战略/价值/KPI 类题为 false)
  parent_item_key?: string | null          // 动态追问挂在哪个父问题下
  source?: ResearchQuestionSource          // 默认 ai
  // 2026-06-03 主题聚类 + 访谈阶段(给现场顾问按主题翻题 + 客户思路不被切碎)
  topic_cluster?: string | null            // 主题聚类短中文(3-8 字),前端「按主题」分组依据;老数据为空时 fallback 用 LTC 模块名
  interview_stage?: ResearchInterviewStage | null  // 访谈阶段,cluster 内按此排序;老数据为空时不排序
  // 2026-06-03 按场次分组 — 挂到大纲 M3 哪一场访谈(一对一,无合适场次为 null)
  session_id?: string | null
}

// 大纲 M3 提取出的访谈场次(只 outline bundle 才有);问卷按场次分组依据
export interface OutlineSession {
  session_id: string                       // S1 / S2 ... 本 outline 内唯一
  week: string                             // "Week 1"
  time_slot: string                        // "周二上午"
  duration_minutes: number | null
  session_type: string                     // 1on1 / 集中访谈 / 工作坊 / 现场观察 / 资料收集
  audience_roles: ResearchAudienceRole[]   // 严格 4 选 N
  participants: string                     // 参会者描述,原文
  topic_summary: string                    // 短议题
  interview_script?: string                // 100-200 字访谈思路(开场→深入→收尾),给顾问做剧本(2026-06-03 加)
}

export interface ResearchResponseItem {
  item_key: string
  answer_value: any
  scope_label: ResearchScopeLabel | null
  scope_label_source: 'ai' | 'manual' | null
  updated_at: string | null
}

export interface ResearchLtcModuleMapItem {
  id: string
  sow_term: string
  mapped_ltc_key: string | null
  confidence: number
  is_extra: boolean
}

export interface ResearchLtcDictionaryEntry {
  key: string
  label: string
  purpose: string
  aliases: string[]
  standard_nodes: string[]
  typical_audiences: string[]
  default_option_pools: Record<string, string[]>
  category: 'main' | 'support'
}

export const getLtcDictionary = () =>
  api.get<{ modules: ResearchLtcDictionaryEntry[] }>('/research/ltc-dictionary').then(r => r.data)

export const listResearchResponses = (bundle_id: string) =>
  api.get<{ items: ResearchResponseItem[] }>('/research/responses', { params: { bundle_id } }).then(r => r.data)

export const upsertResearchResponse = (body: {
  bundle_id: string
  project_id?: string | null
  item_key: string
  answer_value?: any
  scope_label?: ResearchScopeLabel | null
  scope_label_source?: 'ai' | 'manual' | null
}) => api.post<{ ok: boolean }>('/research/responses', body).then(r => r.data)

export const classifyResearchScope = (body: { bundle_id: string; ltc_module_key?: string | null }) =>
  api.post<{ ok: boolean; items: any[]; skipped: number; errors: string[] }>('/research/classify-scope', body).then(r => r.data)

// ── 从项目下会议自动生成建议答案(2026-05-29) ─────────────────────────────

export interface MeetingAutofillSuggestion {
  item_key: string
  suggested_value: any           // 适配题型:single → string;multi → string[];text → string
  suggested_label: string        // 人类可读摘要,前端 chip 显示用
  evidence: string               // 来自会议原文的截取(≤ 240 字)
  source_meeting_id: number
  source_meeting_title: string
  confidence: number             // 0~1
}

export interface MeetingAutofillResult {
  suggestions: MeetingAutofillSuggestion[]
  meetings_used: number
  items_total: number
  items_considered: number
  errors: string[]
}

export const proposeAnswersFromMeetings = (body: {
  bundle_id: string
  only_unanswered?: boolean
}) =>
  api.post<MeetingAutofillResult>('/research/auto-fill-from-meetings', body).then(r => r.data)

export const listResearchLtcModuleMap = (project_id: string) =>
  api.get<{ items: ResearchLtcModuleMapItem[] }>('/research/ltc-module-map', { params: { project_id } }).then(r => r.data)

// ── 问卷题目人工 CRUD(需求 4) ────────────────────────────────────────────────

export interface QuestionnaireItemUpsertBody {
  bundle_id: string
  item_key?: string | null              // 不传 → 后端自动生成 manual_N key 视为新增
  ltc_module_key: string
  audience_roles: string[]
  type: ResearchQuestionItem['type']
  question: string
  why?: string
  options?: ResearchOptionItem[]
  rating_scale?: number
  number_unit?: string
  required?: boolean
  hint?: string
  phase?: ResearchQuestionPhase
  parent_item_key?: string | null
  best_practice_refs?: ResearchBestPracticeRef[]
  // 仅新增题(无 item_key)时生效:把新题插到这个 key 之后;
  // ""(空字符串) = 插到最前;不传 / null = 追加到末尾(默认)
  insert_after_item_key?: string | null
}

export const upsertQuestionnaireItem = (body: QuestionnaireItemUpsertBody) =>
  api.post<{ ok: boolean; action: 'created' | 'updated'; item: ResearchQuestionItem; total: number }>(
    '/research/questionnaire-items', body
  ).then(r => r.data)

export const deleteQuestionnaireItem = (bundle_id: string, item_key: string) =>
  api.delete<{ ok: boolean; removed_keys: string[]; total: number }>(
    '/research/questionnaire-items', { params: { bundle_id, item_key } }
  ).then(r => r.data)

// ── 动态追问(需求 6) ────────────────────────────────────────────────────────

export interface FollowUpResult {
  items: ResearchQuestionItem[]            // 新生成的子题
  total: number
  error?: string
  skipped_reason?: string
}

export const generateFollowUp = (body: {
  bundle_id: string
  parent_item_key: string
  answer_value: any
  max_followups?: number
}) => api.post<FollowUpResult>('/research/follow-up', body).then(r => r.data)

// ── 会前问卷按角色导出 ────────────────────────────────────────────────────────

export type ExportRole = ResearchAudienceRole | 'all'
export type ExportFormat = 'docx' | 'xlsx' | 'html'

/** 通过 axios 拉 blob 触发下载 / 打开 — 自动带 Bearer token。
 *  - docx / xlsx:走浏览器原生「另存为」
 *  - html:用 blob URL 在新窗口打开,用户点「另存为 PDF」按钮转 PDF
 */
export async function exportPreMeeting(
  bundle_id: string,
  role: ExportRole,
  fmt: ExportFormat,
): Promise<void> {
  const response = await api.get('/research/questionnaire/export-pre-meeting', {
    params: { bundle_id, role, fmt },
    responseType: fmt === 'html' ? 'text' : 'blob',
  })

  if (fmt === 'html') {
    const blob = new Blob([response.data as string], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener,noreferrer')
    // 新窗口加载完后释放(给点缓冲)
    setTimeout(() => URL.revokeObjectURL(url), 60 * 1000)
    return
  }

  // 二进制下载:从 Content-Disposition 拿文件名(后端用 RFC 5987 UTF-8 编码)
  const cd = (response.headers['content-disposition'] || '') as string
  let filename = `会前调研问卷.${fmt}`
  const m = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i)
  if (m) {
    try { filename = decodeURIComponent(m[1]) } catch { filename = m[1] }
  }
  const contentType = (response.headers['content-type'] || 'application/octet-stream') as string
  const blob = new Blob([response.data as Blob], { type: contentType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}


// ─────────────────────────────────────────────────────────────────────────
// 会议纪要(meeting-ai 整合,2026-05-11)
// 前缀 /api/meeting,见 backend/api/meeting.py
// ─────────────────────────────────────────────────────────────────────────

export type MeetingStatus = 'recording' | 'processing' | 'completed' | 'failed'

export interface MeetingMinutes {
  meeting_title?: string
  // 2026-05-12:对齐纷享销客实施纪要模板表头字段
  meeting_time?: string
  meeting_location?: string
  meeting_host?: string
  meeting_recorder?: string
  meeting_format?: string
  organizer?: string
  // 正文
  summary?: string
  attendees?: string[]
  key_points?: Array<{ topic: string; content: string }>
  decisions?: Array<{ content: string; owner?: string }>
  action_items?: Array<{
    task: string
    owner?: string
    deadline?: string
    priority?: 'high' | 'medium' | 'low'
    remark?: string
  }>
  unresolved?: Array<{
    issue: string
    owner?: string
    reason?: string
    remark?: string
  }>
}

/** 纪要导出 docx 下载 URL(2026-05-12) */
export const exportMeetingDocxUrl = (id: number) => `/api/meeting/${id}/export-docx`

export interface StakeholderItem {
  name: string
  aliases?: string[]
  role?: string
  organization?: string
  side?: 'internal' | 'customer' | 'vendor' | 'unknown'
  contact?: string
  key_points?: string[]
  responsibilities?: string[]
}

export interface StakeholderRelation {
  from: string
  to: string
  type?: string
  description?: string
}

export interface StakeholderMap {
  stakeholders?: StakeholderItem[]
  relations?: StakeholderRelation[]
  version?: number
}

export interface MeetingProcessFlow {
  flow_id: string
  title: string
  category: string
  summary: string
  description: string
  source: string | null
  speaker: string | null
  start_seconds: number | null
  end_seconds: number | null
  mermaid: string
}

export interface MeetingProcessFlows {
  flows: MeetingProcessFlow[]
  version?: number
}

export interface MeetingIllustration {
  id: string
  image_type: 'cover' | 'body'
  style_id: string
  aspect_ratio: string
  title: string
  subtitle: string
  structure: string
  metaphor: string
  modules: string[]
  elements: string[]
  annotations: string[]
  character_action: string
  bubble_text: string
  bottom_conclusion: string
  prompt: string
  image_url: string
  // 兼容旧字段
  theme?: string
  core_idea?: string
  composition?: string
}

export interface MeetingIllustrations {
  illustrations: MeetingIllustration[]
  version?: number
  style_id?: string
}

export interface IllustrationStyle {
  id: string
  name: string
  group: string
  best_for: string
}

export interface IllustrationStylesResponse {
  styles: IllustrationStyle[]
  groups: Record<string, IllustrationStyle[]>
  default: string
}

// ── 项目待办看板 ──────────────────────────────────────────────────

export interface ProjectTodo {
  id: number
  project_id: string
  meeting_id: number | null
  content: string
  assignee: string
  due_date: string | null
  priority: 'P0' | 'P1' | 'P2'
  status: 'pending' | 'doing' | 'done'
  source_quote: string | null
  note: string | null
  blocked_by: number | null
  blocked_by_content: string | null
  created_at: string | null
  updated_at: string | null
  meeting_title?: string | null
  meeting_date?: string | null
}

export interface MeetingRequirement {
  id: number
  meeting_id: number
  req_id: string
  module: string
  description: string
  priority: 'P0' | 'P1' | 'P2' | 'P3' | string
  source: string | null
  speaker: string | null
  status: string
  created_at: string
}

export interface Meeting {
  id: number
  title: string
  owner_id: string
  owner_name?: string | null
  project_id: string | null
  project_name: string | null
  start_time: string
  end_time: string | null
  created_at: string
  raw_transcript: string
  polished_transcript: string
  meeting_minutes: MeetingMinutes | null
  status: MeetingStatus
  asr_engine: string | null
  total_chunks: number
  done_chunks: number
  audio_object_key: string | null
  feishu_url: string | null
  bitable_app_token: string | null
  action_bitable_app_token: string | null  // 修复 #4:待办看板独立字段
  kb_doc_id: string | null
  kb_url: string | null
  kb_synced_at: string | null
  stakeholder_map: StakeholderMap | null
  stakeholder_kb_doc_id: string | null
  stakeholder_kb_url: string | null
  stakeholder_kb_synced_at: string | null
  process_flows: MeetingProcessFlows | null
  illustrations: MeetingIllustrations | null
  agenda?: string | null
  memo?: string | null
  live_minutes?: LiveMinutes | null
  live_minutes_template?: string | null
  // 详情接口含
  requirements?: MeetingRequirement[]
}

export type MeetingAction = 'polish' | 'summarize' | 'extract_requirements' | 'extract_process_flows' | 'extract_stakeholders' | 'extract_illustrations' | 'generate-summary'

// ── CRUD ─────────────────────────────────────────────────────────────────

export const listMeetings = async (opts?: { project_id?: string }): Promise<Meeting[]> => {
  const { data } = await api.get<Meeting[]>('/meeting', {
    params: opts?.project_id ? { project_id: opts.project_id } : undefined,
  })
  return data
}

export interface MeetingUploader { id: string; name: string }
export interface MeetingListPage {
  items: Meeting[]
  total: number
  page: number
  page_size: number
  uploaders: MeetingUploader[]
}
export interface MeetingListParams {
  page?: number
  page_size?: number
  project_id?: string
  status?: string
  q?: string
  owner_id?: string
  date_from?: string
  date_to?: string
}
/** 分页 + 多条件筛选的会议列表(列表页用)。 */
export const listMeetingsPage = async (params: MeetingListParams = {}): Promise<MeetingListPage> => {
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') clean[k] = v
  const { data } = await api.get<MeetingListPage>('/meeting/page', { params: clean })
  return data
}

export const getMeeting = async (id: number): Promise<Meeting> => {
  const { data } = await api.get<Meeting>(`/meeting/${id}`)
  return data
}

export const createBlankMeeting = async (body: {
  title?: string
  project_id?: string | null
}): Promise<Meeting> => {
  const { data } = await api.post<Meeting>('/meeting', body)
  return data
}

export const createMeetingFromText = async (body: {
  title: string
  transcript: string
  project_id?: string | null
}): Promise<Meeting> => {
  const { data } = await api.post<Meeting>('/meeting/from-text', body)
  return data
}

export const patchMeeting = async (
  id: number,
  body: Partial<{
    title: string
    end_time: string
    raw_transcript: string
    polished_transcript: string
    meeting_minutes: MeetingMinutes
    status: MeetingStatus
  }>,
): Promise<Meeting> => {
  const { data } = await api.patch<Meeting>(`/meeting/${id}`, body)
  return data
}

export const deleteMeeting = async (id: number): Promise<{ status: string }> => {
  const { data } = await api.delete<{ status: string }>(`/meeting/${id}`)
  return data
}

export const listMeetingRequirements = async (id: number): Promise<MeetingRequirement[]> => {
  const { data } = await api.get<MeetingRequirement[]>(`/meeting/${id}/requirements`)
  return data
}

export const linkMeetingProject = async (id: number, projectId: string | null): Promise<Meeting> => {
  const { data } = await api.put<Meeting>(`/meeting/${id}/project`, { project_id: projectId })
  return data
}

export const putMeetingStakeholderMap = async (
  id: number,
  stakeholderMap: StakeholderMap,
): Promise<Meeting> => {
  const { data } = await api.put<Meeting>(`/meeting/${id}/stakeholder-map`, {
    stakeholder_map: stakeholderMap,
  })
  return data
}

export const putMeetingProcessFlows = async (
  id: number,
  processFlows: MeetingProcessFlows,
): Promise<Meeting> => {
  const { data } = await api.put<Meeting>(`/meeting/${id}/process-flows`, {
    process_flows: processFlows,
  })
  return data
}

/** 单条 requirement 字段编辑(2026-05-12) */
export const patchMeetingRequirement = async (
  meetingId: number,
  reqId: number,
  body: Partial<{
    module: string
    description: string
    priority: 'P0' | 'P1' | 'P2' | 'P3'
    source: string
    speaker: string
    status: string
    start_seconds: number
    end_seconds: number
  }>,
): Promise<MeetingRequirement> => {
  const { data } = await api.patch<MeetingRequirement>(
    `/meeting/${meetingId}/requirements/${reqId}`,
    body,
  )
  return data
}

/** 新增需求(2026-05-12) */
export const createMeetingRequirement = async (
  meetingId: number,
  body: Partial<{
    module: string
    description: string
    priority: 'P0' | 'P1' | 'P2' | 'P3'
    source: string
    speaker: string
    status: string
  }> = {},
): Promise<MeetingRequirement> => {
  const { data } = await api.post<MeetingRequirement>(
    `/meeting/${meetingId}/requirements`, body,
  )
  return data
}

/** 删除单条需求(2026-05-12) */
export const deleteMeetingRequirement = async (meetingId: number, reqId: number): Promise<void> => {
  await api.delete(`/meeting/${meetingId}/requirements/${reqId}`)
}

// ── 会议分享(2026-05-27) ───────────────────────────────────────────────────

export interface MeetingShareEntry {
  id: number
  meeting_id: number
  user_id: string
  username: string | null
  full_name: string | null
  email: string | null
  created_by: string | null
  created_at: string
}

export interface MeetingProjectMember {
  user_id: string
  username: string | null
  full_name: string | null
  email: string | null
  role: 'owner' | 'read_write' | 'read' | string
}

export interface MeetingShareSummary {
  owner: {
    user_id: string
    username: string | null
    full_name: string | null
    email: string | null
  } | null
  project: { id: string; name: string } | null
  project_members: MeetingProjectMember[]
  shares: MeetingShareEntry[]
}

export const listMeetingShares = async (meetingId: number): Promise<MeetingShareSummary> => {
  const { data } = await api.get<MeetingShareSummary>(`/meeting/${meetingId}/shares`)
  return data
}

export const addMeetingShares = async (
  meetingId: number,
  userIds: string[],
): Promise<MeetingShareEntry[]> => {
  const { data } = await api.post<MeetingShareEntry[]>(`/meeting/${meetingId}/shares`, {
    user_ids: userIds,
  })
  return data
}

export const removeMeetingShare = async (
  meetingId: number,
  userId: string,
): Promise<void> => {
  await api.delete(`/meeting/${meetingId}/shares/${userId}`)
}

/** 干系人改名同步到 minutes / requirements(2026-05-12) */
export const renameStakeholderRefs = async (
  meetingId: number,
  body: { old_name: string; new_name: string; old_aliases?: string[] },
): Promise<{ replaced_in_minutes: number; replaced_in_requirements: number }> => {
  const { data } = await api.post<{
    replaced_in_minutes: number
    replaced_in_requirements: number
  }>(`/meeting/${meetingId}/stakeholders/rename`, body)
  return data
}

// ── 项目级干系人资产(2026-05-12) ────────────────────────────────────────

export interface ProjectStakeholder {
  id: string
  project_id: string
  name: string
  aliases: string[]
  role: string
  organization: string
  side: 'internal' | 'customer' | 'vendor' | 'unknown'
  contact: string
  key_points: string[]
  responsibilities: string[]
  source_meeting_ids: number[]
  created_at: string
  updated_at: string
}

export const listProjectStakeholders = async (projectId: string): Promise<ProjectStakeholder[]> => {
  const { data } = await api.get<{ stakeholders: ProjectStakeholder[] }>(`/projects/${projectId}/stakeholders`)
  return data.stakeholders
}

export const createProjectStakeholder = async (
  projectId: string,
  body: Partial<ProjectStakeholder> & { name: string },
): Promise<ProjectStakeholder> => {
  const { data } = await api.post<ProjectStakeholder>(`/projects/${projectId}/stakeholders`, body)
  return data
}

export const patchProjectStakeholder = async (
  projectId: string,
  stakeholderId: string,
  body: Partial<Omit<ProjectStakeholder, 'id' | 'project_id' | 'created_at' | 'updated_at'>>,
): Promise<{ stakeholder: ProjectStakeholder; sync: { meetings_synced: number; minutes_replaced: number; requirements_replaced: number } }> => {
  const { data } = await api.patch(`/projects/${projectId}/stakeholders/${stakeholderId}`, body)
  return data
}

export const deleteProjectStakeholder = async (projectId: string, stakeholderId: string): Promise<void> => {
  await api.delete(`/projects/${projectId}/stakeholders/${stakeholderId}`)
}

/** 把会议的干系人合并到项目资产 */
export const syncMeetingStakeholdersToProject = async (
  projectId: string,
  meetingId: number,
): Promise<{ created: number; merged: number; total: number }> => {
  const { data } = await api.post<{ created: number; merged: number; total: number }>(
    `/projects/${projectId}/stakeholders/sync-from-meeting/${meetingId}`,
  )
  return data
}

// ── 上传 + 流水线触发 ────────────────────────────────────────────────────

export const uploadMeetingAudio = async (
  file: File,
  opts: { title?: string; project_id?: string | null } = {},
): Promise<{ meeting_id: number; status: string; object_key: string }> => {
  const fd = new FormData()
  fd.append('file', file)
  if (opts.title) fd.append('title', opts.title)
  if (opts.project_id) fd.append('project_id', opts.project_id)
  const { data } = await api.post('/meeting/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export const processMeeting = async (id: number): Promise<{ status: string; meeting_id: number }> => {
  const { data } = await api.post(`/meeting/${id}/process`)
  return data
}

// ── 半实时录音(边录边传,2026-06-22) ──────────────────────────────────────
export const createRecordingMeeting = async (
  body: { title?: string; project_id?: string | null; agenda?: string } = {},
): Promise<{ meeting_id: number; status: string }> => {
  const { data } = await api.post('/meeting/recording', body)
  return data
}

/** 上传一个录音分段,服务端即时转写,同步返回该段文本。 */
export const uploadAudioChunk = async (
  meetingId: number, blob: Blob, seq: number, startMs: number,
): Promise<{ seq: number; text: string; done_chunks: number }> => {
  const fd = new FormData()
  fd.append('file', blob, `seg-${seq}.webm`)
  fd.append('seq', String(seq))
  fd.append('start_ms', String(startMs))
  const { data } = await api.post(`/meeting/${meetingId}/audio-chunk`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

/** 录音停止收尾:拼整段音频 + 跑 AI pipeline。 */
export const finalizeRecording = async (
  meetingId: number,
): Promise<{ meeting_id: number; status: string; reason?: string }> => {
  const { data } = await api.post(`/meeting/${meetingId}/finalize`)
  return data
}

// ── 现场调研实时副驾(2026-06-22) ──────────────────────────────────────────
export type LiveAdviceCategory = 'clarification' | 'ambiguity' | 'gap' | 'industry' | 'consensus'
export interface LiveAdviceItem {
  id: number
  category: LiveAdviceCategory
  category_label: string
  title: string
  recommendation: string | null
  question: string | null
  rationale: string | null
  source_quote: string | null
  source_ts: number | null
  ltc_module: string | null
  priority: 'high' | 'medium' | 'low'
  status: string
  from_meeting_id?: number             // carryover 项:来源会议
  from_meeting_title?: string | null
}
export interface LiveAdviceResponse {
  advice: LiveAdviceItem[]
  count: number
  resolved_advice?: LiveAdviceItem[]   // include_resolved 时返回(详情页已完成成果区)
  carryover?: LiveAdviceItem[]         // 同项目其它会议遗留的「待定」项(本次带出来问)
  model?: string
  added?: number
  resolved?: number
  error?: string
  note?: string
}
/** 跑一轮实时调研建议分析(~10s),返回当前 open 建议。 */
export const runLiveAdvice = async (meetingId: number): Promise<LiveAdviceResponse> => {
  const { data } = await api.post(`/meeting/${meetingId}/live-advice`)
  return data
}
/** 只读当前建议(不跑 LLM)。includeResolved 时附带已完成清单(详情页成果区)。 */
export const getLiveAdvice = async (meetingId: number, includeResolved = false): Promise<LiveAdviceResponse> => {
  const { data } = await api.get(`/meeting/${meetingId}/live-advice`, {
    params: includeResolved ? { include_resolved: true } : {},
  })
  return data
}
/** 删除(忽略)一条建议 → dismissed。 */
export const dismissLiveAdvice = async (meetingId: number, adviceId: number): Promise<{ ok: boolean }> => {
  const { data } = await api.post(`/meeting/${meetingId}/live-advice/${adviceId}/dismiss`)
  return data
}
/** 标记一条建议为已完成(成果)→ resolved。 */
export const resolveLiveAdvice = async (meetingId: number, adviceId: number): Promise<{ ok: boolean }> => {
  const { data } = await api.post(`/meeting/${meetingId}/live-advice/${adviceId}/resolve`)
  return data
}
/** 标记一条建议为「待定」→ pending(下次同项目调研自动带出)。 */
export const pendLiveAdvice = async (meetingId: number, adviceId: number): Promise<{ ok: boolean }> => {
  const { data } = await api.post(`/meeting/${meetingId}/live-advice/${adviceId}/pend`)
  return data
}

// ── 实时会议纪要提取(2026-06-30) ──────────────────────────────────────────

export interface LiveMinutes {
  meeting_consensus: string
  meeting_disputes: string
  meeting_todos: string
}

export interface LiveMinutesResponse {
  live_minutes: LiveMinutes | null
  model?: string
  error?: string
  note?: string
}

/** 跑一轮实时纪要提取(基于截至目前转写)。 */
export const runLiveMinutes = async (meetingId: number): Promise<LiveMinutesResponse> => {
  const { data } = await api.post(`/meeting/${meetingId}/live-minutes`)
  return data
}

/** 只读当前 live_minutes + agenda + memo(不跑 LLM)。 */
export const getLiveMinutes = async (meetingId: number): Promise<{
  live_minutes: LiveMinutes | null; agenda: string; memo: string
}> => {
  const { data } = await api.get(`/meeting/${meetingId}/live-minutes`)
  return data
}

/** 录制中保存备忘随笔。 */
export const saveMeetingMemo = async (meetingId: number, memo: string): Promise<{ status: string }> => {
  const { data } = await api.put(`/meeting/${meetingId}/memo`, { memo })
  return data
}

export const runMeetingAction = async (id: number, action: MeetingAction, body?: Record<string, unknown>): Promise<unknown> => {
  const { data } = await api.post(`/meeting/${id}/actions/${action}`, body)
  return data
}

export const getIllustrationStyles = async (): Promise<IllustrationStylesResponse> => {
  const { data } = await api.get<IllustrationStylesResponse>('/meeting/illustration-styles')
  return data
}

// ── 项目待办看板 ────────────────────────────────────────────────────

export const getProjectTodos = async (
  projectId: string,
  filters?: { status?: string; assignee?: string; priority?: string },
): Promise<ProjectTodo[]> => {
  const params: Record<string, string> = {}
  if (filters?.status) params.status = filters.status
  if (filters?.assignee) params.assignee = filters.assignee
  if (filters?.priority) params.priority = filters.priority
  const { data } = await api.get<ProjectTodo[]>(`/projects/${projectId}/todos`, { params })
  return data
}

export const createProjectTodo = async (
  projectId: string,
  body: { content: string; assignee?: string; due_date?: string; priority?: string; note?: string },
): Promise<ProjectTodo> => {
  const { data } = await api.post<ProjectTodo>(`/projects/${projectId}/todos`, body)
  return data
}

export const syncProjectTodos = async (projectId: string): Promise<{ imported: number; meetings_scanned: number }> => {
  const { data } = await api.post<{ imported: number; meetings_scanned: number }>(`/projects/${projectId}/todos/sync`)
  return data
}

export const patchTodo = async (todoId: number, body: Partial<Pick<ProjectTodo, 'content' | 'assignee' | 'due_date' | 'priority' | 'status' | 'note'>>): Promise<ProjectTodo> => {
  const { data } = await api.patch<ProjectTodo>(`/todos/${todoId}`, body)
  return data
}

export const deleteTodo = async (todoId: number): Promise<void> => {
  await api.delete(`/todos/${todoId}`)
}

export const getOverdueTodos = async (): Promise<ProjectTodo[]> => {
  const { data } = await api.get<ProjectTodo[]>('/todos/overdue')
  return data
}

export const getMyTodos = async (filters?: { assignee?: string; status?: string }): Promise<ProjectTodo[]> => {
  const params: Record<string, string> = {}
  if (filters?.assignee) params.assignee = filters.assignee
  if (filters?.status) params.status = filters.status
  const { data } = await api.get<ProjectTodo[]>('/todos/my', { params })
  return data
}

export const batchPatchTodos = async (ids: number[], body: { status?: string; assignee?: string; priority?: string }): Promise<{ updated: number }> => {
  const { data } = await api.patch<{ updated: number }>('/todos/batch', { ids, ...body })
  return data
}

export const smartAssignTodo = async (todoId: number): Promise<{ assignee: string; reason: string; current: string }> => {
  const { data } = await api.post<{ assignee: string; reason: string; current: string }>(`/todos/${todoId}/smart-assign`)
  return data
}

// ── KB / 飞书同步 ────────────────────────────────────────────────────────

export const syncMeetingToKB = async (id: number) => {
  const { data } = await api.post<{ status: string; kb_doc_id: string; kb_url: string }>(
    `/meeting/${id}/sync-kb`,
  )
  return data
}

export const syncMeetingStakeholdersToKB = async (id: number) => {
  const { data } = await api.post<{ status: string; kb_doc_id: string; kb_url: string }>(
    `/meeting/${id}/sync-stakeholder-map-kb`,
  )
  return data
}

export const exportMeetingToFeishu = async (id: number, options?: { folderToken?: string; existingDocUrl?: string }) => {
  const { data } = await api.post<{ status: string; url: string; document_id: string; mode?: string }>(
    `/meeting/${id}/export-feishu`,
    { folder_token: options?.folderToken || null, existing_doc_url: options?.existingDocUrl || null },
  )
  return data
}

export const syncMeetingRequirementsToBitable = async (
  id: number,
  body: { bitable_app_token?: string; table_id?: string; bitable_url?: string },
) => {
  const { data } = await api.post<{ status: string; url: string; rows: number }>(
    `/meeting/${id}/sync-requirements`,
    body,
  )
  return data
}

export const syncActionItemsToBitable = async (
  id: number,
  body: { bitable_app_token?: string; table_id?: string; bitable_url?: string },
) => {
  const { data } = await api.post<{ status: string; url: string; rows: number }>(
    `/meeting/${id}/sync-action-items`,
    body,
  )
  return data
}

export const createActionKanban = async (
  id: number,
  folderToken?: string,
) => {
  const { data } = await api.post<{
    status: string; app_token: string; table_id: string; url: string
  }>(
    `/meeting/${id}/create-action-kanban`,
    { folder_token: folderToken || null },
  )
  return data
}

// ── 飞书 URL 解析与权限检查 ─────────────────────────────────────────────

export interface FeishuUrlCheckResult {
  type: 'docx' | 'bitable' | 'folder'
  has_permission: boolean
  readable: boolean
  message: string
  guidance?: string
  doc_token?: string
  app_token?: string
  table_id?: string
  folder_token?: string
  title?: string
  tables?: Array<{ table_id: string; name: string }>
}

export const checkFeishuUrl = async (id: number, url: string): Promise<FeishuUrlCheckResult> => {
  const { data } = await api.post<FeishuUrlCheckResult>(
    `/meeting/${id}/check-feishu-url`,
    { url },
  )
  return data
}

// ── 用户级飞书凭证 ───────────────────────────────────────────────────────

export interface FeishuCredentialsStatus {
  configured: boolean
  app_id: string | null
}

export const getFeishuCredentials = async (): Promise<FeishuCredentialsStatus> => {
  const { data } = await api.get<FeishuCredentialsStatus>('/feishu/credentials')  // 修复 #5:独立路由
  return data
}

export const putFeishuCredentials = async (body: { app_id: string; app_secret: string }) => {
  const { data } = await api.put<{ status: string; configured: boolean; app_id: string }>(
    '/feishu/credentials',  // 修复 #5:独立路由
    body,
  )
  return data
}

export const deleteFeishuCredentials = async () => {
  const { data } = await api.delete<{ status: string; configured: boolean }>(
    '/feishu/credentials',  // 修复 #5:独立路由
  )
  return data
}

// ── 用户级 ShareDev / sharedev-cli 凭证(2026-05-29 项目实施集成) ────────

export interface ShareDevCredentialsStatus {
  configured: boolean
  domain: string
}

export const getShareDevCredentials = async (): Promise<ShareDevCredentialsStatus> => {
  const { data } = await api.get<ShareDevCredentialsStatus>('/sharedev/credentials')
  return data
}

export const putShareDevCredentials = async (body: { domain: string; certificate: string }) => {
  const { data } = await api.put<{ status: string; configured: boolean; domain: string }>(
    '/sharedev/credentials',
    body,
  )
  return data
}

export const deleteShareDevCredentials = async () => {
  const { data } = await api.delete<{ status: string; configured: boolean }>('/sharedev/credentials')
  return data
}

export const verifyShareDevCredentials = async () => {
  const { data } = await api.post<{ status: string; verified: boolean; domain: string; detail: string }>(
    '/sharedev/credentials/verify',
  )
  return data
}

// ── 实施任务清单(implementation_plan)的结构化 tasks(bundle.extra.tasks) ──

export type ShareDevSkill =
  | 'sharedev-auto'
  | 'sharedev-object' | 'sharedev-field' | 'sharedev-validation-rule'
  | 'sharedev-layout' | 'sharedev-layout-rule'
  | 'sharedev-apl-implement' | 'sharedev-apl-lite' | 'sharedev-apl-code-review'
  | 'sharedev-pwc' | 'sharedev-pwc-write-prd-spec' | 'sharedev-pwc-write-arch'
  | 'sharedev-pwc-write-plans' | 'sharedev-pwc-execute-plans'
  | 'sharedev-pwc-subagent-driven-development'
  | 'sharedev-pwc-finish-development' | 'sharedev-pwc-review-code' | 'sharedev-pwc-fix-bug'

export interface ImplementationTask {
  task_id: string
  req_ids: string[]
  sharedev_skill: ShareDevSkill
  object_api_name: string | null
  api_name: string | null
  description: string
  depends_on: string[]
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  ltc_module: string | null
  estimated_hours: number
  status: 'pending_config' | 'configured' | 'pending_deploy' | 'deployed' | 'failed'
  // Phase 2:生成配置后回填的内容(可空 — 尚未生成时是 undefined)
  config?: {
    ok: boolean
    file_path: string | null
    file_content: string | null    // 完整 xml 字符串
    raw_chars?: number
    error?: string | null
    generated_at?: string
    generated_by?: string | null
  }
}

// ── 项目实施工作台 — 单 task 生成配置 + 下载 zip ──

export const generateTaskConfig = async (
  bundleId: string, taskId: string,
): Promise<{ ok: boolean; task_id: string; file_path: string | null; file_content: string | null; error: string | null }> => {
  const { data } = await api.post(
    `/implementation/bundles/${bundleId}/tasks/${encodeURIComponent(taskId)}/generate-config`,
  )
  return data
}

export const tenantConfigZipUrl = (bundleId: string) =>
  `/api/implementation/bundles/${bundleId}/tenant-config-zip`

/** 2026-06-05 项目实施交接包:SOW + 蓝图 + 字段表 + 流程表 一键打包,带去外部实施平台。
 *  返回的是 GET URL — 浏览器直接 window.location.href 或 <a download> 触发下载即可。 */
export const projectHandoffBundleUrl = (projectId: string) =>
  `/api/projects/${projectId}/handoff-bundle`

// ── 企信 IM 接入(2026-05-29):用户级 Bot 凭证 + 消息读取 ───────────────

export interface QixinCredentialsStatus {
  configured: boolean
  app_id_masked: string | null
  gateway_url: string
}

export const getQixinCredentials = async (): Promise<QixinCredentialsStatus> => {
  const { data } = await api.get<QixinCredentialsStatus>('/qixin/credentials')
  return data
}

export const putQixinCredentials = async (body: {
  app_id: string
  app_secret: string
  gateway_url: string
}) => {
  const { data } = await api.put<{ status: string; configured: boolean; gateway_url: string }>(
    '/qixin/credentials',
    body,
  )
  return data
}

export const deleteQixinCredentials = async () => {
  const { data } = await api.delete<{ status: string; configured: boolean }>('/qixin/credentials')
  return data
}

export interface QixinConversation {
  chat_id: string
  chat_type: 'direct' | 'group' | null
  count: number
  last_message: {
    id: string
    direction: 'in' | 'out'
    sender_name: string | null
    sender_user_id: string | null
    content_preview: string
    ts: string | null
  }
}

export const listQixinConversations = async (limit = 50): Promise<QixinConversation[]> => {
  const { data } = await api.get<{ conversations: QixinConversation[] }>(
    `/qixin/conversations?limit=${limit}`,
  )
  return data.conversations
}

export interface QixinMessage {
  id: string
  chat_id: string
  chat_type: 'direct' | 'group' | null
  sender_user_id: string | null
  sender_name: string | null
  direction: 'in' | 'out'
  content: string
  ts: string | null
}

export const listQixinMessages = async (
  chatId: string,
  opts?: { limit?: number; before?: string },
): Promise<QixinMessage[]> => {
  const params = new URLSearchParams()
  if (opts?.limit) params.set('limit', String(opts.limit))
  if (opts?.before) params.set('before', opts.before)
  const qs = params.toString()
  const { data } = await api.get<{ chat_id: string; messages: QixinMessage[] }>(
    `/qixin/conversations/${encodeURIComponent(chatId)}/messages${qs ? `?${qs}` : ''}`,
  )
  return data.messages
}

export const sendQixinMessage = async (
  chatId: string,
  text: string,
  replyMessageId?: string | number,
): Promise<{ status: string; message_id: string; chat_id: string }> => {
  const { data } = await api.post(
    `/qixin/conversations/${encodeURIComponent(chatId)}/send`,
    { text, reply_message_id: replyMessageId },
  )
  return data
}
