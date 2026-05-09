import Papa from 'papaparse'
import * as XLSX from 'xlsx'

export interface ImportedUS {
  us_id: string
  title: string
  description?: string | null
  priority?: string | null
  developer?: string | null
  deployed_to_uat?: boolean
  defect_status?: string | null
  created_at?: string | null

  release_label?: string | null
  is_quick_hit?: boolean
  release_track?: 'major' | 'qh1' | 'qh2' | null
  sf_status?: string | null
  acceptance_criteria?: string | null
  solution_approach?: string | null
}

const KEY_ALIASES: Record<string, string> = {
  // us_id (Salesforce uses Name)
  'name': 'us_id',
  'us id': 'us_id', 'us_id': 'us_id',
  'user story': 'us_id', 'user story name': 'us_id',
  // title — prefer User_Story_Name__c
  'title': 'title', 'subject': 'title', 'summary': 'title',
  'user_story_name__c': 'title', 'user_story_name': 'title',
  // description (fallback)
  'description': 'description', 'description__c': 'description',
  // priority
  'priority': 'priority', 'priority__c': 'priority',
  // developer
  'developer': 'developer', 'developer__c': 'developer',
  'development_owner__c': 'developer', 'assigned developer': 'developer',
  'assigned_developer': 'developer', 'assignee': 'developer',
  // deployed_to_uat
  'deployed_to_uat': 'deployed_to_uat', 'deployed to uat': 'deployed_to_uat',
  'uat deployed': 'deployed_to_uat', 'uat': 'deployed_to_uat',
  // defect status (legacy)
  'defect_status': 'defect_status', 'defect status': 'defect_status',
  // SF status
  'status__c': 'sf_status', 'status': 'sf_status', 'sf_status': 'sf_status',
  // release
  'release__c': 'release_label', 'release': 'release_label', 'release_label': 'release_label',
  // quick hit (legacy SF column — used as a fallback to derive Track)
  'quick_hit__c': 'is_quick_hit', 'quick_hit': 'is_quick_hit', 'quick hit': 'is_quick_hit',
  // release track (assigned by user, but importable if column exists)
  'release_track': 'release_track', 'track': 'release_track',
  // acceptance criteria
  'acceptance_criteria__c': 'acceptance_criteria', 'acceptance criteria': 'acceptance_criteria',
  'acceptance_criteria': 'acceptance_criteria',
  // solution approach
  'solution_approach__c': 'solution_approach', 'solution approach': 'solution_approach',
  'solution_approach': 'solution_approach',
  // created_at
  'created_at': 'created_at', 'createddate': 'created_at', 'created date': 'created_at',
}

function normalizeKey(k: string): string {
  const key = k.trim().toLowerCase().replace(/\s+/g, ' ')
  return KEY_ALIASES[key] ?? key
}

function toBool(v: any): boolean {
  if (typeof v === 'boolean') return v
  const s = String(v ?? '').trim().toLowerCase()
  return ['true', 'yes', 'y', '1', 'checked', 'deployed'].includes(s)
}

/** Strip HTML tags + decode the common entities Salesforce rich text emits. */
export function stripHtml(s: string | null | undefined): string {
  if (!s) return ''
  const noTags = String(s).replace(/<\/(p|div|li|ol|ul|br)\s*>/gi, '\n').replace(/<[^>]+>/g, '')
  const entities: Record<string, string> = {
    '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
    '&quot;': '"', '&#39;': "'", '&apos;': "'",
  }
  let out = noTags
  for (const [k, v] of Object.entries(entities)) out = out.split(k).join(v)
  out = out.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
  return out.replace(/\n{3,}/g, '\n\n').trim()
}

function normalizeRow(row: Record<string, any>): ImportedUS | null {
  const out: any = {}
  for (const k of Object.keys(row)) out[normalizeKey(k)] = row[k]
  const us_id = (out.us_id ?? '').toString().trim()
  if (!us_id || us_id.startsWith('[')) return null  // skip "[PM_User_Story__c]" header rows
  return {
    us_id,
    title: (out.title || us_id).toString().trim(),
    description: stripHtml(out.description) || stripHtml(out.solution_approach) || null,
    priority: out.priority?.toString().trim() || null,
    developer: out.developer?.toString().trim() || null,
    deployed_to_uat: toBool(out.deployed_to_uat),
    defect_status: out.defect_status?.toString().trim() || null,
    created_at: out.created_at ? new Date(out.created_at).toISOString() : null,

    release_label: out.release_label?.toString().trim() || null,
    is_quick_hit: toBool(out.is_quick_hit),
    release_track: (() => {
      const v = out.release_track?.toString().trim().toLowerCase()
      if (v === 'major' || v === 'qh1' || v === 'qh2') return v
      // Fallback: legacy is_quick_hit boolean → qh1
      return toBool(out.is_quick_hit) ? 'qh1' : null
    })(),
    sf_status: out.sf_status?.toString().trim() || null,
    acceptance_criteria: stripHtml(out.acceptance_criteria) || null,
    solution_approach: stripHtml(out.solution_approach) || null,
  }
}

export function parseCSV(text: string): ImportedUS[] {
  const r = Papa.parse<Record<string, any>>(text, { header: true, skipEmptyLines: true })
  return (r.data || []).map(normalizeRow).filter(Boolean) as ImportedUS[]
}

export async function parseFile(file: File): Promise<ImportedUS[]> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv') || file.type === 'text/csv') {
    const text = await file.text()
    return parseCSV(text)
  }
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' })
  return rows.map(normalizeRow).filter(Boolean) as ImportedUS[]
}

export function parsePastedTable(text: string): ImportedUS[] {
  const firstLine = text.split(/\r?\n/)[0] || ''
  const delimiter = firstLine.includes('\t') ? '\t' : ','
  const r = Papa.parse<Record<string, any>>(text, { header: true, skipEmptyLines: true, delimiter })
  return (r.data || []).map(normalizeRow).filter(Boolean) as ImportedUS[]
}
