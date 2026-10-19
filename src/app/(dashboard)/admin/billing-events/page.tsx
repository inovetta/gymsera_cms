'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, ShieldOff } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { DataTable, Column } from '@/components/features/data-table'
import { EmptyState } from '@/components/features/empty-state'
import { StatusBadge } from '@/components/features/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { adminApi, BillingEvent, BillingEventProvider, BillingEventStatus } from '@/lib/api/admin'
import { httpStatus } from '@/lib/api/request-errors'
import { cn, formatDate, formatRelativeTime } from '@/lib/utils'

// OBS-05: the billing webhook inbox, for platform admins. Read-only. The server never sends the raw provider
// payload and this page has nowhere to show one.

const PROVIDER_LABEL: Record<BillingEventProvider, string> = { APPLE: 'Apple', GOOGLE: 'Google Play', STRIPE: 'Stripe' }

const STATUS_TABS: Array<{ value: 'all' | BillingEventStatus; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'RECEIVED', label: 'Waiting' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'PROCESSED', label: 'Processed' },
  { value: 'IGNORED', label: 'Ignored' },
]

const PAGE_SIZE = 20
const TENANT_PICKER_LIMIT = 100
const ID_PATTERN = /^[0-9a-fA-F-]{36}$/

/** A ?tenantId= link from another page, accepted only if the server would accept it (it answers 422 otherwise). */
const tenantFromLink = (raw: string | null) => (raw && (raw === 'none' || ID_PATTERN.test(raw)) ? raw : '')

function OrganizationCell({ event }: { event: BillingEvent }) {
  if (!event.tenantId) return <span className="text-sm text-muted-foreground">Not matched to an organization</span>
  if (!event.tenantName) return <span className="text-sm text-muted-foreground">Organization {event.tenantId.slice(0, 8)}…</span>
  return (
    <Link href={`/admin/tenants/${event.tenantId}`} className="text-sm font-medium text-primary hover:underline">
      {event.tenantName}
    </Link>
  )
}

const columns: Column<BillingEvent>[] = [
  {
    key: 'received',
    header: 'Received',
    cell: (e) => (
      <time dateTime={e.receivedAt} title={formatDate(e.receivedAt, 'MMM dd, yyyy HH:mm:ss')} className="text-sm text-muted-foreground whitespace-nowrap">
        {formatRelativeTime(e.receivedAt)}
      </time>
    ),
  },
  { key: 'provider', header: 'Provider', cell: (e) => <span className="text-sm">{PROVIDER_LABEL[e.provider] ?? e.provider}</span> },
  {
    key: 'event',
    header: 'Event',
    cell: (e) => (
      <div className="max-w-[260px]">
        <p className="text-sm font-medium truncate" title={e.eventType ?? undefined}>{e.eventType ?? '—'}</p>
        <p className="text-xs font-mono text-muted-foreground truncate" title={e.providerEventId}>{e.providerEventId}</p>
      </div>
    ),
  },
  { key: 'organization', header: 'Organization', cell: (e) => <OrganizationCell event={e} /> },
  {
    key: 'status',
    header: 'Status',
    cell: (e) => (
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={e.status} />
        {e.stuck && <Badge variant="destructive">Needs attention</Badge>}
      </div>
    ),
  },
  { key: 'attempts', header: 'Attempts', className: 'text-right', cell: (e) => <span className="text-sm tabular-nums">{e.attempts}</span> },
  {
    key: 'note',
    header: 'Note',
    cell: (e) =>
      e.lastError ? (
        <span className="line-clamp-2 max-w-[280px] text-xs text-muted-foreground" title={e.lastError}>{e.lastError}</span>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      ),
  },
]

export default function BillingEventsPage() {
  const searchParams = useSearchParams()
  const [tenantId, setTenantId] = useState(() => tenantFromLink(searchParams?.get('tenantId') ?? null))
  const [status, setStatus] = useState<'all' | BillingEventStatus>('all')
  const [page, setPage] = useState(1)

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['billing-events', tenantId, status, page],
    queryFn: () =>
      adminApi.getBillingEvents({
        tenantId: tenantId || undefined,
        status: status === 'all' ? undefined : status,
        page,
        limit: PAGE_SIZE,
      }),
  })

  // The picker is a convenience: if it cannot load, the filter still works for "all" and "not matched".
  const { data: tenantsData } = useQuery({
    queryKey: ['billing-events-tenants'],
    queryFn: () => adminApi.getTenants({ limit: TENANT_PICKER_LIMIT }),
    staleTime: 5 * 60 * 1000,
  })

  if (httpStatus(error) === 403) {
    return (
      <>
        <Header title="Billing events" description="Store and payment notifications, by organization" />
        <div className="p-6 animate-fade-in">
          <div role="alert" data-testid="no-access">
            <EmptyState
              icon={ShieldOff}
              title="Billing events are for platform administrators"
              description="Your account does not have the platform administrator role. If you need access, ask the person who manages GymsEra."
            />
          </div>
        </div>
      </>
    )
  }

  const tenants = tenantsData?.data?.tenants ?? []
  const picked = tenantId && tenantId !== 'none' ? tenantId : null
  const pickedKnown = !picked || tenants.some((t) => t.id === picked)
  const pickedName = data?.data?.find((e) => e.tenantId === picked)?.tenantName
  const filtered = Boolean(tenantId) || status !== 'all'
  const clearFilters = () => {
    setTenantId('')
    setStatus('all')
    setPage(1)
  }

  return (
    <>
      <Header title="Billing events" description="Store and payment notifications, by organization" />
      <div className="p-6 animate-fade-in">
        <PageHeader
          title="Billing event inbox"
          description="Every Apple, Google Play and Stripe notification we receive, and what happened to it."
          action={
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
              Refresh
            </Button>
          }
        />

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="billing-events-organization" className="font-medium">Organization</label>
            <select
              id="billing-events-organization"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={tenantId}
              onChange={(e) => {
                setTenantId(e.target.value)
                setPage(1)
              }}
            >
              <option value="">All organizations</option>
              <option value="none">Not matched to an organization</option>
              {picked && !pickedKnown && <option value={picked}>{pickedName ?? `Organization ${picked.slice(0, 8)}…`}</option>}
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.businessName}</option>
              ))}
            </select>
          </div>
          {tenantsData?.pagination && tenantsData.pagination.total > TENANT_PICKER_LIMIT && (
            <p className="text-xs text-muted-foreground">
              The list shows the first {TENANT_PICKER_LIMIT} organizations. Open this page from an organization&apos;s page to filter by any other.
            </p>
          )}
        </div>

        <Card>
          <CardHeader className="pb-0">
            {/* A filter, not tabs: there is no panel per value, so no tab roles. */}
            <div
              role="group"
              aria-label="Filter by status"
              className="inline-flex h-10 flex-wrap items-center justify-center gap-1 rounded-md bg-muted p-1 text-muted-foreground"
            >
              {STATUS_TABS.map((t) => {
                const pressed = status === t.value
                return (
                  <button
                    key={t.value}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => {
                      setStatus(t.value)
                      setPage(1)
                    }}
                    className={cn(
                      'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      pressed ? 'bg-background text-foreground shadow-sm' : 'hover:text-foreground'
                    )}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <p className="mb-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Needs attention</span> means an event has been waiting more than 10 minutes,
              or has failed 5 times or more. These also raise a platform alert.
            </p>
            <DataTable
              columns={columns}
              data={data?.data ?? []}
              loading={isLoading}
              error={error}
              errorWhat="the billing events"
              onRetry={() => refetch()}
              emptyTitle={filtered ? 'No events match these filters' : 'No billing events yet'}
              emptyDescription={
                filtered
                  ? 'Try another status or organization.'
                  : 'Events appear here as Apple, Google Play and Stripe send them.'
              }
              emptyAction={filtered ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button> : undefined}
              page={page}
              totalPages={data?.pagination?.totalPages ?? 1}
              onPageChange={setPage}
              rowAttrs={(e) => (e.stuck ? { 'data-stuck': 'true', className: 'bg-destructive/5' } : {})}
            />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
