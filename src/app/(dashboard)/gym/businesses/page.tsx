'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, FileText, GitBranch, Plus } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { EmptyState } from '@/components/features/empty-state'
import { ErrorState } from '@/components/features/error-state'
import { StatusBadge } from '@/components/features/status-badge'
import { AddBusinessDialog } from '@/components/features/add-business-dialog'
import { AddBranchDialog } from '@/components/features/branches/add-branch-dialog'
import { BusinessDocumentsDialog } from '@/components/features/businesses/business-documents-dialog'
import { NextStepBanner } from '@/components/features/businesses/next-step-banner'
import { GET_VERIFIED_PROMPT, VerifiedCheck } from '@/components/features/businesses/verified-check'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useBranchQuota } from '@/hooks/use-branch-quota'
import { useGymAccess } from '@/hooks/use-gym-access'
import { useToast } from '@/hooks/use-toast'
import { hostApi, type Business, type HostBranch } from '@/lib/api/host'
import { MISSING_LABEL, addBusinessBlockedMessage, businessChip, canReceiveBranches } from '@/lib/branches/rules'

const CHIP_CLASS: Record<string, string> = {
  ok: 'border-success/50 bg-success/10 text-success',
  warning: 'border-warning/50 bg-warning/10 text-warning',
  danger: 'border-destructive/50 bg-destructive/10 text-destructive',
  info: 'border-primary/40 bg-primary/10 text-primary',
}

function BusinessCard({ business, onAddBranch, onDocuments }: {
  business: Business
  onAddBranch: (b: Business) => void
  onDocuments: (b: Business) => void
}) {
  const branchesQuery = useQuery({
    queryKey: ['branches', `business:${business.id}`],
    queryFn: () => hostApi.getBusinessBranches(business.id),
  })
  const branches: HostBranch[] = branchesQuery.data?.data?.branches ?? []
  const chip = businessChip(business)
  const missing = business.missingForApproval ?? []

  return (
    <Card data-testid={`business-card-${business.id}`}>
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              {business.name}
              <VerifiedCheck verified={business.businessVerified} />
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className={CHIP_CLASS[chip.tone]} data-testid="business-chip">{chip.label}</Badge>
              <span className="text-xs text-muted-foreground">
                {business.branchCount ?? branches.length} branch{(business.branchCount ?? branches.length) === 1 ? '' : 'es'}
              </span>
            </div>
            {!business.businessVerified && (
              <p className="text-xs text-muted-foreground" data-testid="get-verified">{GET_VERIFIED_PROMPT}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => onDocuments(business)}>
              <FileText className="mr-2 h-4 w-4" /> Documents
            </Button>
            <Link href={`/gym/profile?business=${business.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>Edit business</Link>
            {canReceiveBranches(business) && (
              <Button size="sm" onClick={() => onAddBranch(business)}>
                <Plus className="mr-2 h-4 w-4" /> Add Branch
              </Button>
            )}
          </div>
        </div>

        {missing.length > 0 && (
          <p className="text-sm text-warning" data-testid="missing-for-approval">
            Needed for approval: {missing.map((m) => MISSING_LABEL[m] ?? m).join(', ')}.
          </p>
        )}
        {business.status?.toUpperCase() === 'REJECTED' && business.rejectionReason && (
          <p className="text-sm text-destructive">Needs changes: {business.rejectionReason}</p>
        )}
        {business.heldFirstBranch && (
          <p className="text-sm text-muted-foreground" data-testid="held-first-branch">
            The first branch opens when GymsEra approves this business.
          </p>
        )}

        {branchesQuery.isLoading ? (
          <Skeleton className="h-10 rounded-md" />
        ) : branches.length > 0 ? (
          <ul className="divide-y rounded-lg border" aria-label={`Branches of ${business.name}`}>
            {branches.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <Link href={`/gym/branches/${b.id}`} className="flex items-center gap-2 font-medium hover:underline">
                  <GitBranch className="h-4 w-4 text-muted-foreground" /> {b.branchName}
                </Link>
                <StatusBadge status={b.status} />
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  )
}

/**
 * Businesses (enterprise spec §4 / D9): the organization header with the plan pool, one card per
 * business with its branches and status, Add Business at the top and Add Branch inside each approved
 * business. Owner only (the /host routes).
 */
export default function BusinessesPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { isOrganizationOwner, myOrganization } = useGymAccess()
  const [addBusinessOpen, setAddBusinessOpen] = useState(false)
  const [addBranchFor, setAddBranchFor] = useState<Business | null>(null)
  const [documentsFor, setDocumentsFor] = useState<Business | null>(null)

  const businessesQuery = useQuery({
    queryKey: ['host-businesses'],
    queryFn: () => hostApi.getBusinesses(),
    enabled: isOrganizationOwner,
  })
  const businessQuotaQuery = useQuery({
    queryKey: ['business-quota'],
    queryFn: () => hostApi.getBusinessQuota(),
    enabled: isOrganizationOwner,
    retry: false,
  })
  const branchQuota = useBranchQuota(isOrganizationOwner)

  const businesses = businessesQuery.data?.data ?? []
  const pool = branchQuota.data?.data?.pool ?? businessQuotaQuery.data?.data?.pool
  const canAdd = businessQuotaQuery.data?.data?.canAddBusiness ?? true
  const blockedMessage = canAdd ? null : addBusinessBlockedMessage(businessQuotaQuery.data?.data?.blockingBusinessStatus)

  if (!isOrganizationOwner) {
    return (
      <>
        <Header title="Businesses" />
        <div className="p-6">
          <EmptyState icon={Building2} title="Only the owner manages businesses" description="Ask the owner of this organization to add a business or a branch." />
        </div>
      </>
    )
  }

  return (
    <>
      <Header title="Businesses" description="Your organization, its businesses and their branches" />
      <div className="space-y-6 p-6 animate-fade-in">
        <PageHeader
          title={myOrganization?.organizationName || 'Your organization'}
          description={pool ? `${pool.used} of ${pool.max} branches used${pool.reserved ? `, ${pool.reserved} reserved` : ''}` : 'Businesses and branches'}
          action={
            <Button disabled={!canAdd} onClick={() => setAddBusinessOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add Business
            </Button>
          }
        />
        {blockedMessage && <p className="-mt-3 text-right text-xs text-muted-foreground" data-testid="add-business-blocked">{blockedMessage}</p>}
        <NextStepBanner businesses={businesses} onUpload={setDocumentsFor} />

        {businessesQuery.error ? (
          <ErrorState error={businessesQuery.error} what="your businesses" onRetry={() => businessesQuery.refetch()} />
        ) : businessesQuery.isLoading ? (
          <div className="space-y-4">{[1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-lg" />)}</div>
        ) : businesses.length === 0 ? (
          <EmptyState icon={Building2} title="No business yet" description="Add your first business to start." />
        ) : (
          <div className="space-y-4">
            {businesses.map((b) => (
              <BusinessCard key={b.id} business={b} onAddBranch={setAddBranchFor} onDocuments={setDocumentsFor} />
            ))}
          </div>
        )}
      </div>

      <AddBusinessDialog
        open={addBusinessOpen}
        onOpenChange={setAddBusinessOpen}
        onCreated={() => toast({ title: 'Business submitted for review', description: 'Its first branch opens once GymsEra approves it.' })}
      />
      <AddBranchDialog
        open={!!addBranchFor}
        onOpenChange={(o) => !o && setAddBranchFor(null)}
        businesses={businesses}
        defaultBusinessId={addBranchFor?.id}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['branches'] })
          toast({ title: 'Branch created' })
        }}
      />
      <BusinessDocumentsDialog business={documentsFor} open={!!documentsFor} onOpenChange={(o) => !o && setDocumentsFor(null)} />
    </>
  )
}
