import apiClient from './client'
import { ApiResponse } from '@/types'

/**
 * GET /me/context — the signed-in user's organizations, branches and effective
 * permissions. The same call the mobile app makes
 * (gyms_era/lib/features/me/data/repositories/workspace_repository.dart).
 *
 * The CMS uses it to decide what to show. The server still decides what is allowed.
 */

export interface BranchAccess {
  id: string
  name: string
  /** `['*']` for the owner, otherwise every key held at this branch. */
  permissions: string[]
}

export interface OrgMembership {
  tenantId: string
  name: string
  isOwner: boolean
  role: { key: string; name: string; displayName?: string; level: number }
  scopeType: 'ORG' | 'BRANCH'
  /** Org-wide grants. Empty for someone assigned to branches only. */
  orgPermissions: string[]
  branches: BranchAccess[]
  pendingApprovals: number
}

export interface MyContext {
  user: { id: string; fullName: string; email?: string; isHost?: boolean; platformRole?: string }
  organizations: OrgMembership[]
  pendingApprovals: number
  needsContextSwitcher: boolean
}

export const meApi = {
  getContext: async (): Promise<ApiResponse<MyContext>> => {
    const { data } = await apiClient.get('/me/context')
    return data
  },
}
