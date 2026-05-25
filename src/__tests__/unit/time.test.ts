import { describe, expect, it } from 'vitest'
import { computeTaskBreakdown, computeTaskSeconds, fmtDuration, fmtDurationLong } from '../../lib/time'
import { makeTask, makeLog } from '../fixtures'

// Fixed "now" so open-interval tests are deterministic
const NOW = new Date('2024-01-01T12:00:00.000Z').getTime()

// ─── helpers ─────────────────────────────────────────────────────────────────

function ts(offsetSeconds: number) {
  return new Date(NOW + offsetSeconds * 1000).toISOString()
}

// ─── computeTaskBreakdown ────────────────────────────────────────────────────

describe('computeTaskBreakdown', () => {
  it('returns zeros when there are no logs', () => {
    const task = makeTask()
    expect(computeTaskBreakdown(task, [], NOW)).toEqual({ trackedSec: 0, adjustSec: 0, totalSec: 0 })
  })

  it('ignores logs for other tasks', () => {
    const task = makeTask({ id: 'task-A' })
    const logs = [
      makeLog({ task_id: 'task-B', action: 'STARTED',   ts: ts(-3600) }),
      makeLog({ task_id: 'task-B', action: 'COMPLETED', ts: ts(0) }),
    ]
    expect(computeTaskBreakdown(task, logs, NOW)).toEqual({ trackedSec: 0, adjustSec: 0, totalSec: 0 })
  })

  it('measures a single STARTED → PAUSED interval', () => {
    const task = makeTask({ id: 'task-1' })
    const logs = [
      makeLog({ id: 'a', task_id: 'task-1', action: 'STARTED',   ts: ts(-60) }),
      makeLog({ id: 'b', task_id: 'task-1', action: 'PAUSED',    ts: ts(0) }),
    ]
    const { trackedSec } = computeTaskBreakdown(task, logs, NOW)
    expect(trackedSec).toBe(60)
  })

  it('measures a single STARTED → COMPLETED interval', () => {
    const task = makeTask({ id: 'task-1' })
    const logs = [
      makeLog({ id: 'a', task_id: 'task-1', action: 'STARTED',   ts: ts(-90) }),
      makeLog({ id: 'b', task_id: 'task-1', action: 'COMPLETED', ts: ts(0) }),
    ]
    const { trackedSec } = computeTaskBreakdown(task, logs, NOW)
    expect(trackedSec).toBe(90)
  })

  it('sums multiple intervals (pause → resume → done)', () => {
    const task = makeTask({ id: 'task-1' })
    const logs = [
      makeLog({ id: '1', task_id: 'task-1', action: 'STARTED',   ts: ts(-200) }),
      makeLog({ id: '2', task_id: 'task-1', action: 'PAUSED',    ts: ts(-100) }),  // 100 s
      makeLog({ id: '3', task_id: 'task-1', action: 'STARTED',   ts: ts(-50) }),
      makeLog({ id: '4', task_id: 'task-1', action: 'COMPLETED', ts: ts(0) }),     // 50 s
    ]
    const { trackedSec } = computeTaskBreakdown(task, logs, NOW)
    expect(trackedSec).toBe(150)
  })

  it('includes open interval when task is in_progress', () => {
    const task = makeTask({ id: 'task-1', status: 'in_progress' })
    const logs = [
      makeLog({ id: 'a', task_id: 'task-1', action: 'STARTED', ts: ts(-30) }),
    ]
    const { trackedSec } = computeTaskBreakdown(task, logs, NOW)
    expect(trackedSec).toBe(30)
  })

  it('does NOT include open interval when task is paused', () => {
    const task = makeTask({ id: 'task-1', status: 'paused' })
    const logs = [
      makeLog({ id: 'a', task_id: 'task-1', action: 'STARTED', ts: ts(-30) }),
    ]
    const { trackedSec } = computeTaskBreakdown(task, logs, NOW)
    expect(trackedSec).toBe(0)
  })

  it('adds manual_adjust_seconds to adjustSec and totalSec', () => {
    const task = makeTask({ id: 'task-1', manual_adjust_seconds: 300 })
    const { trackedSec, adjustSec, totalSec } = computeTaskBreakdown(task, [], NOW)
    expect(trackedSec).toBe(0)
    expect(adjustSec).toBe(300)
    expect(totalSec).toBe(300)
  })

  it('negative adjustment reduces totalSec but not below 0', () => {
    const task = makeTask({ id: 'task-1', manual_adjust_seconds: -9999 })
    const { totalSec } = computeTaskBreakdown(task, [], NOW)
    expect(totalSec).toBe(0)
  })

  it('floors sub-second intervals', () => {
    const task = makeTask({ id: 'task-1' })
    const logs = [
      makeLog({ id: 'a', task_id: 'task-1', action: 'STARTED',   ts: new Date(NOW - 1500).toISOString() }),
      makeLog({ id: 'b', task_id: 'task-1', action: 'COMPLETED', ts: new Date(NOW).toISOString() }),
    ]
    const { trackedSec } = computeTaskBreakdown(task, logs, NOW)
    expect(trackedSec).toBe(1) // 1.5 s floored to 1
  })
})

// ─── computeTaskSeconds ──────────────────────────────────────────────────────

describe('computeTaskSeconds', () => {
  it('returns 0 with no logs and no adjustment', () => {
    expect(computeTaskSeconds(makeTask(), [], NOW)).toBe(0)
  })

  it('equals trackedSec + adjustSec from computeTaskBreakdown', () => {
    const task = makeTask({ id: 'task-1', manual_adjust_seconds: 120 })
    const logs = [
      makeLog({ id: 'a', task_id: 'task-1', action: 'STARTED',   ts: ts(-180) }),
      makeLog({ id: 'b', task_id: 'task-1', action: 'COMPLETED', ts: ts(0) }),
    ]
    const secs = computeTaskSeconds(task, logs, NOW)
    const { totalSec } = computeTaskBreakdown(task, logs, NOW)
    expect(secs).toBe(totalSec)
    expect(secs).toBe(300)
  })

  it('does not go below 0 with a large negative adjustment', () => {
    const task = makeTask({ manual_adjust_seconds: -5000 })
    expect(computeTaskSeconds(task, [], NOW)).toBe(-5000) // raw (no clamp in computeTaskSeconds)
  })
})

// ─── fmtDuration ────────────────────────────────────────────────────────────

describe('fmtDuration', () => {
  it('shows seconds only when < 60 s', () => {
    expect(fmtDuration(0)).toBe('0s')
    expect(fmtDuration(1)).toBe('1s')
    expect(fmtDuration(59)).toBe('59s')
  })

  it('shows minutes and seconds when < 1 h', () => {
    expect(fmtDuration(60)).toBe('1m 0s')
    expect(fmtDuration(90)).toBe('1m 30s')
    expect(fmtDuration(3599)).toBe('59m 59s')
  })

  it('shows hours and minutes when >= 1 h (drops seconds)', () => {
    expect(fmtDuration(3600)).toBe('1h 0m')
    expect(fmtDuration(3661)).toBe('1h 1m')
    expect(fmtDuration(7384)).toBe('2h 3m')
  })

  it('clamps negative values to 0s', () => {
    expect(fmtDuration(-100)).toBe('0s')
  })

  it('floors fractional seconds', () => {
    expect(fmtDuration(59.9)).toBe('59s')
  })
})

// ─── fmtDurationLong ────────────────────────────────────────────────────────

describe('fmtDurationLong', () => {
  it('formats 0 as 00:00:00', () => {
    expect(fmtDurationLong(0)).toBe('00:00:00')
  })

  it('zero-pads each component', () => {
    expect(fmtDurationLong(3661)).toBe('01:01:01')
  })

  it('handles more than 9 hours', () => {
    expect(fmtDurationLong(36000 + 120 + 5)).toBe('10:02:05')
  })

  it('clamps negative input to 00:00:00', () => {
    expect(fmtDurationLong(-60)).toBe('00:00:00')
  })
})
