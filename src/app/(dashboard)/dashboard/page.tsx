'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Users, Activity, DollarSign, CalendarCheck, TrendingUp, Building2, Clock, ShieldOff } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Header } from '@/components/layout/header'
import { StatsCard } from '@/components/features/stats-card'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { StatusBadge } from '@/components/features/status-badge'
import { reportsApi } from '@/lib/api/reports'
import { gymApi } from '@/lib/api/gym'
import { tenantsApi } from '@/lib/api/tenants'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency, formatDate, getInitials } from '@/lib/utils'

export default function DashboardPage() {
  const router = useRouter()
  const { isPlatformAdmin, isGymHost, isBranchManager } = useAuth()
  const isGymOwner = isGymHost || isBranchManager

  const { data: tenantData, isLoading: tenantLoading } = useQuery({
    queryKey: ['my-tenant'],
    queryFn: () => tenantsApi.getMyTenant(),
    enabled: isGymOwner,
    staleTime: 30_000,
  })

  const isTenantActive = isPlatformAdmin || tenantData?.data?.tenant?.status === 'ACTIVE'

  useEffect(() => {
    if (!tenantLoading && isGymOwner && tenantData && !isTenantActive) {
      router.replace('/settings/billing')
    }
  }, [tenantLoading, isGymOwner, tenantData, isTenantActive, router])

  // Gym host dashboard (only runs when tenant is active)
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => reportsApi.getDashboardStats(),
    enabled: !isPlatformAdmin && isTenantActive,
  })

  const { data: revenueData, isLoading: revenueLoading } = useQuery({
    queryKey: ['yearly-revenue'],
    queryFn: () => reportsApi.getYearlyRevenue(),
    enabled: !isPlatformAdmin && isTenantActive,
  })

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['recent-members'],
    queryFn: () => gymApi.getMembers({ limit: 5, page: 1 }),
    enabled: !isPlatformAdmin && isTenantActive,
  })

  const { data: branchesData, isLoading: branchesLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: () => gymApi.getBranches(),
    enabled: !isPlatformAdmin && isTenantActive,
  })

  // Platform admin dashboard
  const { data: platformData, isLoading: platformLoading } = useQuery({
    queryKey: ['platform-stats'],
    queryFn: () => reportsApi.getPlatformStats(),
    enabled: isPlatformAdmin,
  })

  // API returns nested shape: { members, attendance, revenue, plans, branches }
  const rawStats = statsData?.data as any
  const stats = rawStats ? {
    totalMembers:        rawStats.members?.active ?? 0,
    activeSubscriptions: rawStats.members?.active ?? 0,
    monthlyRevenue:      rawStats.revenue?.thisMonth ?? 0,
    todayAttendance:     rawStats.attendance?.checkInsToday ?? 0,
  } : null
  const revenueChartData = revenueData?.data?.data ?? []
  const platform = platformData?.data

  if (isPlatformAdmin) {
    return (
      <>
        <Header title="Dashboard" description="Platform overview" />
        <div className="p-6 space-y-6 animate-fade-in">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatsCard
              title="Active Gyms"
              value={platform?.gyms?.active?.toLocaleString() ?? '—'}
              icon={Building2}
              iconColor="text-indigo-500"
              iconBg="bg-indigo-500/10"
              loading={platformLoading}
            />
            <StatsCard
              title="Pending Review"
              value={platform?.gyms?.pendingReview?.toLocaleString() ?? '—'}
              icon={Clock}
              iconColor="text-amber-500"
              iconBg="bg-amber-500/10"
              loading={platformLoading}
            />
            <StatsCard
              title="Suspended Gyms"
              value={platform?.gyms?.suspended?.toLocaleString() ?? '—'}
              icon={ShieldOff}
              iconColor="text-red-500"
              iconBg="bg-red-500/10"
              loading={platformLoading}
            />
            <StatsCard
              title="Active Members"
              value={platform?.members?.totalActive?.toLocaleString() ?? '—'}
              icon={Users}
              iconColor="text-green-500"
              iconBg="bg-green-500/10"
              loading={platformLoading}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Gyms This Month</CardTitle>
                <CardDescription>New gyms that went active</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-primary">
                  {platformLoading ? '—' : platform?.gyms?.addedThisMonth ?? 0}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Members This Month</CardTitle>
                <CardDescription>New active memberships</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-primary">
                  {platformLoading ? '—' : platform?.members?.addedThisMonth ?? 0}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Header title="Dashboard" description="Welcome to your GymsEra management portal" />
      <div className="p-6 space-y-6 animate-fade-in">
        {/* Stats cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Active Members"
            value={stats?.totalMembers?.toLocaleString() ?? '0'}
            icon={Users}
            iconColor="text-blue-500"
            iconBg="bg-blue-500/10"
            loading={statsLoading}
          />
          <StatsCard
            title="Active Subscriptions"
            value={stats?.activeSubscriptions?.toLocaleString() ?? '0'}
            icon={Activity}
            iconColor="text-green-500"
            iconBg="bg-green-500/10"
            loading={statsLoading}
          />
          <StatsCard
            title="Monthly Revenue"
            value={statsLoading ? '—' : formatCurrency(Number(stats?.monthlyRevenue ?? 0))}
            icon={DollarSign}
            iconColor="text-purple-500"
            iconBg="bg-purple-500/10"
            loading={statsLoading}
          />
          <StatsCard
            title="Today's Attendance"
            value={stats?.todayAttendance?.toLocaleString() ?? '0'}
            icon={CalendarCheck}
            iconColor="text-orange-500"
            iconBg="bg-orange-500/10"
            loading={statsLoading}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Revenue Chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Revenue Overview
              </CardTitle>
              <CardDescription>Monthly revenue for the current year</CardDescription>
            </CardHeader>
            <CardContent>
              {revenueLoading ? (
                <Skeleton className="h-[280px] w-full" />
              ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={revenueChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(v) => `${v / 1000}k`}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.5}
                    dot={{ fill: 'hsl(var(--primary))', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Branch Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Branches</CardTitle>
              <CardDescription>Active gym locations</CardDescription>
            </CardHeader>
            <CardContent>
              {branchesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="space-y-1.5 flex-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : !branchesData?.data?.branches?.length ? (
                <p className="text-sm text-muted-foreground text-center py-8">No branches found</p>
              ) : (
                <div className="space-y-4">
                  {branchesData?.data?.branches?.slice(0, 5).map((branch) => (
                    <div key={branch.id} className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <span className="text-xs font-bold text-primary">
                          {branch.branchName.charAt(0)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{branch.branchName}</p>
                        <p className="text-xs text-muted-foreground truncate">{branch.address}</p>
                      </div>
                      <StatusBadge status={branch.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Members */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Members</CardTitle>
            <CardDescription>Latest member registrations</CardDescription>
          </CardHeader>
          <CardContent>
            {membersLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-56" />
                    </div>
                    <Skeleton className="h-6 w-16 rounded-full" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                ))}
              </div>
            ) : !membersData?.data?.members?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">No members found</p>
            ) : (
              <div className="space-y-4">
                {membersData?.data?.members?.map((member) => (
                  <div key={member.id} className="flex items-center gap-4">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={member.profileImageUrl} />
                      <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                        {getInitials(member.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{member.fullName}</p>
                      <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                    </div>
                    <StatusBadge status={member.status} />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(member.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
