import { create } from 'zustand'

/**
 * The organization the person chose in the switcher (Prompt 3B).
 *
 * "Organization" here is what GET /me/context calls one: a gym the signed-in person
 * works in. It is sent to the server as the X-Tenant-Id header, the way the mobile team
 * workspace does (team_repository.dart `_tenantHeader`), and kept in localStorage so a
 * reload keeps the choice. A stored id that is no longer in the person's context is
 * dropped (see `reconcile`), so a stale choice can never be sent to the server.
 */
const STORAGE_KEY = 'gymsera_selected_tenant'

const read = (): string | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

const write = (tenantId: string | null) => {
  try {
    if (typeof window === 'undefined') return
    if (tenantId) window.localStorage.setItem(STORAGE_KEY, tenantId)
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // storage blocked: the choice simply lasts until reload
  }
}

interface SelectedOrgState {
  /** The validated choice; null means "no explicit choice" (the server picks the most senior). */
  tenantId: string | null
  select: (tenantId: string | null) => void
  /** Keep the stored choice only if it is one of the person's organizations. */
  reconcile: (organizationIds: string[]) => void
}

export const useSelectedOrgStore = create<SelectedOrgState>((set) => ({
  tenantId: null,
  select: (tenantId) => {
    write(tenantId)
    set({ tenantId })
  },
  reconcile: (organizationIds) => {
    const stored = read()
    if (stored && organizationIds.includes(stored)) {
      set({ tenantId: stored })
      return
    }
    if (stored) write(null)
    set({ tenantId: null })
  },
}))
