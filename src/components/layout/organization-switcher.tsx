'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useGymAccess } from '@/hooks/use-gym-access'
import { useSelectedOrgStore } from '@/stores/selected-org.store'

/**
 * Organization switcher (Prompt 3B). Shown only to someone who works in more than one
 * organization (the same rule as the mobile app's `needsContextSwitcher`). The choice is
 * sent as X-Tenant-Id and remembered across reloads; the menu, the guards and every page
 * follow it, because they all read the organization from useGymAccess.
 */
export function OrganizationSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const queryClient = useQueryClient()
  const { organizations, organization } = useGymAccess()
  const select = useSelectedOrgStore((s) => s.select)

  if (collapsed || organizations.length < 2) return null

  const change = (tenantId: string) => {
    select(tenantId)
    // Nothing cached for the previous organization may be shown for the new one. The context
    // itself lists them all and does not depend on the choice, so it stays.
    queryClient.resetQueries({ predicate: (q) => q.queryKey[0] !== 'me-context' })
  }

  return (
    <div className="border-b border-sidebar-border px-4 py-3">
      <label htmlFor="organization-switcher" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/40">
        Organization
      </label>
      <select
        id="organization-switcher"
        className="h-9 w-full rounded-md border border-sidebar-border bg-sidebar px-2 text-sm text-sidebar-foreground"
        value={organization?.tenantId ?? ''}
        onChange={(e) => change(e.target.value)}
      >
        {organizations.map((o) => (
          <option key={o.tenantId} value={o.tenantId}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  )
}
