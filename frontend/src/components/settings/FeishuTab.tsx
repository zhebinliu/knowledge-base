import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Link2, Check, Copy, Trash2 } from 'lucide-react'
import {
  getFeishuCredentials,
  putFeishuCredentials,
  deleteFeishuCredentials,
} from '../../api/client'

export default function FeishuTab() {
  const qc = useQueryClient()
  const { data: status, isLoading } = useQuery({
    queryKey: ['feishu-creds'],
    queryFn: getFeishuCredentials,
  })

  const [editing, setEditing] = useState(false)
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [copied, setCopied] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const saveMut = useMutation({
    mutationFn: () => putFeishuCredentials({ app_id: appId.trim(), app_secret: appSecret.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feishu-creds'] })
      setEditing(false)
      setAppId('')
      setAppSecret('')
      setSaveError(null)
    },
    onError: (err: any) => {
      setSaveError(err?.response?.data?.detail || err?.message || '保存失败,请检查 App ID/Secret 是否正确')
    },
  })

  const delMut = useMutation({
    mutationFn: deleteFeishuCredentials,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feishu-creds'] })
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
      {/* 说明区块 */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-2">
          <Link2 size={18} className="text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-900">飞书集成凭证</h3>
          {configured && (
            <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              已配置
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">
          每个用户需配置自己的飞书自建应用凭证，用于导出会议纪要到飞书云空间，以及同步待办到飞书多维表格看板。
        </p>
        <p className="text-xs text-gray-400 mt-1">
          前往{' '}
          <a
            href="https://open.feishu.cn/app"
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 underline"
          >
            飞书开放平台
          </a>
          {' '}创建自建应用，获取 App ID 和 App Secret。
        </p>
      </div>

      {/* 凭证管理 */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h4 className="text-sm font-medium text-gray-900 mb-4">
          {configured ? '当前凭证' : '配置凭证'}
        </h4>

        {!editing ? (
          configured ? (
            /* 已配置状态 */
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-16 shrink-0">App ID</span>
                <code className="text-xs bg-gray-50 px-2 py-1 rounded border border-gray-200 font-mono flex-1">
                  {status!.app_id}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(status!.app_id || '')
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded"
                  title="复制"
                >
                  {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-16 shrink-0">Secret</span>
                <code className="text-xs bg-gray-50 px-2 py-1 rounded border border-gray-200 font-mono flex-1">
                  {showSecret ? '••••••••（已加密存储）' : '••••••••••••••••'}
                </code>
                <button
                  onClick={() => setShowSecret(!showSecret)}
                  className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
                >
                  {showSecret ? '隐藏' : '查看'}
                </button>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    setAppId(status!.app_id || '')
                    setEditing(true)
                    setSaveError(null)
                  }}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  修改凭证
                </button>
                <button
                  onClick={() => {
                    if (confirm('确认清除飞书凭证？清除后会议导出和同步功能将不可用。')) delMut.mutate()
                  }}
                  disabled={delMut.isPending}
                  className="px-3 py-1.5 rounded-md text-xs font-medium border border-gray-200 text-gray-600 hover:text-red-600 hover:border-red-200 transition-colors inline-flex items-center gap-1"
                >
                  {delMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  清除凭证
                </button>
              </div>

              {deleteError && (
                <p className="text-xs text-red-500">{deleteError}</p>
              )}
            </div>
          ) : (
            /* 未配置状态 */
            <div className="text-center py-6">
              <p className="text-sm text-gray-400 mb-3">尚未配置飞书凭证</p>
              <button
                onClick={() => {
                  setEditing(true)
                  setSaveError(null)
                }}
                className="px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                立即配置
              </button>
            </div>
          )
        ) : (
          /* 编辑状态 */
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">App ID</label>
              <input
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder="形如 cli_xxxxxxxxxxxx"
                className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">App Secret</label>
              <input
                type="password"
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                placeholder="输入 App Secret"
                className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
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
          <li>1. 在飞书开放平台创建自建应用，获取 App ID 和 App Secret</li>
          <li>2. 确保应用已开启"云文档"和"多维表格"相关权限</li>
          <li>3. 配置完成后，在会议详情页的"Actions"标签页中进行导出和同步操作</li>
          <li>4. 每个用户独立配置，互不影响</li>
        </ul>
      </div>
    </div>
  )
}
