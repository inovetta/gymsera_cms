'use client'

import { useState } from 'react'
import { BusinessStrip } from '@/components/features/business-strip'
import { BusinessTab } from '@/components/features/business-tab'
import type { Organization } from '@/types'
import { BusinessReviewPanel } from './business-review-panel'

/**
 * Admin › Organization › Businesses (enterprise spec §5): every business of the organization with
 * its own approval, documents and Verified badge, then its public details. One business id (F7).
 */
export function BusinessesTab({ organization, organizationId, initialBusinessId }: {
  organization: Organization
  organizationId: string
  initialBusinessId?: string | null
}) {
  const businesses = organization.businesses ?? []
  const [selected, setSelected] = useState<string | undefined>(initialBusinessId ?? undefined)
  const businessId = businesses.find((b) => b.id === selected)?.id ?? businesses[0]?.id ?? null

  return (
    <div className="space-y-4">
      {businesses.length > 1 && <BusinessStrip businesses={businesses} selectedId={businessId ?? undefined} onSelect={setSelected} />}
      {businessId && <BusinessReviewPanel key={businessId} businessId={businessId} organizationId={organizationId} />}
      <BusinessTab
        organizationId={organizationId}
        businessId={businessId}
        defaultName={organization.firstBusinessName ?? organization.organizationName ?? ''}
      />
    </div>
  )
}
