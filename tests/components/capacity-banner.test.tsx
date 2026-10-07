import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { CapacityBanner } from '@/components/features/capacity-banner'
import { invalidateBranchCapacity } from '@/hooks/use-branch-quota'
import { hostApi, BranchQuota } from '@/lib/api/host'
import { ok } from '../fixtures/team'

vi.mock('next/link', () => ({ default: ({ href, children, ...r }: any) => <a href={href} {...r}>{children}</a> }))

const quota = (over: Partial<BranchQuota> = {}): BranchQuota => ({
  maxBranches: 6,
  usedBranches: 5,
  remainingBranches: 1,
  activeBranches: 5,
  buildableBranches: 1,
  overQuotaCount: 0,
  ...over,
})

let client: ReturnType<typeof useQueryClient>
const Grab = () => {
  client = useQueryClient()
  return null
}

const mount = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <Grab />
      {ui}
    </QueryClientProvider>
  )
}

afterEach(() => vi.restoreAllMocks())

describe('CapacityBanner — mobile _TenantCapacityBanner (Prompt 3B)', () => {
  it('says how many branches are used and how many can still be built', async () => {
    vi.spyOn(hostApi, 'getBranchQuota').mockResolvedValue(ok(quota()) as never)
    mount(<CapacityBanner />)

    expect(await screen.findByText('5 of 6 branches used')).toBeInTheDocument()
    expect(screen.getByText('1 more branch available to build')).toBeInTheDocument()
  })

  it('at the limit it says all branches are in use and links to the plan', async () => {
    vi.spyOn(hostApi, 'getBranchQuota').mockResolvedValue(
      ok(quota({ activeBranches: 6, usedBranches: 6, remainingBranches: 0, buildableBranches: 0 })) as never
    )
    mount(<CapacityBanner />)

    expect(await screen.findByText('6 of 6 branches used')).toBeInTheDocument()
    expect(screen.getByText('All branches in use — add more in the GymsEra app')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /branches used/i })).toHaveAttribute('href', '/settings/billing')
  })

  it('shows the over-capacity warning with the mobile wording', async () => {
    vi.spyOn(hostApi, 'getBranchQuota').mockResolvedValue(ok(quota({ overQuotaCount: 2, buildableBranches: 0 })) as never)
    mount(<CapacityBanner />)

    expect(await screen.findByText("Over your plan's branch capacity")).toBeInTheDocument()
    expect(
      screen.getByText(/Your plan was recently downgraded and now covers 2 fewer branch\(es\) than you have active\. Nothing has been closed/)
    ).toBeInTheDocument()
  })

  it('shows nothing when the plan has no branches or the quota cannot be read', async () => {
    vi.spyOn(hostApi, 'getBranchQuota').mockResolvedValue(ok(quota({ maxBranches: 0 })) as never)
    const { container } = mount(<CapacityBanner />)
    await waitFor(() => expect(hostApi.getBranchQuota).toHaveBeenCalled())
    expect(container.querySelector('[data-testid="capacity-banner"]')).toBeNull()
  })

  it('is read from ONE place: two banners, one request; one invalidation updates both', async () => {
    const get = vi
      .spyOn(hostApi, 'getBranchQuota')
      .mockResolvedValueOnce(ok(quota()) as never)
      .mockResolvedValue(ok(quota({ activeBranches: 6, usedBranches: 6, remainingBranches: 0, buildableBranches: 0 })) as never)
    mount(
      <>
        <CapacityBanner />
        <CapacityBanner />
      </>
    )

    expect(await screen.findAllByText('5 of 6 branches used')).toHaveLength(2)
    expect(get).toHaveBeenCalledTimes(1)

    await act(async () => invalidateBranchCapacity(client))

    expect(await screen.findAllByText('6 of 6 branches used')).toHaveLength(2)
    expect(get).toHaveBeenCalledTimes(2)
  })
})
