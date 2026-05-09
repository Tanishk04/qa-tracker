import Papa from 'papaparse'
import type { ActivityLog, AppSettings, Developer, Release, Task, UserStory } from './types'
import { computeTaskSeconds, fmtDuration } from './time'
import { TASK_LABELS, TASK_ORDER } from './types'

export function exportStoriesCSV(
  stories: UserStory[],
  tasks: Task[],
  logs: ActivityLog[],
) {
  const rows = stories.map(s => {
    const ts = tasks.filter(t => t.us_pk === s.id)
    const totalSec = ts.reduce((acc, t) => acc + computeTaskSeconds(t, logs), 0)
    const done = ts.filter(t => t.status === 'done' || t.status === 'skipped').length
    const pct = ts.length ? Math.round((done / ts.length) * 100) : 0
    const taskCols: Record<string, string> = {}
    for (const type of TASK_ORDER) {
      const t = ts.find(x => x.type === type)
      const seconds = t ? computeTaskSeconds(t, logs) : 0
      taskCols[`${TASK_LABELS[type]} status`] = t?.status ?? ''
      taskCols[`${TASK_LABELS[type]} time`] = t ? fmtDuration(seconds) : ''
    }
    return {
      us_id: s.us_id,
      title: s.title,
      stage: s.stage,
      release: s.release_label ?? '',
      track: s.release_track ?? '',
      pinned: s.pinned ? 'Y' : '',
      archived: s.archived ? 'Y' : '',
      priority: s.priority ?? '',
      complexity: s.complexity ?? '',
      priority_rank: s.priority_rank ?? '',
      sf_status: s.sf_status ?? '',
      developer: s.developer ?? '',
      progress_pct: pct,
      total_time: fmtDuration(totalSec),
      total_seconds: totalSec,
      created_at: s.created_at,
      updated_at: s.updated_at,
      ...taskCols,
    }
  })
  const csv = Papa.unparse(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const ymd = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `qa-tracker-${ymd}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Export every row owned by the current user as a single JSON file.
 * Useful as an off-Supabase backup before destructive admin actions.
 */
export function exportFullBackupJSON(payload: {
  stories: UserStory[]
  tasks: Task[]
  logs: ActivityLog[]
  developers: Developer[]
  releases: Release[]
  settings: AppSettings | null
}) {
  const ymd = new Date().toISOString().slice(0, 10)
  const body = JSON.stringify({
    exported_at: new Date().toISOString(),
    schema_version: 7,
    counts: {
      stories: payload.stories.length,
      tasks: payload.tasks.length,
      activity_logs: payload.logs.length,
      developers: payload.developers.length,
      releases: payload.releases.length,
    },
    ...payload,
  }, null, 2)
  const blob = new Blob([body], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `qa-tracker-backup-${ymd}.json`
  a.click()
  URL.revokeObjectURL(url)
}
