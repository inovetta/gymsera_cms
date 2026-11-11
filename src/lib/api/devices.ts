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
  /** Phase 4: the device is being imported (GymBioSync): it gets nothing from GymsEra until go-live. */
  importHold?: boolean
  importHoldSince?: string | null
  liveAt?: string | null
  tokenMode?: 'off' | 'log' | 'enforce'
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
  /**
   * Required (the API refuses a new device without it): true = the device already has members from
   * GymBioSync, so it is added in import hold; false = a new or empty device.
   */
  importFirst: boolean
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
    const body: CreateDevicePayload = { branchId: payload.branchId, name: payload.name, direction: payload.direction, importFirst: payload.importFirst }
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

  // ── Phase 4: command log, move, one template ────────────────────────────────
  commands: async (id: string, status?: DeviceCommand['status']): Promise<ApiResponse<{ commands: DeviceCommand[] }>> => {
    const { data } = await apiClient.get(`/host/devices/${id}/commands`, { params: status ? { status } : undefined })
    return data
  },
  /** Old branch's members are removed from the device, the new branch's are sent. */
  move: async (id: string, branchId: string): Promise<ApiResponse<DeviceWithSetup & { sync: { queued: number } }>> => {
    const { data } = await apiClient.post(`/host/devices/${id}/move`, { branchId })
    return data
  },
  deleteTemplate: async (memberId: string, bioId: string): Promise<ApiResponse<{ deleted: number; bioId: string; type: number | null }>> => {
    const { data } = await apiClient.delete(`/host/members/${memberId}/biometrics/${bioId}`)
    return data
  },

  // ── Phase 4: import from device (GymBioSync) and cut-over ───────────────────
  startImport: async (id: string): Promise<ApiResponse<{ import: DeviceImport; reused: boolean }>> => {
    const { data } = await apiClient.post(`/host/devices/${id}/imports`, {})
    return data
  },
  imports: async (id: string): Promise<ApiResponse<{ imports: DeviceImport[] }>> => {
    const { data } = await apiClient.get(`/host/devices/${id}/imports`)
    return data
  },
  importUsers: async (id: string, importId: string, opts: { filter?: ImportUserFilter; limit?: number; offset?: number } = {}): Promise<ApiResponse<ImportUsersPage>> => {
    const params: Record<string, string | number> = {}
    if (opts.filter && opts.filter !== 'all') params.filter = opts.filter
    if (opts.limit) params.limit = opts.limit
    if (opts.offset) params.offset = opts.offset
    const { data } = await apiClient.get(`/host/devices/${id}/imports/${importId}/users`, { params })
    return data
  },
  /** memberId null: not matched. removeAtGoLive: the device user is deleted at go-live. */
  matchImportUser: async (id: string, importId: string, pin: string, patch: { memberId?: string | null; removeAtGoLive?: boolean }): Promise<ApiResponse<{ user: ImportUser }>> => {
    const { data } = await apiClient.put(`/host/devices/${id}/imports/${importId}/users/${encodeURIComponent(pin)}`, patch)
    return data
  },
  uploadImportMapping: async (id: string, importId: string, csv: string): Promise<ApiResponse<{ matched: number; errors: ImportMappingError[] }>> => {
    const { data } = await apiClient.post(`/host/devices/${id}/imports/${importId}/mapping`, { csv })
    return data
  },
  importPreview: async (id: string, importId: string): Promise<ApiResponse<{ preview: ImportPreview }>> => {
    const { data } = await apiClient.get(`/host/devices/${id}/imports/${importId}/preview`)
    return data
  },
  applyImport: async (id: string, importId: string): Promise<ApiResponse<{ import: DeviceImport; alreadyApplied: boolean }>> => {
    const { data } = await apiClient.post(`/host/devices/${id}/imports/${importId}/apply`, {})
    return data
  },
  rollbackImport: async (id: string, importId: string): Promise<ApiResponse<{ import: DeviceImport }>> => {
    const { data } = await apiClient.post(`/host/devices/${id}/imports/${importId}/rollback`, {})
    return data
  },
  cancelImport: async (id: string, importId: string): Promise<ApiResponse<{ import: DeviceImport }>> => {
    const { data } = await apiClient.post(`/host/devices/${id}/imports/${importId}/cancel`, {})
    return data
  },
  cutover: async (id: string): Promise<ApiResponse<{ cutover: Cutover }>> => {
    const { data } = await apiClient.get(`/host/devices/${id}/cutover`)
    return data
  },
  goLive: async (id: string, removeUnmatched: boolean): Promise<ApiResponse<{ cutover: Cutover }>> => {
    const { data } = await apiClient.post(`/host/devices/${id}/cutover/go-live`, removeUnmatched ? { removeUnmatched: true } : {})
    return data
  },
  gymBioSyncStopped: async (id: string): Promise<ApiResponse<{ cutover: Cutover }>> => {
    const { data } = await apiClient.post(`/host/devices/${id}/cutover/gymbiosync-stopped`, {})
    return data
  },
}

export interface DeviceCommand {
  id: number
  kind: string
  status: 'queued' | 'sent' | 'acked' | 'failed' | 'expired' | 'superseded'
  returnCode: number | null
  memberId: string | null
  memberName: string | null
  attempts: number
  priority: number
  pushRequestId: string | null
  createdAt: string
  sentAt: string | null
  ackedAt: string | null
}

export type ImportStatus = 'querying' | 'ready' | 'applied' | 'live' | 'rolled_back' | 'cancelled' | 'failed'
export type ImportUserFilter = 'all' | 'matched' | 'unmatched' | 'conflict' | 'admin' | 'remove'

export interface DeviceImport {
  id: string
  deviceId: string
  status: ImportStatus
  startedAt: string
  readyAt: string | null
  appliedAt: string | null
  liveAt: string | null
  finishedAt: string | null
  truncated: boolean
  types: number[]
  failedQueries: { kind: string; type: number | null }[]
  failedReason: string | null
  result: { identities: number; templates: number; templatesPending: number; alreadyEnrolled: number; cards: number } | null
  counts: {
    users: number
    templates: number
    templatesTooLarge: number
    admins: number
    matched: number
    unmatched: number
    conflicts: number
    removeAtGoLive: number
  }
}

export interface ImportUser {
  pin: string
  name: string | null
  cardNo: string | null
  privilege: number
  isAdmin: boolean
  memberId: string | null
  memberName: string | null
  memberPin: string | null
  matchSource: 'manual' | 'csv' | 'carried' | null
  removeAtGoLive: boolean
  conflict: 'pin_taken' | 'member_has_pin' | null
  blocking: boolean
  /** Template counts by biometric type (1 fingerprint, 9 face, …). */
  templates: Record<string, number>
  appliedAt: string | null
}

export interface ImportUsersPage {
  users: ImportUser[]
  total: number
  limit: number
  offset: number
}

export interface ImportMappingError {
  line: number
  pin: string | null
  reason: string
}

export interface ImportPreview {
  willStore: { identities: number; templates: number; templatesPending: number; alreadyEnrolled: number; cards: number }
  consentNeeded: { memberId: string; memberName: string | null; pin: string; templates: number }[]
  skipped: { unmatched: number; admins: number; alreadyEnrolled: number; templatesNotImported: number }
  atGoLive: { removePins: string[]; notEntitled: number; sendUnderOwnPin: { pin: string; memberPin: string | null }[] }
  blocking: { pin: string; conflict: string | null; memberId: string | null }[]
  capacity: { users: number; maxUsers: number | null; percent: number | null }
}

export type CutoverStepKey =
  | 'connected' | 'imported' | 'matched' | 'conflicts' | 'applied' | 'consent' | 'capacity' | 'live' | 'verified' | 'gymbiosync_stopped'

export interface Cutover {
  deviceId: string
  importHold: boolean
  importHoldSince: string | null
  liveAt: string | null
  gbsStoppedAt: string | null
  import: DeviceImport | null
  counts: {
    deviceUsers: number
    imported: number
    matched: number
    unmatched: number
    admins: number
    conflicts: number
    templates: number
    consentNeeded: number
    verified: number
  }
  unmatchedPins: string[]
  steps: { key: CutoverStepKey; status: 'done' | 'todo' | 'in_progress' | 'warning' | 'blocked'; count?: number; of?: number; percent?: number | null; connection?: string; at?: string | null }[]
  canGoLive: boolean
}

export interface MemberTemplate {
  id: string
  type: number
  no: number
  index: number
  version: string
  /** Waiting for the member's consent (kept on the enrolling device only, 7 days). */
  pending: boolean
  /** Imported, not live yet. */
  held: boolean
  sourceDeviceId: string | null
  enrolledAt: string | null
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
  /** Phase 4: each template (never its data), so one can be deleted. */
  templates?: MemberTemplate[]
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
  source: 'scan' | 'upload' | 'audit' | 'import'
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
