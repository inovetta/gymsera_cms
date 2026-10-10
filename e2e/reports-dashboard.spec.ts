import { test, expect } from '@playwright/test';
import { BRANCH_ID, answerShell, apiPath, contextFor, json, signIn } from './support/api';

/**
 * Dashboard and reports (Prompt 3C, UX-18): revenue is hidden, not zero, without
 * dashboard.revenue.view; the branch report shows the server's totals.
 */
test.describe('Dashboard and reports', () => {
  test('no revenue permission: counts from the branch dashboard, no revenue card, no revenue request', async ({ page }) => {
    const revenueCalls: string[] = [];
    await page.route('**/api/v1/**', async (route) => {
      const path = apiPath(route);
      if (path === '/reports/dashboard' || path === '/reports/yearly') revenueCalls.push(path);
      if (await answerShell(route, path, contextFor(false, ['dashboard.view']))) return;
      if (path === `/host/branches/${BRANCH_ID}/dashboard`) {
        return json(route, { todaysCheckins: 7, activeMembers: 25, monthlyRevenue: null, netProfit: null });
      }
      return json(route, {});
    });

    await signIn(page, 'MEMBER');
    await page.goto('/dashboard');

    await expect(page.getByText('Active Members')).toBeVisible();
    await expect(page.getByText('Monthly Revenue')).toHaveCount(0);
    expect(revenueCalls).toHaveLength(0);
  });

  test('branch report shows the totals the server sent, formatted with paisa', async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      const path = apiPath(route);
      if (await answerShell(route, path, contextFor(false, ['dashboard.revenue.view']))) return;
      if (path === '/reports/yearly') return json(route, { year: 2026, data: [{ month: 'Jan', revenue: 1000 }] });
      if (path === `/reports/branch/${BRANCH_ID}`) {
        return json(route, {
          branch: { id: BRANCH_ID, name: 'Uptown', status: 'ACTIVE' },
          members: { active: 41, frozen: 2, pending: 1, expiredThisMonth: 3 },
          revenue: { allTime: 250000.5, thisMonth: 48000, pendingCount: 2, staffCollectedCount: 1 },
          attendance: { checkInsToday: 9, checkInsThisMonth: 210 },
          staff: { active: 4 },
          planDistribution: [],
          revenueByDay: [],
        });
      }
      return json(route, {});
    });

    await signIn(page, 'MEMBER');
    await page.goto('/gym/reports');

    await expect(page.getByText('250,000.50')).toBeVisible();
    await expect(page.getByText('48,000')).toBeVisible();
    await expect(page.getByTestId('monthly-org-only')).toBeVisible();
  });
});
