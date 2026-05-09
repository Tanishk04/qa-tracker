import { useQueryClient } from '@tanstack/react-query'
import { useStories, useTasks, useLogs } from '../hooks/useData'
import { useTick } from '../hooks/useTick'
import { useFilter } from '../hooks/useFilter'
import { useTheme } from '../hooks/useTheme'
import { computeTaskSeconds, fmtDurationLong } from '../lib/time'
import { TASK_LABELS } from '../lib/types'
import { rpcPauseCurrent } from '../lib/api'
import { useStartTaskGuarded } from '../hooks/useStartTaskGuarded'
import { exportStoriesCSV } from '../lib/csv'
import { Icon } from './Icon'
import { Logo } from './Logo'
import { useDialog } from './Dialog'

interface Props {
  onOpenImport: () => void
  onOpenSetup: () => void
  onOpenTimesheet: () => void
  onOpenPrioritize: () => void
}

export function Topbar({ onOpenImport, onOpenSetup, onOpenTimesheet, onOpenPrioritize }: Props) {
  // Tick drives the live timer — DON'T cache `seconds` in useMemo,
  // it has to recompute on every render.
  useTick(1000)
  const qc = useQueryClient()
  const { data: stories = [] } = useStories()
  const { data: tasks = [] } = useTasks()
  const { data: logs = [] } = useLogs()
  const { applies } = useFilter()
  const { theme, toggle } = useTheme()
  const dialog = useDialog()
  const startTask = useStartTaskGuarded()

  const activeTask = tasks.find(t => t.status === 'in_progress') ?? null
  const activeUs = activeTask ? stories.find(s => s.id === activeTask.us_pk) : null
  const activeSeconds = activeTask ? computeTaskSeconds(activeTask, logs) : 0

  // Resume target = most recently paused task
  const resumeTarget = !activeTask
    ? [...tasks].filter(t => t.status === 'paused')
        .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at))[0]
    : null

  function openSearch() {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, metaKey: true }))
  }
  async function pause() {
    await rpcPauseCurrent()
    qc.invalidateQueries({ queryKey: ['tasks'] })
    qc.invalidateQueries({ queryKey: ['logs'] })
  }
  async function resume() {
    if (!resumeTarget) return
    await startTask(resumeTarget.id)
  }

  async function onExport() {
    const visible = stories.filter(applies)
    const ymd = new Date().toISOString().slice(0, 10)
    const ok = await dialog.confirm({
      title: 'Export to CSV?',
      body: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div>
            <strong>{visible.length}</strong> {visible.length === 1 ? 'story' : 'stories'} from the current filter will be exported.
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            File: <span className="mono">qa-tracker-{ymd}.csv</span>
          </div>
          <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>
            Includes per-task time, status, complexity, release, cycle.
          </div>
        </div>
      ),
      confirmLabel: 'Download',
    })
    if (!ok) return
    exportStoriesCSV(visible, tasks, logs)
  }

  return (
    <header className="topbar">
      <div className="brand">
        <Logo size={28} />
        <div>
          <div className="brand-name">QA Tracker</div>
          <div className="brand-sub">For QA Engineers</div>
        </div>
      </div>

      <div className="topbar-center">
        {activeTask ? (
          <div className="active-task live">
            <span className="pulse" />
            <span style={{ color: 'var(--text-muted)' }}>Running</span>
            <span className="mono" style={{ color: 'var(--text)' }}>{activeUs?.us_id}</span>
            <span style={{ color: 'var(--text-dim)' }}>·</span>
            <span style={{ color: 'var(--text)' }}>{TASK_LABELS[activeTask.type]}</span>
            <span className="task-time">{fmtDurationLong(activeSeconds)}</span>
            <button
              className="btn-icon"
              style={{ width: 24, height: 24, marginLeft: 2 }}
              onClick={pause}
              title="Pause"
              aria-label="Pause"
            >
              <Icon name="pause" size={14}/>
            </button>
          </div>
        ) : (
          <div className="active-task">
            <span className="pulse" />
            <span>{resumeTarget ? `Paused · ${resumeTarget.us_pk ? '' : ''}${TASK_LABELS[resumeTarget.type]}` : 'No active task'}</span>
            {resumeTarget && (
              <button
                className="btn-icon"
                style={{ width: 24, height: 24 }}
                onClick={resume}
                title="Resume last task"
                aria-label="Resume"
              >
                <Icon name="play" size={13}/>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="topbar-actions">
        <button className="search-trigger" onClick={openSearch}>
          <Icon name="search" size={14} />
          <span>Search stories, sprints…</span>
          <span className="kbd-group"><span className="kbd">Ctrl</span><span className="kbd">K</span></span>
        </button>

        <button className="btn btn-ghost" onClick={onOpenPrioritize}>
          <Icon name="sliders" size={14}/> Prioritize
        </button>
        <button className="btn btn-ghost" onClick={onExport}>
          <Icon name="download" size={14}/> Export
        </button>
        <button className="btn btn-ghost" onClick={onOpenTimesheet}>
          <Icon name="clock" size={14}/> Timesheet
        </button>
        <button className="btn btn-ghost" onClick={onOpenImport}>
          <Icon name="upload" size={14}/> Import
        </button>
        <button className="btn btn-ghost" onClick={onOpenSetup}>
          <Icon name="settings" size={14}/> Setup
        </button>

        <div className="divider-v" />

        <button
          className="theme-pill"
          onClick={toggle}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          <span className={`theme-pill-icon ${theme}`}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15}/>
          </span>
        </button>
      </div>
    </header>
  )
}
