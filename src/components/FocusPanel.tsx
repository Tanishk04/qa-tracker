import { useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useStories, useTasks, useLogs } from '../hooks/useData'
import { TASK_LABELS, type UserStory } from '../lib/types'
import { computeTaskSeconds, fmtDuration, startOfTodayISO } from '../lib/time'
import { rpcPauseCurrent, updatePinned } from '../lib/api'
import { useStartTaskGuarded } from '../hooks/useStartTaskGuarded'
import { useTick } from '../hooks/useTick'
import { useDevelopers } from '../hooks/useSettings'
import { devDisplay, resolveDev } from '../lib/developer'
import { Icon } from './Icon'

import { Avatar } from './Avatar'

const openStory = (s: UserStory) =>
  window.dispatchEvent(new CustomEvent('app:open-story', { detail: s.id }))

export function FocusPanel({ onHide, open = true }: { onHide: () => void; open?: boolean }) {
  useTick(1000)
  const qc = useQueryClient()
  const startTask = useStartTaskGuarded()
  const { data: stories = [] } = useStories()
  const { data: tasks = [] } = useTasks()
  const { data: logs = [] } = useLogs()
  const { data: devs = [] } = useDevelopers()

  const today = useMemo(() => {
    const dayStart = new Date(startOfTodayISO()).getTime()
    let sec = 0; const touched = new Set<string>(); let completed = 0
    const tasksById = new Map(tasks.map(t => [t.id, t]))
    for (const l of logs) {
      const ts = +new Date(l.ts)
      if (ts < dayStart) continue
      const t = tasksById.get(l.task_id); if (!t) continue
      if (l.action === 'COMPLETED') completed += 1
      touched.add(t.us_pk)
    }
    // accumulate active intervals on logs
    const byTask = new Map<string, typeof logs>()
    for (const l of logs) {
      const arr = byTask.get(l.task_id) ?? []; arr.push(l); byTask.set(l.task_id, arr)
    }
    const now = Date.now()
    for (const [tid, ls] of byTask) {
      const t = tasksById.get(tid); if (!t) continue
      const sorted = [...ls].sort((a, b) => +new Date(a.ts) - +new Date(b.ts))
      let openStart: number | null = null
      for (const l of sorted) {
        const ts = +new Date(l.ts)
        if (l.action === 'STARTED') openStart = ts
        else if ((l.action === 'PAUSED' || l.action === 'COMPLETED') && openStart != null) {
          const a = Math.max(openStart, dayStart)
          if (ts > a) sec += (ts - a) / 1000
          openStart = null
        }
      }
      if (openStart != null && t.status === 'in_progress') {
        const a = Math.max(openStart, dayStart)
        sec += (now - a) / 1000
      }
    }
    return { time: fmtDuration(Math.floor(sec)), touched: touched.size, completed }
  }, [tasks, logs])

  // Don't memoize on a tick — recompute each render so the timer ticks live.
  const pinned = stories.filter(s => s.pinned && !s.archived).map(s => {
    const ts = tasks.filter(t => t.us_pk === s.id).sort((a, b) => a.order_index - b.order_index)
    const running = ts.find(t => t.status === 'in_progress')
    const next = ts.find(t => t.status !== 'done' && t.status !== 'skipped' && t.status !== 'in_progress')
    const totalSec = ts.reduce((acc, t) => acc + computeTaskSeconds(t, logs), 0)
    return { story: s, running, next, totalSec }
  })

  // Suggestion: top non-archived story by stuck/oldest activity that's not completed
  const suggestion = useMemo(() => {
    if (pinned.length > 0) return null
    return stories
      .filter(s => !s.archived && !s.pinned && s.stage !== 'completed')
      .sort((a, b) => +new Date(a.updated_at) - +new Date(b.updated_at))[0]
  }, [stories, pinned.length])

  async function startNext(taskId: string) {
    await startTask(taskId)
  }
  async function pauseRunning() {
    await rpcPauseCurrent()
    qc.invalidateQueries({ queryKey: ['tasks'] })
    qc.invalidateQueries({ queryKey: ['logs'] })
  }
  async function pinStory(id: string) {
    await updatePinned(id, true)
    qc.invalidateQueries({ queryKey: ['stories'] })
  }
  async function unpin(id: string) {
    await updatePinned(id, false)
    qc.invalidateQueries({ queryKey: ['stories'] })
  }

  return (
    <aside className={`focus ${open ? 'open' : ''}`}>
      <div className="focus-head">
        <div className="focus-title">
          <Icon name="target" size={14}/>
          Today's Focus
        </div>
        <button className="btn-icon" onClick={onHide} aria-label="Hide">
          <Icon name="x" size={14}/>
        </button>
      </div>

      <div className="today-summary">
        <div className="today-row"><span className="label">Tracked today</span><span className="val">{today.time}</span></div>
        <div className="today-row"><span className="label">Stories touched</span><span className="val">{today.touched}</span></div>
        <div className="today-row"><span className="label">Tasks completed</span><span className="val">{today.completed}</span></div>
      </div>

      <div className="focus-body">
        {pinned.length === 0 && !suggestion && (
          <div className="focus-empty">
            <div className="icon-tile"><Icon name="star" size={20}/></div>
            <div>
              <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Nothing pinned yet</div>
              <div style={{ fontSize: 12 }}>Pin stories with the ★ to focus on them here.</div>
            </div>
          </div>
        )}

        {pinned.length > 0 && (
          <>
            <div className="focus-suggestion-head">Pinned</div>
            {pinned.map(({ story, running, next, totalSec }) => {
              const dn = devDisplay(story.developer, devs)
              const dev = resolveDev(story.developer, devs)
              return (
                <div key={story.id} className="focus-suggestion">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span className="card-id mono">{story.us_id}</span>
                    {story.complexity && <span className={`cx-pill cx-${story.complexity}`}>{story.complexity}</span>}
                    {running && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--accent)' }}>
                        <span className="pulse" style={{ width: 5, height: 5, background: 'var(--accent)', borderRadius: '50%' }} />
                        running
                      </span>
                    )}
                    <button className="btn-icon" style={{ width: 22, height: 22, marginLeft: 'auto' }}
                      onClick={() => unpin(story.id)} aria-label="Unpin">
                      <Icon name="x" size={12}/>
                    </button>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.35, marginBottom: 8, cursor: 'pointer' }}
                    onClick={() => openStory(story)}>
                    {story.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                    <Icon name="clock" size={11}/>
                    <span className="mono" style={{ color: running ? 'var(--accent)' : undefined }}>{fmtDuration(totalSec)}</span>
                    <div style={{ flex: 1 }} />
                    {dn && <Avatar seed={dev?.avatar_seed ?? dn} name={dn} size={20}/>}
                  </div>
                  {running ? (
                    <button className="btn btn-outline" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                      onClick={pauseRunning}>
                      <Icon name="pause" size={12}/> Pause {TASK_LABELS[running.type]}
                    </button>
                  ) : next ? (
                    <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                      onClick={() => startNext(next.id)}>
                      <Icon name="play" size={12}/> Start {TASK_LABELS[next.type]}
                    </button>
                  ) : null}
                </div>
              )
            })}
          </>
        )}

        {pinned.length === 0 && suggestion && (
          <>
            <div className="focus-suggestion-head">Suggested next</div>
            <div className="focus-suggestion">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span className="card-id mono">{suggestion.us_id}</span>
                {suggestion.priority && <span className={`card-pri pri-medium`}>{suggestion.priority}</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.35, marginBottom: 8, cursor: 'pointer' }}
                onClick={() => openStory(suggestion)}>
                {suggestion.title}
              </div>
              <button className="btn btn-outline" style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => pinStory(suggestion.id)}>
                <Icon name="star" size={12}/> Pin to focus
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
