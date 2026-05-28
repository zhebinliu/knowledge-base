/**
 * EmbeddingsTab — 嵌入(embedding)与重排(rerank)运行时配置(2026-05-28)
 *
 * - 两个独立卡片,字段一样:api_base / model / api_key
 * - 改完即刷新生效,不用重启容器(config_service 在 upsert 后 invalidate cache)
 * - api_key 显示掩码,留空表示不改;明文重置回 .env 可用每行右侧的"重置"按钮
 */
import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getEmbeddingConfig, updateEmbeddingConfig, resetEmbeddingField,
  getRerankConfig, updateRerankConfig, resetRerankField,
  type EmbRerankConfig, type EmbRerankPatch,
} from '../../api/client'
import { Sparkles, Save, RotateCcw, Loader2, Database, FileCode2, CheckCircle2 } from 'lucide-react'

const gradientStyle = { background: 'linear-gradient(135deg, #FF8D1A, #FF7A00)' }

export default function EmbeddingsTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-ink flex items-center gap-1.5">
          <Sparkles size={14} className="text-orange-600" />
          嵌入与重排配置
        </h2>
        <p className="text-[11px] text-ink-muted mt-0.5">
          检索链路上的两个外部服务。改完即生效,无需重启。空表示不修改;
          有 DB 值时优先用 DB,否则回退到 .env。
        </p>
      </div>

      <ConfigCard
        title="嵌入服务 (Embedding)"
        desc="负责文档切片向量化与查询向量化,影响召回质量"
        loader={getEmbeddingConfig}
        saver={updateEmbeddingConfig}
        resetter={resetEmbeddingField}
        queryKey="embedding-config"
        examplePlaceholder={{
          api_base: 'http://123.118.102.143:3000/api',
          model: 'qwen3-embedding:0.6b',
        }}
      />

      <ConfigCard
        title="重排服务 (Rerank)"
        desc="对召回结果做二次排序;rerank 失败时会自动回退到向量分数"
        loader={getRerankConfig}
        saver={updateRerankConfig}
        resetter={resetRerankField}
        queryKey="rerank-config"
        examplePlaceholder={{
          api_base: 'https://api.edgefn.net/v1',
          model: 'BAAI/bge-reranker-v2-m3',
        }}
      />
    </div>
  )
}


function ConfigCard({
  title, desc, loader, saver, resetter, queryKey, examplePlaceholder,
}: {
  title: string
  desc: string
  loader: () => Promise<EmbRerankConfig>
  saver: (body: EmbRerankPatch) => Promise<{ ok: boolean; changed: string[] }>
  resetter: (key: 'api_base' | 'model' | 'api_key') => Promise<{ ok: boolean }>
  queryKey: string
  examplePlaceholder: { api_base: string; model: string }
}) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: [queryKey], queryFn: loader })

  const [base, setBase] = useState('')
  const [model, setModel] = useState('')
  const [key, setKey] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)

  // 初始化输入框:DB 来源就预填,env 来源留空(避免一保存就把 env 值同步覆盖到 DB)
  const reset = useCallback((d: EmbRerankConfig) => {
    setBase(d.api_base_source === 'database' ? d.api_base : '')
    setModel(d.model_source === 'database' ? d.model : '')
    setKey('') // api_key 是 masked,永远空
  }, [])

  useEffect(() => { if (data) reset(data) }, [data, reset])

  const saveMut = useMutation({
    mutationFn: () => {
      const patch: EmbRerankPatch = {}
      if (base.trim() && base !== data?.api_base) patch.api_base = base.trim()
      if (model.trim() && model !== data?.model) patch.model = model.trim()
      if (key.trim()) patch.api_key = key.trim()
      return saver(patch)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] })
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
    },
  })

  const resetMut = useMutation({
    mutationFn: resetter,
    onSuccess: () => qc.invalidateQueries({ queryKey: [queryKey] }),
  })

  if (isLoading || !data) {
    return (
      <div className="rounded-lg border border-line bg-white p-4 flex items-center gap-2 text-sm text-ink-muted">
        <Loader2 size={14} className="animate-spin" /> 加载中
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-line bg-white p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <p className="text-[11px] text-ink-muted">{desc}</p>
      </div>

      <Field
        label="API Base"
        value={base}
        onChange={setBase}
        placeholder={examplePlaceholder.api_base}
        live={data.api_base}
        source={data.api_base_source}
        isSet={data.api_base_raw_set}
        canReset={data.api_base_source === 'database'}
        onReset={() => resetMut.mutate('api_base')}
      />

      <Field
        label="Model"
        value={model}
        onChange={setModel}
        placeholder={examplePlaceholder.model}
        live={data.model}
        source={data.model_source}
        isSet={data.model_raw_set}
        canReset={data.model_source === 'database'}
        onReset={() => resetMut.mutate('model')}
      />

      <Field
        label="API Key"
        value={key}
        onChange={setKey}
        placeholder="留空 = 不修改"
        live={data.api_key || '(未设置)'}
        source={data.api_key_source}
        isSet={data.api_key_raw_set}
        canReset={data.api_key_source === 'database'}
        onReset={() => resetMut.mutate('api_key')}
        isSecret
      />

      <div className="flex items-center justify-end gap-2 pt-1">
        {savedFlash && (
          <span className="text-[12px] text-emerald-600 inline-flex items-center gap-1">
            <CheckCircle2 size={12} /> 已保存
          </span>
        )}
        <button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className="px-3 py-1.5 rounded text-sm text-white inline-flex items-center gap-1.5 disabled:opacity-50"
          style={gradientStyle}
        >
          {saveMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          保存改动
        </button>
      </div>
    </div>
  )
}


function Field({
  label, value, onChange, placeholder, live, source, isSet, canReset, onReset, isSecret,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  live: string
  source: 'database' | 'env'
  isSet: boolean
  canReset: boolean
  onReset: () => void
  isSecret?: boolean
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label className="text-[11px] font-medium text-ink-secondary">{label}</label>
        <SourceBadge source={source} isSet={isSet} />
      </div>
      <div className="flex items-center gap-2">
        <input
          type={isSecret ? 'password' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-2 py-1.5 border border-line rounded text-sm focus:outline-none focus:border-orange-300 font-mono"
          autoComplete="off"
        />
        {canReset && (
          <button
            onClick={onReset}
            title="删 DB 覆盖,回退到 .env"
            className="p-1.5 text-ink-muted hover:text-orange-600 border border-line rounded hover:bg-canvas"
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>
      <p className="text-[10px] text-ink-muted mt-1 font-mono">
        当前生效值: {live || '(空)'}
      </p>
    </div>
  )
}


function SourceBadge({ source, isSet }: { source: 'database' | 'env'; isSet: boolean }) {
  if (source === 'database') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-orange-50 text-orange-700 ring-1 ring-orange-200">
        <Database size={9} /> DB
      </span>
    )
  }
  return (
    <span className={`inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wider px-1 py-0.5 rounded ring-1 ${
      isSet ? 'bg-slate-50 text-slate-600 ring-slate-200' : 'bg-red-50 text-red-700 ring-red-200'
    }`}>
      <FileCode2 size={9} /> {isSet ? '.env' : '未设置'}
    </span>
  )
}
