import { create } from 'zustand'

/**
 * The organization the person chose in the switcher (Prompt 3B).
 *
 * "Organization" here is what GET /me/context calls one: a gym the signed-in person
 * works in. It is sent to the server as the X-Organization-Id header (API contract v2 §1),
 * and kept in localStorage so a
 * reload keeps the choice. A stored id that is no longer in the person's context is
 * dropped (see `reconcile`), so a stale choice can never be sent to the server.
 */
const STORAGE_KEY = 'gymsera_selected_organization'

const read = (): string | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

const write = (organizationId: string | null) => {
  try {
    if (typeof window === 'undefined') return
    if (organizationId) window.localStorage.setItem(STORAGE_KEY, organizationId)
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // storage blocked: the choice simply lasts until reload
  }
}

interface SelectedOrgState {
  /** The validated choice; null means "no explicit choice" (the server picks the most senior). */
  organizationId: string | null
  select: (organizationId: string | null) => void
  /** Keep the stored choice only if it is one of the person's organizations. */
  reconcile: (organizationIds: string[]) => void
}

export const useSelectedOrgStore = create<SelectedOrgState>((set) => ({
  organizationId: null,
  select: (organizationId) => {
    write(organizationId)
    set({ organizationId })
  },
  reconcile: (organizationIds) => {
    const stored = read()
    if (stored && organizationIds.includes(stored)) {
      set({ organizationId: stored })
      return
    }
    if (stored) write(null)
    set({ organizationId: null })
  },
}))
