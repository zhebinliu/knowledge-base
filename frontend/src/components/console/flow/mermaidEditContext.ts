/**
 * MermaidEditContext — 让深埋在 ReportMarkdown 里的 MermaidBlock 能拿到「可视化编辑」能力,
 * 而真正的保存逻辑(替换 markdown 里的图块 + PUT /content)留在外层工作区。
 *
 * 提供方(BlueprintDesignWorkspace)通过 Provider 注入 requestEdit;
 * 消费方(MermaidBlock)在能编辑、且图是 stateDiagram-v2 时显示按钮。
 * 没有 Provider(其他用到 ReportMarkdown 的地方)时 useMermaidEdit() 返回 null,按钮不出现。
 */
import { createContext, useContext } from 'react'

export interface MermaidEditApi {
  /** 请求可视化编辑某个 mermaid 块(传渲染用的源码,外层据此定位并替换原 fence)。 */
  requestEdit: (code: string) => void
}

export const MermaidEditContext = createContext<MermaidEditApi | null>(null)
export const useMermaidEdit = () => useContext(MermaidEditContext)
