'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Search, Users, UserPlus, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { DataTable, Column } from '@/components/features/data-table'
import { StatusBadge } from '@/components/features/status-badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { gymApi } from '@/lib/api/gym'
import { plansApi } from '@/lib/api/plans'
import { User } from '@/types'
import { formatDate, getInitials } from '@/lib/utils'
import { useDebounce } from '@/hooks/use-debounce'
import { useToast } from '@/hooks/use-toast'

const enrollSchema = z.object({
  email: z.string().email('Valid email required'),
  fullName: z.string().optional(),
  phone: z.string().optional(),
  planId: z.string().min(1, 'Please select a plan'),
  branchId: z.string().min(1, 'Please select a branch'),
  startDate: z.string().optional(),
})

type EnrollForm = z.infer<typeof enrollSchema>

export default function MembersPage() {
  const router = useRouter()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [lookupEmail, setLookupEmail] = useState('')
  const [foundUser, setFoundUser] = useState<User | null | undefined>(undefined)
  const [lookingUp, setLookingUp] = useState(false)

  const debouncedSearch = useDebounce(search, 400)

  const { data, isLoading } = useQuery({
    queryKey: ['gym-members', debouncedSearch, statusFilter, page],
    queryFn: () => gymApi.getMembers({
      q: debouncedSearch || undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      page,
      limit: 20,
    }),
  })

  const { data: branchesData } = useQuery({
    queryKey: ['branches'],
    queryFn: () => gymApi.getBranches(),
  })

  const { data: plansData } = useQuery({
    queryKey: ['host-plans'],
    queryFn: () => plansApi.getHostPlans(),
    enabled: enrollOpen,
  })

  const form = useForm<EnrollForm>({
    resolver: zodResolver(enrollSchema),
    defaultValues: { email: '', fullName: '', phone: '', planId: '', branchId: '', startDate: '' },
  })

  const enrollMutation = useMutation({
    mutationFn: (values: EnrollForm) => gymApi.enrollMember({
      email: values.email,
      fullName: values.fullName || undefined,
      phone: values.phone || undefined,
      planId: values.planId,
      branchId: values.branchId,
      startDate: values.startDate || undefined,
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['gym-members'] })
      const { userCreated } = res.data
      toast({
        title: 'Member enrolled successfully',
        description: userCreated ? 'A new account was created for this member.' : 'Member added to this gym.',
      })
      setEnrollOpen(false)
      resetEnrollDialog()
    },
    onError: (err: any) => {
      toast({
        title: 'Enrollment failed',
        description: err?.response?.data?.message ?? 'An error occurred',
        variant: 'destructive',
      })
    },
  })

  const resetEnrollDialog = () => {
    form.reset()
    setLookupEmail('')
    setFoundUser(undefined)
  }

  const handleLookup = async () => {
    const email = lookupEmail.trim()
    if (!email) return
    setLookingUp(true)
    try {
      const res = await gymApi.searchMember(email)
      const user = res.data?.user ?? null
      setFoundUser(user)
      form.setValue('email', email)
      if (user) {
        form.setValue('fullName', user.fullName ?? '')
        form.setValue('phone', user.phone ?? '')
      }
    } catch {
      setFoundUser(null)
      form.setValue('email', email)
    } finally {
      setLookingUp(false)
    }
  }

  const activePlans = (plansData?.data?.plans ?? []).filter((p) => p.status === 'ACTIVE')
  const branches = branchesData?.data?.branches ?? []

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'Member',
      cell: (row) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src={row.profileImageUrl} />
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
              {getInitials(row.fullName)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-sm">{row.fullName}</p>
            <p className="text-xs text-muted-foreground">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      cell: (row) => <span className="text-sm text-muted-foreground">{row.phone || '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'verified',
      header: 'Verified',
      cell: (row) => (
        <span className={`text-xs font-medium ${row.isVerified ? 'text-success' : 'text-muted-foreground'}`}>
          {row.isVerified ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      key: 'joined',
      header: 'Joined',
      cell: (row) => <span className="text-sm text-muted-foreground">{formatDate(row.createdAt)}</span>,
    },
  ]

  const members = data?.data?.members ?? []
  const pagination = data?.pagination
  const totalPages = pagination?.totalPages ?? 1

  return (
    <>
      <Header title="Members" description="Manage your gym members" />
      <div className="p-6 animate-fade-in">
        <PageHeader
          title="Members"
          description={`${pagination?.total ?? 0} total members`}
          action={
            <Button onClick={() => { resetEnrollDialog(); setEnrollOpen(true) }}>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Member
            </Button>
          }
        />

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search members..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
              <SelectItem value="SUSPENDED">Suspended</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <DataTable
          columns={columns}
          data={members}
          loading={isLoading}
          emptyTitle="No members found"
          emptyDescription={search ? `No members matching "${search}"` : 'No members have registered yet'}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          onRowClick={(member) => router.push(`/gym/members/${member.id}`)}
        />
      </div>

      {/* Enroll Member Dialog */}
      <Dialog open={enrollOpen} onOpenChange={(open) => { setEnrollOpen(open); if (!open) resetEnrollDialog() }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Enroll Member</DialogTitle>
          </DialogHeader>

          {/* Email lookup */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Member Email *</label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="member@example.com"
                value={lookupEmail}
                onChange={(e) => setLookupEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
              />
              <Button type="button" variant="outline" onClick={handleLookup} disabled={!lookupEmail.trim() || lookingUp}>
                {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lookup'}
              </Button>
            </div>
            {foundUser === null && (
              <p className="text-xs text-muted-foreground">No existing account found — a new one will be created.</p>
            )}
            {foundUser && (
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={foundUser.profileImageUrl} />
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">{getInitials(foundUser.fullName)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{foundUser.fullName}</p>
                  <p className="text-xs text-muted-foreground">{foundUser.email}</p>
                </div>
                <StatusBadge status={foundUser.status} />
              </div>
            )}
          </div>

          {/* Rest of the form — only show after lookup */}
          {foundUser !== undefined && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit((v) => enrollMutation.mutate(v))} className="space-y-4">
                {/* Hidden email field */}
                <input type="hidden" {...form.register('email')} />

                {/* Show name/phone only if new user */}
                {foundUser === null && (
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="fullName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Full Name</FormLabel>
                          <FormControl>
                            <Input placeholder="John Doe" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone</FormLabel>
                          <FormControl>
                            <Input placeholder="+92 300 0000000" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="planId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Membership Plan *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select plan" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {activePlans.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select branch" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {branches.map((b) => (
                              <SelectItem key={b.id} value={b.id}>{b.branchName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Date <span className="text-muted-foreground text-xs">(optional — defaults to today)</span></FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setEnrollOpen(false)}>Cancel</Button>
                  <Button type="submit" loading={enrollMutation.isPending}>
                    <Users className="h-4 w-4 mr-2" />
                    Enroll Member
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
