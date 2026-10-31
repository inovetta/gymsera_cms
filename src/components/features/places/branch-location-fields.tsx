'use client'

import { useState } from 'react'
import { LocateFixed } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MapPicker } from '@/components/features/map-picker'
import { PlaceSearch } from '@/components/features/places/place-search'
import { describeRequestError } from '@/lib/api/request-errors'
import { placesApi, PlaceDetails } from '@/lib/api/places'

/** What a branch form keeps about the location. Names are for showing; ids are what is saved. */
export interface BranchLocationValue {
  address: string
  cityId?: number
  cityName?: string
  areaId?: number
  areaName?: string
  latitude?: number
  longitude?: number
  googlePlaceId?: string
}

interface Props {
  value: BranchLocationValue
  onChange: (next: BranchLocationValue) => void
  /** A required address shows its error here. */
  addressError?: string | null
  idPrefix?: string
}

const inRange = (n: number | undefined, max: number) => n === undefined || (Number.isFinite(n) && n >= -max && n <= max)
const parseCoordinate = (s: string): number | undefined => (s.trim() === '' ? undefined : Number(s))

/**
 * The branch location (Phase 7 P3 / P9 NEW-140), as the mobile Location step: city, then area inside
 * it, then the address, all from Google through our API; "Use current location"; the pin on a
 * Google map. A picked address fills the city, area, point and place id at once.
 */
export function BranchLocationFields({ value, onChange, addressError, idPrefix = 'branch' }: Props) {
  const [cityCentre, setCityCentre] = useState<[number, number] | null>(null)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)
  const [areaError, setAreaError] = useState<string | null>(null)
  const [lat, setLat] = useState(value.latitude !== undefined ? String(value.latitude) : '')
  const [lng, setLng] = useState(value.longitude !== undefined ? String(value.longitude) : '')

  const set = (patch: Partial<BranchLocationValue>) => onChange({ ...value, ...patch })
  const setPoint = (la: number | undefined, lo: number | undefined, extra: Partial<BranchLocationValue> = {}) => {
    setLat(la !== undefined ? String(la) : '')
    setLng(lo !== undefined ? String(lo) : '')
    set({ latitude: la, longitude: lo, ...extra })
  }

  // A full address (search or current location) carries its own city and area.
  const fromAddress = (p: PlaceDetails, address?: string) =>
    setPoint(p.latitude ?? undefined, p.longitude ?? undefined, {
      address: address ?? p.formattedAddress ?? value.address,
      googlePlaceId: p.placeId ?? undefined,
      ...(p.city ? { cityId: p.city.id, cityName: p.city.name } : {}),
      ...(p.area ? { areaId: p.area.id, areaName: p.area.name } : { areaId: undefined, areaName: undefined }),
    })

  const useCurrentLocation = () => {
    setLocateError(null)
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocateError('This browser cannot share its location. Search for the address instead.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await placesApi.reverseGeocode(coords.latitude, coords.longitude)
          fromAddress(res.data)
        } catch (err) {
          setLocateError(describeRequestError(err, 'We could not find an address here. Please type it instead.'))
        } finally {
          setLocating(false)
        }
      },
      (err) => {
        setLocating(false)
        setLocateError(
          err.code === err.PERMISSION_DENIED
            ? 'Location is blocked for this site. Allow it in the browser settings, or search for the address.'
            : 'We could not get your location. Search for the address instead.'
        )
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  const latNumber = parseCoordinate(lat)
  const lngNumber = parseCoordinate(lng)
  const latInvalid = !inRange(latNumber, 90)
  const lngInvalid = !inRange(lngNumber, 180)

  return (
    <div className="space-y-4" data-testid="branch-location-fields">
      <div className="grid gap-3 sm:grid-cols-2">
        <PlaceSearch
          id={`${idPrefix}-city`}
          label="City"
          kind="city"
          value={value.cityName ?? ''}
          placeholder="Search for the city"
          onPick={(p) => {
            if (p.latitude != null && p.longitude != null) setCityCentre([p.latitude, p.longitude])
            if (p.city) set({ cityId: p.city.id, cityName: p.city.name, areaId: undefined, areaName: undefined })
          }}
        />
        <div>
          <PlaceSearch
            id={`${idPrefix}-area`}
            label="Area"
            kind="area"
            cityId={value.cityId}
            value={value.areaName ?? ''}
            disabled={!value.cityId}
            placeholder={value.cityId ? 'Search for the area' : 'Pick the city first'}
            onPick={(p) => p.area && set({ areaId: p.area.id, areaName: p.area.name })}
            renderNoMatch={(typed, close) => (
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={async () => {
                  close()
                  setAreaError(null)
                  try {
                    const res = await placesApi.createArea(value.cityId as number, typed)
                    set({ areaId: res.data.id, areaName: res.data.name })
                  } catch (err) {
                    setAreaError(describeRequestError(err, 'We could not add that area. Please try again.'))
                  }
                }}
              >
                Use “{typed}” as the area
              </button>
            )}
          />
          {areaError && <p role="alert" className="mt-1 text-xs text-destructive">{areaError}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <PlaceSearch
          id={`${idPrefix}-address`}
          label="Address"
          kind="address"
          cityId={value.cityId}
          value={value.address}
          placeholder="Search for the street address"
          onTextChange={(text) => set({ address: text, googlePlaceId: undefined })}
          onPick={(p) => fromAddress(p)}
        />
        {addressError && <p className="text-xs text-destructive">{addressError}</p>}
        <Button type="button" variant="outline" size="sm" onClick={useCurrentLocation} loading={locating}>
          <LocateFixed className="mr-1.5 h-4 w-4" /> Use current location
        </Button>
        {locateError && <p role="alert" className="text-xs text-destructive">{locateError}</p>}
      </div>

      <div className="space-y-2">
        <Label>Pin on the map</Label>
        <MapPicker
          latitude={latNumber !== undefined && !latInvalid ? latNumber : null}
          longitude={lngNumber !== undefined && !lngInvalid ? lngNumber : null}
          cityCoordinates={cityCentre}
          onChange={(la, lo) => setPoint(la, lo)}
        />
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-lat`} className="text-xs text-muted-foreground">Latitude</Label>
            <Input
              id={`${idPrefix}-lat`}
              inputMode="decimal"
              value={lat}
              aria-invalid={latInvalid}
              onChange={(e) => {
                setLat(e.target.value)
                set({ latitude: parseCoordinate(e.target.value) })
              }}
            />
            {latInvalid && <p className="text-xs text-destructive">Latitude must be between -90 and 90.</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-lng`} className="text-xs text-muted-foreground">Longitude</Label>
            <Input
              id={`${idPrefix}-lng`}
              inputMode="decimal"
              value={lng}
              aria-invalid={lngInvalid}
              onChange={(e) => {
                setLng(e.target.value)
                set({ longitude: parseCoordinate(e.target.value) })
              }}
            />
            {lngInvalid && <p className="text-xs text-destructive">Longitude must be between -180 and 180.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

/** True when the typed coordinates are usable (the form's Save checks it). */
export const locationValid = (v: BranchLocationValue) => inRange(v.latitude, 90) && inRange(v.longitude, 180)
