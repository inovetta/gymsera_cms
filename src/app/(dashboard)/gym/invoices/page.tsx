'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Eye, AlertCircle } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { DataTable, Column } from '@/components/features/data-table'
import { StatusBadge } from '@/components/features/status-badge'
import { NoAccess } from '@/components/features/no-access'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { invoicesApi } from '@/lib/api/invoices'
import { Invoice } from '@/types'
import { formatDate } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import { describeRequestError } from '@/lib/api/request-errors'
import { holdsAtBranch, holdsPermission } from '@/lib/access/menu'
import { useAuth } from '@/hooks/use-auth'
import { useGymAccess } from '@/hooks/use-gym-access'

export default function InvoicesPage() {
  const { isGymHost } = useAuth()
  const { organization, contextLoading } = useGymAccess()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [branchChoice, setBranchChoice] = useState('')

  // The invoice list answers with the caller's OWN invoices unless a branch is named and the
  // caller holds invoices.view there (payments.controller.js#listInvoices: `isHost` is resolved
  // per branch). So a team member always sends a branch; only the owner may leave it on
  // "all branches". The mobile invoices tile always sends one too.
  const listsAll = !!organization?.isOwner || isGymHost
  const branchOptions = (organization?.branches ?? []).filter((b) => holdsAtBranch(organization, b.id, 'invoices.view'))
  const chosen = branchOptions.find((b) => b.id === branchChoice)?.id
  const branchId = chosen ?? (listsAll ? undefined : branchOptions[0]?.id)
  const mayView = listsAll || holdsPermission(organization, 'invoices.view', 'branch')
  const accessKnown = !!organization || !contextLoading

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['invoices', statusFilter, page, branchId ?? 'all'],
    queryFn: () => invoicesApi.getInvoices({
      status: statusFilter !== 'all' ? statusFilter : undefined,
      ...(branchId ? { branchId } : {}),
      page,
      limit: 20,
    }),
    enabled: mayView && !!organization && (listsAll || !!branchId),
  })

  const columns: Column<Invoice>[] = [
    {
      key: 'invoiceNo',
      header: 'Invoice #',
      cell: (row) => <span className="font-mono font-medium text-sm text-primary">{row.invoiceNo}</span>,
    },
    {
      key: 'member',
      header: 'Member',
      cell: (row) => (
        <div>
          <p className="font-medium text-sm">{row.user?.fullName ?? '—'}</p>
          <p className="text-xs text-muted-foreground">{row.user?.email}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      cell: (row) => <span className="text-sm text-muted-foreground">{row.invoiceType}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      cell: (row) => <span className="font-semibold">{formatMoney(row.totalAmount)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'date',
      header: 'Issued',
      cell: (row) => <span className="text-sm text-muted-foreground">{formatDate(row.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      cell: (row) => (
        <Button
          variant="ghost"
          size="icon-sm"
          title="View invoice"
          onClick={(e) => { e.stopPropagation(); setSelectedInvoice(row) }}
        >
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ]

  if (accessKnown && !mayView) {
    return (
      <>
        <Header title="Invoices" description="View and manage billing invoices" />
        <div className="p-6"><NoAccess what="invoices" needs="View invoices" /></div>
      </>
    )
  }

  return (
    <>
      <Header title="Invoices" description="View and manage billing invoices" />
      <div className="p-6 animate-fade-in">
        <PageHeader title="Invoices" />

        {(branchOptions.length > 1 || (listsAll && branchOptions.length > 0)) && (
          <div className="mb-4 flex items-center gap-2 text-sm">
            <label htmlFor="invoices-branch" className="font-medium">Branch</label>
            <select
              id="invoices-branch"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={branchId ?? ''}
              onChange={(e) => { setBranchChoice(e.target.value); setPage(1) }}
            >
              {listsAll && <option value="">All branches</option>}
              {branchOptions.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>The invoices did not load</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>{describeRequestError(error, 'Could not load invoices. Try again.')}</span>
              <Button size="sm" variant="outline" onClick={() => refetch()}>Try again</Button>
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader className="pb-0">
            <Tabs value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="ISSUED">Issued</TabsTrigger>
                <TabsTrigger value="PAID">Paid</TabsTrigger>
                <TabsTrigger value="OVERDUE">Overdue</TabsTrigger>
                <TabsTrigger value="CANCELLED">Cancelled</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="pt-4">
            <DataTable
              columns={columns}
              data={(data?.data?.invoices ?? []) as Invoice[]}
              loading={isLoading || (!organization && contextLoading)}
              emptyTitle="No invoices found"
              emptyDescription="No invoices match the current filter"
              page={page}
              totalPages={data?.pagination?.totalPages ?? 1}
              onPageChange={setPage}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              Invoice numbers run in order for each branch. A cancelled invoice keeps its number.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Invoice Detail Dialog */}
      <Dialog open={!!selectedInvoice} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invoice {selectedInvoice?.invoiceNo}</DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="flex justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Member</p>
                  <p className="font-medium">{selectedInvoice.user?.fullName ?? '—'}</p>
                  <p className="text-sm text-muted-foreground">{selectedInvoice.user?.email}</p>
                </div>
                <StatusBadge status={selectedInvoice.status} />
              </div>
              <Separator />
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Type</span>
                  <span>{selectedInvoice.invoiceType}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatMoney(selectedInvoice.subtotal)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>{formatMoney(selectedInvoice.totalAmount)}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Issued</p>
                  <p>{formatDate(selectedInvoice.createdAt)}</p>
                </div>
                {selectedInvoice.dueDate && (
                  <div>
                    <p className="text-muted-foreground">Due Date</p>
                    <p>{formatDate(selectedInvoice.dueDate)}</p>
                  </div>
                )}
                {selectedInvoice.paidAt && (
                  <div>
                    <p className="text-muted-foreground">Paid At</p>
                    <p>{formatDate(selectedInvoice.paidAt)}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
