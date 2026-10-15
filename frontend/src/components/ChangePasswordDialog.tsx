import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth/AuthContext'

const MIN_LENGTH = 12

interface Props {
  onClose: () => void
}

export default function ChangePasswordDialog({ onClose }: Props) {
  const { changePassword } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const titleId = useId()
  const firstField = useRef<HTMLInputElement>(null)

  useEffect(() => {
    firstField.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  function validate(): string | null {
    if (next.length < MIN_LENGTH) return `The new password must be at least ${MIN_LENGTH} characters.`
    if (next !== confirm) return 'The new password and its confirmation do not match.'
    if (next === current) return 'The new password must be different from the current one.'
    return null
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validation = validate()
    if (validation) {
      setError(validation)
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await changePassword(current, next)
      setDone(true)
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the password.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    'w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onMouseDown={(e) => {
      if (e.target === e.currentTarget && !submitting) onClose()
    }}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
        <h2 id={titleId} className="mb-1 text-sm font-semibold text-[var(--color-text)]">Change password</h2>
        <p className="mb-5 text-xs text-[var(--color-text-muted)]">
          Changing your password signs out your other sessions on every device.
        </p>

        {done ? (
          <div className="space-y-4">
            <p role="status" className="rounded-md border border-[var(--color-accent)]/30 bg-[var(--color-accent-dim)] px-3 py-2 text-xs text-[var(--color-accent)]">
              Password changed. Your other sessions have been signed out.
            </p>
            <button type="button" onClick={onClose} className="w-full rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[#06110f] hover:bg-[var(--color-accent-strong)]">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[var(--color-text-muted)]">Current password</span>
              <input ref={firstField} className={inputClass} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[var(--color-text-muted)]">New password</span>
              <input className={inputClass} type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={MIN_LENGTH} required />
              <span className="block text-[10px] text-[var(--color-text-dim)]">At least {MIN_LENGTH} characters.</span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[var(--color-text-muted)]">Confirm new password</span>
              <input className={inputClass} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
            </label>

            {error && (
              <div role="alert" className="rounded-md border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={onClose} disabled={submitting} className="flex-1 rounded-md border border-[var(--color-border-strong)] px-3 py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50">
                Cancel
              </button>
              <button type="submit" disabled={submitting || !current || !next || !confirm} className="flex-1 rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[#06110f] hover:bg-[var(--color-accent-strong)] disabled:cursor-not-allowed disabled:opacity-50">
                {submitting ? 'Saving…' : 'Change password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
