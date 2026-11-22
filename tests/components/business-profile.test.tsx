/**
 * NEW-196 (P10b), contract v2 (R-120): the Business Profile page edits every business, not only
 * the first: GET /host/businesses, GET / PATCH /host/businesses/:businessId, photo uploads through
 * POST /host/businesses/staging-images, saved on the chosen business only. The contact e-mail is
 * read from GET /organizations/me/businesses/:businessId/profile.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import GymProfilePage from '@/app/(dashboard)/gym/profile/page'
import { hostApi } from '@/lib/api/host'
import { organizationsApi } from '@/lib/api/organizations'
import { apiError, ok } from '../fixtures/team'

const toast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('next/image', () => ({ default: ({ src, alt }: any) => <img src={src} alt={alt} /> }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div /> }))
// Radix Select does not open in jsdom: stand in a native <select> with the same props.
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: any) => (
    <select value={value ?? ''} onChange={(e) => onValueChange(e.target.value)} data-testid="select">
      <option value="" />
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}))

const BUSINESSES = [
  { id: 'biz-1', name: 'Iron Gym', status: 'ACTIVE' },
  { id: 'biz-2', name: 'Fit Hub', status: 'ACTIVE' },
]

// Contract v2 §3 Business (one id per business, option S): no nested tenant-database row.
const business = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  status: 'ACTIVE',
  category: 'Yoga & Pilates',
  establishedYear: 2019,
  description: `${name} description`,
  genderType: 'FEMALE_ONLY',
  contactPhone: '+92 300 1111111',
  website: `https://${id}.example.test`,
  logoUrl: `https://cdn.example.test/${id}-logo.jpg`,
  coverImageUrl: null,
  imagesJson: [`https://cdn.example.test/${id}-a.jpg`, `https://cdn.example.test/${id}-b.jpg`],
  ...over,
})

const mount = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <GymProfilePage />
    </QueryClientProvider>
  )
}

const fileInputs = (container: HTMLElement) => Array.from(container.querySelectorAll('input[type="file"]')) as HTMLInputElement[]
const choose = (input: HTMLInputElement, file: File) => fireEvent.change(input, { target: { files: [file] } })

describe('NEW-196 Business Profile edits each business', () => {
  let getBusinessProfile: ReturnType<typeof vi.spyOn>
  let updateBusinessProfile: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    toast.mockReset()
    vi.spyOn(hostApi, 'getBusinesses').mockResolvedValue(ok(BUSINESSES) as never)
    vi.spyOn(hostApi, 'getBusiness').mockImplementation(async (id: string) =>
      ok(business(id, id === 'biz-1' ? 'Iron Gym' : 'Fit Hub')) as never
    )
    vi.spyOn(hostApi, 'updateBusiness').mockResolvedValue(ok({ id: 'biz-2' }) as never)
    vi.spyOn(hostApi, 'uploadStagingImages').mockResolvedValue(['https://cdn.example.test/new.jpg'])
    getBusinessProfile = vi.spyOn(organizationsApi, 'getBusinessProfile').mockImplementation(async (id: string) =>
      ok({ business: { id, contactEmail: `${id}@example.test` } }) as never
    )
    updateBusinessProfile = vi.spyOn(organizationsApi, 'updateBusinessProfile')
  })

  afterEach(() => vi.restoreAllMocks())

  it('lists the businesses and saves the second one through PATCH /host/businesses/:businessId', async () => {
    mount()
    fireEvent.click(await screen.findByRole('tab', { name: 'Fit Hub' }))
    await waitFor(() => expect(hostApi.getBusiness).toHaveBeenCalledWith('biz-2'))
    const name = await screen.findByDisplayValue('Fit Hub')
    fireEvent.change(name, { target: { value: 'Fit Hub Gulberg' } })
    fireEvent.change(screen.getByDisplayValue('Fit Hub description'), { target: { value: '' } })
    fireEvent.click(screen.getAllByRole('button', { name: /Save Changes/ })[0])

    await waitFor(() => expect(hostApi.updateBusiness).toHaveBeenCalled())
    const [id, body] = (hostApi.updateBusiness as any).mock.calls[0]
    expect(id).toBe('biz-2')
    expect(body).toEqual({
      businessName: 'Fit Hub Gulberg',
      businessDescription: '',
      category: 'Yoga & Pilates',
      establishedYear: 2019,
      contactPhone: '+92 300 1111111',
      contactEmail: 'biz-2@example.test',
      website: 'https://biz-2.example.test',
      genderType: 'FEMALE_ONLY',
      logoUrl: 'https://cdn.example.test/biz-2-logo.jpg',
      coverImageUrl: '',
      imagesJson: ['https://cdn.example.test/biz-2-a.jpg', 'https://cdn.example.test/biz-2-b.jpg'],
    })
    expect(getBusinessProfile).toHaveBeenCalledWith('biz-2')
    expect(updateBusinessProfile).not.toHaveBeenCalled()
  })

  it('a new logo is uploaded without touching any business, then saved on this one', async () => {
    const { container } = mount()
    fireEvent.click(await screen.findByRole('tab', { name: 'Fit Hub' }))
    await screen.findByDisplayValue('Fit Hub')
    choose(fileInputs(container)[0], new File(['x'], 'logo.png', { type: 'image/png' }))
    fireEvent.click(screen.getAllByRole('button', { name: /Save Changes/ })[0])

    await waitFor(() => expect(hostApi.updateBusiness).toHaveBeenCalled())
    expect(hostApi.uploadStagingImages).toHaveBeenCalledTimes(1)
    const [id, body] = (hostApi.updateBusiness as any).mock.calls[0]
    expect(id).toBe('biz-2')
    expect(body.logoUrl).toBe('https://cdn.example.test/new.jpg')
  })

  it('gallery: added photos and a removed photo are saved on this business', async () => {
    const { container } = mount()
    await screen.findByDisplayValue('Iron Gym')
    choose(fileInputs(container)[2], new File(['x'], 'g.png', { type: 'image/png' }))
    await waitFor(() => expect(hostApi.uploadStagingImages).toHaveBeenCalled())
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove image' })[0])
    fireEvent.click(screen.getAllByRole('button', { name: /Save Changes/ })[0])

    await waitFor(() => expect(hostApi.updateBusiness).toHaveBeenCalled())
    const [id, body] = (hostApi.updateBusiness as any).mock.calls[0]
    expect(id).toBe('biz-1')
    expect(body.imagesJson).toEqual(['https://cdn.example.test/biz-1-b.jpg', 'https://cdn.example.test/new.jpg'])
  })

  it('offers the gender values the API accepts (MALE_ONLY / FEMALE_ONLY, not MALE / FEMALE)', async () => {
    mount()
    await screen.findByDisplayValue('Iron Gym')
    const values = screen.getAllByRole('option').map((o) => (o as HTMLOptionElement).value)
    expect(values).toEqual(expect.arrayContaining(['MIXED', 'MALE_ONLY', 'FEMALE_ONLY']))
    expect(values).not.toContain('MALE')
    expect(values).not.toContain('FEMALE')
  })

  it('a refused save shows the API message and the reference', async () => {
    const err = apiError(422, 'contactEmail must be a valid email', 'validation_error') as any
    err.response.data.requestId = 'req-196'
    ;(hostApi.updateBusiness as any).mockRejectedValue(err)
    mount()
    await screen.findByDisplayValue('Iron Gym')
    fireEvent.click(screen.getAllByRole('button', { name: /Save Changes/ })[0])
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })))
    const call = toast.mock.calls.find((c) => c[0].variant === 'destructive')![0]
    expect(call.description).toContain('req-196')
  })

  it('no business: an empty state, not an empty form', async () => {
    ;(hostApi.getBusinesses as any).mockResolvedValue(ok([]))
    mount()
    expect(await screen.findByText('No business yet')).toBeTruthy()
    expect(hostApi.getBusiness).not.toHaveBeenCalled()
  })

  it('a load error shows an error with retry, not a blank form that could be saved', async () => {
    ;(hostApi.getBusiness as any).mockRejectedValue(apiError(500, 'boom'))
    mount()
    expect(await screen.findByRole('button', { name: /try again|retry/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Save Changes/ })).toBeNull()
  })
})
