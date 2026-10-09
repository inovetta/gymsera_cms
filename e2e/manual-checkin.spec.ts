import { test, expect, Page, Route } from '@playwright/test';

/**
 * Manual check-in smoke test (NEW-55).
 *
 * No backend is started: every /api/v1 call is answered here with the shapes the real
 * endpoints return. It proves the browser sends userId + subscriptionId + branchId (what the
 * server validator requires) after finding the member by email at the chosen branch.
 */

const USER_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '22222222-2222-4222-8222-222222222222';
const SUB_ID = '33333333-3333-4333-8333-333333333333';

const json = (route: Route, data: unknown, status = 200, extra: Record<string, unknown> = {}) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ success: status < 400, message: 'ok', data, ...extra }),
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

test.describe('Manual check-in', () => {
  test('finds the member and their subscription, then posts all three ids', async ({ page }) => {
    let posted: any = null;
    let lookupQuery: string | null = null;
    let subsQuery: URLSearchParams | null = null;

    await page.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace('/api/v1', '');
      const method = route.request().method();

      if (path === '/tenants/me') return json(route, { tenant: { id: 't1', status: 'ACTIVE' }, subscription: null });
      if (path === '/gyms/branches') return json(route, { branches: [{ id: BRANCH_ID, branchName: 'Uptown' }] });
      if (path === `/host/branches/${BRANCH_ID}/members/lookup`) {
        lookupQuery = url.searchParams.get('email');
        return json(route, { exists: true, user: { id: USER_ID, fullName: 'Ali Raza', email: 'ali@example.test' } });
      }
      if (path === '/subscriptions/staff') {
        subsQuery = url.searchParams;
        return json(route, {
          subscriptions: [{
            id: SUB_ID, userId: USER_ID, branchId: BRANCH_ID, status: 'ACTIVE', endDate: '2999-01-01',
            remainingVisits: null, plan: { id: 'p1', name: 'Monthly' },
          }],
        });
      }
      if (path === '/attendance/check-in' && method === 'POST') {
        posted = route.request().postDataJSON();
        return json(route, { log: { id: 'log-1' } }, 201);
      }
      if (path === '/attendance' || path === '/attendance/today') return json(route, { logs: [] });
      return json(route, {});
    });

    await signInAsHost(page);
    await page.goto('/gym/attendance');

    await page.getByRole('button', { name: 'Manual Check-in' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('member@example.com').fill('Ali@Example.test');
    await dialog.getByRole('combobox').selectOption(BRANCH_ID);
    await dialog.getByRole('button', { name: 'Record Check-in' }).click();

    await expect(dialog).toBeHidden();
    expect(lookupQuery).toBe('ali@example.test');
    expect(subsQuery?.get('branchId')).toBe(BRANCH_ID);
    expect(subsQuery?.get('userId')).toBe(USER_ID);
    expect(posted).toEqual({ userId: USER_ID, subscriptionId: SUB_ID, branchId: BRANCH_ID });
  });

  test('shows the server’s reason when the member is already checked in', async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
      if (path === '/tenants/me') return json(route, { tenant: { id: 't1', status: 'ACTIVE' }, subscription: null });
      if (path === '/gyms/branches') return json(route, { branches: [{ id: BRANCH_ID, branchName: 'Uptown' }] });
      if (path.endsWith('/members/lookup')) return json(route, { exists: true, user: { id: USER_ID, fullName: 'Ali Raza', email: 'ali@example.test' } });
      if (path === '/subscriptions/staff') {
        return json(route, { subscriptions: [{ id: SUB_ID, userId: USER_ID, branchId: BRANCH_ID, status: 'ACTIVE', endDate: '2999-01-01', remainingVisits: null }] });
      }
      if (path === '/attendance/check-in') {
        return json(route, null, 409, { message: 'Member already checked in at 10:32', code: 'ALREADY_CHECKED_IN' });
      }
      if (path === '/attendance' || path === '/attendance/today') return json(route, { logs: [] });
      return json(route, {});
    });

    await signInAsHost(page);
    await page.goto('/gym/attendance');
    await page.getByRole('button', { name: 'Manual Check-in' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('member@example.com').fill('ali@example.test');
    await dialog.getByRole('combobox').selectOption(BRANCH_ID);
    await dialog.getByRole('button', { name: 'Record Check-in' }).click();

    await expect(dialog.getByRole('alert')).toHaveText('Member already checked in at 10:32');
  });
});
