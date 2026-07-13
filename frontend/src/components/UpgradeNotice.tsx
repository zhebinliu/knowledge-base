import { Link } from 'react-router-dom'
import { Construction, Mic } from 'lucide-react'

/**
 * UpgradeNotice — 「正在升级改造中」占位页
 *
 * 2026-07-13:kb-system 主站对外只保留会议纪要,工作台其余功能下线。
 * 被下线的工作台路由(首页/知识问答/项目管理/项目详情/看板/画布)统一渲染此页;
 * 直接敲 URL 进来也会看到它,而不是原功能。会议纪要不受影响。
 *
 * 深浅两套 UI 自适应:prod(kb.*)是浅色 legacy 工作台,uat/?ui=new 是深色 Liquid Glass。
 */
const IS_NEW_UI = typeof window !== 'undefined' && (
  window.location.hostname === 'uat.tokenwave.cloud' ||
  new URLSearchParams(window.location.search).get('ui') === 'new'
)

export default function UpgradeNotice({ title }: { title?: string }) {
  const dark = IS_NEW_UI
  const c = dark
    ? {
        card: 'rgba(255,255,255,0.06)',
        border: 'rgba(255,255,255,0.14)',
        iconBg: 'rgba(255,141,26,0.16)',
        iconFg: '#FFB259',
        heading: '#F2F5F9',
        body: 'rgba(226,232,240,0.72)',
        btnBg: 'linear-gradient(135deg,#FF8D1A,#D96400)',
        btnFg: '#fff',
      }
    : {
        card: '#ffffff',
        border: '#E7E1D8',
        iconBg: '#FFF1E4',
        iconFg: '#D96400',
        heading: '#1F2937',
        body: '#6B7280',
        btnBg: 'linear-gradient(135deg,#FF8D1A,#D96400)',
        btnFg: '#fff',
      }

  return (
    <div
      style={{
        flex: 1,
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 20px',
      }}
    >
      <div
        style={{
          maxWidth: 460,
          width: '100%',
          textAlign: 'center',
          background: c.card,
          border: `1px solid ${c.border}`,
          borderRadius: 20,
          padding: '44px 32px',
          boxShadow: dark
            ? '0 24px 60px -20px rgba(0,0,0,0.55)'
            : '0 12px 40px -16px rgba(31,41,55,0.18)',
          backdropFilter: dark ? 'blur(18px) saturate(160%)' : undefined,
          WebkitBackdropFilter: dark ? 'blur(18px) saturate(160%)' : undefined,
        }}
      >
        <div
          style={{
            width: 60,
            height: 60,
            margin: '0 auto 22px',
            borderRadius: 16,
            background: c.iconBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Construction size={28} color={c.iconFg} strokeWidth={1.9} />
        </div>

        <h1 style={{ fontSize: 20, fontWeight: 700, color: c.heading, margin: '0 0 10px', letterSpacing: '-0.01em' }}>
          {title ?? '正在升级改造中'}
        </h1>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: c.body, margin: '0 0 26px' }}>
          该功能正在升级改造,暂时无法使用。
          <br />
          会议纪要功能不受影响,可继续使用。
        </p>

        <Link
          to="/console/meeting"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '11px 22px',
            borderRadius: 12,
            background: c.btnBg,
            color: c.btnFg,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: 'none',
            boxShadow: '0 6px 18px -6px rgba(217,100,0,0.5)',
          }}
        >
          <Mic size={16} /> 前往会议纪要
        </Link>
      </div>
    </div>
  )
}
