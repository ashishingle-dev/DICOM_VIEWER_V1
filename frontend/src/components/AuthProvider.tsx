import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { AuthContext, type AuthContextValue, type AuthStatus } from '../lib/auth/AuthContext'
import {
  changePassword as sessionChangePassword,
  getCurrentUser,
  login as sessionLogin,
  logout as sessionLogout,
  restoreSession,
  subscribeAuth,
} from '../lib/auth/session'

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [restored, setRestored] = useState(false)
  const user = useSyncExternalStore(subscribeAuth, getCurrentUser, getCurrentUser)

  useEffect(() => {
    let active = true
    void restoreSession().finally(() => {
      if (active) setRestored(true)
    })
    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (username: string, password: string, rememberMe: boolean) => {
    await sessionLogin(username, password, rememberMe)
  }, [])

  const logout = useCallback(() => sessionLogout(), [])

  const changePassword = useCallback(
    (currentPassword: string, newPassword: string) => sessionChangePassword(currentPassword, newPassword),
    [],
  )

  const status: AuthStatus = user ? 'authenticated' : restored ? 'anonymous' : 'loading'

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, logout, changePassword }),
    [status, user, login, logout, changePassword],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
