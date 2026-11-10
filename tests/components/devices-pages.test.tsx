import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DevicesPage from '@/app/(dashboard)/gym/devices/page'
import NewDevicePage from '@/app/(dashboard)/gym/devices/new/page'
import DeviceDetailPage from '@/app/(dashboard)/gym/devices/[id]/page'
import { devicesApi, AccessDevice, DeviceSetup } from '@/lib/api/devices'
import { meApi, MyContext } from '@/lib/api/me'
import { tenantsApi } from '@/lib/api/tenants'
import { ok } from '../fixtures/team'
import { branchManagerContext, frontDeskContext, orgAdminContext, ownerContext, plainMemberContext } from '../fixtures/context'

/**
 * ZKTeco Phase 1 (spec ZKTECO_PUSH_DEVICE_SYNC.md §4.4, §10): Access devices list, the add-device
 * wizard (setup card, live wait for the first contact) and the device page (status only).
 * The server decides what is allowed; the screens hide what the user may not do.
 */
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }), useParams: () => ({ id: 'd1' }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div data-testid="header" /> }))
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1', fullName: 'Test Person', role: 'GYM_HOST' }, logout: vi.fn(), isPlatformAdmin: false, isGymHost: true, isBranchManager: false }),
}))

const device = (over: Partial<AccessDevice> = {}): AccessDevice => ({
  id: 'd1',
  deviceKey: 'K7QM3XRT',
  key: 'K7QM-3XRT',
  branchId: 'branch-1',
  branchName: 'Uptown',
  organizationId: 'org-1',
  name: 'Front door IN',
  direction: 'in',
  enabled: true,
  linkMode: 'host',
  status: 'active',
  connection: 'online',
  serialNumber: 'CQZ7224460123',
  registeredAt: '2026-11-10T09:00:00Z',
  lastSeenAt: '2026-11-10T10:00:00Z',
  lastSeenSecondsAgo: 4,
  lastIp: '203.0.113.7',
  scheme: 'https',
  encrypted: true,
  tokenState: 'match',
  serialMismatch: null,
  model: 'SpeedFace-V5L',
  firmware: 'ZAM180-NF-Ver1.0.1',
  pushVersion: '3.1.2',
  deviceType: 'acc',
  capabilities: { fingerprint: true, face: true, palm: false },
  counts: { users: 12, faces: 11, fingerprints: 3, maxUsers: 10000 },
  createdAt: '2026-11-10T08:00:00Z',
  ...over,
})
const setup: DeviceSetup = { mode: 'host', serverAddress: 'k7qm3xrt.push.gymsera.com', port: 443, https: true, domainName: true, key: 'K7QM-3XRT' }

const httpError = (status: number, data: Record<string, unknown>) =>
  Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data } })

const renderWith = (ui: React.ReactElement, context: MyContext = ownerContext) => {
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(context) as never)
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)
}

const withDeviceKeys = (source: MyContext, keys: string[]): MyContext => ({
  ...source,
  organizations: source.organizations.map((o) => ({
    ...o,
    orgPermissions: o.orgPermissions.length ? [...o.orgPermissions, ...keys] : o.orgPermissions,
    branches: o.branches.map((b) => ({ ...b, permissions: [...b.permissions, ...keys] })),
  })),
})

let list: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  push.mockReset()
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
  list = vi.spyOn(devicesApi, 'list').mockResolvedValue(ok({ devices: [
    device(),
    device({ id: 'd2', name: 'Exit', direction: 'out', connection: 'awaiting_connection', status: 'awaiting_connection', model: null, firmware: null, lastSeenAt: null, lastSeenSecondsAgo: null, scheme: null, encrypted: null }),
    device({ id: 'd3', name: 'Back door', connection: 'offline', lastSeenSecondsAgo: 840, scheme: 'http', encrypted: false }),
  ] }) as never)
})
afterEach(() => vi.restoreAllMocks())

describe('Access devices list', () => {
  it('owner: every device with its status, direction, model and connection type; Add device', async () => {
    renderWith(<DevicesPage />)
    await screen.findByRole('link', { name: 'Front door IN' })
    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('Front door IN')
    expect(rows[0]).toHaveTextContent('Uptown')
    expect(rows[0]).toHaveTextContent('Online')
    expect(rows[0]).toHaveTextContent('Check-in')
    expect(rows[0]).toHaveTextContent('SpeedFace-V5L')
    expect(rows[0]).toHaveTextContent('HTTPS')
    expect(rows[1]).toHaveTextContent('Waiting for first connection')
    expect(rows[1]).toHaveTextContent('Check-out')
    expect(rows[2]).toHaveTextContent('Offline · last seen 14 min ago')
    expect(rows[2]).toHaveTextContent('HTTP (unencrypted)')
    expect(screen.getByRole('link', { name: /Add device/ })).toHaveAttribute('href', '/gym/devices/new')
    expect(within(rows[0]).getByRole('link', { name: 'Front door IN' })).toHaveAttribute('href', '/gym/devices/d1')
  })

  it('a branch filter asks the server for that branch', async () => {
    renderWith(<DevicesPage />, withDeviceKeys(orgAdminContext, ['devices.view', 'devices.manage']))
    await screen.findByRole('table')
    fireEvent.change(screen.getByLabelText('Branch'), { target: { value: 'branch-2' } })
    await waitFor(() => expect(list).toHaveBeenLastCalledWith('branch-2'))
  })

  it('front desk (devices.view only): the list, no Add device', async () => {
    renderWith(<DevicesPage />, withDeviceKeys(frontDeskContext, ['devices.view']))
    await screen.findByRole('table')
    expect(screen.queryByRole('link', { name: /Add device/ })).toBeNull()
  })

  it('without devices.view: no access, the list is not asked for', async () => {
    renderWith(<DevicesPage />, plainMemberContext)
    expect(await screen.findByText(/You do not have access to access devices/i)).toBeInTheDocument()
    expect(list).not.toHaveBeenCalled()
  })

  it('a failed load is an error with retry, not "no devices"', async () => {
    list.mockRejectedValue(httpError(500, { message: 'boom' }))
    renderWith(<DevicesPage />)
    expect(await screen.findByRole('button', { name: /Retry/ })).toBeInTheDocument()
    expect(screen.queryByText(/No access devices yet/i)).toBeNull()
  })
})

describe('Add device wizard', () => {
  it('offers only branches where the user may manage devices', async () => {
    const managerAtUptown: MyContext = withDeviceKeys(branchManagerContext, ['devices.view', 'devices.manage'])
    renderWith(<NewDevicePage />, managerAtUptown)
    const select = await screen.findByLabelText('Branch')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Uptown'])
  })

  it('creates the device, shows the setup card, then waits for the first contact', async () => {
    const create = vi.spyOn(devicesApi, 'create').mockResolvedValue(ok({ device: device({ connection: 'awaiting_connection', status: 'awaiting_connection', model: null, firmware: null }), setup }) as never)
    const get = vi.spyOn(devicesApi, 'get')
      .mockResolvedValueOnce(ok({ device: device({ connection: 'awaiting_connection', status: 'awaiting_connection', model: null }), setup }) as never)
      .mockResolvedValue(ok({ device: device(), setup }) as never)
    renderWith(<NewDevicePage />)

    fireEvent.change(await screen.findByLabelText('Device name'), { target: { value: 'Front door IN' } })
    fireEvent.change(screen.getByLabelText('Direction'), { target: { value: 'in' } })
    fireEvent.click(screen.getByRole('button', { name: /Create device/ }))

    await waitFor(() => expect(create).toHaveBeenCalledWith({ branchId: 'branch-1', name: 'Front door IN', direction: 'in' }))
    const card = await screen.findByTestId('setup-card')
    expect(card).toHaveTextContent('ADMS')
    expect(card).toHaveTextContent('k7qm3xrt.push.gymsera.com')
    expect(card).toHaveTextContent('443')
    expect(card).toHaveTextContent('Enable domain name')
    expect(card).toHaveTextContent('K7QM-3XRT')
    expect(screen.getByText(/Waiting for the device to connect/)).toBeInTheDocument()

    await waitFor(() => expect(screen.getByText(/Connected/)).toBeInTheDocument(), { timeout: 5000 })
    expect(screen.getByText(/SpeedFace-V5L · ZAM180/)).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('d1')
  }, 10000)

  it('shows the server\'s reason when the device cannot be added', async () => {
    vi.spyOn(devicesApi, 'create').mockRejectedValue(httpError(422, {
      success: false, code: 'serial_pairing_off', message: 'Adding a device by serial number is switched off. Use the device key instead.',
    }))
    renderWith(<NewDevicePage />)
    fireEvent.change(await screen.findByLabelText('Device name'), { target: { value: 'Gate' } })
    fireEvent.click(screen.getByRole('button', { name: /Create device/ }))
    expect(await screen.findByText(/serial number is switched off/)).toBeInTheDocument()
  })

  it('without devices.manage anywhere: no access', async () => {
    renderWith(<NewDevicePage />, withDeviceKeys(frontDeskContext, ['devices.view']))
    expect(await screen.findByText(/You do not have access to adding access devices/i)).toBeInTheDocument()
  })
})

describe('Device page', () => {
  beforeEach(() => {
    vi.spyOn(devicesApi, 'get').mockResolvedValue(ok({ device: device(), setup }) as never)
  })

  it('shows status, last seen, IP, model, firmware, capabilities, counts and the key', async () => {
    renderWith(<DeviceDetailPage />)
    expect(await screen.findByText('Online')).toBeInTheDocument()
    for (const text of ['SpeedFace-V5L', 'ZAM180-NF-Ver1.0.1', '203.0.113.7', 'CQZ7224460123', 'Face', 'Fingerprint', 'K7QM-3XRT', '12']) {
      expect(screen.getAllByText(text, { exact: false }).length).toBeGreaterThan(0)
    }
  })

  it('a serial mismatch is called out', async () => {
    vi.spyOn(devicesApi, 'get').mockResolvedValue(ok({ device: device({ serialMismatch: { at: '2026-11-10T10:00:00Z', serialNumber: 'OTHER123' } }), setup }) as never)
    renderWith(<DeviceDetailPage />)
    expect(await screen.findByText(/OTHER123/)).toBeInTheDocument()
  })

  it('owner: rename, disable, re-pair (confirmed, new key shown) and remove (confirmed)', async () => {
    const update = vi.spyOn(devicesApi, 'update').mockResolvedValue(ok({ device: device({ name: 'Main gate' }), setup }) as never)
    const repair = vi.spyOn(devicesApi, 'repair').mockResolvedValue(ok({ device: device({ key: 'ABCD-EFGH', connection: 'awaiting_connection' }), setup: { ...setup, key: 'ABCD-EFGH', serverAddress: 'abcdefgh.push.gymsera.com' } }) as never)
    const remove = vi.spyOn(devicesApi, 'remove').mockResolvedValue(ok({ id: 'd1' }) as never)
    renderWith(<DeviceDetailPage />)

    fireEvent.change(await screen.findByLabelText('Device name'), { target: { value: 'Main gate' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('d1', { name: 'Main gate', direction: 'in' }))

    fireEvent.click(screen.getByRole('button', { name: 'Disable' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('d1', { enabled: false }))

    fireEvent.click(screen.getByRole('button', { name: 'Re-pair' }))
    expect(repair).not.toHaveBeenCalled()
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Create new key' }))
    await waitFor(() => expect(repair).toHaveBeenCalledWith('d1'))

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(remove).not.toHaveBeenCalled()
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove device' }))
    // Phase 3: no wipe unless asked (the second argument is the typed-name wipe).
    await waitFor(() => expect(remove).toHaveBeenCalledWith('d1', undefined))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/gym/devices'))
  })

  it('a branch manager manages but cannot re-pair (organization-wide)', async () => {
    renderWith(<DeviceDetailPage />, withDeviceKeys(branchManagerContext, ['devices.view', 'devices.manage']))
    expect(await screen.findByRole('button', { name: 'Disable' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Re-pair' })).toBeNull()
  })

  it('front desk: status only, no actions', async () => {
    renderWith(<DeviceDetailPage />, withDeviceKeys(frontDeskContext, ['devices.view']))
    expect(await screen.findByText('Online')).toBeInTheDocument()
    for (const name of ['Save', 'Disable', 'Re-pair', 'Remove']) expect(screen.queryByRole('button', { name })).toBeNull()
  })

  it('a device that is not there (404) says so', async () => {
    vi.spyOn(devicesApi, 'get').mockRejectedValue(httpError(404, { success: false, code: 'device_not_found', message: 'Device not found.' }))
    renderWith(<DeviceDetailPage />)
    expect(await screen.findByText(/Device not found/)).toBeInTheDocument()
  })
})
