import { test, expect } from '@playwright/test'
import { mockSignInFailure, mockSupabaseRoutes, injectSession } from './helpers/mockSupabase'

// ── Unauthenticated state ─────────────────────────────────────────────────────

test.describe('Login page — unauthenticated', () => {
  test('shows the sign-in form by default', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })

  test('shows email and password inputs', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('input[type=email]')).toBeVisible()
    await expect(page.locator('input[type=password]')).toBeVisible()
  })

  test('shows the brand panel feature bullets', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Passive time tracking via state transitions')).toBeVisible()
    await expect(page.getByText('Drag-and-drop kanban with auto-stage logic')).toBeVisible()
  })

  test('shows the "Forgot password?" link', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: /forgot password/i })).toBeVisible()
  })
})

// ── Mode switching ─────────────────────────────────────────────────────────────

test.describe('Login page — mode switching', () => {
  test('switches to Create account mode', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /create an account/i }).click()
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible()
  })

  test('switches back to Sign in from Create account', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /create an account/i }).click()
    await page.getByRole('button', { name: /already have an account/i }).click()
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })

  test('switches to Reset your password mode', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /forgot password/i }).click()
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
    // Password field should be hidden in forgot mode
    await expect(page.locator('input[type=password]')).not.toBeVisible()
  })

  test('switches back to Sign in from forgot mode', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /forgot password/i }).click()
    await page.getByRole('button', { name: /back to sign in/i }).click()
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })
})

// ── Sign-in failure ───────────────────────────────────────────────────────────

test.describe('Login page — sign-in failure', () => {
  test('shows error message when credentials are wrong', async ({ page }) => {
    await mockSignInFailure(page)
    await page.goto('/')
    await page.locator('input[type=email]').fill('wrong@email.com')
    await page.locator('input[type=password]').fill('wrongpassword')
    await page.getByRole('button', { name: /^sign in$/i }).click()
    await expect(page.getByText('Invalid login credentials')).toBeVisible()
  })
})

// ── Authenticated: app shell loads ────────────────────────────────────────────

test.describe('App shell — authenticated', () => {
  test.beforeEach(async ({ page }) => {
    await injectSession(page)
    await mockSupabaseRoutes(page)
  })

  test('shows the main app layout (not the login form)', async ({ page }) => {
    await page.goto('/')
    // The Topbar brand is the indicator we're inside the app
    await expect(page.locator('.brand')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Sign in' })).not.toBeVisible()
  })

  test('shows the kanban board columns', async ({ page }) => {
    await page.goto('/')
    // Scope to .board to avoid matching mobile stage-tab duplicates
    const board = page.locator('.board')
    await expect(board.locator('.col-title').filter({ hasText: 'Not Started' })).toBeVisible()
    await expect(board.locator('.col-title').filter({ hasText: 'In Progress' })).toBeVisible()
    await expect(board.locator('.col-title').filter({ hasText: 'SIT' })).toBeVisible()
    await expect(board.locator('.col-title').filter({ hasText: 'UAT' })).toBeVisible()
    await expect(board.locator('.col-title').filter({ hasText: 'Completed' })).toBeVisible()
  })

  test('shows empty-state placeholder in all columns', async ({ page }) => {
    await page.goto('/')
    const dropHere = page.getByText('Drop here')
    await expect(dropHere.first()).toBeVisible()
    // All 5 columns should have the placeholder
    await expect(dropHere).toHaveCount(5)
  })
})
