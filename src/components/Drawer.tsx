import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ActivityLog, Task, UserStory } from '../lib/types'
import { TASK_LABELS, TASK_ORDER } from '../lib/types'
import { computeTaskSeconds, fmtDuration, fmtTaskBreakdownTooltip } from '../lib/time'
import { useTick } from '../hooks/useTick'
import {
  adjustTaskSeconds, archiveStory, logTodayAdjustment, rpcCompleteTask, rpcReopenTask,
  rpcSkipTask, rpcStartTask, rpcSetEvidence, unarchiveStory, updateAutoStage,
  updateStoryFields, updateStoryNotes, updatePinned,
} from '../lib/api'
import { useDevelopers, useReleases, useSettings } from '../hooks/useSettings'
import { RELEASE_TRACKS, RELEASE_TRACK_LABELS, SF_STATUSES, type ReleaseTrack } from '../lib/types'
import { devDisplay, resolveDev } from '../lib/developer'
import { Icon } from './Icon'
import { Avatar } from './Avatar'
import { ComplexityChip } from './ComplexityChip'
import { TimeAdjustModal } from './TimeAdjustModal'
import { EditableText } from './EditableText'
import { useStories } from '../hooks/useData'
import { useDialog } from './Dialog'
import { useStartTaskGuarded } from '../hooks/useStartTaskGuarded'
import type { Complexity } from '../lib/types'

interface Props {
  story: UserStory | null
  tasks: Task[]
  logs: ActivityLog[]
  onClose: () => void
}

type Tab = 'tasks' | 'notes' | 'evidence' | 'activity'

export function Drawer({ story, tasks, logs, onClose }: Props) {
  useTick(1000)
  const qc = useQueryClient()
  const { data: settings } = useSettings()
  const { data: devs = [] } = useDevelopers()
  const { data: releases = [] } = useReleases()
  const [tab, setTab] = useState<Tab>('tasks')
  const [notes, setNotes] = useState(story?.notes ?? '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [completeError, setCompleteError] = useState<string | null>(null)
  const [adjustFor, setAdjustFor] = useState<Task | null>(null)
  const isOpen = !!story
  const { data: allStories = [] } = useStories()
  const dialog = useDialog()
  const startTask = useStartTaskGuarded()
  const hideUat = settings?.hide_uat_field ?? true

  useEffect(() => {
    if (story) { setNotes(story.notes ?? ''); setTab('tasks'); setCompleteError(null) }
  }, [story?.id])

  const ordered = useMemo(() =>
    [...tasks].sort((a, b) => a.order_index - b.order_index), [tasks])
  const sortedLogs = useMemo(() =>
    [...logs].sort((a, b) => +new Date(b.ts) - +new Date(a.ts)), [logs])
  const totalSec = ordered.reduce((s, t) => s + computeTaskSeconds(t, logs), 0)
  const completedTasks = ordered.filter(t => t.status === 'done' || t.status === 'skipped').length

  function inv() {
    qc.invalidateQueries({ queryKey: ['tasks'] })
    qc.invalidateQueries({ queryKey: ['logs'] })
    qc.invalidateQueries({ queryKey: ['stories'] })
  }

  async function saveNotes() {
    if (!story) return
    setSavingNotes(true)
    try { await updateStoryNotes(story.id, notes); inv() } finally { setSavingNotes(false) }
  }
  async function applyTimeAdjust(taskId: string, newAdjustSec: number, applyToToday: boolean) {
    const prev = adjustFor?.manual_adjust_seconds ?? 0
    await adjustTaskSeconds(taskId, newAdjustSec)
    if (applyToToday) {
      // Push the delta into today's tracked time as a synthetic interval log.
      const delta = newAdjustSec - prev
      if (delta > 0) await logTodayAdjustment(taskId, delta)
    }
    inv(); setAdjustFor(null)
  }
  async function setComplexity(c: Complexity | null) {
    if (!story) return
    await updateStoryFields(story.id, { complexity: c } as any); inv()
  }
  async function patchStory(field: string, value: any) {
    if (!story) return
    await updateStoryFields(story.id, { [field]: value } as any); inv()
  }
  function validateUsId(next: string): string | null {
    if (!story) return null
    if (!next.trim()) return 'US ID cannot be empty'
    const dup = allStories.some(s => s.id !== story.id && s.us_id === next)
    if (dup) return 'Another story already uses this ID'
    return null
  }
  function validatePriorityRank(next: string): string | null {
    if (next.trim() === '') return null
    const n = parseInt(next, 10)
    if (Number.isNaN(n)) return 'Must be a whole number'
    if (n < 0) return 'Must be ≥ 0'
    return null
  }
  async function tryComplete(t: Task) {
    setCompleteError(null)
    try { await rpcCompleteTask(t.id); inv() }
    catch (e: any) {
      const msg = String(e?.message ?? '')
      if (msg.includes('evidence_required'))
        setCompleteError(`${TASK_LABELS[t.type]}: evidence is required before completion.`)
      else setCompleteError(msg || 'Failed to complete')
    }
  }
  async function onToggleEvidence(t: Task, value: boolean) {
    await rpcSetEvidence(t.id, value); inv()
  }
  async function onToggleAutoStage() {
    if (!story) return; await updateAutoStage(story.id, !story.auto_stage); inv()
  }
  async function onTogglePin() {
    if (!story) return; await updatePinned(story.id, !story.pinned); inv()
  }
  async function onArchive() {
    if (!story) return
    await (story.archived ? unarchiveStory(story.id) : archiveStory(story.id))
    inv(); onClose()
  }

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') return onClose()
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      const active = ordered.find(t => t.status === 'in_progress')
      const next = ordered.find(t => t.status !== 'done' && t.status !== 'skipped' && t.status !== 'in_progress')
      const k = e.key.toLowerCase()
      if (k === 's' && next) startTask(next.id)
      else if (k === 'c' && active) tryComplete(active)
      else if (k === 'k' && active) rpcSkipTask(active.id).then(inv)
      else if (k === 'p') onTogglePin()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id, ordered, isOpen])

  if (!story) {
    return <>
      <div className="drawer-backdrop" />
      <aside className="drawer" />
    </>
  }

  const devName = devDisplay(story.developer, devs)
  const dev = resolveDev(story.developer, devs)
  const useRank = !!settings?.use_custom_priority
  const priClass = story.priority?.toLowerCase() === 'high' ? 'pri-high'
                 : story.priority?.toLowerCase() === 'low' ? 'pri-low' : 'pri-medium'
  const hasActive = ordered.some(t => t.status === 'in_progress')

  return (
    <>
      <div className={`drawer-backdrop ${isOpen ? 'open' : ''}`} onClick={onClose} />
      <aside className={`drawer ${isOpen ? 'open' : ''}`} role="dialog" aria-label={`Story ${story.us_id}`}>
        <div className="drawer-head">
          <div className="drawer-top-row">
            <button className={`card-pin ${story.pinned ? 'on' : ''}`} onClick={onTogglePin} title="Pin (P)">
              <Icon name="star" size={14}/>
            </button>
            <EditableText
              value={story.us_id}
              onSave={(v) => patchStory('us_id', v)}
              validate={validateUsId}
              className="drawer-id mono"
              placeholder="US-ID"
            />
            {story.priority && <span className={`card-pri ${priClass}`}>{story.priority}</span>}
            {story.release_track && (
              <span className="card-pri" style={{
                background: story.release_track === 'major' ? 'var(--bg-hover)' : 'var(--accent-soft)',
                color: story.release_track === 'major' ? 'var(--text-muted)' : 'var(--accent)',
              }}>
                {RELEASE_TRACK_LABELS[story.release_track]}
              </span>
            )}
            {hasActive && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--accent)' }}>
                <span className="pulse" style={{ background: 'var(--accent)', width: 6, height: 6, borderRadius: '50%' }} />
                Running
              </span>
            )}
            <button className="drawer-close" onClick={onClose} aria-label="Close">
              <Icon name="x" size={16}/>
            </button>
          </div>
          <EditableText
            value={story.title}
            onSave={(v) => patchStory('title', v || story.us_id)}
            className="drawer-title-editable"
            placeholder="Story title"
          />
          <div className="drawer-meta">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span className="key">Complexity</span>
              <ComplexityChip value={story.complexity} onChange={setComplexity} />
            </span>
            <span className="sep">·</span>
            {useRank ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span className="key">Rank</span>
                <EditableText
                  value={story.priority_rank == null ? '' : String(story.priority_rank)}
                  onSave={(v) => patchStory('priority_rank', v.trim() === '' ? null : parseInt(v, 10))}
                  validate={validatePriorityRank}
                  emptyLabel="—"
                  placeholder="rank"
                />
                <span className="sep">·</span>
              </span>
            ) : null}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span className="key">Release</span>
              <select
                className="fld"
                style={{ padding: '2px 6px', fontSize: 12 }}
                value={story.release_label ?? ''}
                onChange={e => patchStory('release_label', e.target.value || null)}>
                <option value="">—</option>
                {releases.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
              </select>
            </span>
            <span className="sep">·</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span className="key">Track</span>
              <select
                className="fld"
                style={{ padding: '2px 6px', fontSize: 12 }}
                value={story.release_track ?? ''}
                onChange={e => {
                  const v = e.target.value as ReleaseTrack | ''
                  patchStory('release_track', v || null)
                  patchStory('is_quick_hit', v === 'qh1' || v === 'qh2')
                }}>
                <option value="">—</option>
                {RELEASE_TRACKS.map(t =>
                  <option key={t} value={t}>{RELEASE_TRACK_LABELS[t]}</option>
                )}
              </select>
            </span>
            <span className="sep">·</span>
            <span><span className="key">Total</span> <span className="val mono">{fmtDuration(totalSec)}</span></span>
            {devName && (<>
              <span className="sep">·</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span className="key">Owner</span>
                <Avatar seed={dev?.avatar_seed ?? devName} name={devName} size={18} />
                <span className="val">{devName}</span>
              </span>
            </>)}
            <span className="sep">·</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span className="key">SF Status</span>
              <select
                className="fld"
                style={{ padding: '2px 6px', fontSize: 12, maxWidth: 220 }}
                value={story.sf_status ?? ''}
                onChange={e => patchStory('sf_status', e.target.value || null)}>
                <option value="">—</option>
                {SF_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </span>
            <span className="sep">·</span>
            <button onClick={onToggleAutoStage}>
              <span className="key">Auto-stage</span> <span className="val">{story.auto_stage ? 'on' : 'off'}</span>
            </button>
            {story.deployed_to_uat && !hideUat && (<>
              <span className="sep">·</span>
              <span style={{ color: 'oklch(0.74 0.11 150)' }}>UAT Deployed</span>
            </>)}
          </div>
        </div>

        <div className="drawer-tabs">
          <button className={`drawer-tab ${tab === 'tasks' ? 'active' : ''}`} onClick={() => setTab('tasks')}>
            <Icon name="check" size={13}/> Tasks <span className="badge">{completedTasks}/{ordered.length}</span>
          </button>
          <button className={`drawer-tab ${tab === 'notes' ? 'active' : ''}`} onClick={() => setTab('notes')}>
            <Icon name="file" size={13}/> Notes
          </button>
          <button className={`drawer-tab ${tab === 'evidence' ? 'active' : ''}`} onClick={() => setTab('evidence')}>
            <Icon name="paperclip" size={13}/> Evidence
          </button>
          <button className={`drawer-tab ${tab === 'activity' ? 'active' : ''}`} onClick={() => setTab('activity')}>
            <Icon name="activity" size={13}/> Activity
          </button>
        </div>

        <div className="drawer-body">
          {tab === 'tasks' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div className="section-label" style={{ margin: 0 }}>Pipeline</div>
                <div className="kbd-hints" style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--text-dim)' }}>
                  <span><span className="kbd-mini">S</span> start</span>
                  <span><span className="kbd-mini">C</span> complete</span>
                  <span><span className="kbd-mini">K</span> skip</span>
                  <span><span className="kbd-mini">P</span> pin</span>
                </div>
              </div>

              <div className="task-list">
                {TASK_ORDER.map(type => {
                  const t = ordered.find(x => x.type === type)
                  if (!t) return null
                  const sec = computeTaskSeconds(t, logs)
                  const stateCls = t.status === 'done' ? 'done'
                                 : t.status === 'in_progress' ? 'active'
                                 : t.status === 'skipped' ? 'skipped' : ''
                  const showEvidence = t.type === 'sit_test' || t.type === 'uat_test'
                  const evMissing = t.evidence_required && !t.evidence_uploaded
                  return (
                    <div key={t.id} className={`task-item ${stateCls}`}>
                      <div className="task-state">
                        {t.status === 'done' && <Icon name="check" size={12} stroke={2.5}/>}
                      </div>
                      <div className="task-info">
                        <div className="task-name">
                          {TASK_LABELS[t.type]}
                          {t.type === 'tc_review' && <span className="task-tag">Optional</span>}
                          {t.evidence_required && <span className="task-tag req">Evidence required</span>}
                          {!t.evidence_required && (t.type === 'sit_test') && <span className="task-tag">Evidence optional</span>}
                        </div>
                        <div className="task-meta">
                          {t.status.replace('_', ' ')} ·{' '}
                          <span
                            title={fmtTaskBreakdownTooltip(t, logs)}
                            style={{
                              cursor: 'help',
                              borderBottom: t.manual_adjust_seconds
                                ? '1px dotted var(--text-dim)' : undefined,
                            }}
                          >
                            {fmtDuration(sec)}
                            {t.manual_adjust_seconds !== 0 && (
                              <span style={{
                                marginLeft: 4, fontSize: 10,
                                color: t.manual_adjust_seconds > 0
                                  ? 'oklch(0.74 0.11 150)' : 'oklch(0.72 0.16 25)',
                              }}>±</span>
                            )}
                          </span>
                        </div>
                        {showEvidence && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                            <button
                              className={`evidence-check ${t.evidence_uploaded ? 'on' : ''}`}
                              onClick={() => onToggleEvidence(t, !t.evidence_uploaded)}
                              aria-label="Toggle evidence">
                              {t.evidence_uploaded && <Icon name="check" size={11} stroke={3}/>}
                            </button>
                            <span>Evidence {t.evidence_uploaded ? 'uploaded' : 'not uploaded'}</span>
                            {evMissing && t.status === 'done' && (
                              <span className="card-pri" style={{
                                background: 'oklch(0.78 0.13 80 / 0.16)', color: 'oklch(0.82 0.13 80)',
                              }}>missing</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="task-actions">
                        {t.status !== 'in_progress' && t.status !== 'done' && (
                          <button className="btn btn-primary" onClick={() => startTask(t.id)}>
                            <Icon name="play" size={12}/> Start
                          </button>
                        )}
                        {t.status === 'in_progress' && (
                          <button className="btn btn-outline" onClick={() => tryComplete(t)}>
                            <Icon name="check" size={12}/> Complete
                          </button>
                        )}
                        {t.status === 'done' && (
                          <button className="btn btn-ghost" onClick={() => rpcReopenTask(t.id).then(inv)}>
                            <Icon name="rotate" size={12}/> Reopen
                          </button>
                        )}
                        {t.status !== 'skipped' && t.status !== 'done' && (
                          <button className="btn btn-ghost" onClick={() => rpcSkipTask(t.id).then(inv)}>
                            <Icon name="skip" size={12}/> Skip
                          </button>
                        )}
                        <button className="btn btn-ghost" title="Adjust tracked time" onClick={() => setAdjustFor(t)}>
                          <Icon name="clock" size={12}/> Adjust
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {completeError && (
                <div style={{ color: 'oklch(0.72 0.16 25)', fontSize: 12, marginTop: 12 }}>
                  {completeError}
                </div>
              )}
            </div>
          )}

          {tab === 'notes' && (
            <div>
              <div className="section-label">Description</div>
              <EditableText
                value={story.description}
                onSave={(v) => patchStory('description', v || null)}
                multiline
                placeholder="Add a short description…"
                emptyLabel="+ add description"
              />

              <div className="section-label">Acceptance Criteria</div>
              <EditableText
                value={story.acceptance_criteria}
                onSave={(v) => patchStory('acceptance_criteria', v || null)}
                multiline
                placeholder="Bullet the conditions for done…"
                emptyLabel="+ add acceptance criteria"
              />

              <div className="section-label">Solution Approach</div>
              <EditableText
                value={story.solution_approach}
                onSave={(v) => patchStory('solution_approach', v || null)}
                multiline
                placeholder="Notes on how the dev solved it (helps your test design)…"
                emptyLabel="+ add solution approach"
              />

              <div className="section-label">Quick notes</div>
              <textarea
                className="notes-input"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                onBlur={saveNotes}
                placeholder="Repro steps, edge cases, links to PRs…"
              />
              {savingNotes && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>Saving…</div>}
            </div>
          )}

          {tab === 'evidence' && (
            <div>
              <div className="section-label">Evidence checklist</div>
              {ordered.filter(t => t.type === 'sit_test' || t.type === 'uat_test').map(t => (
                <div key={t.id} className="evidence-row">
                  <button className={`evidence-check ${t.evidence_uploaded ? 'on' : ''}`}
                    onClick={() => onToggleEvidence(t, !t.evidence_uploaded)}>
                    {t.evidence_uploaded && <Icon name="check" size={11} stroke={3}/>}
                  </button>
                  <span style={{ color: 'var(--text)' }}>{TASK_LABELS[t.type]} evidence</span>
                  <span className="card-pri" style={{
                    background: t.evidence_required ? 'oklch(0.72 0.16 25 / 0.12)' : 'var(--bg-hover)',
                    color: t.evidence_required ? 'oklch(0.72 0.16 25)' : 'var(--text-dim)',
                    marginLeft: 'auto',
                  }}>
                    {t.evidence_required ? 'required' : 'optional'}
                  </span>
                </div>
              ))}
              <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-dim)' }}>
                Tip: this is a checkbox — file upload is not stored here.
              </div>
            </div>
          )}

          {tab === 'activity' && (
            <div>
              <div className="section-label">Activity</div>
              {sortedLogs.length === 0 && <div className="activity-empty">No activity yet</div>}
              {sortedLogs.map(l => {
                const t = tasks.find(x => x.id === l.task_id)
                const color = l.action === 'STARTED' ? 'var(--accent)'
                            : l.action === 'COMPLETED' ? 'oklch(0.72 0.12 150)'
                            : l.action === 'PAUSED' ? 'oklch(0.78 0.13 80)'
                            : 'var(--text-muted)'
                return (
                  <div key={l.id} style={{ display: 'flex', gap: 8, fontSize: 12, padding: '4px 0', alignItems: 'center' }}>
                    <span className="mono" style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                      {new Date(l.ts).toLocaleString()}
                    </span>
                    <span style={{ color, fontWeight: 500 }}>{l.action}</span>
                    <span style={{ color: 'var(--text)' }}>{t ? TASK_LABELS[t.type] : ''}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="drawer-foot">
          <button className="btn btn-ghost" onClick={onArchive}>
            <Icon name={story.archived ? 'rotate' : 'trash'} size={13}/>
            {story.archived ? ' Restore from Recycle Bin' : ' Move to Recycle Bin'}
          </button>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            Permanent delete is in <strong>Setup → Recycle Bin</strong>
          </span>
        </div>
      </aside>

      {adjustFor && (
        <TimeAdjustModal
          taskName={TASK_LABELS[adjustFor.type]}
          currentTotalSec={computeTaskSeconds(adjustFor, logs)}
          existingAdjustSec={adjustFor.manual_adjust_seconds || 0}
          onClose={() => setAdjustFor(null)}
          onSave={(s, applyToday) => applyTimeAdjust(adjustFor.id, s, applyToday)}
        />
      )}
    </>
  )
}
