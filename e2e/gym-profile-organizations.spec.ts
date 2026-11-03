import { test, expect, Page } from '@playwright/test';
import { answerShell, apiPath, contextFor, json, signIn } from './support/api';

/**
 * Gym Profile, NEW-196 (P10b): every organization can be edited, not only the first. The page lists
 * the organizations (GET /host/listings), loads the chosen one (GET /host/listings/:id) and saves it
 * (PATCH /host/listings/:id). /gyms/profile (first organization only) is never called. No backend is
 * started; every call is answered here.
 */

const listings = [
  { id: 'org-1', title: 'Iron Gym', status: 'ACTIVE' },
  { id: 'org-2', title: 'Fit Hub', status: 'ACTIVE' },
];

const organization = (id: string, name: string) => ({
  id,
  title: name,
  status: 'ACTIVE',
  category: 'General',
  establishedYear: 2018,
  gym: {
    id: `gym-${id}`,
    name,
    description: `${name} description`,
    genderType: 'MIXED',
    contactPhone: '+92 300 1111111',
    contactEmail: `${id}@example.test`,
    website: null,
    logoUrl: null,
    coverImageUrl: null,
    imagesJson: [],
  },
});

const orgAdminContext = {
  ...contextFor(false, []),
  organizations: [
    {
      tenantId: 'tenant-1',
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
    if (path.startsWith('/gyms/profile') || path.startsWith('/host/listings')) {
      calls.push({ method, path, body: method === 'PATCH' ? route.request().postDataJSON() : undefined });
    }
    if (await answerShell(route, path, context)) return;
    if (path === '/host/listings' && method === 'GET') return json(route, listings);
    const one = /^\/host\/listings\/(org-\d)$/.exec(path);
    if (one && method === 'GET') return json(route, organization(one[1], one[1] === 'org-1' ? 'Iron Gym' : 'Fit Hub'));
    if (one && method === 'PATCH') return json(route, { id: one[1] });
    return json(route, {});
  });
  return calls;
}

test.describe('Gym Profile: each organization', () => {
  test('the owner switches to the second organization and saves it; /gyms/profile is never called', async ({ page }) => {
    const calls = await serve(page, contextFor(true, ['*']));
    await signIn(page);
    await page.goto('/gym/profile');

    await expect(page.getByLabel('Organization Name *')).toHaveValue('Iron Gym');
    await page.getByRole('tab', { name: 'Fit Hub' }).click();
    await expect(page.getByLabel('Organization Name *')).toHaveValue('Fit Hub');

    await page.getByLabel('Organization Name *').fill('Fit Hub Gulberg');
    await page.getByRole('button', { name: 'Save Changes' }).first().click();

    await expect.poll(() => calls.filter((c) => c.method === 'PATCH').length).toBe(1);
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.path).toBe('/host/listings/org-2');
    expect(patch.body).toMatchObject({ gymName: 'Fit Hub Gulberg', genderType: 'MIXED', contactEmail: 'org-2@example.test' });
    expect(calls.some((c) => c.path.startsWith('/gyms/profile'))).toBe(false);
  });

  test('an Org Admin with listing.manage edits an organization too (R-89)', async ({ page }) => {
    const calls = await serve(page, orgAdminContext);
    await signIn(page, 'MEMBER');
    await page.goto('/gym/profile');

    await expect(page.getByLabel('Organization Name *')).toHaveValue('Iron Gym');
    await page.getByLabel('Website').fill('https://irongym.example.test');
    await page.getByRole('button', { name: 'Save Changes' }).first().click();

    await expect.poll(() => calls.filter((c) => c.method === 'PATCH').length).toBe(1);
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.path).toBe('/host/listings/org-1');
    expect(patch.body).toMatchObject({ website: 'https://irongym.example.test' });
  });
});
