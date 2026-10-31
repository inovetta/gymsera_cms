'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BranchLocationFields, BranchLocationValue, locationValid } from '@/components/features/places/branch-location-fields'
import { citiesApi, parseCities } from '@/lib/api/cities'
import type { UpdateListingContentPayload } from '@/lib/api/host'
import { changedFields, COUNTRIES } from '@/lib/listing/content'
import { SaveBar } from './section-card'
import { useListingSave } from './use-listing-save'
import type { SectionEditorProps } from './types'

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const coordinate = (v: unknown): number | undefined => (v === null || v === undefined || v === '' ? undefined : Number(v))

/**
 * Location & map (mobile EditLocationScreen): address lines, city and area, postal code, country,
 * phone and the pin. `address` and `addressLine1` carry the same text, as the mobile save sends.
 * City, area and address come from Google through our API (NEW-140, branch-location-fields.tsx).
 */
export function LocationSection({ branchId, branch, onClose }: SectionEditorProps) {
  const { save, saving, error, approval } = useListingSave(branchId)
  const citiesQuery = useQuery({ queryKey: ['cities'], queryFn: () => citiesApi.getCities(), staleTime: 5 * 60_000 })
  const cities = parseCities(citiesQuery.data?.data)

  const [location, setLocation] = useState<BranchLocationValue>({
    address: text(branch.addressLine1 || branch.address),
    cityId: branch.cityId ?? undefined,
    areaId: branch.areaId ?? undefined,
    latitude: coordinate(branch.latitude),
    longitude: coordinate(branch.longitude),
  })
  const [line2, setLine2] = useState(text(branch.addressLine2))
  const [postalCode, setPostalCode] = useState(text(branch.postalCode))
  const [country, setCountry] = useState(text(branch.country) || 'Pakistan')
  const [phone, setPhone] = useState(text(branch.phone))

  // Names of the saved city and area until the host picks new ones.
  const savedCity = cities.find((c) => c.id === branch.cityId)
  const shown: BranchLocationValue = {
    ...location,
    cityName: location.cityName ?? (location.cityId === branch.cityId ? savedCity?.name : undefined),
    areaName: location.areaName ?? (location.areaId === branch.areaId ? savedCity?.areas?.find((a) => a.id === branch.areaId)?.name : undefined),
  }
  const line1 = location.address
  const line1Invalid = line1.trim() === ''

  const draft: UpdateListingContentPayload = {
    address: line1,
    addressLine1: line1,
    addressLine2: line2,
    postalCode,
    country,
    phone,
    ...(location.cityId !== undefined ? { cityId: location.cityId } : {}),
    ...(location.areaId !== undefined ? { areaId: location.areaId } : {}),
    ...(location.latitude !== undefined && locationValid(location) ? { latitude: location.latitude } : {}),
    ...(location.longitude !== undefined && locationValid(location) ? { longitude: location.longitude } : {}),
    ...(location.googlePlaceId ? { googlePlaceId: location.googlePlaceId } : {}),
  }
  const patch = changedFields(branch, draft)
  const dirty = Object.keys(patch).length > 0

  return (
    <div className="space-y-4">
      <BranchLocationFields
        idPrefix="listing"
        value={shown}
        onChange={setLocation}
        addressError={line1Invalid ? 'Address is required.' : null}
      />
      <div className="space-y-2">
        <Label htmlFor="listing-address2">Address line 2</Label>
        <Input id="listing-address2" value={line2} onChange={(e) => setLine2(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="listing-postal">Postal code</Label>
          <Input id="listing-postal" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Country</Label>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger aria-label="Country"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from(new Set([...COUNTRIES, country])).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="listing-phone">Branch phone</Label>
        <Input id="listing-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <SaveBar
        dirty={dirty}
        valid={!line1Invalid && locationValid(location)}
        saving={saving}
        error={error}
        approval={approval}
        onSave={async () => {
          if (await save(patch, 'Location saved')) onClose()
        }}
        onCancel={onClose}
      />
    </div>
  )
}
