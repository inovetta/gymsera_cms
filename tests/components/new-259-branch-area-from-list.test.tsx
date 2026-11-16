import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BranchLocationFields, BranchLocationValue } from '@/components/features/places/branch-location-fields'
import { placesApi } from '@/lib/api/places'
import apiClient from '@/lib/api/client'
import { ok } from '../fixtures/team'

/**
 * NEW-259 (R-107): the branch location form offered "Use “<typed>” as the area" (POST /places/areas);
 * the area is now picked from the list only, and an empty search says whom to ask.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/components/features/map-picker', () => ({ MapPicker: () => <div /> }))

const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)

beforeEach(() => {
  vi.spyOn(placesApi, 'autocomplete').mockResolvedValue(ok({ suggestions: [] }) as never)
})
afterEach(() => vi.restoreAllMocks())

describe('NEW-259: the branch area is picked from the list only', () => {
  it('an area search with no match says "Can\'t find your area? Contact support", with no typed-text option', async () => {
    const post = vi.spyOn(apiClient, 'post')
    const value: BranchLocationValue = { cityId: 7, cityName: 'Peshawar', address: '' } as BranchLocationValue
    wrap(<BranchLocationFields value={value} onChange={vi.fn()} />)

    const area = screen.getByLabelText('Area')
    fireEvent.focus(area)
    fireEvent.change(area, { target: { value: 'Shinwari Town' } })

    const note = await screen.findByTestId('area-not-found')
    expect(note).toHaveTextContent("Can't find your area? Contact support at support@gymsera.com.")
    expect(within(note).getByRole('link')).toHaveAttribute('href', 'mailto:support@gymsera.com')
    expect(screen.queryByRole('button', { name: /as the area/i })).toBeNull()
    expect(post).not.toHaveBeenCalled()
    expect('createArea' in placesApi).toBe(false)
  })
})
