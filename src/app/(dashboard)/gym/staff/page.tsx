'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2, Eye, EyeOff } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Switch } from '@/components/ui/switch'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { gymApi } from '@/lib/api/gym'
import { GymStaff } from '@/types'
import { getInitials } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'

const staffSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  password: z.string().min(6, 'Minimum 6 characters').optional().or(z.literal('')),
  designation: z.string().optional(),
  assignToAllBranches: z.boolean().default(false),
  branchIds: z.array(z.string()).default([]),
})

type StaffForm = z.infer<typeof staffSchema>

export default function StaffPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { isGymHost } = useAuth()
  const [createOpen, setCreateOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; tempPassword?: string } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const { data: staffData, isLoading } = useQuery({
    queryKey: ['all-staff'],
    queryFn: () => gymApi.listAllStaff(),
    enabled: isGymHost,
  })

  const { data: branchesData } = useQuery({
    queryKey: ['branches'],
    queryFn: () => gymApi.getBranches(),
    enabled: isGymHost,
  })
  const branches = branchesData?.data?.branches ?? []

  const form = useForm<StaffForm>({
    resolver: zodResolver(staffSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      password: '',
      designation: '',
      assignToAllBranches: false,
      branchIds: [],
    },
  })

  const watchAllBranches = form.watch('assignToAllBranches')

  const createMutation = useMutation({
    mutationFn: (payload: StaffForm) =>
      gymApi.createStaff({
        fullName: payload.fullName,
        email: payload.email,
        phone: payload.phone || undefined,
        password: payload.password || undefined,
        designation: payload.designation || undefined,
        assignToAllBranches: payload.assignToAllBranches,
        branchIds: payload.assignToAllBranches ? [] : payload.branchIds,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['all-staff'] })
      setCreateOpen(false)
      form.reset()
      setCreatedCredentials({
        email: res.data?.user?.email ?? '',
        tempPassword: res.data?.tempPassword,
      })
      toast({ title: 'Staff user created successfully' })
    },
    onError: (err: any) => toast({
      title: 'Error',
      description: err?.response?.data?.message || 'Failed to create staff user',
      variant: 'destructive',
    }),
  })

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => gymApi.removeStaffUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-staff'] })
      setDeleteConfirm(null)
      toast({ title: 'Staff user removed' })
    },
    onError: () => toast({ title: 'Error', description: 'Failed to remove staff user', variant: 'destructive' }),
  })

  const allStaff = (staffData?.data?.staff ?? []) as GymStaff[]

  // Group by userId to show each person once with their branches
  const staffByUser = allStaff.reduce<Record<string, { staff: GymStaff; branches: string[] }>>((acc, s) => {
    if (!acc[s.userId]) {
      acc[s.userId] = { staff: s, branches: [] }
    }
    if (s.branch?.branchName) acc[s.userId].branches.push(s.branch.branchName)
    return acc
  }, {})

  const uniqueStaff = Object.values(staffByUser)

  if (!isGymHost) {
    return (
      <>
        <Header title="Staff Management" />
        <div className="p-6">
          <Alert>
            <AlertDescription>Only the gym host can manage staff users.</AlertDescription>
          </Alert>
        </div>
      </>
    )
  }

  return (
    <>
      <Header title="Staff Management" description="Create and manage staff users for your gym" />
      <div className="p-6 animate-fade-in">
        <PageHeader
          title="Staff Users"
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Staff
            </Button>
          }
        />

        {/* Temp credentials alert */}
        {createdCredentials && (
          <Alert className="mb-6 border-green-200 bg-green-50">
            <AlertDescription className="space-y-1">
              <p className="font-medium text-green-800">Staff account created!</p>
              <p className="text-sm text-green-700">Email: <span className="font-mono">{createdCredentials.email}</span></p>
              {createdCredentials.tempPassword && (
                <p className="text-sm text-green-700">
                  Temporary password: <span className="font-mono font-medium">{createdCredentials.tempPassword}</span>
                  <span className="ml-2 text-xs">(Share this with the staff member — they should change it on first login)</span>
                </p>
              )}
              <Button variant="ghost" size="sm" className="mt-1 h-7 text-green-700" onClick={() => setCreatedCredentials(null)}>
                Dismiss
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">All Staff</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-muted-foreground text-sm">Loading staff...</div>
            ) : uniqueStaff.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <p className="font-medium">No staff users yet</p>
                <p className="text-sm mt-1">Add staff members to manage your gym branches</p>
              </div>
            ) : (
              <div className="space-y-3">
                {uniqueStaff.map(({ staff, branches: staffBranches }) => (
                  <div key={staff.userId} className="flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className="text-sm bg-primary/10 text-primary">
                        {staff.user?.fullName ? getInitials(staff.user.fullName) : 'S'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{staff.user?.fullName ?? '—'}</p>
                        <Badge variant="outline" className="text-xs">{staff.designation ?? 'Staff'}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{staff.user?.email}</p>
                      {staffBranches.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {staffBranches.map((b) => (
                            <span key={b} className="text-xs bg-secondary px-2 py-0.5 rounded-full">{b}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:bg-destructive/10 shrink-0"
                      onClick={() => setDeleteConfirm(staff.userId)}
                      title="Remove staff"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Staff Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Staff Member</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="fullName" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Full Name *</FormLabel>
                    <FormControl><Input placeholder="Ahmed Khan" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Email *</FormLabel>
                    <FormControl><Input type="email" placeholder="ahmed@gym.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl><Input placeholder="+923001234567" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="designation" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Designation</FormLabel>
                    <FormControl><Input placeholder="Receptionist" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel>Password <span className="text-muted-foreground text-xs">(auto-generated if blank)</span></FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Leave blank to auto-generate"
                        {...field}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Branch assignment */}
              <div className="space-y-3">
                <FormLabel>Branch Assignment</FormLabel>
                <FormField control={form.control} name="assignToAllBranches" render={({ field }) => (
                  <FormItem className="flex items-center gap-3 space-y-0">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="font-normal cursor-pointer">Assign to all branches</FormLabel>
                  </FormItem>
                )} />

                {!watchAllBranches && branches.length > 0 && (
                  <FormField control={form.control} name="branchIds" render={({ field }) => (
                    <div className="space-y-2 pl-1">
                      <p className="text-xs text-muted-foreground">Select specific branches:</p>
                      {branches.map((b) => (
                        <label key={b.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            className="rounded border-input accent-primary"
                            checked={field.value.includes(b.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                field.onChange([...field.value, b.id])
                              } else {
                                field.onChange(field.value.filter((id) => id !== b.id))
                              }
                            }}
                          />
                          <span className="text-sm">{b.branchName}</span>
                        </label>
                      ))}
                    </div>
                  )} />
                )}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button type="submit" loading={createMutation.isPending}>Create Staff</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Staff Member</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove the staff member from all branches. They will no longer be able to manage gym data.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              loading={deleteMutation.isPending}
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
