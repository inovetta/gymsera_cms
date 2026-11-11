import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DeviceImportPage from '@/app/(dashboard)/gym/devices/[id]/import/page'
import DeviceCutoverPage from '@/app/(dashboard)/gym/devices/[id]/cutover/page'
import DeviceDetailPage from '@/app/(dashboard)/gym/devices/[id]/page'
import NewDevicePage from '@/app/(dashboard)/gym/devices/new/page'
import { MemberDevicesPanel } from '@/components/features/devices/member-devices-panel'
import { devicesApi, AccessDevice, Cutover, DeviceImport, ImportUser, ImportPreview, MemberDeviceStatus } from '@/lib/api/devices'
import { meApi, MyContext } from '@/lib/api/me'
import { tenantsApi } from '@/lib/api/tenants'
import { ok } from '../fixtures/team'
import { frontDeskContext, ownerContext } from '../fixtures/context'

/**
 * ZKTeco Phase 4 (gymsera_be docs/ZKTECO_PUSH_DEVICE_SYNC.md §15 Phase 4): the import wizard (read, match
 * by CSV or one by one, conflicts, preview, apply, roll back), the cut-over checklist (counts, steps, go
 * live), the device page (import hold, Commands tab, Move), the add-device "import first" option and
 * deleting one template on the member card. The server decides; the screens hide what the user may not do.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useParams: () => ({ id: 'd1' }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div data-testid="header" /> }))
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1', fullName: 'Test Person', role: 'GYM_HOST' }, logout: vi.fn(), isPlatformAdmin: false, isGymHost: true, isBranchManager: false }),
}))

const device = (over: Partial<AccessDevice> = {}): AccessDevice => ({
  id: 'd1', deviceKey: 'K7QM3XRT', key: 'K7QM-3XRT', branchId: 'branch-1', branchName: 'Uptown', organizationId: 'org-1', name: 'GBS Door',
  direction: 'in', enabled: true, linkMode: 'host', status: 'active', connection: 'online', serialNumber: 'SIM1', registeredAt: '2026-11-10T09:00:00Z',
  lastSeenAt: '2026-11-10T10:00:00Z', lastSeenSecondsAgo: 3, lastIp: '203.0.113.7', scheme: 'https', encrypted: true, tokenState: 'match', serialMismatch: null,
  model: 'SpeedFace-V5L', firmware: 'ZAM180', pushVersion: '3.1.2', deviceType: 'acc', capabilities: { fingerprint: true, face: true, palm: false },
  counts: { users: 7, faces: 6, fingerprints: 1, maxUsers: 10000 }, importHold: true, importHoldSince: '2026-11-10T09:00:00Z', liveAt: null,
  createdAt: '2026-11-10T08:00:00Z', ...over,
})
const setup = { mode: 'host' as const, serverAddress: 'k7qm3xrt.push.gymsera.com', port: 443, https: true, domainName: true, key: 'K7QM-3XRT' }

const imp = (over: Partial<DeviceImport> = {}): DeviceImport => ({
  id: 'IMP1', deviceId: 'd1', status: 'ready', startedAt: '2026-11-10T09:00:00Z', readyAt: '2026-11-10T09:01:00Z', appliedAt: null, liveAt: null, finishedAt: null,
  truncated: false, types: [1, 9], failedQueries: [], failedReason: null, result: null,
  counts: { users: 7, templates: 7, templatesTooLarge: 0, admins: 1, matched: 5, unmatched: 1, conflicts: 1, removeAtGoLive: 1 },
  ...over,
})
const user = (over: Partial<ImportUser>): ImportUser => ({
  pin: '501', name: 'Sara GBS', cardNo: null, privilege: 0, isAdmin: false, memberId: 'm-sara', memberName: 'Sara Import', memberPin: null,
  matchSource: 'csv', removeAtGoLive: false, conflict: null, blocking: false, templates: { 9: 1, 1: 1 }, appliedAt: null, ...over,
})
const users = [
  user({}),
  user({ pin: '1001', name: 'Ali GBS', memberId: 'm-ali', memberName: 'Ali Import', matchSource: 'manual', conflict: 'pin_taken', blocking: true, templates: { 9: 1 } }),
  user({ pin: '504', name: 'Unknown GBS', memberId: null, memberName: null, matchSource: null, templates: { 9: 1 } }),
  user({ pin: '9', name: 'Installer', privilege: 14, isAdmin: true, memberId: null, memberName: null, matchSource: null, templates: {} }),
]
const preview = (over: Partial<ImportPreview> = {}): ImportPreview => ({
  willStore: { identities: 3, templates: 5, templatesPending: 1, alreadyEnrolled: 0, cards: 1 },
  consentNeeded: [{ memberId: 'm-omar', memberName: 'Omar Import', pin: '502', templates: 1 }],
  skipped: { unmatched: 1, admins: 1, alreadyEnrolled: 0, templatesNotImported: 1 },
  atGoLive: { removePins: ['506'], notEntitled: 1, sendUnderOwnPin: [] },
  blocking: [{ pin: '1001', conflict: 'pin_taken', memberId: 'm-ali' }],
  capacity: { users: 6, maxUsers: 10000, percent: 0 },
  ...over,
})
const cutover = (over: Partial<Cutover> = {}): Cutover => ({
  deviceId: 'd1', importHold: true, importHoldSince: '2026-11-10T09:00:00Z', liveAt: null, gbsStoppedAt: null, import: imp({ status: 'applied', counts: { ...imp().counts, conflicts: 0 } }),
  counts: { deviceUsers: 7, imported: 7, matched: 5, unmatched: 1, admins: 1, conflicts: 0, templates: 7, consentNeeded: 1, verified: 0 },
  unmatchedPins: ['504'],
  steps: [
    { key: 'connected', status: 'done' }, { key: 'imported', status: 'done' }, { key: 'matched', status: 'warning', count: 1 },
    { key: 'conflicts', status: 'done', count: 0 }, { key: 'applied', status: 'done' }, { key: 'consent', status: 'warning', count: 1 },
    { key: 'capacity', status: 'done', percent: 0 }, { key: 'live', status: 'todo' }, { key: 'verified', status: 'todo', count: 0, of: 0 },
    { key: 'gymbiosync_stopped', status: 'todo', at: null },
  ],
  canGoLive: true,
  ...over,
})

const withDeviceKeys = (source: MyContext, keys: string[]): MyContext => ({
  ...source,
  organizations: source.organizations.map((o) => ({ ...o, branches: o.branches.map((b) => ({ ...b, permissions: [...b.permissions, ...keys] })) })),
})
const ownerTwoBranches: MyContext = {
  ...ownerContext,
  organizations: ownerContext.organizations.map((o) => ({ ...o, branches: [...o.branches, { id: 'branch-2', name: 'Downtown', permissions: ['*'] }] })),
}

const renderWith = (ui: React.ReactElement, context: MyContext = ownerContext) => {
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(context) as never)
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
  vi.spyOn(devicesApi, 'get').mockResolvedValue(ok({ device: device(), setup }) as never)
})
afterEach(() => vi.restoreAllMocks())

describe('Import from device', () => {
  it('no import yet: explains nothing changes on the device; Start import asks the server', async () => {
    vi.spyOn(devicesApi, 'imports').mockResolvedValue(ok({ imports: [] }) as never)
    const start = vi.spyOn(devicesApi, 'startImport').mockResolvedValue(ok({ import: imp({ status: 'querying' }), reused: false }) as never)
    renderWith(<DeviceImportPage />)
    expect(await screen.findByText(/Nothing on the device changes during the import/)).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Start import' }))
    await waitFor(() => expect(start).toHaveBeenCalledWith('d1'))
  })

  it('reading: shows progress, no table yet', async () => {
    vi.spyOn(devicesApi, 'imports').mockResolvedValue(ok({ imports: [imp({ status: 'querying', counts: { ...imp().counts, users: 3, templates: 2 } })] }) as never)
    const usersCall = vi.spyOn(devicesApi, 'importUsers')
    renderWith(<DeviceImportPage />)
    expect(await screen.findByTestId('import-reading')).toHaveTextContent('3 users and 2 faces or fingerprints so far')
    expect(usersCall).not.toHaveBeenCalled()
  })

  it('ready: users with templates, conflicts in words, admins left alone; Apply blocked by a conflict', async () => {
    vi.spyOn(devicesApi, 'imports').mockResolvedValue(ok({ imports: [imp()] }) as never)
    vi.spyOn(devicesApi, 'importUsers').mockResolvedValue(ok({ users, total: 4, limit: 50, offset: 0 }) as never)
    vi.spyOn(devicesApi, 'importPreview').mockResolvedValue(ok({ preview: preview() }) as never)
    renderWith(<DeviceImportPage />)
    const table = await screen.findByTestId('import-users')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Sara Import')
    expect(rows[0]).toHaveTextContent('Face ×1')
    expect(rows[0]).toHaveTextContent('Fingerprint ×1')
    expect(rows[1]).toHaveTextContent(/This PIN belongs to another GymsEra member/)
    expect(rows[2]).toHaveTextContent('Not matched')
    expect(rows[3]).toHaveTextContent('Device administrator: left as it is')
    expect(within(rows[3]).queryByRole('button', { name: 'Match' })).toBeNull()
    const pv = await screen.findByTestId('import-preview')
    expect(pv).toHaveTextContent('3 members keep their device PIN')
    expect(pv).toHaveTextContent('Omar Import')
    expect(pv).toHaveTextContent('Removed from the device at go-live: PIN 506')
    expect(within(pv).getByRole('alert')).toHaveTextContent('PIN 1001')
    expect(within(pv).getByRole('button', { name: 'Apply' })).toBeDisabled()
  })

  it('"Remove" on a conflicting user sends removeAtGoLive; Apply asks and calls the server', async () => {
    vi.spyOn(devicesApi, 'imports').mockResolvedValue(ok({ imports: [imp()] }) as never)
    vi.spyOn(devicesApi, 'importUsers').mockResolvedValue(ok({ users, total: 4, limit: 50, offset: 0 }) as never)
    const pv = vi.spyOn(devicesApi, 'importPreview').mockResolvedValue(ok({ preview: preview({ blocking: [] }) }) as never)
    const match = vi.spyOn(devicesApi, 'matchImportUser').mockResolvedValue(ok({ user: users[1] }) as never)
    const apply = vi.spyOn(devicesApi, 'applyImport').mockResolvedValue(ok({ import: imp({ status: 'applied' }), alreadyApplied: false }) as never)
    renderWith(<DeviceImportPage />)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Remove device user 1001 at go-live' }))
    await waitFor(() => expect(match).toHaveBeenCalledWith('d1', 'IMP1', '1001', { removeAtGoLive: true }))
    await waitFor(() => expect(pv).toHaveBeenCalled())
    fireEvent.click(await screen.findByRole('button', { name: 'Apply' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(apply).toHaveBeenCalledWith('d1', 'IMP1'))
  })

  it('CSV upload: the file goes to the server; lines not matched are listed in words', async () => {
    vi.spyOn(devicesApi, 'imports').mockResolvedValue(ok({ imports: [imp()] }) as never)
    vi.spyOn(devicesApi, 'importUsers').mockResolvedValue(ok({ users, total: 4, limit: 50, offset: 0 }) as never)
    vi.spyOn(devicesApi, 'importPreview').mockResolvedValue(ok({ preview: preview() }) as never)
    const upload = vi.spyOn(devicesApi, 'uploadImportMapping').mockResolvedValue(ok({ matched: 2, errors: [{ line: 4, pin: '777', reason: 'pin_not_on_device' }] }) as never)
    renderWith(<DeviceImportPage />)
    await screen.findByTestId('import-users')
    const file = new File(['pin,email\n501,a@b.c'], 'map.csv', { type: 'text/csv' })
    fireEvent.change(screen.getByLabelText('CSV file'), { target: { files: [file] } })
    await waitFor(() => expect(upload).toHaveBeenCalledWith('d1', 'IMP1', 'pin,email\n501,a@b.c'))
    expect(await screen.findByTestId('csv-errors')).toHaveTextContent('Line 4 (PIN 777): No user with this PIN on the device')
  })

  it('applied: Roll back and the link to the cut-over', async () => {
    vi.spyOn(devicesApi, 'imports').mockResolvedValue(ok({ imports: [imp({ status: 'applied', appliedAt: '2026-11-10T09:05:00Z' })] }) as never)
    vi.spyOn(devicesApi, 'importUsers').mockResolvedValue(ok({ users, total: 4, limit: 50, offset: 0 }) as never)
    vi.spyOn(devicesApi, 'importPreview').mockResolvedValue(ok({ preview: preview({ blocking: [] }) }) as never)
    const rb = vi.spyOn(devicesApi, 'rollbackImport').mockResolvedValue(ok({ import: imp({ status: 'rolled_back' }) }) as never)
    renderWith(<DeviceImportPage />)
    expect(await screen.findByRole('link', { name: 'Continue to the cut-over' })).toHaveAttribute('href', '/gym/devices/d1/cutover')
    expect(screen.queryByRole('button', { name: 'Upload CSV' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Roll back' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Roll back' }))
    await waitFor(() => expect(rb).toHaveBeenCalledWith('d1', 'IMP1'))
  })

  it('front desk (devices.view): reads the import, cannot match, upload or apply', async () => {
    vi.spyOn(devicesApi, 'imports').mockResolvedValue(ok({ imports: [imp()] }) as never)
    vi.spyOn(devicesApi, 'importUsers').mockResolvedValue(ok({ users, total: 4, limit: 50, offset: 0 }) as never)
    vi.spyOn(devicesApi, 'importPreview').mockResolvedValue(ok({ preview: preview({ blocking: [] }) }) as never)
    renderWith(<DeviceImportPage />, frontDeskContext)
    await screen.findByTestId('import-users')
    expect(screen.queryByRole('button', { name: 'Upload CSV' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Match' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull()
  })
})

describe('Cut-over checklist', () => {
  it('counts, steps in words, unmatched PINs; Go live asks and sends removeUnmatched', async () => {
    vi.spyOn(devicesApi, 'cutover').mockResolvedValue(ok({ cutover: cutover() }) as never)
    const live = vi.spyOn(devicesApi, 'goLive').mockResolvedValue(ok({ cutover: cutover({ steps: cutover().steps.map((s) => (s.key === 'live' ? { ...s, status: 'done' as const } : s)) }) }) as never)
    renderWith(<DeviceCutoverPage />)
    const counts = await screen.findByTestId('cutover-counts')
    expect(counts).toHaveTextContent('7Users on the device')
    expect(counts).toHaveTextContent('5Matched')
    const steps = screen.getByTestId('cutover-steps')
    expect(steps).toHaveTextContent('Device users matched to members · 1 not matched')
    expect(steps).toHaveTextContent('Biometric consent · 1 member without consent')
    expect(screen.getByTestId('unmatched-pins')).toHaveTextContent('504')
    fireEvent.click(screen.getByRole('button', { name: 'Go live' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('checkbox'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Go live' }))
    await waitFor(() => expect(live).toHaveBeenCalledWith('d1', true))
  })

  it('not applied yet: Go live is disabled and says why', async () => {
    vi.spyOn(devicesApi, 'cutover').mockResolvedValue(ok({ cutover: cutover({ canGoLive: false }) }) as never)
    renderWith(<DeviceCutoverPage />)
    expect(await screen.findByRole('button', { name: 'Go live' })).toBeDisabled()
    expect(screen.getByText(/Apply the import first/)).toBeInTheDocument()
  })

  it('front desk: reads the checklist, no Go live', async () => {
    vi.spyOn(devicesApi, 'cutover').mockResolvedValue(ok({ cutover: cutover() }) as never)
    renderWith(<DeviceCutoverPage />, frontDeskContext)
    await screen.findByTestId('cutover-steps')
    expect(screen.queryByRole('button', { name: 'Go live' })).toBeNull()
  })

  it('after go-live: "GymBioSync is stopped" is recorded', async () => {
    const liveSteps = cutover().steps.map((s) => (s.key === 'live' ? { ...s, status: 'done' as const } : s))
    vi.spyOn(devicesApi, 'cutover').mockResolvedValue(ok({ cutover: cutover({ steps: liveSteps }) }) as never)
    const stopped = vi.spyOn(devicesApi, 'gymBioSyncStopped').mockResolvedValue(ok({ cutover: cutover({ steps: liveSteps }) }) as never)
    renderWith(<DeviceCutoverPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'GymBioSync is stopped' }))
    await waitFor(() => expect(stopped).toHaveBeenCalledWith('d1'))
  })
})

describe('Device page (Phase 4)', () => {
  beforeEach(() => {
    for (const k of ['members', 'accessEvents', 'errors', 'audits'] as const) vi.spyOn(devicesApi, k).mockResolvedValue(ok({}) as never)
  })

  it('import hold: banner with the import and cut-over links; no Sync now', async () => {
    renderWith(<DeviceDetailPage />)
    const banner = await screen.findByTestId('import-hold')
    expect(within(banner).getByRole('link', { name: 'Import' })).toHaveAttribute('href', '/gym/devices/d1/import')
    expect(within(banner).getByRole('link', { name: 'Cut-over checklist' })).toHaveAttribute('href', '/gym/devices/d1/cutover')
    expect(screen.queryByRole('button', { name: /Sync now/ })).toBeNull()
  })

  it('Move: only to a branch where the user manages devices; the server is asked', async () => {
    vi.mocked(devicesApi.get).mockResolvedValue(ok({ device: device({ importHold: false }), setup }) as never)
    const move = vi.spyOn(devicesApi, 'move').mockResolvedValue(ok({ device: device({ importHold: false, branchId: 'branch-2', branchName: 'Downtown' }), setup, sync: { queued: 3 } }) as never)
    renderWith(<DeviceDetailPage />, ownerTwoBranches)
    fireEvent.click(await screen.findByRole('button', { name: 'Move to another branch' }))
    const dialog = await screen.findByRole('dialog')
    const select = within(dialog).getByLabelText('New branch')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a branch', 'Downtown'])
    fireEvent.change(select, { target: { value: 'branch-2' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move device' }))
    await waitFor(() => expect(move).toHaveBeenCalledWith('d1', 'branch-2'))
  })

  it('Commands tab: what was sent and what the device answered, never the command text', async () => {
    vi.mocked(devicesApi.get).mockResolvedValue(ok({ device: device({ importHold: false }), setup }) as never)
    const cmds = vi.spyOn(devicesApi, 'commands').mockResolvedValue(ok({ commands: [
      { id: 7, kind: 'bio_upsert', status: 'failed', returnCode: -30, memberId: 'm1', memberName: 'Sara Import', attempts: 1, priority: 0, pushRequestId: null, createdAt: '2026-11-10T09:00:00Z', sentAt: null, ackedAt: null },
      { id: 6, kind: 'user_upsert', status: 'acked', returnCode: 0, memberId: 'm1', memberName: 'Sara Import', attempts: 1, priority: 5, pushRequestId: null, createdAt: '2026-11-10T09:00:00Z', sentAt: null, ackedAt: null },
    ] }) as never)
    renderWith(<DeviceDetailPage />)
    const tab = await screen.findByRole('tab', { name: 'Commands' })
    fireEvent.mouseDown(tab)
    fireEvent.click(tab)
    const panel = await screen.findByTestId('device-commands')
    await waitFor(() => expect(panel).toHaveTextContent('Face or fingerprint · Push now'))
    expect(panel).toHaveTextContent('Failed (code -30)')
    expect(panel).toHaveTextContent('Add or update user')
    expect(cmds).toHaveBeenCalledWith('d1', undefined)
    fireEvent.change(within(panel).getByLabelText('Filter commands'), { target: { value: 'failed' } })
    await waitFor(() => expect(cmds).toHaveBeenLastCalledWith('d1', 'failed'))
  })
})

describe('Add device: "Does this device already have members from GymBioSync?" (required, no default)', () => {
  it('nothing is chosen at first; Create device stays disabled until it is answered', async () => {
    const create = vi.spyOn(devicesApi, 'create')
    renderWith(<NewDevicePage />, withDeviceKeys(ownerContext, []))
    fireEvent.change(await screen.findByLabelText('Device name'), { target: { value: 'Door' } })
    const group = screen.getByRole('group', { name: /Does this device already have members from GymBioSync\?/ })
    for (const r of within(group).getAllByRole('radio')) expect(r).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Create device' })).toBeDisabled()
    expect(screen.getByText('Answer the GymBioSync question to continue.')).toBeInTheDocument()
    fireEvent.submit(screen.getByRole('button', { name: 'Create device' }).closest('form') as HTMLFormElement)
    expect(create).not.toHaveBeenCalled()
  })

  it('Yes: importFirst true, and the next screen points to the import page', async () => {
    const create = vi.spyOn(devicesApi, 'create').mockResolvedValue(ok({ device: device({ connection: 'awaiting_connection', importHold: true }), setup }) as never)
    vi.mocked(devicesApi.get).mockResolvedValue(ok({ device: device({ connection: 'awaiting_connection', importHold: true }), setup }) as never)
    renderWith(<NewDevicePage />, withDeviceKeys(ownerContext, []))
    fireEvent.change(await screen.findByLabelText('Device name'), { target: { value: 'GBS Door' } })
    fireEvent.click(screen.getByRole('radio', { name: /Yes, it has GymBioSync members/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Create device' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'GBS Door', importFirst: true })))
    const next = await screen.findByTestId('import-next')
    expect(within(next).getByRole('link', { name: 'import page' })).toHaveAttribute('href', '/gym/devices/d1/import')
  })

  it('No: importFirst false, no import pointer', async () => {
    const create = vi.spyOn(devicesApi, 'create').mockResolvedValue(ok({ device: device({ connection: 'awaiting_connection', importHold: false }), setup }) as never)
    vi.mocked(devicesApi.get).mockResolvedValue(ok({ device: device({ connection: 'awaiting_connection', importHold: false }), setup }) as never)
    renderWith(<NewDevicePage />, withDeviceKeys(ownerContext, []))
    fireEvent.change(await screen.findByLabelText('Device name'), { target: { value: 'New Door' } })
    fireEvent.click(screen.getByRole('radio', { name: /No, it is new or empty/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Create device' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Door', importFirst: false })))
    await screen.findByTestId('setup-card')
    expect(screen.queryByTestId('import-next')).toBeNull()
  })
})

describe('Member card: delete one template', () => {
  const status: MemberDeviceStatus = {
    memberId: 'm1', pin: '501',
    consent: { consented: true, consentedAt: '2026-11-10T09:00:00Z', method: 'in_person', templates: 2, waitingForConsent: 0 },
    biometrics: [{ type: 1, count: 1, lastEnrolledAt: null, waitingForConsent: false }, { type: 9, count: 1, lastEnrolledAt: null, waitingForConsent: false }],
    templates: [
      { id: 'bio-f0', type: 1, no: 0, index: 0, version: '10', pending: false, held: false, sourceDeviceId: null, enrolledAt: null },
      { id: 'bio-face', type: 9, no: 0, index: 0, version: '40', pending: false, held: true, sourceDeviceId: 'd1', enrolledAt: null },
    ],
    devices: [],
  }

  it('owner: confirms, then deletes that one template', async () => {
    vi.spyOn(devicesApi, 'memberStatus').mockResolvedValue(ok(status) as never)
    const del = vi.spyOn(devicesApi, 'deleteTemplate').mockResolvedValue(ok({ deleted: 1, bioId: 'bio-f0', type: 1 }) as never)
    renderWith(<MemberDevicesPanel memberId="m1" />)
    const list = await screen.findByTestId('member-templates')
    expect(list).toHaveTextContent('imported, not live yet')
    fireEvent.click(within(list).getByRole('button', { name: 'Delete Fingerprint 1' }))
    fireEvent.click(within(list).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(del).toHaveBeenCalledWith('m1', 'bio-f0'))
  })

  it('front desk (no biometrics.delete): sees the templates, no Delete', async () => {
    vi.spyOn(devicesApi, 'memberStatus').mockResolvedValue(ok(status) as never)
    renderWith(<MemberDevicesPanel memberId="m1" />, frontDeskContext)
    const list = await screen.findByTestId('member-templates')
    expect(within(list).queryByRole('button', { name: /Delete/ })).toBeNull()
  })
})
