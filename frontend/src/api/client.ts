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
  conversion_status: 'pending' | 'processing' | 'done' | 'failed'
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

// ── Review ───────────────────────────────────────────────────────────────────

export const listReviewQueue = () =>
  api.get<ReviewItem[]>('/review/queue').then(r => r.data)

export const approveReview = (id: string, note?: string) =>
  api.post(`/review/${id}/approve`, { reviewer: 'admin', note })

export const rejectReview = (id: string, note?: string) =>
  api.post(`/review/${id}/reject`, { reviewer: 'admin', note })

// ── Stats ────────────────────────────────────────────────────────────────────

export const getStats = () =>
  api.get<Stats>('/stats').then(r => r.data)
