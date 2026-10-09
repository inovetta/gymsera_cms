import { test, expect, Page, Route } from '@playwright/test';

/**
 * Record Payment finds the member by email (NEW-57).
 *
 * No backend is started: every /api/v1 call is answered here with the shapes the real
 * endpoints return. It proves the browser looks the member up at the chosen branch and posts
 * the member's userId (never the typed email) to POST /payments, and that an unknown email
 * shows the "no member" error without recording anything.
 */

const USER_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '22222222-2222-4222-8222-222222222222';

const json = (route: Route, data: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ success: status < 400, message: 'ok', data }),
  });

async function signInAsHost(page: Page) {
  await page.context().addCookies([{ name: 'gymsera_session', value: '1', url: 'http://localhost:3001' }]);
  await page.addInitScript(() => {
    localStorage.setItem('gymsera_access_token', 'e2e-placeholder');
    localStorage.setItem('gymsera_refresh_token', 'e2e-placeholder');
    localStorage.setItem(
      'gymsera_user',
      JSON.stringify({ id: 'user-owner', fullName: 'Hira Khan', email: 'owner@example.test', role: 'GYM_HOST', status: 'ACTIVE' })
    );
  });
}

test.describe('Record Payment', () => {
  test('looks the member up by email and posts their userId; an unknown email records nothing', async ({ page }) => {
    const posted: any[] = [];
    const lookups: string[] = [];

    await page.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace('/api/v1', '');
      const method = route.request().method();

      if (path === '/me/context') {
        return json(route, {
          user: { id: 'user-owner', fullName: 'Hira Khan', platformRole: 'MEMBER', isHost: true },
          pendingApprovals: 0,
          needsContextSwitcher: false,
          organizations: [{
            tenantId: 'tenant-1', name: 'Iron Gym', isOwner: true,
            role: { key: 'OWNER', name: 'Owner', level: 100 }, scopeType: 'ORG',
            orgPermissions: ['*'], branches: [{ id: BRANCH_ID, name: 'Uptown', permissions: ['*'] }], pendingApprovals: 0,
          }],
        });
      }
      if (path === '/tenants/me') return json(route, { tenant: { id: 't1', status: 'ACTIVE' }, subscription: null });
      if (path === '/gyms/branches') return json(route, { branches: [{ id: BRANCH_ID, branchName: 'Uptown' }] });
      if (path === `/host/branches/${BRANCH_ID}/members/lookup`) {
        const email = url.searchParams.get('email') ?? '';
        lookups.push(email);
        return email === 'ali@example.test'
          ? json(route, { exists: true, user: { id: USER_ID, fullName: 'Ali Raza', email }, subscriptions: [] })
          : json(route, { exists: false, subscriptions: [] });
      }
      if (path === '/payments' && method === 'POST') {
        posted.push(route.request().postDataJSON());
        return json(route, { payment: { id: 'pay-1' }, invoice: null }, 201);
      }
      if (path === '/payments') return json(route, { payments: [], pagination: { total: 0, page: 1, pages: 1 } });
      return json(route, {});
    });

    await signInAsHost(page);
    await page.goto('/gym/payments');

    await page.getByRole('button', { name: 'Record Payment' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('User ID')).toHaveCount(0);

    await dialog.getByPlaceholder('member@example.com').fill('nobody@example.test');
    await dialog.getByLabel(/Amount/).fill('3000');
    await dialog.getByRole('button', { name: 'Record Payment' }).click();
    await expect(dialog.getByText('No member with the email nobody@example.test was found at this branch.')).toBeVisible();
    expect(posted).toHaveLength(0);

    await dialog.getByPlaceholder('member@example.com').fill('Ali@Example.test');
    await dialog.getByRole('button', { name: 'Record Payment' }).click();
    await expect(dialog).toBeHidden();

    expect(lookups).toEqual(['nobody@example.test', 'ali@example.test']);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ userId: USER_ID, branchId: BRANCH_ID, amount: 3000 });
    expect(posted[0]).not.toHaveProperty('email');
  });
});
