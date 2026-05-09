import { useEffect, useState } from 'react'
import { signIn, signUp, sendPasswordReset, updatePassword } from '../lib/api'
import { supabase } from '../lib/supabase'
import { Icon } from './Icon'
import { Logo } from './Logo'

type Mode = 'in' | 'up' | 'forgot' | 'reset'

export function Login() {
  const [mode, setMode] = useState<Mode>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('reset'); setErr(null); setInfo('Set a new password to continue.')
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setInfo(null); setBusy(true)
    try {
      if (mode === 'in') await signIn(email, password)
      else if (mode === 'up') {
        await signUp(email, password)
        setInfo('Account created. If email confirmation is enabled, check your inbox.')
      } else if (mode === 'forgot') {
        await sendPasswordReset(email); setInfo('Check your inbox for the reset link.')
      } else if (mode === 'reset') {
        if (password !== password2) throw new Error('Passwords do not match')
        if (password.length < 6) throw new Error('Password must be at least 6 characters')
        await updatePassword(password); setInfo('Password updated. You are signed in.')
      }
    } catch (e: any) { setErr(e.message ?? 'Failed') }
    finally { setBusy(false) }
  }

  const titles: Record<Mode, string> = {
    in: 'Sign in',
    up: 'Create account',
    forgot: 'Reset your password',
    reset: 'Set a new password',
  }
  const subtitles: Record<Mode, string> = {
    in: 'Welcome back. Pick up right where you left off.',
    up: 'A QA productivity workspace built for one.',
    forgot: 'Enter your email and we\'ll send a recovery link.',
    reset: 'Choose something memorable.',
  }

  return (
    <div className="login-shell" style={{ background: 'var(--bg)' }}>
      {/* Brand panel — hidden on mobile via CSS */}
      <aside className="login-brand" style={{
        position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: 40,
        background: 'linear-gradient(135deg, var(--bg-elev), var(--bg))',
        borderRight: '1px solid var(--border)',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -100, left: -100, width: 380, height: 380,
          borderRadius: '50%', background: 'var(--accent-soft)', filter: 'blur(80px)',
          pointerEvents: 'none',
        }}/>
        <div style={{
          position: 'absolute', bottom: -120, right: -80, width: 420, height: 420,
          borderRadius: '50%', background: 'oklch(0.74 0.10 280 / 0.18)', filter: 'blur(100px)',
          pointerEvents: 'none',
        }}/>

        <div className="brand" style={{ borderRight: 'none', padding: 0 }}>
          <Logo size={40} />
          <div>
            <div className="brand-name" style={{ fontSize: 16 }}>QA Tracker</div>
            <div className="brand-sub">For QA Engineers</div>
          </div>
        </div>

        <div style={{ position: 'relative', maxWidth: 460 }}>
          <h2 style={{
            fontSize: 30, lineHeight: 1.15, fontWeight: 600, letterSpacing: '-0.02em',
            margin: '0 0 16px',
          }}>
            Replace the spreadsheet.<br/>
            <span style={{ color: 'var(--accent)' }}>Keep the focus.</span>
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6, margin: '0 0 20px' }}>
            Import Salesforce User Stories, auto-generate the QA checklist,
            and let the system track time as you switch between tasks. No timers,
            no clicking buttons. Just one keystroke between you and the next thing.
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              'Auto-generated tasks per US',
              'Passive time tracking via state transitions',
              'Drag-and-drop priority ordering',
              'One global active task — switching is atomic',
              'Drag & drop kanban with auto-stage',
              'Evidence checks for SIT & UAT',
            ].map(t => (
              <li key={t} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--text)' }}>
                <Icon name="check" size={14} className="text-accent" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>

        <div style={{ position: 'relative', fontSize: 11, color: 'var(--text-dim)' }}>v0.2 · personal build</div>
      </aside>

      {/* Form panel */}
      <div className="login-form-panel" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
        {/* Compact brand row — visible only on mobile (the brand panel is hidden there) */}
        <div className="login-mobile-brand">
          <Logo size={36} />
          <div>
            <div className="brand-name" style={{ fontSize: 15 }}>QA Tracker</div>
            <div className="brand-sub">For QA Engineers</div>
          </div>
        </div>
        <form onSubmit={onSubmit} className="login-form" style={{
          width: 400, maxWidth: '100%',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 28,
        }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.015em', margin: '0 0 4px' }}>{titles[mode]}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 20px' }}>{subtitles[mode]}</p>

          {(mode === 'in' || mode === 'up' || mode === 'forgot') && (<>
            <label className="label-cap">Email</label>
            <input className="fld" type="email" required autoFocus
              value={email} onChange={e => setEmail(e.target.value)}
              style={{ width: '100%', marginBottom: 12 }}/>
          </>)}

          {(mode === 'in' || mode === 'up' || mode === 'reset') && (<>
            <label className="label-cap">{mode === 'reset' ? 'New password' : 'Password'}</label>
            <input className="fld" type="password" required minLength={6}
              value={password} onChange={e => setPassword(e.target.value)}
              style={{ width: '100%', marginBottom: 12 }}/>
          </>)}

          {mode === 'reset' && (<>
            <label className="label-cap">Confirm new password</label>
            <input className="fld" type="password" required minLength={6}
              value={password2} onChange={e => setPassword2(e.target.value)}
              style={{ width: '100%', marginBottom: 12 }}/>
          </>)}

          {mode === 'in' && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -4, marginBottom: 12 }}>
              <button type="button"
                style={{ fontSize: 12, color: 'var(--text-muted)' }}
                onClick={() => { setMode('forgot'); setErr(null); setInfo(null) }}>
                Forgot password?
              </button>
            </div>
          )}

          {err && <div style={{ color: 'oklch(0.72 0.16 25)', fontSize: 12, marginBottom: 10 }}>{err}</div>}
          {info && <div style={{ color: 'oklch(0.72 0.12 150)', fontSize: 12, marginBottom: 10 }}>{info}</div>}

          <button type="submit" className="btn btn-primary"
            disabled={busy} style={{ width: '100%', justifyContent: 'center', padding: '8px 12px' }}>
            {busy ? '...' : mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Update password'}
          </button>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
            {mode === 'in' && (
              <button type="button" onClick={() => { setMode('up'); setErr(null); setInfo(null) }}>
                New here? Create an account
              </button>
            )}
            {mode === 'up' && (
              <button type="button" onClick={() => { setMode('in'); setErr(null); setInfo(null) }}>
                Already have an account? Sign in
              </button>
            )}
            {(mode === 'forgot' || mode === 'reset') && (
              <button type="button" onClick={() => { setMode('in'); setErr(null); setInfo(null) }}>
                Back to sign in
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
