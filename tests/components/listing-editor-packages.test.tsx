import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, within, fireEvent, waitFor } from '@testing-library/react'
import { branchFixture, contextWith, httpError, planFixture, renderEditor } from '../fixtures/listing'
import { listingQuality } from '@/lib/listing/content'

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

describe('Listing editor: Packages & Pricing', () => {
  it('asks for this branch plans and counts the live ones', async () => {
    const { getPlans } = renderEditor(undefined, branchFixture, [
      planFixture(),
      planFixture({ id: 'plan-2', name: 'Old', status: 'INACTIVE' }),
    ])
    expect(await screen.findByTestId('summary-packages')).toHaveTextContent('1 package')
    expect(getPlans).toHaveBeenCalledWith('branch-1')
  })

  it('lists the package with its price and links to the Plans page to change it', async () => {
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Packages & Pricing' }))
    const list = await screen.findByTestId('package-list')
    expect(within(list).getByText('Monthly')).toBeInTheDocument()
    expect(within(list).getByText(/5,000/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Manage packages and prices' })).toHaveAttribute('href', '/gym/plans')
  })

  it('says travelers cannot book when there is no package', async () => {
    renderEditor(undefined, branchFixture, [])
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Packages & Pricing' }))
    expect(await screen.findByTestId('packages-empty')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('listing-quality')).toHaveTextContent('Add at least one package'))
  })

  it('is hidden without plans.view, and the plans endpoint is not called', async () => {
    const { getPlans } = renderEditor(contextWith(['listing.manage']))
    await screen.findByTestId('section-basic')
    expect(screen.queryByTestId('section-packages')).toBeNull()
    expect(getPlans).not.toHaveBeenCalled()
  })

  it('without plan write keys it does not offer the Plans page', async () => {
    renderEditor(contextWith(['listing.manage', 'plans.view']))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Packages & Pricing' }))
    await screen.findByTestId('package-list')
    expect(screen.queryByRole('link', { name: 'Manage packages and prices' })).toBeNull()
  })

  it('shows the server message when the plans cannot be read', async () => {
    const { getPlans } = renderEditor()
    getPlans.mockRejectedValue(httpError(403, { message: 'You need plans.view at this branch' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Packages & Pricing' }))
    expect(await screen.findByTestId('packages-error')).toHaveTextContent('You need plans.view at this branch')
  })
})

describe('listingQuality', () => {
  it('scores the six parts of the mobile card', () => {
    expect(listingQuality(branchFixture, 1)).toEqual({ percent: 100, advice: 'Great job! Your listing is highly detailed and traveler-friendly.' })
    expect(listingQuality({ ...branchFixture, imagesJson: [] }, 1).percent).toBe(83)
  })
  it('leaves packages out when the person cannot see them', () => {
    expect(listingQuality({ ...branchFixture, imagesJson: [] }, null).percent).toBe(80)
  })
})
