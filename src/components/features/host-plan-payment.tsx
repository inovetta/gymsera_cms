'use client'

import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, CheckCircle, Clock, CreditCard, Smartphone, Upload, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/features/error-state'
import { hostBillingApi, planPaymentsApi, PlanPaymentCycle, PlanPaymentRequest } from '@/lib/api/host-billing'
import { describeRequestError } from '@/lib/api/request-errors'
import { useTierLabel, branchCountLabel } from '@/hooks/use-tier-names'
import { formatCurrency, formatDate, cn } from '@/lib/utils'

/**
 * Phase 7 P9c item D (R-95): the host pays for a GymsEra plan by bank transfer, the same steps as
 * a traveller's manual payment in the app: choose the plan and the cycle → the platform's bank
 * details and the amount → transfer → upload the receipt → submit. A platform admin approves
 * (the plan is granted) or rejects with a reason. The amount and the period come from the server
 * (catalog); this page never computes a price or a duration.
 */
export const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024
export const PLAN_PAYMENT_COPY = {
  receiptRequired: 'Screenshot proof is required to submit manual bank transfer payment.',
  receiptType: 'Only JPEG, PNG and WebP images are accepted',
  receiptSize: 'File size must not exceed 10 MB',
  pendingTitle: 'Payment sent — waiting for review',
  pendingBody: 'GymsEra checks the transfer and activates your plan. You will get a notification.',
  noBankDetails: 'The bank details are not available here yet. Contact support@gymsera.com for the bank details.',
} as const

const CYCLE_LABEL: Record<PlanPaymentCycle, string> = { MONTHLY: 'Monthly', YEARLY: 'Annual' }

export function HostPlanPayment() {
  const qc = useQueryClient()
  const tierLabel = useTierLabel()
  const fileInput = useRef<HTMLInputElement>(null)
  const [planId, setPlanId] = useState<string | null>(null)
  const [cycle, setCycle] = useState<PlanPaymentCycle>('MONTHLY')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [receiptError, setReceiptError] = useState<string | null>(null)
  const [reference, setReference] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)

  const overview = useQuery({ queryKey: ['host-plan-payments'], queryFn: () => planPaymentsApi.getOverview() })
  // R-86: the platform bank account is read from GET /billing/bank-instructions (the API's env), never typed here.
  const bankQuery = useQuery({ queryKey: ['billing-bank-instructions'], queryFn: () => hostBillingApi.getBankInstructions() })
  const bankInfo = bankQuery.data?.data
  const bankRows: Array<[string, string]> = bankInfo
    ? ([
        ['Bank Name', bankInfo.bankName],
        ['Account Title', bankInfo.accountTitle],
        ['Account Number', bankInfo.accountNumber],
        ['IBAN', bankInfo.iban],
        ['SWIFT', bankInfo.swiftCode],
      ].filter(([, v]) => !!v) as Array<[string, string]>)
    : []
  const data = overview.data?.data

  const send = useMutation({
    mutationFn: () => planPaymentsApi.submit({ billingPlanId: planId!, billingCycle: cycle, proof: receipt!, payerReference: reference.trim() || undefined }),
    onSuccess: () => {
      setReceipt(null)
      setReference('')
      setSubmitError(null)
      qc.invalidateQueries({ queryKey: ['host-plan-payments'] })
    },
    onError: (err) => setSubmitError(describeRequestError(err, 'The payment could not be sent. Please try again.')),
  })

  const planName = (branchCount: number) => tierLabel(branchCount) ?? branchCountLabel(branchCount)

  if (overview.isLoading) return <Skeleton className="h-48 rounded-lg" />
  if (overview.isError || !data) {
    return <ErrorState error={overview.error} what="the plan payment options" onRetry={() => overview.refetch()} compact />
  }

  const bank = data.methods.find((m) => m.key === 'BANK_TRANSFER')
  const plan = data.plans.find((p) => p.id === planId) ?? null
  const terms = plan?.cycles.find((c) => c.cycle === cycle) ?? null
  const latest = data.requests[0] ?? null

  const pick = (file: File | undefined) => {
    setSubmitError(null)
    if (!file) return
    if (!RECEIPT_TYPES.includes(file.type)) { setReceipt(null); setReceiptError(PLAN_PAYMENT_COPY.receiptType); return }
    if (file.size > RECEIPT_MAX_BYTES) { setReceipt(null); setReceiptError(PLAN_PAYMENT_COPY.receiptSize); return }
    setReceiptError(null)
    setReceipt(file)
  }
  const submit = () => {
    if (!planId) { setSubmitError('Choose a plan.'); return }
    if (!receipt) { setReceiptError(PLAN_PAYMENT_COPY.receiptRequired); return }
    send.mutate()
  }

  return (
    <div className="space-y-4" data-testid="host-plan-payment">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Pay by bank transfer</h2>
      </div>

      {latest && latest.status !== 'PENDING' && <LatestResult request={latest} planName={planName} />}

      {data.blocked ? (
        <Card className="border-warning/30 bg-warning/5" data-testid="plan-payment-blocked">
          <CardContent className="p-4 flex items-start gap-3 text-sm">
            <Smartphone className="h-4 w-4 shrink-0 mt-0.5 text-warning" />
            <div className="space-y-1">
              <p>{data.blocked.message}</p>
              {data.blocked.manageUrl && (
                <a className="text-primary underline text-xs" href={data.blocked.manageUrl} target="_blank" rel="noreferrer">Manage the store subscription</a>
              )}
            </div>
          </CardContent>
        </Card>
      ) : data.pending ? (
        <Card className="border-primary/30 bg-primary/5" data-testid="plan-payment-pending">
          <CardContent className="p-4 space-y-1 text-sm">
            <p className="font-medium flex items-center gap-2"><Clock className="h-4 w-4 text-primary" />{PLAN_PAYMENT_COPY.pendingTitle}</p>
            <p className="text-muted-foreground">
              {planName(data.pending.branchCount)} · {CYCLE_LABEL[data.pending.billingCycle]} · {formatCurrency(Number(data.pending.amount), data.pending.currency)} · sent {formatDate(data.pending.createdAt)}
            </p>
            <p className="text-muted-foreground">{PLAN_PAYMENT_COPY.pendingBody}</p>
          </CardContent>
        </Card>
      ) : (
        <>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" />Bank Transfer Details</CardTitle>
            <CardDescription>GymsEra&apos;s account for plan payments</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {bankQuery.isLoading ? (
              <Skeleton className="h-24 rounded-lg" />
            ) : bankQuery.isError ? (
              <ErrorState error={bankQuery.error} what="the bank details" onRetry={() => bankQuery.refetch()} compact />
            ) : bankRows.length === 0 ? (
              <p className="text-muted-foreground">{PLAN_PAYMENT_COPY.noBankDetails}</p>
            ) : (
              <div className="bg-muted p-3 rounded-lg space-y-2 font-mono text-xs" data-testid="plan-payment-bank">
                {bankRows.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{label}:</span>
                    <span className="font-semibold text-right select-all">{value}</span>
                  </div>
                ))}
              </div>
            )}
            {bankInfo?.instructions && <p className="text-xs">{bankInfo.instructions}</p>}
          </CardContent>
        </Card>
        {bank?.available && bankRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" />Choose a plan and pay</CardTitle>
            <CardDescription>Transfer the amount, upload the receipt, and GymsEra activates the plan once the payment is confirmed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            <fieldset className="space-y-2">
              <legend className="font-medium mb-1">1. Plan</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {data.plans.map((p) => (
                  <label key={p.id} className={cn('flex items-center gap-2 rounded-lg border p-3 cursor-pointer', planId === p.id && 'border-primary bg-primary/5')}>
                    <input type="radio" name="plan" value={p.id} checked={planId === p.id} onChange={() => setPlanId(p.id)} />
                    <span className="font-medium">{planName(p.branchCount)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="font-medium mb-1">2. Billing</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(['MONTHLY', 'YEARLY'] as PlanPaymentCycle[]).map((c) => {
                  const t = plan?.cycles.find((x) => x.cycle === c)
                  return (
                    <label key={c} className={cn('flex items-center justify-between gap-2 rounded-lg border p-3 cursor-pointer', cycle === c && 'border-primary bg-primary/5')}>
                      <span className="flex items-center gap-2">
                        <input type="radio" name="cycle" value={c} checked={cycle === c} onChange={() => setCycle(c)} />
                        {CYCLE_LABEL[c]}
                      </span>
                      {t && <span className="font-semibold">{formatCurrency(t.amount, t.currency)}</span>}
                    </label>
                  )
                })}
              </div>
            </fieldset>

            {terms && (
              <div className="rounded-lg bg-muted p-3 space-y-1">
                <p className="font-medium">3. Transfer <span data-testid="plan-payment-amount">{formatCurrency(terms.amount, terms.currency)}</span> to the account in Bank Transfer Details.</p>
                <p className="text-xs text-muted-foreground">
                  {terms.months === 12 ? 'One year' : terms.months === 1 ? 'One month' : `${terms.months} months`} of the plan once approved.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <p className="font-medium">4. Receipt</p>
              <input ref={fileInput} type="file" className="hidden" accept={RECEIPT_TYPES.join(',')} data-testid="plan-receipt-input" onChange={(e) => pick(e.target.files?.[0])} />
              <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />{receipt ? receipt.name : 'Choose receipt image'}
              </Button>
              <p className="text-xs text-muted-foreground">JPEG, PNG or WebP, up to 10 MB.</p>
              {receiptError && <p role="alert" className="text-xs text-destructive">{receiptError}</p>}
              <label className="block text-xs text-muted-foreground">
                Bank reference (optional)
                <input className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm" maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} />
              </label>
            </div>

            {submitError && <p role="alert" className="text-sm text-destructive">{submitError}</p>}
            <Button onClick={submit} loading={send.isPending} disabled={!data.canSubmit}>Submit payment</Button>
          </CardContent>
        </Card>
        )}
        </>
      )}
    </div>
  )
}

function LatestResult({ request, planName }: { request: PlanPaymentRequest; planName: (n: number) => string }) {
  if (request.status === 'APPROVED') {
    return (
      <div className="flex items-start gap-2 text-sm rounded-lg bg-success/10 px-4 py-3" data-testid="plan-payment-approved">
        <CheckCircle className="h-4 w-4 text-success mt-0.5 shrink-0" />
        <span>
          Payment approved: {planName(request.branchCount)} is active
          {request.periodEnd ? ` until ${formatDate(request.periodEnd)}` : ''}.
        </span>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-2 text-sm rounded-lg bg-destructive/10 px-4 py-3" data-testid="plan-payment-rejected">
      <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
      <span>
        Your last payment ({formatCurrency(Number(request.amount), request.currency)}, sent {formatDate(request.createdAt)}) was not approved
        {request.rejectionReason ? `: ${request.rejectionReason}` : ''}. You can send a new one below.
        <Badge variant="outline" className="ml-2 text-xs">Rejected</Badge>
      </span>
    </div>
  )
}
