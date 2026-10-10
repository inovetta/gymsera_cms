'use client'

import { useNotificationsRealtime } from '@/hooks/use-notifications'

/**
 * Mounted once in the dashboard layout so there is one socket for the whole session, not one per
 * page (each page renders its own Header). Renders nothing.
 */
export function RealtimeBridge() {
  useNotificationsRealtime()
  return null
}
