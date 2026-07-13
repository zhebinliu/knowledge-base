// 标准场景库(场景库中心)API — 独立于 client.ts,避免 meeting overlay 覆盖。
import { api } from './client'

export interface Scene {
  id: number
  domain: string
  stage: string
  stage_label?: string | null
  code: string
  name: string
  summary?: string | null
  source_type: string            // standard | project
  source_project_name?: string | null
  status: string
  version: number
  updated_at: string
}

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
