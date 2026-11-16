import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CitiesPage from '@/app/(dashboard)/admin/cities/page'
import { citiesApi } from '@/lib/api/cities'
import { ok } from '../fixtures/team'

/**
 * NEW-261: CMS › Cities & Areas showed "0 areas" for every city until it was opened (the areas were
 * fetched on expand and the count fell back to 0). Now GET /cities carries `areaCount`.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div /> }))

const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)

afterEach(() => vi.restoreAllMocks())

describe('NEW-261: Cities & Areas shows each city\'s real area count', () => {
  it('reads areaCount from GET /cities without opening the city', async () => {
    vi.spyOn(citiesApi, 'getCities').mockResolvedValue(ok([
      { id: 1, name: 'Peshawar', isActive: true, createdAt: '2026-01-01', areaCount: 12 },
      { id: 2, name: 'Mardan', isActive: true, createdAt: '2026-01-01', areaCount: 0 },
    ]) as never)
    const getAreas = vi.spyOn(citiesApi, 'getAreas').mockResolvedValue(ok({ areas: [] }) as never)
    wrap(<CitiesPage />)

    expect(await screen.findByText('12 areas')).toBeInTheDocument()
    expect(screen.getByText('0 areas')).toBeInTheDocument()
    expect(getAreas).not.toHaveBeenCalled()
  })
})
