/**
 * replaceMermaidBlock — 在 markdown 全文里,把某个 ```mermaid 围栏的内容替换成新图。
 *
 * 用「渲染时的源码」(MermaidBlock 清洗后的 code)做定位:对每个 fence 的内部做同样的
 * 归一化(去首尾空白 / 去 'mermaid' 语言行 / 去 fence 行)后比对,命中第一个就替换。
 * 找不到返回 null,调用方据此报错而不是静默写坏全文。
 */
function normalize(s: string): string {
  return (s || '')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && l !== 'mermaid' && !/^```/.test(l))
    .join('\n')
}

export function replaceMermaidBlock(md: string, originalCode: string, newCode: string): string | null {
  const target = normalize(originalCode)
  if (!target) return null
  const re = /```mermaid\s*\n([\s\S]*?)```/g
  let m: RegExpExecArray | null
  while ((m = re.exec(md))) {
    if (normalize(m[1]) === target) {
      const block = '```mermaid\n' + newCode.trim() + '\n```'
      return md.slice(0, m.index) + block + md.slice(re.lastIndex)
    }
  }
  return null
}
