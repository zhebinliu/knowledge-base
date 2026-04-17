import { Routes, Route } from 'react-router-dom'
import Layout    from './components/Layout'
import Dashboard from './pages/Dashboard'
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

export default function App() {
  return (
    <Routes>
      <Route path="/login"    element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/change-password" element={<RequireAuth />}>
        <Route index element={<ChangePassword />} />
      </Route>
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
