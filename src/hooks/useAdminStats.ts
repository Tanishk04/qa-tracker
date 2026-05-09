import { useMemo } from 'react'
import { useStories, useTasks, useLogs } from './useData'
import { useDevelopers, useReleases } from './useSettings'
import { computeTaskSeconds } from '../lib/time'

export interface AdminStats {
  stories: { total: number; active: number; archived: number; completed: number }
  tasks:   { total: number; running: number; completed: number; skipped: number }
  logs:    { total: number; daysActive: number; firstAt: string | null; lastAt: string | null }
  trackedSec: number
  developers: number
  releases: number
}

export function useAdminStats(): AdminStats {
  const { data: stories = [] } = useStories()
  const { data: tasks = [] } = useTasks()
  const { data: logs = [] } = useLogs()
  const { data: developers = [] } = useDevelopers()
  const { data: releases = [] } = useReleases()

  return useMemo<AdminStats>(() => {
    const archived = stories.filter(s => s.archived).length
    const completed = stories.filter(s => s.stage === 'completed' && !s.archived).length

    const running = tasks.filter(t => t.status === 'in_progress').length
    const tCompleted = tasks.filter(t => t.status === 'done').length
    const tSkipped = tasks.filter(t => t.status === 'skipped').length

    const days = new Set<string>()
    let firstAt: string | null = null
    let lastAt: string | null = null
    for (const l of logs) {
      const ts = l.ts
      days.add(ts.slice(0, 10))
      if (!firstAt || ts < firstAt) firstAt = ts
      if (!lastAt || ts > lastAt) lastAt = ts
    }

    let totalSec = 0
    for (const t of tasks) totalSec += computeTaskSeconds(t, logs)

    return {
      stories: { total: stories.length, active: stories.length - archived, archived, completed },
      tasks:   { total: tasks.length, running, completed: tCompleted, skipped: tSkipped },
      logs:    { total: logs.length, daysActive: days.size, firstAt, lastAt },
      trackedSec: Math.floor(totalSec),
      developers: developers.length,
      releases: releases.length,
    }
  }, [stories, tasks, logs, developers, releases])
}
