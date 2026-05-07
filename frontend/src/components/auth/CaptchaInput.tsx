/**
 * 图形验证码输入控件 — Login / Register 共用。
 *
 * 行为:
 * - 挂载即拉一次 captcha
 * - 「换一张」按钮 / 表单提交失败时父组件 ref 触发 refresh
 * - 把 captcha_id + captcha_answer 通过 onChange 同步给父组件
 */
import { useState, useEffect, useImperativeHandle, forwardRef } from 'react'
import { RefreshCw, Loader2 } from 'lucide-react'
import { getCaptcha, type CaptchaChallenge } from '../../api/client'

export interface CaptchaInputRef {
  refresh: () => void
  reset: () => void
}

interface Props {
  onChange: (data: { captcha_id: string; captcha_answer: string }) => void
}

const CaptchaInput = forwardRef<CaptchaInputRef, Props>(({ onChange }, ref) => {
  const [challenge, setChallenge] = useState<CaptchaChallenge | null>(null)
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    setAnswer('')
    try {
      const c = await getCaptcha()
      setChallenge(c)
      onChange({ captcha_id: c.captcha_id, captcha_answer: '' })
    } catch (e: any) {
      setError(e?.response?.data?.detail || '验证码加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useImperativeHandle(ref, () => ({
    refresh: () => void load(),
    reset: () => setAnswer(''),
  }), [])

  const handleAnswerChange = (v: string) => {
    setAnswer(v)
    if (challenge) {
      onChange({ captcha_id: challenge.captcha_id, captcha_answer: v })
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1.5">验证码</label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={answer}
          onChange={(e) => handleAnswerChange(e.target.value)}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm transition-all"
          style={{ background: 'var(--bg)' }}
          placeholder="请输入图中字符"
          autoComplete="off"
          spellCheck={false}
        />
        <div
          className="shrink-0 relative w-[120px] h-[40px] border border-gray-200 rounded-lg overflow-hidden bg-white cursor-pointer flex items-center justify-center"
          onClick={() => !loading && void load()}
          title="点击刷新"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin text-gray-400" />
          ) : challenge ? (
            <img
              src={challenge.image_b64}
              alt="captcha"
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <span className="text-[10px] text-red-500">加载失败</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => !loading && void load()}
          disabled={loading}
          className="shrink-0 p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
          title="换一张"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      {error && (
        <p className="mt-1 text-[11px] text-red-600">{error}</p>
      )}
    </div>
  )
})

CaptchaInput.displayName = 'CaptchaInput'

export default CaptchaInput
