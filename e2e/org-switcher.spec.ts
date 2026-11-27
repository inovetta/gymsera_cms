import { test, expect, Page, Route } from '@playwright/test';

/**
 * Organization switcher smoke test (Prompt 3B). No backend: every /api/v1 call is answered
 * here, and the X-Organization-Id header of each is recorded (contract v2 §1; was X-Tenant-Id).
 * GET /me/context lists `organizations[].organizationId` (Workspace, was tenantId). No real account or token.
 */

const org = (organizationId: string, name: string, roleKey: string, roleName: string, level: number, perms: string[]) => ({
  organizationId,
  name,
  isOwner: false,
  role: { key: roleKey, name: roleName, level },
  scopeType: 'ORG',
  orgPermissions: perms,
  branches: [{ id: `${organizationId}-b1`, name: 'Main', permissions: perms }],
  pendingApprovals: 0,
});

const context = {
  user: { id: 'user-1', fullName: 'Sana Malik', platformRole: 'MEMBER' },
  organizations: [
    org('org-a', 'Iron Gym', 'ORG_ADMIN', 'Org Admin', 80, ['team.view', 'approvals.view', 'members.view', 'payments.view']),
    org('org-b', 'Fit Hub', 'DESK', 'Front Desk', 20, ['members.view', 'payments.view']),
  ],
  pendingApprovals: 0,
  needsContextSwitcher: true,
};

const json = (route: Route, data: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'ok', data }) });

async function signIn(page: Page) {
  await page.context().addCookies([{ name: 'gymsera_session', value: '1', url: 'http://localhost:3001' }]);
  await page.addInitScript(() => {
    localStorage.setItem('gymsera_access_token', 'e2e-placeholder');
    localStorage.setItem('gymsera_refresh_token', 'e2e-placeholder');
    localStorage.setItem('gymsera_user', JSON.stringify({ id: 'user-1', fullName: 'Sana Malik', email: 'sana@example.test', role: 'MEMBER', status: 'ACTIVE' }));
  });
}

test.describe('Organization switcher', () => {
  test('switching sends X-Organization-Id, changes the menu, and survives a reload', async ({ page }) => {
    const teamHeaders: Array<string | undefined> = [];
    const contextHeaders: Array<string | undefined> = [];
    const oldHeader: string[] = [];

    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
      const headers = route.request().headers();
      const tenant = headers['x-organization-id'];
      if (headers['x-tenant-id'] !== undefined) oldHeader.push(path);
      if (path === '/me/context') {
        contextHeaders.push(tenant);
        return json(route, context);
      }
      if (path === '/team') {
        teamHeaders.push(tenant);
        return json(route, { team: [], counts: {}, total: 0 });
      }
      if (path === '/approvals') return json(route, []);
      return json(route, {});
    });

    await signIn(page);
    await page.goto('/gym/team');

    const switcher = page.getByLabel('Organization');
    await expect(switcher).toBeVisible();
    await expect(switcher).toHaveValue('org-a');
    const nav = page.getByRole('navigation').first();
    await expect(nav.getByRole('link', { name: 'Team & access' })).toBeVisible();

    await switcher.selectOption('org-b');

    await expect(switcher).toHaveValue('org-b');
    await expect(nav.getByRole('link', { name: 'Team & access' })).toHaveCount(0);
    await expect.poll(() => teamHeaders[teamHeaders.length - 1]).toBe('org-b');

    await page.reload();
    await expect(page.getByLabel('Organization')).toHaveValue('org-b');
    await expect.poll(() => teamHeaders[teamHeaders.length - 1]).toBe('org-b');

    // The call that lists the organizations never carries one.
    expect(contextHeaders.every((h) => h === undefined)).toBe(true);
    // The v1 header is gone (R-120: no old-build compatibility).
    expect(oldHeader).toEqual([]);
  });
});
