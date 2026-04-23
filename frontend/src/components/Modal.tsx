import { ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'

export interface ModalProps {
  open: boolean
  title?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
  closeOnBackdrop?: boolean
}

const WIDTH_MAP: Record<NonNullable<ModalProps['width']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
}

/**
 * 统一 Modal 组件。用法：
 *   <Modal open={open} title="编辑" onClose={close} footer={<button>保存</button>}>
 *     <form>...</form>
 *   </Modal>
 */
export default function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = 'lg',
  closeOnBackdrop = true,
}: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`bg-white rounded-xl shadow-xl w-full ${WIDTH_MAP[width]} max-h-[90vh] overflow-hidden flex flex-col`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/** 右抽屉变体 */
export function Drawer({
  open,
  title,
  onClose,
  children,
  footer,
  width = '2xl',
}: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const widthPx: Record<NonNullable<ModalProps['width']>, string> = {
    sm: 'w-[380px]',
    md: 'w-[480px]',
    lg: 'w-[560px]',
    xl: 'w-[640px]',
    '2xl': 'w-[720px]',
    '3xl': 'w-[900px]',
  }
  return (
    <div className="fixed inset-0 z-50" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className={`absolute right-0 top-0 h-full ${widthPx[width]} max-w-full bg-white shadow-xl flex flex-col`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/** 确认对话框 */
export function ConfirmModal({
  open,
  title = '确认',
  message,
  confirmText = '确认',
  cancelText = '取消',
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean
  title?: string
  message: ReactNode
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      width="md"
      footer={
        <>
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm()
              onClose()
            }}
            className={`px-3 py-1.5 text-sm text-white rounded-lg ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {confirmText}
          </button>
        </>
      }
    >
      <div className="text-sm text-gray-700">{message}</div>
    </Modal>
  )
}
