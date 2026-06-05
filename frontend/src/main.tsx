import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { AuthProvider } from './auth/AuthContext'
import './index.css'

// ── vite 动态 import chunk 失效自动恢复(2026-06-05) ────────────────────────
// 部署新 dist 后,旧 tab 持有的 main bundle 还引用着旧 chunk hash,触发懒加载时
// (mermaid stateDiagram-v2 / 路由 lazy chunk / markdown 高亮 lang 包等)
// 报 `Failed to fetch dynamically imported module: .../assets/xxx-OLDHASH.js`。
// vite 标准事件 `vite:preloadError` 可以捕获 — 直接 reload 拉新 main bundle 就好。
// 防御:10 秒内只 reload 一次,避免新 dist 真有问题时陷入无限刷新循环。
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event: any) => {
    const KEY = 'vite-preload-reload-at'
    const last = Number(sessionStorage.getItem(KEY) || 0)
    const now = Date.now()
    if (now - last < 10_000) {
      // 10 秒内已经刷过一次还报同样的错 → 不再自动 reload,让 ErrorBoundary / 组件兜底
      console.warn('[vite preload] repeated chunk load failure within 10s, skip auto-reload', event?.payload)
      return
    }
    sessionStorage.setItem(KEY, String(now))
    try { event?.preventDefault?.() } catch {}
    console.warn('[vite preload] stale chunk detected, auto-reloading for fresh dist', event?.payload)
    window.location.reload()
  })
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
