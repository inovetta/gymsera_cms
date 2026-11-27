'use client'

import { Card, CardContent } from '@/components/ui/card'
import type { Organization, OrganizationBusiness } from '@/types'
import { BusinessReviewPanel } from './business-review-panel'

const REVIEWABLE_ORGANIZATION = ['PENDING_REVIEW', 'UNDER_REVIEW', 'REJECTED', 'APPROVED']

/** The organization's first business: the earliest one created (one business id, F7). */
export function firstBusinessOf(organization: Pick<Organization, 'businesses'>): OrganizationBusiness | null {
  const list = [...(organization.businesses ?? [])]
  list.sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')))
  return list[0] ?? null
}

/**
 * Enterprise spec §5 (D10): a new host needs two approvals, the organization (header above) and its
 * first business. This shows the second one on the same page, under the organization, until the
 * business is approved. The API creates the business when the organization is approved, so until then
 * this only says what comes next.
 */
export function FirstBusinessApproval({ organization, organizationId }: { organization: Organization; organizationId: string }) {
  const first = firstBusinessOf(organization)
  const status = String(organization.status ?? '').toUpperCase()

  if (!first) {
    if (!REVIEWABLE_ORGANIZATION.includes(status)) return null
    return (
      <Card data-testid="first-business-approval">
        <CardContent className="p-4 text-sm">
          <p className="font-medium">First business{organization.firstBusinessName ? `: ${organization.firstBusinessName}` : ''}</p>
          <p className="mt-1 text-muted-foreground">
            Approve the organization first. GymsEra then creates this business and its approval appears here: it needs
            proof of premises, which the host uploads after the organization is approved, and 3 photos.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (String(first.status ?? '').toUpperCase() === 'ACTIVE') return null
  return (
    <section className="space-y-2" data-testid="first-business-approval">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">First business</p>
      <BusinessReviewPanel businessId={first.id} organizationId={organizationId} />
    </section>
  )
}
