import { useState } from 'react'
import { signOut, updatePassword } from '../lib/api'
import { Icon } from './Icon'
import { Logo } from './Logo'

interface Props {
  onDone: () => void
}

export function ResetPassword({ onDone }: Props) {
  const [pwd, setPwd] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null); setInfo(null); setBusy(true)
    try {
      if (pwd !== pwd2) throw new Error('Passwords do not match')
      if (pwd.length < 6) throw new Error('Password must be at least 6 characters')
      await updatePassword(pwd)
      setInfo('Password updated. You are signed in.')
      // Small delay so the user sees the success state, then continue.
      setTimeout(onDone, 800)
    } catch (e: any) {
      setErr(e.message ?? 'Failed to update password')
    } finally { setBusy(false) }
  }

  async function onCancel() {
    // If they click cancel, sign out so the recovery session doesn't persist.
    await signOut()
    onDone()
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'grid', placeItems: 'center',
      background: 'var(--bg)', padding: 24,
    }}>
      <form onSubmit={onSubmit} style={{
        width: 420, maxWidth: '100%',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 28,
        boxShadow: 'var(--shadow-lg)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Logo size={32}/>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Recovery
          </div>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.015em', margin: '4px 0' }}>
          Set a new password
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 20px' }}>
          You arrived here from a password-reset email. Choose a new password to continue.
        </p>

        <label className="label-cap">New password</label>
        <input className="fld" type="password" required minLength={6} autoFocus
          value={pwd} onChange={e => setPwd(e.target.value)}
          style={{ width: '100%', marginBottom: 12 }}/>

        <label className="label-cap">Confirm new password</label>
        <input className="fld" type="password" required minLength={6}
          value={pwd2} onChange={e => setPwd2(e.target.value)}
          style={{ width: '100%', marginBottom: 12 }}/>

        {err && <div style={{ color: 'oklch(0.72 0.16 25)', fontSize: 12, marginBottom: 10 }}>{err}</div>}
        {info && <div style={{ color: 'oklch(0.72 0.12 150)', fontSize: 12, marginBottom: 10 }}>{info}</div>}

        <button type="submit" className="btn btn-primary" disabled={busy}
          style={{ width: '100%', justifyContent: 'center', padding: '8px 12px' }}>
          {busy ? '...' : 'Update password'}
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, fontSize: 12 }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            <Icon name="x" size={12}/> Cancel & sign out
          </button>
        </div>
      </form>
    </div>
  )
}
