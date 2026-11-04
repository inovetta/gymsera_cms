/**
 * NEW-196 (P10b): the Gym Profile page edits every organization, not only the first. It used
 * GET / PATCH /gyms/profile (the tenant's first organization) and /gyms/profile/logo, /cover and
 * /images (which also wrote to, and deleted the old logo of, the first organization). Now, as the
 * mobile Edit Organization: GET /host/listings, GET / PATCH /host/listings/:id and photo uploads
 * through POST /host/listings/staging-images, saved on the chosen organization only.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import GymProfilePage from '@/app/(dashboard)/gym/profile/page'
import { hostApi } from '@/lib/api/host'
import { gymApi } from '@/lib/api/gym'
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

const LISTINGS = [
  { id: 'org-1', title: 'Iron Gym', status: 'ACTIVE' },
  { id: 'org-2', title: 'Fit Hub', status: 'ACTIVE' },
]

const organization = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  title: name,
  status: 'ACTIVE',
  category: 'Yoga & Pilates',
  establishedYear: 2019,
  website: null,
  shortDescription: null,
  gym: {
    id: `gym-${id}`,
    name,
    description: `${name} description`,
    genderType: 'FEMALE_ONLY',
    contactPhone: '+92 300 1111111',
    contactEmail: `${id}@example.test`,
    website: `https://${id}.example.test`,
    logoUrl: `https://cdn.example.test/${id}-logo.jpg`,
    coverImageUrl: null,
    imagesJson: [`https://cdn.example.test/${id}-a.jpg`, `https://cdn.example.test/${id}-b.jpg`],
  },
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

describe('NEW-196 Gym Profile edits each organization', () => {
  let getGymProfile: ReturnType<typeof vi.spyOn>
  let updateGymProfile: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    toast.mockReset()
    vi.spyOn(hostApi, 'getListings').mockResolvedValue(ok(LISTINGS) as never)
    vi.spyOn(hostApi, 'getOrganization').mockImplementation(async (id: string) =>
      ok(organization(id, id === 'org-1' ? 'Iron Gym' : 'Fit Hub')) as never
    )
    vi.spyOn(hostApi, 'updateOrganization').mockResolvedValue(ok({ id: 'org-2' }) as never)
    vi.spyOn(hostApi, 'uploadOrganizationPhotos').mockResolvedValue(['https://cdn.example.test/new.jpg'])
    getGymProfile = vi.spyOn(gymApi, 'getGymProfile')
    updateGymProfile = vi.spyOn(gymApi, 'updateGymProfile')
  })

  afterEach(() => vi.restoreAllMocks())

  it('lists the organizations and saves the second one through PATCH /host/listings/:id', async () => {
    mount()
    fireEvent.click(await screen.findByRole('tab', { name: 'Fit Hub' }))
    await waitFor(() => expect(hostApi.getOrganization).toHaveBeenCalledWith('org-2'))
    const name = await screen.findByDisplayValue('Fit Hub')
    fireEvent.change(name, { target: { value: 'Fit Hub Gulberg' } })
    fireEvent.change(screen.getByDisplayValue('Fit Hub description'), { target: { value: '' } })
    fireEvent.click(screen.getAllByRole('button', { name: /Save Changes/ })[0])

    await waitFor(() => expect(hostApi.updateOrganization).toHaveBeenCalled())
    const [id, body] = (hostApi.updateOrganization as any).mock.calls[0]
    expect(id).toBe('org-2')
    expect(body).toEqual({
      gymName: 'Fit Hub Gulberg',
      gymDescription: '',
      category: 'Yoga & Pilates',
      establishedYear: 2019,
      contactPhone: '+92 300 1111111',
      contactEmail: 'org-2@example.test',
      website: 'https://org-2.example.test',
      genderType: 'FEMALE_ONLY',
      logoUrl: 'https://cdn.example.test/org-2-logo.jpg',
      coverImageUrl: '',
      imagesJson: ['https://cdn.example.test/org-2-a.jpg', 'https://cdn.example.test/org-2-b.jpg'],
    })
    expect(getGymProfile).not.toHaveBeenCalled()
    expect(updateGymProfile).not.toHaveBeenCalled()
  })

  it('a new logo is uploaded without touching any organization, then saved on this one', async () => {
    const { container } = mount()
    fireEvent.click(await screen.findByRole('tab', { name: 'Fit Hub' }))
    await screen.findByDisplayValue('Fit Hub')
    choose(fileInputs(container)[0], new File(['x'], 'logo.png', { type: 'image/png' }))
    fireEvent.click(screen.getAllByRole('button', { name: /Save Changes/ })[0])

    await waitFor(() => expect(hostApi.updateOrganization).toHaveBeenCalled())
    expect(hostApi.uploadOrganizationPhotos).toHaveBeenCalledTimes(1)
    const [id, body] = (hostApi.updateOrganization as any).mock.calls[0]
    expect(id).toBe('org-2')
    expect(body.logoUrl).toBe('https://cdn.example.test/new.jpg')
  })

  it('gallery: added photos and a removed photo are saved on this organization', async () => {
    const { container } = mount()
    await screen.findByDisplayValue('Iron Gym')
    choose(fileInputs(container)[2], new File(['x'], 'g.png', { type: 'image/png' }))
    await waitFor(() => expect(hostApi.uploadOrganizationPhotos).toHaveBeenCalled())
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove image' })[0])
    fireEvent.click(screen.getAllByRole('button', { name: /Save Changes/ })[0])

    await waitFor(() => expect(hostApi.updateOrganization).toHaveBeenCalled())
    const [id, body] = (hostApi.updateOrganization as any).mock.calls[0]
    expect(id).toBe('org-1')
    expect(body.imagesJson).toEqual(['https://cdn.example.test/org-1-b.jpg', 'https://cdn.example.test/new.jpg'])
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
    ;(hostApi.updateOrganization as any).mockRejectedValue(err)
    mount()
    await screen.findByDisplayValue('Iron Gym')
    fireEvent.click(screen.getAllByRole('button', { name: /Save Changes/ })[0])
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })))
    const call = toast.mock.calls.find((c) => c[0].variant === 'destructive')![0]
    expect(call.description).toContain('req-196')
  })

  it('no organization: an empty state, not an empty form', async () => {
    ;(hostApi.getListings as any).mockResolvedValue(ok([]))
    mount()
    expect(await screen.findByText('No organization yet')).toBeTruthy()
    expect(hostApi.getOrganization).not.toHaveBeenCalled()
  })

  it('a load error shows an error with retry, not a blank form that could be saved', async () => {
    ;(hostApi.getOrganization as any).mockRejectedValue(apiError(500, 'boom'))
    mount()
    expect(await screen.findByRole('button', { name: /try again|retry/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Save Changes/ })).toBeNull()
  })
})
