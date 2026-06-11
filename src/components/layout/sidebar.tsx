'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { tenantsApi } from '@/lib/api/tenants'
import {
  LayoutDashboard,
  Building2,
  GitBranch,
  CreditCard,
  Users,
  CalendarCheck,
  Receipt,
  Dumbbell,
  BarChart3,
  ShieldCheck,
  Star,
  MapPin,
  Package,
  TrendingUp,
  LogOut,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  Zap,
  Settings,
  Layers,
  UserCog,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { getInitials } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { authApi } from '@/lib/api/auth'

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavSection {
  title: string
  items: NavItem[]
  adminOnly?: boolean
  gymOwnerOnly?: boolean
  requiresActive?: boolean
}

const navSections: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Gym Management',
    gymOwnerOnly: true,
    requiresActive: true,
    items: [
      { title: 'Gym Profile', href: '/gym/profile', icon: Building2 },
      { title: 'Branches', href: '/gym/branches', icon: GitBranch },
      { title: 'Plans', href: '/gym/plans', icon: CreditCard },
      { title: 'Members', href: '/gym/members', icon: Users },
      { title: 'Staff', href: '/gym/staff', icon: UserCog },
      { title: 'Subscriptions', href: '/gym/subscriptions', icon: Layers },
      { title: 'Attendance', href: '/gym/attendance', icon: CalendarCheck },
      { title: 'Payments', href: '/gym/payments', icon: Receipt },
      { title: 'Invoices', href: '/gym/invoices', icon: Receipt },
      { title: 'Trainers', href: '/gym/trainers', icon: Dumbbell },
      { title: 'Reports', href: '/gym/reports', icon: BarChart3 },
    ],
  },
  {
    title: 'Settings',
    gymOwnerOnly: true,
    items: [
      { title: 'Business Profile', href: '/settings/profile', icon: Settings },
      { title: 'Subscription & Billing', href: '/settings/billing', icon: Layers },
    ],
  },
  {
    title: 'Platform Admin',
    adminOnly: true,
    items: [
      { title: 'Tenants', href: '/admin/tenants', icon: ShieldCheck },
      { title: 'Reviews', href: '/admin/reviews', icon: Star },
      { title: 'Cities', href: '/admin/cities', icon: MapPin },
      { title: 'Packages', href: '/admin/packages', icon: Package },
      { title: 'Analytics', href: '/admin/reports', icon: TrendingUp },
    ],
  },
]

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const pathname = usePathname()
  const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      className={cn(
        'group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-200',
        isActive
          ? 'bg-primary/20 text-primary'
          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : '')} />
      {!collapsed && <span className="truncate">{item.title}</span>}
    </Link>
  )
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, logout, isPlatformAdmin, isGymHost, isBranchManager } = useAuth()
  const isGymOwnerRole = isGymHost || isBranchManager

  const { data: tenantData } = useQuery({
    queryKey: ['my-tenant'],
    queryFn: () => tenantsApi.getMyTenant(),
    enabled: isGymOwnerRole,
    staleTime: 30_000,
  })
  const isTenantActive = tenantData?.data?.tenant?.status === 'ACTIVE'

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

  const SidebarContent = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-sidebar-foreground">GymsEra</p>
              <p className="text-xs text-sidebar-foreground/50">Management Portal</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary mx-auto">
            <Zap className="h-4 w-4 text-white" />
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4 rotate-90" />}
        </button>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-6">
          {navSections.map((section) => {
            if (section.adminOnly && !isPlatformAdmin) return null
            if (section.gymOwnerOnly && !isGymOwnerRole) return null
            if (section.requiresActive && !isTenantActive) return null
            return (
              <div key={section.title}>
                {!collapsed && (
                  <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                    {section.title}
                  </p>
                )}
                <div className="space-y-1">
                  {section.items.map((item) => (
                    <NavLink key={item.href} item={item} collapsed={collapsed} />
                  ))}
                </div>
              </div>
            )
          })}
        </nav>
      </ScrollArea>

      {/* User profile at bottom */}
      <div className="border-t border-sidebar-border p-4">
        <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={user?.profileImageUrl} alt={user?.fullName} />
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {user?.fullName ? getInitials(user.fullName) : 'GE'}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.fullName}</p>
              <p className="text-xs text-sidebar-foreground/50 truncate">{user?.role?.replace('_', ' ')}</p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              className="h-8 w-8 flex items-center justify-center rounded-md text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
        {collapsed && (
          <button
            onClick={handleLogout}
            className="mt-2 flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors mx-auto"
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden lg:flex flex-col h-full transition-all duration-300',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        {SidebarContent}
      </aside>

      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 flex h-9 w-9 items-center justify-center rounded-md bg-sidebar text-sidebar-foreground shadow-lg"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 h-full animate-slide-in">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground/50 hover:bg-sidebar-accent transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            {SidebarContent}
          </aside>
        </div>
      )}
    </>
  )
}
