// NEW-110 (part of BUG-16): nothing of the previous person may survive a CMS logout: not the
// organization they picked in the switcher (kept in localStorage), not the query cache.
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { clearQueryCacheOnSignOut } from '@/providers/clear-cache-on-sign-out'
import { useAuthStore } from '@/stores/auth.store'
import { useSelectedOrgStore } from '@/stores/selected-org.store'
import type { User } from '@/types'

const userA = { id: 'user-a', email: 'a@test.example', fullName: 'Owner A', role: 'GYM_HOST' } as unknown as User
const userB = { id: 'user-b', email: 'b@test.example', fullName: 'Owner B', role: 'GYM_HOST' } as unknown as User

describe('NEW-110: CMS logout clears per-user state', () => {
  it('forgets the organization owner A picked', () => {
    useAuthStore.getState().setAuth(userA, 'access-a', 'refresh-a')
    useSelectedOrgStore.getState().select('tenant-of-a')
    expect(localStorage.getItem('gymsera_selected_tenant')).toBe('tenant-of-a')

    useAuthStore.getState().logout()

    expect(useSelectedOrgStore.getState().tenantId).toBeNull()
    expect(localStorage.getItem('gymsera_selected_tenant')).toBeNull()
  })

  it('empties the query cache on logout and on a switch to another account', () => {
    useAuthStore.getState().setAuth(userA, 'access-a', 'refresh-a')
    const queryClient = new QueryClient()
    const unsubscribe = clearQueryCacheOnSignOut(queryClient)

    queryClient.setQueryData(['team'], [{ fullName: "A's manager" }])
    useAuthStore.getState().setAuth(userB, 'access-b', 'refresh-b')
    expect(queryClient.getQueryData(['team'])).toBeUndefined()

    queryClient.setQueryData(['team'], [{ fullName: "B's manager" }])
    useAuthStore.getState().logout()
    expect(queryClient.getQueryData(['team'])).toBeUndefined()
    unsubscribe()
  })
})
