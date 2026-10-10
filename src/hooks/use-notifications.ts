'use client'

import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notificationsApi, Notification } from '@/lib/api/notifications'
import { connectRealtime } from '@/lib/realtime/client'
import { useAuthStore } from '@/stores/auth.store'

export const NOTIFICATIONS_UNREAD_KEY = ['notifications', 'unread'] as const
export const notificationsListKey = (page: number, limit: number) => ['notifications', 'list', page, limit] as const

const POLL_MS = 60_000

/**
 * The bell and the feed (UX-23). The unread count is the server's number (RT-03): a push event
 * or a mark-read only makes the CMS ask for it again, nothing is counted in the browser.
 * The socket is the fast path (spec §9.2); the poll and refetch-on-focus cover a dropped socket.
 */
export function useNotificationsRealtime() {
  const queryClient = useQueryClient()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    if (!isAuthenticated) return
    const handle = connectRealtime(() => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    })
    return () => handle?.disconnect()
  }, [isAuthenticated, queryClient])
}

export function useUnreadCount() {
  return useQuery({
    queryKey: NOTIFICATIONS_UNREAD_KEY,
    queryFn: async () => {
      const res = await notificationsApi.getUnreadCount()
      return res.data?.unreadCount ?? 0
    },
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  })
}

export function useNotificationList(page = 1, limit = 10) {
  return useQuery({
    queryKey: notificationsListKey(page, limit),
    queryFn: () => notificationsApi.getNotifications({ page, limit }),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  })
}

export function useMarkRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (notification: Notification) => notificationsApi.markAsRead(notification.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

export function useMarkAllRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => notificationsApi.markAllAsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })
}
