import type { QueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'

/**
 * Empties the React Query cache when the signed-in person goes away or changes
 * (NEW-110). Today every CMS logout also reloads the page, which drops the cache;
 * this keeps that true for any logout or account switch that does not reload.
 * Every logout path goes through the auth store, so one subscription covers them.
 *
 * @returns unsubscribe
 */
export function clearQueryCacheOnSignOut(queryClient: QueryClient): () => void {
  return useAuthStore.subscribe((state, prev) => {
    const signedOut = prev.isAuthenticated && !state.isAuthenticated
    const switched = !!prev.user && !!state.user && prev.user.id !== state.user.id
    if (signedOut || switched) queryClient.clear()
  })
}
