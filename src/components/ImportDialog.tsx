import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { parseFile, parsePastedTable, type ImportedUS } from '../lib/importer'
import { importStories } from '../lib/api'
import { useStories } from '../hooks/useData'
import { Icon } from './Icon'

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { data: stories = [] } = useStories()
  const [rows, setRows] = useState<ImportedUS[]>([])
  const [pasted, setPasted] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const [defaultRelease, setDefaultRelease] = useState('')
  const [overrideRelease, setOverrideRelease] = useState(false)

  const existingReleases = useMemo(() => {
    const set = new Set<string>()
    for (const s of stories) if (s.release_label) set.add(s.release_label)
    return Array.from(set).sort()
  }, [stories])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    setBusy(true); setMsg(null)
    try { const r = await parseFile(f); setRows(r); setMsg(`Parsed ${r.length} rows`) }
    catch (err: any) { setMsg(err.message ?? 'Parse failed') }
    finally { setBusy(false) }
  }
  function onPasteParse() {
    if (!pasted.trim()) return
    const r = parsePastedTable(pasted); setRows(r); setMsg(`Parsed ${r.length} rows`)
  }
  async function onConfirm() {
    if (rows.length === 0) return
    setBusy(true); setMsg(null)
    try {
      const r = await importStories(rows, {
        defaultRelease: overrideRelease ? defaultRelease.trim() || null : undefined,
      })
      setMsg(`Imported. New: ${r.inserted}, updated: ${r.updated}.`)
      qc.invalidateQueries({ queryKey: ['stories'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    } catch (err: any) { setMsg(err.message ?? 'Import failed') }
    finally { setBusy(false) }
  }

  const detected = useMemo(() => {
    const releases = new Map<string, number>()
    const devs = new Map<string, number>()
    for (const r of rows) {
      if (r.release_label) releases.set(r.release_label, (releases.get(r.release_label) ?? 0) + 1)
      if (r.developer)     devs.set(r.developer, (devs.get(r.developer) ?? 0) + 1)
    }
    return {
      releases: Array.from(releases.entries()).sort((a, b) => b[1] - a[1]),
      devs:     Array.from(devs.entries()).sort((a, b) => b[1] - a[1]),
    }
  }, [rows])

  return (
    <div className="modal-back">
      <div className="modal" style={{ width: 760 }}>
        <div className="modal-head">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Icon name="upload" size={16}/>
            <div className="modal-title">Import User Stories</div>
          </div>
          <button className="btn-icon" onClick={onClose}><Icon name="x" size={16}/></button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 0 }}>
            Upload a CSV/XLSX from Salesforce Inspector, or paste TSV/CSV directly.
            Required column: <span className="mono">us_id</span> / <span className="mono">Name</span>.
            Auto-mapped: <span className="mono">User_Story_Name__c</span>, <span className="mono">Release__c</span>, <span className="mono">Quick_Hit__c</span>,
            <span className="mono"> Status__c</span>, <span className="mono">Priority__c</span>,
            <span className="mono"> Acceptance_Criteria__c</span>, <span className="mono">Solution_Approach__c</span>, <span className="mono">Development_Owner__c</span>.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="label-cap">Upload file</label>
              <input type="file" accept=".csv,.xlsx,.xls" onChange={onFile}
                style={{ fontSize: 13, color: 'var(--text-muted)' }}/>
            </div>
            <div>
              <label className="label-cap">Or paste table</label>
              <textarea className="fld mono" style={{ width: '100%', minHeight: 100, fontSize: 12 }}
                placeholder="Paste TSV/CSV…" value={pasted} onChange={e => setPasted(e.target.value)}/>
              <button className="btn btn-outline" style={{ marginTop: 6 }} onClick={onPasteParse}>Parse</button>
            </div>
          </div>

          {rows.length > 0 && (
            <>
              <div style={{
                marginTop: 16, padding: 12, border: '1px solid var(--border)',
                borderRadius: 8, background: 'var(--bg-card)',
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={overrideRelease}
                    onChange={e => setOverrideRelease(e.target.checked)}/>
                  Bulk-assign all imported stories to a release
                </label>
                {overrideRelease && (
                  <input list="release-list" className="fld" placeholder="e.g. Aug 2026 Major"
                    value={defaultRelease} onChange={e => setDefaultRelease(e.target.value)}/>
                )}
                <datalist id="release-list">
                  {existingReleases.map(r => <option key={r} value={r}/>)}
                </datalist>
                {!overrideRelease && detected.releases.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Detected releases: {detected.releases.slice(0, 4).map(([r, n]) =>
                      <span key={r} className="card-pri" style={{ marginLeft: 6, background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>{r.slice(0, 16)} ×{n}</span>
                    )}
                  </div>
                )}
                {detected.devs.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Detected {detected.devs.length} developer ID{detected.devs.length === 1 ? '' : 's'} —
                    map them in <strong>Setup → Developers</strong>.
                  </div>
                )}
              </div>

              <div className="section-label" style={{ marginTop: 16 }}>Preview ({rows.length})</div>
              <div style={{
                maxHeight: 260, overflow: 'auto',
                border: '1px solid var(--border)', borderRadius: 8,
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{
                    position: 'sticky', top: 0, background: 'var(--bg-elev)',
                    color: 'var(--text-dim)', textAlign: 'left',
                  }}>
                    <tr>
                      {['US ID', 'Title', 'Release', 'QH', 'Priority', 'SF Status'].map(h =>
                        <th key={h} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 200).map((r, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                        <td className="mono" style={{ padding: '6px 10px', color: 'var(--accent)' }}>{r.us_id}</td>
                        <td style={{ padding: '6px 10px', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.title}>{r.title}</td>
                        <td style={{ padding: '6px 10px' }}>{overrideRelease ? <span style={{ color: 'var(--accent)' }}>{defaultRelease || '—'}</span> : (r.release_label ?? '')}</td>
                        <td style={{ padding: '6px 10px' }}>{r.is_quick_hit ? '✓' : ''}</td>
                        <td style={{ padding: '6px 10px' }}>{r.priority}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{r.sf_status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {msg && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>{msg}</div>}
        </div>
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || rows.length === 0} onClick={onConfirm}>
            {busy ? '…' : `Import ${rows.length}`}
          </button>
        </div>
      </div>
    </div>
  )
}
