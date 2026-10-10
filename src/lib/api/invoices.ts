import apiClient from './client'
import { ApiResponse, Invoice } from '@/types'

export interface GetInvoicesParams {
  page?: number
  limit?: number
  status?: string
  userId?: string
  /** Required for a team member: without it the server lists only the caller's own invoices. */
  branchId?: string
  /** YYYY-MM-DD, on the issue date. (The list reads `from`/`to`, not startDate/endDate.) */
  from?: string
  to?: string
}

export const invoicesApi = {
  getInvoices: async (params?: GetInvoicesParams): Promise<ApiResponse<{ invoices: Invoice[] }>> => {
    const { data } = await apiClient.get('/invoices', { params })
    return data
  },

  getInvoice: async (id: string): Promise<ApiResponse<{ invoice: Invoice }>> => {
    const { data } = await apiClient.get(`/invoices/${id}`)
    return data
  },

  downloadInvoicePdf: async (id: string): Promise<Blob> => {
    const { data } = await apiClient.get(`/invoices/${id}/pdf`, { responseType: 'blob' })
    return data
  },
}
