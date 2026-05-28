/**
 * MeetingShareModal — 会议纪要分享弹窗(2026-05-27)
 *
 * 行为:
 * - 会议绑定项目:自动列出项目成员(自动可见,只读),下方仍能再加项目外的人
 * - 会议未绑定项目:只能通过下面的「添加分享对象」加单个用户
 * - 搜索用户调 /api/projects/_/users/search(任何登录用户都能调)
 * - 不能把会议 owner 自己加进 share 表(后端拒,前端预过滤)
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Loader2, Search, X, Plus, Users, FolderKanban, UserPlus } from 'lucide-react'
import Modal from './Modal'
import { toast } from './Toaster'
import {
  listMeetingShares, addMeetingShares, removeMeetingShare, searchUsersForCollab,
  type MeetingShareEntry, type UserSearchResult,
} from '../api/client'

const BRAND_GRAD = 'linear-gradient(135deg,#FF8D1A,#D96400)'

interface Props {
  meetingId: number
  open: boolean
  onClose: () => void
}

export default function MeetingShareModal({ meetingId, open, onClose }: Props) {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['meeting-shares', meetingId],
    queryFn: () => listMeetingShares(meetingId),
    enabled: open,
  })

  const [search, setSearch] = useState('')
  const [results, setResults] = useState<UserSearchResult[]>([])
  const [searching, setSearching] = useState(false)

  // 弹窗每次打开重置搜索框
  useEffect(() => {
    if (open) { setSearch(''); setResults([]) }
  }, [open, meetingId])

  // 输入防抖搜索
  useEffect(() => {
    if (!open) return
    const q = search.trim()
    if (q.length < 1) { setResults([]); return }
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const rs = await searchUsersForCollab(q, 10)
        setResults(rs)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [search, open])

  const addMut = useMutation({
    mutationFn: (userId: string) => addMeetingShares(meetingId, [userId]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meeting-shares', meetingId] })
      toast.success('已分享')
      setSearch(''); setResults([])
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.detail || '分享失败'
      toast.error(typeof msg === 'string' ? msg : '分享失败')
    },
  })

  const delMut = useMutation({
    mutationFn: (userId: string) => removeMeetingShare(meetingId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meeting-shares', meetingId] })
      toast.success('已取消分享')
    },
  })

  // 已经在共享池(项目成员、显式分享、owner)里的 user_id 集合 — 用于禁用「再加」
  const occupiedIds = useMemo(() => {
    const ids = new Set<string>()
    if (data?.owner?.user_id) ids.add(data.owner.user_id)
    data?.project_members?.forEach(m => ids.add(m.user_id))
    data?.shares?.forEach(s => ids.add(s.user_id))
    return ids
  }, [data])

  return (
    <Modal
      open={open}
      title={
        <span className="inline-flex items-center gap-1.5">
          <UserPlus size={16} className="text-orange-600" />
          分享会议纪要
        </span>
      }
      onClose={onClose}
      width="xl"
    >
      {isLoading ? (
        <div className="py-12 text-center text-ink-muted">
          <Loader2 size={20} className="inline-block animate-spin mr-2" /> 加载中
        </div>
      ) : (
        <div className="space-y-5">
          {/* 项目成员区块 */}
          {data?.project ? (
            <section>
              <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink mb-2">
                <FolderKanban size={13} className="text-orange-600" />
                项目「{data.project.name}」的成员
                <span className="text-[11px] text-ink-muted font-normal">
                  · 已自动获得访问权限,不需要单独分享
                </span>
              </div>
              {data.project_members.length === 0 ? (
                <p className="text-[12px] text-ink-muted pl-5">无其他成员</p>
              ) : (
                <ul className="space-y-1 pl-5">
                  {data.project_members.map(m => (
                    <li key={m.user_id} className="flex items-center gap-2 text-[13px]">
                      <span className="text-ink">
                        {m.full_name || m.username || m.email || m.user_id}
                      </span>
                      <span className="text-[11px] text-ink-muted">{m.email}</span>
                      <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200">
                        {m.role === 'owner' ? '项目所有者' : (m.role === 'read_write' ? '读写' : '只读')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <section>
              <div className="flex items-center gap-1.5 text-[13px] text-ink-muted">
                <Users size={13} /> 该会议未关联项目,通过下方添加分享对象。
              </div>
            </section>
          )}

          {/* 显式分享列表 */}
          <section>
            <div className="text-[13px] font-medium text-ink mb-2">已分享给</div>
            {(!data?.shares || data.shares.length === 0) ? (
              <p className="text-[12px] text-ink-muted pl-1">暂无显式分享对象</p>
            ) : (
              <ul className="space-y-1">
                {data.shares.map(s => (
                  <ShareRow key={s.id} share={s} onRemove={() => delMut.mutate(s.user_id)} busy={delMut.isPending} />
                ))}
              </ul>
            )}
          </section>

          {/* 添加用户搜索 */}
          <section>
            <div className="text-[13px] font-medium text-ink mb-2">添加分享对象</div>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-ink-muted" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="按用户名 / 邮箱 / 姓名搜索"
                className="w-full pl-7 pr-3 py-1.5 rounded border border-line text-sm focus:outline-none focus:border-orange-400"
              />
              {searching && (
                <Loader2 size={13} className="absolute right-2.5 top-2.5 animate-spin text-ink-muted" />
              )}
            </div>

            {results.length > 0 && (
              <ul className="mt-2 border border-line rounded divide-y divide-line max-h-56 overflow-y-auto">
                {results.map(u => {
                  const taken = occupiedIds.has(u.id)
                  return (
                    <li key={u.id} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-canvas">
                      <span className="text-[13px] text-ink">
                        {u.full_name || u.username}
                      </span>
                      <span className="text-[11px] text-ink-muted">{u.email}</span>
                      <button
                        onClick={() => addMut.mutate(u.id)}
                        disabled={taken || addMut.isPending}
                        className="ml-auto px-2 py-0.5 rounded text-[11px] text-white inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: taken ? '#9ca3af' : BRAND_GRAD }}
                        title={taken ? '已可访问' : '分享给此用户'}
                      >
                        {taken ? '已在列表' : (<><Plus size={11} />分享</>)}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {search.trim() && !searching && results.length === 0 && (
              <p className="text-[12px] text-ink-muted mt-2">无匹配用户</p>
            )}
          </section>
        </div>
      )}
    </Modal>
  )
}

function ShareRow({
  share, onRemove, busy,
}: { share: MeetingShareEntry; onRemove: () => void; busy: boolean }) {
  return (
    <li className="flex items-center gap-2 text-[13px] py-1">
      <span className="text-ink">
        {share.full_name || share.username || share.email || share.user_id}
      </span>
      <span className="text-[11px] text-ink-muted">{share.email}</span>
      <button
        onClick={onRemove}
        disabled={busy}
        className="ml-auto p-1 text-ink-muted hover:text-red-600 disabled:opacity-50"
        title="取消分享"
      >
        <X size={13} />
      </button>
    </li>
  )
}
