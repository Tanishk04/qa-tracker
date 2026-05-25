import { describe, expect, it } from 'vitest'
import { computeStage, isStoryStuck, validateStageMove } from '../../lib/stage'
import { makeTasks, makeStory } from '../fixtures'

// ─── computeStage ───────────────────────────────────────────────────────────

describe('computeStage', () => {
  it('returns not_started when all tasks are not_started', () => {
    expect(computeStage(makeTasks())).toBe('not_started')
  })

  it('returns in_progress when any early task is in_progress', () => {
    const tasks = makeTasks({ understand: { status: 'in_progress' } })
    expect(computeStage(tasks)).toBe('in_progress')
  })

  it('returns in_progress when a task is paused (anyStarted)', () => {
    const tasks = makeTasks({ tc_write: { status: 'paused' } })
    expect(computeStage(tasks)).toBe('in_progress')
  })

  it('returns in_progress when a task is done but sit/uat not reached', () => {
    const tasks = makeTasks({ understand: { status: 'done' } })
    expect(computeStage(tasks)).toBe('in_progress')
  })

  it('returns sit when sit_test is in_progress', () => {
    const tasks = makeTasks({ sit_test: { status: 'in_progress' } })
    expect(computeStage(tasks)).toBe('sit')
  })

  it('returns uat when sit_test is done', () => {
    const tasks = makeTasks({ sit_test: { status: 'done' } })
    expect(computeStage(tasks)).toBe('uat')
  })

  it('returns uat when sit_test is skipped', () => {
    const tasks = makeTasks({ sit_test: { status: 'skipped' } })
    expect(computeStage(tasks)).toBe('uat')
  })

  it('returns uat when uat_test is in_progress', () => {
    const tasks = makeTasks({
      sit_test: { status: 'done' },
      uat_test: { status: 'in_progress' },
    })
    expect(computeStage(tasks)).toBe('uat')
  })

  it('returns uat when uat_test is done but evidence_required and not uploaded', () => {
    const tasks = makeTasks({
      sit_test: { status: 'done' },
      uat_test: { status: 'done', evidence_required: true, evidence_uploaded: false },
    })
    expect(computeStage(tasks)).toBe('uat')
  })

  it('returns completed when uat_test done and evidence not required', () => {
    const tasks = makeTasks({
      sit_test: { status: 'done' },
      uat_test: { status: 'done', evidence_required: false, evidence_uploaded: false },
    })
    expect(computeStage(tasks)).toBe('completed')
  })

  it('returns completed when uat_test done with required evidence uploaded', () => {
    const tasks = makeTasks({
      sit_test: { status: 'done' },
      uat_test: { status: 'done', evidence_required: true, evidence_uploaded: true },
    })
    expect(computeStage(tasks)).toBe('completed')
  })

  it('returns completed even if earlier tasks are still not_started (UAT gates)', () => {
    // Edge case: manual skips + direct UAT completion
    const tasks = makeTasks({
      sit_test: { status: 'skipped' },
      uat_test: { status: 'done', evidence_required: true, evidence_uploaded: true },
    })
    expect(computeStage(tasks)).toBe('completed')
  })

  it('handles an empty task list without throwing', () => {
    expect(computeStage([])).toBe('not_started')
  })
})

// ─── validateStageMove ───────────────────────────────────────────────────────

describe('validateStageMove', () => {
  // ── Backward moves — always allowed ──────────────────────────────────────
  it('allows uat → sit (backward)', () => {
    expect(validateStageMove('uat', 'sit', makeTasks())).toEqual({ ok: true })
  })

  it('allows completed → in_progress (backward across many stages)', () => {
    expect(validateStageMove('completed', 'in_progress', makeTasks())).toEqual({ ok: true })
  })

  it('allows any stage → not_started (full reset)', () => {
    expect(validateStageMove('sit', 'not_started', makeTasks())).toEqual({ ok: true })
  })

  it('allows moving to the same stage (treated as backward/equal)', () => {
    expect(validateStageMove('in_progress', 'in_progress', makeTasks())).toEqual({ ok: true })
  })

  // ── Forward moves with no gates ───────────────────────────────────────────
  it('allows not_started → in_progress freely', () => {
    expect(validateStageMove('not_started', 'in_progress', makeTasks())).toEqual({ ok: true })
  })

  it('allows in_progress → sit freely', () => {
    expect(validateStageMove('in_progress', 'sit', makeTasks())).toEqual({ ok: true })
  })

  // ── UAT gate: SIT must be done or skipped ─────────────────────────────────
  it('blocks not_started → uat when SIT not done', () => {
    const result = validateStageMove('not_started', 'uat', makeTasks())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/SIT/i)
  })

  it('blocks in_progress → uat when SIT not done', () => {
    const result = validateStageMove('in_progress', 'uat', makeTasks())
    expect(result.ok).toBe(false)
  })

  it('allows in_progress → uat when SIT is done', () => {
    const tasks = makeTasks({ sit_test: { status: 'done' } })
    expect(validateStageMove('in_progress', 'uat', tasks)).toEqual({ ok: true })
  })

  it('allows sit → uat when SIT is skipped', () => {
    const tasks = makeTasks({ sit_test: { status: 'skipped' } })
    expect(validateStageMove('sit', 'uat', tasks)).toEqual({ ok: true })
  })

  // ── Completed gate: UAT must be done + evidence ────────────────────────────
  it('blocks uat → completed when UAT task not done', () => {
    const tasks = makeTasks({ sit_test: { status: 'done' } })
    const result = validateStageMove('uat', 'completed', tasks)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/UAT/i)
  })

  it('blocks uat → completed when UAT done but evidence required and missing', () => {
    const tasks = makeTasks({
      sit_test: { status: 'done' },
      uat_test: { status: 'done', evidence_required: true, evidence_uploaded: false },
    })
    const result = validateStageMove('uat', 'completed', tasks)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/evidence/i)
  })

  it('allows uat → completed when UAT done and evidence not required', () => {
    const tasks = makeTasks({
      sit_test: { status: 'done' },
      uat_test: { status: 'done', evidence_required: false },
    })
    expect(validateStageMove('uat', 'completed', tasks)).toEqual({ ok: true })
  })

  it('allows uat → completed when UAT done with evidence uploaded', () => {
    const tasks = makeTasks({
      sit_test: { status: 'done' },
      uat_test: { status: 'done', evidence_required: true, evidence_uploaded: true },
    })
    expect(validateStageMove('uat', 'completed', tasks)).toEqual({ ok: true })
  })

  it('also blocks completed gate when SIT not done', () => {
    // SIT gate fires before UAT gate for → completed
    const tasks = makeTasks({
      uat_test: { status: 'done', evidence_required: false },
    })
    const result = validateStageMove('uat', 'completed', tasks)
    expect(result.ok).toBe(false)
  })

  it('blocks → completed if no UAT task exists', () => {
    const tasks = makeTasks({ sit_test: { status: 'done' } }).filter(
      t => t.type !== 'uat_test',
    )
    const result = validateStageMove('uat', 'completed', tasks)
    expect(result.ok).toBe(false)
  })
})

// ─── isStoryStuck ────────────────────────────────────────────────────────────

describe('isStoryStuck', () => {
  const hoursAgo = (h: number) =>
    new Date(Date.now() - h * 60 * 60 * 1000).toISOString()

  it('never considers completed stories stuck', () => {
    const story = makeStory({ stage: 'completed', updated_at: hoursAgo(200) })
    expect(isStoryStuck(story)).toBe(false)
  })

  it('never considers archived stories stuck', () => {
    const story = makeStory({ archived: true, updated_at: hoursAgo(200) })
    expect(isStoryStuck(story)).toBe(false)
  })

  it('returns false when updated recently (within default 48 h)', () => {
    const story = makeStory({ updated_at: hoursAgo(24) })
    expect(isStoryStuck(story)).toBe(false)
  })

  it('returns true when updated more than 48 h ago (default threshold, no release)', () => {
    const story = makeStory({ updated_at: hoursAgo(49) })
    expect(isStoryStuck(story)).toBe(true)
  })

  it('uses the quickHit threshold (24 h) for quick-hit stories', () => {
    const story = makeStory({ is_quick_hit: true, updated_at: hoursAgo(25) })
    expect(isStoryStuck(story, { quickHitHours: 24 })).toBe(true)
  })

  it('quick-hit story updated < 24 h ago is not stuck', () => {
    const story = makeStory({ is_quick_hit: true, updated_at: hoursAgo(20) })
    expect(isStoryStuck(story, { quickHitHours: 24 })).toBe(false)
  })

  it('uses the major threshold (72 h) when a release label is set', () => {
    const story = makeStory({
      release_label: 'Aug 2026 Major',
      updated_at: hoursAgo(73),
    })
    expect(isStoryStuck(story, { majorHours: 72 })).toBe(true)
  })

  it('major story updated < 72 h ago is not stuck', () => {
    const story = makeStory({
      release_label: 'Aug 2026 Major',
      updated_at: hoursAgo(71),
    })
    expect(isStoryStuck(story, { majorHours: 72 })).toBe(false)
  })

  it('falls back to default 48 h when opts not provided', () => {
    const story = makeStory({ updated_at: hoursAgo(49) })
    expect(isStoryStuck(story)).toBe(true)
  })

  it('is_quick_hit takes priority over release_label for threshold selection', () => {
    // Quick hit overrides the majorHours threshold
    const story = makeStory({
      is_quick_hit: true,
      release_label: 'Aug Major',
      updated_at: hoursAgo(30),
    })
    // 30 h > quickHitHours(24) → stuck despite major label
    expect(isStoryStuck(story, { quickHitHours: 24, majorHours: 72 })).toBe(true)
  })
})
