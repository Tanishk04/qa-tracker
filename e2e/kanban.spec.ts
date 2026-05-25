import { test, expect } from '@playwright/test'
import { injectSession, mockSupabaseRoutes } from './helpers/mockSupabase'

const SEED_STORIES = [
  {
    id: 'us-1', user_id: 'user-test-1', us_id: 'US-001',
    title: 'Implement login flow', stage: 'in_progress',
    release_label: 'Aug 2025', release_track: 'major',
    is_quick_hit: false, pinned: false, archived: false,
    priority: 'High', priority_rank: null, auto_stage: true,
    developer: null, defect_status: null, notes: null,
    deployed_to_uat: false, sprint: null, complexity: null,
    sf_status: null, acceptance_criteria: null, solution_approach: null,
    description: null, release_cycle: null,
    created_at: '2024-01-01T00:00:00Z', updated_at: new Date().toISOString(),
  },
  {
    id: 'us-2', user_id: 'user-test-1', us_id: 'US-002',
    title: 'Fix CSV import parser', stage: 'sit',
    release_label: 'Aug 2025', release_track: 'qh1',
    is_quick_hit: true, pinned: false, archived: false,
    priority: 'Medium', priority_rank: null, auto_stage: true,
    developer: null, defect_status: null, notes: null,
    deployed_to_uat: false, sprint: null, complexity: null,
    sf_status: null, acceptance_criteria: null, solution_approach: null,
    description: null, release_cycle: null,
    created_at: '2024-01-01T00:00:00Z', updated_at: new Date().toISOString(),
  },
  {
    id: 'us-3', user_id: 'user-test-1', us_id: 'US-003',
    title: 'Update evidence upload UI', stage: 'not_started',
    release_label: null, release_track: null,
    is_quick_hit: false, pinned: false, archived: false,
    priority: 'Low', priority_rank: null, auto_stage: true,
    developer: null, defect_status: null, notes: null,
    deployed_to_uat: false, sprint: null, complexity: null,
    sf_status: null, acceptance_criteria: null, solution_approach: null,
    description: null, release_cycle: null,
    created_at: '2024-01-01T00:00:00Z', updated_at: new Date().toISOString(),
  },
]

// Scope all card queries to .board (desktop layout) to avoid duplicates
// in the mobile .mobile-board and any open panels.
function board(page: Parameters<typeof expect>[0]) {
  return (page as any).locator('.board') as ReturnType<typeof page['locator']>
}

test.describe('Kanban board — with seeded stories', () => {
  test.beforeEach(async ({ page }) => {
    await injectSession(page)
    await mockSupabaseRoutes(page, { user_stories: SEED_STORIES })
    await page.goto('/')
  })

  // ── Card rendering ────────────────────────────────────────────────────────

  test('renders a card for each story', async ({ page }) => {
    const b = page.locator('.board')
    await expect(b.locator('.qa-card').filter({ hasText: 'US-001' })).toBeVisible()
    await expect(b.locator('.qa-card').filter({ hasText: 'US-002' })).toBeVisible()
    await expect(b.locator('.qa-card').filter({ hasText: 'US-003' })).toBeVisible()
  })

  test('shows story titles on cards', async ({ page }) => {
    const b = page.locator('.board')
    await expect(b.locator('.card-title').filter({ hasText: 'Implement login flow' })).toBeVisible()
    await expect(b.locator('.card-title').filter({ hasText: 'Fix CSV import parser' })).toBeVisible()
  })

  test('shows release label on cards', async ({ page }) => {
    const b = page.locator('.board')
    // Aug 2025 is ≤14 chars — no truncation
    await expect(b.getByText('Aug 2025').first()).toBeVisible()
  })

  test('stories appear in correct columns', async ({ page }) => {
    const b = page.locator('.board')
    const inProgressCol = b.locator('section.column').filter({ hasText: 'In Progress' })
    await expect(inProgressCol.locator('.qa-card').filter({ hasText: 'US-001' })).toBeVisible()

    const notStartedCol = b.locator('section.column').filter({ hasText: 'Not Started' })
    await expect(notStartedCol.locator('.qa-card').filter({ hasText: 'US-003' })).toBeVisible()
  })

  // ── Search filter ─────────────────────────────────────────────────────────

  test('search hides non-matching cards', async ({ page }) => {
    const b = page.locator('.board')
    await page.locator('.search-input input').fill('login')
    await expect(b.locator('.card-title').filter({ hasText: 'Implement login flow' })).toBeVisible()
    await expect(b.locator('.card-title').filter({ hasText: 'Fix CSV import parser' })).toHaveCount(0)
  })

  test('search is case-insensitive', async ({ page }) => {
    const b = page.locator('.board')
    await page.locator('.search-input input').fill('CSV')
    await expect(b.locator('.card-title').filter({ hasText: 'Fix CSV import parser' })).toBeVisible()
    await expect(b.locator('.card-title').filter({ hasText: 'Implement login flow' })).toHaveCount(0)
  })

  test('clearing search restores all cards', async ({ page }) => {
    const b = page.locator('.board')
    await page.locator('.search-input input').fill('login')
    await page.locator('.search-input input').clear()
    await expect(b.locator('.card-title').filter({ hasText: 'Implement login flow' })).toBeVisible()
    await expect(b.locator('.card-title').filter({ hasText: 'Fix CSV import parser' })).toBeVisible()
  })

  // ── Track filter ──────────────────────────────────────────────────────────

  test('Major track filter hides QH1 stories', async ({ page }) => {
    const b = page.locator('.board')
    const trackGroup = page.getByRole('group', { name: /release track/i })
    await trackGroup.getByRole('button', { name: 'Major' }).click()
    await expect(b.locator('.qa-card').filter({ hasText: 'US-001' })).toBeVisible()  // major
    await expect(b.locator('.qa-card').filter({ hasText: 'US-002' })).toHaveCount(0) // qh1 — hidden
  })

  // ── Dashboard stats ───────────────────────────────────────────────────────

  test('stat tiles render with expected labels', async ({ page }) => {
    const stats = page.locator('.stats')
    await expect(stats.getByText('Total US')).toBeVisible()
    await expect(stats.locator('.stat-head').filter({ hasText: 'Completed' })).toBeVisible()
    await expect(stats.getByText('Time today')).toBeVisible()
    await expect(stats.getByText('Stuck')).toBeVisible()
  })

  test('Total US stat reflects story count', async ({ page }) => {
    const stat = page.locator('.stat').filter({ hasText: 'Total US' })
    await expect(stat.locator('.stat-value')).toHaveText('3')
  })
})

// ── Empty board ───────────────────────────────────────────────────────────────

test.describe('Kanban board — empty', () => {
  test.beforeEach(async ({ page }) => {
    await injectSession(page)
    await mockSupabaseRoutes(page)
    await page.goto('/')
  })

  test('shows "Drop here" in all five columns', async ({ page }) => {
    await expect(page.getByText('Drop here')).toHaveCount(5)
  })

  test('Total US stat shows 0', async ({ page }) => {
    const stat = page.locator('.stat').filter({ hasText: 'Total US' })
    await expect(stat.locator('.stat-value')).toHaveText('0')
  })
})
