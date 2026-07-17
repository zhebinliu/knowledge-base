// 标准场景库(场景库中心)API — 独立于 client.ts,避免 meeting overlay 覆盖。
import { api } from './client'

export interface RecommendedField {
  name: string
  type?: string
  note?: string
  required?: boolean
}

export interface Scene {
  id: number
  domain: string
  stage: string
  stage_label?: string | null
  code: string
  name: string
  summary?: string | null
  description?: string | null
  business_rules?: string | null
  process?: string | null
  recommended_fields: RecommendedField[]
  research_questions: string[]   // 关键调研问题
  tags: string[]                 // "通用" 或 四级行业路径 "L1/L2/L3/L4"
  ai_capabilities: number[]      // 匹配的 AI 能力 id(AI 优化选择)
  source_type: string            // standard | project
  source_project_name?: string | null
  status: string
  version: number
  updated_at: string
}

export interface SceneUpdate {
  name?: string
  description?: string | null
  business_rules?: string | null
  process?: string | null
  recommended_fields?: RecommendedField[]
  research_questions?: string[]
  tags?: string[]
  ai_capabilities?: number[]
}
export const updateScene = (id: number, patch: SceneUpdate) =>
  api.patch<Scene>(`/scenes/${id}`, patch).then(r => r.data)

// 关键调研问题 AI 生成:单场景(不落库,返回草稿)+ 批量(按域落库)
export const genSceneQuestions = (id: number) =>
  api.post<{ questions: string[] }>(`/scenes/${id}/gen-questions`).then(r => r.data.questions)
export const batchGenSceneQuestions = (domain?: string, overwrite = false) =>
  api.post<{ generated_scenes: number; questions: number; skipped: number; per_domain: Record<string, number> }>(
    '/scenes/gen-questions', null, { params: { ...(domain ? { domain } : {}), overwrite } },
  ).then(r => r.data)

// 纷享 AI 能力目录(场景 AI 能力匹配的可选项)
export interface AiCapability {
  id: number
  domain: string
  agent: string
  skill: string
  status: string           // 已具备/开发中/未开发
  plan_date?: string | null
  description?: string | null
  outputs: string[]
}
export const listAiCapabilities = () =>
  api.get<AiCapability[]>('/ai-capabilities').then(r => r.data)

// AI 自动匹配:给场景(可按域)自动匹配 AI 能力并落库
export const aiMatchScenes = (domain?: string) =>
  api.post<{ matched_scenes: number; assignments: number; per_domain: Record<string, number> }>(
    '/scenes/ai-match', null, { params: domain ? { domain } : {} },
  ).then(r => r.data)

export interface SceneChange {
  id: number
  scene_id?: number | null
  scene_code: string
  domain?: string | null
  change_type: string            // new | optimize | edit
  project_name?: string | null
  summary?: string | null
  created_by?: string | null
  created_at: string
}

export interface SceneDomains {
  domains: { domain: string; count: number }[]
  total: number
}

export const listSceneDomains = () =>
  api.get<SceneDomains>('/scenes/domains').then(r => r.data)

export const listScenes = (params?: { domain?: string; q?: string }) =>
  api.get<Scene[]>('/scenes', { params }).then(r => r.data)

export const getScene = (id: number) =>
  api.get<Scene>(`/scenes/${id}`).then(r => r.data)

export const getSceneChanges = (id: number) =>
  api.get<SceneChange[]>(`/scenes/${id}/changes`).then(r => r.data)

export const listRecentSceneChanges = (limit = 100) =>
  api.get<SceneChange[]>('/scene-changes', { params: { limit } }).then(r => r.data)

// ── P3 场景命中 ──────────────────────────────────────────────────────────────
export interface SceneHit { domain: string; code: string; name: string }
export interface HitSource { kind: string; type: string; name: string }
export interface HitReport {
  project_id: string
  hit_count: number
  miss_count: number
  hits: SceneHit[]
  misses: SceneHit[]
  sources?: HitSource[]        // 命中依据的文档
  summary?: string | null
  report_md?: string | null
  updated_at?: string | null
}
export const runSceneMatch = (project_id: string) =>
  api.post<HitReport>(`/projects/${project_id}/scene-match`).then(r => r.data)
export const getSceneMatch = (project_id: string) =>
  api.get<HitReport | null>(`/projects/${project_id}/scene-match`).then(r => r.data)

// ── Part2 调研议程 ───────────────────────────────────────────────────────────
export interface AgendaScene {
  id: number
  code: string
  name: string
  covered: boolean
  questions: string[]
  question_count: number
}
export interface AgendaStage {
  stage: string
  stage_label: string
  scenes: AgendaScene[]
}
export interface AgendaDomain {
  domain: string
  label: string
  active: boolean
  scene_count: number
  covered_count: number
  stages: AgendaStage[]
}
export interface ResearchAgenda {
  project_id: string
  has_match: boolean
  total_scenes: number
  covered_scenes: number
  domains: AgendaDomain[]
}
export const getResearchAgenda = (project_id: string, domain?: string) =>
  api.get<ResearchAgenda>(`/projects/${project_id}/research-agenda`, { params: domain ? { domain } : {} })
    .then(r => r.data)

// ── 闭环②:交付物场景覆盖校验 ─────────────────────────────────────────────────
export interface BundleCoverage {
  applicable: boolean
  total: number
  covered: number
  covered_ratio?: number | null
  missing: SceneHit[]
}
export const getBundleCoverage = (bundle_id: string) =>
  api.get<BundleCoverage>(`/bundles/${bundle_id}/scene-coverage`).then(r => r.data)

// ── P4 蓝图回流提案 ─────────────────────────────────────────────────────────
export interface SceneProposal {
  id: number
  project_id: string
  project_name?: string | null
  change_type: 'new' | 'optimize'
  domain?: string | null
  scene_code?: string | null
  name: string
  summary?: string | null
  content?: {
    blueprint_evidence?: string
    evidence_verified?: boolean
    description?: string
    business_rules?: string
    process?: string
    recommended_fields?: { name: string; type?: string; note?: string; required?: boolean }[]
  } | null
  status: 'pm_pending' | 'admin_pending' | 'approved' | 'rejected'
  created_by?: string | null
  pm_confirmed_by?: string | null
  reviewed_by?: string | null
  review_note?: string | null
  created_at: string
  updated_at: string
}
export interface ReflowStart { task_id: string; status: string }
export interface ReflowStatus { state: string; ready: boolean; count?: number | null; error?: string | null }
export const runSceneReflow = (project_id: string) =>
  api.post<ReflowStart>(`/projects/${project_id}/scene-reflow`).then(r => r.data)
export const getSceneReflowStatus = (task_id: string) =>
  api.get<ReflowStatus>(`/scene-reflow/status/${task_id}`).then(r => r.data)
export const listProjectProposals = (project_id: string) =>
  api.get<SceneProposal[]>(`/projects/${project_id}/scene-proposals`).then(r => r.data)
export const pmConfirmProposal = (id: number) =>
  api.post<SceneProposal>(`/scene-proposals/${id}/pm-confirm`).then(r => r.data)
export const adminListProposals = (status = 'admin_pending') =>
  api.get<SceneProposal[]>('/scene-proposals', { params: { status } }).then(r => r.data)
export interface ApprovePayload {
  note?: string
  code?: string
  stage?: string
  stage_label?: string
  tags?: string[]
}
export const approveProposal = (id: number, payload?: ApprovePayload) =>
  api.post<SceneProposal>(`/scene-proposals/${id}/approve`, payload || {}).then(r => r.data)
export const rejectProposal = (id: number, note?: string) =>
  api.post<SceneProposal>(`/scene-proposals/${id}/reject`, { note }).then(r => r.data)

// ── 阶段列表(审核选择用) ─────────────────────────────────────────────────
export interface StageOption { domain: string; stage: string; stage_label: string }
export const listStages = (domain?: string) =>
  api.get<StageOption[]>('/scenes/stages', { params: domain ? { domain } : {} }).then(r => r.data)

// ── 场景新增 / 导入 / 模板下载 ───────────────────────────────────────────────

export interface SceneCreatePayload {
  domain: string
  stage: string
  stage_label?: string
  code: string
  name: string
  summary?: string
  description?: string
  business_rules?: string
  process?: string
  tags?: string[]
}
export const createScene = (payload: SceneCreatePayload) =>
  api.post<Scene>('/scenes', payload).then(r => r.data)

export interface ImportResult {
  created: number
  updated: number
  skipped: number
  errors: string[]
}
export const importScenes = (file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  return api.post<ImportResult>('/scenes/import', fd).then(r => r.data)
}

export const downloadImportTemplate = () =>
  api.get('/scenes/import-template', { responseType: 'blob' }).then(r => {
    const url = URL.createObjectURL(r.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '场景导入模板.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  })
