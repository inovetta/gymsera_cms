import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { Sidebar } from '@/components/layout/sidebar'
import apiClient from '@/lib/api/client'
import { meApi, MyContext } from '@/lib/api/me'
import { tenantsApi } from '@/lib/api/tenants'
import { approvalsApi } from '@/lib/api/approvals'
import { useSelectedOrgStore } from '@/stores/selected-org.store'
import { ok } from '../fixtures/team'
import { orgAdminContext, twoOrgContext } from '../fixtures/context'

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }))
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: any) => <a href={href} {...r}>{children}</a> }))
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', fullName: 'Sana Malik', role: 'MEMBER' },
    logout: vi.fn(),
    isPlatformAdmin: false,
    isGymHost: false,
    isBranchManager: false,
  }),
}))

const sent: Array<{ url?: string; tenant?: unknown }> = []

const renderSidebar = (context: MyContext, extra?: React.ReactNode) => {
  vi.spyOn(meApi, 'getContext').mockImplementation(async () => {
    // What the real call does once the response is in: keep or drop the stored choice.
    useSelectedOrgStore.getState().reconcile(context.organizations.map((o) => o.tenantId))
    return ok(context) as never
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <Sidebar />
        {extra}
      </QueryClientProvider>
    ),
  }
}

const menu = async () => {
  await screen.findByRole('link', { name: 'Dashboard' })
  await new Promise((r) => setTimeout(r, 40))
  return within(screen.getAllByRole('navigation')[0]).getAllByRole('link').map((a) => a.textContent?.replace(/\d+$/, '').trim())
}

beforeEach(() => {
  sent.length = 0
  localStorage.clear()
  useSelectedOrgStore.setState({ tenantId: null })
  apiClient.defaults.adapter = async (config) => {
    sent.push({ url: config.url, tenant: (config.headers as any)?.get?.('X-Tenant-Id') })
    return { data: { success: true, data: {} }, status: 200, statusText: 'OK', headers: {}, config }
  }
  vi.spyOn(tenantsApi, 'getMyTenant').mockRejectedValue(new Error('owner-only'))
  vi.spyOn(approvalsApi, 'list').mockResolvedValue(ok([]) as never)
})
afterEach(() => {
  apiClient.defaults.adapter = undefined
  vi.restoreAllMocks()
})

describe('Organization switcher (Prompt 3B)', () => {
  it('is not shown to someone who works in one organization', async () => {
    renderSidebar(orgAdminContext)
    await menu()
    expect(screen.queryByLabelText('Organization')).not.toBeInTheDocument()
  })

  it('lists the person’s organizations, defaulting to the one the server would pick (most senior)', async () => {
    renderSidebar(twoOrgContext)
    const select = (await screen.findAllByLabelText('Organization'))[0] as HTMLSelectElement
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Iron Gym', 'Fit Hub'])
    expect(select.value).toBe('tenant-a')
  })

  it('choosing another organization sends it as X-Tenant-Id', async () => {
    renderSidebar(twoOrgContext)
    fireEvent.change((await screen.findAllByLabelText('Organization'))[0], { target: { value: 'tenant-b' } })

    await apiClient.get('/team')
    expect(sent[sent.length - 1].tenant).toBe('tenant-b')
  })

  it('every permission-gated entry follows the selected organization, not the most senior', async () => {
    renderSidebar(twoOrgContext)
    expect(await menu()).toEqual(expect.arrayContaining(['Team & access', 'Approvals', 'Branches']))

    fireEvent.change((await screen.findAllByLabelText('Organization'))[0], { target: { value: 'tenant-b' } })

    await waitFor(async () => {
      const titles = await menu()
      expect(titles).not.toContain('Team & access')
      expect(titles).not.toContain('Branches')
      expect(titles).toContain('Payments')
    })
  })

  it('drops what was cached for the previous organization when the choice changes', async () => {
    const calls = vi.fn(async () => 'data')
    const Probe = () => {
      useQuery({ queryKey: ['team'], queryFn: calls })
      return null
    }
    renderSidebar(twoOrgContext, <Probe />)
    await waitFor(() => expect(calls).toHaveBeenCalledTimes(1))

    fireEvent.change((await screen.findAllByLabelText('Organization'))[0], { target: { value: 'tenant-b' } })
    await waitFor(() => expect(calls).toHaveBeenCalledTimes(2))
  })

  it('remembers the choice across a reload', async () => {
    localStorage.setItem('gymsera_selected_tenant', 'tenant-b')
    renderSidebar(twoOrgContext)

    const select = (await screen.findAllByLabelText('Organization'))[0] as HTMLSelectElement
    await waitFor(() => expect(select.value).toBe('tenant-b'))
    await apiClient.get('/team')
    expect(sent[sent.length - 1].tenant).toBe('tenant-b')
    expect((await menu())).not.toContain('Team & access')
  })

  it('ignores a remembered organization the person no longer belongs to', async () => {
    localStorage.setItem('gymsera_selected_tenant', 'tenant-gone')
    renderSidebar(twoOrgContext)

    const select = (await screen.findAllByLabelText('Organization'))[0] as HTMLSelectElement
    expect(select.value).toBe('tenant-a')
    await apiClient.get('/team')
    expect(sent[sent.length - 1].tenant).toBeFalsy()
    expect(localStorage.getItem('gymsera_selected_tenant')).toBeNull()
  })
})
