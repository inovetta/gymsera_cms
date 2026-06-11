import apiClient from './client'
import { ApiResponse, Tenant, PlatformPackage, TenantSubscription } from '@/types'

export interface UpdateTenantProfilePayload {
  businessName?: string
  email?: string
  phone?: string
  cityId?: number
}

export const tenantsApi = {
  getMyTenant: async (): Promise<ApiResponse<{ tenant: Tenant; subscription: TenantSubscription | null }>> => {
    const { data } = await apiClient.get('/tenants/me')
    return data
  },

  updateMyTenant: async (payload: UpdateTenantProfilePayload): Promise<ApiResponse<{ tenant: Tenant }>> => {
    const { data } = await apiClient.patch('/tenants/me', payload)
    return data
  },

  selectPackage: async (tenantId: string, packageId: string): Promise<ApiResponse<{ tenant: Tenant; package: PlatformPackage }>> => {
    const { data } = await apiClient.post(`/tenants/${tenantId}/select-package`, { packageId })
    return data
  },

  getPackages: async (): Promise<ApiResponse<{ packages: PlatformPackage[] }>> => {
    const { data } = await apiClient.get('/platform-packages')
    return data
  },
}
