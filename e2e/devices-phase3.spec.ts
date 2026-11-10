import { test, expect, Page } from '@playwright/test';
import { answerShell, apiPath, BRANCH_ID, contextFor, json, signIn } from './support/api';

/**
 * ZKTeco Phase 3 (gymsera_be docs/ZKTECO_PUSH_DEVICE_SYNC.md §9, §10): the member's Devices tab
 * (Push now with the 15-second answer, offline at once, Remove from device now, consent), the device
 * page tabs (members, live feed with a D-5 scan, errors, audit), Sync now, remove with a typed-name
 * wipe, Unlinked users (link, dismiss), Device settings (capture photos, alerts), and what a front
 * desk cannot do.
 *
 * No backend is started: every /api/v1 call is answered here with the shapes the real endpoints
 * return. No real person, account or template.
 */

const MEMBER_ID = '33333333-3333-4333-8333-333333333333';
const DOOR = '44444444-4444-4444-8444-444444444444';
const GATE = '55555555-5555-4555-8555-555555555555';
const OLD = '66666666-6666-4666-8666-666666666666';

const pushDevice = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  deviceId: id, name, branchId: BRANCH_ID, branchName: 'Uptown', connection: 'online', lastSeenSecondsAgo: 3, offline: false, ...over,
});

const memberStatus = {
  memberId: MEMBER_ID,
  pin: '1001',
  consent: { consented: false, consentedAt: null, method: null, templates: 0, waitingForConsent: 0 },
  biometrics: [],
  devices: [
    { ...pushDevice(DOOR, 'Front door'), direction: 'in', entitled: true, reason: null, onDevice: true, state: 'in_sync', pending: false, lastSyncedAt: '2026-11-10T09:00:00Z', lastReturnCode: null, failedReason: null, lastErrorAt: null },
    { ...pushDevice(GATE, 'Back gate', { connection: 'offline', lastSeenSecondsAgo: 840, offline: true }), direction: 'in', entitled: true, reason: null, onDevice: true, state: 'in_sync', pending: false, lastSyncedAt: null, lastReturnCode: null, failedReason: null, lastErrorAt: null },
    { ...pushDevice(OLD, 'Old branch door'), direction: 'in', entitled: false, reason: 'no_valid_package', onDevice: true, state: 'in_sync', pending: false, lastSyncedAt: null, lastReturnCode: null, failedReason: null, lastErrorAt: null },
  ],
};

const device = (over: Record<string, unknown> = {}) => ({
  id: DOOR, deviceKey: 'K7QM3XRT', key: 'K7QM-3XRT', branchId: BRANCH_ID, branchName: 'Uptown', organizationId: 'org-1', name: 'Front door',
  direction: 'in', enabled: true, linkMode: 'host', status: 'active', connection: 'online', serialNumber: 'SIM0001', registeredAt: '2026-11-10T08:00:00Z',
  lastSeenAt: '2026-11-10T10:00:00Z', lastSeenSecondsAgo: 2, lastIp: '203.0.113.7', scheme: 'https', encrypted: true, tokenState: 'match', serialMismatch: null,
  model: 'SpeedFace-V5L', firmware: 'ZAM180', pushVersion: '3.1.2', deviceType: 'acc', capabilities: { face: true, fingerprint: true, palm: false },
  counts: { users: 2, faces: 2, fingerprints: 0, maxUsers: 10000 }, createdAt: '2026-11-10T08:00:00Z', ...over,
});
const setup = { mode: 'host', serverAddress: 'k7qm3xrt.push.gymsera.com', port: 443, https: true, domainName: true, key: 'K7QM-3XRT' };

type Calls = { method: string; path: string; body: unknown }[];

/** Answers every call; pushes are answered "queued" on the first poll and "done" after that. */
async function mockApi(page: Page, permissions: string[], isOwner = true): Promise<Calls> {
  const calls: Calls = [];
  const polls: Record<string, number> = {};
  let settings = { branchId: BRANCH_ID, capturePhotos: true, alertsEnabled: true, photoRetentionDays: 30 };
  await page.route('**/api/v1/**', async (route) => {
    const path = apiPath(route);
    const method = route.request().method();
    let body: unknown = null;
    try { body = route.request().postDataJSON(); } catch { body = null; }
    calls.push({ method, path, body });
    if (await answerShell(route, path, contextFor(isOwner, permissions))) return;

    // Member page
    if (path === `/users/${MEMBER_ID}`) return json(route, { user: { id: MEMBER_ID, fullName: 'Ayesha Noor', email: 'ayesha@example.test', role: 'MEMBER', status: 'ACTIVE' } });
    if (path === '/subscriptions/staff') return json(route, { subscriptions: [] });
    if (path === '/attendance') return json(route, { logs: [] });
    if (path === '/payments') return json(route, { payments: [] });
    if (path === `/host/members/${MEMBER_ID}/device-status`) return json(route, memberStatus);
    if (path === `/host/members/${MEMBER_ID}/device-push` && method === 'POST') {
      return json(route, { requestId: 'REQPUSH0000000000000000001', kind: 'member', reused: false, createdAt: '2026-11-10T10:00:00Z', deadlineAt: '2026-11-10T10:00:15Z', devices: [] }, 202);
    }
    if (path === `/host/members/${MEMBER_ID}/device-remove` && method === 'POST') {
      return json(route, { requestId: 'REQREMOVE00000000000000001', kind: 'remove', reused: false, createdAt: '2026-11-10T10:00:00Z', deadlineAt: '2026-11-10T10:00:15Z', devices: [] }, 202);
    }
    if (path === `/host/devices/members/${MEMBER_ID}/biometric-consent` && method === 'POST') {
      memberStatus.consent = { consented: true, consentedAt: '2026-11-10T10:00:00Z', method: 'in_person', templates: 0, waitingForConsent: 0 };
      return json(route, { consent: memberStatus.consent });
    }
    const pushMatch = /^\/host\/device-push-requests\/(\w+)$/.exec(path);
    if (pushMatch) {
      const id = pushMatch[1];
      polls[id] = (polls[id] ?? 0) + 1;
      const first = polls[id] === 1;
      const kind = id.startsWith('REQREMOVE') ? 'remove' : id.startsWith('REQSYNC') ? 'device' : 'member';
      const devices = kind === 'member'
        ? [
          { ...pushDevice(DOOR, 'Front door'), state: first ? 'queued' : 'applied', returnCode: null, reason: null, onDevice: true },
          { ...pushDevice(GATE, 'Back gate', { connection: 'offline', lastSeenSecondsAgo: 840, offline: true }), state: 'offline', returnCode: null, reason: null, onDevice: true },
        ]
        : kind === 'remove'
          ? [{ ...pushDevice(OLD, 'Old branch door'), state: first ? 'delivered' : 'applied', returnCode: null, reason: null, onDevice: false }]
          : [{ ...pushDevice(DOOR, 'Front door'), state: first ? 'delivered' : 'applied', returnCode: null, reason: null, onDevice: null, progress: { total: 6, done: first ? 2 : 6, failed: 0 } }];
      return json(route, {
        requestId: id, kind, memberId: kind === 'device' ? null : MEMBER_ID, branchId: null, status: first ? 'running' : 'done',
        createdAt: '2026-11-10T10:00:00Z', deadlineAt: '2026-11-10T10:00:15Z', secondsLeft: first ? 12 : 9, devices,
      });
    }

    // Devices
    if (path === '/host/devices' && method === 'GET') return json(route, { devices: [device()] });
    if (path === `/host/devices/${DOOR}` && method === 'GET') return json(route, { device: device(), setup });
    if (path === `/host/devices/${DOOR}` && method === 'DELETE') {
      return json(route, { id: DOOR, status: 'wiping', wipe: true });
    }
    if (path === `/host/devices/${DOOR}/sync` && method === 'POST') {
      return (body as { mode?: string })?.mode === 'audit'
        ? json(route, { auditId: 7 }, 202)
        : json(route, { requestId: 'REQSYNC0000000000000000001', kind: 'device', reused: false, createdAt: '2026-11-10T10:00:00Z', deadlineAt: '2026-11-10T10:00:15Z', devices: [] }, 202);
    }
    if (path === `/host/devices/${DOOR}/members`) {
      return json(route, {
        counts: { inSync: 1, pending: 0, failed: 1, removed: 0 },
        members: [
          { memberId: MEMBER_ID, name: 'Ayesha Noor', pin: '1001', shouldBeOnDevice: true, state: 'in_sync', lastReturnCode: null, failedReason: null, lastErrorAt: null, updatedAt: '2026-11-10T09:00:00Z' },
          { memberId: 'm2', name: 'Bilal Shah', pin: '1002', shouldBeOnDevice: true, state: 'failed', lastReturnCode: -18, failedReason: 'device_storage_full', lastErrorAt: '2026-11-10T09:00:00Z', updatedAt: '2026-11-10T09:00:00Z' },
        ],
      });
    }
    if (path === `/host/devices/${DOOR}/access-events` || path === `/host/branches/${BRANCH_ID}/access-events`) {
      return json(route, {
        latestId: 2,
        events: [
          { id: 2, deviceId: DOOR, deviceName: 'Front door', branchId: BRANCH_ID, time: '2026-11-10T10:00:00Z', localTime: '2026-11-10 15:00:00', pin: '1001', memberId: MEMBER_ID, memberName: 'Ayesha Noor', result: 'granted', reason: null, attendanceNote: 'member_checkin_grace_expired', checkedIn: false, photoId: null },
          { id: 1, deviceId: DOOR, deviceName: 'Front door', branchId: BRANCH_ID, time: '2026-11-10T09:59:00Z', localTime: '2026-11-10 14:59:00', pin: '1002', memberId: 'm2', memberName: 'Bilal Shah', result: 'denied', reason: 'expired', attendanceNote: null, checkedIn: false, photoId: null },
        ],
      });
    }
    if (path === `/host/devices/${DOOR}/errors`) return json(route, { errors: [{ id: 1, source: 'server', kind: 'device_storage_full', code: -18, message: null, occurredAt: '2026-11-10T09:00:00Z' }] });
    if (path === `/host/devices/${DOOR}/audits`) {
      return json(route, {
        reports: [{ id: 7, status: 'compared', deviceUserCount: 2, desiredCount: 2, extraCount: 1, missingCount: 0, unlinkedCount: 1, startedAt: '2026-11-10T02:10:00Z', finishedAt: '2026-11-10T02:12:00Z' }],
        activity: [{ action: 'devices.push_result', actorName: 'Hira Khan', actorUserId: 'user-1', at: '2026-11-10T09:30:00Z', result: 'done' }],
      });
    }
    if (path === '/host/devices/unlinked-users') {
      return json(route, { users: [{ deviceId: DOOR, deviceName: 'Front door', branchId: BRANCH_ID, pin: '7', name: 'Old Seven', cardNo: null, source: 'upload', firstSeenAt: '2026-11-09T09:00:00Z', lastSeenAt: '2026-11-10T09:00:00Z', hits: 2 }] });
    }
    if (path === '/gyms/members') return json(route, { members: [{ id: MEMBER_ID, fullName: 'Ayesha Noor', email: 'ayesha@example.test' }] });
    if (/^\/host\/devices\/[\w-]+\/unlinked-users\/7\/(link|dismiss)$/.test(path)) return json(route, { pin: '7', memberId: MEMBER_ID });
    if (path === `/host/devices/branch-settings/${BRANCH_ID}` && method === 'GET') return json(route, { settings });
    if (path === `/host/devices/branch-settings/${BRANCH_ID}` && method === 'PUT') {
      const before = settings.capturePhotos;
      settings = { ...settings, ...(body as object) };
      return json(route, { settings, photosDeleted: before && !settings.capturePhotos ? 4 : 0 });
    }
    return json(route, {});
  });
  return calls;
}

const OWNER_PERMS = ['*'];
const DESK_PERMS = ['devices.view', 'devices.push', 'biometrics.enroll', 'members.view'];

test.describe('Member › Devices tab (§9)', () => {
  test('Push now: progress queued → done; an offline device says so at once', async ({ page }) => {
    await signIn(page);
    const calls = await mockApi(page, OWNER_PERMS);
    await page.goto(`/gym/members/${MEMBER_ID}`);
    await page.getByRole('tab', { name: 'Devices' }).click();
    const panel = page.getByTestId('member-devices');
    await expect(panel.getByText('Device PIN')).toBeVisible();
    await expect(page.getByTestId(`member-device-${OLD}`)).toContainText('Not entitled: No active package that covers this branch');

    await page.getByTestId(`member-device-${DOOR}`).getByRole('button', { name: 'Push now' }).click();
    const progress = page.getByTestId('push-progress');
    await expect(progress).toBeVisible();
    await expect(progress).toContainText('Device offline, last seen 14 min ago. It will update when it reconnects.');
    await expect(progress).toContainText('Done');
    await expect(progress).toContainText('Finished');
    const push = calls.find((c) => c.path === `/host/members/${MEMBER_ID}/device-push`);
    expect(push?.body).toEqual({ deviceIds: [DOOR] });
  });

  test('Remove from device now for a device where the member is not entitled', async ({ page }) => {
    await signIn(page);
    const calls = await mockApi(page, OWNER_PERMS);
    await page.goto(`/gym/members/${MEMBER_ID}`);
    await page.getByRole('tab', { name: 'Devices' }).click();
    await page.getByTestId(`member-device-${OLD}`).getByRole('button', { name: 'Remove from device now' }).click();
    await expect(page.getByTestId('push-progress')).toContainText('Removed');
    expect(calls.find((c) => c.path === `/host/members/${MEMBER_ID}/device-remove`)?.body).toEqual({ deviceIds: [OLD] });
  });

  test('Record consent in person, then the enrol button appears', async ({ page }) => {
    await signIn(page);
    await mockApi(page, OWNER_PERMS);
    await page.goto(`/gym/members/${MEMBER_ID}`);
    await page.getByRole('tab', { name: 'Devices' }).click();
    await expect(page.getByTestId('consent-state')).toContainText('No consent recorded.');
    await expect(page.getByRole('button', { name: 'Enrol on device' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Record consent' }).click();
    await page.getByRole('button', { name: 'The member agreed' }).click();
    await expect(page.getByTestId('consent-state')).toContainText('Consent given');
    await expect(page.getByRole('button', { name: 'Enrol on device' }).first()).toBeVisible();
  });
});

test.describe('Device page (§10.3)', () => {
  test('tabs: members on device, live feed with a D-5 scan, errors, audit', async ({ page }) => {
    await signIn(page);
    await mockApi(page, OWNER_PERMS);
    await page.goto(`/gym/devices/${DOOR}`);
    await page.getByRole('tab', { name: 'Members on device' }).click();
    await expect(page.getByTestId('device-members')).toContainText('Failed: Device storage is full');
    await page.getByRole('tab', { name: 'Live feed' }).click();
    const feed = page.getByTestId('live-feed');
    await expect(feed).toContainText('Let in, not counted: branch locked (GymsEra plan lapsed)');
    await expect(feed).toContainText('Refused: package ended');
    await page.getByRole('tab', { name: 'Errors' }).click();
    await expect(page.getByTestId('device-errors')).toContainText('Device storage full');
    await page.getByRole('tab', { name: 'Audit' }).click();
    await expect(page.getByTestId('device-audit')).toContainText('1 removed, 0 sent again, 1 unlinked');
    await expect(page.getByTestId('device-audit')).toContainText('Push finished (finished)');
  });

  test('Sync now shows progress per device; Run full audit is asked', async ({ page }) => {
    await signIn(page);
    const calls = await mockApi(page, OWNER_PERMS);
    await page.goto(`/gym/devices/${DOOR}`);
    await page.getByRole('button', { name: 'Sync now' }).click();
    await expect(page.getByTestId('push-progress')).toContainText('6 of 6 done');
    await page.getByRole('button', { name: 'Run full audit' }).click();
    await expect(page.getByText('Full audit asked. The report appears in the Audit tab in 1 to 3 minutes.', { exact: true })).toBeVisible();
    expect(calls.filter((c) => c.path === `/host/devices/${DOOR}/sync`).map((c) => c.body)).toEqual([{ mode: 'quick' }, { mode: 'audit' }]);
  });

  test('Remove with wipe needs the device name typed', async ({ page }) => {
    await signIn(page);
    const calls = await mockApi(page, OWNER_PERMS);
    await page.goto(`/gym/devices/${DOOR}`);
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await page.getByLabel(/Also delete every user/).check();
    const go = page.getByRole('button', { name: 'Wipe and remove' });
    await expect(go).toBeDisabled();
    await page.getByLabel(/Type the device name to confirm/).fill('front door');
    await expect(go).toBeEnabled();
    await go.click();
    await expect(page.getByText('The device deletes its GymsEra users the next time it connects, then it is removed.', { exact: true })).toBeVisible();
    expect(calls.find((c) => c.method === 'DELETE')?.body).toEqual({ wipeDevice: true, confirmName: 'front door' });
  });

  test('front desk: Sync now, but no full audit and no Manage card', async ({ page }) => {
    await signIn(page);
    await mockApi(page, DESK_PERMS, false);
    await page.goto(`/gym/devices/${DOOR}`);
    await expect(page.getByRole('button', { name: 'Sync now' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run full audit' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
  });
});

test.describe('Unlinked users and Device settings', () => {
  test('link a device user to a member; dismiss and delete from the device', async ({ page }) => {
    await signIn(page);
    const calls = await mockApi(page, OWNER_PERMS);
    await page.goto('/gym/devices/unlinked');
    await expect(page.getByTestId('unlinked-users')).toContainText('Old Seven');
    await page.getByRole('button', { name: 'Link to member' }).click();
    await page.getByLabel('Find the member').fill('Ayesha');
    await page.getByRole('option', { name: /Ayesha Noor/ }).click();
    await page.getByRole('button', { name: 'Link', exact: true }).click();
    await expect(page.getByText('Linked. The device user is now this member, with their access rules.', { exact: true })).toBeVisible();
    expect(calls.find((c) => c.path.endsWith('/unlinked-users/7/link'))?.body).toEqual({ memberId: MEMBER_ID });

    await page.getByRole('button', { name: 'Dismiss' }).click();
    await page.getByLabel(/Also delete this user/).check();
    await page.getByRole('button', { name: 'Dismiss and delete' }).click();
    expect(calls.find((c) => c.path.endsWith('/unlinked-users/7/dismiss'))?.body).toEqual({ removeFromDevice: true });
  });

  test('settings: turning capture photos off asks first and says how many were deleted', async ({ page }) => {
    await signIn(page);
    const calls = await mockApi(page, OWNER_PERMS);
    await page.goto('/gym/devices/settings');
    const photos = page.getByRole('switch', { name: 'Keep capture photos' });
    await expect(photos).toBeChecked();
    await photos.click();
    await page.getByRole('button', { name: 'Turn off and delete' }).click();
    await expect(page.getByText('Saved. 4 capture photos deleted.', { exact: true })).toBeVisible();
    await page.getByRole('switch', { name: 'Send device alerts' }).click();
    await expect(page.getByText('Device settings saved', { exact: true })).toBeVisible();
    const puts = calls.filter((c) => c.method === 'PUT').map((c) => c.body);
    expect(puts).toEqual([{ capturePhotos: false }, { alertsEnabled: false }]);
  });

  test('front desk sees the settings but cannot change them', async ({ page }) => {
    await signIn(page);
    await mockApi(page, DESK_PERMS, false);
    await page.goto('/gym/devices/settings');
    await expect(page.getByRole('switch', { name: 'Keep capture photos' })).toBeDisabled();
    await expect(page.getByText('changing them needs')).toBeVisible();
  });
});
