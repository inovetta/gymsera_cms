import apiClient from './client'
import { ApiResponse, DashboardStats, BranchReport } from '@/types'

export interface PlatformStats {
  gyms: { active: number; pendingReview: number; suspended: number; addedThisMonth: number }
  members: { totalActive: number; addedThisMonth: number }
}

/**
 * GET /reports/monthly (gymsera_be reports.service.js#monthlyBreakdown). Per-day rows only: the
 * server sends no totals, no member counts and no plan breakdown, and it does not take a
 * branch (so it is organization-wide). Numbers from SUM() arrive as strings.
 */
export interface MonthlyReport {
  period: { year: number; month: number }
  revenueByDay: { day: string; totalRevenue: string | number; count: string | number }[]
  subscriptionsByDay: { day: string; count: string | number }[]
  checkInsByDay: { day: string; count: string | number }[]
}

export interface BranchDashboard {
  todaysCheckins: number
  activeMembers: number
  newSubs?: number
  monthlyRevenue: number | null
  grossRevenue?: number | null
  totalExpenses?: number | null
  netProfit?: number | null
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

  // GET /host/branches/:id/dashboard — the endpoint the mobile team workspace uses. Needs only
  // dashboard.view; the revenue fields come back null unless dashboard.revenue.view is held.
  getBranchDashboard: async (branchId: string): Promise<ApiResponse<BranchDashboard>> => {
    const { data } = await apiClient.get(`/host/branches/${branchId}/dashboard`)
    return data
  },

  getBranchReport: async (branchId: string): Promise<ApiResponse<BranchReport>> => {
    const { data } = await apiClient.get(`/reports/branch/${branchId}`)
    return data
  },
}
