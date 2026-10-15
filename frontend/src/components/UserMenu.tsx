import { useState } from 'react'
import { KeyRound, LogOut } from 'lucide-react'
import { useAuth } from '../lib/auth/AuthContext'
import ChangePasswordDialog from './ChangePasswordDialog'

export default function UserMenu() {
  const { user, logout } = useAuth()
  const [changingPassword, setChangingPassword] = useState(false)
  if (!user) return null

  return (
    <div className="flex items-center gap-2">
      <div className="hidden text-right sm:block">
        <p className="text-xs font-medium text-[var(--color-text)]">{user.username}</p>
        <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">{user.role}</p>
      </div>
      <button
        type="button"
        onClick={() => setChangingPassword(true)}
        title="Change password"
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border-strong)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
      >
        <KeyRound className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Password</span>
      </button>
      {changingPassword && <ChangePasswordDialog onClose={() => setChangingPassword(false)} />}
      <button
        type="button"
        onClick={() => void logout()}
        title="Sign out"
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border-strong)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
      >
        <LogOut className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Sign out</span>
      </button>
    </div>
  )
}
