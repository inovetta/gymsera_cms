'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CalendarCheck, Users, UserCheck, Plus } from 'lucide-react'
import { format } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { DataTable, Column } from '@/components/features/data-table'
import { StatsCard } from '@/components/features/stats-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { attendanceApi } from '@/lib/api/attendance'
import { reportsApi } from '@/lib/api/reports'
import { gymApi } from '@/lib/api/gym'
import { AttendanceLog } from '@/types'
import { formatDate, getInitials } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

const checkInSchema = z.object({
  email: z.string().email('Valid email required').optional().or(z.literal('')),
  branchId: z.string().min(1, 'Branch is required'),
})

type CheckInForm = z.infer<typeof checkInSchema>

export default function AttendancePage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [dateFilter, setDateFilter] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [page, setPage] = useState(1)

  const { data: todayData } = useQuery({
    queryKey: ['attendance-today'],
    queryFn: () => attendanceApi.getTodayAttendance(),
  })

  const { data: attendanceData, isLoading } = useQuery({
    queryKey: ['attendance', dateFilter, page],
    queryFn: () => attendanceApi.getAttendance({ date: dateFilter, page, limit: 20 }),
  })

  const { data: branchesData } = useQuery({
    queryKey: ['branches'],
    queryFn: () => gymApi.getBranches(),
  })

  const { data: weeklyData } = useQuery({
    queryKey: ['weekly-attendance'],
    queryFn: () => reportsApi.getWeeklyAttendance(),
  })

  const form = useForm<CheckInForm>({
    resolver: zodResolver(checkInSchema),
    defaultValues: { email: '', branchId: '' },
  })

  const checkInMutation = useMutation({
    mutationFn: (payload: CheckInForm) => attendanceApi.manualCheckIn({
      email: payload.email || undefined,
      branchId: payload.branchId,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] })
      setCheckInOpen(false)
      form.reset()
      toast({ title: 'Check-in recorded successfully' })
    },
    onError: () => toast({ title: 'Error', description: 'Failed to record check-in', variant: 'destructive' }),
  })

  const columns: Column<AttendanceLog>[] = [
    {
      key: 'member',
      header: 'Member',
      cell: (row) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs bg-primary/10 text-primary">
              {row.user?.fullName ? getInitials(row.user.fullName) : 'M'}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-sm">{row.user?.fullName ?? '—'}</p>
            <p className="text-xs text-muted-foreground">{row.user?.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'branch',
      header: 'Branch',
      cell: (row) => <span className="text-sm">{row.branch?.branchName ?? '—'}</span>,
    },
    {
      key: 'checkIn',
      header: 'Check In',
      cell: (row) => <span className="text-sm font-medium">{formatDate(row.checkInTime, 'HH:mm')}</span>,
    },
    {
      key: 'checkOut',
      header: 'Check Out',
      cell: (row) => (
        <span className={`text-sm ${row.checkOutTime ? '' : 'text-muted-foreground'}`}>
          {row.checkOutTime ? formatDate(row.checkOutTime, 'HH:mm') : 'Still in'}
        </span>
      ),
    },
  ]

  const logs = attendanceData?.data?.logs ?? []
  const todayCount = todayData?.pagination?.total ?? todayData?.data?.logs?.length ?? 0
  const weekChartData = weeklyData?.data?.data ?? []

  return (
    <>
      <Header title="Attendance" description="Track member check-ins and attendance" />
      <div className="p-6 animate-fade-in space-y-6">
        <PageHeader
          title="Attendance"
          action={
            <Button onClick={() => setCheckInOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Manual Check-in
            </Button>
          }
        />

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <StatsCard
            title="Today's Check-ins"
            value={todayCount}
            icon={CalendarCheck}
            iconColor="text-green-500"
            iconBg="bg-green-500/10"
          />
          <StatsCard
            title="Unique Members"
            value={todayData?.data?.logs?.length ?? 0}
            icon={Users}
            iconColor="text-blue-500"
            iconBg="bg-blue-500/10"
          />
          <StatsCard
            title="Currently In Gym"
            value={todayData?.data?.logs?.filter(l => !l.checkOutTime)?.length ?? 0}
            icon={UserCheck}
            iconColor="text-purple-500"
            iconBg="bg-purple-500/10"
          />
        </div>

        {/* Weekly Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily Check-ins (This Week)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weekChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Check-ins" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Attendance Log */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Attendance Log</CardTitle>
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => { setDateFilter(e.target.value); setPage(1) }}
              className="w-40"
            />
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={logs}
              loading={isLoading}
              emptyTitle="No check-ins found"
              emptyDescription={`No attendance recorded for ${formatDate(dateFilter)}`}
              page={page}
              totalPages={attendanceData?.pagination?.totalPages ?? 1}
              onPageChange={setPage}
            />
          </CardContent>
        </Card>
      </div>

      {/* Manual Check-in Dialog */}
      <Dialog open={checkInOpen} onOpenChange={setCheckInOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manual Check-in</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => checkInMutation.mutate(v))} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Member Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="member@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="branchId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Branch *</FormLabel>
                    <FormControl>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        {...field}
                      >
                        <option value="">Select branch</option>
                        {branchesData?.data?.branches?.map((b) => (
                          <option key={b.id} value={b.id}>{b.branchName}</option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCheckInOpen(false)}>Cancel</Button>
                <Button type="submit" loading={checkInMutation.isPending}>Record Check-in</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  )
}
