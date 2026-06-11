import apiClient from './client'
import { ApiResponse, Invoice } from '@/types'

export interface GetInvoicesParams {
  page?: number
  limit?: number
  status?: string
  userId?: string
  startDate?: string
  endDate?: string
  invoiceType?: string
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
