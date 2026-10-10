import apiClient from './client'
import { ApiResponse } from '@/types'

export interface Notification {
  id: string
  userId: string
  role: 'traveler' | 'host' | 'admin' | 'staff'
  type: string
  title: string
  message: string
  body?: string
  priority: 'normal' | 'high'
  deepLink?: string
  metadataJson?: Record<string, string>
  isRead: boolean
  createdAt: string
  updatedAt: string
}

/** What GET /notifications puts in `pagination` (notifications.service.js#listNotifications). */
export interface NotificationPagination {
  totalItems: number
  currentPage: number
  totalPages: number
  limit: number
}

export const notificationsApi = {
  getNotifications: async (params?: { page?: number; limit?: number }): Promise<
    Omit<ApiResponse<{ notifications: Notification[] }>, 'pagination'> & { pagination?: NotificationPagination }
  > => {
    const { data } = await apiClient.get('/notifications', { params })
    return data
  },
  getUnreadCount: async (): Promise<ApiResponse<{ unreadCount: number }>> => {
    const { data } = await apiClient.get('/notifications/unread-count')
    return data
  },
  markAsRead: async (id: string): Promise<ApiResponse<{ success: boolean }>> => {
    const { data } = await apiClient.patch(`/notifications/${id}/read`)
    return data
  },
  markAllAsRead: async (): Promise<ApiResponse<{ success: boolean }>> => {
    const { data } = await apiClient.patch('/notifications/read-all')
    return data
  },
}
