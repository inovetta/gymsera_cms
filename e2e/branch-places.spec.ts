import { test, expect, Page } from '@playwright/test';
import { answerShell, apiPath, contextFor, json, signIn } from './support/api';

/**
 * Branch form on Google Places through our API (Phase 7 P9, NEW-140; P3 item 7). No backend and no
 * Google: every /api/v1 call is answered here, and any request to a Google host fails the test,
 * because the browser must never search Google itself (the API holds the server key).
 */

const CITY = { placeId: 'city-lahore', formattedAddress: 'Lahore, Pakistan', latitude: 31.5204, longitude: 74.3587, city: { id: 7, name: 'Lahore' }, area: null };
const ADDRESS = {
  placeId: 'addr-mm-alam', formattedAddress: '12 MM Alam Road, Gulberg III, Lahore', latitude: 31.5101, longitude: 74.3442,
  city: { id: 7, name: 'Lahore' }, area: { id: 71, name: 'Gulberg III' },
};

async function serve(page: Page) {
  const created: any[] = [];
  const googleCalls: string[] = [];
  await page.route(/googleapis\.com|gstatic\.com/, (route) => {
    googleCalls.push(route.request().url());
    return route.abort();
  });
  await page.route('**/api/v1/**', async (route) => {
    const path = apiPath(route);
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (await answerShell(route, path, contextFor(true, ['*']))) return;
    if (path === '/host/listings') return json(route, [{ id: 'listing-1', title: 'Iron Gym', status: 'ACTIVE' }]);
    if (path === '/host/listings/listing-1/branches') return json(route, { branches: [] });
    if (path === '/host/organization-quota') return json(route, { maxOrganizations: 3, canCreateNext: true, blockingListingStatus: null });
    if (path === '/host/branch-quota') return json(route, { maxBranches: 3, usedBranches: 1, remainingBranches: 2, activeBranches: 1, buildableBranches: 2, overQuotaCount: 0 });
    if (path === '/cities') return json(route, []);
    if (path === '/places/autocomplete') {
      const kind = url.searchParams.get('kind');
      const suggestions = kind === 'city'
        ? [{ placeId: 'city-lahore', primaryText: 'Lahore', secondaryText: 'Punjab, Pakistan' }]
        : kind === 'address' ? [{ placeId: 'addr-mm-alam', primaryText: '12 MM Alam Road', secondaryText: 'Gulberg III, Lahore' }] : [];
      return json(route, { suggestions });
    }
    if (path === '/places/details/city-lahore') return json(route, CITY);
    if (path === '/places/details/addr-mm-alam') return json(route, ADDRESS);
    if (path === '/host/branches' && method === 'POST') {
      created.push(route.request().postDataJSON());
      return json(route, { branch: { id: 'b-new', branchName: 'MM Alam' } }, 201);
    }
    return json(route, {});
  });
  return { created, googleCalls };
}

test('Add Branch: city and address from /places; the branch carries the ids, the point and the place id', async ({ page }) => {
  const { created, googleCalls } = await serve(page);
  await signIn(page);
  await page.goto('/gym/branches');

  await page.getByRole('button', { name: /add branch/i }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder(/main branch, gulberg/i).fill('MM Alam');

  await dialog.getByLabel('City', { exact: true }).fill('Lah');
  await dialog.getByRole('button', { name: /Lahore/ }).click();
  await expect(dialog.getByLabel('City', { exact: true })).toHaveValue('Lahore');

  await dialog.getByLabel('Address', { exact: true }).fill('12 MM');
  await dialog.getByRole('button', { name: /12 MM Alam Road/ }).click();
  await expect(dialog.getByLabel('Address', { exact: true })).toHaveValue(ADDRESS.formattedAddress);
  await expect(dialog.getByLabel('Latitude', { exact: true })).toHaveValue('31.5101');

  await dialog.getByLabel(/plan name/i).fill('Monthly');
  await dialog.getByLabel(/^price/i).fill('4000');
  await dialog.getByRole('button', { name: /^create branch$/i }).click();

  await expect.poll(() => created.length).toBe(1);
  expect(created[0]).toMatchObject({
    branchName: 'MM Alam', cityId: 7, areaId: 71, address: ADDRESS.formattedAddress,
    latitude: 31.5101, longitude: 74.3442, googlePlaceId: 'addr-mm-alam',
  });
  // No Google search from the browser; with no web key in the test build there is no map either.
  expect(googleCalls.filter((u) => /place|geocode|autocomplete/i.test(u))).toEqual([]);
});
