import { useEffect, useMemo, useRef, useState } from 'react'
import { useStories } from '../hooks/useData'
import type { UserStory } from '../lib/types'
import { Icon } from './Icon'

interface Props {
  onPick: (s: UserStory) => void
}

export function QuickFind({ onPick }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: stories = [] } = useStories()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMac = navigator.platform.toLowerCase().includes('mac')
      if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setOpen(o => !o)
      } else if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    if (open) { setQ(''); setHi(0); setTimeout(() => inputRef.current?.focus(), 10) }
  }, [open])

  const matches = useMemo(() => {
    const all = stories.filter(s => !s.archived)
    if (!q.trim()) return all.slice(0, 30)
    const needle = q.toLowerCase()
    return all.filter(s =>
      s.us_id.toLowerCase().includes(needle) ||
      s.title.toLowerCase().includes(needle) ||
      (s.release_label ?? '').toLowerCase().includes(needle) ||
      (s.developer ?? '').toLowerCase().includes(needle)
    ).slice(0, 30)
  }, [q, stories])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(i => Math.min(i + 1, matches.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHi(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter')     { e.preventDefault(); const m = matches[hi]; if (m) { onPick(m); setOpen(false) } }
  }

  if (!open) return null
  return (
    <div className="palette-back" onClick={() => setOpen(false)}>
      <div className="palette" onClick={e => e.stopPropagation()}>
        <input ref={inputRef} value={q}
          onChange={e => { setQ(e.target.value); setHi(0) }}
          onKeyDown={onKeyDown}
          placeholder="Jump to a US — type ID, title, release…"/>
        <div className="palette-list">
          {matches.length === 0 && (
            <div style={{ padding: '24px 16px', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
              No matches
            </div>
          )}
          {matches.map((s, i) => (
            <button key={s.id}
              className={`palette-item ${i === hi ? 'hi' : ''}`}
              onClick={() => { onPick(s); setOpen(false) }}
              onMouseEnter={() => setHi(i)}>
              <span className="card-id mono" style={{ width: 80 }}>{s.us_id}</span>
              <span style={{ fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
              {s.release_label && <span className="card-pri" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>{s.release_label.slice(0, 16)}</span>}
              {s.release_track && s.release_track !== 'major' && (
                <span className="card-pri" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                  {s.release_track === 'qh1' ? 'QH1' : 'QH2'}
                </span>
              )}
              {s.pinned && <Icon name="star" size={12} />}
            </button>
          ))}
        </div>
        <div className="palette-foot">
          <span>↑↓ navigate · Enter open · Esc close</span>
          <span>Ctrl/Cmd + K to toggle</span>
        </div>
      </div>
    </div>
  )
}
