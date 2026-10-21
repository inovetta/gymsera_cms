import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TrainersPage from '@/app/(dashboard)/gym/trainers/page'
import { trainersApi } from '@/lib/api/trainers'
import { teamApi } from '@/lib/api/team'
import { meApi, MyContext } from '@/lib/api/me'
import { tenantsApi } from '@/lib/api/tenants'
import { ok, deskMember, managerMember } from '../fixtures/team'
import { frontDeskContext, ownerContext, branchManagerContext } from '../fixtures/context'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: any) => <a href={href} {...r}>{children}</a> }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div data-testid="header" /> }))

let accountRole = 'MEMBER'
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', fullName: 'Test Person', role: accountRole },
    logout: vi.fn(),
    isPlatformAdmin: false,
    isGymHost: accountRole === 'GYM_HOST',
    isBranchManager: false,
  }),
}))

const trainer = {
  id: 'tr-1', userId: 'user-desk', specialization: 'Yoga', bio: '', yearsExperience: 2,
  certifications: [], status: 'ACTIVE',
}

let createTrainer: ReturnType<typeof vi.spyOn>
let setStatus: ReturnType<typeof vi.spyOn>

const show = (context: MyContext) => {
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(context) as never)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <TrainersPage />
    </QueryClientProvider>
  )
}

const openMenu = async () => {
  const trigger = (await screen.findAllByRole('button')).find((b) => b.getAttribute('aria-haspopup') === 'menu')!
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
}

beforeEach(() => {
  accountRole = 'MEMBER'
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
  vi.spyOn(trainersApi, 'getTrainers').mockResolvedValue(ok({ trainers: [trainer] }) as never)
  vi.spyOn(teamApi, 'getTeam').mockResolvedValue(ok({ team: [deskMember, managerMember] }) as never)
  createTrainer = vi.spyOn(trainersApi, 'createTrainer').mockResolvedValue(ok({ trainer }) as never)
  setStatus = vi.spyOn(trainersApi, 'setTrainerStatus').mockResolvedValue(ok({ trainer }) as never)
})
afterEach(() => vi.restoreAllMocks())

describe('CMS Trainers page: permission gates match what /trainers allows', () => {
  it('the owner can add a trainer, picking a person from the team (the API wants a user id)', async () => {
    accountRole = 'GYM_HOST'
    show(ownerContext)
    fireEvent.click((await screen.findAllByRole('button', { name: /add trainer/i }))[0])
    fireEvent.change(await screen.findByLabelText(/team member/i), { target: { value: managerMember.userId } })
    fireEvent.change(screen.getByLabelText(/specialization/i), { target: { value: 'Boxing' } })
    fireEvent.click(screen.getByRole('button', { name: /^add trainer$/i }))
    await waitFor(() => expect(createTrainer).toHaveBeenCalled())
    expect(createTrainer.mock.calls[0][0]).toMatchObject({ userId: managerMember.userId, specialization: 'Boxing' })
    expect(createTrainer.mock.calls[0][0]).not.toHaveProperty('email')
  })

  it('a branch manager (account role MEMBER) sees the list but not "Add Trainer": POST /trainers is owner-only', async () => {
    show(branchManagerContext)
    await screen.findByText('Yoga')
    expect(screen.queryByRole('button', { name: /add trainer/i })).toBeNull()
  })

  it('a branch manager can deactivate: PATCH /trainers/:id { status: INACTIVE }', async () => {
    show(branchManagerContext)
    await screen.findByText('Yoga')
    await openMenu()
    fireEvent.click(await screen.findByText('Deactivate'))
    await waitFor(() => expect(setStatus).toHaveBeenCalledWith('tr-1', 'INACTIVE'))
  })

  it('someone without schedule.trainer.assign (front desk) gets no edit or status actions', async () => {
    show(frontDeskContext)
    await screen.findByText('Yoga')
    expect(screen.queryByRole('button', { name: /add trainer/i })).toBeNull()
    const triggers = screen.queryAllByRole('button').filter((b) => b.getAttribute('aria-haspopup') === 'menu')
    expect(triggers).toHaveLength(0)
  })
})
