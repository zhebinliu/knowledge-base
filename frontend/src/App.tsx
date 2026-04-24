import { Routes, Route } from 'react-router-dom'
import Layout       from './components/Layout'
import ConsoleLayout from './layouts/ConsoleLayout'
import DesignSystem from './pages/DesignSystem'
import ApiDocs      from './pages/ApiDocs'
import Help         from './pages/Help'
import Demo         from './pages/Demo'
import Dashboard    from './pages/Dashboard'
import Documents from './pages/Documents'
import Chunks    from './pages/Chunks'
import QA        from './pages/QA'
import Review    from './pages/Review'
import Challenge from './pages/Challenge'
import ChallengeHistory from './pages/ChallengeHistory'
import Settings  from './pages/Settings'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import Login     from './pages/Login'
import Register  from './pages/Register'
import ChangePassword from './pages/ChangePassword'
import RequireAuth from './auth/RequireAuth'
// Console 工作台（对外输出视图）
import ConsoleHome from './pages/console/ConsoleHome'
import ConsoleQA from './pages/console/ConsoleQA'
import ConsolePM from './pages/console/ConsolePM'
import ConsoleOutputs from './pages/console/ConsoleOutputs'
import ConsoleMeeting from './pages/console/ConsoleMeeting'

export default function App() {
  return (
    <Routes>
      <Route path="/ds"       element={<DesignSystem />} />
      <Route path="/api"      element={<ApiDocs />} />
      <Route path="/help"     element={<Help />} />
      <Route path="/demo"     element={<Demo />} />
      <Route path="/login"    element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/change-password" element={<RequireAuth />}>
        <Route index element={<ChangePassword />} />
      </Route>

      {/* Console 工作台：/console/* —— 对外输出视图 */}
      <Route element={<RequireAuth />}>
        <Route path="console" element={<ConsoleLayout />}>
          <Route index          element={<ConsoleHome />} />
          <Route path="qa"      element={<ConsoleQA />} />
          <Route path="pm"      element={<ConsolePM />} />
          <Route path="outputs" element={<ConsoleOutputs />} />
          <Route path="meeting" element={<ConsoleMeeting />} />
        </Route>
      </Route>

      {/* 知识库后台：/ —— 内部管理视图 */}
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index           element={<Dashboard />} />
          <Route path="documents" element={<Documents />} />
          <Route path="projects"  element={<Projects />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="chunks"    element={<Chunks />} />
          <Route path="qa"        element={<QA />} />
          <Route path="review"    element={<Review />} />
          <Route path="challenge" element={<Challenge />} />
          <Route path="challenge/history" element={<ChallengeHistory />} />
          <Route path="settings"  element={<Settings />} />
        </Route>
      </Route>
    </Routes>
  )
}
