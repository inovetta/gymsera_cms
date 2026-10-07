import { useQuery } from '@tanstack/react-query'
import { tenantsApi } from '@/lib/api/tenants'
import { meApi } from '@/lib/api/me'
import { activeOrganization, roleLabel } from '@/lib/access/menu'
import { useSelectedOrgStore } from '@/stores/selected-org.store'
import { hasPortalAccess } from '@/lib/access/portal'
import { useAuth } from '@/hooks/use-auth'

/**
 * What the signed-in user may use in the portal, from their effective permissions
 * (GET /me/context) rather than the account role (NEW-42, NEW-43). One query
 * key, so the menu, the guard and the pages share a single request.
 */
export function useGymAccess() {
  const { user, isPlatformAdmin, isGymHost } = useAuth()

  const contextQuery = useQuery({
    queryKey: ['me-context'],
    queryFn: () => meApi.getContext(),
    enabled: !!user && !isPlatformAdmin,
    staleTime: 30_000,
  })
  const context = contextQuery.data?.data
  const selectedTenantId = useSelectedOrgStore((s) => s.tenantId)
  const organization = activeOrganization(context, selectedTenantId)
  const ownsOrganization = !!organization?.isOwner

  // /tenants/me is owner-only. A host still waiting for approval has no
  // organization in the context yet, so the host flag keeps them in.
  const isTenantOwner = ownsOrganization || isGymHost
  const tenantQuery = useQuery({
    queryKey: ['my-tenant'],
    queryFn: () => tenantsApi.getMyTenant(),
    enabled: isTenantOwner,
    staleTime: 30_000,
  })
  const tenant = tenantQuery.data?.data?.tenant
  const isTenantActive = tenant?.status === 'ACTIVE'

  return {
    context,
    organization,
    /** Every organization the person works in (the switcher lists these). */
    organizations: context?.organizations ?? [],
    contextLoading: !!user && !isPlatformAdmin && contextQuery.isLoading,
    contextFailed: contextQuery.isError,
    portalAllowed: isPlatformAdmin || hasPortalAccess(context, user?.role),
    ownsOrganization,
    isTenantOwner,
    tenant,
    tenantLoading: tenantQuery.isLoading && isTenantOwner,
    isTenantActive,
    /** The team role (or "Owner") to show next to the user's name; falls back to the account role. */
    roleLabel: roleLabel(organization, user?.role),
    /** Gym pages are open: the user has a team role or owns an active organization. */
    gymPagesOpen: !!organization && (!ownsOrganization || isTenantActive),
  }
}
