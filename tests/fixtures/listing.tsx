import React from 'react'
import { vi } from 'vitest'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ListingEditorPage from '@/app/(dashboard)/gym/branches/[id]/listing/page'
import { hostApi, type BranchListingContent } from '@/lib/api/host'
import { meApi, type MyContext } from '@/lib/api/me'
import { tenantsApi } from '@/lib/api/tenants'
import { ok } from './team'
import { ownerContext } from './context'

/** A branch as GET /host/branches/:id/listing-content returns it. */
export const branchFixture: BranchListingContent = {
  id: 'branch-1',
  branchName: 'Uptown Iron',
  status: 'ACTIVE',
  gymListingId: 'listing-1',
  tagline: 'Lift heavy',
  category: 'Strength, Boxing',
  description: 'A serious gym.',
  establishedYear: 2015,
  floorArea: 4000,
  tagsJson: ['24/7'],
  facilitiesJson: ['AC', 'WiFi'],
  imagesJson: ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg'],
  openingTime: '06:00:00',
  closingTime: '22:00:00',
  address: '12 Main Road',
  addressLine1: '12 Main Road',
  addressLine2: null,
  postalCode: '54000',
  country: 'Pakistan',
  cityId: 1,
  areaId: 10,
  latitude: '31.5204',
  longitude: '74.3587',
  phone: '+923001234567',
  travelerVisibilityStatus: 'active',
}

export const httpError = (status: number, data: Record<string, unknown>) =>
  Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data } })

export const patchResponse = (status: number, data: unknown = { success: true, data: { branch: branchFixture } }) =>
  ({ status, data }) as never

/** Context where the person holds exactly these keys at branch-1 (and none organization-wide). */
export const contextWith = (keys: string[]): MyContext => ({
  ...ownerContext,
  organizations: ownerContext.organizations.map((o) => ({
    ...o,
    isOwner: false,
    role: { key: 'MANAGER', name: 'Branch Manager', level: 60 },
    scopeType: 'BRANCH',
    orgPermissions: [],
    branches: [{ id: 'branch-1', name: 'Uptown', permissions: keys }],
  })),
})

export function renderEditor(context: MyContext = ownerContext, branch: BranchListingContent = branchFixture) {
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(context) as never)
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
  const get = vi.spyOn(hostApi, 'getBranchListingContent').mockResolvedValue(ok({ branch }) as never)
  const patch = vi.spyOn(hostApi, 'updateBranchListingContent').mockResolvedValue(patchResponse(200))
  const view = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ListingEditorPage />
    </QueryClientProvider>
  )
  return { ...view, get, patch }
}
