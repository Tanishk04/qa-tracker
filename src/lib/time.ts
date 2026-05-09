import type { ActivityLog, Task } from './types'

/**
 * Compute total seconds spent on a task by walking its activity logs.
 * Handles back-and-forth (Done → In Progress → Done) by treating each
 * STARTED → (PAUSED|COMPLETED) pair as a separate interval.
 * If task is currently in_progress, includes (now - last STARTED).
 */
/**
 * Returns the breakdown components: tracked seconds (from real intervals)
 * and adjustment seconds (the `manual_adjust_seconds` column). Total = tracked + adjust.
 */
export function computeTaskBreakdown(task: Task, logs: ActivityLog[], now = Date.now()): {
  trackedSec: number
  adjustSec: number
  totalSec: number
} {
  const sorted = logs
    .filter(l => l.task_id === task.id)
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())

  let tracked = 0
  let openStart: number | null = null
  for (const l of sorted) {
    if (l.action === 'STARTED') openStart = new Date(l.ts).getTime()
    else if ((l.action === 'PAUSED' || l.action === 'COMPLETED') && openStart != null) {
      tracked += (new Date(l.ts).getTime() - openStart) / 1000
      openStart = null
    }
  }
  if (openStart != null && task.status === 'in_progress') {
    tracked += (now - openStart) / 1000
  }
  const trackedSec = Math.max(0, Math.floor(tracked))
  const adjustSec = task.manual_adjust_seconds || 0
  return {
    trackedSec,
    adjustSec,
    totalSec: Math.max(0, trackedSec + adjustSec),
  }
}

/**
 * Build a tooltip-friendly breakdown string. Multi-line, plain-text,
 * works inside an HTML `title` attribute.
 */
export function fmtTaskBreakdownTooltip(task: Task, logs: ActivityLog[]): string {
  const { trackedSec, adjustSec, totalSec } = computeTaskBreakdown(task, logs)
  const lines = [
    `Tracked: ${fmtDuration(trackedSec)}`,
  ]
  if (adjustSec !== 0) {
    const sign = adjustSec > 0 ? '+' : '−'
    lines.push(`Adjusted: ${sign}${fmtDuration(Math.abs(adjustSec))}`)
  }
  lines.push(`Total: ${fmtDuration(totalSec)}`)
  return lines.join('\n')
}

export function computeTaskSeconds(task: Task, logs: ActivityLog[], now = Date.now()): number {
  const sorted = logs
    .filter(l => l.task_id === task.id)
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())

  let total = 0
  let openStart: number | null = null
  for (const l of sorted) {
    if (l.action === 'STARTED') openStart = new Date(l.ts).getTime()
    else if ((l.action === 'PAUSED' || l.action === 'COMPLETED') && openStart != null) {
      total += (new Date(l.ts).getTime() - openStart) / 1000
      openStart = null
    }
  }
  if (openStart != null && task.status === 'in_progress') {
    total += (now - openStart) / 1000
  }
  return Math.max(0, Math.floor(total)) + (task.manual_adjust_seconds || 0)
}

export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

export function fmtDurationLong(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
}

export function startOfTodayISO(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}
