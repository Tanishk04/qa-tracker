import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTasks, useStories } from '../hooks/useData'
import { useSettings } from '../hooks/useSettings'
import { TASK_LABELS } from '../lib/types'
import { rpcPauseCurrent } from '../lib/api'
import { Icon } from './Icon'

export function IdleReminder() {
  const qc = useQueryClient()
  const lastActivity = useRef<number>(Date.now())
  const [show, setShow] = useState(false)
  const { data: tasks = [] } = useTasks()
  const { data: stories = [] } = useStories()
  const { data: settings } = useSettings()

  const active = tasks.find(t => t.status === 'in_progress')
  const story = active ? stories.find(s => s.id === active.us_pk) : null

  useEffect(() => {
    const bump = () => { lastActivity.current = Date.now(); setShow(false) }
    const evts = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart']
    evts.forEach(e => window.addEventListener(e, bump, { passive: true }))
    return () => evts.forEach(e => window.removeEventListener(e, bump))
  }, [])

  useEffect(() => {
    if (!active || !settings) return
    const id = setInterval(() => {
      const idleMs = Date.now() - lastActivity.current
      if (idleMs > settings.idle_minutes * 60_000) setShow(true)
    }, 30_000)
    return () => clearInterval(id)
  }, [active, settings])

  if (!show || !active || !settings) return null

  async function pause() {
    await rpcPauseCurrent()
    qc.invalidateQueries({ queryKey: ['tasks'] })
    qc.invalidateQueries({ queryKey: ['logs'] })
    setShow(false)
  }

  return (
    <div style={{
      position: 'fixed', right: 24, bottom: 24, zIndex: 35,
      background: 'var(--bg-elev)', border: '1px solid oklch(0.78 0.13 80 / 0.4)',
      borderRadius: 10, padding: 14, maxWidth: 320,
      boxShadow: 'var(--shadow-lg)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Icon name="flame" size={14} className="text-warn"/>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'oklch(0.82 0.13 80)' }}>Still working?</div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
        No activity for {settings.idle_minutes}m. <span className="mono">{story?.us_id}</span> → {TASK_LABELS[active.type]} is still running.
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-outline" onClick={pause}>Pause it</button>
        <button className="btn btn-primary" onClick={() => setShow(false)}>Keep going</button>
      </div>
    </div>
  )
}
