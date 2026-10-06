import { test, expect, Page, Route } from '@playwright/test';

/**
 * Team & access smoke test (UX-12).
 *
 * No backend is started: every /api/v1 call is answered here with the shapes the
 * real endpoints return. No real account, password or token is used.
 */

const roles = [
  { key: 'OWNER', level: 100, name: 'Owner', assignable: false, assignableByMe: false },
  { key: 'ORG_ADMIN', level: 80, name: 'Org Admin', assignable: true, assignableByMe: true },
  { key: 'DESK', level: 20, name: 'Front Desk', assignable: true, assignableByMe: true },
].map((r) => ({
  ...r,
  displayName: r.name,
  charter: `${r.name} charter`,
  defaultScope: r.level >= 80 ? 'ORG' : 'BRANCH',
  permissionCount: 1,
  preset: r.key === 'DESK' ? [{ permissionKey: 'members.create', scope: 'ALL', tier: 'R' }] : [],
}));

const member = (id: string, fullName: string, roleKey: string, roleName: string, level: number) => ({
  id,
  userId: `user-${id}`,
  email: `${id}@example.test`,
  fullName,
  profileImageUrl: null,
  role: { key: roleKey, name: roleName, level },
  scopeType: roleKey === 'OWNER' ? 'ORG' : 'BRANCH',
  status: 'ACTIVE',
  branches: roleKey === 'OWNER' ? [] : [{ id: 'branch-1', name: 'Uptown' }],
  hasCustomAccess: false,
  overrideCount: 0,
  version: 3,
});

const team = [
  member('owner', 'Hira Khan', 'OWNER', 'Owner', 100),
  member('desk-1', 'Sana Malik', 'DESK', 'Front Desk', 20),
  member('desk-2', 'Omar Raza', 'DESK', 'Front Desk', 20),
];

const deskDetail = {
  ...team[1],
  overrides: [],
  effectivePermissions: ['members.create'],
  effectiveScopes: {},
};

const catalogue = [
  {
    module: 'members',
    label: 'Members',
    permissions: [
      { key: 'members.create', label: 'Add a member', approvable: true, dangerous: false, orgOnly: false, scopes: ['ALL'], note: null },
    ],
  },
];

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

test.describe('Team & access', () => {
  test('lists the team with role chips, opens a member, and reloads on 409 grants_changed', async ({ page }) => {
    let memberReads = 0;
    let savedBody: any = null;

    await page.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace('/api/v1', '');
      const method = route.request().method();

      if (path === '/tenants/me') return json(route, { tenant: { id: 't1', status: 'ACTIVE' }, subscription: null });
      if (path === '/team/meta/roles') return json(route, { roles, myLevel: 100, isOwner: true });
      if (path === '/team/meta/permissions') return json(route, { modules: catalogue });
      if (path === '/team') return json(route, { team, counts: {}, total: team.length });
      if (path === '/gyms/branches') return json(route, { branches: [{ id: 'branch-1', branchName: 'Uptown' }] });
      if (path === '/team/desk-1' && method === 'GET') {
        memberReads += 1;
        // The second read is the reload after the conflict: someone else turned it off.
        return json(
          route,
          memberReads === 1
            ? deskDetail
            : { ...deskDetail, version: 4, overrides: [{ permissionKey: 'members.create', effect: 'DENY' }], effectivePermissions: [] }
        );
      }
      if (path === '/team/desk-1/permissions' && method === 'PUT') {
        savedBody = route.request().postDataJSON();
        return json(route, null, 409, {
          message: 'This team member was modified by another user. Reload and try again.',
          code: 'grants_changed',
        });
      }
      return json(route, {});
    });

    await signInAsHost(page);
    await page.goto('/gym/team');

    await expect(page.getByRole('heading', { name: 'Team & access', level: 2 })).toBeVisible();

    // Chips: live counts, no chip for a role nobody holds.
    const chips = page.getByRole('group', { name: 'Filter by role' });
    await expect(chips.getByRole('button', { name: 'All 3' })).toBeVisible();
    await expect(chips.getByRole('button', { name: 'Front Desk 2' })).toBeVisible();
    await expect(chips.getByRole('button', { name: /Org Admin/ })).toHaveCount(0);

    await chips.getByRole('button', { name: 'Front Desk 2' }).click();
    await expect(page.getByRole('row')).toHaveCount(3);

    // Open a member: the three-choice editor shows the server's tier.
    await page.getByText('Sana Malik').click();
    const panel = page.getByRole('complementary', { name: 'Team member access' });
    const choices = panel.getByRole('group', { name: 'Add a member' });
    await expect(choices.getByRole('button', { name: 'Needs approval' })).toHaveAttribute('aria-pressed', 'true');

    // Edit → diff → confirm. The server says someone else saved first.
    await choices.getByRole('button', { name: 'Direct' }).click();
    await panel.getByRole('button', { name: 'Save changes' }).click();
    const diff = page.getByRole('dialog');
    await expect(diff.getByText('Needs approval → Direct')).toBeVisible();
    await diff.getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByTestId('grants-changed-notice')).toBeVisible();
    await expect(choices.getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true');
    expect(savedBody.expectedVersion).toBe(3);
    expect(memberReads).toBe(2);
  });
});
