'use client'

import { useQuery } from '@tanstack/react-query'
import { hostBillingApi, CatalogPlan } from '@/lib/api/host-billing'

/**
 * BUG-24 (P2) on CMS screens: the hosting tier name for a branch count, from GET /billing/plans,
 * the API's one table (constants/plan-tiers.js). The CMS keeps no copy of the ranges.
 * Returns "Starter Plan"-style labels (mobile HostStatus.planLabel), or null when unknown.
 */
export function useTierLabel(): (branchCount: number | null | undefined) => string | null {
  const { data } = useQuery({
    queryKey: ['billing-catalog'],
    queryFn: () => hostBillingApi.getCatalog(),
    staleTime: 5 * 60_000,
  })
  const raw = data?.data as { plans?: CatalogPlan[] } | CatalogPlan[] | undefined
  const plans: CatalogPlan[] = Array.isArray(raw) ? raw : raw?.plans ?? []
  return (branchCount) => {
    if (branchCount == null) return null
    const tier = plans.find((p) => p.branchCount === branchCount)?.tierName
    return tier ? `${tier} Plan` : null
  }
}

/** "1 branch" / "3 branches". */
export const branchCountLabel = (n: number) => `${n} ${n === 1 ? 'branch' : 'branches'}`
