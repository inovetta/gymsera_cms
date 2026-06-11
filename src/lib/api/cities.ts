import apiClient from './client'
import { ApiResponse, City, Area } from '@/types'

export interface CreateCityPayload {
  name: string
  imageUrl?: string | null
}

export interface UpdateCityPayload {
  name?: string
  isActive?: boolean
  imageUrl?: string | null
}

export interface CreateAreaPayload {
  name: string
  imageUrl?: string | null
}

export interface UpdateAreaPayload {
  name?: string
  imageUrl?: string | null
}

export const citiesApi = {
  getCities: async (): Promise<ApiResponse<City[]>> => {
    const { data } = await apiClient.get('/cities')
    return data
  },

  getCity: async (id: number): Promise<ApiResponse<City>> => {
    const { data } = await apiClient.get(`/cities/${id}`)
    return data
  },

  createCity: async (payload: CreateCityPayload): Promise<ApiResponse<City>> => {
    const { data } = await apiClient.post('/cities', payload)
    return data
  },

  updateCity: async (id: number, payload: UpdateCityPayload): Promise<ApiResponse<City>> => {
    const { data } = await apiClient.patch(`/cities/${id}`, payload)
    return data
  },

  getAreas: async (cityId: number): Promise<ApiResponse<{ city: City; areas: Area[] }>> => {
    const { data } = await apiClient.get(`/cities/${cityId}/areas`)
    return data
  },

  createArea: async (cityId: number, payload: CreateAreaPayload): Promise<ApiResponse<Area>> => {
    const { data } = await apiClient.post(`/cities/${cityId}/areas`, payload)
    return data
  },

  updateArea: async (cityId: number, areaId: number, payload: UpdateAreaPayload): Promise<ApiResponse<Area>> => {
    const { data } = await apiClient.patch(`/cities/${cityId}/areas/${areaId}`, payload)
    return data
  },

  deleteCity: async (cityId: number): Promise<ApiResponse<null>> => {
    const { data } = await apiClient.delete(`/cities/${cityId}`)
    return data
  },

  deleteArea: async (cityId: number, areaId: number): Promise<ApiResponse<null>> => {
    const { data } = await apiClient.delete(`/cities/${cityId}/areas/${areaId}`)
    return data
  },

  uploadCityImage: async (cityId: number, file: File): Promise<ApiResponse<{ imageUrl: string }>> => {
    const form = new FormData()
    form.append('image', file)
    const { data } = await apiClient.post(`/cities/${cityId}/image`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  uploadAreaImage: async (cityId: number, areaId: number, file: File): Promise<ApiResponse<{ imageUrl: string }>> => {
    const form = new FormData()
    form.append('image', file)
    const { data } = await apiClient.post(`/cities/${cityId}/areas/${areaId}/image`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
}
