/**
 * DemoPPT — 共享主题 token
 *
 * 设计基调:深色玻璃 + 橙色品牌发光
 * 投屏环境优先, 字号大、对比强、留白多。
 */

export const PPT = {
  // 背景层
  bg:        '#0A0F1E',                // 主背景(deep navy)
  bgPanel:   'rgba(255,255,255,0.04)', // 玻璃卡面
  bgPanel2:  'rgba(255,255,255,0.06)', // 玻璃卡面(强一档)
  border:    'rgba(255,255,255,0.10)',
  borderHi:  'rgba(255,141,26,0.35)',  // 橙色高亮边

  // 文字层级(白色透明度)
  fg:        '#FFFFFF',
  fgMuted:   'rgba(255,255,255,0.62)',
  fgDim:     'rgba(255,255,255,0.38)',
  fgFaint:   'rgba(255,255,255,0.22)',

  // 品牌橙色
  brand:     '#FF8D1A',
  brandDeep: '#D96400',
  brandMid:  '#FFB066',
  brandSoft: 'rgba(255,141,26,0.18)',

  // 渐变
  brandGrad:    'linear-gradient(135deg,#FFB066 0%,#FF8D1A 50%,#D96400 100%)',
  brandGradTxt: 'linear-gradient(135deg,#FFD9A8 0%,#FF9F3A 60%,#FF7A00 100%)',

  // 语义色(深色背景下的版本)
  blue:    '#60A5FA',
  green:   '#34D399',
  rose:    '#FB7185',
  purple:  '#C084FC',
  amber:   '#FBBF24',

  // 发光阴影
  glowBrand:    '0 0 80px -20px rgba(255,141,26,0.55), 0 0 30px -10px rgba(255,141,26,0.35)',
  glowSoft:     '0 0 60px -20px rgba(255,255,255,0.18)',
  glowBlue:     '0 0 60px -20px rgba(96,165,250,0.45)',
  glowGreen:    '0 0 60px -20px rgba(52,211,153,0.45)',
  glowRose:     '0 0 60px -20px rgba(251,113,133,0.45)',
} as const

// 字号(投屏自适应):用 cqi(container query inline) 让字号随 16:9 容器宽度缩放
// 1cqi = 1% of container width
export const fz = {
  hero:    'clamp(48px, 8cqi, 120px)',
  h1:      'clamp(36px, 5.6cqi, 84px)',
  h2:      'clamp(28px, 4cqi, 60px)',
  h3:      'clamp(22px, 2.6cqi, 40px)',
  body:    'clamp(16px, 1.4cqi, 22px)',
  small:   'clamp(12px, 1.0cqi, 16px)',
  tiny:    'clamp(10px, 0.8cqi, 13px)',
  // 数字专用(超大)
  numXL:   'clamp(80px, 14cqi, 220px)',
  numL:    'clamp(60px, 10cqi, 160px)',
  numM:    'clamp(40px, 6cqi, 90px)',
} as const
