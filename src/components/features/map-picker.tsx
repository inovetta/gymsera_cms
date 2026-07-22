'use client'

import { useEffect, useRef } from 'react'
import { MapPin } from 'lucide-react'

interface MapPickerProps {
  latitude?: number | null
  longitude?: number | null
  onChange: (lat: number, lng: number) => void
  className?: string
}

// Default center: Lahore, Pakistan
const DEFAULT_CENTER: [number, number] = [31.5204, 74.3587]
const DEFAULT_ZOOM = 13

export function MapPicker({ latitude, longitude, onChange, className }: MapPickerProps) {
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

      const center: [number, number] =
        latitude != null && longitude != null
          ? [latitude, longitude]
          : DEFAULT_CENTER

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
