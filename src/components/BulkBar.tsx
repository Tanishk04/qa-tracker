import { useQueryClient } from '@tanstack/react-query'
import { bulkSkipTcReview, bulkUpdate } from '../lib/api'
import { useStories } from '../hooks/useData'
import { useMemo } from 'react'
import { Icon } from './Icon'
import { useDialog } from './Dialog'

interface Props {
  ids: Set<string>
  clear: () => void
}

export function BulkBar({ ids, clear }: Props) {
  const qc = useQueryClient()
  const dialog = useDialog()
  const { data: stories = [] } = useStories()
  const releases = useMemo(() => {
    const set = new Set<string>()
    for (const s of stories) if (s.release_label) set.add(s.release_label)
    return Array.from(set).sort()
  }, [stories])

  if (ids.size === 0) return null
  const idsArr = Array.from(ids)

  function inv() {
    qc.invalidateQueries({ queryKey: ['stories'] })
    qc.invalidateQueries({ queryKey: ['tasks'] })
  }
  async function pin(v: boolean) { await bulkUpdate(idsArr, { pinned: v } as any); inv() }
  async function archive(v: boolean) { await bulkUpdate(idsArr, { archived: v } as any); inv() }
  async function setRelease() {
    const v = await dialog.prompt({
      title: `Assign release to ${ids.size} ${ids.size === 1 ? 'story' : 'stories'}`,
      label: releases.length > 0 ? `Existing: ${releases.join(', ')}` : 'Release name',
      placeholder: 'e.g. Aug 2026 Major',
      allowEmpty: true,
    })
    if (v == null) return
    await bulkUpdate(idsArr, { release_label: v || null } as any); inv()
  }
  async function setPriority() {
    const v = await dialog.prompt({
      title: `Set priority on ${ids.size} ${ids.size === 1 ? 'story' : 'stories'}`,
      label: 'High / Medium / Low (empty to clear)',
      placeholder: 'High',
      allowEmpty: true,
      validate: (val) => {
        if (!val) return null
        if (!['high', 'medium', 'low'].includes(val.toLowerCase()))
          return 'Must be High, Medium, or Low'
        return null
      },
    })
    if (v == null) return
    const norm = v ? v[0].toUpperCase() + v.slice(1).toLowerCase() : null
    await bulkUpdate(idsArr, { priority: norm } as any); inv()
  }
  async function skipTcReview() {
    const ok = await dialog.confirm({
      title: `Skip TC Review on ${ids.size} ${ids.size === 1 ? 'story' : 'stories'}?`,
      body: 'Marks the TC Review task as skipped — useful when review is delegated externally.',
      confirmLabel: 'Skip',
    })
    if (!ok) return
    await bulkSkipTcReview(idsArr); inv()
  }

  return (
    <div style={{
      position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
      zIndex: 25, background: 'var(--bg-elev)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '8px 10px', boxShadow: 'var(--shadow-lg)',
      display: 'flex', gap: 4, alignItems: 'center',
    }}>
      <span style={{ fontSize: 12, fontWeight: 500, padding: '0 8px', color: 'var(--text)' }}>
        {ids.size} selected
      </span>
      <button className="btn btn-ghost" onClick={() => pin(true)}><Icon name="star" size={12}/> Pin</button>
      <button className="btn btn-ghost" onClick={() => pin(false)}>Unpin</button>
      <button className="btn btn-ghost" onClick={setRelease}><Icon name="folder" size={12}/> Release</button>
      <button className="btn btn-ghost" onClick={setPriority}>Priority</button>
      <button className="btn btn-ghost" onClick={skipTcReview}><Icon name="skip" size={12}/> Skip TC Review</button>
      <button className="btn btn-ghost" onClick={() => archive(true)}><Icon name="archive" size={12}/> Archive</button>
      <button className="btn btn-ghost" onClick={() => archive(false)}>Unarchive</button>
      <button className="btn btn-ghost" onClick={clear}><Icon name="x" size={12}/></button>
    </div>
  )
}
