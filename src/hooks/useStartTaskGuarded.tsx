import { useQueryClient } from '@tanstack/react-query'
import { rpcStartTask } from '../lib/api'
import type { Task } from '../lib/types'
import { TASK_LABELS } from '../lib/types'
import { useTasks, useStories } from './useData'
import { useDialog } from '../components/Dialog'

/**
 * Returns a `start(taskId)` function that — if another task is currently
 * running — first asks the user to confirm before stopping it and starting
 * the new one. The DB-side `start_task` RPC is atomic, so the actual
 * stop/start is single-step; this hook only adds the user gate.
 */
export function useStartTaskGuarded() {
  const qc = useQueryClient()
  const dialog = useDialog()
  const { data: tasks = [] } = useTasks()
  const { data: stories = [] } = useStories()

  function inv() {
    qc.invalidateQueries({ queryKey: ['tasks'] })
    qc.invalidateQueries({ queryKey: ['logs'] })
  }

  /**
   * Start the given task. If another is running, prompts first.
   * Returns true if the task was started, false if user cancelled.
   */
  return async function start(taskId: string): Promise<boolean> {
    const target = tasks.find(t => t.id === taskId) as Task | undefined
    if (!target) return false
    // If the same task is somehow already running, no-op.
    if (target.status === 'in_progress') return false

    const running = tasks.find(t => t.status === 'in_progress' && t.id !== taskId)
    if (running) {
      const runUs = stories.find(s => s.id === running.us_pk)
      const newUs = stories.find(s => s.id === target.us_pk)
      const ok = await dialog.confirm({
        title: 'Switch active task?',
        body: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Currently running:</span>{' '}
              <span className="mono">{runUs?.us_id ?? '?'}</span>{' '}
              <span style={{ color: 'var(--text-muted)' }}>·</span>{' '}
              <strong>{TASK_LABELS[running.type]}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Will start:</span>{' '}
              <span className="mono">{newUs?.us_id ?? '?'}</span>{' '}
              <span style={{ color: 'var(--text-muted)' }}>·</span>{' '}
              <strong>{TASK_LABELS[target.type]}</strong>
            </div>
            <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 4 }}>
              The current task will be paused. You can resume it later.
            </div>
          </div>
        ),
        confirmLabel: 'Pause & Start',
      })
      if (!ok) return false
    }

    await rpcStartTask(taskId)
    inv()
    return true
  }
}
