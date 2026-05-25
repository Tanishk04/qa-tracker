import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FilterBar } from '../../components/FilterBar'
import { FilterProvider, useFilter } from '../../hooks/useFilter'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../hooks/useSettings', () => ({
  useSettings: () => ({ data: null }),           // use_custom_priority = undefined → show SF priority
  useReleases: () => ({ data: [
    { id: 'r1', name: 'Aug 2025' },
    { id: 'r2', name: 'Sep 2025' },
  ] }),
}))

// ── Wrapper ───────────────────────────────────────────────────────────────────

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <FilterProvider>{children}</FilterProvider>
    </QueryClientProvider>
  )
}

function renderBar() {
  return render(<FilterBar />, { wrapper: Wrapper })
}

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('FilterBar — rendering', () => {
  it('renders the search input', () => {
    renderBar()
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
  })

  it('renders the release dropdown with options', () => {
    renderBar()
    const select = screen.getByRole('combobox')
    expect(select).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'All releases' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Aug 2025' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Sep 2025' })).toBeInTheDocument()
  })

  it('renders track segment buttons (All, Major, QH1, QH2)', () => {
    renderBar()
    const group = screen.getByRole('group', { name: /release track/i })
    const { getByRole } = within(group)
    expect(getByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(getByRole('button', { name: 'Major' })).toBeInTheDocument()
    expect(getByRole('button', { name: 'QH1' })).toBeInTheDocument()
    expect(getByRole('button', { name: 'QH2' })).toBeInTheDocument()
  })

  it('renders priority buttons when use_custom_priority is falsy', () => {
    renderBar()
    expect(screen.getByRole('group', { name: /priority/i })).toBeInTheDocument()
  })

  it('renders Pinned and Archived toggle buttons', () => {
    renderBar()
    expect(screen.getByRole('button', { name: /pinned/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /archived/i })).toBeInTheDocument()
  })
})

// ── Search ────────────────────────────────────────────────────────────────────

describe('FilterBar — search interaction', () => {
  it('starts with empty search', () => {
    renderBar()
    expect(screen.getByPlaceholderText(/search/i)).toHaveValue('')
  })

  it('updates the input value when user types', () => {
    renderBar()
    const input = screen.getByPlaceholderText(/search/i)
    fireEvent.change(input, { target: { value: 'login' } })
    expect(input).toHaveValue('login')
  })
})

// ── Release dropdown ──────────────────────────────────────────────────────────

describe('FilterBar — release dropdown', () => {
  it('defaults to "all"', () => {
    renderBar()
    expect(screen.getByRole('combobox')).toHaveValue('all')
  })

  it('changes value when a release is selected', () => {
    renderBar()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Aug 2025' } })
    expect(screen.getByRole('combobox')).toHaveValue('Aug 2025')
  })
})

// ── Track buttons ─────────────────────────────────────────────────────────────

describe('FilterBar — track buttons', () => {
  function trackGroup() {
    return within(screen.getByRole('group', { name: /release track/i }))
  }

  it('"All" track button is active by default', () => {
    renderBar()
    expect(trackGroup().getByRole('button', { name: 'All' })).toHaveClass('active')
  })

  it('activates Major track button on click', () => {
    renderBar()
    const major = trackGroup().getByRole('button', { name: 'Major' })
    fireEvent.click(major)
    expect(major).toHaveClass('active')
  })

  it('deactivates All button when a track is selected', () => {
    renderBar()
    fireEvent.click(trackGroup().getByRole('button', { name: 'Major' }))
    expect(trackGroup().getByRole('button', { name: 'All' })).not.toHaveClass('active')
  })

  it('re-activates All when clicked after another track', () => {
    renderBar()
    const { getByRole } = trackGroup()
    fireEvent.click(getByRole('button', { name: 'Major' }))
    fireEvent.click(getByRole('button', { name: 'All' }))
    expect(getByRole('button', { name: 'All' })).toHaveClass('active')
  })
})

// ── Pinned / Archived toggles ────────────────────────────────────────────────

describe('FilterBar — toggles', () => {
  it('Pinned toggle gains "on" class after click', () => {
    renderBar()
    const btn = screen.getByRole('button', { name: /pinned/i })
    expect(btn).not.toHaveClass('on')
    fireEvent.click(btn)
    expect(btn).toHaveClass('on')
  })

  it('Pinned toggle loses "on" class after second click', () => {
    renderBar()
    const btn = screen.getByRole('button', { name: /pinned/i })
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(btn).not.toHaveClass('on')
  })

  it('Archived toggle gains "on" class after click', () => {
    renderBar()
    const btn = screen.getByRole('button', { name: /archived/i })
    fireEvent.click(btn)
    expect(btn).toHaveClass('on')
  })
})
