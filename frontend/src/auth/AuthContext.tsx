import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react'
import {
  AuthUser,
  TOKEN_STORAGE_KEY,
  fetchMe,
  login as apiLogin,
  register as apiRegister,
} from '../api/client'

interface AuthState {
  user: AuthUser | null
  loading: boolean
  login: (username: string, password: string) => Promise<AuthUser>
  register: (body: { username: string; password: string; email?: string; full_name?: string }) => Promise<AuthUser>
  logout: () => void
  refresh: () => Promise<void>
}

const AuthCtx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY)
    if (!token) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const me = await fetchMe()
      setUser(me)
    } catch {
      localStorage.removeItem(TOKEN_STORAGE_KEY)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiLogin(username, password)
    localStorage.setItem(TOKEN_STORAGE_KEY, res.access_token)
    setUser(res.user)
    return res.user
  }, [])

  const register = useCallback(async (body: { username: string; password: string; email?: string; full_name?: string }) => {
    const res = await apiRegister(body)
    localStorage.setItem(TOKEN_STORAGE_KEY, res.access_token)
    setUser(res.user)
    return res.user
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    setUser(null)
    window.location.assign('/login')
  }, [])

  return (
    <AuthCtx.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
