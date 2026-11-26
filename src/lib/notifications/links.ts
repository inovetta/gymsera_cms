/**
 * Where a notification's `deepLink` leads in the CMS.
 *
 * The server writes mobile routes (`/host/subscriptions`, `/host/today`, `/staff/dashboard`, …;
 * grep `deepLink:` in gymsera_be/src). Pushing those into the CMS router would open a 404, so
 * each is mapped to the CMS page that shows the same thing. A link with no CMS counterpart (the
 * traveler screens, the host inbox: R-18) returns null: the notification is marked read and the
 * person stays where they are.
 */
export function resolveNotificationPath(
  deepLink: string | null | undefined,
  metadata?: Record<string, unknown> | null
): string | null {
  if (!deepLink) return null
  const link = deepLink.trim()
  if (!link.startsWith('/')) return null

  const [path] = link.split('?')

  // Every deep link the server sends (contract v2 A1 G11). Those without a CMS page return null.
  if (path === '/host/today' || path === '/staff/dashboard') return '/dashboard'
  if (path === '/host/subscriptions') return '/gym/subscriptions'
  if (path === '/host/approvals') return '/gym/approvals'
  // The host tab shown as "Gyms" in the app: member subscriptions to approve.
  if (path === '/host/operations') return '/gym/subscriptions'
  if (path === '/host/branches') return '/gym/branches'
  // business_approved → /host/businesses/<id>; organization_approved (first business waiting for proof of
  // premises) → /host/businesses/<id>/documents: Businesses shows the nextStep banner with the upload.
  if (path === '/host/businesses' || /^\/host\/businesses\/[^/]+(\/documents)?$/.test(path)) return '/gym/businesses'
  if (path === '/host/profile') return '/gym/profile'
  if (/^\/host\/branches\/[^/]+\/staff(-requests)?$/.test(path)) return '/gym/team'
  if (path === '/notifications') return '/notifications'
  // `/admin/organizations/<organizationId>` is filled in by the server; the id is a path segment.
  if (/^\/admin\/organizations\/[^/]+$/.test(path)) return path
  if (path === '/admin/plan-payments') return path

  // Already a CMS route.
  if (/^\/(gym|admin|settings)\//.test(path) || path === '/dashboard') return link

  return null
}
