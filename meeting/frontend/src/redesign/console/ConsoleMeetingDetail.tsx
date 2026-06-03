/**
 * NewConsoleMeetingDetail — uat 下的会议详情页(Liquid Glass)
 *
 * 布局: 左右分栏
 *   - 左侧(≈55%): 纪要 / 需求清单 / 干系人 Tab
 *   - 右侧(≈45%): 转录 / 润色转写 Tab
 *   - 顶栏额外提供「概览」和「操作」入口
 *
 * Tab 内部组件复用 ConsoleMeetingDetail.tsx 导出的老实现。
 */
import { useState, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  ChevronLeft, Loader2, RefreshCw, Trash2, FolderKanban,
  FileText, ListChecks, Users, Settings as SettingsIcon, Info,
  type LucideIcon,
} from 'lucide-react'
import {
  getMeeting, deleteMeeting, processMeeting,
  type Meeting,
} from '../../api/client'
import {
  StatusBadge, fmt,
  SeekToContext,
  OverviewTab, TranscriptTab, MinutesTab,
  RequirementsTab, StakeholdersTab, ActionsTab,
} from '../../pages/console/ConsoleMeetingDetail'
import { getMeetingAudioUrl } from '../../api/meeting-ext'
import AudioPlayer, { type AudioPlayerHandle } from '../../components/AudioPlayer'
import ChatWidget from '../../components/ChatSidebar'
import TemplateSelector from '../../components/TemplateSelector'
import GlowCard from '../components/GlowCard'

type LeftTab = 'minutes' | 'requirements' | 'stakeholders'
type RightTab = 'transcript' | 'polished'

const LEFT_TABS: Array<{ key: LeftTab; label: string; Icon: LucideIcon }> = [
  { key: 'minutes',      label: '会议纪要', Icon: ListChecks },
  { key: 'requirements', label: '需求清单', Icon: ListChecks },
  { key: 'stakeholders', label: '干系人',   Icon: Users },
]

const RIGHT_TABS: Array<{ key: RightTab; label: string; Icon: LucideIcon }> = [
  { key: 'transcript', label: '原文',   Icon: FileText },
  { key: 'polished',   label: 'AI润色', Icon: FileText },
]

export default function NewConsoleMeetingDetail() {
  const { id } = useParams<{ id: string }>()
  const meetingId = Number(id)
  const nav = useNavigate()
  const qc = useQueryClient()
  // URL ?from_project=<pid>:从项目详情页跳过来,返回时回项目页而不是会议总列表
  const [searchParams] = useSearchParams()
  const fromProject = searchParams.get('from_project') || ''
  const backHref = fromProject ? `/console/projects/${fromProject}` : '/console/meeting'
  const backLabel = fromProject ? '返回项目' : '返回列表'
  // 视图模式: 'split'(默认左右分栏) | 'overview' | 'actions'
  const [view, setView] = useState<'split' | 'overview' | 'actions'>('split')
  const [leftTab, setLeftTab] = useState<LeftTab>('minutes')
  const [rightTab, setRightTab] = useState<RightTab>('transcript')
  const audioPlayerRef = useRef<AudioPlayerHandle>(null)

  const { data: meeting, isLoading, error } = useQuery({
    queryKey: ['meeting', meetingId],
    queryFn: () => getMeeting(meetingId),
    enabled: Number.isFinite(meetingId),
    refetchInterval: (qq) => {
      const m = qq.state.data as Meeting | undefined
      return m && (m.status === 'processing' || m.status === 'recording') ? 5000 : false
    },
  })

  const processMut = useMutation({
    mutationFn: () => processMeeting(meetingId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting', meetingId] }),
  })

  const delMut = useMutation({
    mutationFn: () => deleteMeeting(meetingId),
    onSuccess: () => nav(backHref),
  })

  if (!Number.isFinite(meetingId)) {
    return <div className="rd-page" style={{ textAlign: 'center', color: 'var(--rd-text-3)', fontSize: 13 }}>无效的会议 ID</div>
  }
  if (isLoading) {
    return (
      <div className="rd-page" style={{ textAlign: 'center', color: 'var(--rd-text-3)', fontSize: 13 }}>
        <Loader2 size={16} className="animate-spin" style={{ display: 'inline', marginRight: 8 }} /> 加载中…
      </div>
    )
  }
  if (error || !meeting) {
    return <div className="rd-page" style={{ textAlign: 'center', color: '#F87171', fontSize: 13 }}>会议不存在或无权访问</div>
  }

  const handleSeekTo = (seconds: number) => {
    audioPlayerRef.current?.seekTo(seconds)
  }
  const hasAudio = !!meeting?.audio_object_key
  const hasContent = !!(meeting && (meeting.raw_transcript || meeting.meeting_minutes))
  const audioUrl = hasAudio ? getMeetingAudioUrl(meeting.id) : ''

  return (
    <div className="rd-page" style={{ maxWidth: 1280 }}>
      {/* 返回:URL 带 from_project 时回项目页,否则回会议总列表 */}
      <button
        onClick={() => nav(backHref)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: 'transparent', border: 'none', padding: '4px 0',
          color: 'var(--rd-text-3)', fontSize: 13, cursor: 'pointer',
          marginBottom: 14, fontFamily: 'inherit',
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--rd-text)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--rd-text-3)'}
      >
        <ChevronLeft size={14} /> {backLabel}
      </button>

      {/* Header 卡 */}
      <GlowCard style={{ padding: '18px 22px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{
              fontSize: 20, fontWeight: 800, color: 'var(--rd-text)',
              letterSpacing: '-0.015em', margin: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{meeting.title}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, fontSize: 12, color: 'var(--rd-text-3)' }}>
              <StatusBadge status={meeting.status} />
              <span>·</span>
              <span className="rd-mono">{fmt(meeting.created_at)}</span>
              {meeting.project_name && (
                <>
                  <span>·</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <FolderKanban size={11} /> {meeting.project_name}
                  </span>
                </>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => processMut.mutate()}
              disabled={processMut.isPending || !meeting.raw_transcript}
              className="rd-btn"
              style={{ fontSize: 12, padding: '7px 14px' }}
              title="重新跑完整 AI pipeline"
            >
              {processMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              重新处理
            </button>
            <button
              onClick={() => {
                if (window.confirm(`确认删除「${meeting.title}」?`)) delMut.mutate()
              }}
              className="rd-btn"
              style={{ fontSize: 12, padding: '7px 12px', color: '#F87171' }}
              title="删除"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </GlowCard>

      {/* 音频播放器(仅当有录音文件时显示) */}
      {hasAudio && (
        <div style={{ marginBottom: 14 }}>
          <AudioPlayer ref={audioPlayerRef} audioUrl={audioUrl} />
        </div>
      )}

      {/* 转写进度条 — processing + total_chunks > 0 才显示 */}
      {meeting.status === 'processing' && meeting.total_chunks > 0 && (
        <GlowCard glow style={{ padding: '14px 20px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, fontSize: 12 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--rd-text-2)' }}>
              <Loader2 size={12} className="animate-spin" color="var(--rd-accent)" />
              正在切片并发转写 · {meeting.asr_engine || 'xiaomi'} ASR
            </span>
            <span className="rd-mono" style={{ color: 'var(--rd-text-3)' }}>
              {meeting.done_chunks} / {meeting.total_chunks} 片
              ({Math.round((meeting.done_chunks / meeting.total_chunks) * 100)}%)
            </span>
          </div>
          <div style={{
            height: 5, borderRadius: 999, overflow: 'hidden',
            background: 'rgba(255, 141, 26, 0.10)',
          }}>
            <div
              style={{
                height: '100%',
                width: `${(meeting.done_chunks / meeting.total_chunks) * 100}%`,
                background: 'linear-gradient(90deg, var(--rd-accent), var(--rd-accent-2))',
                boxShadow: '0 0 8px var(--rd-accent)',
                transition: 'width .5s var(--rd-ease)',
              }}
            />
          </div>
          {meeting.raw_transcript && (
            <div style={{
              marginTop: 10, fontSize: 12, color: 'var(--rd-text-2)',
              maxHeight: 96, overflowY: 'auto',
              background: 'rgba(15, 18, 36, .025)',
              border: '1px solid var(--rd-line)',
              borderRadius: 8, padding: '8px 10px',
              lineHeight: 1.6,
            }}>
              {meeting.raw_transcript.slice(-400)}
              <span style={{
                display: 'inline-block', width: 2, height: 12,
                background: 'var(--rd-accent)', marginLeft: 2, verticalAlign: 'middle',
                animation: 'rd-blink 0.85s steps(2) infinite',
              }} />
            </div>
          )}
        </GlowCard>
      )}

      {/* 模板选择与导出（仅当有纪要内容时显示） */}
      {hasContent && meeting.meeting_minutes && (
        <div style={{ marginBottom: 14 }}>
          <TemplateSelector meetingId={meeting.id} meetingTitle={meeting.title} />
        </div>
      )}

      {/* 主内容区 — 顶栏快捷切换 + 分栏/全屏内容 */}
      <GlowCard style={{ padding: 0, overflow: 'hidden' }}>
        {/* 顶部导航条: 概览 / 分栏视图 / 操作 */}
        <div style={{
          borderBottom: '1px solid var(--rd-line)',
          display: 'flex', alignItems: 'center', gap: 2,
          background: 'rgba(15,18,36,.012)',
        }}>
          {([
            { key: 'split',    label: '分栏', Icon: FileText },
            { key: 'overview', label: '概览', Icon: Info },
            { key: 'actions',  label: '操作', Icon: SettingsIcon },
          ] as Array<{ key: typeof view; label: string; Icon: LucideIcon }>).map(v => {
            const Ic = v.Icon
            const active = view === v.key
            return (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '10px 18px',
                  fontSize: 13, fontWeight: active ? 700 : 500,
                  color: active ? 'var(--rd-accent-2)' : 'var(--rd-text-2)',
                  background: active
                    ? 'linear-gradient(180deg, rgba(255,141,26,.10) 0%, rgba(255,141,26,.02) 100%)'
                    : 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${active ? 'var(--rd-accent)' : 'transparent'}`,
                  marginBottom: -1,
                  cursor: 'pointer',
                  transition: 'all .2s',
                  fontFamily: 'inherit',
                }}
              >
                <Ic size={13} /> {v.label}
              </button>
            )
          })}
        </div>

        <SeekToContext.Provider value={hasAudio ? handleSeekTo : null}>
          {view === 'overview' && (
            <div style={{ padding: '20px 24px' }}>
              <OverviewTab meeting={meeting} />
            </div>
          )}

          {view === 'actions' && (
            <div style={{ padding: '20px 24px' }}>
              <ActionsTab meeting={meeting} />
            </div>
          )}

          {view === 'split' && (
            /* ── 左右分栏 ── */
            <div className="grid grid-cols-1 lg:grid-cols-5" style={{ minHeight: 480 }}>
              {/* 左侧面板: 纪要 / 需求清单 / 干系人 */}
              <div style={{ borderRight: '1px solid var(--rd-line)' }} className="lg:col-span-3">
                {/* 左侧 Tab 栏 */}
                <div style={{
                  display: 'flex', borderBottom: '1px solid var(--rd-line)',
                  background: 'rgba(15,18,36,.008)',
                }}>
                  {LEFT_TABS.map(t => {
                    const Ic = t.Icon
                    const active = leftTab === t.key
                    return (
                      <button
                        key={t.key}
                        onClick={() => setLeftTab(t.key)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '11px 20px',
                          fontSize: 13, fontWeight: active ? 700 : 500,
                          color: active ? 'var(--rd-accent-2)' : 'var(--rd-text-3)',
                          background: active ? 'rgba(255,141,26,.06)' : 'transparent',
                          border: 'none',
                          borderBottom: `2px solid ${active ? 'var(--rd-accent)' : 'transparent'}`,
                          marginBottom: -1,
                          cursor: 'pointer', transition: 'all .2s', fontFamily: 'inherit',
                        }}
                      >
                        <Ic size={13} /> {t.label}
                      </button>
                    )
                  })}
                </div>
                {/* 左侧内容 */}
                <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: 'calc(100vh - 340px)' }}>
                  {leftTab === 'minutes'      && <MinutesTab meeting={meeting} />}
                  {leftTab === 'requirements' && <RequirementsTab meeting={meeting} />}
                  {leftTab === 'stakeholders'  && <StakeholdersTab meeting={meeting} />}
                </div>
              </div>

              {/* 右侧面板: 转录 / 润色转写 */}
              <div className="lg:col-span-2">
                {/* 右侧 Tab 栏 */}
                <div style={{
                  display: 'flex', borderBottom: '1px solid var(--rd-line)',
                  background: 'rgba(15,18,36,.008)',
                }}>
                  {RIGHT_TABS.map(t => {
                    const Ic = t.Icon
                    const active = rightTab === t.key
                    return (
                      <button
                        key={t.key}
                        onClick={() => setRightTab(t.key)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '11px 20px',
                          fontSize: 13, fontWeight: active ? 700 : 500,
                          color: active ? '#2563eb' : 'var(--rd-text-3)',
                          background: active ? 'rgba(37,99,235,.06)' : 'transparent',
                          border: 'none',
                          borderBottom: `2px solid ${active ? '#2563eb' : 'transparent'}`,
                          marginBottom: -1,
                          cursor: 'pointer', transition: 'all .2s', fontFamily: 'inherit',
                        }}
                      >
                        <Ic size={13} /> {t.label}
                      </button>
                    )
                  })}
                </div>
                {/* 右侧内容 */}
                <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: 'calc(100vh - 340px)', background: 'rgba(248,250,252,.35)' }}>
                  <TranscriptPanel meeting={meeting} rightTab={rightTab} />
                </div>
              </div>
            </div>
          )}
        </SeekToContext.Provider>
      </GlowCard>

      {/* 智能问答悬浮球 + 侧边栏 */}
      <ChatWidget meetingId={meeting.id} hasContent={hasContent} />
    </div>
  )
}

// ── 右侧转录面板: 原文 / AI润色 切换展示 ───────────────────────────────────────

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function TranscriptPanel({ meeting, rightTab }: { meeting: Meeting; rightTab: RightTab }) {
  const content = rightTab === 'transcript'
    ? (meeting.raw_transcript || '暂无原始转写')
    : (meeting.polished_transcript || '暂无润色转写，可在「操作」页触发 AI 润色')

  const isEmpty = rightTab === 'transcript' ? !meeting.raw_transcript : !meeting.polished_transcript

  if (isEmpty) {
    return (
      <div className="text-center py-12 text-sm text-ink-muted">
        {rightTab === 'transcript'
          ? '暂无原始转写内容'
          : (
            <div className="space-y-3">
              <p>暂无润色版本</p>
              <p className="text-xs">切换到「操作」标签可触发 AI 润色</p>
            </div>
          )}
      </div>
    )
  }

  return (
    <div className="text-[13px] leading-relaxed text-ink-secondary prose prose-sm max-w-none prose-p:my-1.5 prose-headings:mt-3 prose-headings:mb-2 prose-ul:list-disc prose-ol:list-decimal prose-li:my-0.5">
      {/* 转录文本中可能包含说话人标记如 "说话人0 00:00:06 - 00:00:39"，用 Markdown 渲染 */}
      {rightTab === 'polished' ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      ) : (
        <pre
          className="whitespace-pre-wrap font-sans text-inherit bg-transparent p-0 m-0 border-none"
          style={{ lineHeight: 1.8 }}
        >{content}</pre>
      )}
    </div>
  )
}
