import { Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'

// /demo-ppt — 高层汇报 PPT(独立 chunk, 首次访问才下载)
const DemoPPT = lazy(() => import('./pages/DemoPPT'))
// /redesign — 设计原型(深色 Liquid Glass)
import RedesignShell  from './redesign/RedesignShell'
import RDConsoleHome  from './redesign/pages/ConsoleHome'
import RDDashboard    from './redesign/pages/Dashboard'
import RDQA           from './redesign/pages/QA'
import RDDocuments    from './redesign/pages/Documents'
import RDProjects     from './redesign/pages/Projects'
import RDInsight      from './redesign/pages/Insight'
import RDSurvey       from './redesign/pages/Survey'

// 新前端(Liquid Glass + 真功能)— uat 域名下生效,逐页迁移
// 在 kb.liii.in / kb.tokenwave.cloud 下保持现有浅色 UI 不变
import NewLayout                from './redesign/Layout'
import NewQA                    from './redesign/QA'
import NewBackendProjects       from './redesign/Projects'
import NewBackendProjectDetail  from './redesign/ProjectDetail'
import NewBackendReview         from './redesign/Review'
import NewBackendChallengeHist  from './redesign/ChallengeHistory'
import NewBackendSettings       from './redesign/Settings'
import NewBackendSystemConfig   from './redesign/SystemConfig'
import NewConsoleLayout      from './redesign/console/ConsoleLayout'
import NewConsoleHome        from './redesign/console/ConsoleHome'
import NewConsoleProjects       from './redesign/console/ConsoleProjects'
import NewConsoleProjectDetail  from './redesign/console/ConsoleProjectDetail'
import NewConsoleMeeting        from './redesign/console/ConsoleMeeting'
import NewConsoleMeetingNew     from './redesign/console/ConsoleMeetingNew'
import NewConsoleMeetingDetail  from './redesign/console/ConsoleMeetingDetail'
import NewTemplateManager      from './redesign/console/TemplateManager'

// ConsoleQA 在生产中是个薄 wrapper(import QA + 套高度),uat 下用 NewQA 替换
function NewConsoleQAWrapper() {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <NewQA />
    </div>
  )
}

// hostname 检测:uat.tokenwave.cloud 或 ?ui=new query 时启用新 UI
// 本地开发:vite dev 默认 localhost → 老 UI;加 ?ui=new 切到新 UI 调试
const IS_NEW_UI = typeof window !== 'undefined' && (
  window.location.hostname === 'uat.tokenwave.cloud' ||
  new URLSearchParams(window.location.search).get('ui') === 'new'
)
import Layout       from './components/Layout'
import ConsoleLayout from './layouts/ConsoleLayout'
import DesignSystem from './pages/DesignSystem'
import ApiDocs      from './pages/ApiDocs'
import Help         from './pages/Help'
import Demo         from './pages/Demo'
import InsightDemo  from './pages/demo/InsightDemo'
import SurveyDemo   from './pages/demo/SurveyDemo'
import OutlineDemo  from './pages/demo/OutlineDemo'
import Dashboard    from './pages/Dashboard'
import Documents from './pages/Documents'
import Chunks    from './pages/Chunks'
import QA        from './pages/QA'
import Review    from './pages/Review'
import Challenge from './pages/Challenge'
import ChallengeHistory from './pages/ChallengeHistory'
import Settings  from './pages/Settings'
import SystemConfig from './pages/SystemConfig'
import InviteCodes from './pages/InviteCodes'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import Login     from './pages/Login'
import Register  from './pages/Register'
import ChangePassword from './pages/ChangePassword'
import RequireAuth from './auth/RequireAuth'
import Toaster from './components/Toaster'
// Console 工作台（对外输出视图）
import ConsoleHome from './pages/console/ConsoleHome'
import ConsoleQA from './pages/console/ConsoleQA'
import ConsoleProjects from './pages/console/ConsoleProjects'
import ConsoleProjectDetail from './pages/console/ConsoleProjectDetail'
import ConsoleMeeting from './pages/console/ConsoleMeeting'
import ConsoleMeetingDetail from './pages/console/ConsoleMeetingDetail'
import ConsoleMeetingNew from './pages/console/ConsoleMeetingNew'

export default function App() {
  return (
    <>
    <Toaster />
    <Routes>
      <Route path="/ds"       element={<DesignSystem />} />
      <Route path="/api"      element={<ApiDocs />} />
      <Route path="/help"     element={<Help />} />
      <Route path="/demo"          element={<Demo />} />
      <Route path="/demo/insight"  element={<InsightDemo />} />
      <Route path="/demo/survey"   element={<SurveyDemo />} />
      <Route path="/demo/outline"  element={<OutlineDemo />} />
      <Route
        path="/demo-ppt"
        element={
          <Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: '#050810' }} />}>
            <DemoPPT />
          </Suspense>
        }
      />

      {/* 设计原型:深色 Liquid Glass,无需登录即可预览 */}
      <Route path="/redesign" element={<RedesignShell />}>
        <Route index               element={<RDConsoleHome />} />
        <Route path="console"      element={<RDConsoleHome />} />
        <Route path="dashboard"    element={<RDDashboard />} />
        <Route path="qa"           element={<RDQA />} />
        <Route path="documents"    element={<RDDocuments />} />
        <Route path="projects"     element={<RDProjects />} />
        <Route path="insight"      element={<RDInsight />} />
        <Route path="survey"       element={<RDSurvey />} />
        <Route path="*"            element={<Navigate to="/redesign" replace />} />
      </Route>

      <Route path="/login"    element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/change-password" element={<RequireAuth />}>
        <Route index element={<ChangePassword />} />
      </Route>

      {/* Console 工作台：/console/* —— 对外输出视图
          uat 域名下用新 Liquid Glass Layout + 已迁移的新页;未迁移的页面 fallback
          回旧实现(还套在旧 ConsoleLayout 里,只是浏览器看到的是混合状态)。
          kb 域名下完全用旧实现,不受影响。 */}
      <Route element={<RequireAuth />}>
        <Route path="console" element={IS_NEW_UI ? <NewConsoleLayout /> : <ConsoleLayout />}>
          <Route index               element={IS_NEW_UI ? <NewConsoleHome />        : <ConsoleHome />} />
          <Route path="qa"           element={IS_NEW_UI ? <NewConsoleQAWrapper />   : <ConsoleQA />} />
          <Route path="projects"     element={IS_NEW_UI ? <NewConsoleProjects />    : <ConsoleProjects />} />
          <Route path="projects/:id" element={IS_NEW_UI ? <NewConsoleProjectDetail /> : <ConsoleProjectDetail />} />
          <Route path="meeting"      element={IS_NEW_UI ? <NewConsoleMeeting />     : <ConsoleMeeting />} />
          <Route path="meeting/new"  element={IS_NEW_UI ? <NewConsoleMeetingNew />  : <ConsoleMeetingNew />} />
          <Route path="meeting/templates" element={<NewTemplateManager />} />
          <Route path="meeting/:id"  element={IS_NEW_UI ? <NewConsoleMeetingDetail /> : <ConsoleMeetingDetail />} />
        </Route>
      </Route>

      {/* 知识库后台：/ —— 内部管理视图
          uat 下用 NewLayout + 已迁移的新页;未迁移的继续套老组件 */}
      <Route element={<RequireAuth />}>
        <Route element={IS_NEW_UI ? <NewLayout /> : <Layout />}>
          <Route index               element={<Dashboard />} />
          <Route path="documents"    element={<Documents />} />
          <Route path="projects"     element={IS_NEW_UI ? <NewBackendProjects />      : <Projects />} />
          <Route path="projects/:id" element={IS_NEW_UI ? <NewBackendProjectDetail /> : <ProjectDetail />} />
          <Route path="chunks"       element={<Chunks />} />
          <Route path="qa"           element={IS_NEW_UI ? <NewQA />                   : <QA />} />
          <Route path="review"       element={IS_NEW_UI ? <NewBackendReview />        : <Review />} />
          <Route path="challenge"    element={<Challenge />} />
          <Route path="challenge/history" element={IS_NEW_UI ? <NewBackendChallengeHist /> : <ChallengeHistory />} />
          <Route path="settings"      element={IS_NEW_UI ? <NewBackendSettings />     : <Settings />} />
          <Route path="system-config" element={IS_NEW_UI ? <NewBackendSystemConfig /> : <SystemConfig />} />
          <Route path="invite-codes"  element={<InviteCodes />} />
        </Route>
      </Route>
    </Routes>
    </>
  )
}
