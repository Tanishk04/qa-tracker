import { test, expect } from '@playwright/test'
import { injectSession, mockSupabaseRoutes } from './helpers/mockSupabase'

const SAMPLE_CSV = `Name,User_Story_Name__c,Status__c,Priority__c,Release__c
US-101,Bulk upload refactor,In Progress,High,Aug 2025
US-102,Fix pagination bug,Ready for QA,Medium,Aug 2025
US-103,Dark mode token cleanup,Backlog,Low,Sep 2025`

test.describe('Import dialog', () => {
  test.beforeEach(async ({ page }) => {
    await injectSession(page)
    await mockSupabaseRoutes(page)
    await page.goto('/')
    // Open via the desktop Topbar "Import" button
    await page.locator('.btn.btn-ghost', { hasText: 'Import' }).click()
  })

  test('dialog opens with paste textarea', async ({ page }) => {
    // The modal is .modal-back > .modal
    await expect(page.locator('.modal')).toBeVisible()
    await expect(page.getByPlaceholder('Paste TSV/CSV…')).toBeVisible()
  })

  test('pasting CSV and clicking Parse shows preview table', async ({ page }) => {
    await page.getByPlaceholder('Paste TSV/CSV…').fill(SAMPLE_CSV)
    await page.getByRole('button', { name: 'Parse' }).click()
    // Preview section appears
    await expect(page.getByText(/preview/i)).toBeVisible()
    // Story IDs appear in the table cells (not the textarea text)
    await expect(page.getByRole('cell', { name: 'US-101' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'US-102' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'US-103' })).toBeVisible()
  })

  test('preview label shows correct row count', async ({ page }) => {
    await page.getByPlaceholder('Paste TSV/CSV…').fill(SAMPLE_CSV)
    await page.getByRole('button', { name: 'Parse' }).click()
    // e.g. "Preview (3)"
    await expect(page.locator('.section-label')).toContainText('3')
  })

  test('story titles appear in preview', async ({ page }) => {
    await page.getByPlaceholder('Paste TSV/CSV…').fill(SAMPLE_CSV)
    await page.getByRole('button', { name: 'Parse' }).click()
    await expect(page.getByRole('cell', { name: 'Bulk upload refactor' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Fix pagination bug' })).toBeVisible()
  })

  test('Cancel button closes the dialog', async ({ page }) => {
    // Scope to .modal-back so we don't hit the PrioritizeDrawer's Cancel button
    await page.locator('.modal-back').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('Import User Stories')).not.toBeVisible()
  })

  test('X icon button closes the dialog', async ({ page }) => {
    // The close icon button is the .btn-icon in the modal header
    await page.locator('.modal .btn-icon').click()
    await expect(page.locator('.modal')).not.toBeVisible()
  })
})
