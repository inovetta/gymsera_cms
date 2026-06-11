import apiClient from './client'
import { ApiResponse, DashboardStats, BranchReport } from '@/types'

export interface PlatformStats {
  gyms: { active: number; pendingReview: number; suspended: number; addedThisMonth: number }
  members: { totalActive: number; addedThisMonth: number }
}

export interface MonthlyReport {
  year: number
  month: number
  totalRevenue: number
  totalMembers: number
  newMembers: number
  activeSubscriptions: number
  totalAttendance: number
  revenueByDay: { date: string; amount: number }[]
  membershipBreakdown: { planName: string; count: number }[]
  attendanceByDay: { day: string; count: number }[]
}

export const reportsApi = {
  getDashboardStats: async (): Promise<ApiResponse<DashboardStats>> => {
    const { data } = await apiClient.get('/reports/dashboard')
    return data
  },

  getPlatformStats: async (): Promise<ApiResponse<PlatformStats>> => {
    const { data } = await apiClient.get('/admin/reports/platform')
    return data
  },

  getMonthlyReport: async (year: number, month: number): Promise<ApiResponse<MonthlyReport>> => {
    const { data } = await apiClient.get('/reports/monthly', { params: { year, month } })
    return data
  },

  exportMonthlyPdf: async (year: number, month: number): Promise<Blob> => {
    const { data } = await apiClient.get('/reports/monthly/export', {
      params: { year, month },
      responseType: 'blob',
    })
    return data
  },

  getYearlyRevenue: async (year?: number): Promise<ApiResponse<{ year: number; data: { month: string; revenue: number }[] }>> => {
    const { data } = await apiClient.get('/reports/yearly', { params: year ? { year } : undefined })
    return data
  },

  getWeeklyAttendance: async (): Promise<ApiResponse<{ data: { day: string; date: string; count: number }[] }>> => {
    const { data } = await apiClient.get('/reports/weekly-attendance')
    return data
  },

  getBranchReport: async (branchId: string): Promise<ApiResponse<BranchReport>> => {
    const { data } = await apiClient.get(`/reports/branch/${branchId}`)
    return data
  },
}
