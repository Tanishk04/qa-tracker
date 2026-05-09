import { useMemo } from 'react'
import { useStories, useTasks, useLogs } from '../hooks/useData'
import { computeTaskSeconds, fmtDuration, startOfTodayISO } from '../lib/time'
import { useTick } from '../hooks/useTick'
import { useFilter } from '../hooks/useFilter'
import { useSettings } from '../hooks/useSettings'
import { isStoryStuck } from '../lib/stage'
import { Icon } from './Icon'

function Sparkline({ values, color = 'var(--accent)' }: { values: number[]; color?: string }) {
  if (values.length < 2) return null
  const w = 64, h = 22, pad = 2
  const min = Math.min(...values), max = Math.max(...values)
  const span = Math.max(1, max - min)
  const step = (w - pad * 2) / (values.length - 1)
  const pts = values.map((v, i) => {
    const x = pad + i * step
    const y = h - pad - ((v - min) / span) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg className="stat-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface StatProps {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  icon: any
  spark?: number[]
  sparkColor?: string
}
function Stat({ label, value, sub, icon, spark, sparkColor }: StatProps) {
  return (
    <div className="stat">
      <div className="stat-head">
        <span>{label}</span>
        <span className="stat-icon"><Icon name={icon} size={12}/></span>
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
      {spark && <Sparkline values={spark} color={sparkColor}/>}
    </div>
  )
}

export function Dashboard() {
  useTick(15_000)
  const { data: stories = [] } = useStories()
  const { data: tasks = [] } = useTasks()
  const { data: logs = [] } = useLogs()
  const { applies, filter } = useFilter()
  const { data: settings } = useSettings()
  const stuckOpts = settings ? {
    defaultHours: settings.stuck_default_hours,
    quickHitHours: settings.stuck_quickhit_hours,
    majorHours: settings.stuck_major_hours,
  } : undefined

  const scoped = useMemo(() => stories.filter(applies), [stories, applies])
  const scopedIds = useMemo(() => new Set(scoped.map(s => s.id)), [scoped])
  const scopedTasks = useMemo(() => tasks.filter(t => scopedIds.has(t.us_pk)), [tasks, scopedIds])

  const stats = useMemo(() => {
    const total = scoped.length
    const completed = scoped.filter(s => s.stage === 'completed').length
    const pct = total ? Math.round((completed / total) * 100) : 0

    // Per-day spark for last 7 days (time tracked & story-touched & completed)
    const days: { ts: number; sec: number; touched: Set<string>; done: number }[] = []
    const today = new Date(startOfTodayISO()).getTime()
    for (let i = 6; i >= 0; i--) {
      days.push({ ts: today - i * 86400_000, sec: 0, touched: new Set(), done: 0 })
    }
    function bucket(ts: number) {
      const d = new Date(ts); d.setHours(0, 0, 0, 0)
      const idx = days.findIndex(b => b.ts === d.getTime())
      return idx >= 0 ? days[idx] : null
    }

    const tasksById = new Map(scopedTasks.map(t => [t.id, t]))
    const byTask = new Map<string, typeof logs>()
    for (const l of logs) {
      if (!tasksById.has(l.task_id)) continue
      const arr = byTask.get(l.task_id) ?? []; arr.push(l); byTask.set(l.task_id, arr)
    }
    const now = Date.now()
    let secondsToday = 0
    for (const [tid, ls] of byTask) {
      const t = tasksById.get(tid); if (!t) continue
      const sorted = [...ls].sort((a, b) => +new Date(a.ts) - +new Date(b.ts))
      let openStart: number | null = null
      const addInterval = (a: number, b: number) => {
        if (b <= a) return
        let cur = a
        while (cur < b) {
          const d = new Date(cur); d.setHours(0, 0, 0, 0)
          const dayEnd = d.getTime() + 86400_000
          const slice = Math.min(b, dayEnd)
          const bk = bucket(d.getTime())
          if (bk) {
            bk.sec += (slice - cur) / 1000
            bk.touched.add(t.us_pk)
            if (d.getTime() === today) secondsToday += (slice - cur) / 1000
          }
          cur = slice
        }
      }
      for (const l of sorted) {
        const ts = +new Date(l.ts)
        if (l.action === 'STARTED') openStart = ts
        else if ((l.action === 'PAUSED' || l.action === 'COMPLETED') && openStart != null) {
          if (l.action === 'COMPLETED') {
            const bk = bucket(ts); if (bk) bk.done += 1
          }
          addInterval(openStart, ts); openStart = null
        }
      }
      if (openStart != null && t.status === 'in_progress') addInterval(openStart, now)
    }

    const stuck = scoped.filter(s => isStoryStuck(s, stuckOpts))

    return {
      total, completed, pct, secondsToday, stuck,
      sparkTime: days.map(d => Math.round(d.sec / 60)),
      sparkDone: days.map(d => d.done),
      sparkTotal: days.map((_, i) => Math.max(1, total - (6 - i))),
    }
  }, [scoped, scopedTasks, logs, stuckOpts])

  type Bucket = {
    total: number; done: number; sec: number;
    major: number; qh1: number; qh2: number;
  }
  const releaseBreakdown = useMemo(() => {
    // Always compute. When a single release is filtered, show just that row.
    const map = new Map<string, Bucket>()
    for (const s of scoped) {
      const key = s.release_label ?? '— No release —'
      const m = map.get(key) ?? { total: 0, done: 0, sec: 0, major: 0, qh1: 0, qh2: 0 }
      m.total += 1
      if (s.stage === 'completed') m.done += 1
      if (s.release_track === 'qh1') m.qh1 += 1
      else if (s.release_track === 'qh2') m.qh2 += 1
      else m.major += 1
      const tt = scopedTasks.filter(t => t.us_pk === s.id)
      m.sec += tt.reduce((sum, t) => sum + computeTaskSeconds(t, logs), 0)
      map.set(key, m)
    }
    return Array.from(map.entries())
      .map(([label, m]) => ({ label, ...m, pct: m.total ? Math.round((m.done / m.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)
  }, [scoped, scopedTasks, logs, filter.release])

  return (
    <>
      <div className="stats">
        <Stat label="Total US" value={stats.total} sub="Across visible filters" icon="list"
          spark={stats.sparkTotal} sparkColor="var(--text-dim)" />
        <Stat label="Completed" value={`${stats.pct}%`} sub={`${stats.completed} of ${stats.total}`} icon="check"
          spark={stats.sparkDone} sparkColor="oklch(0.74 0.11 150)" />
        <Stat label="Time today" value={fmtDuration(Math.floor(stats.secondsToday))} sub="Across visible US" icon="timer"
          spark={stats.sparkTime} />
        <Stat label="Stuck" value={stats.stuck.length}
          sub={stats.stuck.length === 0 ? 'None — keep it up' : stats.stuck.slice(0, 3).map(s => s.us_id).join(', ')}
          icon="flame"
          spark={stats.stuck.length > 0 ? [0, 0, 1, 0, 0, 1, stats.stuck.length] : undefined}
          sparkColor="oklch(0.70 0.16 25)" />
      </div>

      {releaseBreakdown.length > 0 && (
        <div className="release-card">
          <div className="release-head">
            <span>By release</span>
            <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>Major + QH1 + QH2 per release</span>
          </div>
          {releaseBreakdown.map(r => (
            <div key={r.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div className="release-row">
                <div className="release-name" title={r.label}>
                  {r.label.length > 22 ? r.label.slice(0, 22) + '…' : r.label}
                </div>
                <div className="release-bar"><div className="release-fill" style={{ width: `${r.pct}%` }} /></div>
                <div className="release-meta">{r.done}/{r.total} · {r.pct}%</div>
                <div className="release-meta" style={{ color: 'var(--text-dim)' }}>{fmtDuration(Math.floor(r.sec))}</div>
              </div>
              <div style={{
                display: 'flex', gap: 14, padding: '0 0 2px 14px',
                fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
              }}>
                <span>Major <span style={{ color: 'var(--text)' }}>{r.major}</span></span>
                <span>QH1 <span style={{ color: 'var(--accent)' }}>{r.qh1}</span></span>
                <span>QH2 <span style={{ color: 'var(--accent)' }}>{r.qh2}</span></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
