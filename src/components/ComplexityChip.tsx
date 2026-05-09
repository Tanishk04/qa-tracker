import { useEffect, useRef, useState } from 'react'
import type { Complexity } from '../lib/types'
import { COMPLEXITY_LABELS, COMPLEXITY_LEVELS } from '../lib/types'

interface Props {
  value: Complexity | null
  onChange: (next: Complexity | null) => void
  /** Stop click propagation upward (for cards inside dnd context). */
  stopPropagation?: boolean
}

export function ComplexityChip({ value, onChange, stopPropagation }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function pick(v: Complexity | null, e: React.MouseEvent) {
    if (stopPropagation) e.stopPropagation()
    onChange(v); setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}
         onClick={(e) => { if (stopPropagation) e.stopPropagation() }}>
      {value ? (
        <button className={`cx-pill cx-${value}`}
          onClick={(e) => { if (stopPropagation) e.stopPropagation(); setOpen(o => !o) }}
          title={`${value} — ${COMPLEXITY_LABELS[value]} (click to change)`}>
          {value}
        </button>
      ) : (
        <button className="cx-empty"
          onClick={(e) => { if (stopPropagation) e.stopPropagation(); setOpen(o => !o) }}
          title="Set complexity">
          +cx
        </button>
      )}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 20,
          background: 'var(--bg-elev)', border: '1px solid var(--border-strong)',
          borderRadius: 8, padding: 6, display: 'flex', gap: 4,
          boxShadow: 'var(--shadow-md)', whiteSpace: 'nowrap',
        }}>
          {COMPLEXITY_LEVELS.map(lvl => (
            <button key={lvl} className={`cx-pill cx-${lvl}`}
              style={{ cursor: 'pointer', padding: '4px 8px' }}
              onClick={(e) => pick(lvl, e)}
              title={COMPLEXITY_LABELS[lvl]}>
              {lvl}
            </button>
          ))}
          {value && (
            <button className="cx-empty" style={{ padding: '4px 8px' }}
              onClick={(e) => pick(null, e)}>clear</button>
          )}
        </div>
      )}
    </div>
  )
}
