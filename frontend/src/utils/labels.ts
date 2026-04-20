// Shared display labels for backend enum values

export const LTC_LABEL: Record<string, string> = {
  lead:         '线索',
  opportunity:  '商机',
  quote:        '报价',
  contract:     '合同',
  customer:     '客户',
  order:        '订单',
  delivery:     '交付',
  payment:      '回款',
  general:      '通用',
}

export const LTC_KEYS = Object.keys(LTC_LABEL)

export const INDUSTRY_LABEL: Record<string, string> = {
  manufacturing: '制造业',
  retail:        '零售业',
  finance:       '金融业',
  healthcare:    '医疗健康',
  education:     '教育',
  real_estate:   '房地产',
  technology:    '高科技/互联网',
  logistics:     '物流速运',
  energy:        '能源',
  government:    '政府',
  other:         '其他',
}

export const TAG_LABEL: Record<string, string> = {
  best_practice:   '最佳实践',
  checklist:       '检查清单',
  troubleshooting: '问题排查',
  methodology:     '方法论',
  case_study:      '案例分析',
  sop:             '标准流程',
  template:        '模板',
  faq:             '常见问题',
  policy:          '规范制度',
  config:          '配置说明',
  integration:     '系统集成',
  risk:            '风险注意',
}

/** Falls back to the raw value if no mapping found */
export const ltcLabel     = (v?: string | null) => (v && LTC_LABEL[v])      || v || ''
export const industryLabel = (v?: string | null) => (v && INDUSTRY_LABEL[v]) || v || ''
export const tagLabel      = (v?: string | null) => (v && TAG_LABEL[v])      || v || ''
