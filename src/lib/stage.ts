import type { Stage, Task, UserStory } from './types'

const RANK: Record<Stage, number> = {
  not_started: 0, in_progress: 1, sit: 2, uat: 3, completed: 4,
}

/** Mirror of SQL compute_stage(): determines auto stage from task states. */
export function computeStage(tasks: Task[]): Stage {
  const t = (type: string) => tasks.find(x => x.type === type)
  const sit = t('sit_test')
  const uat = t('uat_test')

  const uatDoneOk = !!uat && uat.status === 'done' && (!uat.evidence_required || uat.evidence_uploaded)
  const uatActive = uat?.status === 'in_progress'
  const sitDone = !!sit && (sit.status === 'done' || sit.status === 'skipped')
  const sitActive = sit?.status === 'in_progress'
  const anyActive = tasks.some(x => x.status === 'in_progress')
  const anyStarted = tasks.some(x => ['in_progress', 'paused', 'done', 'skipped'].includes(x.status))

  if (uatDoneOk) return 'completed'
  if (uatActive || sitDone) return 'uat'
  if (sitActive) return 'sit'
  if (anyActive || anyStarted) return 'in_progress'
  return 'not_started'
}

/** For manual moves: forward jumps need their gate task done; backward moves are free. */
export function validateStageMove(
  from: Stage,
  to: Stage,
  tasks: Task[],
): { ok: true } | { ok: false; reason: string } {
  if (RANK[to] <= RANK[from]) return { ok: true } // backwards always allowed
  const sit = tasks.find(t => t.type === 'sit_test')
  const uat = tasks.find(t => t.type === 'uat_test')

  if ((to === 'uat' || to === 'completed')) {
    const sitOk = sit && (sit.status === 'done' || sit.status === 'skipped')
    if (!sitOk) return { ok: false, reason: 'Finish or skip SIT Test before moving to UAT.' }
  }
  if (to === 'completed') {
    if (!uat) return { ok: false, reason: 'No UAT task found.' }
    if (uat.status !== 'done') return { ok: false, reason: 'UAT Test must be Done before Completed.' }
    if (uat.evidence_required && !uat.evidence_uploaded) {
      return { ok: false, reason: 'UAT evidence is required before Completed.' }
    }
  }
  return { ok: true }
}

export function isStoryStuck(s: UserStory, opts?: {
  defaultHours?: number; quickHitHours?: number; majorHours?: number;
}): boolean {
  if (s.stage === 'completed' || s.archived) return false
  const h = s.is_quick_hit
    ? (opts?.quickHitHours ?? 24)
    : (s.release_label ? (opts?.majorHours ?? 72) : (opts?.defaultHours ?? 48))
  return (Date.now() - +new Date(s.updated_at)) / 36e5 > h
}
