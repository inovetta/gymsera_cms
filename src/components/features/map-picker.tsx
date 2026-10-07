'use client'

import { useEffect, useRef } from 'react'
import { MapPin } from 'lucide-react'

interface MapPickerProps {
  latitude?: number | null
  longitude?: number | null
  cityName?: string | null
  cityCoordinates?: [number, number] | null
  onChange: (lat: number, lng: number) => void
  className?: string
}

// Default center: Lahore, Pakistan
const DEFAULT_CENTER: [number, number] = [31.5204, 74.3587]
const DEFAULT_ZOOM = 13

export const KNOWN_CITY_COORDINATES: Record<string, [number, number]> = {
  karachi: [24.8607, 67.0011],
  lahore: [31.5204, 74.3587],
  islamabad: [33.6844, 73.0479],
  rawalpindi: [33.5651, 73.0169],
  faisalabad: [31.4504, 73.1350],
  peshawar: [34.0151, 71.5249],
  multan: [30.1575, 71.5249],
  quetta: [30.1798, 66.9750],
  gujranwala: [32.1877, 74.1945],
  sialkot: [32.4945, 74.5229],
  hyderabad: [25.3960, 68.3578],
}

export function getCityCoordinates(cityName?: string | null): [number, number] | null {
  if (!cityName) return null
  const normalized = cityName.trim().toLowerCase()
  for (const [key, coords] of Object.entries(KNOWN_CITY_COORDINATES)) {
    if (normalized.includes(key)) {
      return coords
    }
  }
  return null
}

export function MapPicker({ latitude, longitude, cityName, cityCoordinates, onChange, className }: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import('leaflet').Map | null>(null)
  const markerRef = useRef<import('leaflet').Marker | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) return
    let cancelled = false

    const init = async () => {
      const L = (await import('leaflet')).default
      if (cancelled || !containerRef.current) return

      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const resolvedCityCoords = cityCoordinates ?? getCityCoordinates(cityName)
      const center: [number, number] =
        latitude != null && longitude != null
          ? [latitude, longitude]
          : (resolvedCityCoords ?? DEFAULT_CENTER)

      const map = L.map(containerRef.current!, {
        center,
        zoom: DEFAULT_ZOOM,
        zoomControl: true,
      })
      // Set ref immediately so cleanup can always call map.remove()
      mapRef.current = map

      if (cancelled) {
        map.remove()
        mapRef.current = null
        return
      }

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      const marker = L.marker(center, { draggable: true }).addTo(map)
      marker.bindPopup('Drag to set location').openPopup()

      marker.on('dragend', () => {
        const { lat, lng } = marker.getLatLng()
        onChange(parseFloat(lat.toFixed(6)), parseFloat(lng.toFixed(6)))
      })

      map.on('click', (e) => {
        const { lat, lng } = e.latlng
        marker.setLatLng([lat, lng])
        onChange(parseFloat(lat.toFixed(6)), parseFloat(lng.toFixed(6)))
      })

      markerRef.current = marker
    }

    init()

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      markerRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync marker when lat/lng props change externally (e.g. geocode result)
  useEffect(() => {
    if (!markerRef.current || latitude == null || longitude == null) return
    markerRef.current.setLatLng([latitude, longitude])
    mapRef.current?.panTo([latitude, longitude])
  }, [latitude, longitude])

  // Sync map center when city changes and no explicit lat/lng coordinates were set
  useEffect(() => {
    if (!mapRef.current) return
    const resolvedCityCoords = cityCoordinates ?? getCityCoordinates(cityName)
    if (!resolvedCityCoords) return

    if (latitude == null || longitude == null) {
      mapRef.current.setView(resolvedCityCoords, mapRef.current.getZoom() ?? DEFAULT_ZOOM)
      markerRef.current?.setLatLng(resolvedCityCoords)
    }
  }, [cityName, cityCoordinates, latitude, longitude])

  return (
    <div className={className}>
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossOrigin=""
      />
      <div
        ref={containerRef}
        style={{ height: '280px', width: '100%', borderRadius: '8px', border: '1px solid #e5e7eb', zIndex: 0 }}
      />
      <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
        <MapPin className="h-3 w-3" /> Click on the map or drag the pin to set the exact location
      </p>
    </div>
  )
}
