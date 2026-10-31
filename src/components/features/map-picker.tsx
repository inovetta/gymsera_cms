'use client'

import { useEffect, useState } from 'react'
import { APIProvider, Map, Marker, useMap, MapMouseEvent } from '@vis.gl/react-google-maps'
import { MapPin } from 'lucide-react'

interface MapPickerProps {
  latitude?: number | null
  longitude?: number | null
  /** The picked city's centre (from the Places pick), used until the branch has a pin. */
  cityCoordinates?: [number, number] | null
  onChange: (lat: number, lng: number) => void
  className?: string
}

// Phase 7 P9 (NEW-140): a Google map drawn with the web key (Maps JavaScript API only). It never
// searches: city, area and address come from our API (lib/api/places.ts, server key).
const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ''

// No pin and no city yet: the whole country, not an invented city.
const COUNTRY_VIEW = { center: { lat: 30.3753, lng: 69.3451 }, zoom: 5 }
const PIN_ZOOM = 16
const CITY_ZOOM = 12

const round = (n: number) => parseFloat(n.toFixed(6))

/** Moves the map when the pin or the city changes from outside (a Places pick). */
function FollowTarget({ target, zoom }: { target: google.maps.LatLngLiteral | null; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    if (!map || !target) return
    map.panTo(target)
    map.setZoom(zoom)
  }, [map, target?.lat, target?.lng, zoom]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

export function MapPicker({ latitude, longitude, cityCoordinates, onChange, className }: MapPickerProps) {
  const pin = latitude != null && longitude != null ? { lat: latitude, lng: longitude } : null
  const city = cityCoordinates ? { lat: cityCoordinates[0], lng: cityCoordinates[1] } : null
  const [initial] = useState(() =>
    pin ? { center: pin, zoom: PIN_ZOOM } : city ? { center: city, zoom: CITY_ZOOM } : COUNTRY_VIEW
  )

  if (!MAPS_KEY) {
    return (
      <div className={className}>
        <div className="flex h-[120px] items-center justify-center rounded-lg border bg-muted text-center text-sm text-muted-foreground" data-testid="map-unavailable">
          <span className="px-4">The map is not available here. Pick the address from the search, or enter the coordinates below.</span>
        </div>
      </div>
    )
  }

  const place = (e: { latLng?: google.maps.LatLng | null } | MapMouseEvent) => {
    const ll = 'detail' in e ? e.detail.latLng : e.latLng ? { lat: e.latLng.lat(), lng: e.latLng.lng() } : null
    if (ll) onChange(round(ll.lat), round(ll.lng))
  }

  return (
    <div className={className}>
      <APIProvider apiKey={MAPS_KEY}>
        <div className="overflow-hidden rounded-lg border" style={{ height: '280px', width: '100%' }}>
          <Map
            defaultCenter={initial.center}
            defaultZoom={initial.zoom}
            gestureHandling="cooperative"
            mapTypeControl={false}
            streetViewControl={false}
            fullscreenControl={false}
            onClick={place}
            style={{ width: '100%', height: '100%' }}
          >
            {pin && <Marker position={pin} draggable onDragEnd={place} />}
            <FollowTarget target={pin ?? city} zoom={pin ? PIN_ZOOM : CITY_ZOOM} />
          </Map>
        </div>
      </APIProvider>
      <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
        <MapPin className="h-3 w-3" /> Click the map or drag the pin to set the exact spot
      </p>
    </div>
  )
}
