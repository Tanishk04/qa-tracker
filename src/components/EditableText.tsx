import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

interface Props {
  value: string | null | undefined
  onSave: (next: string) => Promise<void> | void
  multiline?: boolean
  placeholder?: string
  /** Validation: return string error or null/empty for OK. */
  validate?: (next: string) => string | null
  /** Custom display class (overrides default text styling). */
  className?: string
  /** Inline style for the display element. */
  style?: React.CSSProperties
  /** Treat empty / null value as a click-to-add affordance. */
  emptyLabel?: string
}

/**
 * Click-to-edit text. Single-line or multiline.
 * - Enter → save (single-line); Cmd/Ctrl+Enter → save (multiline); Esc → cancel; blur → save.
 * - On save, surfaces validation errors inline + reverts to display on Esc.
 */
export function EditableText({
  value,
  onSave,
  multiline = false,
  placeholder = 'Click to add…',
  validate,
  className,
  style,
  emptyLabel,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  useEffect(() => { setDraft(value ?? '') }, [value])
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      if ('select' in inputRef.current) inputRef.current.select()
    }
  }, [editing])

  function start(e: React.MouseEvent) {
    e.stopPropagation()
    if (saving) return
    setDraft(value ?? '')
    setError(null)
    setEditing(true)
  }

  async function commit() {
    const next = draft.trim()
    if (next === (value ?? '').trim()) { setEditing(false); return }
    if (validate) {
      const err = validate(next)
      if (err) { setError(err); return }
    }
    setSaving(true)
    try {
      await onSave(next)
      setError(null)
      setEditing(false)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save')
    } finally { setSaving(false) }
  }

  function cancel() {
    setDraft(value ?? '')
    setError(null)
    setEditing(false)
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); cancel(); return }
    if (e.key === 'Enter') {
      if (multiline && !(e.metaKey || e.ctrlKey)) return  // multiline allows newline
      e.preventDefault()
      commit()
    }
  }

  if (editing) {
    if (multiline) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <textarea
            ref={el => { inputRef.current = el }}
            className="fld"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={onKey}
            onBlur={commit}
            placeholder={placeholder}
            style={{ width: '100%', minHeight: 90, fontSize: 13 }}
            disabled={saving}
          />
          <div style={{ fontSize: 11, color: error ? 'oklch(0.72 0.16 25)' : 'var(--text-dim)' }}>
            {error ?? `${saving ? 'Saving…' : 'Cmd/Ctrl+Enter to save · Esc to cancel'}`}
          </div>
        </div>
      )
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <input
          ref={el => { inputRef.current = el }}
          className="fld"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={commit}
          placeholder={placeholder}
          style={{ minWidth: 120, padding: '4px 8px', fontSize: 13, ...style }}
          disabled={saving}
        />
        {error && <span style={{ fontSize: 11, color: 'oklch(0.72 0.16 25)' }}>{error}</span>}
        {saving && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>…</span>}
      </span>
    )
  }

  const isEmpty = !value || (typeof value === 'string' && !value.trim())
  return (
    <button
      type="button"
      onClick={start}
      className={`editable ${className ?? ''} ${isEmpty ? 'editable-empty' : ''}`}
      style={style}
      title="Click to edit"
    >
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {isEmpty ? (emptyLabel ?? placeholder) : value}
      </span>
      <Icon name="edit" size={11} className="editable-icon" />
    </button>
  )
}
