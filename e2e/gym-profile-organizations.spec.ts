import { test, expect, Page } from '@playwright/test';
import { answerShell, apiPath, contextFor, json, signIn } from './support/api';

/**
 * Business Profile, NEW-196 (P10b): every business can be edited, not only the first. Contract v2 (R-120):
 * the page lists the businesses (GET /host/businesses), loads the chosen one (GET /host/businesses/:businessId,
 * the Business keys flat in `data`), reads its contact e-mail from the staff view
 * (GET /organizations/me/businesses/:businessId/profile → { business }) and saves it with
 * PATCH /host/businesses/:businessId. The old first-business-only route (/gyms/profile) is never called,
 * and the staff profile route is only read. No backend is started; every call is answered here.
 */

const businesses = [
  { id: 'biz-1', name: 'Iron Gym', status: 'ACTIVE', businessVerified: false },
  { id: 'biz-2', name: 'Fit Hub', status: 'ACTIVE', businessVerified: false },
];

const business = (id: string, name: string) => ({
  id,
  organizationId: 'tenant-1',
  name,
  description: `${name} description`,
  status: 'ACTIVE',
  category: 'General',
  establishedYear: 2018,
  genderType: 'MIXED',
  contactPhone: '+92 300 1111111',
  website: null,
  logoUrl: null,
  coverImageUrl: null,
  imagesJson: [],
  businessVerified: false,
  branchCount: 1,
});

const orgAdminContext = {
  ...contextFor(false, []),
  organizations: [
    {
      organizationId: 'tenant-1',
      name: 'Iron Gym',
      isOwner: false,
      role: { key: 'ORG_ADMIN', name: 'Org Admin', level: 80 },
      scopeType: 'ORG',
      orgPermissions: ['listing.manage', 'branch.settings'],
      branches: [],
      pendingApprovals: 0,
    },
  ],
};

async function serve(page: Page, context: unknown) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const path = apiPath(route);
    const method = route.request().method();
    if (path.startsWith('/gyms/profile') || path.startsWith('/host/businesses') || /^\/organizations\/me\/businesses\//.test(path)) {
      calls.push({ method, path, body: method === 'PATCH' ? route.request().postDataJSON() : undefined });
    }
    if (await answerShell(route, path, context)) return;
    if (path === '/host/businesses' && method === 'GET') return json(route, businesses);
    const one = /^\/host\/businesses\/(biz-\d)$/.exec(path);
    if (one && method === 'GET') return json(route, business(one[1], one[1] === 'biz-1' ? 'Iron Gym' : 'Fit Hub'));
    if (one && method === 'PATCH') return json(route, business(one[1], 'saved'));
    const profile = /^\/organizations\/me\/businesses\/(biz-\d)\/profile$/.exec(path);
    if (profile && method === 'GET') return json(route, { business: { id: profile[1], contactEmail: `${profile[1]}@example.test` } });
    return json(route, {});
  });
  return calls;
}

const NAME = 'Business name (shown to travellers) *';

test.describe('Business Profile: each business', () => {
  test('the owner switches to the second business and saves it; /gyms/profile is never called', async ({ page }) => {
    const calls = await serve(page, contextFor(true, ['*']));
    await signIn(page);
    await page.goto('/gym/profile');

    await expect(page.getByLabel(NAME)).toHaveValue('Iron Gym');
    await page.getByRole('tab', { name: 'Fit Hub' }).click();
    await expect(page.getByLabel(NAME)).toHaveValue('Fit Hub');
    await expect(page.getByLabel('Contact Email')).toHaveValue('biz-2@example.test');

    await page.getByLabel(NAME).fill('Fit Hub Gulberg');
    await page.getByRole('button', { name: 'Save Changes' }).first().click();

    await expect.poll(() => calls.filter((c) => c.method === 'PATCH').length).toBe(1);
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.path).toBe('/host/businesses/biz-2');
    expect(patch.body).toMatchObject({ businessName: 'Fit Hub Gulberg', genderType: 'MIXED', contactEmail: 'biz-2@example.test' });
    expect(calls.some((c) => c.path.startsWith('/gyms/profile'))).toBe(false);
    expect(calls.some((c) => c.method !== 'GET' && c.path.startsWith('/organizations/me/businesses/'))).toBe(false);
  });

  test('an Org Admin with listing.manage edits a business too (R-89)', async ({ page }) => {
    const calls = await serve(page, orgAdminContext);
    await signIn(page, 'MEMBER');
    await page.goto('/gym/profile');

    await expect(page.getByLabel(NAME)).toHaveValue('Iron Gym');
    await page.getByLabel('Website').fill('https://irongym.example.test');
    await page.getByRole('button', { name: 'Save Changes' }).first().click();

    await expect.poll(() => calls.filter((c) => c.method === 'PATCH').length).toBe(1);
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.path).toBe('/host/businesses/biz-1');
    expect(patch.body).toMatchObject({ website: 'https://irongym.example.test' });
  });
});
