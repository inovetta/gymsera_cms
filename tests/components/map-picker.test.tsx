import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * MapPicker (Phase 7 P9, NEW-140): a Google map drawn with the web key; it never searches.
 * Replaces the Leaflet / OpenStreetMap picker and its typed-in list of city centres (NEW-46e):
 * the centre now comes from the city the host picked through /places.
 */
const mapProps: any[] = []
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ apiKey, children }: any) => <div data-testid="provider" data-key={apiKey}>{children}</div>,
  Map: (props: any) => {
    mapProps.push(props)
    return (
      <div data-testid="map">
        <button type="button" onClick={() => props.onClick({ detail: { latLng: { lat: 31.123456789, lng: 74.987654321 } } })}>map click</button>
        {props.children}
      </div>
    )
  },
  Marker: ({ onDragEnd }: any) => (
    <button type="button" onClick={() => onDragEnd({ latLng: { lat: () => 24.8607001, lng: () => 67.0011009 } })}>drag pin</button>
  ),
  useMap: () => null,
}))

const load = async (key: string) => {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', key)
  return (await import('@/components/features/map-picker')).MapPicker
}

afterEach(() => {
  vi.unstubAllEnvs()
  mapProps.length = 0
})

describe('MapPicker', () => {
  it('without the web key: plain words for the person, no setting name, no map', async () => {
    const MapPicker = await load('')
    render(<MapPicker onChange={vi.fn()} />)
    expect(screen.getByTestId('map-unavailable')).toHaveTextContent('The map is not available here')
    expect(document.body.textContent).not.toMatch(/NEXT_PUBLIC|API_KEY/)
    expect(screen.queryByTestId('map')).not.toBeInTheDocument()
  })

  it('draws the Google map with the web key, centred on the pin', async () => {
    const MapPicker = await load('web-key')
    render(<MapPicker latitude={31.5} longitude={74.3} onChange={vi.fn()} />)
    expect(screen.getByTestId('provider')).toHaveAttribute('data-key', 'web-key')
    expect(mapProps[0]).toMatchObject({ defaultCenter: { lat: 31.5, lng: 74.3 }, defaultZoom: 16 })
  })

  it('no pin yet: the picked city centre, else the whole country (no invented city)', async () => {
    const MapPicker = await load('web-key')
    const { unmount } = render(<MapPicker cityCoordinates={[33.6844, 73.0479]} onChange={vi.fn()} />)
    expect(mapProps[0]).toMatchObject({ defaultCenter: { lat: 33.6844, lng: 73.0479 }, defaultZoom: 12 })
    unmount()
    render(<MapPicker onChange={vi.fn()} />)
    expect(mapProps[mapProps.length - 1].defaultZoom).toBe(5)
    expect(screen.queryByRole('button', { name: 'drag pin' })).not.toBeInTheDocument()
  })

  it('a click on the map and a dragged pin set the point, rounded to 6 decimals', async () => {
    const MapPicker = await load('web-key')
    const onChange = vi.fn()
    render(<MapPicker latitude={31.5} longitude={74.3} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'map click' }))
    expect(onChange).toHaveBeenLastCalledWith(31.123457, 74.987654)
    fireEvent.click(screen.getByRole('button', { name: 'drag pin' }))
    expect(onChange).toHaveBeenLastCalledWith(24.8607, 67.001101)
  })
})
