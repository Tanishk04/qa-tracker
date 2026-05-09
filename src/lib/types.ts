export type TaskType =
  | 'understand' | 'tc_write' | 'tc_review' | 'sit_test' | 'uat_test'

export type TaskStatus = 'not_started' | 'in_progress' | 'paused' | 'done' | 'skipped'

export type Stage = 'not_started' | 'in_progress' | 'sit' | 'uat' | 'completed'

export interface UserStory {
  id: string
  user_id: string
  us_id: string
  title: string
  description: string | null
  priority: string | null
  developer: string | null         // raw value from SF (often an SF user ID)
  deployed_to_uat: boolean
  defect_status: string | null
  notes: string | null
  stage: Stage
  auto_stage: boolean

  release_label: string | null
  release_cycle: string | null     // legacy — kept in DB, hidden from UI
  release_track: ReleaseTrack | null
  is_quick_hit: boolean              // derived/legacy — true iff release_track in (qh1, qh2)
  pinned: boolean
  priority_rank: number | null
  archived: boolean
  complexity: Complexity | null

  sf_status: string | null
  sprint: string | null
  acceptance_criteria: string | null
  solution_approach: string | null

  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  us_pk: string
  type: TaskType
  status: TaskStatus
  order_index: number
  started_at: string | null
  completed_at: string | null
  manual_adjust_seconds: number
  evidence_required: boolean
  evidence_uploaded: boolean
  updated_at: string
}

export interface ActivityLog {
  id: string
  us_pk: string
  task_id: string
  action: 'STARTED' | 'PAUSED' | 'COMPLETED' | 'REOPENED' | 'SKIPPED'
  from_status: TaskStatus | null
  to_status: TaskStatus | null
  ts: string
}

export interface Developer {
  id: string
  user_id: string
  name: string
  sf_user_id: string | null
  email: string | null
  color: string | null
  avatar_seed: string | null
  active: boolean
  created_at: string
}

export type ReleaseTrack = 'major' | 'qh1' | 'qh2'
export const RELEASE_TRACKS: ReleaseTrack[] = ['major', 'qh1', 'qh2']
export const RELEASE_TRACK_LABELS: Record<ReleaseTrack, string> = {
  major: 'Major',
  qh1: 'QH1',
  qh2: 'QH2',
}

export interface Release {
  id: string
  user_id: string
  name: string
  created_at: string
}

export type Complexity = 'XS' | 'S' | 'M' | 'L' | 'XL'
export const COMPLEXITY_LEVELS: Complexity[] = ['XS', 'S', 'M', 'L', 'XL']
export const COMPLEXITY_LABELS: Record<Complexity, string> = {
  XS: 'Trivial',
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  XL: 'Massive',
}

export interface AppSettings {
  user_id: string
  use_custom_priority: boolean
  hide_uat_field: boolean
  long_run_hours: number
  idle_minutes: number
  stuck_default_hours: number
  stuck_quickhit_hours: number
  stuck_major_hours: number
}

export const DEFAULT_SETTINGS: Omit<AppSettings, 'user_id'> = {
  use_custom_priority: false,
  hide_uat_field: true,
  long_run_hours: 3,
  idle_minutes: 30,
  stuck_default_hours: 48,
  stuck_quickhit_hours: 24,
  stuck_major_hours: 72,
}

export const TASK_LABELS: Record<TaskType, string> = {
  understand: 'Understand',
  tc_write: 'TC Write',
  tc_review: 'TC Review',
  sit_test: 'SIT Test',
  uat_test: 'UAT Test',
}

export const TASK_ORDER: TaskType[] = [
  'understand', 'tc_write', 'tc_review', 'sit_test', 'uat_test',
]

export const STAGE_LABELS: Record<Stage, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  sit: 'SIT',
  uat: 'UAT',
  completed: 'Completed',
}

export const STAGES: Stage[] = ['not_started', 'in_progress', 'sit', 'uat', 'completed']

export const PRIORITY_LEVELS = ['High', 'Medium', 'Low'] as const
export type PriorityLevel = typeof PRIORITY_LEVELS[number]

/** Salesforce User_Story_Status__c picklist values (verbatim). */
export const SF_STATUSES = [
  '0-Draft-Not yet ready',
  '0-Business Input Needed',
  '0-Functional Groomed',
  '0-Technical Groomed',
  '1-Design Ready',
  '2-Development',
  '3-UAT-Migrate to UAT',
  '4-Ready for Business UAT',
  '4-Ready for Prod',
  '4-UAT Onhold',
  '5-Implemented',
  'N/A-Cancelled',
] as const

export interface Filter {
  search: string
  release: string | 'all'
  track: ReleaseTrack | 'all'
  priorities: Set<string>
  pinnedOnly: boolean
  showArchived: boolean
}

export const EMPTY_FILTER: Filter = {
  search: '', release: 'all', track: 'all', priorities: new Set(),
  pinnedOnly: false, showArchived: false,
}
