import { Page, Route } from '@playwright/test';

/**
 * Shared bits for the money-page specs (Prompt 3C). No backend is started: every /api/v1 call is
 * answered with `page.route`, with the shapes the real endpoints return.
 */

export const BRANCH_ID = '22222222-2222-4222-8222-222222222222';

export const json = (route: Route, data: unknown, status = 200, extra: Record<string, unknown> = {}) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ success: status < 400, message: status < 400 ? 'ok' : 'error', data, ...extra }),
  });

export const fail = (route: Route, status: number, body: Record<string, unknown>) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: false, ...body }) });

export async function signIn(page: Page, role: 'GYM_HOST' | 'MEMBER' = 'GYM_HOST') {
  await page.context().addCookies([{ name: 'gymsera_session', value: '1', url: 'http://localhost:3001' }]);
  await page.addInitScript((accountRole) => {
    localStorage.setItem('gymsera_access_token', 'e2e-placeholder');
    localStorage.setItem('gymsera_refresh_token', 'e2e-placeholder');
    localStorage.setItem(
      'gymsera_user',
      JSON.stringify({ id: 'user-1', fullName: 'Hira Khan', email: 'hira@example.test', role: accountRole, status: 'ACTIVE' })
    );
  }, role);
  // The realtime socket has nothing to talk to here; the bell falls back to the poll.
  await page.route('**/socket.io/**', (route) => route.abort());
}

export const contextFor = (isOwner: boolean, permissions: string[]) => ({
  user: { id: 'user-1', fullName: 'Hira Khan', platformRole: 'MEMBER', isHost: isOwner },
  pendingApprovals: 0,
  needsContextSwitcher: false,
  organizations: [
    {
      tenantId: 'tenant-1',
      name: 'Iron Gym',
      isOwner,
      role: isOwner ? { key: 'OWNER', name: 'Owner', level: 100 } : { key: 'MANAGER', name: 'Branch Manager', level: 60 },
      scopeType: isOwner ? 'ORG' : 'BRANCH',
      orgPermissions: isOwner ? ['*'] : [],
      branches: [{ id: BRANCH_ID, name: 'Uptown', permissions: isOwner ? ['*'] : permissions }],
      pendingApprovals: 0,
    },
  ],
});

/** The calls every page makes on load. Returns true when it answered. */
export async function answerShell(route: Route, path: string, context: unknown): Promise<boolean> {
  if (path === '/me/context') { await json(route, context); return true; }
  if (path === '/tenants/me') { await json(route, { tenant: { id: 'tenant-1', status: 'ACTIVE' }, subscription: null }); return true; }
  if (path === '/gyms/branches') { await json(route, { branches: [{ id: BRANCH_ID, branchName: 'Uptown', status: 'ACTIVE' }] }); return true; }
  if (path === '/approvals') { await json(route, []); return true; }
  if (path === '/notifications/unread-count') { await json(route, { unreadCount: 0 }); return true; }
  if (path === '/notifications') { await json(route, { notifications: [] }); return true; }
  return false;
}

export const apiPath = (route: Route) => new URL(route.request().url()).pathname.replace('/api/v1', '');
