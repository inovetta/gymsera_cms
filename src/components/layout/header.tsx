'use client'

import { useState, useEffect } from 'react'
import { Bell, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/hooks/use-auth'
import { getInitials } from '@/lib/utils'
import { authApi } from '@/lib/api/auth'
import { notificationsApi, Notification } from '@/lib/api/notifications'

interface HeaderProps {
  title: string
  description?: string
}

export function Header({ title, description }: HeaderProps) {
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const router = useRouter()

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState<number>(0)

  const fetchNotifs = async () => {
    try {
      const res = await notificationsApi.getNotifications({ page: 1, limit: 10 })
      if (res.success && res.data?.notifications) {
        setNotifications(res.data.notifications)
      }
      const countRes = await notificationsApi.getUnreadCount()
      if (countRes.success && countRes.data) {
        setUnreadCount(countRes.data.unreadCount)
      }
    } catch (err) {
      console.error('Failed to load notifications:', err)
    }
  }

  useEffect(() => {
    fetchNotifs()
    const interval = setInterval(fetchNotifs, 15000) // update every 15 seconds
    return () => clearInterval(interval)
  }, [])

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch {
      // ignore
    } finally {
      logout()
      window.location.href = '/login'
    }
  }

  const handleNotifClick = async (notif: Notification) => {
    if (!notif.isRead) {
      try {
        await notificationsApi.markAsRead(notif.id)
        fetchNotifs()
      } catch (err) {
        console.error(err)
      }
    }
    if (notif.deepLink) {
      // If it contains route parameter path like /admin/tenants/[tenantId]
      // parse it to standard path
      let path = notif.deepLink
      if (notif.metadataJson?.tenantId) {
        path = path.replace('[tenantId]', notif.metadataJson.tenantId)
      }
      router.push(path)
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllAsRead()
      fetchNotifs()
    } catch (err) {
      console.error(err)
    }
  }

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString)
      const diffMs = Date.now() - date.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      if (diffMins < 1) return 'Just now'
      if (diffMins < 60) return `${diffMins}m ago`
      const diffHours = Math.floor(diffMins / 60)
      if (diffHours < 24) return `${diffHours}h ago`
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    } catch {
      return ''
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="lg:block">
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>

      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="h-9 w-9"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 relative">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground animate-pulse">
                  {unreadCount}
                </span>
              )}
              <span className="sr-only">Notifications</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 max-h-[400px] overflow-y-auto">
            <div className="flex items-center justify-between p-2">
              <DropdownMenuLabel className="font-semibold text-sm">Notifications</DropdownMenuLabel>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  Mark all read
                </button>
              )}
            </div>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No notifications
              </div>
            ) : (
              notifications.map((notif) => (
                <DropdownMenuItem
                  key={notif.id}
                  onClick={() => handleNotifClick(notif)}
                  className={`flex flex-col items-start p-3 focus:bg-accent border-b last:border-0 cursor-pointer ${
                    !notif.isRead ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="flex w-full items-start gap-2">
                    {!notif.isRead && (
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    )}
                    <div className="flex-1 space-y-1">
                      <p className={`text-xs leading-none ${!notif.isRead ? 'font-semibold' : 'font-medium'}`}>
                        {notif.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        {notif.message}
                      </p>
                      <p className="text-[9px] text-muted-foreground">
                        {formatTime(notif.createdAt)}
                      </p>
                    </div>
                  </div>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-md p-1.5 hover:bg-accent transition-colors">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.profileImageUrl} alt={user?.fullName} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {user?.fullName ? getInitials(user.fullName) : 'GE'}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:block text-left">
                <p className="text-sm font-medium leading-none">{user?.fullName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{user?.role?.replace('_', ' ')}</p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div>
                <p className="font-medium">{user?.fullName}</p>
                <p className="text-xs text-muted-foreground font-normal">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
