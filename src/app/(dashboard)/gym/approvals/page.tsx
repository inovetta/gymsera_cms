'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ClipboardCheck, Clock, Inbox, ShieldAlert, Store, User, Wallet } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { EmptyState } from '@/components/features/empty-state'
import { ConfirmDialog } from '@/components/features/confirm-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { approvalsApi, ApprovalRequest, APPROVALS_WAITING_KEY } from '@/lib/api/approvals'
import { teamErrorMessage } from '@/lib/team/access'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const APPROVALS_MINE_KEY = ['approvals', 'mine'] as const

const STATUS: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'text-warning' },
  APPROVED: { label: 'Approved', className: 'text-success' },
  REJECTED: { label: 'Rejected', className: 'text-destructive' },
  EXPIRED: { label: 'Expired', className: 'text-muted-foreground' },
  CANCELLED: { label: 'Cancelled', className: 'text-muted-foreground' },
}

const ageLabel = (createdAt: string) => {
  const minutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000)
  if (!Number.isFinite(minutes) || minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h ago`
  return `${Math.floor(minutes / (60 * 24))}d ago`
}

/**
 * Approvals — the other half of the "Needs approval" loop (UX-13). The mobile
 * Approvals inbox: decisions waiting on you, and the requests you raised.
 */
function ApprovalsPageContent() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState(searchParams?.get('tab') === 'mine' ? 'mine' : 'waiting')
  const [rejectTarget, setRejectTarget] = useState<ApprovalRequest | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [withdrawTarget, setWithdrawTarget] = useState<ApprovalRequest | null>(null)
  const [decisionError, setDecisionError] = useState<string | null>(null)

  const waitingQuery = useQuery({
    queryKey: APPROVALS_WAITING_KEY,
    queryFn: () => approvalsApi.list('PENDING'),
    retry: false,
  })
  const mineQuery = useQuery({ queryKey: APPROVALS_MINE_KEY, queryFn: () => approvalsApi.mine(), retry: false })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['approvals'] })

  const decideMutation = useMutation({
    mutationFn: ({ request, reason }: { request: ApprovalRequest; reason?: string }) =>
      reason === undefined ? approvalsApi.approve(request.id) : approvalsApi.reject(request.id, reason),
    onSuccess: (_res, { reason }) => {
      setRejectTarget(null)
      setDecisionError(null)
      refresh()
      toast({ title: reason === undefined ? 'Approved' : 'Rejected' })
    },
    onError: (err) => {
      // The server re-checks at decision time (RBAC-04): the request may already be
      // decided, the approver may have lost the right, or the requester may be gone.
      // Say why, and reload so a card that can no longer be decided is not left behind.
      setRejectTarget(null)
      setDecisionError(teamErrorMessage(err).message)
      refresh()
    },
  })

  const withdrawMutation = useMutation({
    mutationFn: (request: ApprovalRequest) => approvalsApi.cancel(request.id),
    onSuccess: () => {
      setWithdrawTarget(null)
      refresh()
      toast({ title: 'Request withdrawn' })
    },
    onError: (err) => {
      setWithdrawTarget(null)
      refresh()
      toast({ title: 'Error', description: teamErrorMessage(err).message, variant: 'destructive' })
    },
  })

  // Not every role may see the decision queue. The server answers 403 for those
  // who cannot; they get "Your requests" alone, as on mobile.
  const waitingError = waitingQuery.error ? teamErrorMessage(waitingQuery.error) : null
  const canViewInbox = waitingError?.status !== 403
  const waitingCount = waitingQuery.data?.data?.length ?? 0

  const mineList = (
    <RequestList
      query={mineQuery}
      emptyIcon={Inbox}
      emptyTitle="No requests yet"
      emptyDescription="Actions that need approval — like adding a member — will appear here."
      renderActions={(request) =>
        request.status === 'PENDING' ? (
          <Button variant="outline" size="sm" className="w-full" onClick={() => setWithdrawTarget(request)}>
            Withdraw
          </Button>
        ) : null
      }
    />
  )

  return (
    <>
      <Header title="Approvals" description="Requests that need a decision, and the ones you raised" />
      <div className="p-6 animate-fade-in">
        <PageHeader title={canViewInbox ? 'Approvals' : 'Your requests'} />

        {decisionError && (
          <Alert variant="destructive" className="mb-4" data-testid="decision-error">
            <AlertDescription>
              {decisionError}
              <Button variant="link" size="sm" className="h-auto p-0 pl-2" onClick={() => setDecisionError(null)}>
                Dismiss
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {!canViewInbox ? (
          mineList
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="waiting">
                Waiting on you
                {waitingCount > 0 && (
                  <Badge className="ml-2" aria-label={`${waitingCount} waiting`}>
                    {waitingCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="mine">Your requests</TabsTrigger>
            </TabsList>
            <TabsContent value="waiting" className="mt-4">
              <RequestList
                query={waitingQuery}
                emptyIcon={CheckCircle2}
                emptyTitle="Nothing waiting"
                emptyDescription="Requests that need your decision will show up here."
                renderActions={(request) =>
                  request.status === 'PENDING' ? (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-destructive text-destructive hover:bg-destructive/10"
                        disabled={decideMutation.isPending}
                        onClick={() => {
                          setRejectReason('')
                          setRejectTarget(request)
                        }}
                      >
                        Reject
                      </Button>
                      <Button
                        variant="success"
                        size="sm"
                        className="flex-1"
                        loading={decideMutation.isPending && decideMutation.variables?.request.id === request.id}
                        disabled={decideMutation.isPending}
                        onClick={() => decideMutation.mutate({ request })}
                      >
                        Approve
                      </Button>
                    </div>
                  ) : null
                }
              />
            </TabsContent>
            <TabsContent value="mine" className="mt-4">
              {mineList}
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* A reason is required to reject: the requester deserves to know why. */}
      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject request</DialogTitle>
          </DialogHeader>
          <Textarea
            aria-label="Reason"
            placeholder="Let them know why this was rejected"
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)} disabled={decideMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim()}
              loading={decideMutation.isPending}
              onClick={() => rejectTarget && decideMutation.mutate({ request: rejectTarget, reason: rejectReason.trim() })}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!withdrawTarget}
        onOpenChange={(open) => !open && setWithdrawTarget(null)}
        title="Withdraw this request?"
        description={
          withdrawTarget
            ? `"${withdrawTarget.summary ?? withdrawTarget.actionLabel}" will no longer wait for approval.`
            : ''
        }
        cancelLabel="Keep it"
        confirmLabel="Withdraw"
        loading={withdrawMutation.isPending}
        onConfirm={() => withdrawTarget && withdrawMutation.mutate(withdrawTarget)}
      />
    </>
  )
}

function RequestList({
  query,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  renderActions,
}: {
  query: { isLoading: boolean; error: unknown; data?: { data: ApprovalRequest[] }; refetch: () => unknown }
  emptyIcon: typeof Inbox
  emptyTitle: string
  emptyDescription: string
  renderActions: (request: ApprovalRequest) => React.ReactNode
}) {
  if (query.isLoading) {
    return (
      <div className="grid gap-3 md:grid-cols-2" aria-busy="true">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
    )
  }
  if (query.error) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Requests could not be loaded"
        description={teamErrorMessage(query.error).message}
        action={
          <Button variant="outline" onClick={() => query.refetch()}>
            Try again
          </Button>
        }
      />
    )
  }
  const requests = query.data?.data ?? []
  if (requests.length === 0) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {requests.map((request) => (
        <RequestCard key={request.id} request={request} actions={renderActions(request)} />
      ))}
    </div>
  )
}

function RequestCard({ request, actions }: { request: ApprovalRequest; actions: React.ReactNode }) {
  const status = STATUS[request.status] ?? STATUS.CANCELLED
  // Approved only means the member was enrolled; a pre-collected payment still
  // needs someone with payments.verify to act on it.
  const needsPaymentVerification =
    request.status === 'APPROVED' && (request.paymentStatus === 'STAFF_COLLECTED' || request.paymentStatus === 'PENDING')

  return (
    <Card className={cn(request.dangerous && 'border-destructive/40')}>
      <CardContent className="space-y-2.5 p-4">
        <div className="flex items-center justify-between gap-2">
          <Badge variant={request.dangerous ? 'destructive' : 'secondary'} className="uppercase tracking-wide">
            {request.actionLabel}
          </Badge>
          <span className={cn('text-xs font-semibold', status.className)}>{status.label}</span>
        </div>

        {request.summary && <p className="font-semibold">{request.summary}</p>}

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {request.requestedByName && (
            <span className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              {request.requestedByName}
            </span>
          )}
          {request.branch && (
            <span className="flex items-center gap-1">
              <Store className="h-3.5 w-3.5" />
              {request.branch.name}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {ageLabel(request.createdAt)}
          </span>
        </p>

        {needsPaymentVerification ? (
          <p className="flex items-center gap-1.5 rounded-md bg-warning/10 px-2 py-1.5 text-xs font-semibold text-warning">
            <ClipboardCheck className="h-3.5 w-3.5 shrink-0" />
            Approved, but the payment still needs verifying — see the Payments page
          </p>
        ) : request.collectedBy ? (
          <p className="flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-1.5 text-xs font-semibold text-success">
            <Wallet className="h-3.5 w-3.5 shrink-0" />
            {request.status === 'PENDING'
              ? 'Payment already collected — rejecting this means returning it'
              : 'Payment collected and verified'}
          </p>
        ) : null}

        {request.decisionReason && (
          <p className="rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">{request.decisionReason}</p>
        )}

        {actions}
      </CardContent>
    </Card>
  )
}

export default function ApprovalsPage() {
  return (
    <Suspense fallback={null}>
      <ApprovalsPageContent />
    </Suspense>
  )
}
