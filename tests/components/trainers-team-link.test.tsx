import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TrainersPage from '@/app/(dashboard)/gym/trainers/page'
import { trainersApi } from '@/lib/api/trainers'
import { teamApi, TeamMember } from '@/lib/api/team'
import { apiError, deskMember, ok } from '../fixtures/team'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('@/components/layout/header', () => ({
  Header: () => <div data-testid="header" />,
}))

const trainer = (id: string, userId: string, fullName: string) => ({
  id,
  userId,
  specialization: 'Strength',
  yearsExperience: 4,
  certifications: [],
  status: 'ACTIVE',
  user: { id: userId, fullName, email: `${id}@example.test` },
})

const trainerOnTeam: TeamMember = {
  ...deskMember,
  id: 'asg-trainer',
  userId: 'user-t1',
  fullName: 'Zain Trainer',
  role: { key: 'TRAINER', name: 'Trainer', level: 20 },
}

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <TrainersPage />
    </QueryClientProvider>
  )
}

const card = (name: string) => screen.getByText(name).closest('.rounded-lg, [class*="card"]') as HTMLElement

describe('Trainers page — linked to the team record (UX-12)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('links a trainer to their Team & access record, matched by user', async () => {
    vi.spyOn(trainersApi, 'getTrainers').mockResolvedValue(
      ok({ trainers: [trainer('t1', 'user-t1', 'Zain Trainer'), trainer('t2', 'user-t2', 'Noor Coach')] }) as never
    )
    vi.spyOn(teamApi, 'getTeam').mockResolvedValue(ok({ team: [trainerOnTeam], counts: {}, total: 1 }) as never)
    renderPage()

    const link = await screen.findByRole('link', { name: /team record · trainer/i })
    expect(link).toHaveAttribute('href', '/gym/team?member=asg-trainer')
    expect(within(card('Zain Trainer')).getByRole('link', { name: /team record/i })).toBe(link)

    // A profile without a team record gives no access, and says so.
    const other = within(card('Noor Coach'))
    expect(other.getByText(/no team access/i)).toBeInTheDocument()
    expect(other.getByRole('link', { name: 'Add to team' })).toHaveAttribute('href', '/gym/team')
  })

  it('does not link to a revoked record', async () => {
    vi.spyOn(trainersApi, 'getTrainers').mockResolvedValue(
      ok({ trainers: [trainer('t1', 'user-t1', 'Zain Trainer')] }) as never
    )
    vi.spyOn(teamApi, 'getTeam').mockResolvedValue(
      ok({ team: [{ ...trainerOnTeam, status: 'REVOKED' }], counts: {}, total: 1 }) as never
    )
    renderPage()

    expect(await screen.findByText(/no team access/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /team record/i })).not.toBeInTheDocument()
  })

  it('still lists trainers, and claims nothing about access, when the team cannot be read (403)', async () => {
    vi.spyOn(trainersApi, 'getTrainers').mockResolvedValue(
      ok({ trainers: [trainer('t1', 'user-t1', 'Zain Trainer')] }) as never
    )
    vi.spyOn(teamApi, 'getTeam').mockRejectedValue(apiError(403, 'You do not have permission to view the team here'))
    renderPage()

    expect(await screen.findByText('Zain Trainer')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /team record/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/no team access/i)).not.toBeInTheDocument()
  })
})
