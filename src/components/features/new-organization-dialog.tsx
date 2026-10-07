'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, Building2, ChevronRight, Store } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BranchLimitDialog } from '@/components/features/branch-limit-dialog'
import { LastBranchDialog } from '@/components/features/last-branch-dialog'
import { useBranchQuota, invalidateBranchCapacity } from '@/hooks/use-branch-quota'
import { citiesApi } from '@/lib/api/cities'
import { hostApi, CreateListingPayload, HostBranch, HostListing } from '@/lib/api/host'
import { classifyBranchError } from '@/lib/branches/errors'
import { cn } from '@/lib/utils'

type Step = 'source' | 'build' | 'pick' | 'name'

interface NewOrganizationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the new organization's id once it exists, so the page can select it. */
  onCreated: (listingId?: string) => void
}

const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm'

/**
 * New organization: "build new" or "move existing", as mobile
 * (new_organization_source_screen.dart, new_organization_quick_form_screen.dart,
 * listing_preview_screen.dart). Both go to POST /host/listings; moving then calls
 * POST /host/branches/:id/move and, if that empties the source organization, asks first
 * (409 last_branch_in_organization) and removes the new organization again if the owner backs out.
 */
export function NewOrganizationDialog({ open, onOpenChange, onCreated }: NewOrganizationDialogProps) {
  const queryClient = useQueryClient()
  const [step, setStep] = React.useState<Step>('source')
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [genderType, setGenderType] = React.useState('MIXED')
  const [address, setAddress] = React.useState('')
  const [cityId, setCityId] = React.useState(0)
  const [planName, setPlanName] = React.useState('Standard Membership')
  const [planPrice, setPlanPrice] = React.useState(5000)
  const [planDuration, setPlanDuration] = React.useState('MONTHLY')
  const [toMove, setToMove] = React.useState<HostBranch | null>(null)
  const [createdListingId, setCreatedListingId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [limit, setLimit] = React.useState<{ message: string; isOverQuota: boolean } | null>(null)
  const [lastBranch, setLastBranch] = React.useState<{ organizationName: string | null } | null>(null)
  const [lastBody, setLastBody] = React.useState<CreateListingPayload | null>(null)

  const quota = useBranchQuota(open)
  const buildable = quota.data?.data?.buildableBranches ?? 0

  const listingsQuery = useQuery({ queryKey: ['host-listings'], queryFn: () => hostApi.getListings(), enabled: open })
  const activeListings: HostListing[] = (listingsQuery.data?.data ?? []).filter((l) => l.status?.toUpperCase() === 'ACTIVE')
  const allBranchesQuery = useQuery({ queryKey: ['branches', 'all-host'], queryFn: () => hostApi.getAllBranches(), enabled: open })
  const titleById = Object.fromEntries(activeListings.map((l) => [l.id, l.title]))
  const movable = (allBranchesQuery.data?.data?.branches ?? []).filter(
    (b) => b.status?.toUpperCase() === 'ACTIVE' && !!b.gymListingId && b.gymListingId in titleById
  )
  const canMove = activeListings.length > 1 && movable.length > 0

  const citiesQuery = useQuery({ queryKey: ['cities'], queryFn: () => citiesApi.getCities(), enabled: open && step === 'build' })
  const cities = ((citiesQuery.data?.data as unknown as Array<{ id: number; name: string }>) ?? [])

  React.useEffect(() => {
    if (!open) return
    setStep('source')
    setName('')
    setDescription('')
    setGenderType('MIXED')
    setAddress('')
    setCityId(0)
    setToMove(null)
    setCreatedListingId(null)
    setError(null)
    setLimit(null)
    setLastBranch(null)
    setLastBody(null)
  }, [open])

  const refreshAll = (listingId?: string) => {
    queryClient.invalidateQueries({ queryKey: ['host-listings'] })
    queryClient.invalidateQueries({ queryKey: ['branches'] })
    queryClient.invalidateQueries({ queryKey: ['organization-quota'] })
    invalidateBranchCapacity(queryClient)
    onCreated(listingId)
  }

  const fail = (err: unknown) => {
    const block = classifyBranchError(err)
    if (block.kind === 'limit' || block.kind === 'over_quota') {
      setLimit({ message: block.message, isOverQuota: block.kind === 'over_quota' })
    } else {
      setError(block.message)
    }
  }

  // ── Build a brand new branch ─────────────────────────────────────────────
  const buildMutation = useMutation({
    mutationFn: (body: CreateListingPayload) => hostApi.createListing(body),
    onSuccess: (res) => {
      setLimit(null)
      onOpenChange(false)
      refreshAll(res.data?.id)
    },
    onError: fail,
  })

  const submitBuild = () => {
    setError(null)
    const body: CreateListingPayload = {
      gymName: name.trim(),
      gymDescription: description.trim(),
      genderType,
      branchSource: 'new',
      cityId,
      address: address.trim(),
      packages: [
        {
          name: planName.trim(),
          price: Number(planPrice),
          durationType: planDuration,
          durationValue: planDuration === 'YEARLY' ? 12 : planDuration === 'QUARTERLY' ? 3 : 1,
          description: 'Standard access to branch facilities',
        },
      ],
    }
    setLastBody(body)
    buildMutation.mutate(body)
  }

  // ── Move an existing branch here ─────────────────────────────────────────
  const moveMutation = useMutation({
    mutationFn: async ({ confirm }: { confirm: boolean }) => {
      if (!toMove) return
      let listingId = createdListingId
      if (!listingId) {
        const created = await hostApi.createListing({
          gymName: name.trim(),
          gymDescription: description.trim(),
          genderType,
          branchSource: 'none',
        })
        listingId = created.data.id
        setCreatedListingId(listingId)
      }
      await hostApi.moveBranch(toMove.id, listingId, confirm)
      return listingId
    },
    onSuccess: (listingId) => {
      setLastBranch(null)
      onOpenChange(false)
      refreshAll(listingId ?? undefined)
    },
    onError: (err: any) => {
      if (err?.response?.status === 409 && err?.response?.data?.code === 'last_branch_in_organization') {
        setLastBranch({ organizationName: err?.response?.data?.data?.organizationName ?? null })
        return
      }
      fail(err)
    },
  })

  // The owner backed out of emptying the source organization: do not leave the just-created
  // (empty) organization behind. An organization without a branch is what this flow prevents.
  const cancelMove = async () => {
    setLastBranch(null)
    if (createdListingId) {
      try {
        await hostApi.deleteListing(createdListingId)
        setCreatedListingId(null)
      } catch (err) {
        setError(`Organization was created but cleanup failed: ${classifyBranchError(err).message}`)
      }
    }
    refreshAll()
  }

  const busy = buildMutation.isPending || moveMutation.isPending
  const buildReady = name.trim() && address.trim() && cityId > 0 && planName.trim() && planPrice > 0
  const nameReady = !!name.trim()

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Organization</DialogTitle>
            <DialogDescription className="sr-only">Set up another organization</DialogDescription>
          </DialogHeader>

          {step === 'source' && (
            <div className="space-y-4">
              <div>
                <p className="text-lg font-bold">How do you want to set this organization up?</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Every organization needs at least one branch. Build a new one, or move one you already run somewhere else.
                </p>
              </div>
              <SourceOption
                icon={<Store className="h-5 w-5" />}
                title="Build a brand new branch"
                subtitle={
                  buildable > 0
                    ? `Uses 1 of your ${buildable} remaining ${buildable === 1 ? 'branch' : 'branches'} — fill out details and photos.`
                    : 'Fill out details and photos. If your plan has no room by the end, you can add a branch then.'
                }
                // Never gated on capacity: the plan is only met at the end, when the server says no.
                onClick={() => setStep('build')}
              />
              <SourceOption
                icon={<ArrowLeftRight className="h-5 w-5" />}
                title="Move an existing branch here"
                subtitle={
                  activeListings.length <= 1
                    ? 'No other branches available to move yet.'
                    : 'Relocate a branch you already run in another organization — no new purchase.'
                }
                disabled={!canMove}
                onClick={() => setStep('pick')}
              />
            </div>
          )}

          {step === 'pick' && (
            <div className="space-y-3">
              <p className="text-lg font-bold">Move which branch?</p>
              <div className="space-y-2">
                {movable.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      setToMove(b)
                      setStep('name')
                    }}
                    className="flex w-full items-center justify-between rounded-lg border p-3 text-left hover:bg-accent"
                  >
                    <span>
                      <span className="block font-semibold">{b.branchName}</span>
                      <span className="block text-sm text-muted-foreground">
                        Currently in {titleById[b.gymListingId as string] ?? 'Unknown'}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {(step === 'build' || step === 'name') && (
            <div className="space-y-4">
              {step === 'name' && toMove && (
                <p className="rounded-md bg-primary/5 p-3 text-sm">
                  &quot;{toMove.branchName}&quot; will move here once this organization is created.
                </p>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="org-name">Organization name *</Label>
                <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="org-description">Description</Label>
                <Input id="org-description" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="org-gender">Who is it for</Label>
                <select id="org-gender" className={selectClass} value={genderType} onChange={(e) => setGenderType(e.target.value)}>
                  <option value="MIXED">Mixed (Male &amp; Female)</option>
                  <option value="MALE_ONLY">Male Only</option>
                  <option value="FEMALE_ONLY">Female Only</option>
                </select>
              </div>

              {step === 'build' && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="org-address">Address *</Label>
                    <Input id="org-address" value={address} onChange={(e) => setAddress(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="org-city">City *</Label>
                    <select id="org-city" className={selectClass} value={cityId || ''} onChange={(e) => setCityId(Number(e.target.value))}>
                      <option value="" />
                      {cities.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-3 space-y-1.5 sm:col-span-1">
                      <Label htmlFor="org-plan-name">First plan *</Label>
                      <Input id="org-plan-name" value={planName} onChange={(e) => setPlanName(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="org-plan-price">Price *</Label>
                      <Input id="org-plan-price" type="number" min={1} value={planPrice} onChange={(e) => setPlanPrice(Number(e.target.value))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="org-plan-duration">Billing</Label>
                      <select id="org-plan-duration" className={selectClass} value={planDuration} onChange={(e) => setPlanDuration(e.target.value)}>
                        <option value="MONTHLY">Monthly</option>
                        <option value="QUARTERLY">Quarterly</option>
                        <option value="YEARLY">Yearly</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {error && (
                <Alert variant="destructive" data-testid="new-org-error">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter>
            {step !== 'source' && (
              <Button variant="outline" disabled={busy} onClick={() => { setError(null); setStep(step === 'name' ? 'pick' : 'source') }}>
                Back
              </Button>
            )}
            {step === 'build' && (
              <Button disabled={!buildReady} loading={buildMutation.isPending} onClick={submitBuild}>
                <Building2 className="h-4 w-4" />
                Create organization
              </Button>
            )}
            {step === 'name' && (
              <Button
                disabled={!nameReady}
                loading={moveMutation.isPending}
                onClick={() => {
                  setError(null)
                  moveMutation.mutate({ confirm: false })
                }}
              >
                <Building2 className="h-4 w-4" />
                Create organization
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BranchLimitDialog
        open={!!limit}
        branchName={name.trim()}
        message={limit?.message ?? ''}
        isOverQuota={!!limit?.isOverQuota}
        loading={buildMutation.isPending || moveMutation.isPending}
        onTryAgain={() => (lastBody && step === 'build' ? buildMutation.mutate(lastBody) : moveMutation.mutate({ confirm: false }))}
        onClose={() => setLimit(null)}
      />

      <LastBranchDialog
        open={!!lastBranch}
        branchName={toMove?.branchName ?? ''}
        organizationName={lastBranch?.organizationName}
        actionLabel="Move anyway"
        loading={moveMutation.isPending}
        onCancel={cancelMove}
        onConfirm={() => moveMutation.mutate({ confirm: true })}
      />
    </>
  )
}

function SourceOption({
  icon,
  title,
  subtitle,
  disabled,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors',
        disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-accent'
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
      <span className="flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-muted-foreground">{subtitle}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  )
}
