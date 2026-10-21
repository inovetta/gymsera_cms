import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mockAuth = vi.hoisted(() => ({ requestPasswordReset: vi.fn(), confirmPasswordReset: vi.fn() }))
vi.mock('@/lib/api/auth', () => ({ authApi: mockAuth }))

import ForgotPasswordPage from '@/app/(auth)/forgot-password/page'

describe('CMS forgot-password: request a code, then confirm it', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.requestPasswordReset.mockResolvedValue({ success: true })
    mockAuth.confirmPasswordReset.mockResolvedValue({ success: true })
  })

  const requestCode = async () => {
    render(<ForgotPasswordPage />)
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'host@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send reset code/i }))
    await waitFor(() => expect(mockAuth.requestPasswordReset).toHaveBeenCalledWith({ email: 'host@example.com' }))
  }

  it('after the code is sent it asks for the code and a new password', async () => {
    await requestCode()
    expect(await screen.findByLabelText(/reset code/i)).toBeTruthy()
    expect(screen.getByLabelText(/^new password/i)).toBeTruthy()
    expect(screen.getByLabelText(/confirm new password/i)).toBeTruthy()
  })

  it('confirms with { email, code, password } and then offers the login link', async () => {
    await requestCode()
    fireEvent.change(await screen.findByLabelText(/reset code/i), { target: { value: '123456' } })
    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'Str0ng!pass' } })
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'Str0ng!pass' } })
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }))
    await waitFor(() =>
      expect(mockAuth.confirmPasswordReset).toHaveBeenCalledWith({ email: 'host@example.com', code: '123456', password: 'Str0ng!pass' })
    )
    expect(await screen.findByText(/password has been reset/i)).toBeTruthy()
  })

  it('does not call the API when the two passwords differ', async () => {
    await requestCode()
    fireEvent.change(await screen.findByLabelText(/reset code/i), { target: { value: '123456' } })
    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'Str0ng!pass' } })
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'Different1!' } })
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }))
    expect(await screen.findByText(/passwords do not match/i)).toBeTruthy()
    expect(mockAuth.confirmPasswordReset).not.toHaveBeenCalled()
  })
})
