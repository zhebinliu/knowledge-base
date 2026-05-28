/**
 * PersonalSettings — 个人设置
 * 
 * 与系统设置(/settings,仅管理员可见)不同,个人设置面向所有用户。
 * 目前包含:飞书凭证配置（App ID + App Secret）
 */
import { User, Link2 } from 'lucide-react'
import FeishuTab from '../components/settings/FeishuTab'

export default function PersonalSettings() {
  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <User size={22} className="text-gray-400" />
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">个人设置</h1>
      </div>
      <p className="text-xs md:text-sm text-gray-500 mb-6 md:mb-8">
        管理你的个人凭证与偏好（飞书集成等）
      </p>

      <FeishuTab />
    </div>
  )
}
