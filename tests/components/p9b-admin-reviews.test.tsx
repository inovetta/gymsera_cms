import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ReviewsPage from '@/app/(dashboard)/admin/reviews/page'
import { adminApi } from '@/lib/api/admin'
import { ok } from '../fixtures/team'

/**
 * Phase 7 P9b, admin Review Moderation.
 * BUG-29 (item 5): the list read `review.gymListing.name` and `review.user`; GET /admin/reviews sends
 * `gym: { id, title }`, `reviewer` and (P9b) `gymTitle`, the traveller name rule ("Organization ·
 * Branch", or the name once when they match). The gym line and the reviewer's name never showed.
 */
vi.mock('@/components/layout/header', () => ({ Header: () => <div /> }))
const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastSpy }) }))

const review = {
  id: 'r1', gymListingId: 'l1', userId: 'u1', rating: 5, title: 'Great place', body: 'Clean and friendly', status: 'PENDING',
  createdAt: '2026-10-30T10:00:00Z', reviewer: { id: 'u1', fullName: 'Ali Raza', email: 'ali@example.test' },
  gym: { id: 'l1', title: 'Iron Gym' }, gymTitle: 'Iron Gym · Uptown',
}

beforeEach(() => {
  vi.spyOn(adminApi, 'getReviews').mockResolvedValue(ok({ reviews: [review] }) as never)
})
afterEach(() => { vi.restoreAllMocks(); toastSpy.mockClear() })

const mount = () =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><ReviewsPage /></QueryClientProvider>)

describe('admin reviews: names', () => {
  it('names the gym by the API title and shows the reviewer', async () => {
    mount()
    expect(await screen.findByText('Iron Gym · Uptown')).toBeInTheDocument()
    expect(screen.getByText('Ali Raza')).toBeInTheDocument()
  })

  it('falls back to the organization title from an older API', async () => {
    vi.spyOn(adminApi, 'getReviews').mockResolvedValue(ok({ reviews: [{ ...review, gymTitle: undefined }] }) as never)
    mount()
    expect(await screen.findByText('Iron Gym')).toBeInTheDocument()
  })
})
