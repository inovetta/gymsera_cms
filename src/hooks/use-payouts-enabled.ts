'use client'

import { useQuery } from '@tanstack/react-query'
import { appConfigApi } from '@/lib/api/app-config'

export const APP_CONFIG_KEY = ['meta', 'app-config'] as const

/**
 * R-99 (P11d): whether the API offers payouts (GET /meta/app-config `features.payouts`, env
 * PAYOUTS_ENABLED). Only an explicit `true` turns them on: while loading, after an error, or from an
 * older API without the field, payouts stay hidden (the safe default).
 */
export function usePayoutsEnabled(): { payoutsEnabled: boolean; loading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: APP_CONFIG_KEY,
    queryFn: () => appConfigApi.get(),
    staleTime: 60_000,
    retry: false,
  })
  return { payoutsEnabled: data?.data?.features?.payouts === true, loading: isLoading }
}
