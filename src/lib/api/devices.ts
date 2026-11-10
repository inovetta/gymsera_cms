import apiClient from './client'
import { ApiResponse } from '@/types'

/**
 * Access devices (ZKTeco Push face / fingerprint / card terminals):
 * gymsera_be `src/routes/host-devices.routes.js` (`/api/v1/host/devices`) and, from Phase 3,
 * `host-device-push.routes.js` (`/api/v1/host/members/…`, `/host/branches/…`,
 * `/host/device-push-requests/…`). Spec `gymsera_be/docs/ZKTECO_PUSH_DEVICE_SYNC.md` §9 to §12.
 *
 * The server decides who may see or change a device (devices.view / devices.manage) and
 * never sends the device's secrets; the key and setup card are what the host types on the device.
 */

export type DeviceDirection = 'in' | 'out' | 'both'
export type DeviceLinkMode = 'host' | 'path' | 'serial'
/** awaiting_connection: added, never connected (or re-paired). online: seen within a minute. */
export type DeviceConnection = 'awaiting_connection' | 'online' | 'offline' | 'disabled' | 'removed' | 'wiping'

export interface AccessDevice {
  id: string
  deviceKey: string
  /** Shown with a hyphen: K7QM-3XRT. */
  key: string
  branchId: string
  branchName: string | null
  organizationId: string | null
  name: string | null
  direction: DeviceDirection | null
  enabled: boolean
  linkMode: DeviceLinkMode
  status: string
  connection: DeviceConnection
  serialNumber: string | null
  registeredAt: string | null
  lastSeenAt: string | null
  lastSeenSecondsAgo: number | null
  lastIp: string | null
  scheme: string | null
  /** null until the device has connected. */
  encrypted: boolean | null
  tokenState: string | null
  /** Another serial number tried this device's key (spec §4.2 rule 2). */
  serialMismatch: { at: string; serialNumber: string } | null
  model: string | null
  firmware: string | null
  pushVersion: string | null
  deviceType: string | null
  capabilities: { fingerprint: boolean; face: boolean; palm: boolean } | null
  counts: { users: number | null; faces: number | null; fingerprints: number | null; maxUsers: number | null }
  createdAt: string
}

/** What the host enters on the device: Menu › Comm › Cloud Server Setting (spec §4.4). */
export interface DeviceSetup {
  mode: DeviceLinkMode
  serverAddress: string
  port: number
  https: boolean
  domainName: boolean
  key: string
  /** Serial-number pairing only: the Comm Key to set on the device. */
  commKey?: string | null
}

export interface CreateDevicePayload {
  branchId: string
  name: string
  direction: DeviceDirection
  /** Leave out to use the server's default (the Phase 0 decision). */
  linkMode?: DeviceLinkMode
  serialNumber?: string
}

export interface UpdateDevicePayload {
  name?: string
  direction?: DeviceDirection
  enabled?: boolean
}

type DeviceWithSetup = { device: AccessDevice; setup: DeviceSetup }

export const devicesApi = {
  list: async (branchId?: string): Promise<ApiResponse<{ devices: AccessDevice[] }>> => {
    const { data } = await apiClient.get('/host/devices', { params: branchId ? { branchId } : undefined })
    return data
  },

  get: async (id: string): Promise<ApiResponse<DeviceWithSetup>> => {
    const { data } = await apiClient.get(`/host/devices/${id}`)
    return data
  },

  create: async (payload: CreateDevicePayload): Promise<ApiResponse<DeviceWithSetup>> => {
    const body: CreateDevicePayload = { branchId: payload.branchId, name: payload.name, direction: payload.direction }
    if (payload.linkMode) body.linkMode = payload.linkMode
    if (payload.serialNumber) body.serialNumber = payload.serialNumber
    const { data } = await apiClient.post('/host/devices', body)
    return data
  },

  update: async (id: string, patch: UpdateDevicePayload): Promise<ApiResponse<DeviceWithSetup>> => {
    const { data } = await apiClient.patch(`/host/devices/${id}`, patch)
    return data
  },

  /** New key, serial unbound; the old key stops working at once (owner or org admin). */
  repair: async (id: string): Promise<ApiResponse<DeviceWithSetup>> => {
    const { data } = await apiClient.post(`/host/devices/${id}/repair`, {})
    return data
  },

  /**
   * Unpair. With `wipe`, the device first deletes every GymsEra user (it shows "Wiping" until it
   * has answered); `confirmName` must be the device name, typed by the person (spec §10.3).
   */
  remove: async (id: string, wipe?: { confirmName: string }): Promise<ApiResponse<RemoveResult>> => {
    const { data } = await apiClient.delete(`/host/devices/${id}`, wipe ? { data: { wipeDevice: true, confirmName: wipe.confirmName } } : undefined)
    return data
  },

  // ── Phase 3: push (§9) ──────────────────────────────────────────────────────
  pushMember: async (memberId: string, deviceIds?: string[]): Promise<ApiResponse<PushStarted>> => {
    const { data } = await apiClient.post(`/host/members/${memberId}/device-push`, deviceIds?.length ? { deviceIds } : {})
    return data
  },
  /** Only where the member is not entitled any more (the server refuses otherwise: member_entitled). */
  removeMember: async (memberId: string, deviceIds?: string[]): Promise<ApiResponse<PushStarted>> => {
    const { data } = await apiClient.post(`/host/members/${memberId}/device-remove`, deviceIds?.length ? { deviceIds } : {})
    return data
  },
  pushBranch: async (branchId: string): Promise<ApiResponse<PushStarted>> => {
    const { data } = await apiClient.post(`/host/branches/${branchId}/device-push`, {})
    return data
  },
  /** quick: every pending change now (devices.push). audit: the full audit, 1 to 3 minutes (devices.manage). */
  sync: async (id: string, mode: 'quick' | 'audit'): Promise<ApiResponse<PushStarted & { auditId?: number }>> => {
    const { data } = await apiClient.post(`/host/devices/${id}/sync`, { mode })
    return data
  },
  pushStatus: async (requestId: string): Promise<ApiResponse<PushStatus>> => {
    const { data } = await apiClient.get(`/host/device-push-requests/${requestId}`)
    return data
  },

  // ── Member card (§9.1, §10.4) ───────────────────────────────────────────────
  memberStatus: async (memberId: string): Promise<ApiResponse<MemberDeviceStatus>> => {
    const { data } = await apiClient.get(`/host/members/${memberId}/device-status`)
    return data
  },
  enroll: async (memberId: string, deviceId: string, type: number): Promise<ApiResponse<PushStarted & { pin: string }>> => {
    const { data } = await apiClient.post(`/host/members/${memberId}/biometrics/enroll`, { deviceId, type })
    return data
  },
  giveConsent: async (memberId: string): Promise<ApiResponse<{ consent: ConsentStatus }>> => {
    const { data } = await apiClient.post(`/host/devices/members/${memberId}/biometric-consent`, { method: 'in_person' })
    return data
  },
  withdrawConsent: async (memberId: string): Promise<ApiResponse<{ templatesDeleted: number; photosDeleted: number }>> => {
    const { data } = await apiClient.delete(`/host/devices/members/${memberId}/biometric-consent`)
    return data
  },

  // ── Device tabs (§10.3) ─────────────────────────────────────────────────────
  members: async (id: string, state?: string): Promise<ApiResponse<DeviceMembers>> => {
    const { data } = await apiClient.get(`/host/devices/${id}/members`, { params: state ? { state } : undefined })
    return data
  },
  accessEvents: async (id: string): Promise<ApiResponse<AccessEventsPage>> => {
    const { data } = await apiClient.get(`/host/devices/${id}/access-events`)
    return data
  },
  branchAccessEvents: async (branchId: string): Promise<ApiResponse<AccessEventsPage>> => {
    const { data } = await apiClient.get(`/host/branches/${branchId}/access-events`)
    return data
  },
  errors: async (id: string): Promise<ApiResponse<{ errors: DeviceErrorRow[] }>> => {
    const { data } = await apiClient.get(`/host/devices/${id}/errors`)
    return data
  },
  audits: async (id: string): Promise<ApiResponse<DeviceAudits>> => {
    const { data } = await apiClient.get(`/host/devices/${id}/audits`)
    return data
  },
  /** The capture photo (D-6) as an object URL; the caller revokes it. */
  capturePhotoUrl: async (photoId: number): Promise<string> => {
    const { data } = await apiClient.get(`/host/devices/capture-photos/${photoId}`, { responseType: 'blob' })
    return URL.createObjectURL(data as Blob)
  },

  // ── Unlinked device users (§7.5) ────────────────────────────────────────────
  unlinked: async (branchId?: string): Promise<ApiResponse<{ users: UnlinkedUser[] }>> => {
    const { data } = await apiClient.get('/host/devices/unlinked-users', { params: branchId ? { branchId } : undefined })
    return data
  },
  linkUnlinked: async (deviceId: string, pin: string, memberId: string): Promise<ApiResponse<{ memberId: string; pin: string }>> => {
    const { data } = await apiClient.post(`/host/devices/${deviceId}/unlinked-users/${encodeURIComponent(pin)}/link`, { memberId })
    return data
  },
  dismissUnlinked: async (deviceId: string, pin: string, removeFromDevice: boolean): Promise<ApiResponse<{ pin: string }>> => {
    const { data } = await apiClient.post(`/host/devices/${deviceId}/unlinked-users/${encodeURIComponent(pin)}/dismiss`, { removeFromDevice })
    return data
  },

  // ── Branch settings (D-6, owner alerts) and staff door access (D-8) ─────────
  branchSettings: async (branchId: string): Promise<ApiResponse<{ settings: BranchDeviceSettings }>> => {
    const { data } = await apiClient.get(`/host/devices/branch-settings/${branchId}`)
    return data
  },
  saveBranchSettings: async (branchId: string, patch: Partial<Pick<BranchDeviceSettings, 'capturePhotos' | 'alertsEnabled'>>): Promise<ApiResponse<{ settings: BranchDeviceSettings; photosDeleted: number }>> => {
    const { data } = await apiClient.put(`/host/devices/branch-settings/${branchId}`, patch)
    return data
  },
  staffAccess: async (userId: string): Promise<ApiResponse<{ staff: StaffDeviceAccess[] }>> => {
    const { data } = await apiClient.get(`/host/devices/staff/by-user/${userId}`)
    return data
  },
  setStaffAccess: async (staffId: string, deviceAccess: boolean): Promise<ApiResponse<{ staffId: string; deviceAccess: boolean }>> => {
    const { data } = await apiClient.patch(`/host/devices/staff/${staffId}/device-access`, { deviceAccess })
    return data
  },
}

export interface RemoveResult {
  id: string
  status: 'removed' | 'wiping'
  wipe: boolean
  /** The device never connected: nothing of GymsEra's is on it. */
  wipeSkipped?: 'never_connected'
}

/** Why a member may not be on a device (the server's reason codes, spec §7.1). */
export type NotEntitledReason =
  | 'no_valid_package' | 'user_blocked' | 'pin_retired' | 'no_user' | 'branch_sync_frozen' | 'not_on_device'

export interface PushDevice {
  deviceId: string
  name: string | null
  branchId: string | null
  branchName: string | null
  connection: DeviceConnection
  lastSeenSecondsAgo: number | null
  offline: boolean
}

export interface PushStarted {
  requestId: string
  kind: 'member' | 'remove' | 'device' | 'branch' | 'enroll'
  /** The same person pressed again inside the window: this is the earlier request. */
  reused: boolean
  createdAt: string
  deadlineAt: string
  devices: (PushDevice & { outcome: 'pushing' | 'removing' | 'enrolling' | 'not_entitled'; reason: string | null; onDevice: boolean | null })[]
}

export type PushDeviceState =
  | 'queued' | 'delivered' | 'applied' | 'failed' | 'offline' | 'no_answer' | 'not_entitled' | 'waiting_for_member'

export interface PushStatus {
  requestId: string
  kind: PushStarted['kind']
  memberId: string | null
  branchId: string | null
  /** done: every device answered (or is offline / not entitled). timed_out: 15 s passed; commands stay queued. */
  status: 'running' | 'done' | 'timed_out'
  createdAt: string
  deadlineAt: string
  secondsLeft: number
  devices: (PushDevice & {
    state: PushDeviceState
    returnCode: number | null
    reason: string | null
    onDevice: boolean | null
    pin?: string
    progress?: { total: number; done: number; failed: number }
  })[]
}

export interface ConsentStatus {
  consented: boolean
  consentedAt: string | null
  method: 'in_person' | 'app' | null
  templates: number
  waitingForConsent: number
}

export interface MemberDeviceRow extends PushDevice {
  direction: DeviceDirection | null
  entitled: boolean
  reason: NotEntitledReason | null
  onDevice: boolean
  state: 'in_sync' | 'pending_add' | 'pending_update' | 'pending_remove' | 'failed' | 'removed' | 'not_on_device'
  pending: boolean
  lastSyncedAt: string | null
  lastReturnCode: number | null
  failedReason: string | null
  lastErrorAt: string | null
}

export interface MemberDeviceStatus {
  memberId: string
  pin: string | null
  consent: ConsentStatus
  biometrics: { type: number; count: number; lastEnrolledAt: string | null; waitingForConsent: boolean }[]
  devices: MemberDeviceRow[]
}

export interface DeviceMembers {
  counts: { inSync: number; pending: number; failed: number; removed: number }
  members: {
    memberId: string
    name: string | null
    pin: string
    shouldBeOnDevice: boolean
    state: MemberDeviceRow['state']
    lastReturnCode: number | null
    failedReason: string | null
    lastErrorAt: string | null
    updatedAt: string
  }[]
}

export interface AccessEvent {
  id: number
  deviceId: string
  deviceName: string | null
  branchId: string
  time: string
  localTime: string
  pin: string | null
  memberId: string | null
  memberName: string | null
  result: 'granted' | 'denied' | 'alarm' | 'other'
  reason: string | null
  /** check_in, check_out, duplicate, member_checkin_grace_expired (D-5), unlinked_pin, retired_pin, … */
  attendanceNote: string | null
  checkedIn: boolean
  photoId: number | null
}

export interface AccessEventsPage {
  events: AccessEvent[]
  latestId: number | null
}

export interface DeviceErrorRow {
  id: number
  source: 'device' | 'server'
  kind: string
  code: number | null
  message: string | null
  occurredAt: string
}

export interface DeviceAudits {
  reports: {
    id: number
    status: 'requested' | 'receiving' | 'compared' | 'incomplete'
    deviceUserCount: number | null
    desiredCount: number | null
    extraCount: number | null
    missingCount: number | null
    unlinkedCount: number | null
    startedAt: string
    finishedAt: string | null
  }[]
  activity: { action: string; actorName: string | null; actorUserId: string | null; at: string; result: string | null }[]
}

export interface UnlinkedUser {
  deviceId: string
  deviceName: string | null
  branchId: string | null
  pin: string
  name: string | null
  cardNo: string | null
  source: 'scan' | 'upload' | 'audit'
  firstSeenAt: string
  lastSeenAt: string
  hits: number
}

export interface BranchDeviceSettings {
  branchId: string
  capturePhotos: boolean
  alertsEnabled: boolean
  photoRetentionDays: number
  updatedAt?: string
}

export interface StaffDeviceAccess {
  staffId: string
  branchId: string
  branchName: string | null
  deviceAccess: boolean
  active: boolean
}
