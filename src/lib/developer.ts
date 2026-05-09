import type { Developer } from './types'

/** Resolve a story's raw `developer` text (often an SF user id) to a Developer record. */
export function resolveDev(raw: string | null, devs: Developer[]): Developer | null {
  if (!raw) return null
  const r = raw.trim()
  return devs.find(d => d.sf_user_id === r) ?? devs.find(d => d.name.toLowerCase() === r.toLowerCase()) ?? null
}

/** Display name for a story; returns null if no good name available. */
export function devDisplay(raw: string | null, devs: Developer[]): string | null {
  const d = resolveDev(raw, devs)
  if (d) return d.name
  // raw value that LOOKS like a Salesforce ID (15/18 chars, alphanumeric) → don't show
  if (raw && /^[a-zA-Z0-9]{15,18}$/.test(raw.trim())) return null
  return raw
}
