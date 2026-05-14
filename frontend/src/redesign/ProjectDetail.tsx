/**
 * NewProjectDetail(后台) — 项目信息卡 + 文档列表
 * 功能 100% 等价 — getProject + getProjectMeta + listProjectDocuments + ProjectFormModal
 */
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Building2, Calendar, FileText, Pencil, FileType } from 'lucide-react'
import {
  getProject, getProjectMeta, listProjectDocuments,
} from '../api/client'
import ProjectFormModal from '../components/ProjectFormModal'
import { formatTime } from '../utils/datetime'
import GlowCard from './components/GlowCard'

const STATUS_LABEL: Record<string, string> = {
  pending: '等待处理', converting: '转换中', slicing: '切片中', completed: '完成', failed: '失败',
}
const STATUS_BADGE: Record<string, string> = {
  pending: 'is-orange', converting: 'is-orange', slicing: 'is-violet', completed: 'is-green', failed: 'is-red',
}

export default function NewBackendProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id], queryFn: () => getProject(id!), enabled: !!id,
  })
  const { data: meta } = useQuery({ queryKey: ['project-meta'], queryFn: getProjectMeta })
  const { data: docs, isLoading: docsLoading } = useQuery({
    queryKey: ['project-docs', id], queryFn: () => listProjectDocuments(id!), enabled: !!id,
  })

  if (isLoading || !project) {
    return <div className="rd-page" style={{ textAlign: 'center', color: 'var(--rd-text-3)', fontSize: 13 }}>加载中…</div>
  }

  return (
    <div className="rd-page" style={{ maxWidth: 1280 }}>
      <Link
        to="/projects"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          color: 'var(--rd-text-3)', fontSize: 13, textDecoration: 'none',
          marginBottom: 14,
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--rd-text)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--rd-text-3)'}
      >
        <ArrowLeft size={14} /> 返回项目库
      </Link>

      {/* 项目信息卡 */}
      <GlowCard style={{ padding: 22, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{
              fontSize: 22, fontWeight: 800, color: 'var(--rd-text)',
              letterSpacing: '-0.015em', margin: 0,
            }}>{project.name}</h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 22px', marginTop: 10, fontSize: 12.5, color: 'var(--rd-text-2)' }}>
              {project.customer && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Building2 size={12} color="var(--rd-text-3)" /> {project.customer}
                </span>
              )}
              {project.kickoff_date && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Calendar size={12} color="var(--rd-text-3)" /> 立项 {project.kickoff_date}
                </span>
              )}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <FileText size={12} color="var(--rd-text-3)" /> {project.document_count} 份文档
              </span>
            </div>
            {project.modules && project.modules.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                {project.modules.map(m => <span key={m} className="rd-badge is-orange">{m}</span>)}
              </div>
            )}
            {project.description && (
              <p style={{ fontSize: 13, color: 'var(--rd-text-2)', marginTop: 12, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {project.description}
              </p>
            )}
          </div>
          <button onClick={() => setEditing(true)} className="rd-btn" style={{ padding: '6px 12px', fontSize: 12, flexShrink: 0 }}>
            <Pencil size={11} /> 编辑
          </button>
        </div>
      </GlowCard>

      {/* 文档列表 */}
      <GlowCard style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--rd-line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--rd-text)', margin: 0 }}>项目文档</h2>
          <Link to="/documents" style={{ fontSize: 12, color: 'var(--rd-accent-2)', textDecoration: 'none' }}>前往上传 →</Link>
        </div>
        {docsLoading ? (
          <p style={{ padding: '24px 20px', fontSize: 13, color: 'var(--rd-text-3)' }}>加载中…</p>
        ) : !docs || docs.length === 0 ? (
          <p style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: 'var(--rd-text-3)' }}>暂无文档</p>
        ) : (
          <table className="rd-table">
            <thead>
              <tr>
                <th>文件名</th>
                <th>类型</th>
                <th>状态</th>
                <th>上传者</th>
                <th>上传时间</th>
              </tr>
            </thead>
            <tbody>
              {docs.map(d => (
                <tr key={d.id}>
                  <td style={{ maxWidth: 320 }}>
                    <Link to={`/documents?open=${d.id}`} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0,
                      color: 'var(--rd-text)', textDecoration: 'none',
                    }}>
                      <FileText size={12} color="var(--rd-text-3)" />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.filename}</span>
                    </Link>
                  </td>
                  <td>
                    {d.doc_type_label ? (
                      <span className="rd-badge is-violet" style={{ gap: 3 }}>
                        <FileType size={9} /> {d.doc_type_label}
                      </span>
                    ) : <span style={{ color: 'var(--rd-text-3)', fontSize: 11 }}>—</span>}
                  </td>
                  <td>
                    <span className={`rd-badge ${STATUS_BADGE[d.conversion_status] ?? 'is-gray'}`}>
                      {STATUS_LABEL[d.conversion_status] ?? d.conversion_status}
                    </span>
                  </td>
                  <td style={{ fontSize: 11.5, color: 'var(--rd-text-2)' }}>{d.uploader_name ?? '—'}</td>
                  <td className="rd-mono" style={{ fontSize: 11, color: 'var(--rd-text-3)' }}>{formatTime(d.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlowCard>

      <ProjectFormModal
        open={editing}
        meta={meta}
        initial={project}
        onClose={() => setEditing(false)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['project', id] })
          qc.invalidateQueries({ queryKey: ['projects'] })
        }}
      />
    </div>
  )
}
