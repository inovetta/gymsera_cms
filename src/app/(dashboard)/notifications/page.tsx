'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Bell } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { EmptyState } from '@/components/features/empty-state'
import { formatNotificationTime } from '@/components/features/notifications/notification-bell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Notification } from '@/lib/api/notifications'
import { resolveNotificationPath } from '@/lib/notifications/links'
import { describeRequestError } from '@/lib/api/request-errors'
import { useMarkAllRead, useMarkRead, useNotificationList, useUnreadCount } from '@/hooks/use-notifications'
import { useToast } from '@/hooks/use-toast'

const PAGE_SIZE = 20

export default function NotificationsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [page, setPage] = useState(1)
  const list = useNotificationList(page, PAGE_SIZE)
  const unread = useUnreadCount()
  const markRead = useMarkRead()
  const markAll = useMarkAllRead()

  const notifications = list.data?.data?.notifications ?? []
  const totalPages = list.data?.pagination?.totalPages ?? 1
  const count = unread.data ?? 0

  const fail = (title: string, error: unknown, fallback: string) =>
    toast({ title, description: describeRequestError(error, fallback), variant: 'destructive' })

  const open = async (notification: Notification) => {
    if (!notification.isRead) {
      try {
        await markRead.mutateAsync(notification)
      } catch (error) {
        fail('Could not mark it as read', error, 'The notification is still unread. Try again in a moment.')
      }
    }
    const path = resolveNotificationPath(notification.deepLink, notification.metadataJson)
    if (path) router.push(path)
  }

  return (
    <>
      <Header title="Notifications" description="Everything that needs your attention" />
      <div className="p-6 animate-fade-in space-y-4">
        <PageHeader
          title="Notifications"
          description={count > 0 ? `${count} unread` : 'You are all caught up'}
          action={
            count > 0 ? (
              <Button
                variant="outline"
                loading={markAll.isPending}
                onClick={async () => {
                  try { await markAll.mutateAsync() } catch (error) { fail('Could not mark everything as read', error, 'Your notifications are unchanged. Try again in a moment.') }
                }}
              >
                Mark all read
              </Button>
            ) : undefined
          }
        />

        {list.error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Your notifications did not load</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>{describeRequestError(list.error, 'Could not load your notifications. Try again.')}</span>
              <Button size="sm" variant="outline" onClick={() => list.refetch()}>Try again</Button>
            </AlertDescription>
          </Alert>
        ) : list.isLoading ? (
          <div className="space-y-3" aria-busy="true" data-testid="notifications-loading">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState icon={Bell} title="No notifications yet" description="Approvals, payments and account alerts will show up here." />
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => {
              const target = resolveNotificationPath(n.deepLink, n.metadataJson)
              return (
                <Card key={n.id} className={!n.isRead ? 'border-primary/30 bg-primary/5' : undefined}>
                  <CardContent className="p-4">
                    <button type="button" onClick={() => open(n)} className="flex w-full items-start gap-3 text-left" aria-label={`${n.title}${n.isRead ? '' : ' (unread)'}`}>
                      {!n.isRead && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                      <span className="flex-1">
                        <span className={`block text-sm ${!n.isRead ? 'font-semibold' : 'font-medium'}`}>{n.title}</span>
                        <span className="block text-sm text-muted-foreground">{n.message}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {formatNotificationTime(n.createdAt)}
                          {target ? ' · opens the related page' : ''}
                        </span>
                      </span>
                    </button>
                  </CardContent>
                </Card>
              )
            })}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
