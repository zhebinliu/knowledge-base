import { useState } from 'react'
import { Upload, MoreHorizontal, Search, FileText, FileSpreadsheet, FileType, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react'
import GlowCard from '../components/GlowCard'

const PROJECTS = ['全部', '海尔智家', '美的集团', '蒙牛乳业', '伊利股份']
const TYPES    = ['全部', 'SOW', '交接单', '合同', '验收', 'QA 复盘', '其他']

type Doc = {
  name: string; project: string; type: string;
  status: 'done' | 'processing' | 'review' | 'failed';
  user: string; time: string;
}

const DOCS: Doc[] = [
  { name: '海尔智家 SOW v3.pdf',        project: '海尔智家', type: 'SOW',     status: 'done',       user: '刘哲滨', time: '今天 14:22' },
  { name: '美的集团交接清单.docx',       project: '美的集团', type: '交接单',  status: 'processing', user: '陈伟',   time: '今天 13:08' },
  { name: '蒙牛 QA 复盘 2026Q1.md',     project: '蒙牛乳业', type: 'QA 复盘', status: 'done',       user: '李艳',   time: '今天 10:14' },
  { name: '伊利股份合同 A.pdf',          project: '伊利股份', type: '合同',    status: 'review',     user: '王明',   time: '昨天 18:22' },
  { name: '海尔实施排期.xlsx',           project: '海尔智家', type: '其他',    status: 'done',       user: '刘哲滨', time: '昨天 16:40' },
  { name: '中粮验收报告.pptx',           project: '中粮集团', type: '验收',    status: 'failed',     user: '陈伟',   time: '昨天 14:10' },
  { name: '光明乳业 BI 接入方案.pdf',     project: '光明乳业', type: '其他',    status: 'processing', user: '王明',   time: '昨天 11:30' },
]

const STATUS_META = {
  done:       { label: '已完成', cls: 'is-green' },
  processing: { label: '处理中', cls: 'is-orange' },
  review:     { label: '待审核', cls: 'is-blue' },
  failed:     { label: '失败',   cls: 'is-red' },
} as const

function typeIcon(t: string) {
  if (t === 'SOW' || t === '合同') return FileText
  if (t.includes('表') || t.includes('排期')) return FileSpreadsheet
  return FileType
}

export default function Documents() {
  const [project, setProject] = useState('全部')
  const [type, setType]       = useState('全部')

  const filtered = DOCS.filter(d =>
    (project === '全部' || d.project === project) &&
    (type === '全部'    || d.type === type)
  )

  return (
    <div className="rd-page">
      <div className="rd-page-head">
        <h1>文档</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="rd-btn"><Search size={13} /> 搜索</button>
          <button className="rd-btn rd-btn-primary"><Upload size={13} /> 上传</button>
        </div>
      </div>

      {/* Drop zone + Upload queue */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16, marginBottom: 28 }}>
        <GlowCard style={{ padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="rd-dropzone">
            <div className="rd-dropzone-ring" />
            <Upload size={26} color="var(--rd-accent)" style={{ filter: 'drop-shadow(0 0 6px rgba(255,141,26,.5))' }} />
            <strong>拖拽上传</strong>
            <span>或点击选择文件</span>
          </div>
        </GlowCard>

        <GlowCard shimmer style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--rd-text)' }}>当前上传</h3>
            <span className="rd-mono" style={{ fontSize: 11, color: 'var(--rd-accent-2)' }}>3 / 4</span>
          </div>

          {[
            { name: '海尔实施排期.xlsx',     pct: 100, state: 'done' },
            { name: '美的交接清单 v2.docx',  pct: 72,  state: 'progress' },
            { name: '蒙牛复盘.md',          pct: 100, state: 'done' },
            { name: '伊利合同 A.pdf',       pct: 41,  state: 'progress' },
          ].map(u => (
            <div key={u.name} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                {u.state === 'done'
                  ? <CheckCircle2 size={12} color="var(--rd-green)" style={{ filter: 'drop-shadow(0 0 4px var(--rd-green))' }} />
                  : <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--rd-accent)', boxShadow: '0 0 8px var(--rd-accent)', animation: 'rd-pulse 1.2s ease-in-out infinite' }} />
                }
                <span style={{ flex: 1, fontSize: 12.5, color: 'var(--rd-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
                <span className="rd-mono" style={{ fontSize: 11, color: 'var(--rd-text-2)' }}>{u.pct}%</span>
              </div>
              <div style={{ height: 3, background: 'rgba(15, 18, 36, .04)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  width: `${u.pct}%`, height: '100%',
                  background: u.state === 'done' ? 'var(--rd-green)' : 'linear-gradient(90deg, var(--rd-accent), var(--rd-accent-2))',
                  boxShadow: u.state === 'done' ? '0 0 6px var(--rd-green)' : '0 0 6px var(--rd-accent)',
                  transition: 'width .5s var(--rd-ease)',
                }} />
              </div>
            </div>
          ))}
        </GlowCard>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--rd-text-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>项目</span>
          {PROJECTS.map(p => (
            <button key={p} className={`rd-chip${project === p ? ' is-active' : ''}`} onClick={() => setProject(p)}>{p}</button>
          ))}
        </div>
        <div style={{ height: 16, width: 1, background: 'var(--rd-line)', alignSelf: 'center' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--rd-text-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>类型</span>
          {TYPES.map(t => (
            <button key={t} className={`rd-chip${type === t ? ' is-active' : ''}`} onClick={() => setType(t)}>{t}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <GlowCard style={{ padding: 0, overflow: 'hidden' }}>
        <table className="rd-table">
          <thead>
            <tr>
              <th>文件</th>
              <th>项目</th>
              <th>类型</th>
              <th>状态</th>
              <th>更新</th>
              <th style={{ width: 60 }} />
            </tr>
          </thead>
          <tbody>
            {filtered.map(d => {
              const Icon = typeIcon(d.type)
              const status = STATUS_META[d.status]
              return (
                <tr key={d.name}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: 'rgba(255,141,26,.10)',
                        border: '1px solid rgba(255,141,26,.18)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--rd-accent-2)',
                        flexShrink: 0,
                      }}>
                        <Icon size={13} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: 'var(--rd-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                          {d.name}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--rd-text-3)', marginTop: 2 }}>{d.user}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className="rd-muted" style={{ fontSize: 12.5 }}>{d.project}</span></td>
                  <td><span className="rd-badge is-gray">{d.type}</span></td>
                  <td><span className={`rd-badge ${status.cls}`}>{status.label}</span></td>
                  <td><span className="rd-dim rd-mono" style={{ fontSize: 11.5 }}>{d.time}</span></td>
                  <td>
                    <div className="rd-row-actions" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button className="rd-icon-btn" style={{ width: 28, height: 28 }} aria-label="更多">
                        <MoreHorizontal size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </GlowCard>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
        <span className="rd-dim" style={{ fontSize: 12 }}>共 {filtered.length} 份</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="rd-icon-btn" style={{ width: 30, height: 30 }}><ChevronLeft size={14} /></button>
          <span className="rd-chip is-active">1</span>
          <span className="rd-chip">2</span>
          <span className="rd-chip">3</span>
          <button className="rd-icon-btn" style={{ width: 30, height: 30 }}><ChevronRight size={14} /></button>
        </div>
      </div>
    </div>
  )
}
