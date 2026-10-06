import apiClient from './client'
import { ApiResponse } from '@/types'

/**
 * Team & Access API (UX-12).
 *
 * The same endpoints the mobile app calls
 * (gyms_era/lib/features/host/data/repositories/team_repository.dart). The CMS adds
 * `expectedVersion` to both edits so the server can answer 409 `grants_changed`
 * when someone else saved first (RBAC-08).
 */

export interface TeamRoleRef {
  key: string
  name: string
  displayName?: string
  level: number
}

export interface TeamBranchRef {
  id: string
  name: string
}

export type TeamMemberStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED'

export interface TeamMember {
  /** The assignment id — one record per person per place. */
  id: string
  userId: string | null
  email: string | null
  fullName: string | null
  profileImageUrl?: string | null
  role: TeamRoleRef
  scopeType: 'ORG' | 'BRANCH'
  status: TeamMemberStatus
  jobTitle?: string | null
  validUntil?: string | null
  branches: TeamBranchRef[]
  hasCustomAccess: boolean
  overrideCount: number
  version: number
}

export interface PermissionOverride {
  permissionKey: string
  effect: 'ALLOW' | 'DENY'
  dataScope?: string | null
  branchId?: string | null
  constraints?: unknown
}

export interface TeamMemberDetail extends TeamMember {
  overrides: PermissionOverride[]
  /** `['*']` for the owner, otherwise every key the person holds (with `.direct` twins). */
  effectivePermissions: string[]
  effectiveScopes: Record<string, { scope?: string; tier?: string }>
}

export interface RolePresetGrant {
  permissionKey: string
  scope: string
  /** Backend tier code: V view, R request, A approve, D direct, F full. */
  tier: string
}

export interface TeamRole {
  key: string
  level: number
  name: string
  displayName: string
  charter: string
  assignable: boolean
  /** Whether the signed-in user may hand out this role. The server enforces it too. */
  assignableByMe: boolean
  defaultScope: 'ORG' | 'BRANCH'
  permissionCount: number
  preset: RolePresetGrant[]
}

export interface PermissionDef {
  key: string
  label: string
  approvable: boolean
  dangerous: boolean
  orgOnly: boolean
  scopes: string[]
  note?: string | null
}

export interface PermissionModule {
  module: string
  label: string
  permissions: PermissionDef[]
}

export interface GetTeamParams {
  role?: string
  branch?: string
  status?: TeamMemberStatus
  includeRevoked?: boolean
}

export interface InviteMemberPayload {
  email: string
  roleKey: string
  fullName?: string
  jobTitle?: string
  assignToAllBranches: boolean
  branchIds?: string[]
}

export interface InviteMemberResult {
  assignmentId: string
  userId: string
  email: string
  fullName: string | null
  role: TeamRoleRef
  scopeType: 'ORG' | 'BRANCH'
  status: TeamMemberStatus
  /** Only set when a brand new account had to be created. */
  tempPassword: string | null
}

export interface UpdateMemberPayload {
  roleKey?: string
  status?: 'ACTIVE' | 'SUSPENDED'
  jobTitle?: string
  assignToAllBranches?: boolean
  branchIds?: string[]
  expectedVersion: number
}

export const teamApi = {
  getRoles: async (): Promise<ApiResponse<{ roles: TeamRole[]; myLevel: number; isOwner: boolean }>> => {
    const { data } = await apiClient.get('/team/meta/roles')
    return data
  },

  getPermissionCatalogue: async (): Promise<ApiResponse<{ modules: PermissionModule[] }>> => {
    const { data } = await apiClient.get('/team/meta/permissions')
    return data
  },

  getTeam: async (
    params?: GetTeamParams
  ): Promise<ApiResponse<{ team: TeamMember[]; counts: Record<string, number>; total: number }>> => {
    const { data } = await apiClient.get('/team', { params })
    return data
  },

  getMember: async (assignmentId: string): Promise<ApiResponse<TeamMemberDetail>> => {
    const { data } = await apiClient.get(`/team/${assignmentId}`)
    return data
  },

  invite: async (payload: InviteMemberPayload): Promise<ApiResponse<InviteMemberResult>> => {
    const { data } = await apiClient.post('/team/invites', {
      email: payload.email,
      roleKey: payload.roleKey,
      ...(payload.fullName ? { fullName: payload.fullName } : {}),
      ...(payload.jobTitle ? { jobTitle: payload.jobTitle } : {}),
      assignToAllBranches: payload.assignToAllBranches,
      ...(payload.assignToAllBranches ? {} : { branchIds: payload.branchIds ?? [] }),
    })
    return data
  },

  /** Change role, branch scope, status or validity. */
  updateMember: async (
    assignmentId: string,
    payload: UpdateMemberPayload
  ): Promise<ApiResponse<{ id: string; roleKey: string; status: TeamMemberStatus; version: number }>> => {
    const { data } = await apiClient.patch(`/team/${assignmentId}`, payload)
    return data
  },

  /**
   * Replace this person's overrides. The server deletes and re-inserts the whole
   * set, so always send every override, not only the changed ones.
   */
  setPermissions: async (
    assignmentId: string,
    overrides: PermissionOverride[],
    expectedVersion: number
  ): Promise<ApiResponse<TeamMemberDetail>> => {
    const { data } = await apiClient.put(`/team/${assignmentId}/permissions`, { overrides, expectedVersion })
    return data
  },

  /** Withdraw access. The row is kept as REVOKED. */
  revokeMember: async (assignmentId: string): Promise<ApiResponse<null>> => {
    const { data } = await apiClient.delete(`/team/${assignmentId}`)
    return data
  },
}
