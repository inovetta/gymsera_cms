import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MembersTab } from '@/components/features/admin-tenant/members-tab'
import { adminApi } from '@/lib/api/admin'
import { ok } from '../fixtures/team'

// SEC-17: the admin Members tab shows masked contact details and reveals them only on request.
const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastSpy }) }))

const tenant = { id: 't1', status: 'ACTIVE' } as never
const member = {
  id: 'sub-1', userId: 'user-1', branchId: 'b1', membershipPlanId: 'p1', startDate: '2026-01-01', endDate: '2026-12-31',
  status: 'ACTIVE', subscribedAt: '2026-01-01', sourceChannel: null,
  plan: { id: 'p1', name: 'Monthly', durationType: 'MONTHLY', durationValue: 1 },
  branch: { id: 'b1', branchName: 'Downtown' },
  user: { id: 'user-1', fullName: 'Sec Seventeen', email: 's***@example.test', phone: '**********67', contactMasked: true, status: 'ACTIVE', profileImageUrl: null },
}

const renderTab = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MembersTab tenant={tenant} tenantId="t1" />
    </QueryClientProvider>
  )
}

describe('Admin Members tab contact details (SEC-17)', () => {
  afterEach(() => { vi.restoreAllMocks(); toastSpy.mockClear() })

  it('shows the masked e-mail and phone, never a full value, and does not reveal on load', async () => {
    vi.spyOn(adminApi, 'getTenantMembers').mockResolvedValue(ok({ members: [member] }) as never)
    const reveal = vi.spyOn(adminApi, 'revealTenantMemberContact')
    renderTab()
    expect(await screen.findByText('s***@example.test')).toBeInTheDocument()
    expect(screen.getByText('**********67')).toBeInTheDocument()
    expect(reveal).not.toHaveBeenCalled()
  })

  it('reveals only after the admin confirms, sends the optional reason, and can hide the values again', async () => {
    vi.spyOn(adminApi, 'getTenantMembers').mockResolvedValue(ok({ members: [member] }) as never)
    const reveal = vi.spyOn(adminApi, 'revealTenantMemberContact').mockResolvedValue(
      ok({ userId: 'user-1', email: 'sec.member@example.test', phone: '+923001234567' }) as never
    )
    renderTab()
    fireEvent.click(await screen.findByRole('button', { name: /show contact/i }))
    expect(reveal).not.toHaveBeenCalled() // opening the form is not a reveal
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Member asked support' } })
    fireEvent.click(screen.getByRole('button', { name: /^reveal$/i }))

    expect(await screen.findByText('sec.member@example.test')).toBeInTheDocument()
    expect(screen.getByText('+923001234567')).toBeInTheDocument()
    expect(reveal).toHaveBeenCalledWith('t1', 'user-1', 'Member asked support')

    fireEvent.click(screen.getByRole('button', { name: /hide contact/i }))
    expect(screen.queryByText('sec.member@example.test')).not.toBeInTheDocument()
    expect(screen.getByText('s***@example.test')).toBeInTheDocument()
  })

  it('a failed reveal shows an error and keeps the values masked', async () => {
    vi.spyOn(adminApi, 'getTenantMembers').mockResolvedValue(ok({ members: [member] }) as never)
    vi.spyOn(adminApi, 'revealTenantMemberContact').mockRejectedValue(new Error('audit down'))
    renderTab()
    fireEvent.click(await screen.findByRole('button', { name: /show contact/i }))
    fireEvent.click(screen.getByRole('button', { name: /^reveal$/i }))
    await waitFor(() => expect(toastSpy).toHaveBeenCalled())
    expect(toastSpy.mock.calls[0][0]).toMatchObject({ variant: 'destructive' })
    expect(screen.getByText('s***@example.test')).toBeInTheDocument()
  })
})
