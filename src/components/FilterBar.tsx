import { useFilter } from '../hooks/useFilter'
import { useReleases, useSettings } from '../hooks/useSettings'
import { RELEASE_TRACKS, RELEASE_TRACK_LABELS, type ReleaseTrack } from '../lib/types'
import { Icon } from './Icon'

export function FilterBar() {
  const { filter, setFilter } = useFilter()
  const { data: releases = [] } = useReleases()
  const { data: settings } = useSettings()

  const showSfPriority = !settings?.use_custom_priority
  const priItems: [string, string][] = [['', 'All'], ['High', 'High'], ['Medium', 'Med'], ['Low', 'Low']]
  const setPriority = (val: string) => {
    setFilter({ ...filter, priorities: val ? new Set([val]) : new Set() })
  }
  const currentPri = filter.priorities.size === 0 ? '' : Array.from(filter.priorities)[0]

  return (
    <div className="filters">
      <div className="search-input">
        <Icon name="search" size={14}/>
        <input
          value={filter.search}
          onChange={e => setFilter({ ...filter, search: e.target.value })}
          placeholder="Search US, title, developer, release…"
        />
      </div>

      <select
        className="select"
        value={filter.release}
        onChange={e => setFilter({ ...filter, release: e.target.value as any })}
      >
        <option value="all">All releases</option>
        {releases.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
      </select>

      {/* Track segmented control: All / Major / QH1 / QH2 */}
      <div className="seg" role="group" aria-label="Release track">
        <button className={filter.track === 'all' ? 'active' : ''}
          onClick={() => setFilter({ ...filter, track: 'all' })}>All</button>
        {RELEASE_TRACKS.map(t => (
          <button key={t}
            className={filter.track === t ? 'active' : ''}
            onClick={() => setFilter({ ...filter, track: t as ReleaseTrack })}>
            {RELEASE_TRACK_LABELS[t]}
          </button>
        ))}
      </div>

      {showSfPriority && (
        <div className="seg" role="group" aria-label="Priority">
          {priItems.map(([k, l]) => (
            <button key={k} className={currentPri === k ? 'active' : ''} onClick={() => setPriority(k)}>{l}</button>
          ))}
        </div>
      )}

      <div style={{ flex: 1 }} />

      <button className={`chip-toggle ${filter.pinnedOnly ? 'on' : ''}`}
        onClick={() => setFilter({ ...filter, pinnedOnly: !filter.pinnedOnly })}>
        <Icon name="star" size={13}/> Pinned
      </button>
      <button className={`chip-toggle ${filter.showArchived ? 'on' : ''}`}
        onClick={() => setFilter({ ...filter, showArchived: !filter.showArchived })}>
        <Icon name="archive" size={13}/> Archived
      </button>
    </div>
  )
}
