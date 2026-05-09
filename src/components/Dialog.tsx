import {
  createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState,
} from 'react'
import { Icon } from './Icon'

// ============================================================
// Types
// ============================================================

export interface ConfirmOptions {
  title: string
  body?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

export interface PromptOptions {
  title: string
  body?: ReactNode
  label?: string
  placeholder?: string
  initialValue?: string
  confirmLabel?: string
  cancelLabel?: string
  validate?: (value: string) => string | null
  /** If true, the field allows empty submission (returns ''). Default: false. */
  allowEmpty?: boolean
}

interface DialogApi {
  /** Resolves true on confirm, false on cancel. */
  confirm(opts: ConfirmOptions): Promise<boolean>
  /** Resolves the entered string on confirm, null on cancel. */
  prompt(opts: PromptOptions): Promise<string | null>
}

// Internal queue items
type ConfirmItem = {
  kind: 'confirm'
  id: number
  opts: ConfirmOptions
  resolve: (v: boolean) => void
}
type PromptItem = {
  kind: 'prompt'
  id: number
  opts: PromptOptions
  resolve: (v: string | null) => void
}
type Item = ConfirmItem | PromptItem

// ============================================================
// Context
// ============================================================

const DialogCtx = createContext<DialogApi | null>(null)

export function useDialog(): DialogApi {
  const v = useContext(DialogCtx)
  if (!v) throw new Error('useDialog must be used inside <DialogProvider>')
  return v
}

// ============================================================
// Provider
// ============================================================

let nextId = 1

export function DialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Item[]>([])

  const api: DialogApi = {
    confirm(opts) {
      return new Promise<boolean>(resolve => {
        setQueue(q => [...q, { kind: 'confirm', id: nextId++, opts, resolve }])
      })
    },
    prompt(opts) {
      return new Promise<string | null>(resolve => {
        setQueue(q => [...q, { kind: 'prompt', id: nextId++, opts, resolve }])
      })
    },
  }

  function resolveTop(value: any) {
    setQueue(q => {
      if (q.length === 0) return q
      const top = q[0]
      ;(top.resolve as any)(value)
      return q.slice(1)
    })
  }

  const top = queue[0]

  return (
    <DialogCtx.Provider value={api}>
      {children}
      {top && (
        top.kind === 'confirm'
          ? <ConfirmDialog key={top.id} item={top} resolve={resolveTop} />
          : <PromptDialog key={top.id} item={top} resolve={resolveTop} />
      )}
    </DialogCtx.Provider>
  )
}

// ============================================================
// Confirm
// ============================================================

function ConfirmDialog({ item, resolve }: { item: ConfirmItem; resolve: (v: boolean) => void }) {
  const { opts } = item
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const confirmRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    confirmRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); resolve(false) }
      else if (e.key === 'Enter') { e.preventDefault(); resolve(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [resolve])

  return (
    <div className="modal-back" onClick={() => resolve(false)}>
      <div className="modal" style={{ width: 440 }} onClick={e => e.stopPropagation()} role="dialog" aria-labelledby="dlg-title">
        <div className="modal-head">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Icon name={opts.destructive ? 'flame' : 'check'} size={16} />
            <div className="modal-title" id="dlg-title">{opts.title}</div>
          </div>
          <button className="btn-icon" onClick={() => resolve(false)} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        {opts.body && (
          <div className="modal-body" style={{ paddingTop: 14 }}>
            {typeof opts.body === 'string'
              ? <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{opts.body}</p>
              : opts.body}
          </div>
        )}
        <div style={{
          padding: '12px 18px',
          borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button ref={cancelRef} className="btn btn-outline" onClick={() => resolve(false)}>
            {opts.cancelLabel ?? 'Cancel'}
          </button>
          <button
            ref={confirmRef}
            className={opts.destructive ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={() => resolve(true)}>
            {opts.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Prompt
// ============================================================

function PromptDialog({ item, resolve }: { item: PromptItem; resolve: (v: string | null) => void }) {
  const { opts } = item
  const [value, setValue] = useState(opts.initialValue ?? '')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); resolve(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [resolve])

  const submit = useCallback(() => {
    const trimmed = value.trim()
    if (!opts.allowEmpty && !trimmed) {
      setError('Required')
      return
    }
    if (opts.validate) {
      const err = opts.validate(trimmed)
      if (err) { setError(err); return }
    }
    resolve(trimmed)
  }, [value, opts, resolve])

  return (
    <div className="modal-back" onClick={() => resolve(null)}>
      <div className="modal" style={{ width: 460 }} onClick={e => e.stopPropagation()} role="dialog" aria-labelledby="dlg-title">
        <div className="modal-head">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Icon name="edit" size={16} />
            <div className="modal-title" id="dlg-title">{opts.title}</div>
          </div>
          <button className="btn-icon" onClick={() => resolve(null)} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body" style={{ paddingTop: 14 }}>
          {opts.body && (
            <div style={{ marginBottom: 10, fontSize: 13, color: 'var(--text-muted)' }}>
              {opts.body}
            </div>
          )}
          {opts.label && <label className="label-cap">{opts.label}</label>}
          <input
            ref={inputRef}
            className="fld"
            style={{ width: '100%' }}
            value={value}
            placeholder={opts.placeholder}
            onChange={e => { setValue(e.target.value); if (error) setError(null) }}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); submit() }
            }}
          />
          {error && (
            <div style={{ color: 'oklch(0.72 0.16 25)', fontSize: 12, marginTop: 6 }}>{error}</div>
          )}
        </div>
        <div style={{
          padding: '12px 18px',
          borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button className="btn btn-outline" onClick={() => resolve(null)}>
            {opts.cancelLabel ?? 'Cancel'}
          </button>
          <button className="btn btn-primary" onClick={submit}>
            {opts.confirmLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}
