'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, BarChart3, CalendarCheck, DollarSign, Download, UserCheck, Users } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { StatsCard } from '@/components/features/stats-card'
import { EmptyState } from '@/components/features/empty-state'
import { NoAccess } from '@/components/features/no-access'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { reportsApi } from '@/lib/api/reports'
import { describeRequestError } from '@/lib/api/request-errors'
import { formatMoney, toMinor } from '@/lib/money'
import { holdsAtBranch, holdsPermission } from '@/lib/access/menu'
import { useGymAccess } from '@/hooks/use-gym-access'
import { useToast } from '@/hooks/use-toast'

const CHART_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6']

const currentYear = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const YEARS = [currentYear, currentYear - 1, currentYear - 2]

/** A chart needs a plain number; this is display only, nothing is added up. */
const chartNumber = (value: string | number | null | undefined) => {
  const minor = toMinor(value)
  return minor === null ? 0 : minor / 100
}

const SectionError = ({ error, fallback, onRetry }: { error: unknown; fallback: string; onRetry: () => void }) => (
  <Alert variant="destructive">
    <AlertCircle className="h-4 w-4" />
    <AlertTitle>This report did not load</AlertTitle>
    <AlertDescription className="flex items-center justify-between gap-4">
      <span>{describeRequestError(error, fallback)}</span>
      <Button size="sm" variant="outline" onClick={onRetry}>Try again</Button>
    </AlertDescription>
  </Alert>
)

export default function GymReportsPage() {
  const { toast } = useToast()
  const { organization, contextLoading } = useGymAccess()
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth)
  const [branchChoice, setBranchChoice] = useState('')
  const [exporting, setExporting] = useState(false)

  // Revenue figures need dashboard.revenue.view. The yearly and branch reports are scoped by the
  // server to the branches where it is held; the organization-wide monthly breakdown is not
  // scoped by the server at all, so only someone who holds it organization-wide may open it.
  const mayView = holdsPermission(organization, 'dashboard.revenue.view', 'branch')
  const orgWide = holdsPermission(organization, 'dashboard.revenue.view', 'org')
  const accessKnown = !!organization || !contextLoading
  const revenueBranches = (organization?.branches ?? []).filter((b) => holdsAtBranch(organization, b.id, 'dashboard.revenue.view'))
  const branchId = revenueBranches.find((b) => b.id === branchChoice)?.id ?? revenueBranches[0]?.id

  const yearlyQuery = useQuery({
    queryKey: ['report-yearly', year],
    queryFn: () => reportsApi.getYearlyRevenue(year),
    enabled: mayView && !!organization,
  })
  const branchQuery = useQuery({
    queryKey: ['report-branch', branchId],
    queryFn: () => reportsApi.getBranchReport(branchId as string),
    enabled: mayView && !!branchId,
  })
  const monthlyQuery = useQuery({
    queryKey: ['report-monthly', year, month],
    queryFn: () => reportsApi.getMonthlyReport(year, month),
    enabled: orgWide && !!organization,
  })

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await reportsApi.exportMonthlyPdf(year, month)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `report-${year}-${String(month).padStart(2, '0')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast({
        title: 'The report was not exported',
        description: describeRequestError(error, 'Could not create the PDF. Try again in a moment.'),
        variant: 'destructive',
      })
    } finally {
      setExporting(false)
    }
  }

  if (accessKnown && !mayView) {
    return (
      <>
        <Header title="Reports" description="Revenue, members and attendance" />
        <div className="p-6"><NoAccess what="reports" needs="See revenue figures" /></div>
      </>
    )
  }

  const yearly = yearlyQuery.data?.data?.data ?? []
  const branch = branchQuery.data?.data
  const monthly = monthlyQuery.data?.data
  const loadingAccess = !organization && contextLoading

  return (
    <>
      <Header title="Reports" description="Revenue, members and attendance" />
      <div className="p-6 animate-fade-in space-y-8">
        <PageHeader
          title="Reports & Analytics"
          action={
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-28" aria-label="Year"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          }
        />

        {/* Yearly revenue: the server adds up only the branches this person holds revenue at */}
        <section className="space-y-3" aria-labelledby="yearly-title">
          <h3 id="yearly-title" className="text-lg font-semibold">Revenue in {year}</h3>
          {yearlyQuery.error ? (
            <SectionError error={yearlyQuery.error} fallback="Could not load the yearly revenue. Try again." onRetry={() => yearlyQuery.refetch()} />
          ) : (
            <Card>
              <CardContent className="pt-6">
                {yearlyQuery.isLoading || loadingAccess ? (
                  <Skeleton className="h-[260px] w-full" />
                ) : yearly.every((m) => chartNumber(m.revenue) === 0) ? (
                  <EmptyState icon={BarChart3} title="No revenue recorded this year" description="Completed payments will appear here by month." />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={yearly.map((m) => ({ month: m.month, revenue: chartNumber(m.revenue) }))}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${v / 1000}k`} />
                      <Tooltip formatter={(v: number) => [formatMoney(v), 'Revenue']} />
                      <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          )}
        </section>

        {/* One branch: the server's own totals */}
        <section className="space-y-3" aria-labelledby="branch-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id="branch-title" className="text-lg font-semibold">Branch report</h3>
            {revenueBranches.length > 1 && (
              <div className="flex items-center gap-2 text-sm">
                <label htmlFor="report-branch" className="font-medium">Branch</label>
                <select
                  id="report-branch"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={branchId ?? ''}
                  onChange={(e) => setBranchChoice(e.target.value)}
                >
                  {revenueBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
          </div>
          {!branchId ? (
            <EmptyState icon={BarChart3} title="No branch to report on" description="Branches you hold revenue figures for will be listed here." />
          ) : branchQuery.error ? (
            <SectionError error={branchQuery.error} fallback="Could not load the branch report. Try again." onRetry={() => branchQuery.refetch()} />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatsCard title="Revenue this month" value={branch ? formatMoney(branch.revenue.thisMonth) : '—'} icon={DollarSign} iconColor="text-purple-500" iconBg="bg-purple-500/10" loading={branchQuery.isLoading} />
                <StatsCard title="Revenue all time" value={branch ? formatMoney(branch.revenue.allTime) : '—'} icon={DollarSign} iconColor="text-indigo-500" iconBg="bg-indigo-500/10" loading={branchQuery.isLoading} />
                <StatsCard title="Active members" value={branch ? branch.members.active.toLocaleString() : '—'} icon={Users} iconColor="text-blue-500" iconBg="bg-blue-500/10" loading={branchQuery.isLoading} />
                <StatsCard title="Check-ins this month" value={branch ? branch.attendance.checkInsThisMonth.toLocaleString() : '—'} icon={CalendarCheck} iconColor="text-orange-500" iconBg="bg-orange-500/10" loading={branchQuery.isLoading} />
              </div>
              <div className="grid gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader><CardTitle className="text-base">Revenue by day, this month</CardTitle></CardHeader>
                  <CardContent>
                    {branchQuery.isLoading ? <Skeleton className="h-[220px] w-full" /> : !branch || branch.revenueByDay.length === 0 ? (
                      <p className="py-12 text-center text-sm text-muted-foreground">No revenue recorded this month yet.</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={branch.revenueByDay.map((d) => ({ day: d.day, amount: chartNumber(d.totalRevenue) }))}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v) => String(v).slice(-2)} />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v / 1000}k`} />
                          <Tooltip formatter={(v: number) => [formatMoney(v), 'Revenue']} />
                          <Line type="monotone" dataKey="amount" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">Plan distribution</CardTitle></CardHeader>
                  <CardContent>
                    {branchQuery.isLoading ? <Skeleton className="h-[220px] w-full" /> : branch && branch.planDistribution.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={branch.planDistribution.map((p) => ({ ...p, count: Number(p.count) }))} dataKey="count" nameKey="planName" cx="50%" cy="50%" outerRadius={80}>
                            {branch.planDistribution.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="py-12 text-center text-sm text-muted-foreground">No active memberships.</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </section>

        {/* Whole organization, one month. Not scoped by the server, so organization-wide holders only */}
        {orgWide ? (
          <section className="space-y-3" aria-labelledby="monthly-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 id="monthly-title" className="text-lg font-semibold">Monthly breakdown, whole organization</h3>
                <p className="text-sm text-muted-foreground">Revenue, new subscriptions and check-ins for each day.</p>
              </div>
              <div className="flex items-center gap-3">
                <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                  <SelectTrigger className="w-36" aria-label="Month"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button onClick={handleExport} loading={exporting} variant="outline">
                  <Download className="mr-2 h-4 w-4" /> Export PDF
                </Button>
              </div>
            </div>
            {monthlyQuery.error ? (
              <SectionError error={monthlyQuery.error} fallback="Could not load the monthly breakdown. Try again." onRetry={() => monthlyQuery.refetch()} />
            ) : monthlyQuery.isLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : !monthly || (monthly.revenueByDay.length === 0 && monthly.checkInsByDay.length === 0 && monthly.subscriptionsByDay.length === 0) ? (
              <EmptyState icon={BarChart3} title={`Nothing recorded in ${MONTHS[month - 1]} ${year}`} description="Pick another month, or come back once there is activity." />
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Revenue by day</CardTitle>
                    <CardDescription>{MONTHS[month - 1]} {year}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={monthly.revenueByDay.map((d) => ({ day: d.day, amount: chartNumber(d.totalRevenue) }))}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v) => String(v).slice(-2)} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v / 1000}k`} />
                        <Tooltip formatter={(v: number) => [formatMoney(v), 'Revenue']} />
                        <Line type="monotone" dataKey="amount" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base"><UserCheck className="h-4 w-4" /> Check-ins by day</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={monthly.checkInsByDay.map((d) => ({ day: d.day, count: Number(d.count) }))}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v) => String(v).slice(-2)} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="count" name="Check-ins" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            )}
          </section>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="monthly-org-only">
            The month-by-month breakdown covers the whole organization, so it is shown only to people who hold revenue figures organization-wide.
          </p>
        )}
      </div>
    </>
  )
}
