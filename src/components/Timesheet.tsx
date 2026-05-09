import { useMemo, useState } from 'react'
import { useStories, useTasks, useLogs } from '../hooks/useData'
import { TASK_LABELS } from '../lib/types'
import { fmtDuration } from '../lib/time'
import { Icon } from './Icon'

interface DayBucket {
  date: string
  total: number
  perStory: Record<string, { sec: number; us_id: string; title: string; perTask: Record<string, number> }>
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function Timesheet({ onClose }: { onClose: () => void }) {
  const [days, setDays] = useState(7)
  const { data: stories = [] } = useStories()
  const { data: tasks = [] } = useTasks()
  const { data: logs = [] } = useLogs()

  const buckets = useMemo<DayBucket[]>(() => {
    const start = new Date(); start.setDate(start.getDate() - (days - 1)); start.setHours(0, 0, 0, 0)
    const startMs = start.getTime()
    const map: Record<string, DayBucket> = {}
    for (let i = 0; i < days; i++) {
      const d = new Date(startMs + i * 86400_000); const k = ymd(d)
      map[k] = { date: k, total: 0, perStory: {} }
    }
    const tasksById = new Map(tasks.map(t => [t.id, t]))
    const storyById = new Map(stories.map(s => [s.id, s]))
    const byTask = new Map<string, typeof logs>()
    for (const l of logs) {
      const arr = byTask.get(l.task_id) ?? []; arr.push(l); byTask.set(l.task_id, arr)
    }
    const now = Date.now()
    for (const [tid, ls] of byTask) {
      const t = tasksById.get(tid); if (!t) continue
      const story = storyById.get(t.us_pk); if (!story) continue
      const tt = t; const ss = story
      const sorted = [...ls].sort((a, b) => +new Date(a.ts) - +new Date(b.ts))
      let openStart: number | null = null
      function addInterval(a: number, b: number) {
        if (b <= a) return
        let cur = a
        while (cur < b) {
          const d = new Date(cur); d.setHours(0, 0, 0, 0)
          const dayEnd = d.getTime() + 86400_000
          const slice = Math.min(b, dayEnd)
          const k = ymd(d)
          if (k in map) {
            const bucket = map[k]
            bucket.total += (slice - cur) / 1000
            const ent = bucket.perStory[ss.id] ??= {
              sec: 0, us_id: ss.us_id, title: ss.title, perTask: {},
            }
            ent.sec += (slice - cur) / 1000
            ent.perTask[tt.type] = (ent.perTask[tt.type] ?? 0) + (slice - cur) / 1000
          }
          cur = slice
        }
      }
      for (const l of sorted) {
        const ts = +new Date(l.ts)
        if (l.action === 'STARTED') openStart = ts
        else if ((l.action === 'PAUSED' || l.action === 'COMPLETED') && openStart != null) {
          addInterval(openStart, ts); openStart = null
        }
      }
      if (openStart != null && tt.status === 'in_progress') addInterval(openStart, now)
    }
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
  }, [stories, tasks, logs, days])

  const grandTotal = buckets.reduce((s, b) => s + b.total, 0)

  return (
    <div className="modal-back">
      <div className="modal" style={{ width: 920, height: '80vh', maxHeight: 720 }}>
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Icon name="clock" size={16}/>
            <div className="modal-title">Timesheet</div>
            <select className="select" value={days} onChange={e => setDays(parseInt(e.target.value, 10))}>
              <option value={1}>Today</option>
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
            </select>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Total: <strong className="mono" style={{ color: 'var(--text)' }}>{fmtDuration(Math.floor(grandTotal))}</strong>
            </span>
          </div>
          <button className="btn-icon" onClick={onClose}><Icon name="x" size={16}/></button>
        </div>
        <div className="modal-body">
          {buckets.slice().reverse().map(b => {
            const entries = Object.values(b.perStory).sort((a, b) => b.sec - a.sec)
            return (
              <div key={b.date} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'baseline' }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{b.date}</div>
                  <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {fmtDuration(Math.floor(b.total))}
                  </div>
                </div>
                {entries.length === 0 ? (
                  <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</div>
                ) : (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    {entries.map((e, i) => (
                      <div key={e.us_id}
                        style={{
                          padding: '8px 12px',
                          borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                          display: 'flex', gap: 12, alignItems: 'flex-start',
                        }}>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)', width: 80, flexShrink: 0 }}>
                          {e.us_id}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {e.title}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                            {Object.entries(e.perTask).map(([type, sec]) => (
                              <span key={type}>
                                {TASK_LABELS[type as keyof typeof TASK_LABELS]}: <span className="mono">{fmtDuration(Math.floor(sec))}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                        <span className="mono" style={{ fontSize: 12, color: 'var(--text)', flexShrink: 0 }}>
                          {fmtDuration(Math.floor(e.sec))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
