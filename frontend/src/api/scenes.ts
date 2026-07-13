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
  tags: string[]                 // "通用" 或 四级行业路径 "L1/L2/L3/L4"
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
  tags?: string[]
}
export const updateScene = (id: number, patch: SceneUpdate) =>
  api.patch<Scene>(`/scenes/${id}`, patch).then(r => r.data)

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
export interface HitReport {
  project_id: string
  hit_count: number
  miss_count: number
  hits: SceneHit[]
  misses: SceneHit[]
  summary?: string | null
  report_md?: string | null
  updated_at?: string | null
}
export const runSceneMatch = (project_id: string) =>
  api.post<HitReport>(`/projects/${project_id}/scene-match`).then(r => r.data)
export const getSceneMatch = (project_id: string) =>
  api.get<HitReport | null>(`/projects/${project_id}/scene-match`).then(r => r.data)

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
  status: 'pm_pending' | 'admin_pending' | 'approved' | 'rejected'
  created_by?: string | null
  pm_confirmed_by?: string | null
  reviewed_by?: string | null
  review_note?: string | null
  created_at: string
  updated_at: string
}
export const runSceneReflow = (project_id: string) =>
  api.post<SceneProposal[]>(`/projects/${project_id}/scene-reflow`).then(r => r.data)
export const listProjectProposals = (project_id: string) =>
  api.get<SceneProposal[]>(`/projects/${project_id}/scene-proposals`).then(r => r.data)
export const pmConfirmProposal = (id: number) =>
  api.post<SceneProposal>(`/scene-proposals/${id}/pm-confirm`).then(r => r.data)
export const adminListProposals = (status = 'admin_pending') =>
  api.get<SceneProposal[]>('/scene-proposals', { params: { status } }).then(r => r.data)
export const approveProposal = (id: number, note?: string) =>
  api.post<SceneProposal>(`/scene-proposals/${id}/approve`, { note }).then(r => r.data)
export const rejectProposal = (id: number, note?: string) =>
  api.post<SceneProposal>(`/scene-proposals/${id}/reject`, { note }).then(r => r.data)
