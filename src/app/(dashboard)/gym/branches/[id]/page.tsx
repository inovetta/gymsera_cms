'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, MapPin, Phone, Clock, Users, ImageIcon,
  CreditCard, BarChart3, CheckCircle, XCircle, Inbox, ShieldCheck,
  TrendingUp, DollarSign, CalendarCheck, UserCheck,
} from 'lucide-react'
import { Header } from '@/components/layout/header'
import { StatusBadge } from '@/components/features/status-badge'
import { DataTable, Column } from '@/components/features/data-table'
import { MultiImageUpload } from '@/components/features/multi-image-upload'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { gymApi } from '@/lib/api/gym'
import { subscriptionsApi } from '@/lib/api/subscriptions'
import { attendanceApi } from '@/lib/api/attendance'
import { paymentsApi } from '@/lib/api/payments'
import { reportsApi } from '@/lib/api/reports'
import { MemberSubscription, AttendanceLog, GymStaff, Payment, BranchReport } from '@/types'
import { formatDate, formatCurrency, getInitials } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'

function StatCard({ title, value, subtitle, icon: Icon, colorClass = 'text-primary' }: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ComponentType<{ className?: string }>
  colorClass?: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</p>
            <p className={`text-2xl font-bold mt-1 ${colorClass}`}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <div className={`p-2 rounded-lg bg-primary/10`}>
            <Icon className={`h-5 w-5 ${colorClass}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function PaymentStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    PENDING:         { label: 'Pending',   cls: 'bg-yellow-100 text-yellow-800' },
    STAFF_COLLECTED: { label: 'Collected', cls: 'bg-blue-100 text-blue-800' },
    COMPLETED:       { label: 'Approved',  cls: 'bg-green-100 text-green-800' },
    FAILED:          { label: 'Rejected',  cls: 'bg-red-100 text-red-800' },
    REFUNDED:        { label: 'Refunded',  cls: 'bg-purple-100 text-purple-800' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-800' }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.label}</span>
}

export default function BranchDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { isGymHost } = useAuth()
  const branchId = params.id as string
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all')

  const { data: branchData, isLoading: branchLoading } = useQuery({
    queryKey: ['branch', branchId],
    queryFn: () => gymApi.getBranch(branchId),
  })

  const { data: staffData, isLoading: staffLoading } = useQuery({
    queryKey: ['branch-staff', branchId],
    queryFn: () => gymApi.getBranchStaff(branchId),
  })

  const { data: subscriptionsData, isLoading: subsLoading } = useQuery({
    queryKey: ['subscriptions', branchId],
    queryFn: () => subscriptionsApi.getStaffSubscriptions({ branchId, limit: 10 }),
  })

  const { data: attendanceData, isLoading: attendanceLoading } = useQuery({
    queryKey: ['attendance', branchId],
    queryFn: () => attendanceApi.getAttendance({ branchId, limit: 10 }),
  })

  const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
    queryKey: ['branch-payments', branchId, paymentStatusFilter],
    queryFn: () => paymentsApi.getPayments({
      branchId,
      status: paymentStatusFilter !== 'all' ? paymentStatusFilter : undefined,
      limit: 20,
    }),
  })

  const { data: reportData, isLoading: reportLoading } = useQuery({
    queryKey: ['branch-report', branchId],
    queryFn: () => reportsApi.getBranchReport(branchId),
  })

  const branch = branchData?.data?.branch
  const report = reportData?.data as BranchReport | undefined
  const existingImages: string[] = Array.isArray(branch?.imagesJson) ? branch.imagesJson : []

  const uploadImagesMutation = useMutation({
    mutationFn: (files: File[]) => gymApi.uploadBranchImages(branchId, files),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branch', branchId] })
      setPendingFiles([])
      toast({ title: 'Images uploaded successfully' })
    },
    onError: () => toast({ title: 'Upload failed', description: 'Could not upload images', variant: 'destructive' }),
  })

  const deleteImageMutation = useMutation({
    mutationFn: (url: string) => gymApi.deleteBranchImage(branchId, url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branch', branchId] })
      toast({ title: 'Image removed' })
    },
    onError: () => toast({ title: 'Error', description: 'Could not remove image', variant: 'destructive' }),
  })

  const paymentActionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'collect' | 'verify' | 'reject' }) =>
      paymentsApi.paymentAction(id, { action }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['branch-payments', branchId] })
      queryClient.invalidateQueries({ queryKey: ['branch-report', branchId] })
      const msgs = { collect: 'Marked as collected', verify: 'Payment approved', reject: 'Payment rejected' }
      toast({ title: msgs[vars.action] })
    },
    onError: (err: any) => toast({
      title: 'Error',
      description: err?.response?.data?.message || 'Action failed',
      variant: 'destructive',
    }),
  })

  const handleFilesSelected = useCallback((files: File[]) => {
    setPendingFiles((prev) => [...prev, ...files])
  }, [])

  const memberColumns: Column<MemberSubscription>[] = [
    {
      key: 'member',
      header: 'Member',
      cell: (row) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={row.user?.profileImageUrl} />
            <AvatarFallback className="text-xs">{row.user?.fullName ? getInitials(row.user.fullName) : 'M'}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-sm">{row.user?.fullName ?? '—'}</p>
            <p className="text-xs text-muted-foreground">{row.user?.email}</p>
          </div>
        </div>
      ),
    },
    { key: 'plan', header: 'Plan', cell: (row) => <span className="text-sm">{row.membershipPlan?.name ?? '—'}</span> },
    { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
    { key: 'endDate', header: 'Expires', cell: (row) => <span className="text-sm">{formatDate(row.endDate)}</span> },
  ]

  const staffColumns: Column<GymStaff>[] = [
    {
      key: 'staff',
      header: 'Staff Member',
      cell: (row) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">{row.user?.fullName ? getInitials(row.user.fullName) : 'S'}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-sm">{row.user?.fullName ?? '—'}</p>
            <p className="text-xs text-muted-foreground">{row.user?.email}</p>
          </div>
        </div>
      ),
    },
    { key: 'designation', header: 'Designation', cell: (row) => <span className="text-sm">{row.designation}</span> },
  ]

  const attendanceColumns: Column<AttendanceLog>[] = [
    {
      key: 'member',
      header: 'Member',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs">{row.user?.fullName ? getInitials(row.user.fullName) : 'M'}</AvatarFallback>
          </Avatar>
          <span className="text-sm">{row.user?.fullName ?? '—'}</span>
        </div>
      ),
    },
    { key: 'checkIn', header: 'Check In', cell: (row) => <span className="text-sm">{formatDate(row.checkInTime, 'MMM dd, HH:mm')}</span> },
    { key: 'checkOut', header: 'Check Out', cell: (row) => <span className="text-sm">{row.checkOutTime ? formatDate(row.checkOutTime, 'MMM dd, HH:mm') : '—'}</span> },
  ]

  const paymentColumns: Column<Payment>[] = [
    {
      key: 'user',
      header: 'Member',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs bg-primary/10 text-primary">
              {row.user?.fullName ? getInitials(row.user.fullName) : 'M'}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium">{row.user?.fullName ?? '—'}</p>
            <p className="text-xs text-muted-foreground">{row.paymentFor}</p>
          </div>
        </div>
      ),
    },
    { key: 'amount', header: 'Amount', cell: (row) => <span className="font-semibold text-sm">{formatCurrency(row.amount)}</span> },
    { key: 'method', header: 'Method', cell: (row) => <span className="text-xs bg-secondary px-2 py-0.5 rounded-full">{row.method}</span> },
    { key: 'status', header: 'Status', cell: (row) => <PaymentStatusBadge status={row.status} /> },
    {
      key: 'date',
      header: 'Date',
      cell: (row) => <span className="text-xs text-muted-foreground">{formatDate(row.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (row) => {
        if (row.status === 'COMPLETED' || row.status === 'FAILED' || row.status === 'REFUNDED') {
          return <span className="text-muted-foreground text-xs">—</span>
        }
        return (
          <div className="flex items-center gap-1">
            {row.status === 'PENDING' && (
              <Button size="icon-sm" variant="ghost" className="text-blue-600 hover:bg-blue-50"
                onClick={(e) => { e.stopPropagation(); paymentActionMutation.mutate({ id: row.id, action: 'collect' }) }}
                title="Mark as Collected">
                <Inbox className="h-4 w-4" />
              </Button>
            )}
            {isGymHost && (
              <Button size="icon-sm" variant="ghost" className="text-success hover:bg-success/10"
                onClick={(e) => { e.stopPropagation(); paymentActionMutation.mutate({ id: row.id, action: 'verify' }) }}
                title="Final Approval">
                <ShieldCheck className="h-4 w-4" />
              </Button>
            )}
            <Button size="icon-sm" variant="ghost" className="text-destructive hover:bg-destructive/10"
              onClick={(e) => { e.stopPropagation(); paymentActionMutation.mutate({ id: row.id, action: 'reject' }) }}
              title="Reject">
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
        )
      },
    },
  ]

  if (branchLoading) {
    return (
      <>
        <Header title="Branch Detail" />
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 rounded-lg" />
        </div>
      </>
    )
  }

  return (
    <>
      <Header title={branch?.branchName ?? 'Branch Detail'} />
      <div className="p-6 animate-fade-in space-y-6">
        <Button variant="ghost" onClick={() => router.back()} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Branches
        </Button>

        {/* Branch Info */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold">{branch?.branchName}</h2>
                {branch && <StatusBadge status={branch.status} />}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 text-sm text-muted-foreground">
              {branch?.address && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span>{branch.address}</span>
                </div>
              )}
              {branch?.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0" />
                  <span>{branch.phone}</span>
                </div>
              )}
              {(branch?.openingTime || branch?.closingTime) && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 shrink-0" />
                  <span>{branch?.openingTime} - {branch?.closingTime}</span>
                </div>
              )}
            </div>
            {branch?.facilitiesJson && branch.facilitiesJson.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Facilities</p>
                <div className="flex flex-wrap gap-2">
                  {branch.facilitiesJson.map((f: string) => (
                    <span key={f} className="text-xs bg-secondary px-2.5 py-1 rounded-full">{f}</span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="members">
          <TabsList>
            <TabsTrigger value="members"><Users className="h-4 w-4 mr-1.5" />Members</TabsTrigger>
            <TabsTrigger value="staff"><Users className="h-4 w-4 mr-1.5" />Staff</TabsTrigger>
            <TabsTrigger value="payments"><CreditCard className="h-4 w-4 mr-1.5" />Payments</TabsTrigger>
            <TabsTrigger value="reports"><BarChart3 className="h-4 w-4 mr-1.5" />Reports</TabsTrigger>
            <TabsTrigger value="attendance"><Clock className="h-4 w-4 mr-1.5" />Attendance</TabsTrigger>
            <TabsTrigger value="images">
              <ImageIcon className="h-4 w-4 mr-1.5" />
              Images
              {existingImages.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-xs">{existingImages.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="members" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Branch Members</CardTitle></CardHeader>
              <CardContent>
                <DataTable
                  columns={memberColumns}
                  data={(subscriptionsData?.data?.subscriptions ?? []) as MemberSubscription[]}
                  loading={subsLoading}
                  emptyTitle="No members"
                  emptyDescription="No subscriptions found for this branch"
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="staff" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Staff Members</CardTitle></CardHeader>
              <CardContent>
                <DataTable
                  columns={staffColumns}
                  data={(staffData?.data?.staff ?? []) as GymStaff[]}
                  loading={staffLoading}
                  emptyTitle="No staff assigned"
                  emptyDescription="No staff members assigned to this branch"
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments" className="mt-4 space-y-4">
            {/* Quick stats */}
            {report && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard title="Total Revenue" value={formatCurrency(report.revenue.allTime)} icon={DollarSign} colorClass="text-green-600" />
                <StatCard title="This Month" value={formatCurrency(report.revenue.thisMonth)} icon={TrendingUp} />
                <StatCard title="Pending" value={report.revenue.pendingCount} subtitle="awaiting action" icon={Inbox} colorClass="text-yellow-600" />
                <StatCard title="Collected" value={report.revenue.staffCollectedCount} subtitle="awaiting host" icon={CheckCircle} colorClass="text-blue-600" />
              </div>
            )}

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Branch Payments</CardTitle>
                  <div className="flex gap-1">
                    {(['all', 'PENDING', 'STAFF_COLLECTED', 'COMPLETED', 'FAILED'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setPaymentStatusFilter(s)}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                          paymentStatusFilter === s
                            ? 'bg-primary text-white'
                            : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                        }`}
                      >
                        {s === 'all' ? 'All' : s === 'STAFF_COLLECTED' ? 'Collected' : s.charAt(0) + s.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={paymentColumns}
                  data={(paymentsData?.data?.payments ?? []) as Payment[]}
                  loading={paymentsLoading}
                  emptyTitle="No payments"
                  emptyDescription="No payments found for this branch"
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="mt-4 space-y-6">
            {reportLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-24 rounded-lg" />
                <Skeleton className="h-24 rounded-lg" />
              </div>
            ) : report ? (
              <>
                {/* Member KPIs */}
                <div>
                  <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Members</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <StatCard title="Active Members" value={report.members.active} icon={UserCheck} colorClass="text-green-600" />
                    <StatCard title="Frozen" value={report.members.frozen} icon={Users} colorClass="text-blue-500" />
                    <StatCard title="Pending Activation" value={report.members.pending} icon={Users} colorClass="text-yellow-600" />
                    <StatCard title="Expired This Month" value={report.members.expiredThisMonth} icon={Users} colorClass="text-red-500" />
                  </div>
                </div>

                {/* Revenue KPIs */}
                <div>
                  <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Revenue</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <StatCard title="All-Time Revenue" value={formatCurrency(report.revenue.allTime)} icon={DollarSign} colorClass="text-green-600" />
                    <StatCard title="This Month" value={formatCurrency(report.revenue.thisMonth)} icon={TrendingUp} />
                    <StatCard title="Active Staff" value={report.staff.active} icon={Users} />
                  </div>
                </div>

                {/* Attendance KPIs */}
                <div>
                  <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Attendance</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <StatCard title="Check-ins Today" value={report.attendance.checkInsToday} icon={CalendarCheck} />
                    <StatCard title="Check-ins This Month" value={report.attendance.checkInsThisMonth} icon={CalendarCheck} colorClass="text-indigo-600" />
                  </div>
                </div>

                {/* Plan distribution */}
                {report.planDistribution.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Active Plan Distribution</h3>
                    <Card>
                      <CardContent className="p-4 space-y-3">
                        {report.planDistribution.map((p) => (
                          <div key={p.planId} className="flex items-center gap-3">
                            <span className="text-sm flex-1 truncate">{p.planName}</span>
                            <Badge variant="secondary">{p.count} members</Badge>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Revenue by day (this month) */}
                {report.revenueByDay.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Revenue This Month (by day)</h3>
                    <Card>
                      <CardContent className="p-4">
                        <div className="space-y-2">
                          {report.revenueByDay.map((r) => (
                            <div key={r.day} className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">{r.day}</span>
                              <div className="flex items-center gap-4">
                                <span className="text-xs text-muted-foreground">{r.count} payment{parseInt(r.count) !== 1 ? 's' : ''}</span>
                                <span className="font-medium">{formatCurrency(parseFloat(r.totalRevenue))}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No report data available</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="attendance" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Recent Attendance</CardTitle></CardHeader>
              <CardContent>
                <DataTable
                  columns={attendanceColumns}
                  data={(attendanceData?.data?.logs ?? []) as AttendanceLog[]}
                  loading={attendanceLoading}
                  emptyTitle="No attendance records"
                  emptyDescription="No check-ins recorded for this branch"
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Images Tab */}
          <TabsContent value="images" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    Branch Images
                  </CardTitle>
                  {pendingFiles.length > 0 && (
                    <Button
                      size="sm"
                      onClick={() => uploadImagesMutation.mutate(pendingFiles)}
                      loading={uploadImagesMutation.isPending}
                    >
                      Upload {pendingFiles.length} image{pendingFiles.length !== 1 ? 's' : ''}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {pendingFiles.length > 0 && (
                  <div className="mb-4 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                    <p className="text-sm text-primary font-medium">
                      {pendingFiles.length} image{pendingFiles.length !== 1 ? 's' : ''} ready to upload
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {pendingFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs bg-background rounded-full px-2.5 py-1 border">
                          <span className="truncate max-w-[120px]">{f.name}</span>
                          <button
                            onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <MultiImageUpload
                  existingUrls={existingImages}
                  onFilesSelected={handleFilesSelected}
                  onRemoveExisting={(url) => deleteImageMutation.mutate(url)}
                  maxCount={10}
                  uploading={uploadImagesMutation.isPending || deleteImageMutation.isPending}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
