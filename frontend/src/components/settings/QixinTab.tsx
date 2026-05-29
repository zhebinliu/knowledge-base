/**
 * QixinTab —— 用户级企信 IM Bot 凭证管理(2026-05-29)
 *
 * 每个顾问配自己的企信 Bot(appId / appSecret),后端启 SSE 长连接收消息,
 * 工作台右下"企信"抽屉里能看到自己 Bot 收到的会话 + 消息流。
 *
 * Phase 1:只做凭证 + 看消息;Phase 2 接自动回复(走 kb_agent / RAG)+ 手动发消息。
 *
 * 注意:同一个 appId 只能由一个用户配置(Gateway 单连接限制),后端 PUT 返 409
 * 时这里把错误透传给用户。
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, MessageSquare, Check, Trash2, EyeOff } from 'lucide-react'
import {
  getQixinCredentials,
  putQixinCredentials,
  deleteQixinCredentials,
} from '../../api/client'

const DEFAULT_GATEWAY = 'https://open.fxiaoke.com'

export default function QixinTab() {
  const qc = useQueryClient()
  const { data: status, isLoading } = useQuery({
    queryKey: ['qixin-creds'],
    queryFn: getQixinCredentials,
  })

  const [editing, setEditing] = useState(false)
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [gatewayUrl, setGatewayUrl] = useState(DEFAULT_GATEWAY)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const saveMut = useMutation({
    mutationFn: () =>
      putQixinCredentials({
        app_id: appId.trim(),
        app_secret: appSecret.trim(),
        gateway_url: gatewayUrl.trim() || DEFAULT_GATEWAY,
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['qixin-creds'] })
      qc.invalidateQueries({ queryKey: ['qixin-conversations'] })
      setEditing(false)
      setAppId('')
      setAppSecret('')
      setGatewayUrl(DEFAULT_GATEWAY)
      setSaveError(null)
      void data
    },
    onError: (err: any) => {
      setSaveError(
        err?.response?.data?.detail || err?.message || '保存失败,请检查 app_id / app_secret',
      )
    },
  })

  const delMut = useMutation({
    mutationFn: deleteQixinCredentials,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['qixin-creds'] })
      qc.invalidateQueries({ queryKey: ['qixin-conversations'] })
      setDeleteError(null)
    },
    onError: (err: any) => {
      setDeleteError(err?.response?.data?.detail || err?.message || '清除失败')
    },
  })

  const configured = status?.configured

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-8">
        <Loader2 size={16} className="animate-spin" />
        加载中…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 说明 */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare size={18} className="text-orange-500" />
          <h3 className="text-sm font-semibold text-gray-900">企信 IM Bot 凭证</h3>
          {configured && (
            <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              已配置
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">
          配置自己的企信 Bot(appId / appSecret),后端会建立 SSE 长连接收私聊 / 群聊消息,
          在工作台右下「企信」抽屉里查看。Phase 1 只看消息;Phase 2 接 RAG 自动回复 + 手动发消息。
        </p>
        <p className="text-xs text-gray-400 mt-1">
          凭证获取:登录{' '}
          <a
            href="https://open.fxiaoke.com/"
            target="_blank"
            rel="noreferrer"
            className="text-orange-600 underline"
          >
            纷享销客企信开放平台
          </a>
          {' '}→ 创建 Bot 应用 → 拿到 appId / appSecret。
        </p>
        <p className="text-xs text-amber-600 mt-1.5">
          ⚠ 同一个 appId 在企信 Gateway 只能保留一条活跃连接 —— 两人配同一个会互相踢线。
          每人独立创建自己的 Bot 应用。
        </p>
      </div>

      {/* 凭证表单 / 状态 */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h4 className="text-sm font-medium text-gray-900 mb-4">
          {configured ? '当前凭证' : '配置凭证'}
        </h4>

        {!editing ? (
          configured ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-24 shrink-0">App ID</span>
                <code className="text-xs bg-gray-50 px-2 py-1 rounded border border-gray-200 font-mono flex-1">
                  {status!.app_id_masked || '—'}
                </code>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-24 shrink-0">App Secret</span>
                <code className="text-xs bg-gray-50 px-2 py-1 rounded border border-gray-200 font-mono flex-1 inline-flex items-center gap-1.5">
                  <EyeOff size={12} className="text-gray-400 shrink-0" />
                  已加密存储,不可查看
                </code>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-24 shrink-0">Gateway URL</span>
                <code className="text-xs bg-gray-50 px-2 py-1 rounded border border-gray-200 font-mono flex-1">
                  {status!.gateway_url}
                </code>
              </div>

              <div className="flex gap-2 pt-2 flex-wrap">
                <button
                  onClick={() => {
                    setAppId('')
                    setAppSecret('')
                    setGatewayUrl(status!.gateway_url || DEFAULT_GATEWAY)
                    setEditing(true)
                    setSaveError(null)
                  }}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-orange-600 text-white hover:bg-orange-700 transition-colors"
                >
                  修改凭证
                </button>
                <button
                  onClick={() => {
                    if (confirm('确认清除企信凭证?清除后 Bot 立即下线,历史消息保留。'))
                      delMut.mutate()
                  }}
                  disabled={delMut.isPending}
                  className="px-3 py-1.5 rounded-md text-xs font-medium border border-gray-200 text-gray-600 hover:text-red-600 hover:border-red-200 transition-colors inline-flex items-center gap-1"
                >
                  {delMut.isPending ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Trash2 size={13} />
                  )}
                  清除凭证
                </button>
              </div>

              {deleteError && <p className="text-xs text-red-500">{deleteError}</p>}

              <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 inline-flex items-center gap-1.5">
                <Check size={13} />
                凭证已生效,后端 SSE 连接持续监听中
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm text-gray-400 mb-3">尚未配置企信 Bot 凭证</p>
              <button
                onClick={() => {
                  setAppId('')
                  setAppSecret('')
                  setGatewayUrl(DEFAULT_GATEWAY)
                  setEditing(true)
                  setSaveError(null)
                }}
                className="px-4 py-2 rounded-md text-sm font-medium bg-orange-600 text-white hover:bg-orange-700 transition-colors"
              >
                立即配置
              </button>
            </div>
          )
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">App ID</label>
              <input
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder="企信 Bot 应用 appId"
                className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">App Secret</label>
              <input
                type="password"
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                placeholder="企信 Bot 应用 appSecret"
                className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Gateway URL
                <span className="text-gray-400 ml-1.5 font-normal">
                  (默认 {DEFAULT_GATEWAY},专属云改成对应 Gateway)
                </span>
              </label>
              <input
                value={gatewayUrl}
                onChange={(e) => setGatewayUrl(e.target.value)}
                placeholder={DEFAULT_GATEWAY}
                className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>

            {saveError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {saveError}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => saveMut.mutate()}
                disabled={!appId.trim() || !appSecret.trim() || saveMut.isPending}
                className="px-4 py-2 rounded-md text-sm font-medium bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
              >
                {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                保存
              </button>
              <button
                onClick={() => {
                  setEditing(false)
                  setAppId('')
                  setAppSecret('')
                  setSaveError(null)
                }}
                className="px-4 py-2 rounded-md text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 使用说明 */}
      <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-5">
        <h4 className="text-sm font-medium text-gray-800 mb-2">使用说明</h4>
        <ul className="text-xs text-gray-500 space-y-1.5 leading-relaxed">
          <li>1. 凭证保存后,后端立即建立 SSE 长连接,企信 Bot 收到的私聊 / 被 @ 的群聊消息会落库</li>
          <li>2. 工作台右下「企信」浮动按钮 → 抽屉里可看到自己 Bot 的会话列表 + 消息流</li>
          <li>3. App Secret Fernet 加密入库,UI 反查不到</li>
          <li>4. Phase 1 只看消息,不自动回复;Phase 2 接 RAG 自动回复 + 手动发消息</li>
          <li>5. 群聊默认仅在 @Bot 时才进入推送,跟企信 Gateway 1.3 协议一致</li>
        </ul>
      </div>
    </div>
  )
}
