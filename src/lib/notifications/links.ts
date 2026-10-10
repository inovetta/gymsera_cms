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
  let link = deepLink.trim()
  if (!link.startsWith('/')) return null

  // `/admin/tenants/[tenantId]` is a template the server fills from metadataJson.tenantId.
  if (link.includes('[tenantId]')) {
    const tenantId = metadata && typeof metadata.tenantId === 'string' ? metadata.tenantId : null
    if (!tenantId) return null
    link = link.replace('[tenantId]', tenantId)
  }

  const [path] = link.split('?')

  if (path === '/host/today' || path === '/staff/dashboard') return '/dashboard'
  if (path === '/host/subscriptions') return '/gym/subscriptions'
  if (path === '/host/approvals') return '/gym/approvals'
  if (path === '/host/branches' || path === '/host/gyms') {
    return link.includes('tab=subscriptions') ? '/gym/subscriptions' : '/gym/branches'
  }
  if (path === '/host/listings' || path === '/host/profile') return '/gym/profile'
  if (/^\/host\/gyms\/[^/]+\/staff(-requests)?$/.test(path)) return '/gym/team'
  if (path === '/notifications') return '/notifications'

  // Already a CMS route.
  if (/^\/(gym|admin|settings)\//.test(path) || path === '/dashboard') return link

  return null
}
