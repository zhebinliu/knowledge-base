/**
 * 项目列表视图模式 —— 卡片 / 列表 切换 + 本地记忆
 *
 * 生产页(pages/console/ConsoleProjects)与新前端(redesign/console/ConsoleProjects)
 * 两份列表复用这里,避免存储 key 和默认值再次漂移(同 lib/stageBadges 的做法)。
 */
import { useCallback, useState } from 'react'

export type ProjectViewMode = 'grid' | 'list'

const STORAGE_KEY = 'kb.console.projects.view'

function read(): ProjectViewMode {
  if (typeof window === 'undefined') return 'grid'
  return window.localStorage.getItem(STORAGE_KEY) === 'list' ? 'list' : 'grid'
}

/** 返回 [当前视图, 切换函数];切换即写入 localStorage,下次进页面保持上次选择 */
export function useProjectViewMode(): [ProjectViewMode, (v: ProjectViewMode) => void] {
  const [view, setViewState] = useState<ProjectViewMode>(read)

  const setView = useCallback((v: ProjectViewMode) => {
    setViewState(v)
    try { window.localStorage.setItem(STORAGE_KEY, v) } catch { /* 隐私模式下写入失败,忽略 */ }
  }, [])

  return [view, setView]
}
