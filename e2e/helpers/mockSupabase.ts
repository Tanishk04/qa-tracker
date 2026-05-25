import type { Page } from '@playwright/test'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': '*',
}

/**
 * Inject a fake (non-expired) Supabase session into localStorage so the app
 * boots straight into the authenticated shell without real credentials.
 * Must be called before page.goto().
 */
export async function injectSession(page: Page) {
  await page.addInitScript(() => {
    const session = {
      access_token: 'test-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'test-refresh-token',
      user: {
        id: 'user-test-1',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'qa@test.com',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        is_anonymous: false,
      },
    }
    // storageKey matches supabase.ts: storageKey: 'qa-tracker.auth'
    localStorage.setItem('qa-tracker.auth', JSON.stringify(session))
  })
}

/**
 * Route all Supabase REST + auth calls to local mock responses.
 * Uses regex URL matchers so it works regardless of the actual Supabase project URL
 * (VITE_SUPABASE_URL may or may not be overridden in the test environment).
 * Pass per-table overrides to seed specific tables with test rows.
 */
export async function mockSupabaseRoutes(
  page: Page,
  tableData: Record<string, unknown[]> = {},
) {
  // REST table queries — regex matches /rest/v1/<table> in any URL
  await page.route(/\/rest\/v1\//, route => {
    if (route.request().method() === 'OPTIONS') {
      route.fulfill({ status: 204, headers: CORS })
      return
    }
    const url = new URL(route.request().url())
    // Extract table name: /rest/v1/user_stories → "user_stories"
    const match = url.pathname.match(/\/rest\/v1\/([^?/]+)/)
    const tableName = match?.[1] ?? ''
    const rows = tableData[tableName] ?? []
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        ...CORS,
        'Content-Range': `0-${rows.length}/${rows.length}`,
      },
      body: JSON.stringify(rows),
    })
  })

  // Auth token (sign-in / refresh)
  await page.route(/\/auth\/v1\/token/, route => {
    if (route.request().method() === 'OPTIONS') {
      route.fulfill({ status: 204, headers: CORS })
      return
    }
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify({
        access_token: 'test-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'test-refresh-token',
        user: { id: 'user-test-1', email: 'qa@test.com' },
      }),
    })
  })

  // Auth /user endpoint
  await page.route(/\/auth\/v1\/user$/, route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify({
        id: 'user-test-1',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'qa@test.com',
      }),
    })
  })

  // Sign-out
  await page.route(/\/auth\/v1\/logout/, route => {
    route.fulfill({ status: 204, headers: CORS })
  })

  // Realtime WebSocket upgrade — abort cleanly; app handles failures gracefully
  await page.route(/\/realtime\//, route => route.abort())
}

/** Mock a failed sign-in. Call before page.goto(). */
export async function mockSignInFailure(page: Page) {
  await page.route(/\/auth\/v1\/token/, route => {
    if (route.request().method() === 'OPTIONS') {
      route.fulfill({ status: 204, headers: CORS })
      return
    }
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify({
        error: 'invalid_grant',
        error_description: 'Invalid login credentials',
      }),
    })
  })
}
