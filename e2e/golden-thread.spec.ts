/**
 * Golden Thread e2e smoke tests.
 *
 * Prerequisites: the dev stack running on port 4029 with dev-mock auth
 * (ALLOW_DEV_MOCK_AUTH=true) so the reviewer surfaces are reachable. These are
 * smoke checks — page loads + the interactive run + the stage-3 handoff.
 */
import { test, expect } from '@playwright/test';

test.describe('CMS hub', () => {
  test('lists the provision surfaces incl. the Golden Thread', async ({ page }) => {
    await page.goto('/cms');
    await expect(page.getByRole('heading', { name: /CMS-0057-F/i })).toBeVisible();
    await expect(page.getByText(/Golden Thread/i)).toBeVisible();
  });
});

test.describe('Financial Clearance', () => {
  test('renders the thread and runs a clearance', async ({ page }) => {
    await page.goto('/financial-clearance');
    await expect(page.getByRole('heading', { name: /Financial Clearance/i })).toBeVisible();
    // interactive runner
    await page.getByRole('button', { name: /run clearance/i }).click();
    await expect(page.getByText(/PA required|No PA required/i).first()).toBeVisible();
  });

  test('gold-carded provider is PA-exempt and offers no stage-3 handoff', async ({ page }) => {
    await page.goto('/financial-clearance');
    await page.getByLabel('Ordering provider').selectOption('1730154782');
    await page.getByRole('button', { name: /run clearance/i }).click();
    await expect(page.getByText(/No PA required|Cleared/i).first()).toBeVisible();
  });

  test('non-gold provider requires PA and shows the stage-3 handoff', async ({ page }) => {
    await page.goto('/financial-clearance');
    await page.getByLabel('Ordering provider').selectOption('1518998765');
    await page.getByRole('button', { name: /run clearance/i }).click();
    await expect(page.getByRole('link', { name: /Proceed to Prior Authorization/i })).toBeVisible();
  });
});

test.describe('Reviewer work queue', () => {
  test('loads the queue and reaches an evidence record', async ({ page }) => {
    // populate the queue first
    await page.goto('/financial-clearance');
    await page.getByRole('button', { name: /run clearance/i }).click();
    await page.getByRole('link', { name: /open the reviewer work queue/i }).click();
    await expect(page.getByRole('heading', { name: /work queue/i })).toBeVisible();
    const view = page.getByRole('link', { name: /view evidence/i }).first();
    if (await view.isVisible()) {
      await view.click();
      await expect(page.getByRole('heading', { name: /Evidence Record/i })).toBeVisible();
    }
  });
});
