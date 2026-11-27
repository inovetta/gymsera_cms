import { useQuery } from '@tanstack/react-query'
import { organizationsApi } from '@/lib/api/organizations'
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
  const selectedOrganizationId = useSelectedOrgStore((s) => s.organizationId)
  const organization = activeOrganization(context, selectedOrganizationId)
  const ownsOrganization = !!organization?.isOwner

  // /organizations/me is owner-only. A host still waiting for approval has no
  // organization in the context yet, so the host flag keeps them in (NEW-46d).
  const hasNoOrganizations = (context?.organizations?.length ?? 0) === 0
  const isOrganizationOwner = ownsOrganization || (isGymHost && hasNoOrganizations)
  const myOrganizationQuery = useQuery({
    queryKey: ['my-organization'],
    queryFn: () => organizationsApi.getMine(),
    enabled: isOrganizationOwner,
    staleTime: 30_000,
  })
  const myOrganization = myOrganizationQuery.data?.data?.organization
  const isOrganizationActive = myOrganization?.status === 'ACTIVE'

  return {
    context,
    organization,
    /** Every organization the person works in (the switcher lists these). */
    organizations: context?.organizations ?? [],
    contextLoading: !!user && !isPlatformAdmin && (contextQuery.isLoading || contextQuery.isFetching),
    contextFailed: contextQuery.isError,
    portalAllowed: isPlatformAdmin || hasPortalAccess(context, user?.role),
    ownsOrganization,
    isOrganizationOwner,
    /** The organization record (GET /organizations/me), owner only. */
    myOrganization,
    myOrganizationLoading: (myOrganizationQuery.isLoading || myOrganizationQuery.isFetching) && isOrganizationOwner,
    isOrganizationActive,
    /** The team role (or "Owner") to show next to the user's name; falls back to the account role. */
    roleLabel: roleLabel(organization, user?.role),
    /** Gym pages are open: the user has a team role or owns an active organization. */
    gymPagesOpen: !!organization && (!ownsOrganization || isOrganizationActive),
  }
}
