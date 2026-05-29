/**
 * ShareDevTab —— 用户级 sharedev / 纷享销客 PaaS 凭证管理(2026-05-29)
 *
 * 用于项目实施阶段:顾问填客户租户的 domain + certificate(PaaS API token),
 * KB 系统加密入库,后续 ImplementationWorkspace 触发的所有 sharedev 命令都用
 * 当前用户的凭证调客户租户 API。
 *
 * Phase 1:仅做凭证管理 + 一个 verify 按钮(后端 stub return success)。
 * Phase 2:verify 真打 sidecar 调 sharedev dev-metadata search 验证。
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Link2, Check, Copy, Trash2, EyeOff, ShieldCheck } from 'lucide-react'
import {
  getShareDevCredentials,
  putShareDevCredentials,
  deleteShareDevCredentials,
  verifyShareDevCredentials,
} from '../../api/client'

export default function ShareDevTab() {
  const qc = useQueryClient()
  const { data: status, isLoading } = useQuery({
    queryKey: ['sharedev-creds'],
    queryFn: getShareDevCredentials,
  })

  const [editing, setEditing] = useState(false)
  const [domain, setDomain] = useState('')
  const [certificate, setCertificate] = useState('')
  const [copied, setCopied] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null)

  const saveMut = useMutation({
    mutationFn: () => putShareDevCredentials({ domain: domain.trim(), certificate: certificate.trim() }),
    onSuccess: (data) => {
      qc.setQueryData(['sharedev-creds'], { configured: true, domain: data.domain })
      setEditing(false)
      setDomain('')
      setCertificate('')
      setSaveError(null)
    },
    onError: (err: any) => {
      setSaveError(err?.response?.data?.detail || err?.message || '保存失败,请检查 domain 和 certificate')
    },
  })

  const delMut = useMutation({
    mutationFn: deleteShareDevCredentials,
    onSuccess: () => {
      qc.setQueryData(['sharedev-creds'], { configured: false, domain: 'https://www.fxiaoke.com/' })
      setDeleteError(null)
    },
    onError: (err: any) => {
      setDeleteError(err?.response?.data?.detail || err?.message || '清除失败')
    },
  })

  const verifyMut = useMutation({
    mutationFn: verifyShareDevCredentials,
    onSuccess: (data) => {
      setVerifyMsg(data.detail || '验证通过')
    },
    onError: (err: any) => {
      setVerifyMsg(err?.response?.data?.detail || err?.message || '验证失败')
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
          <Link2 size={18} className="text-orange-500" />
          <h3 className="text-sm font-semibold text-gray-900">ShareDev / 纷享销客 PaaS 凭证</h3>
          {configured && (
            <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              已配置
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">
          每个用户配置自己的客户租户 PaaS API token,用于「项目实施」阶段调用 sharedev skill 工作流:
          生成对象/字段/校验规则/布局 xml + APL Groovy + PWC 组件,并推送到客户租户。
        </p>
        <p className="text-xs text-gray-400 mt-1">
          凭证获取:登录{' '}
          <a
            href="https://developer.fxiaoke.com/"
            target="_blank"
            rel="noreferrer"
            className="text-orange-600 underline"
          >
            纷享销客开发者中心
          </a>
          {' '}→ 我的应用 → 自建应用 → 获取 API token(certificate)。
        </p>
      </div>

      {/* 凭证管理 */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h4 className="text-sm font-medium text-gray-900 mb-4">
          {configured ? '当前凭证' : '配置凭证'}
        </h4>

        {!editing ? (
          configured ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-20 shrink-0">Domain</span>
                <code className="text-xs bg-gray-50 px-2 py-1 rounded border border-gray-200 font-mono flex-1">
                  {status!.domain}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(status!.domain || '')
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
                <span className="text-xs text-gray-500 w-20 shrink-0">Certificate</span>
                <code className="text-xs bg-gray-50 px-2 py-1 rounded border border-gray-200 font-mono flex-1 inline-flex items-center gap-1.5">
                  <EyeOff size={12} className="text-gray-400 shrink-0" />
                  已加密存储,不可查看
                </code>
              </div>

              <div className="flex gap-2 pt-2 flex-wrap">
                <button
                  onClick={() => {
                    setDomain(status!.domain || '')
                    setEditing(true)
                    setSaveError(null)
                  }}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-orange-600 text-white hover:bg-orange-700 transition-colors"
                >
                  修改凭证
                </button>
                <button
                  onClick={() => { setVerifyMsg(null); verifyMut.mutate() }}
                  disabled={verifyMut.isPending}
                  className="px-3 py-1.5 rounded-md text-xs font-medium border border-gray-200 text-gray-600 hover:text-orange-600 hover:border-orange-200 transition-colors inline-flex items-center gap-1"
                >
                  {verifyMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                  验证可用
                </button>
                <button
                  onClick={() => {
                    if (confirm('确认清除 sharedev 凭证?清除后项目实施工作台的部署能力将不可用。')) delMut.mutate()
                  }}
                  disabled={delMut.isPending}
                  className="px-3 py-1.5 rounded-md text-xs font-medium border border-gray-200 text-gray-600 hover:text-red-600 hover:border-red-200 transition-colors inline-flex items-center gap-1"
                >
                  {delMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  清除凭证
                </button>
              </div>

              {verifyMsg && (
                <p className={`text-xs ${verifyMut.isError ? 'text-red-600' : 'text-emerald-700'}`}>{verifyMsg}</p>
              )}
              {deleteError && (
                <p className="text-xs text-red-500">{deleteError}</p>
              )}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm text-gray-400 mb-3">尚未配置 sharedev 凭证</p>
              <button
                onClick={() => {
                  setDomain('https://www.fxiaoke.com/')
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
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Domain
                <span className="text-gray-400 ml-1.5 font-normal">(默认 https://www.fxiaoke.com/,私有部署改成对应域名)</span>
              </label>
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="https://www.fxiaoke.com/"
                className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Certificate (API Token)</label>
              <input
                type="password"
                value={certificate}
                onChange={(e) => setCertificate(e.target.value)}
                placeholder="从开发者中心获取的 API token"
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
                disabled={!domain.trim() || !certificate.trim() || saveMut.isPending}
                className="px-4 py-2 rounded-md text-sm font-medium bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
              >
                {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                保存
              </button>
              <button
                onClick={() => {
                  setEditing(false)
                  setDomain('')
                  setCertificate('')
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
          <li>1. 凭证一旦配置,「项目详情 → 项目实施」工作台所有 sharedev 操作都用当前用户的凭证</li>
          <li>2. 多客户场景:目前一个用户一份凭证,服务多个客户时需切换凭证(Phase 3 加多 cert 支持)</li>
          <li>3. certificate 字段 Fernet 加密入库,不可在 UI 反查</li>
          <li>4. Phase 1:验证按钮 stub(返回 success);Phase 2 真打 sidecar 调 sharedev dev-metadata search 验证</li>
        </ul>
      </div>
    </div>
  )
}
