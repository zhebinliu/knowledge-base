import QA from '../QA'

/**
 * Console 工作台的知识问答入口。
 * ConsoleLayout 的 header 固定 56px（h-14），移动端多一行导航时给个兜底 min-h。
 * 内层用 h-[calc(100vh-56px)] 锁死，让 QA 内部 h-full 得以展开。
 */
export default function ConsoleQA() {
  return (
    <div className="-mx-4 sm:-mx-6 -my-6 h-[calc(100vh-56px)] md:h-[calc(100vh-56px)]">
      <QA />
    </div>
  )
}
