import apiClient from './client'
import { ApiResponse, PlatformPackage } from '@/types'

export interface CreatePackagePayload {
  name: string
  description?: string
  price: number
  billingCycle: string
  maxOrganizations: number
  maxBranches: number
  maxTrainers: number
  maxMembers: number
  featureFlags?: Record<string, boolean>
}

export interface UpdatePackagePayload extends Partial<CreatePackagePayload> {
  status?: string
}

export const packagesApi = {
  getPackages: async (): Promise<ApiResponse<PlatformPackage[]>> => {
    const { data } = await apiClient.get('/platform-packages')
    return data
  },

  getPackage: async (id: string): Promise<ApiResponse<PlatformPackage>> => {
    const { data } = await apiClient.get(`/platform-packages/${id}`)
    return data
  },

  createPackage: async (payload: CreatePackagePayload): Promise<ApiResponse<PlatformPackage>> => {
    const { data } = await apiClient.post('/platform-packages', payload)
    return data
  },

  updatePackage: async (id: string, payload: UpdatePackagePayload): Promise<ApiResponse<PlatformPackage>> => {
    const { data } = await apiClient.patch(`/platform-packages/${id}`, payload)
    return data
  },

  togglePackageStatus: async (id: string, currentStatus: string): Promise<ApiResponse<PlatformPackage>> => {
    const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    const { data } = await apiClient.patch(`/platform-packages/${id}`, { status: newStatus })
    return data
  },
}
