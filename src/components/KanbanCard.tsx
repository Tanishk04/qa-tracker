import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useQueryClient } from '@tanstack/react-query'
import type { Task, UserStory, ActivityLog, Complexity } from '../lib/types'
import { RELEASE_TRACK_LABELS, TASK_ORDER } from '../lib/types'
import { computeTaskSeconds, fmtDuration } from '../lib/time'
import { isStoryStuck } from '../lib/stage'
import { updatePinned, updateStoryFields } from '../lib/api'
import { useDevelopers, useSettings } from '../hooks/useSettings'
import { resolveDev, devDisplay } from '../lib/developer'
import { Icon } from './Icon'
import { Avatar } from './Avatar'
import { ComplexityChip } from './ComplexityChip'
import { useTick } from '../hooks/useTick'

interface Props {
  story: UserStory
  tasks: Task[]
  logs: ActivityLog[]
  onClick: () => void
  selected?: boolean
  onToggleSelect?: (e: React.MouseEvent) => void
}

export function KanbanCard({ story, tasks, logs, onClick, selected, onToggleSelect }: Props) {
  // Drives the running timer's per-second update. Required dep below.
  useTick(1000)
  const qc = useQueryClient()
  const { data: devs = [] } = useDevelopers()
  const { data: settings } = useSettings()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: story.id })

  // Compute fresh on every render so the running timer ticks each second.
  let totalSec = 0
  let hasActive = false
  for (const t of tasks) {
    totalSec += computeTaskSeconds(t, logs)
    if (t.status === 'in_progress') hasActive = true
  }
  const ordered = [...tasks].sort((a, b) => a.order_index - b.order_index)

  const stuck = isStoryStuck(story, settings ? {
    defaultHours: settings.stuck_default_hours,
    quickHitHours: settings.stuck_quickhit_hours,
    majorHours: settings.stuck_major_hours,
  } : undefined)

  const dev = resolveDev(story.developer, devs)
  const devName = devDisplay(story.developer, devs)

  async function togglePin(e: React.MouseEvent) {
    e.stopPropagation()
    await updatePinned(story.id, !story.pinned)
    qc.invalidateQueries({ queryKey: ['stories'] })
  }
  async function setComplexity(c: Complexity | null) {
    await updateStoryFields(story.id, { complexity: c } as any)
    qc.invalidateQueries({ queryKey: ['stories'] })
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: isDragging ? undefined : CSS.Translate.toString(transform) }}
      className={`qa-card ${isDragging ? 'dragging' : ''} ${selected ? 'selected' : ''} ${story.archived ? 'archived' : ''}`}
      onClick={(e) => {
        if (isDragging) return
        if ((e.shiftKey || e.metaKey || e.ctrlKey) && onToggleSelect) { onToggleSelect(e); return }
        onClick(); e.stopPropagation()
      }}
      {...listeners} {...attributes}
    >
      <div className="card-top">
        <button className={`card-pin ${story.pinned ? 'on' : ''}`} onClick={togglePin} aria-label="Pin">
          <Icon name="star" size={12} />
        </button>
        <span className="card-id mono">{story.us_id}</span>
        <ComplexityChip value={story.complexity} onChange={setComplexity} stopPropagation />
        {story.release_track && (
          <span className="card-pri" style={{
            flexShrink: 0,
            background: story.release_track === 'major' ? 'var(--bg-hover)' : 'var(--accent-soft)',
            color: story.release_track === 'major' ? 'var(--text-muted)' : 'var(--accent)',
          }}>{RELEASE_TRACK_LABELS[story.release_track]}</span>
        )}
        <span className={`card-time ${hasActive ? 'running' : ''}`} style={{ flexShrink: 0 }}>
          {hasActive && <Icon name="play" size={9}/>}
          {fmtDuration(totalSec)}
        </span>
      </div>

      <div className="card-title">{story.title}</div>

      <div className="pipeline" aria-label="Task pipeline">
        {TASK_ORDER.map(type => {
          const t = ordered.find(x => x.type === type)
          if (!t) return <span key={type} className="pipeline-step" />
          const cls =
            t.status === 'done' ? 'done' :
            t.status === 'in_progress' ? 'active' :
            t.status === 'skipped' ? 'skipped' :
            ''
          return <span key={type} className={`pipeline-step ${cls}`} />
        })}
      </div>

      <div className="card-foot">
        {stuck && (
          <span className="card-stuck">STUCK</span>
        )}
        {story.release_label && (
          <span className="meta" title={story.release_label}>
            <Icon name="folder" size={11}/>
            {story.release_label.length > 14 ? story.release_label.slice(0, 14) + '…' : story.release_label}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {devName && <Avatar seed={dev?.avatar_seed ?? devName} name={devName} size={20}/>}
      </div>
    </div>
  )
}
