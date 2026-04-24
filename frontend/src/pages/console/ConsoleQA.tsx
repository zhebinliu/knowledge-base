import QA from '../QA'

/**
 * Console 工作台的知识问答入口。
 * 当前直接复用管理端 QA 组件；后续 C3 会去掉管理员元素并简化为纯对话视图。
 */
export default function ConsoleQA() {
  return (
    <div className="-mx-4 sm:-mx-6 -my-6">
      <QA />
    </div>
  )
}
