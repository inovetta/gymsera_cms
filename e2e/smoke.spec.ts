import { test, expect } from '@playwright/test';

test.describe('CMS smoke suite', () => {
  test('login page or landing page renders properly', async ({ page }) => {
    await page.goto('/');
    // Expect page to be reachable and contain HTML document structure
    await expect(page.locator('body')).toBeVisible();
  });
});
