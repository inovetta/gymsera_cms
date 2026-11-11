import { test, expect, Page } from '@playwright/test';
import { answerShell, apiPath, BRANCH_ID, contextFor, json, signIn } from './support/api';

/**
 * ZKTeco Phase 5 (gymsera_be docs/ZKTECO_PUSH_DEVICE_SYNC.md §15 Phase 5): a T&A PUSH (attendance protocol)
 * device on the device page: type, push version, the counts the device reports, the note on what GymsEra
 * sends it, and history punches in the live feed.
 *
 * No backend is started: every /api/v1 call is answered here with the shapes the real endpoints return.
 * No real person, account or template.
 */

const DOOR = '55555555-5555-4555-8555-555555555555';

const device = (over: Record<string, unknown> = {}) => ({
  id: DOOR, deviceKey: 'K7QM3XRT', key: 'K7QM-3XRT', branchId: BRANCH_ID, branchName: 'Uptown', organizationId: 'org-1', name: 'Front Door',
  direction: 'in', enabled: true, linkMode: 'host', status: 'active', connection: 'online', serialNumber: 'SIMATT0001', registeredAt: '2026-11-10T08:00:00Z',
  lastSeenAt: '2026-11-10T10:00:00Z', lastSeenSecondsAgo: 2, lastIp: '203.0.113.7', scheme: 'https', encrypted: true, tokenState: 'absent', serialMismatch: null,
  model: 'SpeedFace-V5L', firmware: 'ZAM180-NF50VA-Ver3.4.9', pushVersion: 'Ver 2.0.33S-20220623', deviceType: 'att',
  capabilities: { face: true, fingerprint: true, palm: true },
  counts: { users: 356, faces: 15, fingerprints: 416, palms: 0, attendanceRecords: 14262, maxUsers: 10000 },
  attOptions: { userAuthorize: false, validityMode: 'none', userCommandForm: 'user' },
  poll: { delaySeconds: 3, ownDelay: null, gapSeconds: 3, lastPollAt: '2026-11-10T10:00:00Z' },
  importHold: false, importHoldSince: null, liveAt: null, createdAt: '2026-11-10T08:00:00Z', ...over,
});
const setup = { mode: 'host', serverAddress: 'k7qm3xrt.push.gymsera.com', port: 443, https: true, domainName: true, key: 'K7QM-3XRT' };

async function mockApi(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const path = apiPath(route);
    if (await answerShell(route, path, contextFor(true, ['*']))) return;
    const base = `/host/devices/${DOOR}`;
    if (path === base) return json(route, { device: device(), setup });
    if (path === `${base}/access-events`) {
      return json(route, {
        events: [
          { id: 2, deviceId: DOOR, deviceName: 'Front Door', deviceTime: '2026-11-10 10:00:00', utcTime: '2026-11-10T05:00:00Z', pin: '1001', memberId: 'm1', memberName: 'Ayesha Noor', result: 'granted', reason: null, eventCode: 0, verifyType: 15, attendanceNote: 'check_in', attendanceId: 'a1' },
          { id: 1, deviceId: DOOR, deviceName: 'Front Door', deviceTime: '2026-07-11 09:00:00', utcTime: '2026-07-11T04:00:00Z', pin: '512', memberId: null, memberName: null, result: 'granted', reason: null, eventCode: 0, verifyType: 1, attendanceNote: 'history', attendanceId: null },
        ],
        latestId: 2,
      });
    }
    for (const tab of ['members', 'errors', 'audits', 'commands']) {
      if (path === `${base}/${tab}`) return json(route, tab === 'members' ? { counts: { inSync: 0, pending: 0, failed: 0, removed: 0 }, members: [] } : tab === 'audits' ? { reports: [], activity: [] } : tab === 'errors' ? { errors: [] } : { commands: [] });
    }
    return json(route, {});
  });
}

test.describe('T&A PUSH device', () => {
  test('device page: type, push version, counts and the note', async ({ page }) => {
    await signIn(page);
    await mockApi(page);
    await page.goto(`/gym/devices/${DOOR}`);
    const facts = page.getByTestId('device-facts');
    await expect(facts).toContainText('T&A PUSH (attendance)');
    await expect(facts).toContainText('Ver 2.0.33S-20220623');
    await expect(facts).toContainText('356 of 10000');
    await expect(facts).toContainText('Attendance records');
    await expect(facts).toContainText('14262');
    const note = page.getByTestId('att-note');
    await expect(note).toContainText('This is a T&A PUSH (attendance) device');
    await expect(note).toContainText('No door permission (userauthorize) is sent');
  });

  test('live feed: a history punch is shown as not counted', async ({ page }) => {
    await signIn(page);
    await mockApi(page);
    await page.goto(`/gym/devices/${DOOR}`);
    await page.getByRole('tab', { name: 'Live feed' }).click();
    await expect(page.getByText('From the device history, before it joined GymsEra: not counted')).toBeVisible();
    await expect(page.getByText('Checked in')).toBeVisible();
  });
});
