import { test, expect } from '@playwright/test';
import { answerShell, apiPath, appConfig, contextFor, json, signIn } from './support/api';

/**
 * P11d, R-99: with payouts off (GET /meta/app-config `features.payouts` false, or the call failing)
 * the menu has no Payouts item, /gym/payouts shows no payout data and calls no payout route, and the
 * owner manages the bank details travellers pay into under Bank details.
 */

const bank = { bankName: 'Meezan Bank', accountTitle: 'Iron Gym Pvt Ltd', accountNumber: '1234010998877', iban: 'PK49MEZN001234010998877' };

const routeApi = async (page: import('@playwright/test').Page, configAnswer: 'off' | 'error', payoutCalls: string[]) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = apiPath(route);
    if (path === '/meta/app-config') {
      if (configAnswer === 'error') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"success":false}' });
      return json(route, appConfig(false));
    }
    if (await answerShell(route, path, contextFor(true, ['*']))) return;
    if (path.startsWith('/host/payouts')) payoutCalls.push(path);
    if (path === '/host/payout-account') {
      return json(route, { account: { id: 'pa1', scope: 'TENANT', organizationId: null, provider: 'BANK_TRANSFER', status: 'ACTIVE', details: bank, detailsUpdatedAt: null } });
    }
    return json(route, {});
  });
};

for (const configAnswer of ['off', 'error'] as const) {
  test.describe(`R-99 payouts hidden (config ${configAnswer})`, () => {
    test('no Payouts menu item; Bank details opens the account travellers pay into', async ({ page }) => {
      const payoutCalls: string[] = [];
      await routeApi(page, configAnswer, payoutCalls);
      await signIn(page);
      await page.goto('/gym/bank-details');

      const nav = page.getByRole('navigation').first();
      await expect(nav.getByRole('link', { name: 'Bank details' })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Payouts' })).toHaveCount(0);

      const details = page.getByTestId('bank-details');
      await expect(details).toContainText('Meezan Bank');
      await expect(details).not.toContainText('1234010998877');
      await expect(page.getByText(/travellers/i).first()).toBeVisible();
      expect(payoutCalls).toEqual([]);
    });

    test('/gym/payouts shows "not available", no balance and no payout calls', async ({ page }) => {
      const payoutCalls: string[] = [];
      await routeApi(page, configAnswer, payoutCalls);
      await signIn(page);
      await page.goto('/gym/payouts');

      await expect(page.getByTestId('payouts-unavailable')).toBeVisible();
      await expect(page.getByTestId('payout-balance')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Request payout|Ask for a payout/ })).toHaveCount(0);
      expect(payoutCalls).toEqual([]);
    });
  });
}
