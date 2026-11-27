import type { ReviewQueueItem } from '@/lib/api/admin'

/** Where a review-queue row opens: the organization, on the business tab for a business row. */
export const reviewQueueHref = (r: Pick<ReviewQueueItem, 'kind' | 'organizationId' | 'businessId'>): string =>
  r.kind === 'BUSINESS' && r.businessId
    ? `/admin/organizations/${r.organizationId}?business=${r.businessId}`
    : `/admin/organizations/${r.organizationId}`
