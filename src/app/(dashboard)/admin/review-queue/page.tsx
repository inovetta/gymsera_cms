'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { StatusBadge } from '@/components/features/status-badge'
import { DataTable, Column } from '@/components/features/data-table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { adminApi, type ReviewQueueItem, type ReviewQueueKind } from '@/lib/api/admin'
import { formatDate } from '@/lib/utils'
import { reviewQueueHref } from '@/lib/admin/review-queue'

const PAGE_SIZE = 20

/** A table row: the queue item plus a client-side key (the API sends no row id). */
type QueueRow = ReviewQueueItem & { id: string }

/**
 * The approval queue (enterprise spec §5, gap G1): one row per organization waiting for its
 * identity review and one per business waiting for its own approval, each with its own id
 * (no compound ids, F7). A row opens the organization page, on the business when it is one.
 */
export default function ReviewQueuePage() {
  const router = useRouter()
  const [kind, setKind] = useState<'all' | ReviewQueueKind>('all')
  const [page, setPage] = useState(1)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['review-queue', kind, page],
    queryFn: () => adminApi.getReviewQueue({ page, limit: PAGE_SIZE, kind: kind === 'all' ? undefined : kind }),
  })

  const columns: Column<QueueRow>[] = [
    {
      key: 'kind',
      header: 'Type',
      cell: (r) => <Badge variant="outline">{r.kind === 'ORGANIZATION' ? 'Organization' : 'Business'}</Badge>,
    },
    { key: 'name', header: 'Name', cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
    { key: 'kyc', header: 'Documents', cell: (r) => (r.kycStatus ? <StatusBadge status={r.kycStatus} /> : <span className="text-muted-foreground">—</span>) },
    { key: 'submitted', header: 'Submitted', cell: (r) => <span className="text-sm text-muted-foreground">{r.submittedAt ? formatDate(r.submittedAt) : '—'}</span> },
  ]

  const total = data?.data?.total ?? 0
  return (
    <>
      <Header title="Review queue" description="Organizations and businesses waiting for GymsEra" />
      <div className="p-6 animate-fade-in">
        <PageHeader title="Review queue" description="Approve each organization once, and each business on its own." />
        <Card>
          <CardHeader className="pb-0">
            <Tabs value={kind} onValueChange={(v) => { setKind(v as typeof kind); setPage(1) }}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="ORGANIZATION">Organizations</TabsTrigger>
                <TabsTrigger value="BUSINESS">Businesses</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="pt-4">
            <DataTable
              columns={columns}
              data={(data?.data?.items ?? []).map((r) => ({ ...r, id: `${r.kind}:${r.businessId ?? r.organizationId}` }))}
              loading={isLoading}
              error={error}
              errorWhat="the review queue"
              onRetry={() => refetch()}
              emptyTitle="Nothing to review"
              emptyDescription="No organization or business is waiting."
              page={page}
              totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
              onPageChange={setPage}
              onRowClick={(r) => router.push(reviewQueueHref(r))}
            />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
