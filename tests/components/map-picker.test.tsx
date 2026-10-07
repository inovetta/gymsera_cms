import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MapPicker, getCityCoordinates } from '@/components/features/map-picker'
import L from 'leaflet'

const mockMap = {
  setView: vi.fn(),
  panTo: vi.fn(),
  getZoom: vi.fn(() => 13),
  remove: vi.fn(),
  on: vi.fn(),
}

const mockMarker = {
  addTo: vi.fn().mockReturnThis(),
  bindPopup: vi.fn().mockReturnThis(),
  openPopup: vi.fn().mockReturnThis(),
  on: vi.fn(),
  setLatLng: vi.fn(),
  getLatLng: vi.fn(() => ({ lat: 31.5204, lng: 74.3587 })),
}

vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    map: vi.fn(() => mockMap),
    tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
    marker: vi.fn(() => mockMarker),
  },
}))

describe('MapPicker — City Coordinates Centering (NEW-46e)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves known Pakistan city coordinates', () => {
    expect(getCityCoordinates('Islamabad')).toEqual([33.6844, 73.0479])
    expect(getCityCoordinates('Karachi')).toEqual([24.8607, 67.0011])
    expect(getCityCoordinates('Lahore')).toEqual([31.5204, 74.3587])
    expect(getCityCoordinates('Rawalpindi')).toEqual([33.5651, 73.0169])
    expect(getCityCoordinates('Unknown City')).toBeNull()
  })

  it('centres the map on selected city coordinates when known and lat/lng are empty', async () => {
    render(<MapPicker cityName="Islamabad" onChange={vi.fn()} />)

    await waitFor(() => {
      expect(L.map).toHaveBeenCalled()
    })

    const mapCallArgs = (L.map as any).mock.calls[0][1]
    expect(mapCallArgs.center).toEqual([33.6844, 73.0479])
  })

  it('updates center when cityName prop changes and no explicit coordinates were set', async () => {
    const { rerender } = render(<MapPicker cityName="Lahore" onChange={vi.fn()} />)

    await waitFor(() => {
      expect(L.map).toHaveBeenCalled()
    })

    rerender(<MapPicker cityName="Karachi" onChange={vi.fn()} />)

    await waitFor(() => {
      expect(mockMap.setView).toHaveBeenCalledWith([24.8607, 67.0011], 13)
    })
  })
})
