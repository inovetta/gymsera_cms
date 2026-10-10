import { test, expect } from '@playwright/test';
import { BRANCH_ID, answerShell, apiPath, contextFor, fail, json, signIn } from './support/api';

/**
 * Payments, refunds and invoices (Prompt 3C): money endpoints get an Idempotency-Key, a refund
 * that needs approval is not reported as done, and the invoice list names the branch.
 */

const completed = {
  id: 'pay-9', userId: 'u1', paymentFor: 'MEMBERSHIP', amount: 3000, currency: 'PKR', method: 'CASH',
  status: 'COMPLETED', branchId: BRANCH_ID, createdAt: '2026-10-01T10:00:00.000Z', user: { fullName: 'Ali Raza' },
};

test.describe('Payments money flows', () => {
  test('record payment carries an Idempotency-Key and the amount as a number with two decimals', async ({ page }) => {
    const posted: { headers: Record<string, string>; body: any }[] = [];
    await page.route('**/api/v1/**', async (route) => {
      const path = apiPath(route);
      const method = route.request().method();
      if (await answerShell(route, path, contextFor(true, ['*']))) return;
      if (path === `/host/branches/${BRANCH_ID}/members/lookup`) {
        return json(route, { exists: true, user: { id: '11111111-1111-4111-8111-111111111111', fullName: 'Ali Raza', email: 'ali@example.test' }, subscriptions: [] });
      }
      if (path === '/payments' && method === 'POST') {
        posted.push({ headers: route.request().headers(), body: route.request().postDataJSON() });
        return json(route, { payment: { id: 'pay-1' }, invoice: null }, 201);
      }
      if (path === '/payments') return json(route, { payments: [], pagination: { total: 0, page: 1, totalPages: 1 } });
      return json(route, {});
    });

    await signIn(page);
    await page.goto('/gym/payments');
    await page.getByRole('button', { name: 'Record Payment' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('member@example.com').fill('ali@example.test');
    await dialog.getByLabel(/Amount/).fill('1,500.50');
    await dialog.getByRole('button', { name: 'Record Payment' }).click();

    await expect(dialog).toBeHidden();
    expect(posted).toHaveLength(1);
    expect(posted[0].headers['idempotency-key']).toBeTruthy();
    expect(posted[0].body).toMatchObject({ amount: 1500.5, branchId: BRANCH_ID });
  });

  test('a refund that answers 202 shows the approval notice and never "Refund issued"', async ({ page }) => {
    const refunds: { headers: Record<string, string>; body: any }[] = [];
    await page.route('**/api/v1/**', async (route) => {
      const path = apiPath(route);
      if (await answerShell(route, path, contextFor(false, ['payments.view', 'payments.refund']))) return;
      if (path === '/payments/pay-9/refund') {
        refunds.push({ headers: route.request().headers(), body: route.request().postDataJSON() });
        return json(route, { approvalRequestId: 'req-5', status: 'PENDING', summary: 'Refund payment pay-9: full — Moved away' }, 202);
      }
      if (path === '/payments') return json(route, { payments: [completed], pagination: { total: 1, page: 1, totalPages: 1 } });
      return json(route, {});
    });

    await signIn(page, 'MEMBER');
    await page.goto('/gym/payments');
    await page.getByTitle('Request refund').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/Reason/).fill('Moved away');
    await dialog.getByRole('button', { name: 'Send request' }).click();

    await expect(page.getByText('Submitted for approval')).toBeVisible();
    await expect(page.getByRole('link', { name: 'View your requests' })).toHaveAttribute('href', '/gym/approvals?tab=mine');
    await expect(page.getByText('Refund issued')).toHaveCount(0);
    expect(refunds).toHaveLength(1);
    expect(refunds[0].headers['idempotency-key']).toBeTruthy();
    expect(refunds[0].body).toEqual({ reason: 'Moved away' });
  });

  test('a refused refund shows the server’s message in the dialog', async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      const path = apiPath(route);
      if (await answerShell(route, path, contextFor(true, ['*']))) return;
      if (path === '/payments/pay-9/refund') {
        return fail(route, 422, { code: 'refund_exceeds_refundable', message: 'Refund amount (Rs 4000) exceeds remaining refundable balance (Rs 3000)' });
      }
      if (path === '/payments') return json(route, { payments: [completed], pagination: { total: 1, page: 1, totalPages: 1 } });
      return json(route, {});
    });

    await signIn(page);
    await page.goto('/gym/payments');
    await page.getByTitle('Refund').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/Reason/).fill('Test');
    await dialog.getByRole('button', { name: 'Refund' }).click();
    await expect(dialog.getByText(/exceeds remaining refundable balance/)).toBeVisible();
  });

  test('the invoice list names the branch for a team member', async ({ page }) => {
    const seen: string[] = [];
    await page.route('**/api/v1/**', async (route) => {
      const path = apiPath(route);
      if (await answerShell(route, path, contextFor(false, ['invoices.view']))) return;
      if (path === '/invoices') {
        seen.push(new URL(route.request().url()).searchParams.get('branchId') ?? '');
        return json(route, {
          invoices: [{ id: 'i1', userId: 'u1', invoiceNo: 'INV-UPTOWN-000042', invoiceType: 'MEMBERSHIP', subtotal: 3000, totalAmount: 3000, status: 'PAID', createdAt: '2026-10-01T10:00:00Z' }],
        }, 200, { pagination: { total: 1, page: 1, totalPages: 1 } });
      }
      return json(route, {});
    });

    await signIn(page, 'MEMBER');
    await page.goto('/gym/invoices');
    await expect(page.getByText('INV-UPTOWN-000042')).toBeVisible();
    expect(seen[0]).toBe(BRANCH_ID);
  });
});
