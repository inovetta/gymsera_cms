import { QueryClient, useQuery } from '@tanstack/react-query'
import { hostApi } from '@/lib/api/host'

/** The ONE query key for tenant-wide branch capacity. Every consumer reads it from here. */
export const BRANCH_QUOTA_KEY = ['branch-quota'] as const

/**
 * Tenant-wide branch capacity (GET /host/branch-quota): maxBranches, activeBranches,
 * buildableBranches, overQuotaCount. One subscription is one shared pool across every
 * organization, so a copy per organization would go stale on its own; the mobile app has
 * the same rule (host_providers.dart `hostBranchQuotaProvider`). Per-organization detail
 * lives under the same key prefix, so invalidating this refreshes it too.
 */
export function useBranchQuota(enabled = true) {
  return useQuery({
    queryKey: BRANCH_QUOTA_KEY,
    queryFn: () => hostApi.getBranchQuota(),
    enabled,
    staleTime: 30_000,
    retry: false,
  })
}

/**
 * Call after anything that changes how much capacity is used: creating, deleting,
 * restoring or moving a branch, creating or deleting an organization. One function, so no
 * call site has to remember which copies exist.
 */
export const invalidateBranchCapacity = (client: QueryClient) =>
  client.invalidateQueries({ queryKey: BRANCH_QUOTA_KEY })
