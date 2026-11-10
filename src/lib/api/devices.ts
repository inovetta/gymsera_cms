import apiClient from './client'
import { ApiResponse } from '@/types'

/**
 * Access devices (ZKTeco Push face / fingerprint / card terminals), Phase 1:
 * gymsera_be `src/routes/host-devices.routes.js` (`/api/v1/host/devices`), spec
 * `gymsera_be/docs/ZKTECO_PUSH_DEVICE_SYNC.md` §10, §11.
 *
 * The server decides who may see or change a device (devices.view / devices.manage) and
 * never sends the device's secrets; the key and setup card are what the host types on the device.
 */

export type DeviceDirection = 'in' | 'out' | 'both'
export type DeviceLinkMode = 'host' | 'path' | 'serial'
/** awaiting_connection: added, never connected (or re-paired). online: seen within a minute. */
export type DeviceConnection = 'awaiting_connection' | 'online' | 'offline' | 'disabled' | 'removed'

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

  /** Unpair: the device is removed from GymsEra (Phase 1 does not wipe it). */
  remove: async (id: string): Promise<ApiResponse<{ id: string }>> => {
    const { data } = await apiClient.delete(`/host/devices/${id}`)
    return data
  },
}
