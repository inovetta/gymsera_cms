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
import { areaRequestsApi, LIMIT_MESSAGES, SimilarArea, PendingArea } from '@/lib/api/area-requests'

/** What a branch form keeps about the location. Names are for showing; ids are what is saved. */
export interface BranchLocationValue {
  address: string
  cityId?: number
  cityName?: string
  areaId?: number
  areaName?: string
  /** NEW-265: a typed area / Google road or landmark waiting for review (sent instead of areaId). */
  areaRequestId?: number
  areaStatus?: 'pending_review' | 'rejected'
  areaRejectReason?: string | null
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
  /**
   * NEW-265 (A7): host forms keep a typed area as a pending request and offer Google roads and
   * landmarks. Off for admin forms, which pick real areas only (R-109 F7).
   */
  allowAreaRequests?: boolean
}

const NO_AREA = { areaId: undefined, areaName: undefined, areaRequestId: undefined, areaStatus: undefined, areaRejectReason: undefined }

/**
 * NEW-265 (A4): what a form sends for the area: the request, or the area, never both; nothing when
 * neither is set (the server keeps what it has). A refused request is never sent back.
 */
export const areaPayload = (v: BranchLocationValue): { areaId?: number; areaRequestId?: number } => {
  if (v.areaRequestId && v.areaStatus !== 'rejected') return { areaRequestId: v.areaRequestId }
  if (v.areaId) return { areaId: v.areaId }
  return {}
}

/** NEW-265: a gym read's `pendingArea` as form values. */
export const pendingAreaValue = (p?: PendingArea | null): Partial<BranchLocationValue> =>
  p ? { areaId: undefined, areaRequestId: p.requestId, areaName: p.name, areaStatus: p.status, areaRejectReason: p.rejectReason } : {}

const inRange = (n: number | undefined, max: number) => n === undefined || (Number.isFinite(n) && n >= -max && n <= max)
const parseCoordinate = (s: string): number | undefined => (s.trim() === '' ? undefined : Number(s))

/**
 * The branch location (Phase 7 P3 / P9 NEW-140), as the mobile Location step: city, then area inside
 * it, then the address, all from Google through our API; "Use current location"; the pin on a
 * Google map. A picked address fills the city, area, point and place id at once.
 */
export function BranchLocationFields({ value, onChange, addressError, idPrefix = 'branch', allowAreaRequests = false }: Props) {
  const [cityCentre, setCityCentre] = useState<[number, number] | null>(null)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)
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
      ...(p.area ? { ...NO_AREA, areaId: p.area.id, areaName: p.area.name } : NO_AREA),
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
            if (p.city) set({ cityId: p.city.id, cityName: p.city.name, ...NO_AREA })
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
            extended={allowAreaRequests}
            onPick={(p) => {
              if (p.area) set({ ...NO_AREA, areaId: p.area.id, areaName: p.area.name })
              // NEW-265: a Google road / landmark is a pending request (allowAreaRequests only).
              else if (p.areaRequest) set({ ...NO_AREA, areaRequestId: p.areaRequest.id, areaName: p.areaRequest.name, areaStatus: 'pending_review' })
            }}
            // NEW-259 (R-107): admins pick from the list only and the note says whom to ask.
            // NEW-265 (R-108): a host keeps what they typed as a pending request instead.
            renderNoMatch={(typed, close) => (allowAreaRequests && value.cityId
              ? <KeepTypedArea cityId={value.cityId} typed={typed} onDone={(patch) => { close(); set({ ...NO_AREA, ...patch }) }} />
              : <AreaNotFoundNote />)}
          />
          <AreaStatus value={value} />
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

/** NEW-265: "(under review)" / refused, under the area field. */
function AreaStatus({ value }: { value: BranchLocationValue }) {
  if (!value.areaRequestId || !value.areaName) return null
  if (value.areaStatus === 'rejected') {
    return (
      <p data-testid="area-status" className="text-xs text-destructive">
        {value.areaName} was not accepted{value.areaRejectReason ? `: ${value.areaRejectReason}` : ''}. Please pick your area again.
      </p>
    )
  }
  return <p data-testid="area-status" className="text-xs text-muted-foreground">{value.areaName} (under review)</p>
}

/**
 * NEW-265 (A7): "Not in the list? Keep what you typed": /check, then "Did you mean …?" when similar
 * areas exist, then the request (confirmNotListed). A name that is already an area (or alias) uses it.
 */
function KeepTypedArea({ cityId, typed, onDone }: { cityId: number; typed: string; onDone: (patch: Partial<BranchLocationValue>) => void }) {
  const [busy, setBusy] = useState(false)
  const [similar, setSimilar] = useState<SimilarArea[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await areaRequestsApi.create(cityId, typed, true)
      const answer = res.data
      if ('area' in answer) onDone({ areaId: answer.area.id, areaName: answer.area.name })
      else onDone({ areaRequestId: answer.areaRequest.id, areaName: answer.areaRequest.name, areaStatus: 'pending_review' })
    } catch (err) {
      setError(describeRequestError(err, 'We could not keep that area. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  const check = async () => {
    setBusy(true)
    setError(null)
    try {
      const { data } = await areaRequestsApi.check(cityId, typed)
      if (data.match) return onDone({ areaId: data.match.areaId, areaName: data.match.name })
      if (!data.canRequest) return setError(LIMIT_MESSAGES[data.reason ?? ''] ?? 'You cannot ask for another area right now.')
      if (data.similar.length) return setSimilar(data.similar)
      setBusy(false)
      await create()
    } catch (err) {
      setError(describeRequestError(err, 'We could not check that name. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1 px-2 py-1.5 text-sm" onMouseDown={(e) => e.preventDefault()}>
      {similar ? (
        <>
          <p className="font-medium">Did you mean …?</p>
          <ul className="space-y-1">
            {similar.map((s) => (
              <li key={`${s.name}-${s.areaId ?? 'p'}`}>
                {s.areaId ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => onDone({ areaId: s.areaId!, areaName: s.name })}>{s.name}</Button>
                ) : (
                  <span className="px-3 text-muted-foreground">{s.name} (under review)</span>
                )}
              </li>
            ))}
          </ul>
          <Button type="button" variant="outline" size="sm" loading={busy} onClick={create}>No, keep “{typed}”</Button>
        </>
      ) : (
        <Button type="button" variant="ghost" size="sm" loading={busy} onClick={check}>Not in the list? Keep “{typed}”</Button>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

/** NEW-259: what an empty area search says, the same sentence as the app. */
export function AreaNotFoundNote() {
  return (
    <p className="px-2 py-1.5 text-sm text-muted-foreground" data-testid="area-not-found">
      Can&apos;t find your area? Contact support at{' '}
      <a className="underline" href="mailto:support@gymsera.com">support@gymsera.com</a>.
    </p>
  )
}
