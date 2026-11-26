/**
 * NEW-303 M3e (R-121): GET /host/status `nextStep` drives the owner's banner on Businesses.
 * Live check 2026-11-26 (cd5e17a): upload_proof_of_premises → wait_for_business_approval → null.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NextStepBanner, UPLOAD_PROOF_TITLE } from '@/components/features/businesses/next-step-banner'
import { hostApi, type Business } from '@/lib/api/host'
import apiClient from '@/lib/api/client'

const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)

afterEach(() => vi.restoreAllMocks())

const business = { id: 'b1', name: 'Live Fitness', status: 'PENDING' } as Business

describe('NextStepBanner', () => {
  it('upload_proof_of_premises: asks for the proof and opens that business’s documents', async () => {
    vi.spyOn(hostApi, 'getNextStep').mockResolvedValue({ key: 'upload_proof_of_premises', businessId: 'b1' })
    const onUpload = vi.fn()
    wrap(<NextStepBanner businesses={[business]} onUpload={onUpload} />)
    expect(await screen.findByText(UPLOAD_PROOF_TITLE)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Upload proof of premises' }))
    expect(onUpload).toHaveBeenCalledWith(business)
  })

  it('wait_for_business_approval: says GymsEra is reviewing', async () => {
    vi.spyOn(hostApi, 'getNextStep').mockResolvedValue({ key: 'wait_for_business_approval', businessId: 'b1' })
    wrap(<NextStepBanner businesses={[business]} onUpload={vi.fn()} />)
    expect(await screen.findByTestId('next-step-wait')).toHaveTextContent('GymsEra is reviewing Live Fitness')
  })

  it('null: nothing', async () => {
    const spy = vi.spyOn(hostApi, 'getNextStep').mockResolvedValue(null)
    const { container } = wrap(<NextStepBanner businesses={[business]} onUpload={vi.fn()} />)
    await vi.waitFor(() => expect(spy).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('getNextStep reads GET /host/status data.nextStep', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { data: { nextStep: null } } } as never)
    expect(await hostApi.getNextStep()).toBeNull()
    expect(get).toHaveBeenCalledWith('/host/status')
  })
})
