'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Search, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { DataTable, Column } from '@/components/features/data-table'
import { StatusBadge } from '@/components/features/status-badge'
import { ConfirmDialog } from '@/components/features/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { adminApi } from '@/lib/api/admin'
import { citiesApi } from '@/lib/api/cities'
import { packagesApi } from '@/lib/api/packages'
import { Tenant } from '@/types'
import { formatDate, getInitials } from '@/lib/utils'
import { useDebounce } from '@/hooks/use-debounce'
import { useToast } from '@/hooks/use-toast'

const createTenantSchema = z.object({
  ownerEmail: z.string().email('Valid email required'),
  ownerFullName: z.string().min(2, 'Full name required'),
  ownerPhone: z.string().optional(),
  businessName: z.string().min(2, 'Business name required'),
  email: z.string().email('Valid business email required'),
  phone: z.string().optional(),
  cityId: z.string().optional(),
  packageId: z.string().optional(),
})

type CreateTenantForm = z.infer<typeof createTenantSchema>

export default function TenantsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null)
  const [syncSent, setSyncSent] = useState(false)

  const debouncedSearch = useDebounce(search, 400)

  const { data, isLoading } = useQuery({
    queryKey: ['tenants', debouncedSearch, statusFilter, page],
    queryFn: () => adminApi.getTenants({
      search: debouncedSearch || undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      page,
      limit: 20,
    }),
  })

  const { data: citiesData } = useQuery({
    queryKey: ['cities'],
    queryFn: () => citiesApi.getCities(),
    enabled: createOpen,
  })

  const { data: packagesData } = useQuery({
    queryKey: ['packages'],
    queryFn: () => packagesApi.getPackages(),
    enabled: createOpen,
  })

  const form = useForm<CreateTenantForm>({
    resolver: zodResolver(createTenantSchema),
    defaultValues: { ownerEmail: '', ownerFullName: '', ownerPhone: '', businessName: '', email: '', phone: '', cityId: '', packageId: '' },
  })

  const createMutation = useMutation({
    mutationFn: (values: CreateTenantForm) => adminApi.createTenant({
      ownerEmail: values.ownerEmail,
      ownerFullName: values.ownerFullName,
      ownerPhone: values.ownerPhone || undefined,
      businessName: values.businessName,
      email: values.email,
      phone: values.phone || undefined,
      cityId: values.cityId ? Number(values.cityId) : undefined,
      packageId: values.packageId || undefined,
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
      setCreateOpen(false)
      form.reset()
      toast({ title: 'Tenant created', description: `${res.data?.tenant?.businessName} has been registered.` })
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: string } } }
      toast({ title: 'Error', description: e.response?.data?.message || 'Failed to create tenant', variant: 'destructive' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteTenant(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
      setDeleteTarget(null)
      toast({ title: 'Tenant deleted' })
    },
    onError: (err: any) => toast({ title: 'Cannot delete', description: err?.response?.data?.message ?? 'Failed to delete tenant', variant: 'destructive' }),
  })

  const syncMutation = useMutation({
    mutationFn: () => adminApi.syncSubscriptions(),
    onSuccess: () => {
      setSyncSent(true)
      setTimeout(() => setSyncSent(false), 3000)
      toast({ title: 'Subscription sync triggered', description: 'Subscriptions are being checked in the background.' })
    },
    onError: () => toast({ title: 'Sync failed', variant: 'destructive' }),
  })

  const cities = citiesData?.data ?? []
  const packages = packagesData?.data?.filter((p) => p.status === 'ACTIVE') ?? []

  const columns: Column<Tenant>[] = [
    {
      key: 'business',
      header: 'Business',
      cell: (row) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
              {getInitials(row.businessName)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-sm">{row.businessName}</p>
            <p className="text-xs text-muted-foreground">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'owner',
      header: 'Owner',
      cell: (row) => (
        <div>
          <p className="text-sm font-medium">{row.user?.fullName ?? row.owner?.fullName ?? '—'}</p>
          <p className="text-xs text-muted-foreground">{row.phone}</p>
        </div>
      ),
    },
    {
      key: 'city',
      header: 'City',
      cell: (row) => <span className="text-sm">{row.city?.name ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'joined',
      header: 'Applied',
      cell: (row) => <span className="text-sm text-muted-foreground">{formatDate(row.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      cell: (row) => (
        <Button
          size="icon-sm"
          variant="ghost"
          className="h-7 w-7 text-destructive hover:bg-destructive hover:text-destructive-foreground"
          onClick={(e) => { e.stopPropagation(); setDeleteTarget(row) }}
          title="Delete tenant"
          disabled={!['PENDING_REVIEW', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'].includes(row.status)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ]

  return (
    <>
      <Header title="Tenants" description="Manage gym host applications and accounts" />
      <div className="p-6 animate-fade-in">
        <PageHeader
          title="Tenant Management"
          description="Review and manage gym host applications"
          action={
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => syncMutation.mutate()}
                loading={syncMutation.isPending}
                title="Run subscription expiry check now"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${syncSent ? 'text-green-600' : ''}`} />
                {syncSent ? 'Synced!' : 'Sync Subscriptions'}
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Tenant
              </Button>
            </div>
          }
        />

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tenants..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="pl-9"
            />
          </div>
        </div>

        <Card>
          <CardHeader className="pb-0">
            <Tabs value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
              <TabsList className="flex-wrap h-auto gap-1">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="PENDING_REVIEW">Pending</TabsTrigger>
                <TabsTrigger value="UNDER_REVIEW">Under Review</TabsTrigger>
                <TabsTrigger value="APPROVED">Approved</TabsTrigger>
                <TabsTrigger value="ACTIVE">Active</TabsTrigger>
                <TabsTrigger value="REJECTED">Rejected</TabsTrigger>
                <TabsTrigger value="SUSPENDED">Suspended</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="pt-4">
            <DataTable
              columns={columns}
              data={(data?.data?.tenants ?? []) as Tenant[]}
              loading={isLoading}
              emptyTitle="No tenants found"
              emptyDescription="No gym hosts match the current filter"
              page={page}
              totalPages={data?.pagination?.totalPages ?? 1}
              onPageChange={setPage}
              onRowClick={(tenant) => router.push(`/admin/tenants/${tenant.id}`)}
            />
          </CardContent>
        </Card>
      </div>

      {/* Delete Tenant */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete Tenant"
        variant="destructive"
        description={`Permanently delete "${deleteTarget?.businessName}"? This removes all their data and cannot be undone. Only pending/rejected tenants can be deleted.`}
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
      />

      {/* Create Tenant Dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) form.reset() }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Tenant</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-5">

              <div className="space-y-1">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Owner Account</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField control={form.control} name="ownerEmail" render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Owner Email *</FormLabel>
                      <FormControl><Input type="email" placeholder="owner@example.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="ownerFullName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Owner Full Name *</FormLabel>
                      <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="ownerPhone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Owner Phone</FormLabel>
                      <FormControl><Input type="tel" placeholder="+92 300 1234567" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Business Details</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField control={form.control} name="businessName" render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Business Name *</FormLabel>
                      <FormControl><Input placeholder="Fitness Plus Pvt Ltd" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business Email *</FormLabel>
                      <FormControl><Input type="email" placeholder="info@gym.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business Phone</FormLabel>
                      <FormControl><Input type="tel" placeholder="+92 42 1234567" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="cityId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {cities.filter((c) => c.isActive).map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="packageId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Package</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select package" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {packages.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                If the owner email doesn&apos;t exist, a new account will be created automatically. The tenant will be created in <strong>Pending Review</strong> status.
              </p>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setCreateOpen(false); form.reset() }}>Cancel</Button>
                <Button type="submit" loading={createMutation.isPending}>Create Tenant</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  )
}
