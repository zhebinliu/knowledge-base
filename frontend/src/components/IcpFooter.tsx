// ICP 备案号页脚(2026-09-28):生产迁腾讯云后对外域名 sharewb.cloud 已备案,
// 按工信部要求在网站首页底部展示备案号并链接到 beian.miit.gov.cn。
// 未登录访客落地页就是登录 / 注册页,所以挂在这两页。
export const ICP_NUMBER = '京ICP备2026021842号'

export default function IcpFooter() {
  return (
    <footer className="absolute bottom-4 left-0 right-0 text-center text-xs text-gray-400">
      <a
        href="https://beian.miit.gov.cn/"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-gray-600 hover:underline"
      >
        {ICP_NUMBER}
      </a>
    </footer>
  )
}
