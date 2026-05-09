import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  DndContext, DragEndEvent, PointerSensor, closestCenter,
  useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useStories } from '../hooks/useData'
import { useFilter } from '../hooks/useFilter'
import { useSettings } from '../hooks/useSettings'
import { bulkUpdate, updateSettings } from '../lib/api'
import type { UserStory } from '../lib/types'
import { Icon } from './Icon'
import { useDialog } from './Dialog'

interface Props { open: boolean; onClose: () => void }

function Row({ story, index }: { story: UserStory; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: story.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  return (
    <div ref={setNodeRef} style={style} className={`sort-row ${isDragging ? 'dragging' : ''}`}>
      <button className="sort-handle" {...attributes} {...listeners} aria-label="Drag to reorder">
        <Icon name="grip" size={14}/>
      </button>
      <div className="sort-rank">#{index + 1}</div>
      <div style={{ minWidth: 0 }}>
        <div className="sort-id">{story.us_id}{story.is_quick_hit ? ' · QH' : ''}</div>
        <div className="sort-title">{story.title}</div>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {story.priority && <span className={`card-pri pri-${story.priority.toLowerCase() === 'high' ? 'high' : story.priority.toLowerCase() === 'low' ? 'low' : 'medium'}`}>{story.priority}</span>}
        {story.pinned && <Icon name="star" size={12} className="text-warn" />}
      </div>
    </div>
  )
}

export function PrioritizeDrawer({ open, onClose }: Props) {
  const qc = useQueryClient()
  const { data: stories = [] } = useStories()
  const { applies, filter } = useFilter()
  const { data: settings } = useSettings()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const dialog = useDialog()
  const [dirty, setDirty] = useState(false)
  const [items, setItems] = useState<UserStory[]>([])
  const [saving, setSaving] = useState(false)

  // Reset items each time the drawer opens — sorted by current rank (then by recently-updated)
  useEffect(() => {
    if (!open) return
    const filtered = stories.filter(s => applies(s) && !s.archived && s.stage !== 'completed')
    const sorted = [...filtered].sort((a, b) => {
      const ar = a.priority_rank ?? Number.MAX_SAFE_INTEGER
      const br = b.priority_rank ?? Number.MAX_SAFE_INTEGER
      if (ar !== br) return ar - br
      return +new Date(b.updated_at) - +new Date(a.updated_at)
    })
    setItems(sorted)
    setDirty(false)
  }, [open, stories])

  const ids = useMemo(() => items.map(s => s.id), [items])

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = items.findIndex(s => s.id === active.id)
    const newIdx = items.findIndex(s => s.id === over.id)
    setItems(arrayMove(items, oldIdx, newIdx))
    setDirty(true)
  }

  async function save() {
    setSaving(true)
    try {
      // Assign sequential ranks 1..N. Use individual updates so we don't blow away
      // priority_rank for the whole list at once.
      // (Faster: batch by chunks of 50 with a Promise.all.)
      const chunkSize = 50
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize)
        await Promise.all(chunk.map((s, j) =>
          bulkUpdate([s.id], { priority_rank: i + j + 1 } as any)
        ))
      }
      // Also flip on use_custom_priority so the new ranks actually drive sort
      if (settings && !settings.use_custom_priority) {
        await updateSettings({ use_custom_priority: true })
        qc.invalidateQueries({ queryKey: ['settings'] })
      }
      qc.invalidateQueries({ queryKey: ['stories'] })
      setDirty(false)
      onClose()
    } finally { setSaving(false) }
  }

  async function clearAll() {
    const ok = await dialog.confirm({
      title: 'Clear all custom ranks?',
      body: `Removes priority_rank from all ${items.length} visible stories. They'll fall back to default sort order.`,
      destructive: true,
      confirmLabel: 'Clear ranks',
    })
    if (!ok) return
    setSaving(true)
    try {
      await bulkUpdate(items.map(s => s.id), { priority_rank: null } as any)
      qc.invalidateQueries({ queryKey: ['stories'] })
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <>
      <div className={`drawer-backdrop ${open ? 'open' : ''}`} onClick={onClose} />
      <aside className={`drawer ${open ? 'open' : ''}`} style={{ width: 540 }} role="dialog" aria-label="Prioritize">
        <div className="drawer-head">
          <div className="drawer-top-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="sliders" size={16}/>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Prioritize</span>
            </div>
            <button className="drawer-close" onClick={onClose}><Icon name="x" size={16}/></button>
          </div>
          <div className="drawer-meta">
            <span className="key">Drag rows to set the order. The top row becomes #1.</span>
          </div>
          <div className="drawer-meta">
            <span className="key">Showing</span>
            <span className="val">{items.length} stories</span>
            {filter.release !== 'all' && (<>
              <span className="sep">·</span>
              <span><span className="key">Release</span> <span className="val">{filter.release}</span></span>
            </>)}
            {filter.pinnedOnly && (<><span className="sep">·</span><span style={{ color: 'var(--accent)' }}>pinned only</span></>)}
            {filter.track !== 'all' && (<><span className="sep">·</span><span style={{ color: 'var(--accent)' }}>{filter.track.toUpperCase()}</span></>)}
          </div>
        </div>

        <div className="drawer-body" style={{ padding: 14 }}>
          {items.length === 0 ? (
            <div className="focus-empty" style={{ padding: 60 }}>
              <div className="icon-tile"><Icon name="sliders" size={20}/></div>
              <div>
                <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Nothing to prioritize</div>
                <div style={{ fontSize: 12 }}>Adjust the filter — completed and archived stories are excluded.</div>
              </div>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {items.map((s, i) => <Row key={s.id} story={s} index={i} />)}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        <div className="drawer-foot">
          <button className="btn btn-ghost" onClick={clearAll} disabled={saving || items.length === 0}>
            Clear all ranks
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={!dirty || saving}>
              {saving ? 'Saving…' : dirty ? 'Save order' : 'Saved'}
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
