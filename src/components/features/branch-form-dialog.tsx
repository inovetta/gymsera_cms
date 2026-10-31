'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { X } from 'lucide-react'
import { TenantBranch, CreateTenantBranchPayload, UpdateTenantBranchPayload } from '@/lib/api/admin'
import { BranchLocationFields, BranchLocationValue, locationValid } from './places/branch-location-fields'

const COMMON_FACILITIES = [
  'AC', 'Wi-Fi', 'Parking', 'Lockers', 'Showers', 'Pool', 'Sauna', 'Café',
  'Personal Training', 'MMA', 'Boxing', 'Wrestling', 'Yoga', 'Zumba', 'Pilates', 'Spa',
]

interface City {
  id: number
  name: string
  areas?: { id: number; name: string }[]
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  branch?: TenantBranch
  /** Our cities, for the names of an existing branch's saved city and area. */
  cities?: City[]
  onSubmit: (payload: CreateTenantBranchPayload | UpdateTenantBranchPayload) => void
  loading?: boolean
}

const defaultForm = (): CreateTenantBranchPayload => ({
  branchName: '',
  address: '',
  cityId: 0,
})

export function BranchFormDialog({ open, onOpenChange, mode, branch, cities = [], onSubmit, loading }: Props) {
  const [form, setForm] = useState<CreateTenantBranchPayload & UpdateTenantBranchPayload>(defaultForm())
  // NEW-140: the location block's own fields (names shown in the searches, the Google place id).
  const [location, setLocation] = useState<BranchLocationValue>({ address: '' })
  const [facilityInput, setFacilityInput] = useState('')

  useEffect(() => {
    if (open) {
      if (mode === 'edit' && branch) {
        setForm({
          branchName: branch.branchName,
          address: branch.address ?? '',
          cityId: branch.cityId ?? 0,
          areaId: branch.areaId ?? undefined,
          phone: branch.phone ?? '',
          openingTime: branch.openingTime ?? '',
          closingTime: branch.closingTime ?? '',
          facilities: branch.facilitiesJson ?? [],
          latitude: branch.latitude ? Number(branch.latitude) : undefined,
          longitude: branch.longitude ? Number(branch.longitude) : undefined,
          status: branch.status,
        })
        const city = cities.find((c) => c.id === branch.cityId)
        setLocation({
          address: branch.address ?? '',
          cityId: branch.cityId ?? undefined,
          cityName: city?.name,
          areaId: branch.areaId ?? undefined,
          areaName: city?.areas?.find((a) => a.id === branch.areaId)?.name,
          latitude: branch.latitude ? Number(branch.latitude) : undefined,
          longitude: branch.longitude ? Number(branch.longitude) : undefined,
        })
      } else {
        setForm(defaultForm())
        setLocation({ address: '' })
      }
      setFacilityInput('')
    }
  }, [open, mode, branch]) // eslint-disable-line react-hooks/exhaustive-deps

  const addFacility = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const current = form.facilities ?? []
    if (!current.includes(trimmed)) {
      setForm((p) => ({ ...p, facilities: [...current, trimmed] }))
    }
    setFacilityInput('')
  }

  const removeFacility = (name: string) => {
    setForm((p) => ({ ...p, facilities: (p.facilities ?? []).filter((f) => f !== name) }))
  }

  const handleSubmit = () => {
    const payload: any = {
      ...form,
      address: location.address,
      cityId: location.cityId,
      areaId: location.areaId,
      latitude: location.latitude,
      longitude: location.longitude,
      googlePlaceId: location.googlePlaceId,
    }
    if (!payload.googlePlaceId) delete payload.googlePlaceId
    if (!payload.cityId) delete payload.cityId
    if (!payload.areaId) delete payload.areaId
    if (!payload.phone) delete payload.phone
    if (!payload.openingTime) delete payload.openingTime
    if (!payload.closingTime) delete payload.closingTime
    if (!payload.latitude) delete payload.latitude
    if (!payload.longitude) delete payload.longitude
    onSubmit(payload)
  }

  const canSubmit =
    form.branchName.trim().length > 0 &&
    locationValid(location) &&
    (mode === 'edit' || (!!location.cityId && location.address.trim().length > 0))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Create Branch' : 'Edit Branch'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div>
            <Label className="mb-2 block">Branch Name *</Label>
            <Input value={form.branchName} onChange={(e) => setForm((p) => ({ ...p, branchName: e.target.value }))} placeholder="e.g. Main Branch" />
          </div>

          <BranchLocationFields
            idPrefix="admin-branch"
            value={location}
            onChange={setLocation}
            addressError={mode === 'create' && !location.address.trim() ? 'Address is required.' : null}
          />

          <div>
            <Label className="mb-2 block">Phone</Label>
            <Input value={form.phone ?? ''} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="+92..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-2 block">Opening Time</Label>
              <Input type="time" value={form.openingTime ?? ''} onChange={(e) => setForm((p) => ({ ...p, openingTime: e.target.value }))} />
            </div>
            <div>
              <Label className="mb-2 block">Closing Time</Label>
              <Input type="time" value={form.closingTime ?? ''} onChange={(e) => setForm((p) => ({ ...p, closingTime: e.target.value }))} />
            </div>
          </div>

          {/* No status control here. Activating/deactivating a branch has to
              settle billing capacity (credit or consume a slot, cascade member
              subscriptions and staff, write a CapacityEvent), which this form
              cannot do — editing a branch's details must never be able to
              change whether it counts against the host's plan. Use the
              Disable/Enable action on the branch row instead: it routes
              through deleteBranch/restoreBranch, which do all of that. The
              backend rejects a status change from here outright
              (branch_status_immutable_here). */}

          <div>
            <Label className="mb-2 block">Facilities</Label>
            {(form.facilities ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(form.facilities ?? []).map((f) => (
                  <Badge key={f} variant="secondary" className="gap-1 pr-1">
                    {f}
                    <button onClick={() => removeFacility(f)} className="hover:text-destructive ml-0.5"><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {COMMON_FACILITIES.filter((f) => !(form.facilities ?? []).includes(f)).map((f) => (
                <button key={f} onClick={() => addFacility(f)} className="text-xs px-2 py-1 rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                  + {f}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={facilityInput} onChange={(e) => setFacilityInput(e.target.value)} placeholder="Custom facility..." className="h-8 text-sm" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFacility(facilityInput) } }} />
              <Button variant="outline" size="sm" onClick={() => addFacility(facilityInput)} disabled={!facilityInput.trim()}>Add</Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} loading={loading} disabled={!canSubmit}>
            {mode === 'create' ? 'Create Branch' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
