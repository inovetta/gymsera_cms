import apiClient from './client'
import { ApiResponse, Trainer } from '@/types'

export interface GetTrainersParams {
  page?: number
  limit?: number
  status?: 'ACTIVE' | 'INACTIVE'
  branchId?: string
}

// POST /trainers (gymsera_be trainers.validator.js createTrainer): the person is named by user id.
export interface CreateTrainerPayload {
  userId: string
  branchId?: string
  specialization?: string
  bio?: string
  yearsExperience?: number
  certificationsJson?: string[]
}

export interface UpdateTrainerPayload {
  specialization?: string
  bio?: string
  yearsExperience?: number
  certificationsJson?: string[]
  status?: 'ACTIVE' | 'INACTIVE'
}

export interface AssignTrainerPayload {
  branchId: string
}

// The API stores certifications as `certificationsJson`; the page reads `certifications`.
type ServerTrainer = Trainer & { certificationsJson?: string[] | null }
const normalize = (t: ServerTrainer): Trainer => ({ ...t, certifications: t.certifications ?? t.certificationsJson ?? [] })

export const trainersApi = {
  getTrainers: async (params?: GetTrainersParams): Promise<ApiResponse<{ trainers: Trainer[] }>> => {
    const { data } = await apiClient.get('/trainers', { params })
    return data?.data?.trainers ? { ...data, data: { ...data.data, trainers: data.data.trainers.map(normalize) } } : data
  },

  createTrainer: async (payload: CreateTrainerPayload): Promise<ApiResponse<{ trainer: Trainer }>> => {
    const { data } = await apiClient.post('/trainers', payload)
    return data
  },

  updateTrainer: async (id: string, payload: UpdateTrainerPayload): Promise<ApiResponse<{ trainer: Trainer }>> => {
    const { data } = await apiClient.patch(`/trainers/${id}`, payload)
    return data
  },

  // Status is a field of PATCH /trainers/:id; there is no toggle route.
  setTrainerStatus: async (id: string, status: 'ACTIVE' | 'INACTIVE'): Promise<ApiResponse<{ trainer: Trainer }>> => {
    const { data } = await apiClient.patch(`/trainers/${id}`, { status })
    return data
  },

  assignTrainer: async (id: string, payload: AssignTrainerPayload): Promise<ApiResponse<{ trainer: Trainer }>> => {
    const { data } = await apiClient.post(`/trainers/${id}/assign`, payload)
    return data
  },
}
