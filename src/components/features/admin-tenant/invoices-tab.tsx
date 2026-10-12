'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCheck, FileText, Plus, Send } from 'lucide-react'
import { ErrorState } from '@/components/features/error-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { adminApi, PlatformInvoice, CreateInvoicePayload } from '@/lib/api/admin'
import { formatDate, formatCurrency } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

const INVOICE_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  ISSUED: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700',
  OVERDUE: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
}

/** Platform invoices of one tenant. Mounted only while its tab is open (PERF-10). */
export function InvoicesTab({ tenantId }: { tenantId: string }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [createInvoiceDialog, setCreateInvoiceDialog] = useState(false)
  const [updateStatusDialog, setUpdateStatusDialog] = useState<{ open: boolean; invoice: PlatformInvoice | null }>({ open: false, invoice: null })
  const [invoiceForm, setInvoiceForm] = useState<CreateInvoicePayload>({ subtotal: 0, description: '', dueDate: '', status: 'ISSUED' })
  const [newStatus, setNewStatus] = useState('')

  const { data: invoicesData, isLoading: invoicesLoading, error: invoicesError, refetch } = useQuery({
    queryKey: ['admin-tenant-invoices', tenantId],
    queryFn: () => adminApi.getTenantInvoices(tenantId),
  })
  const invoices: PlatformInvoice[] = invoicesData?.data?.invoices ?? []

  const createInvoiceMutation = useMutation({
    mutationFn: (payload: CreateInvoicePayload) => adminApi.createTenantInvoice(tenantId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-invoices', tenantId] })
      setCreateInvoiceDialog(false)
      setInvoiceForm({ subtotal: 0, description: '', dueDate: '', status: 'ISSUED' })
      toast({ title: 'Invoice created' })
    },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to create invoice', variant: 'destructive' }),
  })

  const updateInvoiceMutation = useMutation({
    mutationFn: ({ invoiceId, payload }: { invoiceId: string; payload: any }) =>
      adminApi.updateTenantInvoice(tenantId, invoiceId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-invoices', tenantId] })
      setUpdateStatusDialog({ open: false, invoice: null })
      toast({ title: 'Invoice status updated' })
    },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to update invoice', variant: 'destructive' }),
  })

  const sendReminderMutation = useMutation({
    mutationFn: (invoiceId: string) => adminApi.sendInvoiceReminder(tenantId, invoiceId),
    onSuccess: () => toast({ title: 'Payment reminder sent' }),
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to send reminder', variant: 'destructive' }),
  })

  const sendConfirmationMutation = useMutation({
    mutationFn: (invoiceId: string) => adminApi.sendInvoiceConfirmation(tenantId, invoiceId),
    onSuccess: () => toast({ title: 'Payment confirmation sent' }),
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to send confirmation', variant: 'destructive' }),
  })

  return (
    <>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Platform Invoices</h3>
        <Button onClick={() => setCreateInvoiceDialog(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Create Invoice
        </Button>
      </div>

      {invoicesLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
      ) : invoicesError ? (
        <ErrorState error={invoicesError} what="the invoices" onRetry={() => refetch()} compact />
      ) : !invoices.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No invoices yet. Create the first invoice for this tenant.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv: PlatformInvoice) => (
            <Card key={inv.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="font-mono text-sm font-semibold">{inv.invoiceNo}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${INVOICE_STATUS_COLORS[inv.status] ?? ''}`}>{inv.status}</span>
                    </div>
                    {inv.description && <p className="text-sm text-muted-foreground mb-1.5">{inv.description}</p>}
                    {inv.subscription?.package && (
                      <p className="text-xs text-muted-foreground mb-1.5">Package: {inv.subscription.package.name}</p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Amount: <strong className="text-foreground">{formatCurrency(inv.totalAmount)}</strong></span>
                      {inv.dueDate && <span>Due: {formatDate(inv.dueDate)}</span>}
                      {inv.paidAt && <span className="text-green-600">Paid: {formatDate(inv.paidAt)}</span>}
                      <span>Created: {formatDate(inv.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => { setUpdateStatusDialog({ open: true, invoice: inv }); setNewStatus(inv.status) }}>
                      Update Status
                    </Button>
                    {['ISSUED', 'OVERDUE'].includes(inv.status) && (
                      <Button size="sm" variant="outline" onClick={() => sendReminderMutation.mutate(inv.id)} loading={sendReminderMutation.isPending}>
                        <Send className="h-3.5 w-3.5 mr-1" />
                        Send Reminder
                      </Button>
                    )}
                    {inv.status === 'PAID' && (
                      <Button size="sm" variant="outline" onClick={() => sendConfirmationMutation.mutate(inv.id)} loading={sendConfirmationMutation.isPending}>
                        <CheckCheck className="h-3.5 w-3.5 mr-1" />
                        Send Receipt
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>

  <Dialog open={createInvoiceDialog} onOpenChange={setCreateInvoiceDialog}>
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div>
          <Label className="mb-2 block">Description</Label>
          <Input placeholder="e.g. Monthly subscription — June 2026" value={invoiceForm.description ?? ''} onChange={(e) => setInvoiceForm((p) => ({ ...p, description: e.target.value }))} />
        </div>
        <div>
          <Label className="mb-2 block">Amount (PKR) *</Label>
          <Input type="number" min="0" placeholder="0.00" value={invoiceForm.subtotal || ''} onChange={(e) => setInvoiceForm((p) => ({ ...p, subtotal: Number(e.target.value) }))} />
        </div>
        <div>
          <Label className="mb-2 block">Tax Amount (PKR)</Label>
          <Input type="number" min="0" placeholder="0.00" value={invoiceForm.taxAmount ?? ''} onChange={(e) => setInvoiceForm((p) => ({ ...p, taxAmount: Number(e.target.value) }))} />
        </div>
        <div>
          <Label className="mb-2 block">Due Date</Label>
          <Input type="date" value={invoiceForm.dueDate ?? ''} onChange={(e) => setInvoiceForm((p) => ({ ...p, dueDate: e.target.value }))} />
        </div>
        <div>
          <Label className="mb-2 block">Status</Label>
          <Select value={invoiceForm.status ?? 'ISSUED'} onValueChange={(v: any) => setInvoiceForm((p) => ({ ...p, status: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="ISSUED">Issued</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => setCreateInvoiceDialog(false)}>Cancel</Button>
        <Button onClick={() => createInvoiceMutation.mutate(invoiceForm)} loading={createInvoiceMutation.isPending} disabled={!invoiceForm.subtotal}>Create Invoice</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>


  <Dialog open={updateStatusDialog.open} onOpenChange={(o) => !o && setUpdateStatusDialog({ open: false, invoice: null })}>
    <DialogContent className="max-w-sm">
      <DialogHeader><DialogTitle>Update Invoice Status</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Invoice: <span className="font-mono font-semibold">{updateStatusDialog.invoice?.invoiceNo}</span></p>
        <div>
          <Label className="mb-2 block">New Status</Label>
          <Select value={newStatus} onValueChange={setNewStatus}>
            <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
            <SelectContent>
              {['DRAFT', 'ISSUED', 'PAID', 'OVERDUE', 'CANCELLED'].map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => setUpdateStatusDialog({ open: false, invoice: null })}>Cancel</Button>
        <Button
          onClick={() => updateStatusDialog.invoice && updateInvoiceMutation.mutate({ invoiceId: updateStatusDialog.invoice.id, payload: { status: newStatus as any } })}
          loading={updateInvoiceMutation.isPending}
          disabled={!newStatus}
        >
          Update
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

    </>
  )
}
