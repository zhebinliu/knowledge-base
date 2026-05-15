/**
 * IndustryCascadePicker — 四级行业级联选择器
 *
 * value 形如 "L1/L2/L3/L4" 斜杠拼接路径(项目 industry 字段存这个格式)
 *   - 空字符串 / null 表示未选
 *   - 旧值(只有一级字符串,如 "manufacturing")会被识别为旧格式,
 *     但跟新树对不上,这种情况显示成"旧值:<原文>",用户点击会重选
 *
 * 选择规则:
 *   L1 必选 → L2 必选 → L3 必选 → L4 必选,任何一级中断 onChange('')
 *   选齐 4 级才调 onChange('L1/L2/L3/L4')
 *
 * 视觉:4 个紧凑的 <select>,水平排列,小屏自动换行
 */
import { useMemo, useState, useEffect } from 'react'
import type { IndustryTree } from '../api/client'

interface Props {
  tree: IndustryTree | undefined
  value: string
  onChange: (v: string) => void
  /** 旧的一级 industry 枚举(只在 tree 加载前 / 用户编辑旧值时回退展示) */
  legacyIndustries?: { value: string; label: string }[]
}

export default function IndustryCascadePicker({ tree, value, onChange, legacyIndustries }: Props) {
  // 从 value 拆 4 段,缺位用 ''
  const parts = (value || '').split('/').map(s => s.trim())
  const [l1, l2, l3, l4] = [parts[0] || '', parts[1] || '', parts[2] || '', parts[3] || '']

  const [pendingL1, setPendingL1] = useState(l1)
  const [pendingL2, setPendingL2] = useState(l2)
  const [pendingL3, setPendingL3] = useState(l3)
  const [pendingL4, setPendingL4] = useState(l4)

  // 外部 value 变化时同步进内部(编辑现有项目)
  useEffect(() => {
    setPendingL1(l1); setPendingL2(l2); setPendingL3(l3); setPendingL4(l4)
  }, [value])

  // 当前层级的可选项
  const l1Options = useMemo(() => tree ? Object.keys(tree) : [], [tree])
  const l2Options = useMemo(() => (tree && pendingL1 in (tree || {})) ? Object.keys(tree[pendingL1]) : [], [tree, pendingL1])
  const l3Options = useMemo(() => (tree && pendingL1 && pendingL2 && tree[pendingL1]?.[pendingL2]) ? Object.keys(tree[pendingL1][pendingL2]) : [], [tree, pendingL1, pendingL2])
  const l4Options = useMemo(() => (tree && pendingL1 && pendingL2 && pendingL3 && tree[pendingL1]?.[pendingL2]?.[pendingL3]) ? tree[pendingL1][pendingL2][pendingL3] : [], [tree, pendingL1, pendingL2, pendingL3])

  // 检测旧值:value 存在但不在树里 → 显示一个"旧值"提示
  const isLegacyValue = value && tree && (!parts[0] || !(parts[0] in tree))
  const legacyLabel = isLegacyValue
    ? (legacyIndustries?.find(i => i.value === value)?.label ?? value)
    : null

  const propagate = (a: string, b: string, c: string, d: string) => {
    if (a && b && c && d) onChange(`${a}/${b}/${c}/${d}`)
    else if (!a && !b && !c && !d) onChange('')
    else onChange('') // 部分选了不算
  }

  const onChangeL1 = (v: string) => {
    setPendingL1(v); setPendingL2(''); setPendingL3(''); setPendingL4('')
    propagate(v, '', '', '')
  }
  const onChangeL2 = (v: string) => {
    setPendingL2(v); setPendingL3(''); setPendingL4('')
    propagate(pendingL1, v, '', '')
  }
  const onChangeL3 = (v: string) => {
    setPendingL3(v); setPendingL4('')
    propagate(pendingL1, pendingL2, v, '')
  }
  const onChangeL4 = (v: string) => {
    setPendingL4(v)
    propagate(pendingL1, pendingL2, pendingL3, v)
  }

  if (!tree) {
    return <div className="text-xs text-gray-400">行业树加载中…</div>
  }

  const selectCls = 'flex-1 min-w-[120px] border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50 disabled:text-gray-400'

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <select value={pendingL1} onChange={e => onChangeL1(e.target.value)} className={selectCls}>
          <option value="">一级 — 选择</option>
          {l1Options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={pendingL2} onChange={e => onChangeL2(e.target.value)} disabled={!pendingL1} className={selectCls}>
          <option value="">{pendingL1 ? '二级 — 选择' : '先选一级'}</option>
          {l2Options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={pendingL3} onChange={e => onChangeL3(e.target.value)} disabled={!pendingL2} className={selectCls}>
          <option value="">{pendingL2 ? '三级 — 选择' : '先选二级'}</option>
          {l3Options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={pendingL4} onChange={e => onChangeL4(e.target.value)} disabled={!pendingL3} className={selectCls}>
          <option value="">{pendingL3 ? '四级 — 选择' : '先选三级'}</option>
          {l4Options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      {isLegacyValue && legacyLabel && (
        <div className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          ⚠ 旧版行业值:<strong>{legacyLabel}</strong> — 重新选择四级会覆盖
        </div>
      )}

      {pendingL1 && pendingL2 && pendingL3 && pendingL4 && (
        <div className="text-[11px] text-gray-500">
          已选:<strong className="text-gray-700">{pendingL1} / {pendingL2} / {pendingL3} / {pendingL4}</strong>
        </div>
      )}
    </div>
  )
}
