'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Notification } from '@/lib/api/notifications'
import { resolveNotificationPath } from '@/lib/notifications/links'
import { describeRequestError } from '@/lib/api/request-errors'
import {
  useMarkAllRead,
  useMarkRead,
  useNotificationList,
  useUnreadCount,
} from '@/hooks/use-notifications'
import { useToast } from '@/hooks/use-toast'

export const formatNotificationTime = (iso: string) => {
  const date = new Date(iso)
  if (isNaN(date.getTime())) return ''
  const diffMins = Math.floor((Date.now() - date.getTime()) / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * The bell (UX-23): the server's unread count, the latest ten, mark read / mark all read, and
 * the refresh the moment something arrives (the socket is connected once, in the layout).
 */
export function NotificationBell() {
  const router = useRouter()
  const { toast } = useToast()

  const unread = useUnreadCount()
  const list = useNotificationList(1, 10)
  const markRead = useMarkRead()
  const markAll = useMarkAllRead()

  const count = unread.data ?? 0
  const notifications = list.data?.data?.notifications ?? []

  const open = async (notification: Notification) => {
    const path = resolveNotificationPath(notification.deepLink, notification.metadataJson)
    if (!notification.isRead) {
      try {
        await markRead.mutateAsync(notification)
      } catch (error) {
        // The server did not mark it read: say so, and still go where the person asked to go.
        toast({
          title: 'Could not mark it as read',
          description: describeRequestError(error, 'The notification is still unread. Try again in a moment.'),
          variant: 'destructive',
        })
      }
    }
    if (path) router.push(path)
  }

  const readAll = async () => {
    try {
      await markAll.mutateAsync()
    } catch (error) {
      toast({
        title: 'Could not mark everything as read',
        description: describeRequestError(error, 'Your notifications are unchanged. Try again in a moment.'),
        variant: 'destructive',
      })
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 relative" aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}>
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span
              data-testid="unread-badge"
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground"
            >
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[420px] overflow-y-auto">
        <div className="flex items-center justify-between p-2">
          <DropdownMenuLabel className="font-semibold text-sm">Notifications</DropdownMenuLabel>
          {count > 0 && (
            <button onClick={readAll} disabled={markAll.isPending} className="text-xs text-primary hover:underline font-medium disabled:opacity-50">
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {list.isLoading ? (
          <div className="space-y-3 p-3" aria-busy="true" data-testid="notifications-loading">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : list.error ? (
          <div className="space-y-2 p-4 text-center" role="alert">
            <p className="text-sm text-destructive">
              {describeRequestError(list.error, 'Could not load your notifications.')}
            </p>
            <Button size="sm" variant="outline" onClick={() => list.refetch()}>Try again</Button>
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">You are all caught up.</div>
        ) : (
          notifications.map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              onClick={() => open(notification)}
              className={`flex flex-col items-start p-3 focus:bg-accent border-b last:border-0 cursor-pointer ${!notification.isRead ? 'bg-primary/5' : ''}`}
            >
              <div className="flex w-full items-start gap-2">
                {!notification.isRead && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                <div className="flex-1 space-y-1">
                  <p className={`text-xs leading-none ${!notification.isRead ? 'font-semibold' : 'font-medium'}`}>{notification.title}</p>
                  <p className="text-[11px] text-muted-foreground leading-snug">{notification.message}</p>
                  <p className="text-[10px] text-muted-foreground">{formatNotificationTime(notification.createdAt)}</p>
                </div>
              </div>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <div className="p-2 text-center">
          <Link href="/notifications" className="text-xs font-medium text-primary hover:underline">View all notifications</Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
