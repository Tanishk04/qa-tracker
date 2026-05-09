import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import {
  resetAllData, resetMyPassword, signOutAllDevices, reseedReleasesFromStories,
} from '../lib/api'
import { useDialog } from './Dialog'
import { Icon } from './Icon'
import { useAdminStats } from '../hooks/useAdminStats'
import { fmtDuration } from '../lib/time'
import { useStories, useTasks, useLogs } from '../hooks/useData'
import { useDevelopers, useReleases, useSettings } from '../hooks/useSettings'
import { exportFullBackupJSON } from '../lib/csv'
import type { User } from '@supabase/supabase-js'

const RESET_COOLDOWN_MS = 60_000

function fmtRelative(iso: string | undefined | null): string {
  if (!iso) return '—'
  const ms = Date.now() - +new Date(iso)
  if (ms < 60_000) return 'just now'
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  const d = Math.floor(ms / 86_400_000)
  if (d < 30) return `${d}d ago`
  if (d < 365) return `${Math.floor(d / 30)}mo ago`
  return `${Math.floor(d / 365)}y ago`
}

function fmtAbs(iso: string | undefined | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString()
}

export function AdminTab() {
  const dialog = useDialog()
  const qc = useQueryClient()
  const [user, setUser] = useState<User | null>(null)
  const [resetCooldownUntil, setResetCooldownUntil] = useState(0)
  const [busy, setBusy] = useState<null | 'reset' | 'signout' | 'export' | 'wipe' | 'reseed' | 'copy'>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [showSystem, setShowSystem] = useState(false)

  const stats = useAdminStats()
  const { data: stories = [] } = useStories()
  const { data: tasks = [] } = useTasks()
  const { data: logs = [] } = useLogs()
  const { data: developers = [] } = useDevelopers()
  const { data: releases = [] } = useReleases()
  const { data: settings = null } = useSettings()

  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setUser(data.user)
    })
    return () => { cancelled = true }
  }, [])

  // tick to refresh cooldown countdown
  const [, setTick] = useState(0)
  useEffect(() => {
    if (resetCooldownUntil <= Date.now()) return
    const id = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [resetCooldownUntil])

  function showToast(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 4000)
  }

  async function copyEmail() {
    if (!user?.email) return
    setBusy('copy')
    try { await navigator.clipboard.writeText(user.email); showToast('Email copied to clipboard') }
    catch { showToast('Could not copy email') }
    finally { setBusy(null) }
  }

  async function onSendReset() {
    if (Date.now() < resetCooldownUntil) return
    const ok = await dialog.confirm({
      title: 'Send a password-reset email to yourself?',
      body: (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          We'll send a recovery link to <strong style={{ color: 'var(--text)' }}>{user?.email}</strong>.
          When you click it, the app will open the password-reset screen.
        </div>
      ),
      confirmLabel: 'Send email',
    })
    if (!ok) return
    setBusy('reset')
    try {
      await resetMyPassword()
      setResetCooldownUntil(Date.now() + RESET_COOLDOWN_MS)
      showToast('Email sent — check your inbox in the next minute.')
    } catch (e: any) {
      showToast(e?.message ?? 'Could not send reset email')
    } finally { setBusy(null) }
  }

  async function onSignOutAll() {
    const ok = await dialog.confirm({
      title: 'Sign out everywhere?',
      body: 'You will be signed out on every device + browser, including this one. You\'ll need to sign in again.',
      destructive: true,
      confirmLabel: 'Sign out everywhere',
    })
    if (!ok) return
    setBusy('signout')
    try { await signOutAllDevices() }
    catch (e: any) { showToast(e?.message ?? 'Sign out failed'); setBusy(null) }
  }

  async function onExport() {
    const ok = await dialog.confirm({
      title: 'Export full backup?',
      body: (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          A JSON file with everything you own — {stats.stories.total} stories, {stats.tasks.total} tasks,
          {' '}{stats.logs.total} log entries, {stats.developers} developers, {stats.releases} releases.
        </div>
      ),
      confirmLabel: 'Download',
    })
    if (!ok) return
    setBusy('export')
    try {
      exportFullBackupJSON({ stories, tasks, logs, developers, releases, settings })
      showToast('Backup file downloaded')
    } finally { setBusy(null) }
  }

  async function onReseed() {
    setBusy('reseed')
    try {
      const added = await reseedReleasesFromStories()
      qc.invalidateQueries({ queryKey: ['releases'] })
      showToast(added === 0 ? 'No new releases to add — already in sync.' : `Added ${added} release${added === 1 ? '' : 's'} to the picklist.`)
    } catch (e: any) {
      showToast(e?.message ?? 'Re-seed failed')
    } finally { setBusy(null) }
  }

  async function onWipe() {
    if (!user?.email) return
    const typed = await dialog.prompt({
      title: 'Reset all data',
      body: (
        <div style={{ fontSize: 13 }}>
          <p style={{ color: 'oklch(0.72 0.16 25)', fontWeight: 500, marginTop: 0 }}>
            This permanently deletes every story, task, activity log, developer, and release in your account.
            It cannot be undone.
          </p>
          <p style={{ color: 'var(--text-muted)' }}>
            Type <strong style={{ color: 'var(--text)' }}>{user.email}</strong> below to confirm.
          </p>
        </div>
      ),
      label: 'Your email',
      placeholder: user.email,
      validate: (v) => v.trim().toLowerCase() === user.email!.toLowerCase()
        ? null : 'Email does not match',
      confirmLabel: 'Wipe everything',
    })
    if (typed == null) return
    setBusy('wipe')
    try {
      await resetAllData()
      qc.invalidateQueries()
      showToast('All data deleted.')
    } catch (e: any) {
      showToast(e?.message ?? 'Wipe failed')
    } finally { setBusy(null) }
  }

  const cooldownRemain = Math.max(0, Math.ceil((resetCooldownUntil - Date.now()) / 1000))
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/^https?:\/\//, '')
  const buildTs = (import.meta.env.VITE_BUILD_TIMESTAMP as string) || ''
  const appVersion = (import.meta.env.VITE_APP_VERSION as string) || '0.0.0'

  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 0 }}>
        Self-administration tools for your account and data. Single-tenant — only you can be here.
      </p>

      {/* === Account === */}
      <Section icon="settings" title="Account">
        <Row label="Email">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="mono" style={{ color: 'var(--text)' }}>{user?.email ?? '…'}</span>
            <button className="btn-icon" style={{ width: 26, height: 26 }} onClick={copyEmail}
              title="Copy email" disabled={busy === 'copy' || !user?.email}>
              <Icon name="paperclip" size={12}/>
            </button>
          </div>
        </Row>
        <Row label="Account created">
          <Timestamp iso={user?.created_at}/>
        </Row>
        <Row label="Last sign-in">
          <Timestamp iso={user?.last_sign_in_at}/>
        </Row>
        <Row label="Password">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn btn-primary"
              onClick={onSendReset}
              disabled={busy === 'reset' || cooldownRemain > 0}>
              <Icon name="rotate" size={12}/>
              {cooldownRemain > 0 ? `Resend in ${cooldownRemain}s` : 'Send me a reset email'}
            </button>
          </div>
        </Row>
        <Row label="Sessions">
          <button className="btn btn-outline" onClick={onSignOutAll} disabled={busy === 'signout'}>
            <Icon name="x" size={12}/> Sign out everywhere
          </button>
        </Row>
      </Section>

      {/* === Data === */}
      <Section icon="list" title="Data">
        <div className="admin-stat-grid">
          <Stat label="Stories"
            value={stats.stories.total}
            sub={`${stats.stories.active} active · ${stats.stories.archived} archived · ${stats.stories.completed} completed`}/>
          <Stat label="Tasks"
            value={stats.tasks.total}
            sub={`${stats.tasks.running} running · ${stats.tasks.completed} done · ${stats.tasks.skipped} skipped`}/>
          <Stat label="Tracked time"
            value={fmtDuration(stats.trackedSec)}
            sub={`${stats.logs.total} log entries · ${stats.logs.daysActive} active days`}/>
          <Stat label="Picklists"
            value={`${stats.developers} / ${stats.releases}`}
            sub="Developers / Releases"/>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <button className="btn btn-outline" onClick={onExport} disabled={busy === 'export'}>
            <Icon name="download" size={12}/> Export full backup (JSON)
          </button>
          <button className="btn btn-outline" onClick={onReseed} disabled={busy === 'reseed'}>
            <Icon name="rotate" size={12}/> Re-seed releases from stories
          </button>
        </div>
      </Section>

      {/* === Danger zone === */}
      <Section icon="flame" title="Danger zone" tone="danger">
        <div className="row-line" style={{ borderBottom: 0, paddingTop: 4 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
              Delete every story, task, log, developer, and release
            </div>
            <div className="desc">
              Wipes the kanban completely. Settings + your auth account are kept.
              Useful when starting fresh after a test import.
            </div>
          </div>
          <button className="btn btn-danger" onClick={onWipe} disabled={busy === 'wipe'}>
            <Icon name="trash" size={12}/> Reset all data
          </button>
        </div>
      </Section>

      {/* === System === */}
      <Section icon="sliders" title="System" collapsible collapsed={!showSystem} onToggle={() => setShowSystem(v => !v)}>
        {showSystem && (
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '6px 14px', fontSize: 12 }}>
            <span style={{ color: 'var(--text-dim)' }}>Supabase project</span>
            <span className="mono" style={{ color: 'var(--text-muted)' }}>{supabaseUrl || 'not configured'}</span>
            <span style={{ color: 'var(--text-dim)' }}>App version</span>
            <span className="mono">{appVersion}</span>
            <span style={{ color: 'var(--text-dim)' }}>Build time</span>
            <span className="mono">{buildTs ? fmtAbs(buildTs) : 'dev'}</span>
            <span style={{ color: 'var(--text-dim)' }}>User ID</span>
            <span className="mono" style={{ color: 'var(--text-muted)' }}>{user?.id ?? '…'}</span>
          </div>
        )}
      </Section>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

// ============================================================
// Subcomponents
// ============================================================

function Section({
  icon, title, tone, collapsible, collapsed, onToggle, children,
}: {
  icon: any; title: string; tone?: 'danger'
  collapsible?: boolean; collapsed?: boolean; onToggle?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="admin-section" style={{
      border: tone === 'danger'
        ? '1px solid oklch(0.65 0.18 25 / 0.4)'
        : '1px solid var(--border)',
      borderRadius: 10,
      padding: '12px 14px',
      marginBottom: 14,
      background: tone === 'danger' ? 'oklch(0.65 0.18 25 / 0.05)' : 'var(--bg-card)',
    }}>
      <button
        type="button"
        onClick={collapsible ? onToggle : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: 0, marginBottom: 8,
          fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: tone === 'danger' ? 'oklch(0.72 0.16 25)' : 'var(--text-dim)',
          fontWeight: 600,
          cursor: collapsible ? 'pointer' : 'default',
        }}
      >
        <Icon name={icon} size={12}/>
        <span>{title}</span>
        {collapsible && (
          <span style={{ marginLeft: 'auto' }}>
            <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={12}/>
          </span>
        )}
      </button>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="row-line" style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 140 }}>{label}</div>
      <div>{children}</div>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="admin-stat">
      <div className="admin-stat-label">{label}</div>
      <div className="admin-stat-value">{value}</div>
      {sub && <div className="admin-stat-sub">{sub}</div>}
    </div>
  )
}

function Timestamp({ iso }: { iso: string | undefined | null }) {
  if (!iso) return <span style={{ color: 'var(--text-dim)' }}>—</span>
  return (
    <span title={fmtAbs(iso)}>
      <span style={{ color: 'var(--text)' }}>{fmtRelative(iso)}</span>
      <span style={{ marginLeft: 8, color: 'var(--text-dim)', fontSize: 11 }}>{fmtAbs(iso)}</span>
    </span>
  )
}
