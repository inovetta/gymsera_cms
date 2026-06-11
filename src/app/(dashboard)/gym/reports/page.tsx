'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Download, BarChart3 } from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { StatsCard } from '@/components/features/stats-card'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { reportsApi } from '@/lib/api/reports'
import { formatCurrency } from '@/lib/utils'
import { Users, DollarSign, Activity, CalendarCheck } from 'lucide-react'

const CHART_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6']

const currentYear = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const YEARS = [currentYear, currentYear - 1, currentYear - 2]

export default function GymReportsPage() {
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [exporting, setExporting] = useState(false)

  const { data: reportData, isLoading } = useQuery({
    queryKey: ['monthly-report', selectedYear, selectedMonth],
    queryFn: () => reportsApi.getMonthlyReport(selectedYear, selectedMonth),
  })

  const report = reportData?.data

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await reportsApi.exportMonthlyPdf(selectedYear, selectedMonth)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `report-${selectedYear}-${String(selectedMonth).padStart(2, '0')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // fallback
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <Header title="Reports" description="Monthly analytics and business insights" />
      <div className="p-6 animate-fade-in space-y-6">
        <PageHeader
          title="Reports & Analytics"
          action={
            <div className="flex items-center gap-3">
              <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleExport} loading={exporting} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
            </div>
          }
        />

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Revenue"
            value={report ? formatCurrency(report.totalRevenue) : '—'}
            icon={DollarSign}
            iconColor="text-purple-500"
            iconBg="bg-purple-500/10"
            loading={isLoading}
          />
          <StatsCard
            title="New Members"
            value={report?.newMembers ?? '—'}
            icon={Users}
            iconColor="text-blue-500"
            iconBg="bg-blue-500/10"
            loading={isLoading}
          />
          <StatsCard
            title="Active Subscriptions"
            value={report?.activeSubscriptions ?? '—'}
            icon={Activity}
            iconColor="text-green-500"
            iconBg="bg-green-500/10"
            loading={isLoading}
          />
          <StatsCard
            title="Total Attendance"
            value={report?.totalAttendance ?? '—'}
            icon={CalendarCheck}
            iconColor="text-orange-500"
            iconBg="bg-orange-500/10"
            loading={isLoading}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Revenue Chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Daily Revenue</CardTitle>
              <CardDescription>{MONTHS[selectedMonth - 1]} {selectedYear}</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={report?.revenueByDay ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(-2)} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v / 1000}k`} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
                  <Line type="monotone" dataKey="amount" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Membership Breakdown Pie */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Plan Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {report?.membershipBreakdown && report.membershipBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={report.membershipBreakdown}
                      dataKey="count"
                      nameKey="planName"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                    >
                      {report.membershipBreakdown.map((_, index) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Attendance Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily Attendance</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={report?.attendanceByDay ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Check-ins" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
