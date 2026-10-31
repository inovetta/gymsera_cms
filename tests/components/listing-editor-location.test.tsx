import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { citiesApi } from '@/lib/api/cities'
import { branchFixture, httpError, renderEditor } from '../fixtures/listing'
import { ok } from '../fixtures/team'
import { fakePlaces, pickPlace } from '../fixtures/places'

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'branch-1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div data-testid="header" /> }))
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1', fullName: 'Test Person', role: 'GYM_HOST' }, logout: vi.fn(), isPlatformAdmin: false, isGymHost: true, isBranchManager: false }),
}))
// Leaflet needs a real browser; the picker's own behaviour is covered in map-picker.test.tsx.
vi.mock('@/components/features/map-picker', () => ({
  MapPicker: ({ onChange }: { onChange: (lat: number, lng: number) => void }) => (
    <button type="button" onClick={() => onChange(31.55, 74.35)}>Drop pin</button>
  ),
}))

beforeEach(() => {
  vi.spyOn(citiesApi, 'getCities').mockResolvedValue(
    ok([{ id: 1, name: 'Lahore', isActive: true, createdAt: '', areas: [{ id: 10, cityId: 1, name: 'Gulberg' }] }]) as never
  )
})
afterEach(() => vi.restoreAllMocks())
const open = async () => fireEvent.click(await screen.findByRole('button', { name: 'Edit Location & Map' }))

describe('Listing editor: Location & Map', () => {
  it('summarises the address and fills the form from the server', async () => {
    renderEditor()
    expect(await screen.findByTestId('summary-location')).toHaveTextContent('12 Main Road')
    await open()
    expect(screen.getByLabelText('Address')).toHaveValue('12 Main Road')
    expect(screen.getByLabelText('Postal code')).toHaveValue('54000')
    expect(screen.getByLabelText('Latitude')).toHaveValue('31.5204')
  })

  it('a dropped pin saves latitude and longitude as numbers', async () => {
    const { patch } = renderEditor()
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Drop pin' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(patch).toHaveBeenCalledWith('branch-1', { latitude: 31.55, longitude: 74.35 }))
  })

  it('an address change is sent as address and addressLine1, like the mobile save', async () => {
    const { patch } = renderEditor()
    await open()
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: '14 Main Road' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(patch).toHaveBeenCalledWith('branch-1', { address: '14 Main Road', addressLine1: '14 Main Road' }))
  })

  it('refuses an out-of-range latitude before calling the server', async () => {
    renderEditor()
    await open()
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '95' } })
    expect(screen.getByText('Latitude must be between -90 and 90.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('requires an address', async () => {
    renderEditor()
    await open()
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: '' } })
    expect(screen.getByText('Address is required.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('clearing the phone sends an empty string so it is really removed', async () => {
    const { patch } = renderEditor()
    await open()
    fireEvent.change(screen.getByLabelText('Branch phone'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(patch).toHaveBeenCalledWith('branch-1', { phone: '' }))
  })

  // Phase 7 P9, NEW-140: the address comes from Google through our API, with its city, area, point and place id.
  it('a picked address saves its city, area, point and Google place id', async () => {
    fakePlaces()
    const { patch } = renderEditor()
    await open()
    await pickPlace('Address', '12 MM', /12 MM Alam Road/)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(patch).toHaveBeenCalledWith('branch-1', expect.objectContaining({
      address: '12 MM Alam Road, Gulberg III, Lahore',
      addressLine1: '12 MM Alam Road, Gulberg III, Lahore',
      cityId: 7,
      areaId: 71,
      latitude: 31.5101,
      longitude: 74.3442,
      googlePlaceId: 'addr-mm-alam',
    })))
  })

  it('shows the server message when the save is refused', async () => {
    const { patch } = renderEditor(undefined, { ...branchFixture })
    patch.mockRejectedValue(httpError(400, { message: 'cityId does not exist' }))
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Drop pin' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByTestId('save-error')).toHaveTextContent('cityId does not exist')
  })
})
