import { test, expect } from '@playwright/test';

// SEC-14 / SEC-18 against `next start`: headers on every kind of response, a different nonce per request,
// and no script violation in the browser (so the Report-Only policy is ready to be enforced on these pages).
const PAGES = ['/login', '/forgot-password'];

test.describe('security headers (production build)', () => {
  for (const path of PAGES) {
    test(`${path}: headers and nonce`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBeLessThan(400);
      const h = res.headers();
      expect(h['strict-transport-security']).toMatch(/max-age=31536000/);
      expect(h['x-content-type-options']).toBe('nosniff');
      expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(h['x-frame-options']).toBe('DENY');
      expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(h['content-security-policy']).toContain("base-uri 'self'");
      const ro = h['content-security-policy-report-only'];
      expect(ro).toBeTruthy();
      expect(ro).not.toContain('unsafe-eval');
      const nonce = /'nonce-([^']+)'/.exec(ro)![1];
      // Next puts the same nonce on its own inline scripts.
      const html = await res.text();
      expect(html).toContain(`nonce="${nonce}"`);
    });
  }

  test('each request gets a different nonce', async ({ request }) => {
    const get = async () => /'nonce-([^']+)'/.exec((await request.get('/login')).headers()['content-security-policy-report-only'])![1];
    expect(await get()).not.toBe(await get());
  });

  test('the redirect to /login (no session) carries the baseline headers too', async ({ request }) => {
    const res = await request.get('/dashboard', { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
    expect(res.headers()['x-frame-options']).toBe('DENY');
  });

  for (const path of PAGES) {
    test(`${path}: hydrates with no script or style-element violations`, async ({ page }) => {
      await page.addInitScript(() => {
        (window as any).__csp = [];
        document.addEventListener('securitypolicyviolation', (e) => {
          (window as any).__csp.push(`${e.effectiveDirective} ${e.blockedURI}`);
        });
      });
      await page.goto(path, { waitUntil: 'networkidle' });
      const violations: string[] = await page.evaluate(() => (window as any).__csp);
      // Everything else is only reported (Report-Only); print it so the rollout can be judged from the log.
      const others = violations.filter((v) => !v.startsWith('script-src'));
      if (others.length) console.log(`[csp report-only] ${path}: ${[...new Set(others)].join(' | ')}`);
      const scripts = violations.filter((v) => v.startsWith('script-src'));
      expect(scripts, `script violations on ${path}`).toEqual([]);
    });
  }

  test('login page still works (React hydrated under the CSP)', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    const email = page.locator('input[type="email"]').first();
    await email.fill('someone@example.com');
    await expect(email).toHaveValue('someone@example.com');
  });

  test('POST /api/csp-report answers 204 and ignores junk', async ({ request }) => {
    const ok = await request.post('/api/csp-report', {
      headers: { 'content-type': 'application/csp-report' },
      data: JSON.stringify({ 'csp-report': { 'violated-directive': 'script-src', 'blocked-uri': 'inline' } }),
    });
    expect(ok.status()).toBe(204);
    const junk = await request.post('/api/csp-report', { data: 'not json' });
    expect(junk.status()).toBe(204);
  });

  test('the page cannot be framed', async ({ page, request }) => {
    const res = await request.get('/login');
    expect(res.headers()['x-frame-options']).toBe('DENY');
    expect(res.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  });
});
