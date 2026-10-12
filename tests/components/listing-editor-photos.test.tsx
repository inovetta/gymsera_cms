import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { gymApi } from '@/lib/api/gym'
import { branchFixture, contextWith, httpError, renderEditor } from '../fixtures/listing'

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

const openPhotos = async () => fireEvent.click(await screen.findByRole('button', { name: 'Edit Photos' }))
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement
const image = (name: string) => new File(['x'], name, { type: 'image/png' })

describe('Listing editor: Photos', () => {
  it('shows the photo count from the server', async () => {
    renderEditor()
    expect(await screen.findByTestId('summary-photos')).toHaveTextContent('2 photos')
  })

  it('uploads through the branch images endpoint and reads the list again', async () => {
    const upload = vi.spyOn(gymApi, 'uploadBranchImages').mockResolvedValue({ success: true, data: { uploadedUrls: ['https://cdn.test/c.jpg'] } } as never)
    const { get } = renderEditor()
    await openPhotos()
    fireEvent.change(fileInput(), { target: { files: [image('c.png')] } })
    await waitFor(() => expect(upload).toHaveBeenCalledWith('branch-1', [expect.any(File)]))
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(1))
  })

  it('refuses a batch that would pass ten photos, without calling the server', async () => {
    const upload = vi.spyOn(gymApi, 'uploadBranchImages')
    const nine = Array.from({ length: 9 }, (_, i) => `https://cdn.test/${i}.jpg`)
    renderEditor(undefined, { ...branchFixture, imagesJson: nine })
    await openPhotos()
    fireEvent.change(fileInput(), { target: { files: [image('a.png'), image('b.png')] } })
    expect(await screen.findByTestId('save-error')).toHaveTextContent('up to 10 photos')
    expect(upload).not.toHaveBeenCalled()
  })

  it('removing a photo saves the shorter list through listing-content', async () => {
    const { patch } = renderEditor()
    await openPhotos()
    fireEvent.click((await screen.findAllByRole('button', { name: 'Remove image' }))[0])
    await waitFor(() => expect(patch).toHaveBeenCalledWith('branch-1', { imagesJson: ['https://cdn.test/b.jpg'] }))
  })

  it('shows the server message when an upload is refused', async () => {
    vi.spyOn(gymApi, 'uploadBranchImages').mockRejectedValue(httpError(422, { message: 'Image is larger than 5 MB' }))
    renderEditor()
    await openPhotos()
    fireEvent.change(fileInput(), { target: { files: [image('big.png')] } })
    expect(await screen.findByTestId('save-error')).toHaveTextContent('Image is larger than 5 MB')
  })

  it('without branch.settings the photos can be seen but not added', async () => {
    renderEditor(contextWith(['listing.manage']))
    await openPhotos()
    expect(await screen.findByTestId('photos-readonly')).toBeInTheDocument()
    expect(fileInput()).toBeNull()
  })
})
