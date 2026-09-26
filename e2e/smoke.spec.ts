import { test, expect } from '@playwright/test';

test.describe('CMS smoke suite', () => {
  test('app starts and login page loads properly', async ({ page }) => {
    // Navigate to login page
    await page.goto('/login');

    // Verify main brand & headings load
    await expect(page.locator('h1')).toContainText('GymsEra');
    await expect(page.getByText('Management Portal')).toBeVisible();
    await expect(page.getByText('Welcome back')).toBeVisible();

    // Verify email and password form fields exist and are interactive
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    // Verify submit button is rendered
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeVisible();
  });
});
