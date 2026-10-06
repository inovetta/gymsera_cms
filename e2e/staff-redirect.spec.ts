import { test, expect } from '@playwright/test';

/**
 * The Staff screen is retired (UX-12): an old link or bookmark must land on
 * Team & access. API calls are answered here; no backend, no real account.
 */
test('an old /gym/staff link lands on Team & access', async ({ page }) => {
  await page.context().addCookies([{ name: 'gymsera_session', value: '1', url: 'http://localhost:3001' }]);
  await page.addInitScript(() => {
    localStorage.setItem('gymsera_access_token', 'e2e-placeholder');
    localStorage.setItem('gymsera_refresh_token', 'e2e-placeholder');
    localStorage.setItem(
      'gymsera_user',
      JSON.stringify({ id: 'user-owner', fullName: 'Hira Khan', email: 'owner@example.test', role: 'GYM_HOST', status: 'ACTIVE' })
    );
  });
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith('/tenants/me')
      ? { tenant: { id: 't1', status: 'ACTIVE' }, subscription: null }
      : path.endsWith('/team')
        ? { team: [], counts: {}, total: 0 }
        : {};
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, message: 'ok', data }),
    });
  });

  await page.goto('/gym/staff');

  await expect(page).toHaveURL(/\/gym\/team$/);
  await expect(page.getByRole('heading', { name: 'Team & access', level: 2 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Staff', exact: true })).toHaveCount(0);
});
