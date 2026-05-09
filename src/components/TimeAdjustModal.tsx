import { useState } from 'react'
import { fmtDuration } from '../lib/time'
import { Icon } from './Icon'

interface Props {
  taskName: string
  /** Total time the task currently has, in seconds (logged + manual_adjust). */
  currentTotalSec: number
  /** Existing manual adjust seconds (added/subtracted on top of logged time). */
  existingAdjustSec: number
  onClose: () => void
  /**
   * Save the new manual_adjust_seconds value plus an option to also push the
   * **delta** into today's tracked-time bucket (paired activity logs at today's start).
   * `applyToToday` is only meaningful when the delta is positive.
   */
  onSave: (newAdjustSec: number, applyToToday: boolean) => void
}

const INCREMENTS = [
  { label: '+5m', delta: 5 * 60 },
  { label: '+15m', delta: 15 * 60 },
  { label: '+30m', delta: 30 * 60 },
  { label: '+1h', delta: 60 * 60 },
  { label: '−5m', delta: -5 * 60 },
  { label: '−15m', delta: -15 * 60 },
  { label: '−30m', delta: -30 * 60 },
  { label: '−1h', delta: -60 * 60 },
]

export function TimeAdjustModal({ taskName, currentTotalSec, existingAdjustSec, onClose, onSave }: Props) {
  const [adjust, setAdjust] = useState(existingAdjustSec)
  const [applyToToday, setApplyToToday] = useState(false)
  const loggedSec = currentTotalSec - existingAdjustSec
  const previewTotal = Math.max(0, loggedSec + adjust)
  const delta = adjust - existingAdjustSec
  // Apply-to-today only makes sense for a positive delta — we can't subtract from today's logs cleanly.
  const todayEligible = delta > 0
  // Disable a button if applying it would drop total below 0
  const disabled = (d: number) => loggedSec + adjust + d < 0

  function bump(d: number) {
    if (loggedSec + adjust + d < 0) return
    setAdjust(a => a + d)
  }
  function reset() { setAdjust(0); setApplyToToday(false) }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="clock" size={16}/>
            <div className="modal-title">Adjust time</div>
          </div>
          <button className="btn-icon" onClick={onClose}><Icon name="x" size={16}/></button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
            {taskName}
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
            padding: 14, marginBottom: 16,
            border: '1px solid var(--border)', borderRadius: 8,
            background: 'var(--bg-card)',
          }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Tracked
              </div>
              <div className="mono" style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>
                {fmtDuration(Math.max(0, loggedSec))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                After adjust
              </div>
              <div className="mono" style={{
                fontSize: 18, fontWeight: 600, marginTop: 4,
                color: adjust > 0 ? 'oklch(0.74 0.11 150)' : adjust < 0 ? 'oklch(0.72 0.16 25)' : 'var(--text)',
              }}>
                {fmtDuration(previewTotal)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                {adjust > 0 ? `+${fmtDuration(adjust)}` : adjust < 0 ? `−${fmtDuration(-adjust)}` : 'no change'}
              </div>
            </div>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 8,
          }}>
            {INCREMENTS.slice(0, 4).map(({ label, delta }) => (
              <button key={label}
                className="btn btn-outline"
                style={{ justifyContent: 'center' }}
                onClick={() => bump(delta)}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {INCREMENTS.slice(4).map(({ label, delta }) => (
              <button key={label}
                className="btn btn-outline"
                style={{
                  justifyContent: 'center',
                  opacity: disabled(delta) ? 0.4 : 1,
                  cursor: disabled(delta) ? 'not-allowed' : 'pointer',
                }}
                disabled={disabled(delta)}
                title={disabled(delta) ? 'Would make total negative' : undefined}
                onClick={() => bump(delta)}>
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={reset} disabled={adjust === 0 && !applyToToday}>
              <Icon name="rotate" size={12}/> Reset to no adjust
            </button>
          </div>

          {/* Apply-to-today toggle — only shown when delta is positive */}
          <div style={{
            marginTop: 14, padding: 12,
            border: `1px solid ${applyToToday ? 'oklch(from var(--accent) l c h / 0.5)' : 'var(--border)'}`,
            borderRadius: 8,
            background: applyToToday ? 'var(--accent-soft)' : 'var(--bg-card)',
            opacity: todayEligible ? 1 : 0.5,
          }}>
            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              cursor: todayEligible ? 'pointer' : 'not-allowed',
            }}>
              <input
                type="checkbox"
                checked={applyToToday}
                disabled={!todayEligible}
                onChange={e => setApplyToToday(e.target.checked)}
                style={{ marginTop: 2, accentColor: 'var(--accent)' }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                  Also count toward Time Today
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {todayEligible
                    ? `Adds ${fmtDuration(delta)} to today's tracked time. The Time today stat and Today's Focus rail will reflect it.`
                    : 'Available only for positive adjustments — subtracting time from today isn\'t supported.'}
                </div>
              </div>
            </label>
          </div>
        </div>
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary"
            disabled={adjust === existingAdjustSec}
            onClick={() => onSave(adjust, applyToToday && todayEligible)}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
