import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { branchFixture, httpError, renderEditor } from '../fixtures/listing'

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'branch-1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div data-testid="header" /> }))
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1', fullName: 'Test Person', role: 'GYM_HOST' }, logout: vi.fn(), isPlatformAdmin: false, isGymHost: true, isBranchManager: false }),
}))

afterEach(() => vi.restoreAllMocks())
const open = async (title: string) => fireEvent.click(await screen.findByRole('button', { name: `Edit ${title}` }))

describe('Listing editor: Amenities', () => {
  it('summarises the count and shows what is selected', async () => {
    renderEditor()
    expect(await screen.findByTestId('summary-amenities')).toHaveTextContent('2 listed')
    await open('Amenities')
    expect(screen.getByRole('button', { name: 'AC' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Sauna' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('saves facilitiesJson with the toggled amenity', async () => {
    const { patch } = renderEditor()
    await open('Amenities')
    fireEvent.click(screen.getByRole('button', { name: 'Sauna' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(patch).toHaveBeenCalledWith('branch-1', { facilitiesJson: ['AC', 'WiFi', 'Sauna'] }))
  })

  it('keeps a value an older editor saved instead of dropping it', async () => {
    const { patch } = renderEditor(undefined, { ...branchFixture, facilitiesJson: ['wifi', 'AC'] })
    await open('Amenities')
    expect(screen.getByRole('button', { name: 'wifi' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Sauna' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(patch).toHaveBeenCalledWith('branch-1', { facilitiesJson: ['wifi', 'AC', 'Sauna'] }))
  })

  it('reads facilities the server sent as a JSON string', async () => {
    renderEditor(undefined, { ...branchFixture, facilitiesJson: '["Parking","CCTV"]' })
    expect(await screen.findByTestId('summary-amenities')).toHaveTextContent('2 listed')
  })

  it('shows the server message when the save fails', async () => {
    const { patch } = renderEditor()
    patch.mockRejectedValue(httpError(400, { message: 'facilitiesJson must be an array' }))
    await open('Amenities')
    fireEvent.click(screen.getByRole('button', { name: 'Sauna' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByTestId('save-error')).toHaveTextContent('facilitiesJson must be an array')
  })
})

describe('Listing editor: Operating Hours', () => {
  it('shows the stored hours without seconds', async () => {
    renderEditor()
    expect(await screen.findByTestId('summary-hours')).toHaveTextContent('06:00 – 22:00')
    await open('Operating Hours')
    expect(screen.getByLabelText('Opens at')).toHaveValue('06:00')
    expect(screen.getByLabelText('Closes at')).toHaveValue('22:00')
  })

  it('saves both times when one changes, as HH:MM like mobile', async () => {
    const { patch } = renderEditor()
    await open('Operating Hours')
    fireEvent.change(screen.getByLabelText('Closes at'), { target: { value: '23:30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(patch).toHaveBeenCalledWith('branch-1', { closingTime: '23:30' }))
  })

  it('will not save half a pair', async () => {
    renderEditor()
    await open('Operating Hours')
    fireEvent.change(screen.getByLabelText('Opens at'), { target: { value: '' } })
    expect(screen.getByText('Set both an opening and a closing time.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('says Not set when the branch has no hours', async () => {
    renderEditor(undefined, { ...branchFixture, openingTime: null, closingTime: null })
    expect(await screen.findByTestId('summary-hours')).toHaveTextContent('Not set')
  })
})
