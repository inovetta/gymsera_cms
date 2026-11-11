import { test, expect, Page } from '@playwright/test';
import { answerShell, apiPath, BRANCH_ID, contextFor, json, signIn } from './support/api';

/**
 * ZKTeco Phase 4 (gymsera_be docs/ZKTECO_PUSH_DEVICE_SYNC.md §15 Phase 4): leaving GymBioSync. The device
 * page in import hold, the import wizard (CSV, a conflict resolved with "Remove", apply), the cut-over
 * checklist (go live), the Commands tab, Move, and deleting one template on the member card. What a front
 * desk cannot do.
 *
 * No backend is started: every /api/v1 call is answered here with the shapes the real endpoints return.
 * No real person, account or template.
 */

const DOOR = '44444444-4444-4444-8444-444444444444';
const MEMBER_ID = '33333333-3333-4333-8333-333333333333';
const IMPORT_ID = '00MWAZM8N324O2ECQTJHVM733P';

const device = (over: Record<string, unknown> = {}) => ({
  id: DOOR, deviceKey: 'K7QM3XRT', key: 'K7QM-3XRT', branchId: BRANCH_ID, branchName: 'Uptown', organizationId: 'org-1', name: 'GBS Door',
  direction: 'in', enabled: true, linkMode: 'host', status: 'active', connection: 'online', serialNumber: 'SIM0001', registeredAt: '2026-11-10T08:00:00Z',
  lastSeenAt: '2026-11-10T10:00:00Z', lastSeenSecondsAgo: 2, lastIp: '203.0.113.7', scheme: 'https', encrypted: true, tokenState: 'match', serialMismatch: null,
  model: 'SpeedFace-V5L', firmware: 'ZAM180', pushVersion: '3.1.2', deviceType: 'acc', capabilities: { face: true, fingerprint: true, palm: false },
  counts: { users: 4, faces: 3, fingerprints: 1, maxUsers: 10000 }, importHold: true, importHoldSince: '2026-11-10T08:00:00Z', liveAt: null,
  createdAt: '2026-11-10T08:00:00Z', ...over,
});
const setup = { mode: 'host', serverAddress: 'k7qm3xrt.push.gymsera.com', port: 443, https: true, domainName: true, key: 'K7QM-3XRT' };

type Calls = { method: string; path: string; body: unknown }[];

async function mockApi(page: Page, permissions: string[], isOwner = true, { held = true } = {}): Promise<Calls> {
  const calls: Calls = [];
  let status = 'ready';
  let remove1001 = false;
  let live = false;
  const counts = () => ({ users: 4, templates: 4, templatesTooLarge: 0, admins: 1, matched: 2, unmatched: 1, conflicts: remove1001 ? 0 : 1, removeAtGoLive: remove1001 ? 1 : 0 });
  const imp = () => ({
    id: IMPORT_ID, deviceId: DOOR, status, startedAt: '2026-11-10T09:00:00Z', readyAt: '2026-11-10T09:01:00Z', appliedAt: status === 'applied' ? '2026-11-10T09:05:00Z' : null,
    liveAt: null, finishedAt: null, truncated: false, types: [1, 9], failedQueries: [], failedReason: null, result: null, counts: counts(),
  });
  const users = () => [
    { pin: '501', name: 'Sara GBS', cardNo: null, privilege: 0, isAdmin: false, memberId: MEMBER_ID, memberName: 'Ayesha Noor', memberPin: null, matchSource: 'csv', removeAtGoLive: false, conflict: null, blocking: false, templates: { 9: 1, 1: 1 }, appliedAt: null },
    { pin: '1001', name: 'Ali GBS', cardNo: null, privilege: 0, isAdmin: false, memberId: 'm-ali', memberName: 'Bilal Shah', memberPin: null, matchSource: 'manual', removeAtGoLive: remove1001, conflict: 'pin_taken', blocking: !remove1001, templates: { 9: 1 }, appliedAt: null },
    { pin: '504', name: 'Unknown GBS', cardNo: null, privilege: 0, isAdmin: false, memberId: null, memberName: null, memberPin: null, matchSource: null, removeAtGoLive: false, conflict: null, blocking: false, templates: { 9: 1 }, appliedAt: null },
    { pin: '9', name: 'Installer', cardNo: null, privilege: 14, isAdmin: true, memberId: null, memberName: null, memberPin: null, matchSource: null, removeAtGoLive: false, conflict: null, blocking: false, templates: {}, appliedAt: null },
  ];
  const steps = () => [
    { key: 'connected', status: 'done' }, { key: 'imported', status: 'done' }, { key: 'matched', status: 'warning', count: 1 },
    { key: 'conflicts', status: remove1001 ? 'done' : 'blocked', count: remove1001 ? 0 : 1 }, { key: 'applied', status: status === 'applied' || live ? 'done' : 'todo' },
    { key: 'consent', status: 'done', count: 0 }, { key: 'capacity', status: 'done', percent: 0 }, { key: 'live', status: live ? 'done' : 'todo' },
    { key: 'verified', status: live ? 'done' : 'todo', count: live ? 2 : 0, of: live ? 2 : 0 }, { key: 'gymbiosync_stopped', status: 'todo', at: null },
  ];
  const cutover = () => ({
    deviceId: DOOR, importHold: !live, importHoldSince: live ? null : '2026-11-10T08:00:00Z', liveAt: live ? '2026-11-10T10:00:00Z' : null, gbsStoppedAt: null, import: imp(),
    counts: { deviceUsers: 4, imported: 4, matched: 2, unmatched: 1, admins: 1, conflicts: remove1001 ? 0 : 1, templates: 4, consentNeeded: 0, verified: live ? 2 : 0 },
    unmatchedPins: ['504'], steps: steps(), canGoLive: status === 'applied' && remove1001 && !live,
  });
  await page.route('**/api/v1/**', async (route) => {
    const path = apiPath(route);
    const method = route.request().method();
    let body: unknown = null;
    try { body = route.request().postDataJSON(); } catch { body = null; }
    calls.push({ method, path, body });
    if (await answerShell(route, path, contextFor(isOwner, permissions))) return;

    const base = `/host/devices/${DOOR}`;
    if (path === base && method === 'GET') return json(route, { device: device({ importHold: held && !live }), setup });
    if (path === `${base}/imports` && method === 'GET') return json(route, { imports: [imp()] });
    if (path === `${base}/imports/${IMPORT_ID}/users`) return json(route, { users: users(), total: 4, limit: 50, offset: 0 });
    if (path === `${base}/imports/${IMPORT_ID}/preview`) {
      return json(route, { preview: {
        willStore: { identities: 1, templates: 3, templatesPending: 0, alreadyEnrolled: 0, cards: 0 }, consentNeeded: [],
        skipped: { unmatched: 1, admins: 1, alreadyEnrolled: 0, templatesNotImported: 1 },
        atGoLive: { removePins: remove1001 ? ['1001'] : [], notEntitled: 0, sendUnderOwnPin: [] },
        blocking: remove1001 ? [] : [{ pin: '1001', conflict: 'pin_taken', memberId: 'm-ali' }],
        capacity: { users: 4, maxUsers: 10000, percent: 0 },
      } });
    }
    if (path === `${base}/imports/${IMPORT_ID}/mapping` && method === 'POST') return json(route, { matched: 1, errors: [{ line: 3, pin: '777', reason: 'pin_not_on_device' }] });
    if (path === `${base}/imports/${IMPORT_ID}/users/1001` && method === 'PUT') {
      remove1001 = Boolean((body as { removeAtGoLive?: boolean })?.removeAtGoLive);
      return json(route, { user: users()[1] });
    }
    if (path === `${base}/imports/${IMPORT_ID}/apply` && method === 'POST') { status = 'applied'; return json(route, { import: imp(), alreadyApplied: false }); }
    if (path === `${base}/cutover` && method === 'GET') return json(route, { cutover: cutover() });
    if (path === `${base}/cutover/go-live` && method === 'POST') { live = true; return json(route, { cutover: cutover() }); }
    if (path === `${base}/commands`) {
      return json(route, { commands: [
        { id: 9, kind: 'query_bio', status: 'acked', returnCode: 0, memberId: null, memberName: null, attempts: 1, priority: 0, pushRequestId: null, createdAt: '2026-11-10T09:00:00Z', sentAt: '2026-11-10T09:00:01Z', ackedAt: '2026-11-10T09:00:02Z' },
        { id: 8, kind: 'bio_upsert', status: 'failed', returnCode: -30, memberId: MEMBER_ID, memberName: 'Ayesha Noor', attempts: 1, priority: 5, pushRequestId: null, createdAt: '2026-11-10T08:59:00Z', sentAt: null, ackedAt: null },
      ] });
    }
    if (path === `${base}/move` && method === 'POST') return json(route, { device: device({ importHold: false }), setup, sync: { queued: 2 } });
    for (const tab of ['members', 'access-events', 'errors', 'audits']) {
      if (path === `${base}/${tab}`) return json(route, tab === 'members' ? { counts: { inSync: 0, pending: 0, failed: 0, removed: 0 }, members: [] } : tab === 'audits' ? { reports: [], activity: [] } : tab === 'errors' ? { errors: [] } : { events: [], latestId: null });
    }
    return json(route, {});
  });
  return calls;
}

const OWNER = ['*'];
const DESK = ['devices.view', 'devices.push', 'biometrics.enroll', 'members.view'];

test.describe('Leaving GymBioSync', () => {
  test('device page in import hold links to the import and the cut-over; no Sync now', async ({ page }) => {
    await signIn(page);
    await mockApi(page, OWNER);
    await page.goto(`/gym/devices/${DOOR}`);
    const banner = page.getByTestId('import-hold');
    await expect(banner).toContainText('Import in progress');
    await expect(banner.getByRole('link', { name: 'Import' })).toHaveAttribute('href', `/gym/devices/${DOOR}/import`);
    await expect(page.getByRole('button', { name: 'Sync now' })).toHaveCount(0);
  });

  test('import: CSV errors in words, a conflict resolved with Remove, then Apply', async ({ page }) => {
    await signIn(page);
    const calls = await mockApi(page, OWNER);
    await page.goto(`/gym/devices/${DOOR}/import`);
    await expect(page.getByText('Nothing on the device changes during the import')).toBeVisible();
    const rows = page.getByTestId('import-users').getByRole('row');
    await expect(rows.nth(2)).toContainText('This PIN belongs to another GymsEra member');
    await expect(rows.nth(4)).toContainText('Device administrator: left as it is');

    await page.getByLabel('CSV file').setInputFiles({ name: 'map.csv', mimeType: 'text/csv', buffer: Buffer.from('pin,email\n501,ayesha@example.test\n777,x@example.test') });
    await expect(page.getByTestId('csv-errors')).toContainText('Line 3 (PIN 777): No user with this PIN on the device');
    expect(calls.find((c) => c.path.endsWith('/mapping'))?.body).toEqual({ csv: 'pin,email\n501,ayesha@example.test\n777,x@example.test' });

    const preview = page.getByTestId('import-preview');
    await expect(preview.getByRole('button', { name: 'Apply' })).toBeDisabled();
    const remove1001 = page.getByRole('checkbox', { name: 'Remove device user 1001 at go-live' });
    await remove1001.click(); // checked once the server has saved it and the list reloads
    await expect(remove1001).toBeChecked();
    await expect(preview).toContainText('Removed from the device at go-live: PIN 1001');
    await preview.getByRole('button', { name: 'Apply' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByRole('link', { name: 'Continue to the cut-over' })).toBeVisible();
    expect(calls.some((c) => c.method === 'POST' && c.path.endsWith('/apply'))).toBe(true);
  });

  test('cut-over: checklist, go live, verified', async ({ page }) => {
    await signIn(page);
    const calls = await mockApi(page, OWNER);
    // Resolve and apply first (as the import page would).
    await page.goto(`/gym/devices/${DOOR}/import`);
    const remove1001 = page.getByRole('checkbox', { name: 'Remove device user 1001 at go-live' });
    await remove1001.click(); // checked once the server has saved it and the list reloads
    await expect(remove1001).toBeChecked();
    await page.getByTestId('import-preview').getByRole('button', { name: 'Apply' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Apply' }).click();
    await page.getByRole('link', { name: 'Continue to the cut-over' }).click();
    await expect(page.getByTestId('cutover-counts')).toContainText('Imported');
    await expect(page.getByTestId('unmatched-pins')).toContainText('504');
    await page.getByRole('button', { name: 'Go live' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Go live' }).click();
    await expect(page.getByTestId('cutover-steps')).toContainText('2 of 2 confirmed by the device');
    expect(calls.find((c) => c.path.endsWith('/cutover/go-live'))?.body).toEqual({});
  });

  test('front desk: reads the import and the checklist; no Upload, Apply or Go live', async ({ page }) => {
    await signIn(page, 'MEMBER');
    await mockApi(page, DESK, false);
    await page.goto(`/gym/devices/${DOOR}/import`);
    await expect(page.getByTestId('import-users')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload CSV' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Apply' })).toHaveCount(0);
    await page.goto(`/gym/devices/${DOOR}/cutover`);
    await expect(page.getByTestId('cutover-steps')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go live' })).toHaveCount(0);
  });
});

test.describe('Device page (Phase 4)', () => {
  test('Commands tab: kinds and answers in words', async ({ page }) => {
    await signIn(page);
    await mockApi(page, OWNER, true, { held: false });
    await page.goto(`/gym/devices/${DOOR}`);
    await page.getByRole('tab', { name: 'Commands' }).click();
    const panel = page.getByTestId('device-commands');
    await expect(panel).toContainText('Read faces or fingerprints');
    await expect(panel).toContainText('Failed (code -30)');
  });
});
