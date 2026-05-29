/**
 * NewPersonalSettings — 个人设置(Liquid Glass 外壳,内嵌老 FeishuTab)
 * 
 * 功能 100% 等价于老 PersonalSettings。
 * 面向所有用户,非管理员即可访问。
 */
import { User } from 'lucide-react'
import FeishuTab from '../components/settings/FeishuTab'
import ShareDevTab from '../components/settings/ShareDevTab'
import QixinTab from '../components/settings/QixinTab'
import GlowCard from './components/GlowCard'

export default function NewPersonalSettings() {
  return (
    <div className="rd-page" style={{ maxWidth: 1100 }}>
      <div className="rd-stagger" style={{ marginBottom: 22 }}>
        <span className="rd-chip is-active" style={{ marginBottom: 10 }}>
          <User size={11} /> 个人设置
        </span>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--rd-text)', letterSpacing: '-0.02em', margin: 0 }}>
          个人设置
        </h1>
        <p style={{ fontSize: 13, color: 'var(--rd-text-2)', margin: '4px 0 0' }}>
          管理你的个人凭证与偏好 — 飞书集成 / ShareDev PaaS 集成 / 企信 Bot
        </p>
      </div>

      <GlowCard style={{ padding: '20px 24px', overflow: 'hidden', marginBottom: 16 }}>
        <FeishuTab />
      </GlowCard>

      <GlowCard style={{ padding: '20px 24px', overflow: 'hidden', marginBottom: 16 }}>
        <ShareDevTab />
      </GlowCard>

      <GlowCard style={{ padding: '20px 24px', overflow: 'hidden' }}>
        <QixinTab />
      </GlowCard>
    </div>
  )
}
