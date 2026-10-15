import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AuthProvider from './components/AuthProvider'
import RequireAuth from './components/RequireAuth'
import LoginPage from './pages/LoginPage'
import WorklistPage from './pages/WorklistPage'
import ViewerPage from './pages/ViewerPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <WorklistPage />
              </RequireAuth>
            }
          />
          <Route
            path="/viewer/:studyInstanceUID"
            element={
              <RequireAuth>
                <ViewerPage />
              </RequireAuth>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
