import { test, expect } from '@playwright/test';
import { BRANCH_ID, answerShell, apiPath, contextFor, fail, json, signIn } from './support/api';

/**
 * Collection ledger (Prompt 3C): the day's totals and cash per collector come from the server,
 * and a close that needs approval says so instead of "closed".
 */

const day = {
  ledgerDay: { id: 'day-1', branchId: BRANCH_ID, businessDate: '2026-10-10', status: 'OPEN' },
  businessDate: '2026-10-10',
  isMissed: false,
  payments: [{ id: 'p1', userId: 'u1', amount: 1500.5, method: 'CASH', status: 'COMPLETED' }],
  totals: { expected: 5000, collected: 4500.5, verified: 4000, pending: 500.5, variance: -499.5 },
  byMethod: { CASH: 3000, BANK_TRANSFER: 1500.5 },
  byCollector: [{ collectorId: 'c1', collectorName: 'Sana Ahmed', total: 3000, cashCollected: 2500, cashExpected: 3000, count: 4, shifts: {} }],
  adjustments: [],
};

const ledgerKeys = ['ledger.today.view', 'ledger.close', 'ledger.close.direct', 'ledger.verify', 'ledger.verify.direct'];
const requestKeys = ['ledger.today.view', 'ledger.close', 'ledger.verify'];

test.describe('Ledger', () => {
  test('shows the server totals and cash per collector; a direct close posts the day to /actions/ledger.close', async ({ page }) => {
    const closes: any[] = [];
    await page.route('**/api/v1/**', async (route) => {
      const path = apiPath(route);
      if (await answerShell(route, path, contextFor(false, ledgerKeys))) return;
      if (path === '/ledger/today') return json(route, day);
      if (path === '/ledger/open-days') return json(route, { days: [] });
      if (path === '/actions/ledger.close') {
        closes.push(route.request().postDataJSON());
        return json(route, { status: 'EXECUTED', result: {} });
      }
      return json(route, {});
    });

    await signIn(page, 'MEMBER');
    await page.goto('/gym/ledger');

    await expect(page.getByTestId('ledger-totals')).toContainText('5,000');
    await expect(page.getByText('Sana Ahmed')).toBeVisible();
    await expect(page.getByText('Collected and expected cash do not match.')).toBeVisible();

    await page.getByRole('button', { name: 'Close day' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Close day' }).click();

    await expect.poll(() => closes.length).toBe(1);
    expect(closes[0]).toMatchObject({ branchId: BRANCH_ID, payload: { ledgerDayId: 'day-1', businessDate: '2026-10-10' } });
    expect(typeof closes[0].idempotencyKey).toBe('string');
    await expect(page.getByText('Submitted for approval')).toHaveCount(0);
  });

  test('a close that answers 202 shows the approval notice with a link, not "closed"', async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      const path = apiPath(route);
      if (await answerShell(route, path, contextFor(false, requestKeys))) return;
      if (path === '/ledger/today') return json(route, day);
      if (path === '/ledger/open-days') return json(route, { days: [] });
      if (path === '/actions/ledger.close') {
        return json(route, { status: 'PENDING', requestId: 'req-1', summary: 'Close ledger — 2026-10-10' }, 202);
      }
      return json(route, {});
    });

    await signIn(page, 'MEMBER');
    await page.goto('/gym/ledger');

    await page.getByRole('button', { name: 'Request close' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Send request' }).click();

    await expect(page.getByText('Submitted for approval')).toBeVisible();
    await expect(page.getByRole('link', { name: 'View your requests' })).toHaveAttribute('href', '/gym/approvals?tab=mine');
  });

  test('without ledger.today.view the URL shows a no-access state and calls no ledger endpoint', async ({ page }) => {
    const ledgerCalls: string[] = [];
    await page.route('**/api/v1/**', async (route) => {
      const path = apiPath(route);
      if (path.startsWith('/ledger')) ledgerCalls.push(path);
      if (await answerShell(route, path, contextFor(false, ['dashboard.view']))) return;
      return json(route, {});
    });

    await signIn(page, 'MEMBER');
    await page.goto('/gym/ledger');

    await expect(page.getByTestId('no-access')).toBeVisible();
    expect(ledgerCalls).toHaveLength(0);
  });

  test('a ledger error shows the server message', async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      const path = apiPath(route);
      if (await answerShell(route, path, contextFor(false, ledgerKeys))) return;
      if (path === '/ledger/open-days') return json(route, { days: [] });
      if (path === '/ledger/today') return fail(route, 500, { message: 'The ledger store is offline' });
      return json(route, {});
    });

    await signIn(page, 'MEMBER');
    await page.goto('/gym/ledger');
    await expect(page.getByText('The ledger store is offline')).toBeVisible();
  });
});
