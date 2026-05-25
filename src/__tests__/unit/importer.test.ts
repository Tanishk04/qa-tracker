import { describe, expect, it } from 'vitest'
import { stripHtml, parseCSV, parsePastedTable } from '../../lib/importer'

// ─── stripHtml ───────────────────────────────────────────────────────────────

describe('stripHtml', () => {
  it('returns empty string for null/undefined/empty', () => {
    expect(stripHtml(null)).toBe('')
    expect(stripHtml(undefined)).toBe('')
    expect(stripHtml('')).toBe('')
  })

  it('returns plain text unchanged', () => {
    expect(stripHtml('Hello world')).toBe('Hello world')
  })

  it('strips inline tags', () => {
    expect(stripHtml('<b>bold</b> and <em>italic</em>')).toBe('bold and italic')
  })

  it('converts block closing tags to newlines', () => {
    const html = '<p>First</p><p>Second</p>'
    const out = stripHtml(html)
    expect(out).toContain('First')
    expect(out).toContain('Second')
    expect(out).toMatch(/\n/)
  })

  it('decodes &amp; &lt; &gt; &quot; &#39;', () => {
    expect(stripHtml('a &amp; b')).toBe('a & b')
    expect(stripHtml('&lt;tag&gt;')).toBe('<tag>')
    expect(stripHtml('say &quot;hi&quot;')).toBe('say "hi"')
    expect(stripHtml('it&#39;s')).toBe("it's")
  })

  it('decodes &nbsp; to a regular space', () => {
    expect(stripHtml('a&nbsp;b')).toBe('a b')
  })

  it('decodes numeric character references', () => {
    expect(stripHtml('&#65;')).toBe('A')  // &#65; = 'A'
  })

  it('collapses more-than-2 consecutive newlines', () => {
    const html = '<p>A</p><p></p><p></p><p>B</p>'
    const out = stripHtml(html)
    expect(out).not.toMatch(/\n{3,}/)
  })

  it('trims leading/trailing whitespace', () => {
    expect(stripHtml('  hello  ')).toBe('hello')
  })
})

// ─── parseCSV — field aliasing ───────────────────────────────────────────────

describe('parseCSV — field aliasing', () => {
  function csvWith(headers: string[], values: string[]): string {
    return [headers.join(','), values.join(',')].join('\n')
  }

  it('maps "Name" column to us_id', () => {
    const csv = csvWith(['Name', 'Title'], ['US-001', 'My Story'])
    const [row] = parseCSV(csv)
    expect(row.us_id).toBe('US-001')
  })

  it('maps "User Story" column to us_id', () => {
    const csv = csvWith(['User Story', 'Title'], ['US-002', 'Another'])
    const [row] = parseCSV(csv)
    expect(row.us_id).toBe('US-002')
  })

  it('maps "User_Story_Name__c" to title', () => {
    const csv = csvWith(['Name', 'User_Story_Name__c'], ['US-003', 'The Title'])
    const [row] = parseCSV(csv)
    expect(row.title).toBe('The Title')
  })

  it('maps "Development_Owner__c" to developer', () => {
    const csv = csvWith(['Name', 'Development_Owner__c'], ['US-004', 'Alice'])
    const [row] = parseCSV(csv)
    expect(row.developer).toBe('Alice')
  })

  it('maps "Status__c" to sf_status', () => {
    const csv = csvWith(['Name', 'Status__c'], ['US-005', 'In Progress'])
    const [row] = parseCSV(csv)
    expect(row.sf_status).toBe('In Progress')
  })

  it('maps "Release__c" to release_label', () => {
    const csv = csvWith(['Name', 'Release__c'], ['US-006', 'Aug 2025'])
    const [row] = parseCSV(csv)
    expect(row.release_label).toBe('Aug 2025')
  })

  it('skips rows where us_id starts with "["', () => {
    const csv = csvWith(['Name', 'Title'], ['[PM_User_Story__c]', 'Header'])
    expect(parseCSV(csv)).toHaveLength(0)
  })

  it('falls back to us_id when no title column present', () => {
    const csv = 'Name\nUS-007'
    const [row] = parseCSV(csv)
    expect(row.title).toBe('US-007')
  })

  it('is case-insensitive in column header matching', () => {
    const csv = csvWith(['NAME', 'TITLE'], ['US-008', 'Case Test'])
    const [row] = parseCSV(csv)
    expect(row.us_id).toBe('US-008')
    expect(row.title).toBe('Case Test')
  })
})

// ─── parseCSV — boolean normalization ────────────────────────────────────────

describe('parseCSV — boolean normalization', () => {
  function boolCsv(value: string): string {
    return `Name,Deployed_To_UAT\nUS-001,${value}`
  }

  it.each([
    ['true', true],
    ['True', true],
    ['TRUE', true],
    ['yes', true],
    ['YES', true],
    ['y', true],
    ['1', true],
    ['checked', true],
    ['deployed', true],
  ])('"%s" → deployed_to_uat = %s', (raw, expected) => {
    const [row] = parseCSV(boolCsv(raw))
    expect(row.deployed_to_uat).toBe(expected)
  })

  it.each([
    ['false', false],
    ['no', false],
    ['0', false],
    ['', false],
    ['n/a', false],
  ])('"%s" → deployed_to_uat = false', (raw) => {
    const [row] = parseCSV(boolCsv(raw))
    expect(row.deployed_to_uat).toBe(false)
  })

  it('normalizes is_quick_hit boolean', () => {
    const csv = 'Name,Quick_Hit__c\nUS-001,true'
    const [row] = parseCSV(csv)
    expect(row.is_quick_hit).toBe(true)
  })
})

// ─── parseCSV — release_track derivation ────────────────────────────────────

describe('parseCSV — release_track derivation', () => {
  it('maps explicit "major" track', () => {
    const csv = 'Name,Release_Track\nUS-001,major'
    const [row] = parseCSV(csv)
    expect(row.release_track).toBe('major')
  })

  it('maps explicit "qh1" track', () => {
    const csv = 'Name,Track\nUS-001,qh1'
    const [row] = parseCSV(csv)
    expect(row.release_track).toBe('qh1')
  })

  it('falls back to qh1 when is_quick_hit is true and no explicit track', () => {
    const csv = 'Name,Quick_Hit__c\nUS-001,true'
    const [row] = parseCSV(csv)
    expect(row.release_track).toBe('qh1')
  })

  it('sets release_track null when not quick hit and no track column', () => {
    const csv = 'Name\nUS-001'
    const [row] = parseCSV(csv)
    expect(row.release_track).toBeNull()
  })
})

// ─── parsePastedTable ────────────────────────────────────────────────────────

describe('parsePastedTable', () => {
  it('parses tab-delimited pasted data', () => {
    const text = 'Name\tTitle\nUS-001\tMy Tab Story'
    const [row] = parsePastedTable(text)
    expect(row.us_id).toBe('US-001')
    expect(row.title).toBe('My Tab Story')
  })

  it('falls back to comma delimiter when no tabs in first line', () => {
    const text = 'Name,Title\nUS-002,My Comma Story'
    const [row] = parsePastedTable(text)
    expect(row.us_id).toBe('US-002')
    expect(row.title).toBe('My Comma Story')
  })

  it('handles CRLF line endings', () => {
    const text = 'Name\tTitle\r\nUS-003\tCRLF Story'
    const [row] = parsePastedTable(text)
    expect(row.us_id).toBe('US-003')
  })

  it('returns empty array for blank input', () => {
    expect(parsePastedTable('')).toHaveLength(0)
    expect(parsePastedTable('   ')).toHaveLength(0)
  })
})
