import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent, within } from '@testing-library/react'
import { hostApi } from '@/lib/api/host'
import { contextWith, httpError, patchResponse, renderEditor } from '../fixtures/listing'
import { ownerContext } from '../fixtures/context'

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'branch-1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div data-testid="header" /> }))
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', fullName: 'Test Person', role: 'GYM_HOST' },
    logout: vi.fn(),
    isPlatformAdmin: false,
    isGymHost: true,
    isBranchManager: false,
  }),
}))

afterEach(() => vi.restoreAllMocks())

const openSection = async (title: string) => {
  fireEvent.click(await screen.findByRole('button', { name: `Edit ${title}` }))
}

describe('Listing editor: access', () => {
  it('without listing.manage shows no-access and never calls the listing endpoint', async () => {
    const { get } = renderEditor(contextWith(['members.view', 'branch.settings']))
    expect(await screen.findByTestId('no-access')).toBeInTheDocument()
    expect(get).not.toHaveBeenCalled()
  })

  it('with listing.manage loads the listing content for this branch', async () => {
    const { get } = renderEditor(contextWith(['listing.manage']))
    expect(await screen.findByTestId('section-basic')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('branch-1')
  })

  it('shows the server message when the listing cannot be loaded', async () => {
    const { get } = renderEditor()
    get.mockRejectedValue(httpError(404, { message: 'Branch not found or has been deleted' }))
    expect(await screen.findByTestId('listing-error')).toHaveTextContent('Branch not found or has been deleted')
  })
})

describe('Listing editor: Boost (R-15)', () => {
  it('renders a disabled card with COMING SOON and nothing to press', async () => {
    renderEditor()
    const card = await screen.findByTestId('section-boost')
    expect(within(card).getByText('COMING SOON')).toBeInTheDocument()
    expect(card).toHaveAttribute('aria-disabled', 'true')
    expect(within(card).queryByRole('button')).toBeNull()
    expect(within(card).queryByRole('link')).toBeNull()
  })
})

describe('Listing editor: Basic Info', () => {
  it('summarises the section from the server values', async () => {
    renderEditor()
    expect(await screen.findByTestId('summary-basic')).toHaveTextContent('Lift heavy')
  })

  it('saves only the field that changed', async () => {
    const { patch } = renderEditor()
    await openSection('Basic Info')
    fireEvent.change(screen.getByLabelText('Tagline'), { target: { value: 'Lift heavier' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(patch).toHaveBeenCalledWith('branch-1', { tagline: 'Lift heavier' }))
  })

  it('keeps Save disabled until something changes, and when the name is empty', async () => {
    renderEditor()
    await openSection('Basic Info')
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Gym name'), { target: { value: '   ' } })
    expect(save).toBeDisabled()
    expect(screen.getByText('Gym name is required.')).toBeInTheDocument()
  })

  it('rejects an established year in the future', async () => {
    renderEditor()
    await openSection('Basic Info')
    fireEvent.change(screen.getByLabelText('Established year'), { target: { value: '2999' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('shows the server message, not a generic one, when the save is refused', async () => {
    const { patch } = renderEditor()
    patch.mockRejectedValue(httpError(403, { message: 'Only the organization owner can edit the listing' }))
    await openSection('Basic Info')
    fireEvent.change(screen.getByLabelText('Tagline'), { target: { value: 'New line' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByTestId('save-error')).toHaveTextContent('Only the organization owner can edit the listing')
  })

  it('a 202 is reported as sent for approval, not as saved', async () => {
    const { patch } = renderEditor()
    patch.mockResolvedValue(patchResponse(202, { success: true, data: { status: 'PENDING', approvalRequestId: 'req-1', summary: 'Edit listing' } }))
    await openSection('Basic Info')
    fireEvent.change(screen.getByLabelText('Tagline'), { target: { value: 'New line' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Submitted for approval')).toBeInTheDocument()
    expect(screen.queryByText('Basic info saved')).toBeNull()
  })
})

describe('Listing editor: Category & Tags', () => {
  it('toggling a chip sends the comma-joined category string, as mobile does', async () => {
    const { patch } = renderEditor()
    await openSection('Category & Tags')
    fireEvent.click(screen.getByRole('button', { name: 'Yoga' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(patch).toHaveBeenCalledWith('branch-1', { category: 'Strength, Boxing, Yoga' }))
  })

  it('adds a tag to tagsJson and removes one', async () => {
    const { patch } = renderEditor()
    await openSection('Category & Tags')
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'Women only hours' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag 24/7' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(patch).toHaveBeenCalledWith('branch-1', { tagsJson: ['Women only hours'] }))
  })
})

describe('Listing editor: deactivation', () => {
  it('shows the reason and offers resubmit to someone holding branch.settings', async () => {
    const resubmit = vi.spyOn(hostApi, 'resubmitBranchReview').mockResolvedValue({ success: true, data: { branch: {} as never } } as never)
    renderEditor(ownerContext, { ...(await import('../fixtures/listing')).branchFixture, travelerVisibilityStatus: 'deactivated', deactivationReason: 'Photos did not match the gym' })
    const banner = await screen.findByTestId('deactivation-banner')
    expect(banner).toHaveTextContent('Photos did not match the gym')
    fireEvent.click(within(banner).getByRole('button', { name: 'Resubmit for review' }))
    await waitFor(() => expect(resubmit).toHaveBeenCalledWith('branch-1'))
  })
})
