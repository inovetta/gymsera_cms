import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LoginPage from '@/app/(auth)/login/page'
import DashboardLayout from '@/app/(dashboard)/layout'
import { authApi } from '@/lib/api/auth'
import { meApi } from '@/lib/api/me'
import { tenantsApi } from '@/lib/api/tenants'
import { approvalsApi } from '@/lib/api/approvals'
import { useAuthStore } from '@/stores/auth.store'
import { apiError, ok } from '../fixtures/team'
import { frontDeskContext, ownerContext, plainMemberContext } from '../fixtures/context'

const push = vi.fn()
const replace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, prefetch: vi.fn() }),
  usePathname: () => '/dashboard',
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/components/features/google-sign-in-button', () => ({
  GoogleSignInButton: () => <div data-testid="google-button" />,
}))

const user = (role: string) => ({ id: 'user-1', fullName: 'Test Person', email: 'p@example.test', role, status: 'ACTIVE' })

const setSession = (role: string) =>
  act(() => {
    useAuthStore.setState({ user: user(role) as any, accessToken: 'x', refreshToken: 'y', isAuthenticated: true, isLoading: false })
  })

const withClient = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

const signIn = async () => {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'person@example.test' } })
  fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'placeholder-pass' } })
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
}

beforeEach(() => {
  push.mockReset()
  replace.mockReset()
  localStorage.clear()
  useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false, isLoading: false })
})
afterEach(() => vi.restoreAllMocks())

const loginAs = (role: string) =>
  vi.spyOn(authApi, 'login').mockResolvedValue(
    ok({ user: user(role), accessToken: 'tok', refreshToken: 'ref' }) as never
  )

describe('CMS login — portal access follows permissions, not the account role (NEW-43)', () => {
  it('lets a Front Desk clerk (account role MEMBER) in, and sends them to the dashboard', async () => {
    loginAs('MEMBER')
    const getContext = vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(frontDeskContext) as never)
    withClient(<LoginPage />)
    await signIn()

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
    expect(getContext).toHaveBeenCalled()
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(screen.queryByText(/does not have management portal access/i)).not.toBeInTheDocument()
  })

  it('refuses a plain member (no team role, no ownership) and signs them out again', async () => {
    loginAs('MEMBER')
    vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(plainMemberContext) as never)
    withClient(<LoginPage />)
    await signIn()

    expect(await screen.findByText('This account does not have management portal access.')).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(localStorage.getItem('gymsera_access_token')).toBeNull()
  })

  it('does not let a member in when their permissions cannot be checked', async () => {
    loginAs('MEMBER')
    vi.spyOn(meApi, 'getContext').mockRejectedValue(apiError(500, 'Server error'))
    withClient(<LoginPage />)
    await signIn()

    expect(await screen.findByText(/could not check your access/i)).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it.each(['GYM_HOST', 'BRANCH_MANAGER', 'PLATFORM_ADMIN'])(
    'an existing %s account is unaffected: straight to the dashboard',
    async (role) => {
      loginAs(role)
      vi.spyOn(meApi, 'getContext').mockRejectedValue(apiError(500, 'must not be needed'))
      withClient(<LoginPage />)
      await signIn()

      await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
      expect(screen.queryByText(/management portal access/i)).not.toBeInTheDocument()
    }
  )

  it('an owner whose account role is MEMBER is let in on the strength of ownership', async () => {
    loginAs('MEMBER')
    vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(ownerContext) as never)
    withClient(<LoginPage />)
    await signIn()

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
  })
})

describe('Dashboard layout — the guard behind every portal page (NEW-43)', () => {
  beforeEach(() => {
    vi.spyOn(tenantsApi, 'getMyTenant').mockRejectedValue(apiError(403, 'Forbidden'))
    vi.spyOn(approvalsApi, 'list').mockResolvedValue(ok([]) as never)
  })

  const renderLayout = () => withClient(<DashboardLayout><p>PAGE CONTENT</p></DashboardLayout>)

  it('shows the pages to a Front Desk clerk, with only their menu entries', async () => {
    setSession('MEMBER')
    vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(frontDeskContext) as never)
    renderLayout()

    expect(await screen.findByText('PAGE CONTENT')).toBeInTheDocument()
    const nav = (await screen.findAllByRole('navigation'))[0]
    await waitFor(() => expect(within(nav).getByRole('link', { name: 'Members' })).toBeInTheDocument())
    const titles = within(nav).getAllByRole('link').map((a) => a.textContent?.trim())
    expect(titles).toEqual(['Dashboard', 'Plans', 'Members', 'Subscriptions', 'Attendance', 'Payments', 'Invoices'])
  })

  it('stops a plain member who already has a session: refusal, no pages, no menu', async () => {
    setSession('MEMBER')
    vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(plainMemberContext) as never)
    renderLayout()

    expect(await screen.findByText('This account does not have management portal access.')).toBeInTheDocument()
    expect(screen.queryByText('PAGE CONTENT')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('an owner is unaffected', async () => {
    setSession('GYM_HOST')
    vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(ownerContext) as never)
    tenantsApi.getMyTenant = vi.fn().mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null })) as never
    renderLayout()

    expect(await screen.findByText('PAGE CONTENT')).toBeInTheDocument()
  })

  it('a host still waiting for approval (no organization yet) is not refused', async () => {
    setSession('GYM_HOST')
    vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(plainMemberContext) as never)
    renderLayout()

    expect(await screen.findByText('PAGE CONTENT')).toBeInTheDocument()
  })

  it('a platform admin is unaffected', async () => {
    setSession('PLATFORM_ADMIN')
    vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(plainMemberContext) as never)
    renderLayout()

    expect(await screen.findByText('PAGE CONTENT')).toBeInTheDocument()
  })
})
