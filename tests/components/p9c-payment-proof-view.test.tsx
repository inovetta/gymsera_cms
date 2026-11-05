import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import fs from 'fs'
import path from 'path'

vi.mock('@/lib/api/private-file', () => ({ fetchPrivateFile: vi.fn() }))
import { fetchPrivateFile } from '@/lib/api/private-file'
import { PaymentProofView } from '@/components/features/payment-proof-view'

/**
 * Phase 7 P9c (A): a payment proof is opened through the authenticated route as a Blob inside
 * the dashboard; there is no plain link (it opened cms.gymsera.com/uploads/... → 404, and a
 * public link would leak the receipt).
 */
describe('PaymentProofView', () => {
  beforeEach(() => {
    vi.mocked(fetchPrivateFile).mockReset()
    ;(URL as any).createObjectURL = vi.fn(() => 'blob:proof-1')
    ;(URL as any).revokeObjectURL = vi.fn()
  })

  it('fetches the proof route with the signed-in client and shows the image', async () => {
    vi.mocked(fetchPrivateFile).mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }))
    render(<PaymentProofView proofUrl="/api/v1/payments/p-1/proof" />)
    expect(screen.queryByRole('link')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    await waitFor(() => expect(screen.getByAltText('Payment proof')).toHaveAttribute('src', 'blob:proof-1'))
    expect(fetchPrivateFile).toHaveBeenCalledWith('/api/v1/payments/p-1/proof')
  })

  it('a refused load shows the error state, not an image', async () => {
    vi.mocked(fetchPrivateFile).mockRejectedValue({ response: { status: 404, data: { message: 'Payment not found' } } })
    render(<PaymentProofView proofUrl="/api/v1/payments/p-1/proof" />)
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    await waitFor(() => expect(screen.getByTestId('error-state')).toBeInTheDocument())
    expect(screen.queryByAltText('Payment proof')).toBeNull()
  })

  it('a failed load (network) offers Retry, which fetches again', async () => {
    vi.mocked(fetchPrivateFile).mockRejectedValueOnce({ request: {}, message: 'Network Error' })
      .mockResolvedValueOnce(new Blob(['x'], { type: 'image/jpeg' }))
    render(<PaymentProofView proofUrl="/api/v1/payments/p-1/proof" />)
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    fireEvent.click(await screen.findByRole('button', { name: /retry/i }))
    await waitFor(() => expect(screen.getByAltText('Payment proof')).toBeInTheDocument())
    expect(fetchPrivateFile).toHaveBeenCalledTimes(2)
  })

  it('a proof that was never stored says so instead of linking', () => {
    render(<PaymentProofView proofUrl={null} proofMissing />)
    expect(screen.getByText(/Proof not saved — ask the member to upload it again/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('no proof: a dash', () => {
    render(<PaymentProofView proofUrl={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

describe('guard: no page links to a proof directly', () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []
    )
  it('no href or src is built from proofUrl in src/', () => {
    const offenders = walk(path.join(__dirname, '../../src')).filter((f) =>
      /(href|src)=\{[^}]*proofUrl/.test(fs.readFileSync(f, 'utf8'))
    )
    expect(offenders).toEqual([])
  })
})
