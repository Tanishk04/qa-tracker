import { DndContext, DragEndEvent, PointerSensor, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useStories, useTasks, useLogs } from '../hooks/useData'
import type { Stage, UserStory } from '../lib/types'
import { STAGES, STAGE_LABELS } from '../lib/types'
import { KanbanCard } from './KanbanCard'
import { updateStoryStage, updateAutoStage } from '../lib/api'
import { Drawer } from './Drawer'
import { validateStageMove } from '../lib/stage'
import { useFilter } from '../hooks/useFilter'
import { FilterBar } from './FilterBar'
import { QuickFind } from './QuickFind'
import { BulkBar } from './BulkBar'
import { useSettings } from '../hooks/useSettings'
import { Icon } from './Icon'

const STAGE_COLOR: Record<Stage, string> = {
  not_started: 'var(--st-not-started)',
  in_progress: 'var(--st-in-progress)',
  sit: 'var(--st-sit)',
  uat: 'var(--st-uat)',
  completed: 'var(--st-completed)',
}

function Column({ stage, children, count }: { stage: Stage; children: React.ReactNode; count: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  return (
    <section className="column">
      <header className="col-head">
        <span className="col-dot" style={{ background: STAGE_COLOR[stage] }} />
        <span className="col-title">{STAGE_LABELS[stage]}</span>
        <span className="col-count">{count}</span>
      </header>
      <div ref={setNodeRef} className={`col-body ${isOver ? 'over' : ''}`}>
        {children}
      </div>
    </section>
  )
}

/** Mobile single-column view. Drop target id matches the stage so dnd-kit
 *  treats it the same as the desktop column. */
function MobileColumn({
  stage, stories, tasks, logs, selected, toggleSelect, setOpen,
}: {
  stage: Stage
  stories: UserStory[]
  tasks: any[]; logs: any[]
  selected: Set<string>
  toggleSelect: (id: string) => void
  setOpen: (id: string | null) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  return (
    <div ref={setNodeRef} className={`mobile-column ${isOver ? 'over' : ''}`}>
      {stories.map(s => (
        <KanbanCard key={s.id}
          story={s}
          tasks={tasks.filter((t: any) => t.us_pk === s.id)}
          logs={logs}
          onClick={() => setOpen(s.id)}
          selected={selected.has(s.id)}
          onToggleSelect={() => toggleSelect(s.id)}/>
      ))}
      {stories.length === 0 && (
        <div className="col-empty">No stories in this stage</div>
      )}
    </div>
  )
}

export function KanbanBoard() {
  const qc = useQueryClient()
  const { data: stories = [] } = useStories()
  const { data: tasks = [] } = useTasks()
  const { data: logs = [] } = useLogs()
  const [openId, setOpenIdLocal] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const { applies } = useFilter()
  const { data: settings } = useSettings()

  // Cross-component open requests (PinnedRail, etc.)
  useEffect(() => {
    function onOpen(e: Event) {
      const id = (e as CustomEvent<string>).detail
      if (id) setOpenIdLocal(id)
    }
    window.addEventListener('app:open-story', onOpen as EventListener)
    return () => window.removeEventListener('app:open-story', onOpen as EventListener)
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const filtered = useMemo(() => stories.filter(applies), [stories, applies])

  const grouped = useMemo(() => {
    const m: Record<Stage, UserStory[]> = {
      not_started: [], in_progress: [], sit: [], uat: [], completed: [],
    }
    const useRank = !!settings?.use_custom_priority
    const sorted = [...filtered].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      if (useRank) {
        const ar = a.priority_rank ?? Number.MAX_SAFE_INTEGER
        const br = b.priority_rank ?? Number.MAX_SAFE_INTEGER
        if (ar !== br) return ar - br
      }
      return +new Date(b.updated_at) - +new Date(a.updated_at)
    })
    for (const s of sorted) m[s.stage].push(s)
    return m
  }, [filtered, settings])

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(new Set()) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function onDragEnd(e: DragEndEvent) {
    const overId = e.over?.id
    const id = String(e.active.id)
    if (!overId) return
    const stage = String(overId) as Stage
    if (!STAGES.includes(stage)) return
    const story = stories.find(s => s.id === id)
    if (!story || story.stage === stage) return

    const storyTasks = tasks.filter(t => t.us_pk === id)
    const v = validateStageMove(story.stage, stage, storyTasks)
    if (!v.ok) { showToast(v.reason); return }

    if (story.auto_stage) await updateAutoStage(id, false)
    await updateStoryStage(id, stage)
    qc.invalidateQueries({ queryKey: ['stories'] })
  }

  const openStory = (openId ? stories.find(s => s.id === openId) : null) ?? null
  const [mobileStage, setMobileStage] = useState<Stage>('in_progress')

  return (
    <>
      <FilterBar />
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        {/* Desktop / tablet view — 5 columns side-by-side */}
        <div className="board">
          {STAGES.map(stage => (
            <Column key={stage} stage={stage} count={grouped[stage].length}>
              {grouped[stage].map(s => (
                <KanbanCard
                  key={s.id}
                  story={s}
                  tasks={tasks.filter(t => t.us_pk === s.id)}
                  logs={logs}
                  onClick={() => setOpenIdLocal(s.id)}
                  selected={selected.has(s.id)}
                  onToggleSelect={() => toggleSelect(s.id)}
                />
              ))}
              {grouped[stage].length === 0 && (
                <div className="col-empty">Drop here</div>
              )}
            </Column>
          ))}
        </div>

        {/* Mobile view — sticky stage tabs + single active column */}
        <div className="mobile-board">
          <div className="stage-tabs" role="tablist" aria-label="Kanban stages">
            {STAGES.map(stage => (
              <button key={stage}
                role="tab"
                aria-selected={mobileStage === stage}
                className={`stage-tab ${mobileStage === stage ? 'active' : ''}`}
                onClick={() => setMobileStage(stage)}
              >
                <span className="stage-dot" style={{ background: STAGE_COLOR[stage] }} />
                <span>{STAGE_LABELS[stage]}</span>
                <span className="col-count">{grouped[stage].length}</span>
              </button>
            ))}
          </div>
          <MobileColumn stage={mobileStage} stories={grouped[mobileStage]} tasks={tasks} logs={logs}
            selected={selected} toggleSelect={toggleSelect} setOpen={setOpenIdLocal}/>
        </div>
      </DndContext>

      {toast && <div className="toast">{toast}</div>}

      <Drawer
        story={openStory}
        tasks={openStory ? tasks.filter(t => t.us_pk === openStory.id) : []}
        logs={openStory ? logs.filter(l => l.us_pk === openStory.id) : []}
        onClose={() => setOpenIdLocal(null)}
      />

      <QuickFind onPick={(s) => setOpenIdLocal(s.id)} />
      <BulkBar ids={selected} clear={() => setSelected(new Set())} />
    </>
  )
}
