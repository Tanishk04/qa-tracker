import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DndContext } from '@dnd-kit/core'
import { KanbanCard } from '../../components/KanbanCard'
import { makeStory, makeTasks, makeTask } from '../fixtures'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../hooks/useSettings', () => ({
  useDevelopers: () => ({ data: [] }),
  useSettings:   () => ({ data: null }),
}))
vi.mock('../../hooks/useTick', () => ({
  useTick: () => 0,
}))
const mockUpdatePinned = vi.fn()
const mockUpdateStoryFields = vi.fn()
vi.mock('../../lib/api', () => ({
  updatePinned:       (...a: any[]) => mockUpdatePinned(...a),
  updateStoryFields:  (...a: any[]) => mockUpdateStoryFields(...a),
}))
// Avatar and ComplexityChip have minimal impact on logic tests; keep real renders.

// ── Test wrapper ──────────────────────────────────────────────────────────────

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <DndContext>{children}</DndContext>
    </QueryClientProvider>
  )
}

function renderCard(props: Partial<React.ComponentProps<typeof KanbanCard>> = {}) {
  const defaults = {
    story: makeStory(),
    tasks: makeTasks(),
    logs:  [] as any[],
    onClick: vi.fn(),
    selected: false,
    onToggleSelect: vi.fn(),
  }
  return render(<KanbanCard {...defaults} {...props} />, { wrapper: Wrapper })
}

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('KanbanCard — rendering', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the US id', () => {
    renderCard({ story: makeStory({ us_id: 'US-042' }) })
    expect(screen.getByText('US-042')).toBeInTheDocument()
  })

  it('shows the story title', () => {
    renderCard({ story: makeStory({ title: 'Implement login flow' }) })
    expect(screen.getByText('Implement login flow')).toBeInTheDocument()
  })

  it('renders 5 pipeline steps', () => {
    const { container } = renderCard()
    const steps = container.querySelectorAll('.pipeline-step')
    expect(steps).toHaveLength(5)
  })

  it('marks done tasks as done in the pipeline', () => {
    const tasks = makeTasks({ understand: { status: 'done' } })
    const { container } = renderCard({ tasks })
    const steps = Array.from(container.querySelectorAll('.pipeline-step'))
    expect(steps[0]).toHaveClass('done')
    expect(steps[1]).not.toHaveClass('done')
  })

  it('marks active tasks in the pipeline', () => {
    const tasks = makeTasks({ tc_write: { status: 'in_progress' } })
    const { container } = renderCard({ tasks })
    const steps = Array.from(container.querySelectorAll('.pipeline-step'))
    expect(steps[1]).toHaveClass('active')
  })

  it('applies "selected" class when selected=true', () => {
    const { container } = renderCard({ selected: true })
    expect(container.firstChild).toHaveClass('selected')
  })

  it('does not apply "selected" class when selected=false', () => {
    const { container } = renderCard({ selected: false })
    expect(container.firstChild).not.toHaveClass('selected')
  })
})

// ── Release track badge ───────────────────────────────────────────────────────

describe('KanbanCard — release track badge', () => {
  it('shows Major badge for major track', () => {
    renderCard({ story: makeStory({ release_track: 'major' }) })
    expect(screen.getByText('Major')).toBeInTheDocument()
  })

  it('shows QH1 badge for qh1 track', () => {
    renderCard({ story: makeStory({ release_track: 'qh1' }) })
    expect(screen.getByText('QH1')).toBeInTheDocument()
  })

  it('shows no track badge when release_track is null', () => {
    renderCard({ story: makeStory({ release_track: null }) })
    expect(screen.queryByText('Major')).not.toBeInTheDocument()
    expect(screen.queryByText('QH1')).not.toBeInTheDocument()
  })
})

// ── Release label ─────────────────────────────────────────────────────────────

describe('KanbanCard — release label', () => {
  it('shows release label when set', () => {
    renderCard({ story: makeStory({ release_label: 'Aug 2025' }) })
    expect(screen.getByText('Aug 2025')).toBeInTheDocument()
  })

  it('truncates release label longer than 14 chars', () => {
    renderCard({ story: makeStory({ release_label: 'August Release 2025' }) })
    expect(screen.getByText('August Release…')).toBeInTheDocument()
  })

  it('shows nothing when release_label is null', () => {
    renderCard({ story: makeStory({ release_label: null }) })
    expect(screen.queryByText(/release/i)).not.toBeInTheDocument()
  })
})

// ── STUCK badge ───────────────────────────────────────────────────────────────

describe('KanbanCard — STUCK badge', () => {
  const staleDate = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString()

  it('shows STUCK when story has not been updated in >48 h', () => {
    renderCard({ story: makeStory({ updated_at: staleDate, stage: 'in_progress' }) })
    expect(screen.getByText('STUCK')).toBeInTheDocument()
  })

  it('does not show STUCK for completed stories', () => {
    renderCard({ story: makeStory({ updated_at: staleDate, stage: 'completed' }) })
    expect(screen.queryByText('STUCK')).not.toBeInTheDocument()
  })

  it('does not show STUCK when updated recently', () => {
    renderCard({ story: makeStory({ updated_at: new Date().toISOString() }) })
    expect(screen.queryByText('STUCK')).not.toBeInTheDocument()
  })
})

// ── Pin button ────────────────────────────────────────────────────────────────

describe('KanbanCard — pin button', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdatePinned.mockResolvedValue(undefined)
  })

  it('calls updatePinned(id, true) when story is not pinned', async () => {
    renderCard({ story: makeStory({ id: 'us-99', pinned: false }) })
    fireEvent.click(screen.getByRole('button', { name: /pin/i }))
    await waitFor(() => expect(mockUpdatePinned).toHaveBeenCalledWith('us-99', true))
  })

  it('calls updatePinned(id, false) when story is already pinned', async () => {
    renderCard({ story: makeStory({ id: 'us-99', pinned: true }) })
    fireEvent.click(screen.getByRole('button', { name: /pin/i }))
    await waitFor(() => expect(mockUpdatePinned).toHaveBeenCalledWith('us-99', false))
  })

  it('has "on" class on pin button when story is pinned', () => {
    renderCard({ story: makeStory({ pinned: true }) })
    const btn = screen.getByRole('button', { name: /pin/i })
    expect(btn).toHaveClass('on')
  })
})

// ── Click handler ─────────────────────────────────────────────────────────────

describe('KanbanCard — click handler', () => {
  it('calls onClick when card is clicked normally', () => {
    const onClick = vi.fn()
    const { container } = renderCard({ onClick })
    fireEvent.click(container.firstChild as Element)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
