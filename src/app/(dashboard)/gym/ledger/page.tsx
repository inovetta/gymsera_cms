'use client'

import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Lock, NotebookPen, Wallet } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { EmptyState } from '@/components/features/empty-state'
import { NoAccess } from '@/components/features/no-access'
import { SubmittedForApprovalNotice } from '@/components/features/approvals/submitted-for-approval-notice'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  AdjustmentType,
  LedgerCollector,
  LedgerDayView,
  LedgerRangeView,
  LedgerTotals,
  isAllBranchesView,
  ledgerApi,
} from '@/lib/api/ledger'
import { ApprovalOutcome, readApprovalOutcome } from '@/lib/api/approvals'
import { newIdempotencyKey } from '@/lib/api/idempotency'
import { describeRequestError } from '@/lib/api/request-errors'
import { formatMoney, parseAmountInput, toApiAmount, toMinor } from '@/lib/money'
import { holdsAtBranch, holdsPermission } from '@/lib/access/menu'
import { tierAt } from '@/lib/access/tier'
import { useGymAccess } from '@/hooks/use-gym-access'
import { useToast } from '@/hooks/use-toast'

type LedgerTab = 'today' | 'open' | 'weekly' | 'monthly'

const ADJUSTMENT_TYPES: { value: AdjustmentType; label: string }[] = [
  { value: 'DISCREPANCY_NOTE', label: 'Discrepancy note' },
  { value: 'VARIANCE_ADJUSTMENT', label: 'Variance adjustment' },
  { value: 'REVERSAL', label: 'Reversal' },
  { value: 'MISSED_DAY_RECONCILIATION', label: 'Missed-day reconciliation' },
]

const adjustmentLabel = (type: string) => ADJUSTMENT_TYPES.find((t) => t.value === type)?.label ?? type.replace(/_/g, ' ')

function TotalsGrid({ totals }: { totals: LedgerTotals }) {
  const cells: { label: string; value: number; tone?: string }[] = [
    { label: 'Expected', value: totals.expected },
    { label: 'Collected', value: totals.collected },
    { label: 'Verified', value: totals.verified },
    { label: 'Pending', value: totals.pending },
    { label: 'Variance', value: totals.variance, tone: toMinor(totals.variance) === 0 ? undefined : 'text-destructive' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="ledger-totals">
      {cells.map((c) => (
        <Card key={c.label}>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
            <p className={`mt-1 text-lg font-bold ${c.tone ?? ''}`}>{formatMoney(c.value)}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function ByMethod({ byMethod }: { byMethod: Record<string, number> }) {
  const entries = Object.entries(byMethod)
  if (entries.length === 0) return null
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">By payment method</CardTitle></CardHeader>
      <CardContent className="space-y-1">
        {entries.map(([method, amount]) => (
          <div key={method} className="flex justify-between text-sm">
            <span className="text-muted-foreground">{method.replace(/_/g, ' ')}</span>
            <span className="font-medium">{formatMoney(amount)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

/** Cash per collector against what was expected (PAY-06); the server did the arithmetic. */
function ByCollector({ collectors }: { collectors: LedgerCollector[] }) {
  if (collectors.length === 0) return null
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Cash by collector</CardTitle>
        <CardDescription>Cash handed in against the cash the system expected, per collector and shift.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {collectors.map((c) => {
          const mismatch = toMinor(c.cashCollected) !== toMinor(c.cashExpected)
          return (
            <div key={c.collectorId} className="rounded-md border p-3" data-testid="ledger-collector">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm">{c.collectorName ?? (c.collectorId === 'unknown' ? 'Unknown collector' : c.collectorId)}</p>
                <span className="text-xs text-muted-foreground">{c.count} payment{c.count === 1 ? '' : 's'} · {formatMoney(c.total)}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Cash collected</p>
                  <p className="font-medium">{formatMoney(c.cashCollected)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cash expected</p>
                  <p className="font-medium">{formatMoney(c.cashExpected)}</p>
                </div>
              </div>
              {mismatch && (
                <p className="mt-2 text-xs font-medium text-destructive" role="status">
                  Collected and expected cash do not match.
                </p>
              )}
              {Object.values(c.shifts ?? {}).length > 0 && (
                <ul className="mt-2 space-y-1 border-t pt-2 text-xs text-muted-foreground">
                  {Object.values(c.shifts).map((s) => (
                    <li key={s.shift} className="flex justify-between">
                      <span>Shift {s.shift}</span>
                      <span>{formatMoney(s.cashCollected)} of {formatMoney(s.cashExpected)} · {s.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function PanelSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" data-testid="ledger-loading">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>The ledger did not load</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>{describeRequestError(error, 'Could not load the ledger. Try again.')}</span>
        <Button size="sm" variant="outline" onClick={onRetry}>Try again</Button>
      </AlertDescription>
    </Alert>
  )
}

function RangePanel({ range, title }: { range: LedgerRangeView; title: string }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {title}: {range.fromDate} to {range.toDate}
      </p>
      <TotalsGrid totals={range.totals} />
      {range.branches && range.branches.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">By branch</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {range.branches.map((b) => (
              <div key={b.branchId} className="flex justify-between text-sm">
                <span>{b.branchName}</span>
                <span className="font-medium">{formatMoney(b.totals.collected)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {range.perDay && range.perDay.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Day by day</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {range.perDay.map((d) => (
              <div key={d.businessDate} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  {d.businessDate}
                  <Badge variant={d.status === 'CLOSED' ? 'secondary' : 'outline'}>{d.status === 'CLOSED' ? 'Closed' : 'Open'}</Badge>
                </span>
                <span className="font-medium">{formatMoney(d.collected)} of {formatMoney(d.expected)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <ByMethod byMethod={range.byMethod} />
      <ByCollector collectors={range.byCollector} />
    </div>
  )
}

export default function LedgerPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { organization, contextLoading } = useGymAccess()

  const isOwner = !!organization?.isOwner
  const viewBranches = (organization?.branches ?? []).filter((b) => holdsAtBranch(organization, b.id, 'ledger.today.view'))
  const mayView = holdsPermission(organization, 'ledger.today.view', 'branch')
  const accessKnown = !!organization || !contextLoading

  const [tab, setTab] = useState<LedgerTab>('today')
  const [branchChoice, setBranchChoice] = useState('')
  const [reconcileDate, setReconcileDate] = useState<string | null>(null)
  const [notice, setNotice] = useState<ApprovalOutcome | null>(null)
  const [closeOpen, setCloseOpen] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)
  const [noteType, setNoteType] = useState<AdjustmentType>('DISCREPANCY_NOTE')
  const [noteAmount, setNoteAmount] = useState('')
  const [noteReason, setNoteReason] = useState('')
  const [noteAmountError, setNoteAmountError] = useState<string | null>(null)

  // The owner may look at every branch at once (no branchId); everyone else always names a branch.
  const chosen = viewBranches.find((b) => b.id === branchChoice)?.id
  const branchId: string | undefined = chosen ?? (isOwner ? undefined : viewBranches[0]?.id)
  const allBranches = !branchId
  const ready = mayView && (isOwner || !!branchId)

  const mayWeekly = isOwner || (!!branchId && holdsAtBranch(organization, branchId, 'ledger.weekly.view'))
  const mayMonthly = isOwner || (!!branchId && holdsAtBranch(organization, branchId, 'ledger.monthly.view'))
  const mayAdjust = !!branchId && tierAt(organization, 'ledger.verify', branchId) !== 'OFF'
  const closeTier = branchId ? tierAt(organization, 'ledger.close', branchId) : 'OFF'

  const scopeKey = branchId ?? 'all'
  const todayQuery = useQuery({
    queryKey: ['ledger', 'today', scopeKey],
    queryFn: () => ledgerApi.today(branchId),
    enabled: ready && tab === 'today' && !reconcileDate,
  })
  const dayQuery = useQuery({
    queryKey: ['ledger', 'day', scopeKey, reconcileDate],
    queryFn: () => ledgerApi.day(reconcileDate as string, branchId as string),
    enabled: ready && !!reconcileDate && !!branchId,
  })
  const openQuery = useQuery({
    queryKey: ['ledger', 'open', scopeKey],
    queryFn: () => ledgerApi.openDays(branchId),
    enabled: ready,
  })
  const weeklyQuery = useQuery({
    queryKey: ['ledger', 'weekly', scopeKey],
    queryFn: () => ledgerApi.weekly(branchId),
    enabled: ready && tab === 'weekly' && mayWeekly,
  })
  const monthlyQuery = useQuery({
    queryKey: ['ledger', 'monthly', scopeKey],
    queryFn: () => ledgerApi.monthly(branchId),
    enabled: ready && tab === 'monthly' && mayMonthly,
  })

  const openDays = openQuery.data?.data?.days ?? []

  // One Idempotency-Key per intent; a retry reuses it (REL-01).
  const closeKey = useRef<string | null>(null)
  const noteKey = useRef<{ fingerprint: string; key: string } | null>(null)

  const invalidateLedger = () => queryClient.invalidateQueries({ queryKey: ['ledger'] })

  const closeMutation = useMutation({
    mutationFn: (day: { ledgerDayId: string; businessDate: string }) => {
      closeKey.current = closeKey.current ?? newIdempotencyKey()
      return ledgerApi.closeDay(branchId as string, day, closeKey.current)
    },
    onSuccess: (response) => {
      closeKey.current = null
      setCloseOpen(false)
      setCloseError(null)
      const outcome = readApprovalOutcome(response)
      if (outcome.pending) {
        // Nothing was closed: the request waits for someone to decide it. Never say "done".
        setNotice({ ...outcome, summary: outcome.summary ?? 'Closing this day' })
      } else {
        setNotice(null)
        toast({ title: 'Day closed' })
      }
      invalidateLedger()
    },
    onError: (error) => setCloseError(describeRequestError(error, 'The day was not closed. Reload the ledger and try again.')),
  })

  const noteMutation = useMutation({
    mutationFn: ({ ledgerDayId, minor }: { ledgerDayId: string; minor: number | null }) => {
      const body = {
        branchId: branchId as string,
        type: noteType,
        reason: noteReason.trim(),
        ...(minor !== null ? { amount: toApiAmount(minor) } : {}),
      }
      const fingerprint = JSON.stringify({ ledgerDayId, ...body })
      if (!noteKey.current || noteKey.current.fingerprint !== fingerprint) {
        noteKey.current = { fingerprint, key: newIdempotencyKey() }
      }
      return ledgerApi.addAdjustment(ledgerDayId, body, noteKey.current.key)
    },
    onSuccess: (response) => {
      noteKey.current = null
      setNoteOpen(false)
      setNoteError(null)
      setNoteReason('')
      setNoteAmount('')
      const outcome = readApprovalOutcome(response)
      if (outcome.pending) {
        setNotice({ ...outcome, summary: outcome.summary ?? 'Your adjustment' })
      } else {
        setNotice(null)
        toast({ title: 'Reconciliation note saved' })
      }
      invalidateLedger()
    },
    onError: (error) => setNoteError(describeRequestError(error, 'The note was not saved. Check the details and try again.')),
  })

  const submitNote = (ledgerDayId: string) => {
    setNoteAmountError(null)
    let minor: number | null = null
    const text = noteAmount.trim()
    if (text) {
      const negative = text.startsWith('-')
      const parsed = parseAmountInput(negative ? text.slice(1) : text)
      if (parsed === null) {
        setNoteAmountError('Use digits with at most two decimals, e.g. 250 or -250.50')
        return
      }
      minor = negative ? -parsed : parsed
    }
    if (!noteReason.trim()) return
    noteMutation.mutate({ ledgerDayId, minor })
  }

  if (accessKnown && !mayView) {
    return (
      <>
        <Header title="Ledger" description="Collections, daily close and reconciliation" />
        <div className="p-6"><NoAccess what="the ledger" needs="View today's ledger" /></div>
      </>
    )
  }

  const dayView = (reconcileDate ? dayQuery.data?.data : todayQuery.data?.data) as LedgerDayView | undefined
  const activeQuery = reconcileDate ? dayQuery : todayQuery
  const showingDay = tab === 'today' || !!reconcileDate

  const renderDay = () => {
    if (activeQuery.isLoading) return <PanelSkeleton />
    if (activeQuery.error) return <LoadError error={activeQuery.error} onRetry={() => activeQuery.refetch()} />
    const data = (reconcileDate ? dayQuery.data?.data : todayQuery.data?.data) as LedgerDayView | undefined
    if (!data) return null

    if (isAllBranchesView(data as never)) {
      return <RangePanel range={data as unknown as LedgerRangeView} title="Every branch, today" />
    }
    const view = data as LedgerDayView
    const open = view.ledgerDay.status === 'OPEN'
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{view.businessDate}</h3>
            <Badge variant={open ? 'outline' : 'secondary'}>{open ? 'Open' : 'Closed'}</Badge>
            {view.isMissed && <Badge variant="destructive">Missed</Badge>}
            {reconcileDate && (
              <Button size="sm" variant="ghost" onClick={() => setReconcileDate(null)}>Back to today</Button>
            )}
          </div>
          {open && (
            <div className="flex gap-2">
              {mayAdjust && (
                <Button variant="outline" size="sm" onClick={() => { setNoteError(null); setNoteAmountError(null); setNoteOpen(true) }}>
                  <NotebookPen className="mr-2 h-4 w-4" /> Add note
                </Button>
              )}
              {closeTier !== 'OFF' && (
                <Button size="sm" onClick={() => { setCloseError(null); setCloseOpen(true) }}>
                  <Lock className="mr-2 h-4 w-4" /> {closeTier === 'DIRECT' ? 'Close day' : 'Request close'}
                </Button>
              )}
            </div>
          )}
        </div>

        <TotalsGrid totals={view.totals} />

        {!open && view.ledgerDay.closedAt && (
          <p className="text-xs text-muted-foreground">
            Closed {view.ledgerDay.closedAt.slice(0, 10)}
            {view.ledgerDay.closedExpectedTotal != null && <> · expected {formatMoney(view.ledgerDay.closedExpectedTotal)}</>}
            {view.ledgerDay.closedCollectedTotal != null && <> · collected {formatMoney(view.ledgerDay.closedCollectedTotal)}</>}
            . A closed day is locked: a correction afterwards is a note on an open day.
          </p>
        )}

        <ByMethod byMethod={view.byMethod} />
        <ByCollector collectors={view.byCollector} />

        {view.adjustments.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Reconciliation notes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {view.adjustments.map((a) => (
                <div key={a.id} className="text-sm">
                  <p className="text-xs font-semibold text-primary">
                    {adjustmentLabel(a.type)}
                    {a.amount != null && <> · {formatMoney(a.amount)}</>}
                  </p>
                  <p>{a.reason}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {view.payments.length === 0 ? (
          <EmptyState icon={Wallet} title="No collections on this day" description="Payments collected at this branch on this business date will appear here." />
        ) : (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Collections</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {view.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{p.method.replace(/_/g, ' ')} · {p.status.replace(/_/g, ' ').toLowerCase()}</span>
                  <span className="font-medium">{formatMoney(p.amount)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  const renderOpenDays = () => {
    if (openQuery.isLoading) return <PanelSkeleton />
    if (openQuery.error) return <LoadError error={openQuery.error} onRetry={() => openQuery.refetch()} />
    if (openDays.length === 0) {
      return <EmptyState icon={Lock} title="Nothing waiting to be reconciled" description="Every past business day has been closed." />
    }
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Open days</CardTitle>
          <CardDescription>Past days that were never closed. Review and close each one.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {openDays.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
              <span className="font-medium">
                {d.businessDate}
                {allBranches && d.branchName ? ` · ${d.branchName}` : ''}
              </span>
              {branchId ? (
                <Button size="sm" variant="outline" onClick={() => { setReconcileDate(d.businessDate); setTab('today') }}>
                  Reconcile
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">Choose this branch to reconcile</span>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  const renderRange = (query: typeof weeklyQuery, title: string, allowed: boolean, what: string, needs: string) => {
    if (!allowed) return <NoAccess what={what} needs={needs} />
    if (query.isLoading) return <PanelSkeleton />
    if (query.error) return <LoadError error={query.error} onRetry={() => query.refetch()} />
    return query.data?.data ? <RangePanel range={query.data.data} title={title} /> : null
  }

  const closeDay = dayView && !isAllBranchesView(dayView as never) ? (dayView as LedgerDayView) : null

  return (
    <>
      <Header title="Ledger" description="Collections, daily close and reconciliation" />
      <div className="p-6 animate-fade-in space-y-6">
        <PageHeader
          title="Collection ledger"
          action={
            viewBranches.length > 0 && (isOwner || viewBranches.length > 1) ? (
              <div className="flex items-center gap-2 text-sm">
                <label htmlFor="ledger-branch" className="font-medium">Branch</label>
                <select
                  id="ledger-branch"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={branchId ?? ''}
                  onChange={(e) => { setBranchChoice(e.target.value); setReconcileDate(null); setNotice(null) }}
                >
                  {isOwner && <option value="">All branches</option>}
                  {viewBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            ) : undefined
          }
        />

        {notice && <SubmittedForApprovalNotice summary={notice.summary} />}

        <Tabs value={tab} onValueChange={(v) => { setTab(v as LedgerTab); setReconcileDate(null) }}>
          <TabsList>
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="open">Open days{openDays.length > 0 ? ` (${openDays.length})` : ''}</TabsTrigger>
            {mayWeekly && <TabsTrigger value="weekly">This week</TabsTrigger>}
            {mayMonthly && <TabsTrigger value="monthly">This month</TabsTrigger>}
          </TabsList>
        </Tabs>

        {!accessKnown || (!organization && contextLoading) ? <PanelSkeleton /> : (
          <>
            {showingDay && renderDay()}
            {!showingDay && tab === 'open' && renderOpenDays()}
            {!showingDay && tab === 'weekly' && renderRange(weeklyQuery, 'This week', mayWeekly, 'the weekly ledger', "View weekly ledger")}
            {!showingDay && tab === 'monthly' && renderRange(monthlyQuery, 'This month', mayMonthly, 'the monthly ledger', "View monthly ledger")}
          </>
        )}
      </div>

      {/* Close the day */}
      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{closeTier === 'DIRECT' ? 'Close this day?' : 'Request to close this day?'}</DialogTitle>
            <DialogDescription>
              {closeTier === 'DIRECT'
                ? `Finalizes ${closeDay?.businessDate ?? 'this day'}. Closed days are locked: a correction afterwards is a note, not an edit.`
                : `Sends a request to close ${closeDay?.businessDate ?? 'this day'} for approval. Nothing is closed until someone approves it.`}
            </DialogDescription>
          </DialogHeader>
          {closeError && <p className="text-sm font-medium text-destructive" role="alert">{closeError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseOpen(false)}>Cancel</Button>
            <Button
              loading={closeMutation.isPending}
              onClick={() => closeDay && closeMutation.mutate({ ledgerDayId: closeDay.ledgerDay.id, businessDate: closeDay.businessDate })}
            >
              {closeTier === 'DIRECT' ? 'Close day' : 'Send request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reconciliation note / adjustment (PAY-12): a reason is required */}
      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add reconciliation note</DialogTitle>
            <DialogDescription>
              Notes are append-only: they never change a payment or the day&apos;s stored totals.
              {tierAt(organization, 'ledger.verify', branchId) === 'REQUEST' ? ' Your notes are sent for approval.' : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="note-type">Type</Label>
              <select
                id="note-type"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={noteType}
                onChange={(e) => setNoteType(e.target.value as AdjustmentType)}
              >
                {ADJUSTMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="note-amount">Amount (optional, signed: negative subtracts)</Label>
              <Input id="note-amount" inputMode="decimal" autoComplete="off" placeholder="0" value={noteAmount} onChange={(e) => setNoteAmount(e.target.value)} />
              {noteAmountError && <p className="text-xs text-destructive">{noteAmountError}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="note-reason">Reason *</Label>
              <Textarea id="note-reason" rows={3} value={noteReason} onChange={(e) => setNoteReason(e.target.value)} />
            </div>
            {noteError && <p className="text-sm font-medium text-destructive" role="alert">{noteError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteOpen(false)}>Cancel</Button>
            <Button
              disabled={!noteReason.trim()}
              loading={noteMutation.isPending}
              onClick={() => closeDay && submitNote(closeDay.ledgerDay.id)}
            >
              Save note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
