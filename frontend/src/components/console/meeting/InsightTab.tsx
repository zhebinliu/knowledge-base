/**
 * 会议「洞察」tab — 集中承载对这场会的四种量化回看:
 *
 *   1. 词云        这场会真正聊了什么
 *   2. 发言时长     谁在主导讨论
 *   3. 待办四象限   项目一套,轴为「紧急 × 必要」
 *   4. 会议对比     与本项目上一场会议的变化洞察 + 建议
 *
 * 为什么集中在一个 tab:四者语义同类(都是「对会议/项目做分析」的产物),且各段自带
 * 触发按钮与空态,能容纳异构的数据可用性(词云只需转写,象限需要项目,对比还需上一场)。
 *
 * 本文件被 pages/console/ConsoleMeetingDetail.tsx 再导出,redesign 壳从那里 import ——
 * 新旧两套 UI 复用同一个组件,样式只用 tailwind 令牌(text-ink / border-line / bg-white …),
 * redesign.css 已对 .rd-root 下这些 class 做覆盖,故暗色壳下同样正确,不需要 theme prop。
 */
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Sparkles, RefreshCw, Cloud, AlertTriangle, Users } from 'lucide-react'
import { runMeetingAction, type Meeting } from '../../../api/client'
import { toast } from '../../Toaster'
import KeywordCloud from './KeywordCloud'
import SpeakerDurationChart from './SpeakerDurationChart'

// 与 pages/console/ConsoleMeetingDetail.tsx 的 BRAND_GRAD 保持一致(品牌橙渐变)
const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

function Section({
  title, desc, onRefresh, refreshing, canRefresh, children,
}: {
  title: string
  desc?: string
  onRefresh?: () => void
  refreshing?: boolean
  canRefresh?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-line bg-white p-4">
      <header className="mb-3 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {desc && <p className="mt-0.5 text-xs text-ink-muted">{desc}</p>}
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing || canRefresh === false}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1 text-xs text-ink-secondary hover:bg-canvas disabled:opacity-50"
          >
            {refreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {refreshing ? '生成中…' : '重新生成'}
          </button>
        )}
      </header>
      {children}
    </section>
  )
}

function EmptyState({ text, onGenerate, generating, disabled }: {
  text: string
  onGenerate: () => void
  generating: boolean
  disabled?: boolean
}) {
  return (
    <div className="py-8 text-center text-ink-muted">
      <Cloud size={26} className="mx-auto mb-2" />
      <p className="mb-3 text-sm">{text}</p>
      <button
        onClick={onGenerate}
        disabled={generating || disabled}
        className="inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm text-white disabled:opacity-50"
        style={{ background: BRAND_GRAD }}
      >
        {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        立即生成
      </button>
    </div>
  )
}

// ── 1. 词云 ───────────────────────────────────────────────────────────────

function KeywordSection({ meeting }: { meeting: Meeting }) {
  const qc = useQueryClient()
  const data = meeting.keywords
  const hasText = Boolean(meeting.polished_transcript || meeting.raw_transcript)

  const genMut = useMutation({
    mutationFn: () => runMeetingAction(meeting.id, 'extract_keywords'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meeting', meeting.id] })
      toast.success('词云已生成')
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : '词云生成失败'),
  })

  const keywords = data?.keywords ?? []

  return (
    <Section
      title="词云"
      desc="从会议转写中提取的关键词,字号与权重正相关(权重已用原文真实词频校正)"
      onRefresh={keywords.length > 0 ? () => genMut.mutate() : undefined}
      refreshing={genMut.isPending}
      canRefresh={hasText}
    >
      {keywords.length > 0 ? (
        <>
          {data?.focus && (
            <p className="mb-3 rounded-md border-l-2 border-brand bg-canvas px-3 py-2 text-xs text-ink-secondary">
              <span className="font-medium text-ink">讨论焦点:</span>
              {data.focus}
            </p>
          )}
          <KeywordCloud keywords={keywords} />
          {data?.truncated && (
            <p className="mt-3 flex items-center gap-1 text-xs text-amber-600">
              <AlertTriangle size={12} />
              转写过长,本次仅分析了前 {data.source_chars.toLocaleString()} 字,后半段议题可能未覆盖
            </p>
          )}
        </>
      ) : (
        <EmptyState
          text={hasText ? '尚未生成词云' : '该会议没有转写文本,无法生成词云'}
          onGenerate={() => genMut.mutate()}
          generating={genMut.isPending}
          disabled={!hasText}
        />
      )}
    </Section>
  )
}

// ── 2. 参会人发言时长 ─────────────────────────────────────────────────────

function SpeakerSection({ meeting }: { meeting: Meeting }) {
  const qc = useQueryClient()
  const stats = meeting.speaker_stats
  const hasText = Boolean(meeting.polished_transcript || meeting.raw_transcript)
  const hasData = Boolean(stats && stats.speakers.length > 0)

  const genMut = useMutation({
    mutationFn: () => runMeetingAction(meeting.id, 'extract_speaker_durations'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meeting', meeting.id] })
      toast.success('发言时长已生成')
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : '发言时长生成失败'),
  })

  return (
    <Section
      title="参会人发言时长"
      desc="谁在主导讨论。本页无声纹分离能力,时长由转写时间标记推算或由 AI 归属推断"
      onRefresh={hasData ? () => genMut.mutate() : undefined}
      refreshing={genMut.isPending}
      canRefresh={hasText}
    >
      {hasData && stats ? (
        <SpeakerDurationChart stats={stats} />
      ) : (
        <div className="py-8 text-center text-ink-muted">
          <Users size={26} className="mx-auto mb-2" />
          {/* mode="none" 时后端会给出可操作的原因(缺转写 / 缺时间标记 / 缺参会人名单) */}
          <p className="mb-3 text-sm">{stats?.note || (hasText ? '尚未计算发言时长' : '该会议没有转写文本')}</p>
          <button
            onClick={() => genMut.mutate()}
            disabled={genMut.isPending || !hasText}
            className="inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm text-white disabled:opacity-50"
            style={{ background: BRAND_GRAD }}
          >
            {genMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            立即生成
          </button>
        </div>
      )}
    </Section>
  )
}

// ── 容器 ──────────────────────────────────────────────────────────────────

export default function InsightTab({ meeting }: { meeting: Meeting }) {
  return (
    <div className="space-y-4">
      <KeywordSection meeting={meeting} />
      <SpeakerSection meeting={meeting} />
    </div>
  )
}
