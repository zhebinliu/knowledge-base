/**
 * API Documentation — /api
 * No auth required. Shows REST endpoints + MCP server setup.
 * Design: follows /ds design-system tokens (light theme).
 */
import { useState, useEffect } from 'react'
import { Copy, Check, BookOpen, Key, Zap, Code2, Box, ChevronDown, ChevronRight, Terminal, FileText } from 'lucide-react'

const BASE = 'https://kb.tokenwave.cloud'

// ── Helpers ───────────────────────────────────────────────────────────────────

function useCopy() {
  const [id, setId] = useState<string | null>(null)
  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setId(key)
    setTimeout(() => setId(null), 1800)
  }
  return { copied: (k: string) => id === k, copy }
}

function CopyBtn({ text, id, label = '' }: { text: string; id: string; label?: string }) {
  const { copied, copy } = useCopy()
  return (
    <button
      onClick={() => copy(text, id)}
      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-line bg-canvas text-ink-secondary hover:text-brand hover:border-brand transition-colors"
    >
      {copied(id) ? <Check size={11} className="text-green-600" /> : <Copy size={11} />}
      {label || (copied(id) ? '已复制' : '复制')}
    </button>
  )
}

function CodeBlock({ code, lang = 'bash', id }: { code: string; lang?: string; id: string }) {
  return (
    <div className="relative mt-3 rounded-lg overflow-hidden border border-line">
      <div className="flex items-center justify-between px-4 py-2 bg-surface border-b border-line">
        <span className="text-xs text-ink-muted font-mono">{lang}</span>
        <CopyBtn text={code} id={id} />
      </div>
      <pre className="bg-[#F5F7FA] px-4 py-3 text-xs text-[#1a3a5c] font-mono overflow-x-auto whitespace-pre leading-relaxed">
        {code}
      </pre>
    </div>
  )
}

function Method({ m }: { m: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' }) {
  const colors: Record<string, string> = {
    GET:    'bg-blue-50 text-blue-700 border-blue-200',
    POST:   'bg-green-50 text-green-700 border-green-200',
    PUT:    'bg-amber-50 text-amber-700 border-amber-200',
    PATCH:  'bg-purple-50 text-purple-700 border-purple-200',
    DELETE: 'bg-red-50 text-red-700 border-red-200',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold border font-mono ${colors[m]}`}>
      {m}
    </span>
  )
}

// ── Endpoint card ─────────────────────────────────────────────────────────────

function Endpoint({ method, path, desc, params, example, response }: {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  desc: string
  params?: { name: string; type: string; req: boolean; desc: string }[]
  example?: string
  response?: string
}) {
  const [open, setOpen] = useState(false)
  const fullPath = `${BASE}${path}`
  return (
    <div className="border border-line rounded-lg mb-3 overflow-hidden bg-surface">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-canvas transition-colors text-left"
      >
        <Method m={method} />
        <code className="text-sm text-ink font-mono flex-1">{path}</code>
        <span className="text-xs text-ink-secondary hidden sm:block">{desc}</span>
        {open ? <ChevronDown size={14} className="text-ink-muted flex-shrink-0" />
               : <ChevronRight size={14} className="text-ink-muted flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-line pt-3">
          <p className="text-sm text-ink-secondary mb-3">{desc}</p>
          {params && params.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-ink-muted mb-2 uppercase tracking-wider">参数</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-ink-muted">
                      <th className="text-left pb-1 font-medium w-32">参数名</th>
                      <th className="text-left pb-1 font-medium w-24">类型</th>
                      <th className="text-left pb-1 font-medium w-16">必填</th>
                      <th className="text-left pb-1 font-medium">说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {params.map(p => (
                      <tr key={p.name} className="border-t border-line">
                        <td className="py-1.5 pr-3 font-mono text-[#D96400]">{p.name}</td>
                        <td className="py-1.5 pr-3 text-blue-600">{p.type}</td>
                        <td className="py-1.5 pr-3">{p.req ? <span className="text-red-600">是</span> : <span className="text-ink-muted">否</span>}</td>
                        <td className="py-1.5 text-ink-secondary">{p.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {example && <CodeBlock code={example} lang="bash" id={`ex-${path}`} />}
          {response && (
            <CodeBlock code={response} lang="json (response)" id={`res-${path}`} />
          )}
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-ink-muted">完整 URL：</span>
            <code className="text-xs text-ink font-mono">{fullPath}</code>
            <CopyBtn text={fullPath} id={`url-${path}`} label="复制 URL" />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({ id, title, icon: Icon, children }: {
  id: string; title: string; icon: any; children: React.ReactNode
}) {
  return (
    <section id={id} className="mb-14 scroll-mt-8">
      <div className="flex items-center gap-2.5 mb-5 pb-3 border-b border-line">
        <div className="w-8 h-8 rounded-lg bg-brand-light flex items-center justify-center">
          <Icon size={15} style={{ color: 'var(--accent)' }} />
        </div>
        <h2 className="text-lg font-bold text-ink">{title}</h2>
      </div>
      {children}
    </section>
  )
}

// ── MCP Tool card ─────────────────────────────────────────────────────────────

function McpTool({ name, desc, params, example }: {
  name: string; desc: string
  params: { n: string; t: string; req: boolean; d: string }[]
  example: object
}) {
  return (
    <div className="border border-line rounded-lg p-4 bg-surface mb-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-7 h-7 rounded bg-brand-light flex items-center justify-center flex-shrink-0 mt-0.5">
          <Terminal size={12} style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <code className="text-sm font-bold text-[#D96400]">{name}</code>
          <p className="text-xs text-ink-secondary mt-0.5">{desc}</p>
        </div>
      </div>
      <div className="overflow-x-auto mb-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-ink-muted">
              <th className="text-left pb-1 font-medium w-28">参数</th>
              <th className="text-left pb-1 font-medium w-20">类型</th>
              <th className="text-left pb-1 font-medium w-16">必填</th>
              <th className="text-left pb-1 font-medium">说明</th>
            </tr>
          </thead>
          <tbody>
            {params.map(p => (
              <tr key={p.n} className="border-t border-line">
                <td className="py-1.5 pr-3 font-mono text-[#D96400]">{p.n}</td>
                <td className="py-1.5 pr-3 text-blue-600">{p.t}</td>
                <td className="py-1.5 pr-3">{p.req ? <span className="text-red-600">是</span> : <span className="text-ink-muted">否</span>}</td>
                <td className="py-1.5 text-ink-secondary">{p.d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CodeBlock
        code={JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: example } }, null, 2)}
        lang="json (request)"
        id={`mcp-${name}`}
      />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const NAV = [
  { id: 'quickstart', label: '快速开始' },
  { id: 'auth',       label: '认证' },
  { id: 'qa',         label: 'QA 问答' },
  { id: 'documents',  label: '文档管理' },
  { id: 'chunks',     label: '知识切片' },
  { id: 'projects',   label: '项目管理' },
  { id: 'outputs',    label: '产物生成' },
  { id: 'briefs',     label: 'Brief 字段' },
  { id: 'research',   label: '调研录入' },
  { id: 'workspace',  label: '工作台辅助' },
  { id: 'mcp',        label: 'MCP 服务器' },
]

export default function ApiDocs() {
  const [active, setActive] = useState('quickstart')

  useEffect(() => {
    document.title = 'API 文档 — KB System'
    return () => { document.title = '实施知识综合管理' }
  }, [])

  const scrollTo = (id: string) => {
    setActive(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  const mcpConfig = JSON.stringify({
    mcpServers: {
      'kb-system': {
        url: `${BASE}/api/mcp`,
        headers: { Authorization: 'Bearer <your-jwt-token>' },
      },
    },
  }, null, 2)

  const claudeDesktopConfig = JSON.stringify({
    mcpServers: {
      'kb-system': {
        command: 'npx',
        args: ['-y', 'mcp-remote', `${BASE}/api/mcp`],
        env: { MCP_REMOTE_AUTH: 'Bearer <your-jwt-token>' },
      },
    },
  }, null, 2)

  return (
    <div className="flex min-h-screen bg-canvas">

      {/* ── Left nav ─────────────────────────────────────────────────────── */}
      <aside className="w-56 flex-shrink-0 border-r border-line bg-surface flex flex-col sticky top-0 h-screen overflow-y-auto">
        {/* Logo */}
        <div className="h-14 flex items-center gap-2.5 px-5 border-b border-line flex-shrink-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#FF8D1A,#D96400)' }}>
            <Code2 size={13} className="text-white" />
          </div>
          <div>
            <p className="text-xs font-bold text-ink leading-none">API Reference</p>
            <p className="text-[10px] text-ink-muted leading-none mt-0.5">KB System v1.0</p>
          </div>
        </div>

        {/* Back link */}
        <div className="px-2 py-1 border-b border-line">
          <a href="/" className="block text-xs text-ink-secondary hover:text-ink px-3 py-2 transition-colors">← 返回系统</a>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-3 px-2">
          <p className="px-3 py-1 text-[10px] font-semibold text-ink-muted uppercase tracking-widest">文档</p>
          {NAV.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className={`w-full text-left px-3 py-2 rounded text-sm font-medium mb-0.5 transition-colors ${
                active === id
                  ? 'bg-brand-light text-brand-deep'
                  : 'text-ink-secondary hover:bg-canvas hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* AI 可读文档 */}
        <div className="border-t border-line px-4 py-3 flex-shrink-0">
          <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-widest mb-2">给 AI 看</p>
          <a href="/llms.txt" target="_blank" rel="noreferrer"
            className="flex items-center gap-2 text-xs text-ink-secondary hover:text-brand-deep">
            <FileText size={12} /> llms.txt
          </a>
          <a href="/ds.md" target="_blank" rel="noreferrer"
            className="flex items-center gap-2 text-xs text-ink-secondary hover:text-brand-deep mt-1">
            <Code2 size={12} /> ds.md（设计系统）
          </a>
        </div>

        {/* Base URL footer */}
        <div className="px-4 py-3 border-t border-line">
          <p className="text-[10px] text-ink-muted mb-0.5">访问地址</p>
          <code className="text-[10px] font-mono" style={{ color: 'var(--accent)' }}>{BASE}</code>
        </div>
      </aside>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <main className="flex-1 px-12 py-10 max-w-4xl overflow-y-auto">

        {/* Hero */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-light border border-orange-200 text-[#D96400] text-xs mb-4">
            <Zap size={11} /> REST API + MCP 服务器
          </div>
          <h1 className="text-3xl font-bold text-ink mb-2">KB 系统 API 文档</h1>
          <p className="text-ink-secondary text-sm max-w-xl">
            纷享销客 CRM 实施知识库开放接口。支持标准 REST API 和 MCP（Model Context Protocol）协议，
            可与 Claude、Cursor、VS Code Copilot 等 AI 工具直接集成。
          </p>
        </div>

        {/* Quick Start */}
        <Section id="quickstart" title="快速开始" icon={BookOpen}>

          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: 'Base URL',     val: BASE },
              { label: 'Content-Type', val: 'application/json' },
              { label: 'Auth',         val: 'Bearer JWT' },
            ].map(({ label, val }) => (
              <div key={label} className="card p-3">
                <p className="text-xs text-ink-muted mb-1">{label}</p>
                <code className="text-xs font-mono text-[#D96400]">{val}</code>
              </div>
            ))}
          </div>
          <CodeBlock id="qs-1" lang="bash — 登录获取 token" code={
`curl -s -X POST ${BASE}/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"username":"admin","password":"<password>"}' \\
  | jq .access_token`} />
          <CodeBlock id="qs-2" lang="bash — 提问" code={
`TOKEN="<your-jwt-token>"
curl -s -X POST ${BASE}/api/qa/ask \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"question":"回款认领流程是什么？"}' \\
  | jq .answer`} />
          <CodeBlock id="qs-3" lang="python" code={
`import httpx

BASE = "${BASE}"

# 1. 登录
r = httpx.post(f"{BASE}/api/auth/login",
               json={"username": "admin", "password": "<password>"})
token = r.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# 2. 问答
r = httpx.post(f"{BASE}/api/qa/ask",
               headers=headers,
               json={"question": "回款认领流程是什么？"},
               timeout=60)
print(r.json()["answer"])`} />
        </Section>

        {/* Auth */}
        <Section id="auth" title="认证" icon={Key}>
          <p className="text-sm text-ink-secondary mb-4">
            所有写操作（上传、删除、修改）需要在请求头中携带 JWT Token。
            QA 问答接口也需要认证。
          </p>
          <div className="card p-4 mb-4">
            <code className="text-sm text-ink font-mono">Authorization: Bearer {'<token>'}</code>
          </div>
          <Endpoint
            method="POST" path="/api/auth/login"
            desc="用户名密码登录，返回 JWT access token"
            params={[
              { name: 'username', type: 'string', req: true,  desc: '用户名' },
              { name: 'password', type: 'string', req: true,  desc: '密码（最小 6 位）' },
            ]}
            example={`curl -X POST ${BASE}/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"username":"admin","password":"Welcome123"}'`}
            response={`{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5...",
  "token_type": "bearer",
  "user": {
    "id": "...",
    "username": "admin",
    "is_admin": true
  }
}`}
          />
          <Endpoint
            method="GET" path="/api/auth/me"
            desc="获取当前登录用户信息"
          />
        </Section>

        {/* QA */}
        <Section id="qa" title="QA 智能问答" icon={Zap}>
          <Endpoint
            method="POST" path="/api/qa/ask"
            desc="向知识库提问，返回 RAG 答案（非流式）"
            params={[
              { name: 'question',  type: 'string', req: true,  desc: '问题文本' },
              { name: 'ltc_stage', type: 'string', req: false, desc: 'LTC 阶段过滤：线索/商机/报价/合同/回款/售后' },
              { name: 'industry',  type: 'string', req: false, desc: '行业过滤' },
            ]}
            example={`curl -X POST ${BASE}/api/qa/ask \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"question":"回款认领流程","ltc_stage":"回款"}'`}
            response={`{
  "answer": "回款管理应遵循「认领到确认」全链路流程...",
  "model": "qwen3-next-80b-a3b",
  "sources": [
    {"id": "...", "score": 0.65, "ltc_stage": "回款", "content": "..."}
  ]
}`}
          />
          <Endpoint
            method="POST" path="/api/qa/ask-stream"
            desc={'流式问答（SSE），token 逐步返回。事件格式：data: {"token":"..."} 或 data: {"sources":[...]}'}
            params={[
              { name: 'question',  type: 'string', req: true,  desc: '问题文本' },
              { name: 'ltc_stage', type: 'string', req: false, desc: 'LTC 阶段过滤' },
            ]}
            example={`curl -N -X POST ${BASE}/api/qa/ask-stream \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"question":"合同签署标准流程"}'`}
          />
          <Endpoint
            method="POST" path="/api/qa/generate-doc"
            desc="基于模板和知识库内容生成定制化实施文档（Markdown）"
            params={[
              { name: 'template',     type: 'string', req: true,  desc: 'Markdown 文档模板（含占位结构）' },
              { name: 'project_name', type: 'string', req: true,  desc: '客户项目名称' },
              { name: 'industry',     type: 'string', req: true,  desc: '客户行业' },
              { name: 'query',        type: 'string', req: false, desc: '自定义检索关键词（默认用项目名+行业）' },
            ]}
          />
        </Section>

        {/* Documents */}
        <Section id="documents" title="文档管理" icon={Box}>
          <Endpoint
            method="POST" path="/api/documents/upload"
            desc="上传文档（PDF/Word/PPT/Excel/TXT/MD），后台自动转换 → 切片 → 向量化"
            params={[
              { name: 'file',       type: 'file',   req: true,  desc: '文档文件（multipart/form-data）' },
              { name: 'project_id', type: 'string', req: false, desc: '关联项目 ID' },
              { name: 'doc_type',   type: 'string', req: false, desc: '文档类型标签' },
            ]}
            example={`curl -X POST ${BASE}/api/documents/upload \\
  -H "Authorization: Bearer $TOKEN" \\
  -F "file=@实施方案.pdf" \\
  -F "project_id=proj-xxx"`}
            response={`{"id": "doc-xxx", "filename": "实施方案.pdf", "status": "pending"}`}
          />
          <Endpoint
            method="GET" path="/api/documents"
            desc="列出所有文档（支持按项目、文档类型过滤）"
            params={[
              { name: 'project_id', type: 'string', req: false, desc: "项目 ID，传 'none' 查未关联文档" },
              { name: 'doc_type',   type: 'string', req: false, desc: '文档类型过滤' },
            ]}
          />
          <Endpoint
            method="GET" path="/api/documents/{doc_id}/status"
            desc="查询文档处理状态：pending / converting / done / failed"
          />
          <Endpoint
            method="GET" path="/api/documents/{doc_id}/chunks"
            desc="获取文档下的所有知识切片"
          />
          <Endpoint method="DELETE" path="/api/documents/{doc_id}" desc="删除文档及其所有切片和向量（不可恢复）" />
        </Section>

        {/* Chunks */}
        <Section id="chunks" title="知识切片" icon={BookOpen}>
          <Endpoint
            method="GET" path="/api/chunks"
            desc="列出知识切片（支持多维过滤）"
            params={[
              { name: 'ltc_stage',     type: 'string', req: false, desc: 'LTC 阶段过滤' },
              { name: 'industry',      type: 'string', req: false, desc: '行业过滤' },
              { name: 'review_status', type: 'string', req: false, desc: 'pending / approved / rejected' },
              { name: 'limit',         type: 'int',    req: false, desc: '每页条数（默认 50，最大 200）' },
              { name: 'offset',        type: 'int',    req: false, desc: '偏移量' },
            ]}
          />
          <Endpoint method="GET" path="/api/chunks/{chunk_id}" desc="获取单个切片完整内容（含置信度、向量 ID 等）" />
          <Endpoint
            method="PUT" path="/api/chunks/{chunk_id}"
            desc="更新切片内容或标签（修改 content 会自动重新向量化）"
            params={[
              { name: 'content',   type: 'string',   req: false, desc: '切片文本（修改后自动重新 embed）' },
              { name: 'ltc_stage', type: 'string',   req: false, desc: '重新标注 LTC 阶段' },
              { name: 'tags',      type: 'string[]', req: false, desc: '标签列表' },
            ]}
          />
        </Section>

        {/* Projects */}
        <Section id="projects" title="项目管理" icon={Box}>
          <Endpoint
            method="GET" path="/api/projects"
            desc="获取所有项目列表（含文档数统计）"
          />
          <Endpoint
            method="POST" path="/api/projects"
            desc="创建新项目"
            params={[
              { name: 'name',         type: 'string',   req: true,  desc: '项目名称' },
              { name: 'customer',     type: 'string',   req: false, desc: '客户名称' },
              { name: 'modules',      type: 'string[]', req: false, desc: '启用的 CRM 模块列表' },
              { name: 'kickoff_date', type: 'date',     req: false, desc: '启动日期 YYYY-MM-DD' },
              { name: 'description',  type: 'string',   req: false, desc: '项目描述' },
            ]}
          />
          <Endpoint method="GET"    path="/api/projects/{project_id}"           desc="获取项目详情" />
          <Endpoint method="PATCH"  path="/api/projects/{project_id}"           desc="更新项目信息" />
          <Endpoint method="DELETE" path="/api/projects/{project_id}"           desc="删除项目（?cascade=true 同时解绑关联文档）" />
          <Endpoint method="GET"    path="/api/projects/{project_id}/documents" desc="获取项目下的所有文档" />
          <Endpoint method="POST"   path="/api/projects/{project_id}/insight-checkup" desc="项目体检 — 评估 brief 完成度 / 文档充分度,返回是否可触发 insight 生成" />
        </Section>

        {/* Outputs Generation */}
        <Section id="outputs" title="产物生成" icon={Zap}>
          <p className="text-sm text-ink-secondary mb-4">
            5 种产物类型(<code className="text-[#D96400]">kind</code>):
            <code className="mx-1 text-[#D96400]">kickoff_pptx</code> /
            <code className="mx-1 text-[#D96400]">kickoff_html</code> /
            <code className="mx-1 text-[#D96400]">insight</code> /
            <code className="mx-1 text-[#D96400]">survey</code> /
            <code className="mx-1 text-[#D96400]">survey_outline</code>。
            <strong>kickoff_*</strong> 走对话式生成(/api/output-chats);其他三种走 agentic 规则化生成,直接 POST /api/outputs/generate 即可。
          </p>
          <Endpoint
            method="POST" path="/api/outputs/generate"
            desc="触发指定 kind 的产物生成(异步,返回 bundle_id),前端 poll /api/outputs/{id}"
            params={[
              { name: 'kind',       type: 'OutputKind', req: true, desc: '产物类型(见上方 5 种)' },
              { name: 'project_id', type: 'uuid',      req: true, desc: '关联的项目 ID' },
            ]}
          />
          <Endpoint method="GET"  path="/api/outputs"             desc="列出 bundles(支持 ?project_id / ?kind 过滤 + 分页)" />
          <Endpoint method="GET"  path="/api/outputs/{bundle_id}" desc="单个 bundle 详情(含 status / progress / challenge_summary / validity_status 等 agentic 字段)" />
          <Endpoint method="GET"  path="/api/outputs/{bundle_id}/download" desc="下载 .docx / .pptx 文件(MinIO 直链)" />
          <Endpoint method="GET"  path="/api/outputs/{bundle_id}/view"     desc="浏览器预览 .html 报告" />
          <Endpoint method="POST" path="/api/output-chats"                 desc="创建对话式生成会话(仅限 kickoff_pptx / kickoff_html)" />
          <Endpoint method="POST" path="/api/output-chats/{conv_id}/message" desc="对话续轮" />
          <Endpoint method="POST" path="/api/output-chats/{conv_id}/generate" desc="对话结束 → 触发 bundle 生成" />
        </Section>

        {/* Briefs */}
        <Section id="briefs" title="Brief 字段抽取" icon={FileText}>
          <p className="text-sm text-ink-secondary mb-4">
            BriefDrawer 用,先 LLM 自动抽取草稿、再用户编辑。Schema 按 kind 分:见 <code className="text-[#D96400]">backend/services/brief_service.BRIEF_SCHEMAS</code>。
            kickoff_html 与 kickoff_pptx 共用同一份 schema(<code>_canonical_kind</code> 自动归一)。
          </p>
          <Endpoint method="GET"  path="/api/briefs/{kind}?project_id=..."         desc="读 brief 当前值(不存在返回空骨架)" />
          <Endpoint method="PUT"  path="/api/briefs/{kind}?project_id=..."         desc="保存用户编辑的 brief 字段" />
          <Endpoint method="POST" path="/api/briefs/{kind}/extract?project_id=..." desc="LLM 一次性抽取 brief 草稿(非流式)" />
          <Endpoint method="POST" path="/api/briefs/{kind}/extract/stream?project_id=..." desc="SSE 流式抽取 brief(逐字段返回)" />
        </Section>

        {/* Research */}
        <Section id="research" title="调研录入(Survey 答案 / LTC 字典)" icon={BookOpen}>
          <p className="text-sm text-ink-secondary mb-4">
            survey 阶段顾问勾选式录入用。答案存 <code className="text-[#D96400]">research_responses</code> 表(按 bundle_id + item_key 唯一)。
          </p>
          <Endpoint method="POST" path="/api/research/responses"                 desc="upsert 顾问答案(单条)" />
          <Endpoint method="GET"  path="/api/research/responses?bundle_id=..."   desc="拉取 bundle 下所有答案" />
          <Endpoint method="POST" path="/api/research/classify-scope"            desc="触发 LLM 范围四分类(范围内/外/待定/不适用)" />
          <Endpoint method="GET"  path="/api/research/ltc-module-map?bundle_id=..." desc="拉取 SOW → LTC 字典模块映射结果" />
          <Endpoint method="GET"  path="/api/research/ltc-dictionary"            desc="返回 LTC 字典全量(8 主流程 + 5 横向支撑域)" />
        </Section>

        {/* Workspace Auxiliary */}
        <Section id="workspace" title="工作台辅助 API" icon={Box}>
          <p className="text-sm text-ink-secondary mb-4">
            前端 ConsoleProjectDetail 三栏工作区用的零散端点。
          </p>

          <h3 className="text-sm font-semibold text-ink mt-2 mb-2">阶段流程动态配置 / Stage Flow</h3>
          <Endpoint method="GET"  path="/api/settings/stage-flow"       desc="读取项目阶段配置(默认或运营自定义)" />
          <Endpoint method="PUT"  path="/api/settings/stage-flow"       desc="管理员保存自定义 stage flow(全量替换)" />
          <Endpoint method="POST" path="/api/settings/stage-flow/reset" desc="管理员重置为内置默认" />
          <Endpoint method="GET"  path="/api/settings/stage-flow/meta"  desc="返回元信息:可选 icon / kind 列表(下拉编辑器用)" />

          <h3 className="text-sm font-semibold text-ink mt-6 mb-2">虚拟物 / Virtual Artifacts</h3>
          <Endpoint method="GET"  path="/api/virtual/{vkey}?project_id=..."        desc="读单个虚拟物(干系人图谱 / 成功度量表 / 引导问卷)。vkey ∈ v_stakeholder_graph/v_success_metrics/v_guided_questionnaire" />
          <Endpoint method="POST" path="/api/virtual/{vkey}/submit?project_id=..." desc="提交虚拟物答案(同时合并写回 brief 字段)" />

          <h3 className="text-sm font-semibold text-ink mt-6 mb-2">文档清单 / Doc Checklist</h3>
          <Endpoint method="GET" path="/api/doc-checklist/{project_id}?stage=insight"
                    desc="按 stage(默认 insight)读必传 / 推荐文档清单 + 已上传状态 + 缺失项原因" />

          <h3 className="text-sm font-semibold text-ink mt-6 mb-2">Web 检索建议 / Web Suggest</h3>
          <Endpoint method="POST" path="/api/web-suggest" desc="GapFiller 用:让 LLM 联网建议补访候选问题" />

          <h3 className="text-sm font-semibold text-ink mt-6 mb-2">Agent / Skill 配置(管理员)</h3>
          <Endpoint method="GET"  path="/api/settings/models"            desc="LLM 模型清单(供路由 / 任务参数下拉)" />
          <Endpoint method="GET"  path="/api/settings/routing"           desc="任务级模型路由表(每种任务用哪个 model)" />
          <Endpoint method="PUT"  path="/api/settings/routing/{task}"    desc="更新单条路由" />
          <Endpoint method="GET"  path="/api/settings/task-params"       desc="任务级 LLM 参数(temperature / max_tokens 等)" />
          <Endpoint method="GET"  path="/api/settings/prompts"           desc="可编辑 prompt 模板列表(QA / PM / output_agent 等)" />
          <Endpoint method="PUT"  path="/api/settings/prompts/{key}"     desc="更新单条 prompt 模板" />
          <Endpoint method="GET"  path="/api/settings/skills"            desc="原子 skill 库(read-only,skill 内容定义在 skills_seed.py)" />
          <Endpoint method="GET"  path="/api/settings/output-agents"     desc="按 kind 读 output_agent 配置(prompt / skill_ids / model)" />
          <Endpoint method="PUT"  path="/api/settings/output-agents/{kind}" desc="更新 kind 的 agent 配置" />

          <h3 className="text-sm font-semibold text-ink mt-6 mb-2">挑战(Challenge · KB 知识切片对抗式审核)</h3>
          <Endpoint method="POST" path="/api/challenge/run-stream"            desc="触发挑战 run(SSE 流式返回每轮 verdict)" />
          <Endpoint method="GET"  path="/api/challenge/runs"                  desc="列出最近挑战 run" />
          <Endpoint method="GET"  path="/api/challenge/runs/{run_id}"         desc="查询单次 run 详情(每轮回合 + verdict)" />
          <Endpoint method="GET"  path="/api/challenge/schedules"             desc="挑战定时任务列表" />
          <Endpoint method="POST" path="/api/challenge/schedules"             desc="创建定时任务" />
          <Endpoint method="GET"  path="/api/challenge/gaps"                  desc="列出从挑战中浮现的 KB 缺口(用作补文档输入)" />
        </Section>

        {/* MCP */}
        <Section id="mcp" title="MCP 服务器" icon={Terminal}>
          <div className="bg-brand-light border border-orange-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-[#D96400] font-medium mb-1">Model Context Protocol</p>
            <p className="text-xs text-ink-secondary leading-relaxed">
              KB System 实现了 MCP Streamable HTTP 传输协议（2024-11-05 规范）。
              配置后，Claude、Cursor 等 AI 工具可以直接调用知识库的 RAG 问答和语义检索能力。
            </p>
          </div>

          {/* Endpoint */}
          <div className="border border-line rounded-lg p-4 bg-surface mb-6">
            <div className="flex items-center gap-3 mb-2">
              <Method m="POST" />
              <code className="text-sm text-ink font-mono">/api/mcp</code>
            </div>
            <p className="text-xs text-ink-secondary">
              JSON-RPC 2.0。支持方法：
              <code className="text-[#D96400] mx-1">initialize</code>、
              <code className="text-[#D96400] mx-1">tools/list</code>、
              <code className="text-[#D96400] mx-1">tools/call</code>、
              <code className="text-[#D96400] mx-1">ping</code>
            </p>
          </div>

          {/* Tools */}
          <h3 className="text-sm font-semibold text-ink mb-3">可用工具</h3>
          <McpTool
            name="ask_kb"
            desc="向知识库提问，返回 RAG 答案 + 来源引用（推荐）"
            params={[
              { n: 'question',  t: 'string', req: true,  d: '要询问的问题' },
              { n: 'ltc_stage', t: 'string', req: false, d: 'LTC 阶段过滤（线索/商机/报价/合同/回款/售后）' },
            ]}
            example={{ question: '回款认领的最佳实践是什么？', ltc_stage: '回款' }}
          />
          <McpTool
            name="search_kb"
            desc="语义检索，返回原始知识切片列表"
            params={[
              { n: 'query',     t: 'string',  req: true,  d: '检索查询语句' },
              { n: 'top_k',     t: 'integer', req: false, d: '返回数量，默认 5，最大 20' },
              { n: 'ltc_stage', t: 'string',  req: false, d: 'LTC 阶段过滤' },
            ]}
            example={{ query: '合同签署注意事项', top_k: 5 }}
          />

          {/* Claude Desktop */}
          <h3 className="text-sm font-semibold text-ink mt-8 mb-3">Claude Desktop 配置</h3>
          <p className="text-xs text-ink-secondary mb-2">
            编辑 <code className="text-ink font-mono">claude_desktop_config.json</code>
            （macOS: <code className="text-ink font-mono">~/Library/Application Support/Claude/</code>）：
          </p>
          <CodeBlock id="claude-cfg" lang="json" code={claudeDesktopConfig} />

          {/* Generic HTTP */}
          <h3 className="text-sm font-semibold text-ink mt-8 mb-3">通用 MCP HTTP 客户端</h3>
          <CodeBlock id="mcp-raw" lang="bash — tools/list" code={
`curl -X POST ${BASE}/api/mcp \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`} />
          <CodeBlock id="mcp-ask" lang="bash — ask_kb" code={
`curl -X POST ${BASE}/api/mcp \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "ask_kb",
      "arguments": {"question": "回款认领流程是什么？"}
    }
  }'`} />

          {/* Python */}
          <h3 className="text-sm font-semibold text-ink mt-8 mb-3">Python 调用示例</h3>
          <CodeBlock id="py-mcp" lang="python" code={
`import httpx

BASE  = "${BASE}"
TOKEN = "<your-jwt-token>"

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
}

# 初始化握手
r = httpx.post(f"{BASE}/api/mcp", headers=headers, json={
    "jsonrpc": "2.0", "id": 1, "method": "initialize",
    "params": {"protocolVersion": "2024-11-05",
               "capabilities": {},
               "clientInfo": {"name": "my-app", "version": "1.0"}},
})
print(r.json()["result"]["serverInfo"])

# 提问
r = httpx.post(f"{BASE}/api/mcp", headers=headers, json={
    "jsonrpc": "2.0", "id": 2,
    "method": "tools/call",
    "params": {
        "name": "ask_kb",
        "arguments": {"question": "回款认领流程是什么？"},
    },
}, timeout=60)
print(r.json()["result"]["content"][0]["text"])`} />

          {/* JSON-RPC response format */}
          <h3 className="text-sm font-semibold text-ink mt-8 mb-3">响应格式</h3>
          <CodeBlock id="mcp-resp" lang="json (成功)" code={
`{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      { "type": "text", "text": "回款管理应遵循..." }
    ]
  }
}`} />
          <CodeBlock id="mcp-err" lang="json (错误)" code={
`{
  "jsonrpc": "2.0",
  "id": 2,
  "error": {
    "code": -32602,
    "message": "缺少必要参数: question"
  }
}`} />
        </Section>

      </main>
    </div>
  )
}
