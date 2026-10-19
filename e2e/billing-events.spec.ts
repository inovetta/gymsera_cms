import { test, expect } from '@playwright/test';
import { apiPath, fail, json, signIn } from './support/api';

/**
 * Billing events (OBS-05): a platform admin sees the webhook inbox, filters it, and sees what needs
 * attention. No raw provider payload on the page. A non-admin gets a clear "platform administrators" notice.
 */
const TENANT = '11111111-1111-4111-8111-111111111111';

const event = (over: Record<string, unknown> = {}) => ({
  id: `evt-${Math.random().toString(36).slice(2)}`,
  provider: 'APPLE',
  providerEventId: 'uuid-renew-1',
  eventType: 'DID_RENEW',
  status: 'PROCESSED',
  attempts: 1,
  lastError: null,
  tenantId: TENANT,
  tenantName: 'Alpha Fitness',
  receivedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  processedAt: new Date().toISOString(),
  stuck: false,
  ...over,
});

test.describe('Billing events', () => {
  test('lists events, flags the stuck one, filters by status, and shows no payload', async ({ page }) => {
    const requests: Array<Record<string, string>> = [];
    await page.route('**/api/v1/**', async (route) => {
      const path = apiPath(route);
      if (path === '/admin/billing-events') {
        const params = Object.fromEntries(new URL(route.request().url()).searchParams);
        requests.push(params);
        const failedOnly = params.status === 'FAILED';
        const rows = failedOnly
          ? [event({ providerEventId: 'evt_stripe_9', provider: 'STRIPE', status: 'FAILED', attempts: 6, stuck: true, lastError: 'Stripe API timeout' })]
          : [
              event(),
              event({ providerEventId: 'evt_stripe_9', provider: 'STRIPE', status: 'FAILED', attempts: 6, stuck: true, lastError: 'Stripe API timeout', rawPayload: 'SECRET-RECEIPT-DATA' }),
            ];
        return json(route, rows, 200, { pagination: { total: rows.length, page: 1, limit: 20, totalPages: 1 } });
      }
      if (path === '/admin/tenants') return json(route, { tenants: [{ id: TENANT, businessName: 'Alpha Fitness' }] }, 200, { pagination: { total: 1, page: 1, limit: 100, totalPages: 1 } });
      if (path === '/notifications/unread-count') return json(route, { unreadCount: 0 });
      if (path === '/notifications') return json(route, { notifications: [] });
      return json(route, {});
    });

    await signIn(page, 'PLATFORM_ADMIN');
    await page.goto('/admin/billing-events');

    await expect(page.getByText('uuid-renew-1')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Alpha Fitness' }).first()).toBeVisible();
    // the legend sentence also says it; the badge is the one inside the table
    await expect(page.getByRole('table').getByText('Needs attention', { exact: true })).toHaveCount(1);
    await expect(page.getByText('SECRET-RECEIPT-DATA')).toHaveCount(0);

    await page.getByRole('button', { name: 'Failed', exact: true }).click();
    await expect(page.getByText('uuid-renew-1')).toHaveCount(0);
    await expect(page.getByText('Stripe API timeout')).toBeVisible();
    expect(requests[requests.length - 1]).toMatchObject({ status: 'FAILED', page: '1' });
  });

  test('a user who is not a platform administrator gets a clear notice, not an error loop', async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      const path = apiPath(route);
      if (path === '/admin/billing-events') return fail(route, 403, { error: { code: 'forbidden', message: 'Forbidden' } });
      if (path === '/admin/tenants') return fail(route, 403, { error: { code: 'forbidden', message: 'Forbidden' } });
      if (path === '/notifications/unread-count') return json(route, { unreadCount: 0 });
      if (path === '/notifications') return json(route, { notifications: [] });
      return json(route, {});
    });

    await signIn(page, 'PLATFORM_ADMIN');
    await page.goto('/admin/billing-events');

    await expect(page.getByTestId('no-access')).toContainText('platform administrators');
    await expect(page.getByRole('button', { name: /retry/i })).toHaveCount(0);
  });
});
