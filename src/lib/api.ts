import { supabase } from './supabase'
import type { ActivityLog, AppSettings, Developer, Release, Stage, Task, UserStory } from './types'
import { DEFAULT_SETTINGS } from './types'
import type { ImportedUS } from './importer'

// ---------- Auth ----------
export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}
export async function signUp(email: string, password: string) {
  const { error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
}
export async function signOut() {
  await supabase.auth.signOut()
}

// ---------- Stories / Tasks / Logs ----------
export async function listUserStories(): Promise<UserStory[]> {
  const { data, error } = await supabase
    .from('user_stories').select('*').order('updated_at', { ascending: false })
  if (error) throw error
  return data as UserStory[]
}

export async function listTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks').select('*').order('order_index', { ascending: true })
  if (error) throw error
  return data as Task[]
}

export async function listRecentLogs(limit = 2000): Promise<ActivityLog[]> {
  const { data, error } = await supabase
    .from('activity_logs').select('*').order('ts', { ascending: false }).limit(limit)
  if (error) throw error
  return (data as ActivityLog[]).reverse()
}

export async function importStories(rows: ImportedUS[], opts?: { defaultRelease?: string | null }) {
  const { data: u } = await supabase.auth.getUser()
  const user_id = u.user?.id
  if (!user_id) throw new Error('Not authenticated')
  if (rows.length === 0) return { inserted: 0, updated: 0 }

  // Find existing
  const usIds = rows.map(r => r.us_id)
  const { data: existing } = await supabase
    .from('user_stories').select('us_id').in('us_id', usIds)
  const existingSet = new Set((existing ?? []).map(e => e.us_id))

  const payload = rows.map(r => ({
    user_id,
    us_id: r.us_id,
    title: r.title,
    description: r.description ?? null,
    priority: r.priority ?? null,
    developer: r.developer ?? null,
    deployed_to_uat: !!r.deployed_to_uat,
    defect_status: r.defect_status ?? null,
    release_label: opts?.defaultRelease ? opts.defaultRelease : (r.release_label ?? null),
    release_track: r.release_track ?? (r.is_quick_hit ? 'qh1' : null),
    is_quick_hit: !!r.is_quick_hit || r.release_track === 'qh1' || r.release_track === 'qh2',
    sf_status: r.sf_status ?? null,
    acceptance_criteria: r.acceptance_criteria ?? null,
    solution_approach: r.solution_approach ?? null,
    ...(r.created_at ? { created_at: r.created_at } : {}),
  }))

  const { error } = await supabase
    .from('user_stories')
    .upsert(payload, { onConflict: 'user_id,us_id' })
  if (error) throw error

  // Seed any new release names from the import into the picklist
  const releaseNames = new Set<string>()
  for (const p of payload) if (p.release_label) releaseNames.add(p.release_label)
  if (releaseNames.size > 0) {
    const releaseRows = Array.from(releaseNames).map(name => ({ user_id, name }))
    await supabase.from('releases').upsert(releaseRows, { onConflict: 'user_id,name' })
  }

  const updated = rows.filter(r => existingSet.has(r.us_id)).length
  return { inserted: rows.length - updated, updated }
}

export async function updateStoryStage(us_pk: string, stage: Stage) {
  const { error } = await supabase
    .from('user_stories').update({ stage }).eq('id', us_pk)
  if (error) throw error
}

export async function updateStoryNotes(us_pk: string, notes: string) {
  const { error } = await supabase
    .from('user_stories').update({ notes }).eq('id', us_pk)
  if (error) throw error
}

export async function deleteStory(us_pk: string) {
  const { error } = await supabase.from('user_stories').delete().eq('id', us_pk)
  if (error) throw error
}

export async function adjustTaskSeconds(task_id: string, seconds: number) {
  const { error } = await supabase
    .from('tasks').update({ manual_adjust_seconds: seconds }).eq('id', task_id)
  if (error) throw error
}

/**
 * Inserts a paired STARTED/PAUSED activity-log entry at today's start that spans
 * `seconds` of duration. The interval-based time math (Dashboard "Time today",
 * FocusPanel "Tracked today", per-task tracked seconds) will pick it up
 * automatically — no special-casing needed.
 */
export async function logTodayAdjustment(task_id: string, seconds: number) {
  if (seconds <= 0) return
  const { data: u } = await supabase.auth.getUser()
  const user_id = u.user?.id
  if (!user_id) throw new Error('Not authenticated')

  // Find the parent us_pk from the task row (need it for the FK on activity_logs)
  const { data: t, error: tErr } = await supabase
    .from('tasks').select('us_pk').eq('id', task_id).single()
  if (tErr) throw tErr

  const start = new Date()
  start.setHours(0, 0, 0, 0)
  // Place the synthetic interval at 00:00 today by default. If today already has
  // a real STARTED open at this same task, this won't overlap because we close
  // the synthetic interval immediately.
  const end = new Date(start.getTime() + seconds * 1000)

  const rows = [
    { user_id, us_pk: t.us_pk, task_id, action: 'STARTED', ts: start.toISOString() },
    { user_id, us_pk: t.us_pk, task_id, action: 'PAUSED',  ts: end.toISOString() },
  ]
  const { error } = await supabase.from('activity_logs').insert(rows)
  if (error) throw error
}

// ---------- RPCs (atomic state transitions) ----------
export async function rpcStartTask(task_id: string) {
  const { error } = await supabase.rpc('start_task', { p_task: task_id })
  if (error) throw error
}
export async function rpcPauseCurrent() {
  const { error } = await supabase.rpc('pause_current')
  if (error) throw error
}
export async function rpcCompleteTask(task_id: string) {
  const { error } = await supabase.rpc('complete_task', { p_task: task_id })
  if (error) throw error
}
export async function rpcReopenTask(task_id: string) {
  const { error } = await supabase.rpc('reopen_task', { p_task: task_id })
  if (error) throw error
}
export async function rpcSkipTask(task_id: string) {
  const { error } = await supabase.rpc('skip_task', { p_task: task_id })
  if (error) throw error
}
export async function rpcSetEvidence(task_id: string, value: boolean) {
  const { error } = await supabase.rpc('set_evidence', { p_task: task_id, p_value: value })
  if (error) throw error
}

export async function updateAutoStage(us_pk: string, auto_stage: boolean) {
  const { error } = await supabase
    .from('user_stories').update({ auto_stage }).eq('id', us_pk)
  if (error) throw error
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  })
  if (error) throw error
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}

/** Sign out from every device / browser session for the current user. */
export async function signOutAllDevices() {
  const { error } = await supabase.auth.signOut({ scope: 'global' })
  if (error) throw error
}

/** Trigger a password-reset email to the currently signed-in user's address. */
export async function resetMyPassword() {
  const { data, error: getErr } = await supabase.auth.getUser()
  if (getErr) throw getErr
  const email = data.user?.email
  if (!email) throw new Error('No email on the current session')
  const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
  if (error) throw error
}

/**
 * Wipe every story-graph row for the current user (stories, tasks, activity_logs
 * cascade via FK; releases + developers are cleared explicitly). RLS guards each
 * delete to the calling user's rows. Settings are preserved (those are
 * preferences, not data).
 */
export async function resetAllData() {
  // The on-delete-cascade chain on user_stories handles tasks + activity_logs.
  const tables = ['user_stories', 'releases', 'developers'] as const
  for (const t of tables) {
    const { error } = await supabase.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (error) throw new Error(`reset failed at ${t}: ${error.message}`)
  }
}

/** Re-seed the releases picklist from any release_label values that exist on stories
 *  but aren't already in the releases table. Returns the number of rows added. */
export async function reseedReleasesFromStories(): Promise<number> {
  const { data: u } = await supabase.auth.getUser()
  const user_id = u.user?.id
  if (!user_id) throw new Error('Not authenticated')
  const { data: stories, error: sErr } = await supabase
    .from('user_stories').select('release_label')
  if (sErr) throw sErr
  const { data: existing, error: eErr } = await supabase.from('releases').select('name')
  if (eErr) throw eErr
  const haveSet = new Set((existing ?? []).map(r => r.name))
  const want = new Set<string>()
  for (const s of stories ?? []) if (s.release_label && !haveSet.has(s.release_label)) want.add(s.release_label)
  if (want.size === 0) return 0
  const rows = Array.from(want).map(name => ({ user_id, name }))
  const { error } = await supabase.from('releases').upsert(rows, { onConflict: 'user_id,name' })
  if (error) throw error
  return rows.length
}

export async function updatePinned(us_pk: string, pinned: boolean) {
  const { error } = await supabase
    .from('user_stories').update({ pinned }).eq('id', us_pk)
  if (error) throw error
}

export async function renameRelease(oldLabel: string | null, newLabel: string) {
  const { error } = await supabase.rpc('rename_release', {
    p_old: oldLabel, p_new: newLabel,
  })
  if (error) throw error
}

// ---------- Releases (managed picklist) ----------
export async function listReleases(): Promise<Release[]> {
  const { data, error } = await supabase
    .from('releases').select('*').order('name', { ascending: true })
  if (error) throw error
  return data as Release[]
}
export async function createRelease(name: string): Promise<Release> {
  const { data: u } = await supabase.auth.getUser()
  const user_id = u.user?.id
  if (!user_id) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('releases').insert({ user_id, name: name.trim() }).select().single()
  if (error) throw error
  return data as Release
}
export async function renameReleasePicklist(oldName: string | null, newName: string) {
  const { error } = await supabase.rpc('rename_release_v2', {
    p_old: oldName, p_new: newName.trim(),
  })
  if (error) throw error
}
export async function deleteRelease(name: string) {
  const { error } = await supabase.rpc('delete_release', { p_name: name })
  if (error) throw error
}

// ---------- Developers ----------
export async function listDevelopers(): Promise<Developer[]> {
  const { data, error } = await supabase
    .from('developers').select('*').order('name', { ascending: true })
  if (error) throw error
  return data as Developer[]
}
export async function createDeveloper(d: Partial<Developer>): Promise<Developer> {
  const { data: u } = await supabase.auth.getUser()
  const user_id = u.user?.id
  if (!user_id) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('developers').insert({ ...d, user_id }).select().single()
  if (error) throw error
  return data as Developer
}
export async function updateDeveloper(id: string, patch: Partial<Developer>) {
  const { error } = await supabase.from('developers').update(patch).eq('id', id)
  if (error) throw error
}
export async function deleteDeveloper(id: string) {
  const { error } = await supabase.from('developers').delete().eq('id', id)
  if (error) throw error
}

// ---------- Settings ----------
export async function getSettings(): Promise<AppSettings> {
  const { data: u } = await supabase.auth.getUser()
  const user_id = u.user?.id
  if (!user_id) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('app_settings').select('*').eq('user_id', user_id).maybeSingle()
  if (error) throw error
  if (data) return data as AppSettings
  // create default
  const fresh = { user_id, ...DEFAULT_SETTINGS }
  const { data: ins, error: insErr } = await supabase
    .from('app_settings').insert(fresh).select().single()
  if (insErr) throw insErr
  return ins as AppSettings
}
export async function updateSettings(patch: Partial<AppSettings>) {
  const { data: u } = await supabase.auth.getUser()
  const user_id = u.user?.id
  if (!user_id) throw new Error('Not authenticated')
  const { error } = await supabase
    .from('app_settings').update(patch).eq('user_id', user_id)
  if (error) throw error
}

// ---------- Story field updates ----------
export async function updateStoryFields(us_pk: string, patch: Partial<UserStory>) {
  const { error } = await supabase.from('user_stories').update(patch).eq('id', us_pk)
  if (error) throw error
}
export async function archiveStory(us_pk: string) {
  return updateStoryFields(us_pk, { archived: true } as any)
}
export async function unarchiveStory(us_pk: string) {
  return updateStoryFields(us_pk, { archived: false } as any)
}

// ---------- Bulk ops ----------
export async function bulkUpdate(ids: string[], patch: Partial<UserStory>) {
  if (ids.length === 0) return
  const { error } = await supabase.from('user_stories').update(patch).in('id', ids)
  if (error) throw error
}
export async function bulkSkipTcReview(usPks: string[]) {
  if (usPks.length === 0) return
  const { error } = await supabase
    .from('tasks').update({ status: 'skipped' })
    .in('us_pk', usPks).eq('type', 'tc_review').neq('status', 'skipped')
  if (error) throw error
}
