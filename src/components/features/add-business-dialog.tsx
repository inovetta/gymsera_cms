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
import { BranchLocationFields, BranchLocationValue, areaPayload } from '@/components/features/places/branch-location-fields'
import { BranchPhotosField } from '@/components/features/branches/branch-photos-field'
import { invalidateBranchCapacity } from '@/hooks/use-branch-quota'
import { hostApi, CreateBusinessPayload } from '@/lib/api/host'
import { classifyBranchError } from '@/lib/branches/errors'
import { DEFAULT_CLOSING_TIME, DEFAULT_OPENING_TIME, branchDraftMissing } from '@/lib/branches/rules'
import { firstPlanPackage } from '@/lib/plans/plan-display'

interface AddBusinessDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the new business's id once it exists, so the page can show it. */
  onCreated: (businessId?: string) => void
}

const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm'

/**
 * Add Business (enterprise spec §2.3, contract v2 POST /host/businesses): the business with its
 * first branch. The server reserves one branch of the plan and holds the branch until GymsEra
 * approves the business (`{ business, branch: null, heldFirstBranch: true }`). The branch follows
 * the same rules as Add Branch (area required, hours 06:00–22:00, at least 3 photos, a first plan).
 * Nothing is copied from another business (F9).
 */
export function AddBusinessDialog({ open, onOpenChange, onCreated }: AddBusinessDialogProps) {
  const queryClient = useQueryClient()
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [genderType, setGenderType] = React.useState('MIXED')
  const [contactPhone, setContactPhone] = React.useState('')
  const [location, setLocation] = React.useState<BranchLocationValue>({ address: '' })
  const [openingTime, setOpeningTime] = React.useState(DEFAULT_OPENING_TIME)
  const [closingTime, setClosingTime] = React.useState(DEFAULT_CLOSING_TIME)
  const [photos, setPhotos] = React.useState<string[]>([])
  const [planName, setPlanName] = React.useState('')
  const [planPrice, setPlanPrice] = React.useState('')
  const [planDuration, setPlanDuration] = React.useState('MONTHLY')
  const [error, setError] = React.useState<string | null>(null)
  const [limit, setLimit] = React.useState<{ message: string; isOverQuota: boolean } | null>(null)
  const [lastBody, setLastBody] = React.useState<CreateBusinessPayload | null>(null)

  React.useEffect(() => {
    if (!open) return
    setName('')
    setDescription('')
    setGenderType('MIXED')
    setContactPhone('')
    setLocation({ address: '' })
    setOpeningTime(DEFAULT_OPENING_TIME)
    setClosingTime(DEFAULT_CLOSING_TIME)
    setPhotos([])
    setPlanName('')
    setPlanPrice('')
    setPlanDuration('MONTHLY')
    setError(null)
    setLimit(null)
    setLastBody(null)
  }, [open])

  const buildMutation = useMutation({
    mutationFn: (body: CreateBusinessPayload) => hostApi.createBusiness(body),
    onSuccess: (res) => {
      setLimit(null)
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: ['host-businesses'] })
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      queryClient.invalidateQueries({ queryKey: ['business-quota'] })
      invalidateBranchCapacity(queryClient)
      onCreated(res.data?.business?.id)
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
  // The first branch is named after the business on approval; only its location, hours and photos are asked here.
  const missing = [
    ...(name.trim() ? [] : ['Business name']),
    ...branchDraftMissing({ branchName: name || 'first', location, photos, planName, planPrice: price }, false),
  ]

  const submit = () => {
    setError(null)
    const body: CreateBusinessPayload = {
      businessName: name.trim(),
      businessDescription: description.trim(),
      genderType,
      ...(contactPhone.trim() ? { contactPhone: contactPhone.trim() } : {}),
      images: photos,
      cityId: location.cityId,
      ...areaPayload(location), // NEW-265: the area, or a typed area waiting for review
      address: location.address.trim(),
      ...(location.latitude !== undefined ? { latitude: location.latitude } : {}),
      ...(location.longitude !== undefined ? { longitude: location.longitude } : {}),
      ...(location.googlePlaceId ? { googlePlaceId: location.googlePlaceId } : {}),
      openingTime,
      closingTime,
      // One period of the chosen type (R-80): the API counts QUARTERLY n as 3n months, YEARLY n as n years.
      packages: [firstPlanPackage(planName.trim(), price, planDuration)],
    }
    setLastBody(body)
    buildMutation.mutate(body)
  }

  return (
    <>
      <Dialog open={open && !limit} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Business</DialogTitle>
            <DialogDescription>
              A new brand of gym with its first branch. GymsEra reviews every business; the first branch opens
              when the business is approved. It reserves 1 branch of your plan.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="business-name">Business name (shown to travellers) *</Label>
              <Input id="business-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="business-description">Description</Label>
              <Input id="business-description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="business-gender">Who is it for</Label>
                <select id="business-gender" className={selectClass} value={genderType} onChange={(e) => setGenderType(e.target.value)}>
                  <option value="MIXED">Mixed (Male &amp; Female)</option>
                  <option value="MALE_ONLY">Male Only</option>
                  <option value="FEMALE_ONLY">Female Only</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="business-phone">Phone</Label>
                <Input id="business-phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+92 300 0000000" />
              </div>
            </div>

            <p className="pt-2 text-sm font-semibold">First branch</p>
            <BranchLocationFields idPrefix="business" value={location} onChange={setLocation} allowAreaRequests />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="business-opens">Opens</Label>
                <Input id="business-opens" type="time" value={openingTime} onChange={(e) => setOpeningTime(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="business-closes">Closes</Label>
                <Input id="business-closes" type="time" value={closingTime} onChange={(e) => setClosingTime(e.target.value)} />
              </div>
            </div>

            <BranchPhotosField idPrefix="business" value={photos} onChange={setPhotos} />

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3 space-y-1.5 sm:col-span-1">
                <Label htmlFor="business-plan-name">First plan *</Label>
                <Input id="business-plan-name" value={planName} placeholder="e.g. Monthly" onChange={(e) => setPlanName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="business-plan-price">Price *</Label>
                <Input id="business-plan-price" type="number" min={1} value={planPrice} onChange={(e) => setPlanPrice(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="business-plan-duration">Billing</Label>
                <select id="business-plan-duration" className={selectClass} value={planDuration} onChange={(e) => setPlanDuration(e.target.value)}>
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly (3 months)</option>
                  <option value="YEARLY">Yearly</option>
                </select>
              </div>
            </div>

            {missing.length > 0 && (
              <p data-testid="add-business-missing" className="text-xs text-muted-foreground">Still needed: {missing.join(', ')}.</p>
            )}
            {error && (
              <Alert variant="destructive" data-testid="add-business-error">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={buildMutation.isPending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={missing.length > 0} loading={buildMutation.isPending} onClick={submit}>
              <Building2 className="h-4 w-4" />
              Submit for review
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
