/**
 * usePatches — PPT 编辑 patch 状态管理
 *
 * 数据模型:
 *   patches: { [editId]: ElementPatch }
 *   ElementPatch: 文本元素 { content?, fontSize?, color?, bold?, italic?, hidden? }
 *               + 容器元素 { x?, y?, hidden? }  (拖动用 transform)
 *
 * 持久化:
 *   - 自动存 localStorage(key = LS_KEY, debounced)
 *   - 提供导入 / 导出 JSON 接口
 */
import { useEffect, useRef, useState, useCallback, createContext, useContext, createElement } from 'react'

const LS_KEY = 'demo-ppt-patches-v1'

export type ElementPatch = {
  content?: string                          // 文字内容覆盖
  fontSize?: number                         // px
  color?: string                            // CSS color
  bold?: boolean
  italic?: boolean
  x?: number                                // translate X (px)
  y?: number                                // translate Y (px)
  hidden?: boolean                          // 隐藏(软删)
}

export type Patches = Record<string, ElementPatch>

// ── localStorage 读写 ──
function loadPatches(): Patches {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

function savePatches(p: Patches) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p))
  } catch {
    // 配额满了忽略
  }
}

// ── Hook ──
export function usePatchesState() {
  const [patches, setPatchesRaw] = useState<Patches>(() => loadPatches())
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 防抖保存
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => savePatches(patches), 200)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [patches])

  // 单元素 patch 更新
  const patchElement = useCallback((id: string, partial: Partial<ElementPatch>) => {
    setPatchesRaw((cur) => {
      const old = cur[id] ?? {}
      const next = { ...old, ...partial }
      // 清理空字段
      const cleaned: ElementPatch = {}
      for (const k of Object.keys(next) as (keyof ElementPatch)[]) {
        const v = next[k]
        if (v !== undefined && v !== null && v !== '' && v !== false) {
          ;(cleaned as Record<string, unknown>)[k] = v
        }
      }
      // 如果该元素再无 patch 字段, 直接删除
      if (Object.keys(cleaned).length === 0) {
        const { [id]: _, ...rest } = cur
        return rest
      }
      return { ...cur, [id]: cleaned }
    })
  }, [])

  const resetElement = useCallback((id: string) => {
    setPatchesRaw((cur) => {
      const { [id]: _, ...rest } = cur
      return rest
    })
  }, [])

  const resetAll = useCallback(() => {
    setPatchesRaw({})
  }, [])

  const exportJSON = useCallback(() => {
    return JSON.stringify(patches, null, 2)
  }, [patches])

  const importJSON = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json)
      if (typeof parsed === 'object' && parsed) {
        setPatchesRaw(parsed)
        return true
      }
      return false
    } catch {
      return false
    }
  }, [])

  return { patches, patchElement, resetElement, resetAll, exportJSON, importJSON }
}

// ── Context ──
type PatchesCtx = ReturnType<typeof usePatchesState>
const PatchesContext = createContext<PatchesCtx | null>(null)

export function PatchesProvider({
  value,
  children,
}: {
  value: PatchesCtx
  children: React.ReactNode
}) {
  return createElement(PatchesContext.Provider, { value }, children)
}

export function usePatches() {
  const ctx = useContext(PatchesContext)
  if (!ctx) throw new Error('usePatches must be inside PatchesProvider')
  return ctx
}
