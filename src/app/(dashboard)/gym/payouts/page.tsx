'use client'

import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Landmark, Pencil, Send } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { DataTable, Column } from '@/components/features/data-table'
import { NoAccess } from '@/components/features/no-access'
import { ReauthDialog, ReauthCredential } from '@/components/features/reauth-dialog'
import { SubmittedForApprovalNotice } from '@/components/features/approvals/submitted-for-approval-notice'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { BankDetails, Payout, payoutsApi } from '@/lib/api/payouts'
import { gymApi } from '@/lib/api/gym'
import { ApprovalOutcome, readApprovalOutcome } from '@/lib/api/approvals'
import { newIdempotencyKey } from '@/lib/api/idempotency'
import { describeRequestError, isReauthChallenge } from '@/lib/api/request-errors'
import { formatMoney, parseAmountInput, toApiAmount, toMinor } from '@/lib/money'
import { holdsPermission } from '@/lib/access/menu'
import { tierAt } from '@/lib/access/tier'
import { formatDate } from '@/lib/utils'
import { useGymAccess } from '@/hooks/use-gym-access'
import { useToast } from '@/hooks/use-toast'

const BANK_FIELDS: { key: keyof BankDetails; label: string; placeholder?: string; required?: boolean }[] = [
  { key: 'bankName', label: 'Bank name', placeholder: 'e.g. Meezan Bank', required: true },
  { key: 'accountTitle', label: 'Account title', placeholder: 'Name on the account', required: true },
  { key: 'accountNumber', label: 'Account number' },
  { key: 'iban', label: 'IBAN', placeholder: 'PK00 XXXX 0000 0000 0000 0000' },
  { key: 'branchCode', label: 'Branch code' },
  { key: 'jazzCashNumber', label: 'JazzCash number' },
  { key: 'easyPaisaNumber', label: 'EasyPaisa number' },
]

const STATUS_TONE: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-blue-100 text-blue-800',
  PROCESSING: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-800',
}

/** Display only: the last four characters of an account number. */
const maskTail = (value?: string) => {
  const v = (value ?? '').replace(/\s/g, '')
  if (!v) return '—'
  return v.length <= 4 ? v : `${'•'.repeat(Math.min(v.length - 4, 8))}${v.slice(-4)}`
}

const asBankDetails = (value: unknown): BankDetails =>
  value && typeof value === 'object' ? (value as BankDetails) : {}

const hasDestination = (d: BankDetails) => Object.values(d).some((v) => typeof v === 'string' && v.trim() !== '')

export default function PayoutsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { organization, contextLoading } = useGymAccess()

  // payouts.view is an organization-wide permission (the owner by default).
  const mayView = holdsPermission(organization, 'payouts.view', 'org')
  const accessKnown = !!organization || !contextLoading
  const requestTier = tierAt(organization, 'payouts.request')
  const mayManageBank = tierAt(organization, 'payouts.bank.manage') !== 'OFF'

  const [branchId, setBranchId] = useState('')
  const [page, setPage] = useState(1)
  const [notice, setNotice] = useState<ApprovalOutcome | null>(null)

  const branches = organization?.branches ?? []

  const balanceQuery = useQuery({
    queryKey: ['payouts', 'balance', branchId || 'all'],
    queryFn: () => payoutsApi.balance(branchId || undefined),
    enabled: mayView && !!organization,
  })
  const listQuery = useQuery({
    queryKey: ['payouts', 'list', branchId || 'all', page],
    queryFn: () => payoutsApi.list({ ...(branchId ? { branchId } : {}), page, limit: 20 }),
    enabled: mayView && !!organization,
  })
  // The profile carries the bank details, and only for someone who may manage them.
  const profileQuery = useQuery({
    queryKey: ['gym-profile'],
    queryFn: () => gymApi.getGymProfile(),
    enabled: mayView && mayManageBank && !!organization,
  })

  const balance = balanceQuery.data?.data
  const payouts = listQuery.data?.data?.payouts ?? []
  const totalPages = (listQuery.data?.pagination as { pages?: number; totalPages?: number } | undefined)?.pages
    ?? listQuery.data?.pagination?.totalPages ?? 1
  const bank = asBankDetails(profileQuery.data?.data?.gym?.paymentDetailsJson)
  const bankUpdatedAt = profileQuery.data?.data?.gym?.paymentDetailsUpdatedAt ?? null

  // ── Request a payout ──────────────────────────────────────────────────────
  const [requestOpen, setRequestOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [requestError, setRequestError] = useState<string | null>(null)
  const requestKey = useRef<{ fingerprint: string; key: string } | null>(null)

  const requestMutation = useMutation({
    mutationFn: (minor: number) => {
      const body = {
        ...(branchId ? { branchId } : {}),
        amount: toApiAmount(minor),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      }
      const fingerprint = JSON.stringify(body)
      if (!requestKey.current || requestKey.current.fingerprint !== fingerprint) {
        requestKey.current = { fingerprint, key: newIdempotencyKey() }
      }
      return payoutsApi.request(body, requestKey.current.key)
    },
    onSuccess: (response) => {
      requestKey.current = null
      setRequestOpen(false)
      setRequestError(null)
      setAmount('')
      setNotes('')
      const outcome = readApprovalOutcome(response)
      if (outcome.pending) {
        // 202: no payout exists yet. It waits in the approval inbox.
        setNotice({ ...outcome, summary: outcome.summary ?? 'Your payout request' })
      } else {
        setNotice(null)
        toast({ title: 'Payout requested', description: 'It will show as pending until it is processed.' })
      }
      queryClient.invalidateQueries({ queryKey: ['payouts'] })
    },
    onError: (error) => setRequestError(describeRequestError(error, 'The payout was not requested. Check the amount and try again.')),
  })

  const submitRequest = () => {
    const minor = parseAmountInput(amount)
    if (minor === null || minor <= 0) {
      setRequestError('Enter an amount greater than 0, with at most two decimals.')
      return
    }
    setRequestError(null)
    requestMutation.mutate(minor)
  }

  // ── Bank details: edit → re-authenticate → PATCH /gyms/profile ─────────────
  const [bankOpen, setBankOpen] = useState(false)
  const [bankForm, setBankForm] = useState<BankDetails>({})
  const [bankFormError, setBankFormError] = useState<string | null>(null)
  const [reauthOpen, setReauthOpen] = useState(false)
  const [reauthError, setReauthError] = useState<string | null>(null)
  const [justUpdatedAt, setJustUpdatedAt] = useState<string | null>(null)

  const bankMutation = useMutation({
    mutationFn: (credential: ReauthCredential) =>
      gymApi.updateGymProfile({ paymentDetailsJson: { ...bankForm }, ...credential }),
    onSuccess: (response) => {
      setReauthOpen(false)
      setBankOpen(false)
      setReauthError(null)
      setJustUpdatedAt(response.data?.gym?.paymentDetailsUpdatedAt ?? new Date().toISOString())
      queryClient.invalidateQueries({ queryKey: ['gym-profile'] })
      toast({
        title: 'Bank details updated',
        description: 'You were notified by email and in the app. New payout requests are paused for 24 hours.',
      })
    },
    onError: (error) => {
      // A wrong password or a refused identity stays in the re-auth dialog, with the server's words.
      setReauthError(
        describeRequestError(
          error,
          isReauthChallenge(error)
            ? 'Confirm with your password or sign in with Google again to change bank details.'
            : 'The bank details were not saved. Try again.',
          { 403: 'You do not have permission to manage bank payout details.' }
        )
      )
    },
  })

  const openBankEditor = () => {
    setBankForm({ ...bank })
    setBankFormError(null)
    setReauthError(null)
    setBankOpen(true)
  }

  const continueToReauth = () => {
    const missing = BANK_FIELDS.filter((f) => f.required && !(bankForm[f.key] ?? '').trim()).map((f) => f.label)
    if (missing.length > 0) {
      setBankFormError(`Fill in: ${missing.join(', ')}.`)
      return
    }
    if (!(bankForm.accountNumber ?? '').trim() && !(bankForm.iban ?? '').trim()) {
      setBankFormError('Enter an account number or an IBAN so a payout has somewhere to go.')
      return
    }
    const iban = (bankForm.iban ?? '').replace(/\s/g, '')
    if (iban && !/^[A-Za-z]{2}\d{2}[A-Za-z0-9]{10,30}$/.test(iban)) {
      setBankFormError('That IBAN does not look right. Check it against your bank statement.')
      return
    }
    setBankFormError(null)
    setReauthError(null)
    setReauthOpen(true)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const columns: Column<Payout>[] = [
    { key: 'amount', header: 'Amount', cell: (p) => <span className="font-semibold">{formatMoney(p.amount, p.currency || 'PKR')}</span> },
    {
      key: 'status',
      header: 'Status',
      cell: (p) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[p.status] ?? 'bg-gray-100 text-gray-800'}`}>
          {p.status.charAt(0) + p.status.slice(1).toLowerCase()}
        </span>
      ),
    },
    { key: 'notes', header: 'Note', cell: (p) => <span className="text-sm text-muted-foreground">{p.notes || '—'}</span> },
    { key: 'ref', header: 'Reference', cell: (p) => <span className="text-xs text-muted-foreground">{p.transactionRef || '—'}</span> },
    { key: 'date', header: 'Requested', cell: (p) => <span className="text-sm text-muted-foreground">{formatDate(p.createdAt)}</span> },
  ]

  if (accessKnown && !mayView) {
    return (
      <>
        <Header title="Payouts" description="Balance, payout requests and bank details" />
        <div className="p-6"><NoAccess what="payouts" needs="View payouts" /></div>
      </>
    )
  }

  const cooling = justUpdatedAt || bankUpdatedAt
  const stats: { label: string; value: number | undefined; strong?: boolean }[] = [
    { label: 'Available to pay out', value: balance?.availableBalance, strong: true },
    { label: 'Collected', value: balance?.totalCollected },
    { label: 'Refunded', value: balance?.totalRefunded },
    { label: 'Expenses', value: balance?.totalExpenses },
    { label: 'Already paid out or requested', value: balance?.totalPayouts },
  ]

  return (
    <>
      <Header title="Payouts" description="Balance, payout requests and bank details" />
      <div className="p-6 animate-fade-in space-y-6">
        <PageHeader
          title="Payouts"
          action={
            requestTier !== 'OFF' ? (
              <Button onClick={() => { setRequestError(null); setRequestOpen(true) }}>
                <Send className="mr-2 h-4 w-4" />
                {requestTier === 'DIRECT' ? 'Request payout' : 'Ask for a payout'}
              </Button>
            ) : undefined
          }
        />

        {notice && <SubmittedForApprovalNotice summary={notice.summary} />}

        {branches.length > 1 && (
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="payouts-branch" className="font-medium">Branch</label>
            <select
              id="payouts-branch"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={branchId}
              onChange={(e) => { setBranchId(e.target.value); setPage(1) }}
            >
              <option value="">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}

        {balanceQuery.error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>The balance did not load</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>{describeRequestError(balanceQuery.error, 'Could not load the payout balance. Try again.')}</span>
              <Button size="sm" variant="outline" onClick={() => balanceQuery.refetch()}>Try again</Button>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="payout-balance">
            {stats.map((s) =>
              balanceQuery.isLoading || (!organization && contextLoading) ? (
                <Skeleton key={s.label} className="h-20 w-full" />
              ) : (
                <Card key={s.label} className={s.strong ? 'border-primary/40' : undefined}>
                  <CardContent className="p-4">
                    <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                    <p className={`mt-1 font-bold ${s.strong ? 'text-xl text-primary' : 'text-lg'}`}>{formatMoney(s.value, balance?.currency || 'PKR')}</p>
                  </CardContent>
                </Card>
              )
            )}
          </div>
        )}

        {mayManageBank && (
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div>
                <CardTitle className="text-base">Bank details</CardTitle>
                <CardDescription>Where payouts are sent. Changing them needs your password and pauses new payout requests for 24 hours.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={openBankEditor} disabled={profileQuery.isLoading}>
                <Pencil className="mr-2 h-4 w-4" />
                {hasDestination(bank) ? 'Change' : 'Set up'}
              </Button>
            </CardHeader>
            <CardContent>
              {profileQuery.isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : profileQuery.error ? (
                <p className="text-sm text-destructive" role="alert">
                  {describeRequestError(profileQuery.error, 'Could not load your bank details. Try again.')}
                </p>
              ) : hasDestination(bank) ? (
                <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2" data-testid="bank-details">
                  <div><dt className="text-xs text-muted-foreground">Bank</dt><dd className="font-medium">{bank.bankName || '—'}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Account title</dt><dd className="font-medium">{bank.accountTitle || '—'}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Account number</dt><dd className="font-medium">{maskTail(bank.accountNumber)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">IBAN</dt><dd className="font-medium">{maskTail(bank.iban)}</dd></div>
                </dl>
              ) : (
                <div className="flex items-center gap-3 text-sm text-muted-foreground" data-testid="bank-empty">
                  <Landmark className="h-5 w-5" />
                  No payout account yet. Set one up before you request a payout.
                </div>
              )}
              {cooling && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Bank details last changed {formatDate(cooling, 'MMM dd, yyyy HH:mm')}. New payout requests wait 24 hours after a change.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Payout requests</CardTitle></CardHeader>
          <CardContent>
            {listQuery.error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>The payouts did not load</AlertTitle>
                <AlertDescription className="flex items-center justify-between gap-4">
                  <span>{describeRequestError(listQuery.error, 'Could not load payouts. Try again.')}</span>
                  <Button size="sm" variant="outline" onClick={() => listQuery.refetch()}>Try again</Button>
                </AlertDescription>
              </Alert>
            ) : (
              <DataTable
                columns={columns}
                data={payouts}
                loading={listQuery.isLoading || (!organization && contextLoading)}
                emptyTitle="No payouts yet"
                emptyDescription="Payouts you request will be listed here with their status."
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Request a payout */}
      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{requestTier === 'DIRECT' ? 'Request a payout' : 'Ask for a payout'}</DialogTitle>
            <DialogDescription>
              {requestTier === 'DIRECT'
                ? 'The amount is checked against your ledger balance by the server.'
                : 'Your request goes to someone with approval rights. Nothing is paid until it is approved.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border p-3 text-sm" data-testid="payout-destination">
              <p className="text-xs text-muted-foreground">Paid to</p>
              {hasDestination(bank) ? (
                <p className="font-medium">{bank.bankName} · {bank.accountTitle} · {maskTail(bank.accountNumber || bank.iban)}</p>
              ) : mayManageBank ? (
                <p className="text-muted-foreground">No payout account is set up yet.</p>
              ) : (
                <p className="text-muted-foreground">The organization&apos;s payout account.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="payout-amount">Amount (PKR) *</Label>
              <div className="flex gap-2">
                <Input id="payout-amount" inputMode="decimal" autoComplete="off" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
                {balance && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const minor = toMinor(balance.availableBalance)
                      if (minor !== null) setAmount(String(toApiAmount(minor)))
                    }}
                  >
                    All available
                  </Button>
                )}
              </div>
              {balance && <p className="text-xs text-muted-foreground">Available: {formatMoney(balance.availableBalance, balance.currency)}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="payout-notes">Note (optional)</Label>
              <Textarea id="payout-notes" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            {requestError && <p className="text-sm font-medium text-destructive" role="alert">{requestError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestOpen(false)}>Cancel</Button>
            <Button loading={requestMutation.isPending} onClick={submitRequest}>
              {requestTier === 'DIRECT' ? 'Request payout' : 'Send request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit bank details */}
      <Dialog open={bankOpen && !reauthOpen} onOpenChange={setBankOpen}>
        {/* Eight fields: scroll inside the dialog so Continue is never below the viewport. */}
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bank details</DialogTitle>
            <DialogDescription>
              You will confirm with your password (or Google) before they are saved. We notify you by email and in the app when they change.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {BANK_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={`bank-${f.key}`}>{f.label}{f.required ? ' *' : ''}</Label>
                <Input
                  id={`bank-${f.key}`}
                  autoComplete="off"
                  placeholder={f.placeholder}
                  value={bankForm[f.key] ?? ''}
                  onChange={(e) => setBankForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                />
              </div>
            ))}
            <div className="space-y-1">
              <Label htmlFor="bank-additionalInstructions">Instructions for members paying by transfer</Label>
              <Textarea
                id="bank-additionalInstructions"
                rows={2}
                value={bankForm.additionalInstructions ?? ''}
                onChange={(e) => setBankForm((prev) => ({ ...prev, additionalInstructions: e.target.value }))}
              />
            </div>
            {bankFormError && <p className="text-sm font-medium text-destructive" role="alert">{bankFormError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBankOpen(false)}>Cancel</Button>
            <Button onClick={continueToReauth}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReauthDialog
        open={reauthOpen}
        onOpenChange={(open) => { setReauthOpen(open); if (!open) setReauthError(null) }}
        title="Confirm it is you"
        description="Bank payout details move money. Confirm with your account password, or with Google if that is how you sign in."
        confirmLabel="Save bank details"
        loading={bankMutation.isPending}
        error={reauthError}
        onConfirm={(credential) => { setReauthError(null); bankMutation.mutate(credential) }}
      />
    </>
  )
}
