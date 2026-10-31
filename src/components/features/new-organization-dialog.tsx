'use client'

import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BranchLimitDialog } from '@/components/features/branch-limit-dialog'
import { BranchLocationFields, BranchLocationValue, locationValid } from '@/components/features/places/branch-location-fields'
import { useBranchQuota, invalidateBranchCapacity } from '@/hooks/use-branch-quota'
import { hostApi, CreateListingPayload } from '@/lib/api/host'
import { classifyBranchError } from '@/lib/branches/errors'

interface NewOrganizationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the new organization's id once it exists, so the page can select it. */
  onCreated: (listingId?: string) => void
}

const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm'

/**
 * New organization with its first branch, as mobile (new_organization_quick_form_screen.dart):
 * POST /host/listings with `branchSource: 'new'`. Moving an existing branch was removed with the
 * route (P5b item 8, R-81; NEW-167); an organization never exists without a branch (NEW-168).
 * The location comes from Google through our API (NEW-140); the first plan is the host's own.
 */
export function NewOrganizationDialog({ open, onOpenChange, onCreated }: NewOrganizationDialogProps) {
  const queryClient = useQueryClient()
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [genderType, setGenderType] = React.useState('MIXED')
  const [location, setLocation] = React.useState<BranchLocationValue>({ address: '' })
  const [planName, setPlanName] = React.useState('')
  const [planPrice, setPlanPrice] = React.useState('')
  const [planDuration, setPlanDuration] = React.useState('MONTHLY')
  const [error, setError] = React.useState<string | null>(null)
  const [limit, setLimit] = React.useState<{ message: string; isOverQuota: boolean } | null>(null)
  const [lastBody, setLastBody] = React.useState<CreateListingPayload | null>(null)

  const quota = useBranchQuota(open)
  const buildable = quota.data?.data?.buildableBranches ?? 0

  React.useEffect(() => {
    if (!open) return
    setName('')
    setDescription('')
    setGenderType('MIXED')
    setLocation({ address: '' })
    setPlanName('')
    setPlanPrice('')
    setPlanDuration('MONTHLY')
    setError(null)
    setLimit(null)
    setLastBody(null)
  }, [open])

  const buildMutation = useMutation({
    mutationFn: (body: CreateListingPayload) => hostApi.createListing(body),
    onSuccess: (res) => {
      setLimit(null)
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: ['host-listings'] })
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      queryClient.invalidateQueries({ queryKey: ['organization-quota'] })
      invalidateBranchCapacity(queryClient)
      onCreated(res.data?.id)
    },
    onError: (err) => {
      const block = classifyBranchError(err)
      if (block.kind === 'limit' || block.kind === 'over_quota') {
        setLimit({ message: block.message, isOverQuota: block.kind === 'over_quota' })
      } else {
        setError(block.message)
      }
    },
  })

  const price = Number(planPrice)
  const ready =
    !!name.trim() && !!location.address.trim() && !!location.cityId && locationValid(location) && !!planName.trim() && price > 0

  const submit = () => {
    setError(null)
    const body: CreateListingPayload = {
      gymName: name.trim(),
      gymDescription: description.trim(),
      genderType,
      branchSource: 'new',
      cityId: location.cityId,
      ...(location.areaId ? { areaId: location.areaId } : {}),
      address: location.address.trim(),
      ...(location.latitude !== undefined ? { latitude: location.latitude } : {}),
      ...(location.longitude !== undefined ? { longitude: location.longitude } : {}),
      ...(location.googlePlaceId ? { googlePlaceId: location.googlePlaceId } : {}),
      packages: [
        {
          name: planName.trim(),
          price,
          durationType: planDuration,
          durationValue: planDuration === 'YEARLY' ? 12 : planDuration === 'QUARTERLY' ? 3 : 1,
        },
      ],
    }
    setLastBody(body)
    buildMutation.mutate(body)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Organization</DialogTitle>
            <DialogDescription>
              Every organization starts with its first branch.{' '}
              {buildable > 0
                ? `It uses 1 of your ${buildable} remaining ${buildable === 1 ? 'branch' : 'branches'}.`
                : 'If your plan has no room, you can add a branch when you create it.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
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

            <BranchLocationFields idPrefix="org" value={location} onChange={setLocation} />

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3 space-y-1.5 sm:col-span-1">
                <Label htmlFor="org-plan-name">First plan *</Label>
                <Input id="org-plan-name" value={planName} placeholder="e.g. Monthly" onChange={(e) => setPlanName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="org-plan-price">Price *</Label>
                <Input id="org-plan-price" type="number" min={1} value={planPrice} onChange={(e) => setPlanPrice(e.target.value)} />
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

            {error && (
              <Alert variant="destructive" data-testid="new-org-error">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={buildMutation.isPending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={!ready} loading={buildMutation.isPending} onClick={submit}>
              <Building2 className="h-4 w-4" />
              Create organization
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BranchLimitDialog
        open={!!limit}
        branchName={name.trim()}
        message={limit?.message ?? ''}
        isOverQuota={!!limit?.isOverQuota}
        loading={buildMutation.isPending}
        onTryAgain={() => lastBody && buildMutation.mutate(lastBody)}
        onClose={() => setLimit(null)}
      />
    </>
  )
}
