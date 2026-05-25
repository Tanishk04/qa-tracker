import { describe, expect, it } from 'vitest'
import { resolveDev, devDisplay } from '../../lib/developer'
import { makeDeveloper } from '../fixtures'

const DEV_ALICE = makeDeveloper({ id: 'dev-1', name: 'Alice', sf_user_id: '005ALICE000001234' })
const DEV_BOB   = makeDeveloper({ id: 'dev-2', name: 'Bob',   sf_user_id: null })
const DEVS = [DEV_ALICE, DEV_BOB]

// ─── resolveDev ──────────────────────────────────────────────────────────────

describe('resolveDev', () => {
  it('returns null for null input', () => {
    expect(resolveDev(null, DEVS)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(resolveDev('', DEVS)).toBeNull()
  })

  it('matches by exact sf_user_id', () => {
    expect(resolveDev('005ALICE000001234', DEVS)).toBe(DEV_ALICE)
  })

  it('matches by name (case-insensitive)', () => {
    expect(resolveDev('alice', DEVS)).toBe(DEV_ALICE)
    expect(resolveDev('ALICE', DEVS)).toBe(DEV_ALICE)
    expect(resolveDev('Bob', DEVS)).toBe(DEV_BOB)
  })

  it('prefers sf_user_id match over name match', () => {
    const devs = [
      makeDeveloper({ name: '005ALICE000001234', sf_user_id: null }),  // name coincidentally looks like an SF id
      DEV_ALICE,
    ]
    expect(resolveDev('005ALICE000001234', devs)).toBe(devs[1])
  })

  it('returns null when no developer matches', () => {
    expect(resolveDev('Charlie', DEVS)).toBeNull()
  })

  it('trims surrounding whitespace before matching', () => {
    expect(resolveDev('  Alice  ', DEVS)).toBe(DEV_ALICE)
  })
})

// ─── devDisplay ─────────────────────────────────────────────────────────────

describe('devDisplay', () => {
  it('returns null for null input', () => {
    expect(devDisplay(null, DEVS)).toBeNull()
  })

  it('returns the developer name when resolved', () => {
    expect(devDisplay('alice', DEVS)).toBe('Alice')
    expect(devDisplay('005ALICE000001234', DEVS)).toBe('Alice')
  })

  it('hides raw SF ids (15 chars alphanumeric)', () => {
    expect(devDisplay('005XX0000000001', [])).toBeNull()
  })

  it('hides raw SF ids (18 chars alphanumeric)', () => {
    expect(devDisplay('005XX0000000001AAA', [])).toBeNull() // 18-char extended id
  })

  it('returns raw value when it does not look like an SF id and no match', () => {
    expect(devDisplay('External Contractor', [])).toBe('External Contractor')
  })

  it('returns raw value for short non-SF strings', () => {
    expect(devDisplay('J.Smith', [])).toBe('J.Smith')
  })
})
