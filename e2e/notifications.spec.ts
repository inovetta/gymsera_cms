import { test, expect } from '@playwright/test';
import { answerShell, apiPath, contextFor, json, signIn } from './support/api';

/**
 * Notifications (Prompt 3C, UX-23): the bell shows the server's unread count, a click marks the
 * notification read and opens the CMS page that matches the server's mobile deep link.
 */
test.describe('Notifications', () => {
  test('bell: server unread count, mark read, mapped deep link', async ({ page }) => {
    const reads: string[] = [];
    let unread = 3;
    await page.route('**/api/v1/**', async (route) => {
      const path = apiPath(route);
      const method = route.request().method();
      if (path === '/notifications/unread-count') return json(route, { unreadCount: unread });
      if (path === '/notifications' && method === 'GET') {
        return json(route, {
          notifications: [
            { id: 'n1', userId: 'user-1', role: 'host', type: 'SUBSCRIPTION', title: 'New subscription', message: 'Ali Raza joined Monthly', priority: 'normal', deepLink: '/host/subscriptions', isRead: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          ],
        });
      }
      if (path === '/notifications/n1/read' && method === 'PATCH') {
        reads.push('n1');
        unread = 2;
        return json(route, { success: true });
      }
      if (await answerShell(route, path, contextFor(true, ['*']))) return;
      if (path.startsWith('/gym/') || path.startsWith('/subscriptions')) return json(route, { subscriptions: [] });
      return json(route, {});
    });

    await signIn(page);
    await page.goto('/dashboard');

    await expect(page.getByTestId('unread-badge').first()).toHaveText('3');
    await page.getByRole('button', { name: /Notifications/ }).first().click();
    await page.getByText('New subscription').click();

    await expect.poll(() => reads).toEqual(['n1']);
    // The dev server compiles the target page on first visit.
    await expect(page).toHaveURL(/\/gym\/subscriptions/, { timeout: 30000 });
  });
});
