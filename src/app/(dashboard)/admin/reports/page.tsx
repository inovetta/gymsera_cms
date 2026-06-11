'use client'

import { useQuery } from '@tanstack/react-query'
import { Building2, Users, Clock, Activity, TrendingUp, AlertTriangle, CreditCard, DollarSign } from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { StatsCard } from '@/components/features/stats-card'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { adminApi } from '@/lib/api/admin'
import { formatCurrency } from '@/lib/utils'

export default function AdminReportsPage() {
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['platform-stats'],
    queryFn: () => adminApi.getPlatformStats(),
  })

  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ['platform-analytics'],
    queryFn: () => adminApi.getPlatformAnalytics(),
  })

  const stats = statsData?.data
  const analytics = analyticsData?.data

  const tenantGrowth = analytics?.tenantGrowth ?? []
  const memberGrowth = analytics?.memberGrowth ?? []
  const monthlyRevenue = analytics?.monthlyRevenue ?? []
  const cityDistribution = analytics?.cityDistribution ?? []
  const year = analytics?.year ?? new Date().getFullYear()

  const maxCityTenants = cityDistribution[0]?.tenants ?? 1

  return (
    <>
      <Header title="Platform Analytics" description="Platform-wide performance metrics" />
      <div className="p-6 animate-fade-in space-y-6">
        <PageHeader title="Platform Analytics" description={`Overview of platform-wide activity — ${year}`} />

        {/* KPI Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Tenants"
            value={stats?.totalTenants?.toLocaleString() ?? '—'}
            icon={Building2}
            iconColor="text-indigo-500"
            iconBg="bg-indigo-500/10"
            loading={statsLoading}
          />
          <StatsCard
            title="Active Gyms"
            value={stats?.activeTenants?.toLocaleString() ?? '—'}
            icon={Activity}
            iconColor="text-green-500"
            iconBg="bg-green-500/10"
            loading={statsLoading}
          />
          <StatsCard
            title="Pending Approvals"
            value={stats?.pendingApprovals?.toLocaleString() ?? '—'}
            icon={Clock}
            iconColor="text-warning"
            iconBg="bg-warning/10"
            loading={statsLoading}
          />
          <StatsCard
            title="Total Members"
            value={stats?.totalMembers?.toLocaleString() ?? '—'}
            icon={Users}
            iconColor="text-blue-500"
            iconBg="bg-blue-500/10"
            loading={statsLoading}
          />
        </div>

        {/* Secondary KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Active Subscriptions"
            value={stats?.activeSubscriptions?.toLocaleString() ?? '—'}
            icon={CreditCard}
            iconColor="text-emerald-500"
            iconBg="bg-emerald-500/10"
            loading={statsLoading}
          />
          <StatsCard
            title="Expiring in 2 Days"
            value={stats?.expiringInTwoDays?.toLocaleString() ?? '—'}
            icon={AlertTriangle}
            iconColor="text-amber-500"
            iconBg="bg-amber-500/10"
            loading={statsLoading}
          />
          <StatsCard
            title="Suspended Tenants"
            value={stats?.suspendedTenants?.toLocaleString() ?? '—'}
            icon={AlertTriangle}
            iconColor="text-red-500"
            iconBg="bg-red-500/10"
            loading={statsLoading}
          />
          <StatsCard
            title="Total Revenue"
            value={stats ? formatCurrency(stats.totalRevenue) : '—'}
            icon={DollarSign}
            iconColor="text-violet-500"
            iconBg="bg-violet-500/10"
            loading={statsLoading}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Tenant Growth */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Tenant Growth
              </CardTitle>
              <CardDescription>Cumulative gym host registrations — {year}</CardDescription>
            </CardHeader>
            <CardContent>
              {analyticsLoading ? (
                <Skeleton className="h-[220px] w-full rounded-lg" />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={tenantGrowth}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip formatter={(v: number) => [v, 'Tenants']} />
                    <Line type="monotone" dataKey="tenants" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Member Growth */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                Member Growth
              </CardTitle>
              <CardDescription>Cumulative member registrations — {year}</CardDescription>
            </CardHeader>
            <CardContent>
              {analyticsLoading ? (
                <Skeleton className="h-[220px] w-full rounded-lg" />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={memberGrowth}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip formatter={(v: number) => [v, 'Members']} />
                    <Line type="monotone" dataKey="members" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Monthly Revenue */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-violet-500" />
              Monthly Revenue
            </CardTitle>
            <CardDescription>Platform subscription revenue from paid invoices — {year}</CardDescription>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <Skeleton className="h-[200px] w-full rounded-lg" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={monthlyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
                  <Bar dataKey="revenue" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Geographic Distribution */}
        {cityDistribution.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Geographic Distribution</CardTitle>
              <CardDescription>Tenants by city</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 lg:grid-cols-2">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={cityDistribution} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis dataKey="city" type="category" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip formatter={(v: number) => [v, 'Tenants']} />
                    <Bar dataKey="tenants" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Tenants" />
                  </BarChart>
                </ResponsiveContainer>
                <div className="space-y-3">
                  {cityDistribution.map((item) => (
                    <div key={item.city} className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{item.city}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 w-24 bg-muted rounded-full">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${(item.tenants / maxCityTenants) * 100}%` }}
                          />
                        </div>
                        <p className="font-semibold text-sm w-8 text-right">{item.tenants}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
