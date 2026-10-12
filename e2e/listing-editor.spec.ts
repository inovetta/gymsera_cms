import { test, expect, Page } from '@playwright/test';
import { answerShell, apiPath, BRANCH_ID, contextFor, fail, json, signIn } from './support/api';

/**
 * Branch listing editor (Prompt 3D, UX-21): the sections of the mobile listing hub on
 * GET / PATCH /host/branches/:id/listing-content. No backend is started; every call is answered here.
 */

const branch = {
  id: BRANCH_ID,
  branchName: 'Uptown Iron',
  status: 'ACTIVE',
  tagline: 'Lift heavy',
  category: 'Strength',
  description: 'A serious gym.',
  tagsJson: [],
  facilitiesJson: ['AC'],
  imagesJson: [],
  openingTime: '06:00:00',
  closingTime: '22:00:00',
  address: '12 Main Road',
  addressLine1: '12 Main Road',
  cityId: 1,
  latitude: '31.5204',
  longitude: '74.3587',
  travelerVisibilityStatus: 'active',
};

const plan = { id: 'p1', name: 'Monthly', durationType: 'MONTHLY', durationValue: 1, price: 5000, status: 'ACTIVE', branchId: BRANCH_ID };

async function serve(page: Page, context: unknown, onPatch: (body: any) => { status: number; body: any }) {
  const patches: any[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const path = apiPath(route);
    const method = route.request().method();
    if (await answerShell(route, path, context)) return;
    if (path === `/host/branches/${BRANCH_ID}/listing-content` && method === 'GET') return json(route, { branch });
    if (path === `/host/branches/${BRANCH_ID}/listing-content` && method === 'PATCH') {
      const body = route.request().postDataJSON();
      patches.push(body);
      const reply = onPatch(body);
      return reply.status < 400 ? json(route, reply.body, reply.status) : fail(route, reply.status, reply.body);
    }
    if (path === '/membership-plans/host') return json(route, { plans: [plan] });
    if (path === '/cities') return json(route, [{ id: 1, name: 'Lahore', isActive: true, areas: [] }]);
    return json(route, {});
  });
  return patches;
}

test.describe('Listing editor', () => {
  test('owner edits the tagline: only that field is sent, and Boost is a disabled COMING SOON card', async ({ page }) => {
    const patches = await serve(page, contextFor(true, ['*']), () => ({ status: 200, body: { branch } }));
    await signIn(page);
    await page.goto(`/gym/branches/${BRANCH_ID}/listing`);

    await expect(page.getByTestId('summary-basic')).toContainText('Lift heavy');
    await expect(page.getByTestId('summary-packages')).toContainText('1 package');
    const boost = page.getByTestId('section-boost');
    await expect(boost).toContainText('COMING SOON');
    await expect(boost.getByRole('button')).toHaveCount(0);

    await page.getByRole('button', { name: 'Edit Basic Info' }).click();
    await page.getByLabel('Tagline').fill('Lift heavier');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect.poll(() => patches.length).toBe(1);
    expect(patches[0]).toEqual({ tagline: 'Lift heavier' });
  });

  test('a 202 shows the approval notice, a 403 shows the server message', async ({ page }) => {
    let call = 0;
    await serve(page, contextFor(true, ['*']), () => {
      call += 1;
      return call === 1
        ? { status: 202, body: { approvalRequestId: 'req-3', status: 'PENDING', summary: 'Edit listing' } }
        : { status: 403, body: { message: 'Only the organization owner can edit the listing' } };
    });
    await signIn(page);
    await page.goto(`/gym/branches/${BRANCH_ID}/listing`);

    await page.getByRole('button', { name: 'Edit Amenities' }).click();
    await page.getByRole('button', { name: 'Sauna' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Submitted for approval')).toBeVisible();

    await page.getByRole('button', { name: 'Parking' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('save-error')).toContainText('Only the organization owner can edit the listing');
  });

  test('someone without listing.manage sees no-access and the listing is never requested', async ({ page }) => {
    let listingCalls = 0;
    await page.route('**/api/v1/**', async (route) => {
      const path = apiPath(route);
      if (await answerShell(route, path, contextFor(false, ['members.view']))) return;
      if (path.includes('listing-content')) listingCalls += 1;
      return json(route, {});
    });
    await signIn(page, 'MEMBER');
    await page.goto(`/gym/branches/${BRANCH_ID}/listing`);

    await expect(page.getByTestId('no-access')).toBeVisible();
    expect(listingCalls).toBe(0);
  });
});
