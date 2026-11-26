/**
 * Naming v2 live pass (2026-11-26). Since be 36930cd (M3e fixes) the API sends the contract shapes, so the
 * client reads them as they are (no fallbacks):
 * - GET /admin/organizations/:id → organization.businesses (G2).
 * - GET /admin/review-queue?kind&page&limit → { items, page, total } (G1).
 * - The organization and its first business are approved on one page (enterprise §5, D10).
 */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { adminApi } from '@/lib/api/admin'
import apiClient from '@/lib/api/client'
import { FirstBusinessApproval, firstBusinessOf } from '@/components/features/admin-organization/first-business-approval'
import type { Organization } from '@/types'

const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)

afterEach(() => vi.restoreAllMocks())

const org = (over: Partial<Organization> & Record<string, unknown> = {}) =>
  ({ id: 'o1', organizationName: 'Live Org', email: 'a@b.test', phone: '1', cityId: 1, status: 'PENDING_REVIEW', createdAt: '2026-11-26T09:00:00Z', firstBusinessName: 'Live Fitness', ...over }) as Organization

describe('admin API reads the contract shapes as sent', () => {
  it('review queue: kind, page and limit go to the API; items, page and total come back unchanged', async () => {
    const answer = { success: true, data: { items: [{ kind: 'BUSINESS', organizationId: 'o1', businessId: 'b1', name: 'Live Fitness', status: 'PENDING', kycStatus: 'NOT_SUBMITTED', submittedAt: null }], page: 2, total: 21 } }
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: answer } as never)
    const res = await adminApi.getReviewQueue({ kind: 'BUSINESS', page: 2, limit: 20 })
    expect(get).toHaveBeenCalledWith('/admin/review-queue', { params: { kind: 'BUSINESS', page: 2, limit: 20 } })
    expect(res).toEqual(answer)
  })
  it('organization detail: organization.businesses as sent, no organizations fallback', async () => {
    const answer = { success: true, data: { organization: { ...org({ businesses: [{ id: 'b1', name: 'Live Fitness', status: 'PENDING' }] }) } } }
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: answer } as never)
    expect((await adminApi.getOrganization('o1')).data?.organization.businesses?.[0].id).toBe('b1')
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: { organization: { ...org(), organizations: [{ id: 'old' }] } } } } as never)
    expect((await adminApi.getOrganization('o1')).data?.organization.businesses).toBeUndefined()
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
