'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, Eye } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { DataTable, Column } from '@/components/features/data-table'
import { StatusBadge } from '@/components/features/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { invoicesApi } from '@/lib/api/invoices'
import { Invoice } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils'

export default function InvoicesPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', statusFilter, page],
    queryFn: () => invoicesApi.getInvoices({
      status: statusFilter !== 'all' ? statusFilter : undefined,
      page,
      limit: 20,
    }),
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
      cell: (row) => <span className="font-semibold">{formatCurrency(row.totalAmount)}</span>,
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
          onClick={(e) => { e.stopPropagation(); setSelectedInvoice(row) }}
        >
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ]

  return (
    <>
      <Header title="Invoices" description="View and manage billing invoices" />
      <div className="p-6 animate-fade-in">
        <PageHeader title="Invoices" />

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
              loading={isLoading}
              emptyTitle="No invoices found"
              emptyDescription="No invoices match the current filter"
              page={page}
              totalPages={data?.pagination?.totalPages ?? 1}
              onPageChange={setPage}
            />
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
                  <span>{formatCurrency(selectedInvoice.subtotal)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>{formatCurrency(selectedInvoice.totalAmount)}</span>
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
