import apiClient from './client'
import { ApiResponse, AttendanceLog } from '@/types'

export interface GetAttendanceParams {
  page?: number
  limit?: number
  branchId?: string
  userId?: string
  date?: string
  startDate?: string
  endDate?: string
}

export interface ManualCheckInPayload {
  userId?: string
  email?: string
  branchId: string
}

export interface AttendanceReport {
  date: string
  totalCheckIns: number
  uniqueMembers: number
  peakHour?: string
}

export const attendanceApi = {
  getAttendance: async (params?: GetAttendanceParams): Promise<ApiResponse<{ logs: AttendanceLog[] }>> => {
    const { data } = await apiClient.get('/attendance', { params })
    return data
  },

  manualCheckIn: async (payload: ManualCheckInPayload): Promise<ApiResponse<{ log: AttendanceLog }>> => {
    const { data } = await apiClient.post('/attendance/check-in', payload)
    return data
  },

  manualCheckOut: async (attendanceId: string): Promise<ApiResponse<{ log: AttendanceLog }>> => {
    const { data } = await apiClient.patch(`/attendance/${attendanceId}/check-out`)
    return data
  },

  getTodayAttendance: async (): Promise<ApiResponse<{ logs: AttendanceLog[] }>> => {
    const { data } = await apiClient.get('/attendance/today')
    return data
  },

  getAttendanceReport: async (period: string): Promise<ApiResponse<AttendanceReport[]>> => {
    const { data } = await apiClient.get('/attendance/report', { params: { period } })
    return data
  },
}
