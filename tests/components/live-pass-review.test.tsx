/**
 * Naming v2 live pass (2026-11-26, local API on feat/naming-v2-r2): the shapes the live API really sends.
 * - GET /admin/organizations/:id sends the businesses as `organization.organizations` (contract G2: `businesses`).
 * - GET /admin/review-queue ignores `kind` and sends no `total`.
 * - The organization and its first business are approved on one page (enterprise §5, D10).
 */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { reviewQueueFor, withBusinesses, adminApi, type ReviewQueueItem } from '@/lib/api/admin'
import { FirstBusinessApproval, firstBusinessOf } from '@/components/features/admin-organization/first-business-approval'
import type { Organization } from '@/types'

const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)

afterEach(() => vi.restoreAllMocks())

const org = (over: Partial<Organization> & Record<string, unknown> = {}) =>
  ({ id: 'o1', organizationName: 'Live Org', email: 'a@b.test', phone: '1', cityId: 1, status: 'PENDING_REVIEW', createdAt: '2026-11-26T09:00:00Z', firstBusinessName: 'Live Fitness', ...over }) as Organization

describe('withBusinesses', () => {
  it('fills businesses from the organizations key the live API sends', () => {
    const live = { data: { organization: { ...org(), organizations: [{ id: 'b1', name: 'Live Fitness', status: 'PENDING' }] } } }
    expect(withBusinesses(live).data.organization.businesses).toEqual([{ id: 'b1', name: 'Live Fitness', status: 'PENDING' }])
  })
  it('keeps businesses when the API sends the contract key', () => {
    const v2 = { data: { organization: { ...org({ businesses: [{ id: 'b2', name: 'X', status: 'ACTIVE' }] }), organizations: [] } } }
    expect(withBusinesses(v2).data.organization.businesses?.[0].id).toBe('b2')
  })
})

describe('reviewQueueFor', () => {
  const items: ReviewQueueItem[] = [
    { kind: 'BUSINESS', organizationId: 'o1', businessId: 'b1', name: 'Live Fitness', status: 'PENDING', kycStatus: 'NOT_SUBMITTED', submittedAt: null },
    { kind: 'ORGANIZATION', organizationId: 'o2', name: 'Live Org', status: 'PENDING_REVIEW', kycStatus: 'PENDING', submittedAt: null },
  ]
  it('keeps only the asked kind when the API sends both, and counts what is left', () => {
    const res = reviewQueueFor({ data: { items } }, 'BUSINESS')
    expect(res.data.items.map((i) => i.kind)).toEqual(['BUSINESS'])
    expect(res.data.total).toBe(1)
  })
  it('counts the rows when no total is sent', () => {
    expect(reviewQueueFor({ data: { items } }).data.total).toBe(2)
  })
})

describe('FirstBusinessApproval', () => {
  it('before the organization is approved, says the business comes next', () => {
    wrap(<FirstBusinessApproval organization={org()} organizationId="o1" />)
    expect(screen.getByTestId('first-business-approval')).toHaveTextContent('First business: Live Fitness')
    expect(screen.getByTestId('first-business-approval')).toHaveTextContent('Approve the organization first')
  })

  it('after the organization is approved, shows the first business approval on the same page', async () => {
    vi.spyOn(adminApi, 'getBusiness').mockResolvedValue({ success: true, data: { business: { id: 'b1', name: 'Live Fitness', status: 'PENDING', missingForApproval: ['PROOF_OF_PREMISES'], businessVerified: false } } } as never)
    vi.spyOn(adminApi, 'getBusinessDocuments').mockResolvedValue([] as never)
    wrap(<FirstBusinessApproval organization={org({ status: 'ACTIVE', businesses: [{ id: 'b1', name: 'Live Fitness', status: 'PENDING' }] })} organizationId="o1" />)
    expect(await screen.findByRole('button', { name: /Approve business/ })).toBeInTheDocument()
    expect(screen.getByTestId('review-missing')).toHaveTextContent('Needed for approval')
  })

  it('hides once the first business is approved, and for an organization not under review', () => {
    const { container, rerender } = wrap(<FirstBusinessApproval organization={org({ status: 'ACTIVE', businesses: [{ id: 'b1', name: 'X', status: 'ACTIVE' }] })} organizationId="o1" />)
    expect(container).toBeEmptyDOMElement()
    rerender(<QueryClientProvider client={new QueryClient()}><FirstBusinessApproval organization={org({ status: 'SUSPENDED' })} organizationId="o1" /></QueryClientProvider>)
    expect(container).toBeEmptyDOMElement()
  })

  it('the first business is the earliest created', () => {
    expect(firstBusinessOf({ businesses: [
      { id: 'b2', name: 'Second', status: 'PENDING', createdAt: '2026-11-26T10:00:00Z' },
      { id: 'b1', name: 'First', status: 'PENDING', createdAt: '2026-11-26T09:00:00Z' },
    ] })?.id).toBe('b1')
  })
})
