import { createContext, useContext, useMemo, useState, ReactNode } from 'react'
import type { Filter, UserStory } from '../lib/types'
import { EMPTY_FILTER } from '../lib/types'

interface Ctx {
  filter: Filter
  setFilter: (f: Filter) => void
  applies: (s: UserStory) => boolean
}

const FilterCtx = createContext<Ctx | null>(null)

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filter, setFilter] = useState<Filter>(EMPTY_FILTER)

  const value = useMemo<Ctx>(() => ({
    filter,
    setFilter,
    applies(s) {
      if (!filter.showArchived && s.archived) return false
      if (filter.pinnedOnly && !s.pinned) return false
      if (filter.track !== 'all' && (s.release_track ?? '') !== filter.track) return false
      if (filter.release !== 'all' && (s.release_label ?? '') !== filter.release) return false
      if (filter.priorities.size > 0 && !filter.priorities.has(s.priority ?? '')) return false
      if (filter.search) {
        const q = filter.search.toLowerCase()
        const hay = [s.us_id, s.title, s.developer ?? '', s.release_label ?? '']
          .join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    },
  }), [filter])

  return <FilterCtx.Provider value={value}>{children}</FilterCtx.Provider>
}

export function useFilter() {
  const v = useContext(FilterCtx)
  if (!v) throw new Error('useFilter outside provider')
  return v
}
