'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MapPicker } from '@/components/features/map-picker'
import { citiesApi, parseCities } from '@/lib/api/cities'
import type { UpdateListingContentPayload } from '@/lib/api/host'
import { changedFields, COUNTRIES } from '@/lib/listing/content'
import { SaveBar } from './section-card'
import { useListingSave } from './use-listing-save'
import type { SectionEditorProps } from './types'

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const parseCoordinate = (value: string): number | undefined => (value.trim() === '' ? undefined : Number(value))

/**
 * Location & map (mobile EditLocationScreen): address lines, city and area, postal code, country,
 * phone and the pin. `address` and `addressLine1` carry the same text, as the mobile save sends.
 */
export function LocationSection({ branchId, branch, onClose }: SectionEditorProps) {
  const { save, saving, error, approval } = useListingSave(branchId)
  const citiesQuery = useQuery({ queryKey: ['cities'], queryFn: () => citiesApi.getCities(), staleTime: 5 * 60_000 })
  const cities = parseCities(citiesQuery.data?.data)

  const [line1, setLine1] = useState(text(branch.addressLine1 || branch.address))
  const [line2, setLine2] = useState(text(branch.addressLine2))
  const [cityId, setCityId] = useState<number | undefined>(branch.cityId ?? undefined)
  const [areaId, setAreaId] = useState<number | undefined>(branch.areaId ?? undefined)
  const [postalCode, setPostalCode] = useState(text(branch.postalCode))
  const [country, setCountry] = useState(text(branch.country) || 'Pakistan')
  const [phone, setPhone] = useState(text(branch.phone))
  const [lat, setLat] = useState(text(branch.latitude))
  const [lng, setLng] = useState(text(branch.longitude))

  const city = cities.find((c) => c.id === cityId)
  const areas = city?.areas ?? []
  const latNumber = parseCoordinate(lat)
  const lngNumber = parseCoordinate(lng)
  const latInvalid = latNumber !== undefined && !(latNumber >= -90 && latNumber <= 90)
  const lngInvalid = lngNumber !== undefined && !(lngNumber >= -180 && lngNumber <= 180)
  const line1Invalid = line1.trim() === ''

  const draft: UpdateListingContentPayload = {
    address: line1,
    addressLine1: line1,
    addressLine2: line2,
    postalCode,
    country,
    phone,
    ...(cityId !== undefined ? { cityId } : {}),
    ...(areaId !== undefined ? { areaId } : {}),
    ...(latNumber !== undefined && !latInvalid ? { latitude: latNumber } : {}),
    ...(lngNumber !== undefined && !lngInvalid ? { longitude: lngNumber } : {}),
  }
  const patch = changedFields(branch, draft)
  const dirty = Object.keys(patch).length > 0

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="listing-address1">Address</Label>
        <Input id="listing-address1" value={line1} onChange={(e) => setLine1(e.target.value)} aria-invalid={line1Invalid} />
        {line1Invalid && <p className="text-xs text-destructive">Address is required.</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="listing-address2">Address line 2</Label>
        <Input id="listing-address2" value={line2} onChange={(e) => setLine2(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>City</Label>
          <Select
            value={cityId !== undefined ? String(cityId) : ''}
            onValueChange={(v) => {
              setCityId(Number(v))
              setAreaId(undefined)
            }}
          >
            <SelectTrigger aria-label="City"><SelectValue placeholder="Select a city" /></SelectTrigger>
            <SelectContent>
              {cities.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Area</Label>
          <Select value={areaId !== undefined ? String(areaId) : ''} onValueChange={(v) => setAreaId(Number(v))} disabled={areas.length === 0}>
            <SelectTrigger aria-label="Area"><SelectValue placeholder={areas.length ? 'Select an area' : 'No areas'} /></SelectTrigger>
            <SelectContent>
              {areas.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
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
      <div className="space-y-2">
        <Label>Pin on the map</Label>
        <MapPicker
          latitude={latNumber !== undefined && !latInvalid ? latNumber : null}
          longitude={lngNumber !== undefined && !lngInvalid ? lngNumber : null}
          cityName={city?.name ?? null}
          onChange={(la, lo) => {
            setLat(String(la))
            setLng(String(lo))
          }}
          className="w-full"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="listing-lat">Latitude</Label>
            <Input id="listing-lat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} aria-invalid={latInvalid} />
            {latInvalid && <p className="text-xs text-destructive">Latitude must be between -90 and 90.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="listing-lng">Longitude</Label>
            <Input id="listing-lng" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} aria-invalid={lngInvalid} />
            {lngInvalid && <p className="text-xs text-destructive">Longitude must be between -180 and 180.</p>}
          </div>
        </div>
      </div>
      <SaveBar
        dirty={dirty}
        valid={!line1Invalid && !latInvalid && !lngInvalid}
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
