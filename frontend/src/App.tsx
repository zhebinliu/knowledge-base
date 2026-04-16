import { Routes, Route } from 'react-router-dom'
import Layout    from './components/Layout'
import Dashboard from './pages/Dashboard'
import Documents from './pages/Documents'
import Chunks    from './pages/Chunks'
import QA        from './pages/QA'
import Review    from './pages/Review'
import Challenge from './pages/Challenge'
import Settings  from './pages/Settings'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index           element={<Dashboard />} />
        <Route path="documents" element={<Documents />} />
        <Route path="chunks"    element={<Chunks />} />
        <Route path="qa"        element={<QA />} />
        <Route path="review"    element={<Review />} />
        <Route path="challenge" element={<Challenge />} />
        <Route path="settings"  element={<Settings />} />
      </Route>
    </Routes>
  )
}
