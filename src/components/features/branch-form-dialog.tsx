'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { X } from 'lucide-react'
import { TenantBranch, CreateTenantBranchPayload, UpdateTenantBranchPayload } from '@/lib/api/admin'
import { MapPicker } from './map-picker'

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
  cities: City[]
  onSubmit: (payload: CreateTenantBranchPayload | UpdateTenantBranchPayload) => void
  loading?: boolean
}

const defaultForm = (): CreateTenantBranchPayload => ({
  branchName: '',
  address: '',
  cityId: 0,
})

export function BranchFormDialog({ open, onOpenChange, mode, branch, cities, onSubmit, loading }: Props) {
  const [form, setForm] = useState<CreateTenantBranchPayload & UpdateTenantBranchPayload>(defaultForm())
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
      } else {
        setForm(defaultForm())
      }
      setFacilityInput('')
    }
  }, [open, mode, branch])

  const selectedCity = cities.find((c) => c.id === form.cityId)
  const areas = selectedCity?.areas ?? []

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
    const payload: any = { ...form }
    if (!payload.cityId) delete payload.cityId
    if (!payload.areaId) delete payload.areaId
    if (!payload.phone) delete payload.phone
    if (!payload.openingTime) delete payload.openingTime
    if (!payload.closingTime) delete payload.closingTime
    if (!payload.latitude) delete payload.latitude
    if (!payload.longitude) delete payload.longitude
    onSubmit(payload)
  }

  const canSubmit = form.branchName.trim().length > 0 && (mode === 'edit' || (form.cityId && form.address.trim().length > 0))

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

          <div>
            <Label className="mb-2 block">Address {mode === 'create' && '*'}</Label>
            <Input value={form.address ?? ''} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} placeholder="Street address" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-2 block">City {mode === 'create' && '*'}</Label>
              <Select value={String(form.cityId || '')} onValueChange={(v) => setForm((p) => ({ ...p, cityId: Number(v), areaId: undefined }))}>
                <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
                <SelectContent>
                  {cities.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block">Area</Label>
              <Select value={String(form.areaId ?? '')} onValueChange={(v) => setForm((p) => ({ ...p, areaId: v ? Number(v) : undefined }))} disabled={!areas.length}>
                <SelectTrigger><SelectValue placeholder={areas.length ? 'Select area' : 'Select city first'} /></SelectTrigger>
                <SelectContent>
                  {areas.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

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

          <div>
            <Label className="mb-2 block">Location on Map</Label>
            <MapPicker
              latitude={form.latitude ?? null}
              longitude={form.longitude ?? null}
              onChange={(lat, lng) => setForm((p) => ({ ...p, latitude: lat, longitude: lng }))}
            />
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <Label className="mb-1 block text-xs text-muted-foreground">Latitude</Label>
                <Input
                  type="number"
                  step="any"
                  value={form.latitude ?? ''}
                  onChange={(e) => setForm((p) => ({ ...p, latitude: e.target.value ? Number(e.target.value) : undefined }))}
                  placeholder="e.g. 31.4150"
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs text-muted-foreground">Longitude</Label>
                <Input
                  type="number"
                  step="any"
                  value={form.longitude ?? ''}
                  onChange={(e) => setForm((p) => ({ ...p, longitude: e.target.value ? Number(e.target.value) : undefined }))}
                  placeholder="e.g. 73.0740"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>

          {mode === 'edit' && (
            <div>
              <Label className="mb-2 block">Status</Label>
              <Select value={form.status ?? 'ACTIVE'} onValueChange={(v: any) => setForm((p) => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

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
