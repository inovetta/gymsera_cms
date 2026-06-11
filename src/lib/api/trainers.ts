import apiClient from './client'
import { ApiResponse, Trainer } from '@/types'

export interface GetTrainersParams {
  page?: number
  limit?: number
  search?: string
  status?: string
  branchId?: string
}

export interface CreateTrainerPayload {
  userId?: string
  email?: string
  fullName?: string
  specialization: string
  bio?: string
  yearsExperience: number
  certifications?: string[]
}

export interface UpdateTrainerPayload {
  specialization?: string
  bio?: string
  yearsExperience?: number
  certifications?: string[]
  status?: string
}

export interface AssignTrainerPayload {
  branchId: string
}

export const trainersApi = {
  getTrainers: async (params?: GetTrainersParams): Promise<ApiResponse<{ trainers: Trainer[] }>> => {
    const { data } = await apiClient.get('/gyms/trainers', { params })
    return data
  },

  getTrainer: async (id: string): Promise<ApiResponse<{ trainer: Trainer }>> => {
    const { data } = await apiClient.get(`/gyms/trainers/${id}`)
    return data
  },

  createTrainer: async (payload: CreateTrainerPayload): Promise<ApiResponse<{ trainer: Trainer }>> => {
    const { data } = await apiClient.post('/gyms/trainers', payload)
    return data
  },

  updateTrainer: async (id: string, payload: UpdateTrainerPayload): Promise<ApiResponse<{ trainer: Trainer }>> => {
    const { data } = await apiClient.patch(`/gyms/trainers/${id}`, payload)
    return data
  },

  assignTrainer: async (id: string, payload: AssignTrainerPayload): Promise<ApiResponse<{ trainer: Trainer }>> => {
    const { data } = await apiClient.post(`/gyms/trainers/${id}/assign`, payload)
    return data
  },

  toggleTrainerStatus: async (id: string): Promise<ApiResponse<{ trainer: Trainer }>> => {
    const { data } = await apiClient.patch(`/gyms/trainers/${id}/toggle-status`)
    return data
  },
}
