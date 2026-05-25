/**
 * Factory helpers — build minimal valid objects for tests.
 * Override any field by passing a partial.
 */
import type { ActivityLog, Developer, Task, TaskType, UserStory } from '../lib/types'

const ALL_TASK_TYPES: TaskType[] = ['understand', 'tc_write', 'tc_review', 'sit_test', 'uat_test']

/**
 * Build the canonical 5-task set for one user story.
 * By default every task is not_started. Pass a map of overrides per type.
 *
 * Example:
 *   makeTasks({ sit_test: { status: 'done' }, uat_test: { status: 'in_progress' } })
 */
export function makeTasks(
  overrides: Partial<Record<TaskType, Partial<Task>>> = {},
): Task[] {
  return ALL_TASK_TYPES.map((type, i) =>
    makeTask({
      id: `task-${type}`,
      type,
      order_index: i + 1,
      evidence_required: type === 'uat_test',
      ...overrides[type],
    }),
  )
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    us_pk: 'us-1',
    type: 'understand',
    status: 'not_started',
    order_index: 1,
    started_at: null,
    completed_at: null,
    manual_adjust_seconds: 0,
    evidence_required: false,
    evidence_uploaded: false,
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

export function makeLog(overrides: Partial<ActivityLog> = {}): ActivityLog {
  return {
    id: 'log-1',
    us_pk: 'us-1',
    task_id: 'task-1',
    action: 'STARTED',
    from_status: null,
    to_status: 'in_progress',
    ts: '2024-01-01T10:00:00.000Z',
    ...overrides,
  }
}

export function makeStory(overrides: Partial<UserStory> = {}): UserStory {
  return {
    id: 'us-1',
    user_id: 'user-1',
    us_id: 'US-001',
    title: 'Test Story',
    description: null,
    priority: null,
    developer: null,
    deployed_to_uat: false,
    defect_status: null,
    notes: null,
    stage: 'not_started',
    auto_stage: true,
    release_label: null,
    release_cycle: null,
    release_track: null,
    is_quick_hit: false,
    pinned: false,
    priority_rank: null,
    archived: false,
    complexity: null,
    sf_status: null,
    sprint: null,
    acceptance_criteria: null,
    solution_approach: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

export function makeDeveloper(overrides: Partial<Developer> = {}): Developer {
  return {
    id: 'dev-1',
    user_id: 'user-1',
    name: 'Alice',
    sf_user_id: null,
    email: null,
    color: null,
    avatar_seed: null,
    active: true,
    created_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

/** Build a STARTED → PAUSED pair of logs for a given task. */
export function makeInterval(
  taskId: string,
  startIso: string,
  endIso: string,
  endAction: 'PAUSED' | 'COMPLETED' = 'PAUSED',
): ActivityLog[] {
  return [
    makeLog({ id: `log-start-${startIso}`, task_id: taskId, action: 'STARTED', ts: startIso }),
    makeLog({ id: `log-end-${endIso}`,   task_id: taskId, action: endAction,  ts: endIso }),
  ]
}
