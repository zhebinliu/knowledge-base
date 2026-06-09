/**
 * VersionWatcher — 前端版本变更检测 + 提示用户刷新。
 *
 * 2026-06-09 起加。修一类隐蔽事故:
 *  - 后端跑了新版本 sha,前端 docker image 也部署了新版本
 *  - 但用户的浏览器(或公司代理)还缓存着旧 dist 的 index.html / JS bundle
 *  - 用户看到的还是老页面 / 老功能 / 没有刚加的按钮,以为"被回滚了"
 *
 * 做法:
 *  - frontend Dockerfile 在 build 时把 GIT_SHA 写到 /dist/version.json
 *  - 启动 + 每 60s 拉一次 /version.json(带 cache-bust query)
 *  - 第一次拿到的 sha 存内存里作 baseline
 *  - 后面拉到不一样的 sha → 弹一个不打扰的固定通知,「有新版本,点这里刷新」
 *  - 用户点击就 location.reload();不点也没事,等下次主动刷新
 *
 * 故意不自动 reload:用户可能正在打字 / 编辑表单,自动 reload 丢草稿是恶意 UX。
 * 给个明确按钮 + 红点徽章足够。
 *
 * 局部失效不阻断 app:fetch 失败 / version.json 404 直接静默。
 */
import { useEffect, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'

const POLL_INTERVAL_MS = 60_000   // 1 分钟一次
const STORAGE_DISMISS_KEY = 'kb-version-update-dismissed-for-sha'

interface VersionInfo { sha: string; ts: string }

async function fetchVersion(): Promise<VersionInfo | null> {
  try {
    // cache-bust:同一秒内反复拉避免被中间缓存吞掉
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    })
    if (!res.ok) return null
    return (await res.json()) as VersionInfo
  } catch {
    return null
  }
}

export default function VersionWatcher() {
  const [baseline, setBaseline] = useState<string | null>(null)
  const [latest, setLatest] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      const info = await fetchVersion()
      if (!info || cancelled) return
      if (baseline === null) {
        setBaseline(info.sha)
      } else if (info.sha !== baseline) {
        setLatest(info.sha)
      }
    }
    tick()
    const id = window.setInterval(tick, POLL_INTERVAL_MS)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [baseline])

  // 用户曾经"暂时忽略"过这个 sha → 这次不弹
  const dismissedSha = (() => {
    try { return sessionStorage.getItem(STORAGE_DISMISS_KEY) } catch { return null }
  })()

  if (!latest || latest === baseline || latest === dismissedSha) return null

  const handleReload = () => {
    // 强 reload — 绕过 disk cache,确保拉到新 index.html
    // location.reload(true) 在 TS lib 里已废弃;用 trick:加一个 query 触发新 URL
    const url = new URL(window.location.href)
    url.searchParams.set('_v', latest.slice(0, 7))
    window.location.replace(url.toString())
  }

  const handleDismiss = () => {
    try { sessionStorage.setItem(STORAGE_DISMISS_KEY, latest) } catch {}
    setLatest(baseline)  // 视觉上把通知收起来,下次再变 sha 才弹
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[9999] flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm
                 bg-gradient-to-br from-orange-500 to-orange-600 text-white"
      style={{ boxShadow: '0 12px 32px -8px rgba(217,100,0,0.5)' }}
    >
      <RefreshCw size={14} className="animate-spin shrink-0" />
      <div className="flex flex-col leading-tight">
        <span className="font-semibold">有新版本上线</span>
        <span className="text-[11px] text-orange-100">点击刷新加载新代码 · {latest.slice(0, 7)}</span>
      </div>
      <button
        onClick={handleReload}
        className="ml-2 px-3 py-1.5 text-xs font-semibold rounded-md bg-white text-orange-700 hover:bg-orange-50"
      >
        刷新
      </button>
      <button
        onClick={handleDismiss}
        title="暂时不刷新(下次有新版会再弹)"
        className="text-orange-100 hover:text-white p-1 rounded hover:bg-white/10"
      >
        <X size={12} />
      </button>
    </div>
  )
}
