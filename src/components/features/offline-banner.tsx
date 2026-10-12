'use client'

import { WifiOff } from 'lucide-react'
import { useOnlineStatus } from '@/hooks/use-online-status'

/**
 * Persistent banner while the browser is offline (spec §2.5). Cached reads stay visible;
 * mutating controls are the page's job to disable (see `useOnlineStatus`).
 */
export function OfflineBanner() {
  const online = useOnlineStatus()
  if (online) return null
  return (
    <div
      role="status"
      data-testid="offline-banner"
      className="flex items-center gap-2 border-b border-warning/40 bg-warning/15 px-6 py-2 text-sm text-foreground"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>You are offline. Showing the last data we loaded; changes are disabled until you reconnect.</span>
    </div>
  )
}
