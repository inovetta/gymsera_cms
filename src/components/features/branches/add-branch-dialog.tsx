'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BranchLimitDialog } from '@/components/features/branch-limit-dialog'
import { BranchLocationFields, BranchLocationValue, areaPayload } from '@/components/features/places/branch-location-fields'
import { BranchPhotosField } from '@/components/features/branches/branch-photos-field'
import { invalidateBranchCapacity } from '@/hooks/use-branch-quota'
import { hostApi, type Business, type CreateHostBranchPayload } from '@/lib/api/host'
import { classifyBranchError } from '@/lib/branches/errors'
import { DEFAULT_CLOSING_TIME, DEFAULT_OPENING_TIME, branchDraftMissing, canReceiveBranches } from '@/lib/branches/rules'
import { firstPlanPackage } from '@/lib/plans/plan-display'

const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Every business of the organization; only approved ones can be chosen (D7). */
  businesses: Business[]
  /** The business the dialog opens on (the card it was opened from, or the Branches filter). */
  defaultBusinessId?: string
  /** The currency the first plan is priced in, when known. */
  currency?: string | null
  onCreated?: (businessId: string) => void
}

/**
 * Add Branch (enterprise spec §4, D8), the same rules as the app's wizard: the business is chosen
 * at the top (approved only; one under review is shown disabled), area or area request required,
 * hours start at 06:00–22:00, at least 3 photos, a first plan. POST /host/branches with
 * `businessId`. Capacity is not checked first: a 403 opens the plan upsell; a 409
 * `business_not_approved` is shown as the server's reason.
 */
export function AddBranchDialog({ open, onOpenChange, businesses, defaultBusinessId, currency, onCreated }: Props) {
  const queryClient = useQueryClient()
  const receiving = businesses.filter(canReceiveBranches)
  const [businessId, setBusinessId] = useState('')
  const [branchName, setBranchName] = useState('')
  const [location, setLocation] = useState<BranchLocationValue>({ address: '' })
  const [phone, setPhone] = useState('')
  const [openingTime, setOpeningTime] = useState(DEFAULT_OPENING_TIME)
  const [closingTime, setClosingTime] = useState(DEFAULT_CLOSING_TIME)
  const [photos, setPhotos] = useState<string[]>([])
  const [planName, setPlanName] = useState('')
  const [planPrice, setPlanPrice] = useState('')
  const [planDuration, setPlanDuration] = useState('MONTHLY')
  const [error, setError] = useState<string | null>(null)
  const [limit, setLimit] = useState<{ message: string; isOverQuota: boolean } | null>(null)
  const [lastBody, setLastBody] = useState<CreateHostBranchPayload | null>(null)

  useEffect(() => {
    if (!open) return
    const start = receiving.find((b) => b.id === defaultBusinessId) ?? receiving[0]
    setBusinessId(start?.id ?? '')
    setBranchName('')
    setLocation({ address: '' })
    setPhone('')
    setOpeningTime(DEFAULT_OPENING_TIME)
    setClosingTime(DEFAULT_CLOSING_TIME)
    setPhotos([])
    setPlanName('')
    setPlanPrice('')
    setPlanDuration('MONTHLY')
    setError(null)
    setLimit(null)
    setLastBody(null)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const mutation = useMutation({
    mutationFn: (body: CreateHostBranchPayload) => hostApi.createBranch(body),
    onSuccess: (_res, body) => {
      setLimit(null)
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      queryClient.invalidateQueries({ queryKey: ['host-businesses'] })
      queryClient.invalidateQueries({ queryKey: ['business-quota'] })
      invalidateBranchCapacity(queryClient)
      onOpenChange(false)
      onCreated?.(body.businessId)
    },
    onError: (err) => {
      const block = classifyBranchError(err)
      if (block.kind === 'limit' || block.kind === 'over_quota') setLimit({ message: block.message, isOverQuota: block.kind === 'over_quota' })
      else setError(block.message)
    },
  })

  const price = Number(planPrice)
  const missing = branchDraftMissing({ businessId, branchName, location, photos, planName, planPrice: price })

  const submit = () => {
    setError(null)
    const body: CreateHostBranchPayload = {
      businessId,
      branchName: branchName.trim(),
      address: location.address.trim(),
      cityId: location.cityId,
      ...areaPayload(location),
      ...(location.latitude !== undefined ? { latitude: location.latitude } : {}),
      ...(location.longitude !== undefined ? { longitude: location.longitude } : {}),
      ...(location.googlePlaceId ? { googlePlaceId: location.googlePlaceId } : {}),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      openingTime,
      closingTime,
      imagesJson: photos,
      // One period of the chosen type (R-80).
      packages: [firstPlanPackage(planName.trim(), price, planDuration)],
    }
    setLastBody(body)
    mutation.mutate(body)
  }

  return (
    <>
      <Dialog open={open && !limit} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Branch</DialogTitle>
            <DialogDescription>A new location of one of your approved businesses. It uses one branch of your plan.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="add-branch-business">Business *</Label>
              <select id="add-branch-business" className={selectClass} value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
                {receiving.length === 0 && <option value="">No approved business yet</option>}
                {businesses.map((b) => (
                  <option key={b.id} value={b.id} disabled={!canReceiveBranches(b)}>
                    {b.name}{canReceiveBranches(b) ? '' : ' (Under review)'}
                  </option>
                ))}
              </select>
              {receiving.length === 0 && (
                <p className="text-xs text-muted-foreground">You can add branches once a business is approved.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-branch-name">Branch name *</Label>
              <Input id="add-branch-name" value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="e.g. DHA Phase 5" />
            </div>

            <BranchLocationFields idPrefix="add-branch" value={location} onChange={setLocation} allowAreaRequests />

            <div className="space-y-1.5">
              <Label htmlFor="add-branch-phone">Phone</Label>
              <Input id="add-branch-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+92 300 0000000" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="add-branch-opens">Opens</Label>
                <Input id="add-branch-opens" type="time" value={openingTime} onChange={(e) => setOpeningTime(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-branch-closes">Closes</Label>
                <Input id="add-branch-closes" type="time" value={closingTime} onChange={(e) => setClosingTime(e.target.value)} />
              </div>
            </div>

            <BranchPhotosField idPrefix="add-branch" value={photos} onChange={setPhotos} />

            <div className="grid grid-cols-1 gap-3 rounded-lg border p-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="add-branch-plan-name">First plan *</Label>
                <Input id="add-branch-plan-name" value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="e.g. Standard Monthly" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-branch-plan-price">Price{currency ? ` (${currency})` : ''} *</Label>
                <Input id="add-branch-plan-price" type="number" min={0} value={planPrice} onChange={(e) => setPlanPrice(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-branch-plan-duration">Duration</Label>
                <select id="add-branch-plan-duration" className={selectClass} value={planDuration} onChange={(e) => setPlanDuration(e.target.value)}>
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly (3 Mo)</option>
                  <option value="YEARLY">Yearly (12 Mo)</option>
                </select>
              </div>
            </div>

            {missing.length > 0 && (
              <p data-testid="add-branch-missing" className="text-xs text-muted-foreground">Still needed: {missing.join(', ')}.</p>
            )}
            {error && (
              <Alert variant="destructive" data-testid="add-branch-error">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={submit} disabled={missing.length > 0} loading={mutation.isPending}>Create Branch</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BranchLimitDialog
        open={!!limit}
        branchName={branchName.trim()}
        message={limit?.message ?? ''}
        isOverQuota={!!limit?.isOverQuota}
        loading={mutation.isPending}
        onTryAgain={() => lastBody && mutation.mutate(lastBody)}
        onClose={() => setLimit(null)}
      />
    </>
  )
}
