import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSettings, useDevelopers, useReleases } from '../hooks/useSettings'
import { useStories } from '../hooks/useData'
import {
  bulkUpdate,
  createDeveloper, createRelease, deleteDeveloper, deleteRelease, deleteStory,
  renameReleasePicklist, sendPasswordReset, signOut,
  updateDeveloper, updateSettings, updateStoryFields, updateStoryStage,
} from '../lib/api'
import { supabase } from '../lib/supabase'
import type { AppSettings, Developer, ReleaseTrack, Stage, UserStory } from '../lib/types'
import { RELEASE_TRACKS, RELEASE_TRACK_LABELS, STAGES, STAGE_LABELS } from '../lib/types'
import { Icon } from './Icon'
import { Avatar, AVATAR_PRESET_SEEDS } from './Avatar'
import { useDialog } from './Dialog'
import { EditableText } from './EditableText'
import { ComplexityChip } from './ComplexityChip'
import { devDisplay, resolveDev } from '../lib/developer'

/** For the Owner <select>: returns the value to put on `<select value>` so the
 *  current developer remains selected even if `story.developer` is the SF id
 *  while the option's value is `name` (or vice versa). */
function resolveDevValue(raw: string | null, devs: import('../lib/types').Developer[]): string {
  const d = resolveDev(raw, devs)
  if (!d) return ''
  return d.sf_user_id ?? d.name
}

type Tab = 'stories' | 'releases' | 'developers' | 'recycle' | 'priority' | 'thresholds' | 'general' | 'account'

export function Setup({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('stories')
  return (
    <div className="modal-back">
      <div className="modal" style={{ width: 1100, height: '85vh', maxHeight: 820 }}>
        <div className="modal-head">
          <div className="modal-title">Setup</div>
          <button className="btn-icon" onClick={onClose}><Icon name="x" size={16}/></button>
        </div>
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <aside className="side-tabs">
            <button className={`side-tab ${tab === 'stories' ? 'active' : ''}`} onClick={() => setTab('stories')}>Stories</button>
            <button className={`side-tab ${tab === 'releases' ? 'active' : ''}`} onClick={() => setTab('releases')}>Releases</button>
            <button className={`side-tab ${tab === 'developers' ? 'active' : ''}`} onClick={() => setTab('developers')}>Developers</button>
            <button className={`side-tab ${tab === 'recycle' ? 'active' : ''}`} onClick={() => setTab('recycle')}>Recycle Bin</button>
            <button className={`side-tab ${tab === 'priority' ? 'active' : ''}`} onClick={() => setTab('priority')}>Priority Mode</button>
            <button className={`side-tab ${tab === 'thresholds' ? 'active' : ''}`} onClick={() => setTab('thresholds')}>Thresholds</button>
            <button className={`side-tab ${tab === 'general' ? 'active' : ''}`} onClick={() => setTab('general')}>General</button>
            <button className={`side-tab ${tab === 'account' ? 'active' : ''}`} onClick={() => setTab('account')}>Account</button>
          </aside>
          <div className="modal-body" style={{ flex: 1 }}>
            {tab === 'stories' && <StoriesTab onClose={onClose}/>}
            {tab === 'releases' && <ReleasesTab/>}
            {tab === 'developers' && <DevelopersTab/>}
            {tab === 'recycle' && <RecycleBinTab/>}
            {tab === 'priority' && <PriorityTab/>}
            {tab === 'thresholds' && <ThresholdsTab/>}
            {tab === 'general' && <GeneralTab/>}
            {tab === 'account' && <AccountTab/>}
          </div>
        </div>
      </div>
    </div>
  )
}

function DevelopersTab() {
  const qc = useQueryClient()
  const dialog = useDialog()
  const { data: devs = [] } = useDevelopers()
  const { data: stories = [] } = useStories()
  const [form, setForm] = useState<Partial<Developer>>({
    name: '', sf_user_id: '', email: '', avatar_seed: AVATAR_PRESET_SEEDS[0],
  })
  const [editing, setEditing] = useState<Developer | null>(null)

  const suggestions = useMemo(() => {
    const known = new Set(devs.map(d => (d.sf_user_id ?? '').trim()).filter(Boolean))
    const map = new Map<string, number>()
    for (const s of stories) {
      const v = (s.developer ?? '').trim()
      if (!v || known.has(v)) continue
      if (!/^[a-zA-Z0-9]{15,18}$/.test(v)) continue
      map.set(v, (map.get(v) ?? 0) + 1)
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [devs, stories])

  async function add() {
    if (!form.name?.trim()) return
    await createDeveloper({
      name: form.name.trim(),
      sf_user_id: form.sf_user_id?.trim() || null,
      email: form.email?.trim() || null,
      avatar_seed: form.avatar_seed || form.name.trim(),
    })
    setForm({ name: '', sf_user_id: '', email: '', avatar_seed: AVATAR_PRESET_SEEDS[0] })
    qc.invalidateQueries({ queryKey: ['developers'] })
  }
  async function quickAdd(sfId: string) {
    const name = await dialog.prompt({
      title: 'Map developer',
      label: `Name for SF user ${sfId}`,
      placeholder: 'e.g. Sarah Chen',
    })
    if (!name) return
    await createDeveloper({ name, sf_user_id: sfId, avatar_seed: name })
    qc.invalidateQueries({ queryKey: ['developers'] })
  }
  async function saveEdit(d: Developer, patch: Partial<Developer>) {
    await updateDeveloper(d.id, patch)
    qc.invalidateQueries({ queryKey: ['developers'] })
  }
  async function del(d: Developer) {
    const ok = await dialog.confirm({
      title: `Delete developer "${d.name}"?`,
      body: 'Existing stories that referenced this developer will keep their raw value, but the avatar/name mapping will disappear.',
      destructive: true,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    await deleteDeveloper(d.id)
    qc.invalidateQueries({ queryKey: ['developers'] })
  }

  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 0 }}>
        Map a Salesforce User ID to a friendly name and pick a clay-cartoon avatar.
        Names + avatars show on every kanban card.
      </p>

      {/* Add form — stacked, no horizontal overflow */}
      <div style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-card)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <input className="fld" placeholder="Name *"
            value={form.name ?? ''} onChange={e => setForm({ ...form, name: e.target.value })}/>
          <input className="fld" placeholder="Salesforce User ID (optional)"
            value={form.sf_user_id ?? ''} onChange={e => setForm({ ...form, sf_user_id: e.target.value })}/>
        </div>
        <input className="fld" placeholder="Email (optional)" style={{ width: '100%', marginBottom: 10 }}
          value={form.email ?? ''} onChange={e => setForm({ ...form, email: e.target.value })}/>

        <label className="label-cap">Avatar</label>
        <AvatarPicker
          seed={form.avatar_seed ?? null}
          onPick={s => setForm({ ...form, avatar_seed: s })}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button className="btn btn-primary" onClick={add} disabled={!form.name?.trim()}>
            <Icon name="plus" size={12}/> Add developer
          </button>
        </div>
      </div>

      <div className="section-label" style={{ marginTop: 24 }}>Existing ({devs.length})</div>
      {devs.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No developers yet.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {devs.map(d => (
          <div key={d.id} style={{
            padding: 10, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-card)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <Avatar seed={d.avatar_seed ?? d.name} name={d.name} size={32} ring />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {d.sf_user_id && <span className="mono">{d.sf_user_id}</span>}
                  {d.email && <span>{d.email}</span>}
                </div>
              </div>
              <button className="btn btn-ghost" onClick={() => setEditing(editing?.id === d.id ? null : d)}>
                <Icon name="edit" size={12}/> {editing?.id === d.id ? 'Done' : 'Edit'}
              </button>
              <button className="btn btn-danger" onClick={() => del(d)}>
                <Icon name="trash" size={12}/>
              </button>
            </div>

            {editing?.id === d.id && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <input className="fld" placeholder="Name" defaultValue={d.name}
                    onBlur={e => e.target.value !== d.name && saveEdit(d, { name: e.target.value })}/>
                  <input className="fld" placeholder="Salesforce User ID" defaultValue={d.sf_user_id ?? ''}
                    onBlur={e => e.target.value !== (d.sf_user_id ?? '') && saveEdit(d, { sf_user_id: e.target.value || null })}/>
                </div>
                <label className="label-cap">Avatar</label>
                <AvatarPicker
                  seed={d.avatar_seed ?? null}
                  onPick={s => saveEdit(d, { avatar_seed: s })}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {suggestions.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: 24 }}>Detected from imports — not yet mapped ({suggestions.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {suggestions.slice(0, 25).map(([sfId, count]) => (
              <div key={sfId} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px',
                border: '1px solid var(--border)', borderRadius: 6, minWidth: 0,
              }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sfId}</span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>{count} stories</span>
                <button className="btn btn-primary" onClick={() => quickAdd(sfId)}>+ Add</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function AvatarPicker({ seed, onPick }: { seed: string | null; onPick: (s: string) => void }) {
  const [custom, setCustom] = useState(
    seed && !AVATAR_PRESET_SEEDS.includes(seed) ? seed : ''
  )
  const [localFiles, setLocalFiles] = useState<string[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/avatars/manifest.json', { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (cancelled) return
        const files = Array.isArray(j?.files) ? j.files.filter(Boolean) : []
        setLocalFiles(files)
      })
      .catch(() => { if (!cancelled) setLocalFiles([]) })
    return () => { cancelled = true }
  }, [])

  const usingLocal = localFiles && localFiles.length > 0
  const tiles = usingLocal ? localFiles! : AVATAR_PRESET_SEEDS

  return (
    <div>
      {usingLocal && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>
          Using {localFiles!.length} avatar{localFiles!.length === 1 ? '' : 's'} from <span className="mono">/public/avatars/</span>
        </div>
      )}
      <div className="avatar-grid">
        {tiles.map(s => (
          <button key={s} className={`avatar-cell ${seed === s ? 'selected' : ''}`}
            onClick={() => onPick(s)} type="button" title={s}>
            <Avatar seed={s} name={s} size={40}/>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
        <input className="fld"
          placeholder={usingLocal ? 'Or enter a filename (e.g. 24.png)' : 'Or enter a custom seed (any text)'}
          style={{ flex: 1 }}
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onBlur={() => custom.trim() && onPick(custom.trim())}
        />
        <Avatar seed={custom || seed} name={custom || seed || '?'} size={32} ring />
      </div>
    </div>
  )
}

function PriorityTab() {
  const qc = useQueryClient()
  const { data: s } = useSettings()
  if (!s) return null
  const set = async (patch: Partial<AppSettings>) => {
    await updateSettings(patch); qc.invalidateQueries({ queryKey: ['settings'] })
  }
  return (
    <div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 0 }}>
        SF priority (High/Medium/Low) reflects business priority on the User Story.
        Switch on <strong>Custom Priority</strong> to drive sort order from the
        drag-drop ranks you set in the <strong>Prioritize</strong> drawer.
      </p>
      <ToggleRow
        label="Use custom priority order"
        description="Cards sort by your manually-set rank within each column. SF priority chips become hidden in the filter bar (still visible on cards)."
        value={s.use_custom_priority}
        onChange={v => set({ use_custom_priority: v })}
      />
    </div>
  )
}

function ThresholdsTab() {
  const qc = useQueryClient()
  const { data: s } = useSettings()
  if (!s) return null
  const set = async (patch: Partial<AppSettings>) => {
    await updateSettings(patch); qc.invalidateQueries({ queryKey: ['settings'] })
  }
  return (
    <div>
      <NumberRow label="Long-running task warning (hours)" value={s.long_run_hours}
        min={1} max={24} onSave={v => set({ long_run_hours: v })}/>
      <NumberRow label="Idle reminder (minutes)" value={s.idle_minutes}
        min={5} max={240} onSave={v => set({ idle_minutes: v })}
        help="If you have an active task and the browser sees no activity for this long, a reminder appears." />
      <NumberRow label="Stuck threshold — Quick Hit (hours)" value={s.stuck_quickhit_hours}
        min={1} max={336} onSave={v => set({ stuck_quickhit_hours: v })}/>
      <NumberRow label="Stuck threshold — Major Release (hours)" value={s.stuck_major_hours}
        min={1} max={720} onSave={v => set({ stuck_major_hours: v })}/>
      <NumberRow label="Stuck threshold — Default (hours)" value={s.stuck_default_hours}
        min={1} max={720} onSave={v => set({ stuck_default_hours: v })}
        help="Used when a story has no release info."/>
    </div>
  )
}

function GeneralTab() {
  const qc = useQueryClient()
  const { data: s } = useSettings()
  if (!s) return null
  const set = async (patch: Partial<AppSettings>) => {
    await updateSettings(patch); qc.invalidateQueries({ queryKey: ['settings'] })
  }
  return (
    <div>
      <ToggleRow
        label="Hide UAT-deployed field"
        description="Suppress the 'UAT Deployed' chip everywhere."
        value={s.hide_uat_field} onChange={v => set({ hide_uat_field: v })}
      />
    </div>
  )
}

function AccountTab() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  async function reset() {
    const { data: u } = await supabase.auth.getUser()
    if (!u.user?.email) { setMsg('No email on account.'); return }
    setBusy(true)
    try { await sendPasswordReset(u.user.email); setMsg(`Reset link sent to ${u.user.email}.`) }
    catch (e: any) { setMsg(e.message) } finally { setBusy(false) }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
      <button className="btn btn-outline" onClick={reset} disabled={busy}>Send password reset email</button>
      <button className="btn btn-danger" onClick={() => signOut()}>Sign out</button>
      {msg && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{msg}</div>}
    </div>
  )
}

function ToggleRow({ label, description, value, onChange }: {
  label: string; description?: string; value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="row-line">
      <div>
        <div style={{ fontWeight: 500 }}>{label}</div>
        {description && <div className="desc">{description}</div>}
      </div>
      <button className={`switch ${value ? 'on' : ''}`} onClick={() => onChange(!value)} aria-label={label}/>
    </div>
  )
}

function NumberRow({ label, value, onSave, min, max, help }: {
  label: string; value: number; onSave: (v: number) => void; min: number; max: number; help?: string
}) {
  const [v, setV] = useState(value)
  return (
    <div className="row-line">
      <div>
        <div style={{ fontWeight: 500 }}>{label}</div>
        {help && <div className="desc">{help}</div>}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="number" min={min} max={max} className="fld" style={{ width: 96, textAlign: 'right' }}
          value={v} onChange={e => setV(parseInt(e.target.value || '0', 10))}/>
        {v !== value && <button className="btn btn-primary" onClick={() => onSave(v)}>Save</button>}
      </div>
    </div>
  )
}

// ============================================================
// Stories tab — bulk-edit grid for the canonical "fix my data" surface
// ============================================================

type SortKey = 'us_id' | 'title' | 'release_label' | 'release_track' |
               'priority' | 'complexity' | 'stage' | 'updated_at'

function StoriesTab({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const dialog = useDialog()
  const { data: stories = [] } = useStories()
  const { data: devs = [] } = useDevelopers()
  const { data: releases = [] } = useReleases()

  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'us_id', dir: 'asc' })
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    let r = stories.filter(s => {
      if (!showArchived && s.archived) return false
      if (!showCompleted && s.stage === 'completed') return false
      if (q) {
        const hay = [s.us_id, s.title, s.release_label ?? '',
                     s.developer ?? ''].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    const dir = sort.dir === 'asc' ? 1 : -1
    r = [...r].sort((a, b) => {
      const av = (a as any)[sort.key] ?? ''
      const bv = (b as any)[sort.key] ?? ''
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })
    return r
  }, [stories, search, showArchived, showCompleted, sort])

  function inv() {
    qc.invalidateQueries({ queryKey: ['stories'] })
    qc.invalidateQueries({ queryKey: ['tasks'] })
  }

  async function patch(id: string, p: Partial<UserStory>) {
    await updateStoryFields(id, p as any); inv()
  }
  async function setStage(id: string, stage: Stage) {
    await updateStoryStage(id, stage); inv()
  }
  function validateUsId(originalId: string) {
    return (next: string) => {
      if (!next.trim()) return 'US ID cannot be empty'
      const dup = stories.some(s => s.id !== originalId && s.us_id === next)
      if (dup) return 'Another story already uses this ID'
      return null
    }
  }

  const allOnPageSelected = rows.length > 0 && rows.every(r => selected.has(r.id))
  function toggleSelectAll() {
    if (allOnPageSelected) setSelected(new Set())
    else setSelected(new Set(rows.map(r => r.id)))
  }
  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // ---- Bulk actions ----
  async function bulkSetRelease() {
    const options = [
      ...releases.map(r => ({ value: r.name, label: r.name })),
      { value: '__clear__', label: '— clear release —' },
    ]
    if (options.length === 1) {
      await dialog.confirm({
        title: 'No releases yet',
        body: 'Add a release in Setup → Releases first, then come back to assign it.',
        confirmLabel: 'OK',
      })
      return
    }
    const choice = await dialog.prompt({
      title: `Set release on ${selected.size} ${selected.size === 1 ? 'story' : 'stories'}`,
      label: `Type one of: ${releases.map(r => r.name).join(', ')} (or empty to clear)`,
      placeholder: releases[0]?.name,
      allowEmpty: true,
      validate: (v) => {
        if (!v) return null
        if (releases.some(r => r.name === v)) return null
        return `Unknown release. Use exactly one of: ${releases.map(r => r.name).join(', ')}`
      },
    })
    if (choice == null) return
    const value = choice === '__clear__' || !choice ? null : choice
    await bulkUpdate(Array.from(selected), { release_label: value } as any); inv()
  }
  async function bulkSetTrack(track: ReleaseTrack) {
    await bulkUpdate(Array.from(selected),
      { release_track: track, is_quick_hit: track !== 'major' } as any); inv()
  }
  async function bulkPin(value: boolean) {
    await bulkUpdate(Array.from(selected), { pinned: value } as any); inv()
  }
  async function bulkArchive(value: boolean) {
    await bulkUpdate(Array.from(selected), { archived: value } as any); inv()
    setSelected(new Set())
  }
  async function bulkDelete() {
    const ok = await dialog.confirm({
      title: `Permanently delete ${selected.size} stories?`,
      body: 'Removes all tasks and activity logs. Cannot be undone. Consider archiving instead.',
      destructive: true,
      confirmLabel: `Delete ${selected.size}`,
    })
    if (!ok) return
    for (const id of selected) await deleteStory(id)
    setSelected(new Set()); inv()
  }
  async function rowDelete(s: UserStory) {
    const ok = await dialog.confirm({
      title: `Permanently delete ${s.us_id}?`,
      body: 'Removes the story and all its tasks and activity logs.',
      destructive: true,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    await deleteStory(s.id); inv()
  }

  function openDrawer(id: string) {
    window.dispatchEvent(new CustomEvent('app:open-story', { detail: id }))
    onClose()
  }

  function header(label: string, key: SortKey, w?: number) {
    const active = sort.key === key
    return (
      <th
        style={{ width: w, cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setSort(s => ({
          key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc',
        }))}
      >
        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          {label}
          {active && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{sort.dir === 'asc' ? '↑' : '↓'}</span>}
        </span>
      </th>
    )
  }

  return (
    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div className="search-input" style={{ minWidth: 240 }}>
          <Icon name="search" size={14}/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by US ID, title, release, developer…"/>
        </div>
        <button
          type="button"
          className={`chip-toggle ${showArchived ? 'on' : ''}`}
          onClick={() => setShowArchived(v => !v)}
          title={showArchived ? 'Hide archived stories' : 'Show archived stories too'}>
          <Icon name="archive" size={13}/> Archived
        </button>
        <button
          type="button"
          className={`chip-toggle ${showCompleted ? 'on' : ''}`}
          onClick={() => setShowCompleted(v => !v)}
          title={showCompleted ? 'Hide completed stories' : 'Show completed stories too'}>
          <Icon name="check" size={13}/> Completed
        </button>
        <div style={{ flex: 1 }}/>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {rows.length} of {stories.length}
        </span>
      </div>

      {selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', marginBottom: 10,
          background: 'var(--accent-soft)', border: '1px solid oklch(from var(--accent) l c h / 0.4)',
          borderRadius: 8,
        }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--accent)', marginRight: 6 }}>
            {selected.size} selected
          </span>
          <button className="btn btn-ghost" onClick={bulkSetRelease}>Set release</button>
          <button className="btn btn-ghost" onClick={() => bulkSetTrack('major')}>→ Major</button>
          <button className="btn btn-ghost" onClick={() => bulkSetTrack('qh1')}>→ QH1</button>
          <button className="btn btn-ghost" onClick={() => bulkSetTrack('qh2')}>→ QH2</button>
          <button className="btn btn-ghost" onClick={() => bulkPin(true)}><Icon name="star" size={12}/> Pin</button>
          <button className="btn btn-ghost" onClick={() => bulkPin(false)}>Unpin</button>
          <button className="btn btn-ghost" onClick={() => bulkArchive(true)}><Icon name="archive" size={12}/> Archive</button>
          <button className="btn btn-ghost" onClick={() => bulkArchive(false)}>Unarchive</button>
          <button className="btn btn-danger" onClick={bulkDelete}><Icon name="trash" size={12}/> Delete</button>
          <div style={{ flex: 1 }}/>
          <button className="btn btn-ghost" onClick={() => setSelected(new Set())}><Icon name="x" size={12}/></button>
        </div>
      )}

      <div className="stories-table-wrap">
        <table className="stories-table">
          <thead>
            <tr>
              <th style={{ width: 28 }}>
                <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAll}
                  style={{ cursor: 'pointer' }}/>
              </th>
              {header('US ID', 'us_id', 110)}
              {header('Title', 'title')}
              {header('Release', 'release_label', 160)}
              {header('Track', 'release_track', 100)}
              {header('Priority', 'priority', 100)}
              {header('Cx', 'complexity', 70)}
              {header('Stage', 'stage', 130)}
              <th style={{ width: 130 }}>Owner</th>
              <th style={{ width: 50 }}>★</th>
              <th style={{ width: 50 }}>🗄</th>
              <th style={{ width: 70 }}/>
            </tr>
          </thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.id} className={selected.has(s.id) ? 'sel' : ''}>
                <td>
                  <input type="checkbox" checked={selected.has(s.id)}
                    onChange={() => toggleOne(s.id)} style={{ cursor: 'pointer' }}/>
                </td>
                <td>
                  <EditableText value={s.us_id}
                    onSave={v => patch(s.id, { us_id: v })}
                    validate={validateUsId(s.id)} className="mono"/>
                </td>
                <td>
                  <EditableText value={s.title}
                    onSave={v => patch(s.id, { title: v || s.us_id })}/>
                </td>
                <td>
                  <select className="fld" style={{ padding: '3px 6px', fontSize: 12, maxWidth: 150 }}
                    value={s.release_label ?? ''}
                    onChange={e => patch(s.id, { release_label: e.target.value || null })}>
                    <option value="">—</option>
                    {releases.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                  </select>
                </td>
                <td>
                  <select className="fld" style={{ padding: '3px 6px', fontSize: 12 }}
                    value={s.release_track ?? ''}
                    onChange={e => {
                      const v = e.target.value as ReleaseTrack | ''
                      patch(s.id, {
                        release_track: v || null,
                        is_quick_hit: v === 'qh1' || v === 'qh2',
                      } as any)
                    }}>
                    <option value="">—</option>
                    {RELEASE_TRACKS.map(t =>
                      <option key={t} value={t}>{RELEASE_TRACK_LABELS[t]}</option>
                    )}
                  </select>
                </td>
                <td>
                  <select className="fld" style={{ padding: '3px 6px', fontSize: 12 }}
                    value={s.priority ?? ''}
                    onChange={e => patch(s.id, { priority: e.target.value || null })}>
                    <option value="">—</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </td>
                <td>
                  <ComplexityChip value={s.complexity}
                    onChange={c => patch(s.id, { complexity: c })}/>
                </td>
                <td>
                  <select className="fld" style={{ padding: '3px 6px', fontSize: 12 }}
                    value={s.stage}
                    onChange={e => setStage(s.id, e.target.value as Stage)}>
                    {STAGES.map(st => <option key={st} value={st}>{STAGE_LABELS[st]}</option>)}
                  </select>
                </td>
                <td>
                  <select className="fld" style={{ padding: '3px 6px', fontSize: 12, maxWidth: 130 }}
                    value={resolveDevValue(s.developer, devs)}
                    onChange={e => patch(s.id, { developer: e.target.value || null })}>
                    <option value="">—</option>
                    {devs.map(d => (
                      <option key={d.id} value={d.sf_user_id ?? d.name}>{d.name}</option>
                    ))}
                  </select>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button onClick={() => patch(s.id, { pinned: !s.pinned })}
                    title={s.pinned ? 'Unpin' : 'Pin'}
                    style={{ color: s.pinned ? 'var(--accent)' : 'var(--text-dim)' }}>
                    <Icon name="star" size={14}/>
                  </button>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button onClick={() => patch(s.id, { archived: !s.archived })}
                    title={s.archived ? 'Unarchive' : 'Archive'}
                    style={{ color: s.archived ? 'var(--accent)' : 'var(--text-dim)' }}>
                    <Icon name="archive" size={14}/>
                  </button>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn-icon" style={{ width: 24, height: 24 }}
                      onClick={() => openDrawer(s.id)} title="Open drawer">
                      <Icon name="chevronRight" size={12}/>
                    </button>
                    <button className="btn-icon" style={{ width: 24, height: 24, color: 'oklch(0.65 0.18 25)' }}
                      onClick={() => rowDelete(s)} title="Delete permanently">
                      <Icon name="trash" size={12}/>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={12} style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)' }}>
                No stories match
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}


// ============================================================
// Releases tab — manage the release picklist
// ============================================================

function ReleasesTab() {
  const qc = useQueryClient()
  const dialog = useDialog()
  const { data: releases = [] } = useReleases()
  const { data: stories = [] } = useStories()
  const [name, setName] = useState('')

  // Count stories per release for the usage hint
  const usage = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of stories) {
      if (!s.release_label) continue
      m.set(s.release_label, (m.get(s.release_label) ?? 0) + 1)
    }
    return m
  }, [stories])

  function inv() {
    qc.invalidateQueries({ queryKey: ['releases'] })
    qc.invalidateQueries({ queryKey: ['stories'] })
  }

  async function add() {
    const v = name.trim()
    if (!v) return
    if (releases.some(r => r.name === v)) return
    await createRelease(v); setName(''); inv()
  }
  async function rename(oldName: string) {
    const next = await dialog.prompt({
      title: 'Rename release',
      label: 'New name (cascades to every story that references it)',
      initialValue: oldName,
      placeholder: oldName,
      validate: (v) => {
        if (!v.trim()) return 'Required'
        if (v === oldName) return 'Same as current'
        if (releases.some(r => r.name === v.trim() && r.name !== oldName)) return 'Name already exists'
        return null
      },
    })
    if (next == null) return
    await renameReleasePicklist(oldName, next.trim()); inv()
  }
  async function remove(r: { name: string }) {
    const count = usage.get(r.name) ?? 0
    const ok = await dialog.confirm({
      title: `Delete release "${r.name}"?`,
      body: count > 0
        ? `${count} ${count === 1 ? 'story' : 'stories'} reference this release. They'll be cleared (release set to none).`
        : 'No stories reference this release.',
      destructive: true, confirmLabel: 'Delete',
    })
    if (!ok) return
    await deleteRelease(r.name); inv()
  }

  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 0 }}>
        Manage the picklist of release names used across the app.
        Renaming a release here cascades to every story that references it.
      </p>

      <div style={{
        padding: 12, marginBottom: 16,
        border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-card)',
        display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <input className="fld" placeholder="e.g. Aug 2026" style={{ flex: 1 }}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }}/>
        <button className="btn btn-primary" onClick={add} disabled={!name.trim()}>
          <Icon name="plus" size={12}/> Add release
        </button>
      </div>

      <div className="section-label">Existing ({releases.length})</div>
      {releases.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          None yet. Add a release above, or import stories from Salesforce — existing release labels seed automatically.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {releases.map(r => {
          const count = usage.get(r.name) ?? 0
          return (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
              border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-card)',
            }}>
              <Icon name="folder" size={14} className="text-accent"/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{r.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  {count} {count === 1 ? 'story' : 'stories'}
                </div>
              </div>
              <button className="btn btn-ghost" onClick={() => rename(r.name)}>
                <Icon name="edit" size={12}/> Rename
              </button>
              <button className="btn btn-danger" onClick={() => remove(r)}>
                <Icon name="trash" size={12}/>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}



// ============================================================
// Recycle Bin tab — lists archived stories, can restore or hard-delete
// ============================================================

function RecycleBinTab() {
  const qc = useQueryClient()
  const dialog = useDialog()
  const { data: stories = [] } = useStories()
  const archived = useMemo(
    () => stories.filter(s => s.archived).sort(
      (a, b) => +new Date(b.updated_at) - +new Date(a.updated_at)
    ),
    [stories],
  )
  const [selected, setSelected] = useState<Set<string>>(new Set())

  function inv() {
    qc.invalidateQueries({ queryKey: ['stories'] })
    qc.invalidateQueries({ queryKey: ['tasks'] })
  }

  async function restoreOne(id: string) {
    await updateStoryFields(id, { archived: false } as any); inv()
  }
  async function deleteOne(s: { id: string; us_id: string }) {
    const ok = await dialog.confirm({
      title: `Permanently delete ${s.us_id}?`,
      body: 'Removes the story and all its tasks and activity logs. Cannot be undone.',
      destructive: true, confirmLabel: 'Delete forever',
    })
    if (!ok) return
    await deleteStory(s.id); inv()
  }
  async function restoreAll() {
    if (selected.size === 0) return
    for (const id of selected) await updateStoryFields(id, { archived: false } as any)
    setSelected(new Set()); inv()
  }
  async function deleteAll() {
    if (selected.size === 0) return
    const ok = await dialog.confirm({
      title: `Permanently delete ${selected.size} stories?`,
      body: 'Removes all tasks and activity logs for the selected stories. Cannot be undone.',
      destructive: true, confirmLabel: `Delete ${selected.size} forever`,
    })
    if (!ok) return
    for (const id of selected) await deleteStory(id)
    setSelected(new Set()); inv()
  }
  async function emptyAll() {
    if (archived.length === 0) return
    const ok = await dialog.confirm({
      title: `Empty Recycle Bin?`,
      body: `Permanently deletes all ${archived.length} archived stories and their tasks/logs. Cannot be undone.`,
      destructive: true, confirmLabel: 'Empty bin',
    })
    if (!ok) return
    for (const s of archived) await deleteStory(s.id)
    setSelected(new Set()); inv()
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const allSelected = archived.length > 0 && archived.every(s => selected.has(s.id))
  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(archived.map(s => s.id)))
  }

  return (
    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 0 }}>
        Stories you've removed from the kanban via the drawer end up here.
        Restore them or delete them forever.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {archived.length} archived · {selected.size} selected
        </span>
        <div style={{ flex: 1 }}/>
        {selected.size > 0 && (
          <>
            <button className="btn btn-outline" onClick={restoreAll}>
              <Icon name="rotate" size={12}/> Restore selected
            </button>
            <button className="btn btn-danger" onClick={deleteAll}>
              <Icon name="trash" size={12}/> Delete selected
            </button>
          </>
        )}
        {archived.length > 0 && selected.size === 0 && (
          <button className="btn btn-danger" onClick={emptyAll}>
            <Icon name="trash" size={12}/> Empty bin
          </button>
        )}
      </div>

      {archived.length === 0 ? (
        <div style={{
          padding: 60, textAlign: 'center', color: 'var(--text-dim)',
          border: '1px dashed var(--border)', borderRadius: 8,
        }}>
          <Icon name="archive" size={28}/>
          <div style={{ marginTop: 12, fontSize: 13 }}>Recycle bin is empty</div>
        </div>
      ) : (
        <div style={{
          flex: 1, minHeight: 0, overflow: 'auto',
          border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-card)',
        }}>
          <table className="stories-table" style={{ minWidth: 0 }}>
            <thead>
              <tr>
                <th style={{ width: 28 }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}/>
                </th>
                <th style={{ width: 110 }}>US ID</th>
                <th>Title</th>
                <th style={{ width: 140 }}>Release</th>
                <th style={{ width: 80 }}>Track</th>
                <th style={{ width: 130 }}>Archived</th>
                <th style={{ width: 110 }}/>
              </tr>
            </thead>
            <tbody>
              {archived.map(s => (
                <tr key={s.id} className={selected.has(s.id) ? 'sel' : ''}>
                  <td>
                    <input type="checkbox" checked={selected.has(s.id)}
                      onChange={() => toggleOne(s.id)}/>
                  </td>
                  <td className="mono" style={{ color: 'var(--accent)' }}>{s.us_id}</td>
                  <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 0 }}
                      title={s.title}>{s.title}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{s.release_label ?? '—'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>
                    {s.release_track ? RELEASE_TRACK_LABELS[s.release_track] : '—'}
                  </td>
                  <td style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                    {new Date(s.updated_at).toLocaleString()}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn-icon" style={{ width: 24, height: 24 }}
                        title="Restore" onClick={() => restoreOne(s.id)}>
                        <Icon name="rotate" size={12}/>
                      </button>
                      <button className="btn-icon" style={{ width: 24, height: 24, color: 'oklch(0.65 0.18 25)' }}
                        title="Delete forever" onClick={() => deleteOne(s)}>
                        <Icon name="trash" size={12}/>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
