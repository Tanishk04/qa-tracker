import { useEffect, useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { Login } from './components/Login'
import { Topbar } from './components/Topbar'
import { Dashboard } from './components/Dashboard'
import { KanbanBoard } from './components/KanbanBoard'
import { ImportDialog } from './components/ImportDialog'
import { Setup } from './components/Setup'
import { Timesheet } from './components/Timesheet'
import { IdleReminder } from './components/IdleReminder'
import { FocusPanel } from './components/FocusPanel'
import { PrioritizeDrawer } from './components/PrioritizeDrawer'
import { Icon } from './components/Icon'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from './lib/supabase'
import { FilterProvider } from './hooks/useFilter'
import { useTheme } from './hooks/useTheme'
import { DialogProvider } from './components/Dialog'
import { ResetPassword } from './components/ResetPassword'

export default function App() {
  // Side-effect: applies the saved theme to <html data-theme="...">
  useTheme()

  const { session, loading } = useAuth()
  const [recovering, setRecovering] = useState(false)
  const [importing, setImporting] = useState(false)

  // Global PASSWORD_RECOVERY: shown above everything else, regardless of session.
  // Also detect the recovery hash on hard-refresh (Supabase puts type=recovery in #fragment).
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash.includes('type=recovery')) {
      setRecovering(true)
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])
  const [setupOpen, setSetupOpen] = useState(false)
  const [timesheetOpen, setTimesheetOpen] = useState(false)
  const [prioritizeOpen, setPrioritizeOpen] = useState(false)
  const [focusVisible, setFocusVisible] = useState(true)
  const qc = useQueryClient()

  useEffect(() => {
    if (!session) return
    const ch = supabase.channel('rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' },
        () => qc.invalidateQueries({ queryKey: ['tasks'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_stories' },
        () => qc.invalidateQueries({ queryKey: ['stories'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' },
        () => qc.invalidateQueries({ queryKey: ['logs'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'developers' },
        () => qc.invalidateQueries({ queryKey: ['developers'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' },
        () => qc.invalidateQueries({ queryKey: ['settings'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'releases' },
        () => qc.invalidateQueries({ queryKey: ['releases'] }))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [session, qc])

  if (loading) {
    return <div style={{
      height: '100%', display: 'grid', placeItems: 'center', color: 'var(--text-muted)',
    }}>Loading…</div>
  }

  // Recovery flow takes precedence over everything — even if the user is signed in
  // (Supabase places them in a "recovery session" automatically when they click the
  // email link, so `session` may be truthy here).
  if (recovering) {
    return (
      <DialogProvider>
        <ResetPassword onDone={() => {
          setRecovering(false)
          // Clear the URL hash so refresh doesn't re-trigger the flow
          if (typeof window !== 'undefined') {
            window.history.replaceState(null, '', window.location.pathname + window.location.search)
          }
        }}/>
      </DialogProvider>
    )
  }

  if (!session) return <Login />

  return (
    <DialogProvider>
    <FilterProvider>
      <div className="app">
        <Topbar
          onOpenImport={() => setImporting(true)}
          onOpenSetup={() => setSetupOpen(true)}
          onOpenTimesheet={() => setTimesheetOpen(true)}
          onOpenPrioritize={() => setPrioritizeOpen(true)}
        />
        <div className={`main ${focusVisible ? '' : 'no-focus'}`}>
          <div className="workspace">
            <Dashboard />
            <KanbanBoard />
          </div>
          {focusVisible && <FocusPanel onHide={() => setFocusVisible(false)} />}
        </div>

        {!focusVisible && (
          <button
            className="focus-dock"
            onClick={() => setFocusVisible(true)}
            aria-label="Open Today's Focus"
            title="Open Today's Focus"
          >
            <Icon name="chevronRight" size={14} />
            <span className="focus-dock-label">FOCUS</span>
            <Icon name="target" size={14} />
          </button>
        )}

        <IdleReminder />
        {importing && <ImportDialog onClose={() => setImporting(false)} />}
        {setupOpen && <Setup onClose={() => setSetupOpen(false)} />}
        {timesheetOpen && <Timesheet onClose={() => setTimesheetOpen(false)} />}
        <PrioritizeDrawer open={prioritizeOpen} onClose={() => setPrioritizeOpen(false)} />
      </div>
    </FilterProvider>
    </DialogProvider>
  )
}
