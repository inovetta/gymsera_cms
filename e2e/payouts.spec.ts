import { test, expect } from '@playwright/test';
import { answerShell, apiPath, contextFor, fail, json, signIn } from './support/api';

/**
 * Payouts and bank details (Prompt 3C): the balance is the server's, a payout that needs approval
 * is not "requested", and bank details change only after a password.
 */

const balance = { branchId: null, totalCollected: 10000, totalRefunded: 500, totalExpenses: 1000.25, totalPayouts: 2000, availableBalance: 6499.75, currency: 'PKR' };
const bank = { bankName: 'Meezan Bank', accountTitle: 'Iron Gym Pvt Ltd', accountNumber: '1234010998877', iban: 'PK49MEZN001234010998877' };

test.describe('Payouts', () => {
  test('requests a payout with an Idempotency-Key; 202 shows the approval notice', async ({ page }) => {
    const requests: { headers: Record<string, string>; body: any }[] = [];
    await page.route('**/api/v1/**', async (route) => {
      const path = apiPath(route);
      const method = route.request().method();
      if (await answerShell(route, path, contextFor(false, []).organizations.length ? { ...contextFor(false, []), organizations: [{ ...contextFor(false, []).organizations[0], orgPermissions: ['payouts.view', 'payouts.request'] }] } : {})) return;
      if (path === '/host/payouts/balance') return json(route, balance);
      if (path === '/host/payouts' && method === 'GET') return json(route, { payouts: [] }, 200, { pagination: { page: 1, limit: 20, total: 0, pages: 1 } });
      if (path === '/host/payouts' && method === 'POST') {
        requests.push({ headers: route.request().headers(), body: route.request().postDataJSON() });
        return json(route, { approvalRequestId: 'req-8', status: 'PENDING', summary: 'Request payout: Rs 1500' }, 202);
      }
      return json(route, {});
    });

    await signIn(page, 'MEMBER');
    await page.goto('/gym/payouts');

    await expect(page.getByTestId('payout-balance')).toContainText('6,499.75');
    await page.getByRole('button', { name: 'Ask for a payout' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/Amount/).fill('1500');
    await dialog.getByRole('button', { name: 'Send request' }).click();

    await expect(page.getByText('Submitted for approval')).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(requests[0].headers['idempotency-key']).toBeTruthy();
    expect(requests[0].body).toEqual({ amount: 1500 });
  });

  test('changing bank details needs a password; a wrong one shows the server message and saves nothing', async ({ page }) => {
    const patches: any[] = [];
    await page.route('**/api/v1/**', async (route) => {
      const path = apiPath(route);
      const method = route.request().method();
      if (await answerShell(route, path, contextFor(true, ['*']))) return;
      if (path === '/host/payouts/balance') return json(route, balance);
      if (path === '/host/payouts') return json(route, { payouts: [] }, 200, { pagination: { page: 1, limit: 20, total: 0, pages: 1 } });
      if (path === '/gyms/profile' && method === 'GET') return json(route, { gym: { id: 'g1', name: 'Iron Gym', paymentDetailsJson: bank } });
      if (path === '/gyms/profile' && method === 'PATCH') {
        const body = route.request().postDataJSON();
        patches.push(body);
        if (body.password !== 'right-password') {
          return fail(route, 401, { code: 'invalid_credentials', message: 'Incorrect password' });
        }
        return json(route, { gym: { id: 'g1', paymentDetailsJson: body.paymentDetailsJson, paymentDetailsUpdatedAt: '2026-10-10T08:00:00Z' } });
      }
      return json(route, {});
    });

    await signIn(page);
    await page.goto('/gym/payouts');

    const details = page.getByTestId('bank-details');
    await expect(details).toContainText('Meezan Bank');
    await expect(details).not.toContainText('1234010998877');

    await page.getByRole('button', { name: 'Change' }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel(/Account number/).fill('9998887776665');
    await form.getByRole('button', { name: 'Continue' }).click();
    expect(patches).toHaveLength(0);

    const reauth = page.getByRole('alertdialog');
    await reauth.getByLabel('Account password').fill('wrong');
    await reauth.getByRole('button', { name: 'Save bank details' }).click();
    await expect(reauth.getByText('Incorrect password')).toBeVisible();

    await reauth.getByLabel('Account password').fill('right-password');
    await reauth.getByRole('button', { name: 'Save bank details' }).click();
    await expect(reauth).toBeHidden();

    expect(patches).toHaveLength(2);
    expect(patches[1]).toMatchObject({
      password: 'right-password',
      paymentDetailsJson: { accountNumber: '9998887776665', bankName: 'Meezan Bank' },
    });
  });

  test('without payouts.view the URL shows a no-access state', async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      if (await answerShell(route, apiPath(route), contextFor(false, ['dashboard.view']))) return;
      return json(route, {});
    });
    await signIn(page, 'MEMBER');
    await page.goto('/gym/payouts');
    await expect(page.getByTestId('no-access')).toBeVisible();
  });
});
