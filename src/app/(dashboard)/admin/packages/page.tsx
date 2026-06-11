'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Package, MoreHorizontal, Check } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { StatusBadge } from '@/components/features/status-badge'
import { EmptyState } from '@/components/features/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { packagesApi } from '@/lib/api/packages'
import { PlatformPackage } from '@/types'
import { formatCurrency } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

const packageSchema = z.object({
  name: z.string().min(2, 'Name required'),
  description: z.string().optional(),
  price: z.coerce.number().min(0),
  billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']),
  maxBranches: z.coerce.number().min(1),
  maxTrainers: z.coerce.number().min(0),
  maxMembers: z.coerce.number().min(0),
})

type PackageForm = z.infer<typeof packageSchema>

function PackageCard({ pkg, onEdit, onToggle }: {
  pkg: PlatformPackage
  onEdit: (p: PlatformPackage) => void
  onToggle: (p: PlatformPackage) => void
}) {
  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-5 text-white">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-xl">{pkg.name}</h3>
            <p className="text-white/70 text-sm capitalize">{pkg.billingCycle.toLowerCase()}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/20">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(pkg)}>Edit Package</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggle(pkg)}>
                {pkg.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className="text-4xl font-bold mt-3">{formatCurrency(pkg.price)}</p>
        <p className="text-white/70 text-sm mt-0.5">per {pkg.billingCycle.toLowerCase()}</p>
      </div>

      <CardContent className="p-5">
        {pkg.description && (
          <p className="text-sm text-muted-foreground mb-4">{pkg.description}</p>
        )}

        <div className="space-y-2">
          {[
            { label: `Up to ${pkg.maxBranches} branches` },
            { label: `Up to ${pkg.maxTrainers} trainers` },
            { label: `Up to ${pkg.maxMembers === 0 ? 'unlimited' : pkg.maxMembers} members` },
          ].map((feature, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-success" />
              <span>{feature.label}</span>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <StatusBadge status={pkg.status} />
        </div>
      </CardContent>
    </Card>
  )
}

export default function PackagesPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editPackage, setEditPackage] = useState<PlatformPackage | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['packages'],
    queryFn: () => packagesApi.getPackages(),
  })

  const form = useForm<PackageForm>({
    resolver: zodResolver(packageSchema),
    defaultValues: { name: '', description: '', price: 0, billingCycle: 'MONTHLY', maxBranches: 1, maxTrainers: 5, maxMembers: 100 },
  })

  const createMutation = useMutation({
    mutationFn: (payload: PackageForm) => packagesApi.createPackage(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packages'] })
      setDialogOpen(false)
      form.reset()
      toast({ title: 'Package created successfully' })
    },
    onError: () => toast({ title: 'Error', description: 'Failed to create package', variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: PackageForm }) => packagesApi.updatePackage(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packages'] })
      setDialogOpen(false)
      setEditPackage(null)
      toast({ title: 'Package updated' })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, currentStatus }: { id: string; currentStatus: string }) =>
      packagesApi.togglePackageStatus(id, currentStatus),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packages'] })
      toast({ title: 'Package status updated' })
    },
  })

  const openCreate = () => {
    setEditPackage(null)
    form.reset({ name: '', description: '', price: 0, billingCycle: 'MONTHLY', maxBranches: 1, maxTrainers: 5, maxMembers: 100 })
    setDialogOpen(true)
  }

  const openEdit = (pkg: PlatformPackage) => {
    setEditPackage(pkg)
    form.reset({
      name: pkg.name,
      description: pkg.description || '',
      price: pkg.price,
      billingCycle: pkg.billingCycle,
      maxBranches: pkg.maxBranches,
      maxTrainers: pkg.maxTrainers,
      maxMembers: pkg.maxMembers,
    })
    setDialogOpen(true)
  }

  const onSubmit = (values: PackageForm) => {
    if (editPackage) {
      updateMutation.mutate({ id: editPackage.id, payload: values })
    } else {
      createMutation.mutate(values)
    }
  }

  const packages = data?.data ?? []

  return (
    <>
      <Header title="Platform Packages" description="Manage subscription plans for gym hosts" />
      <div className="p-6 animate-fade-in">
        <PageHeader
          title="Platform Packages"
          description="Subscription plans available to gym hosts"
          action={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Create Package</Button>}
        />

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 rounded-lg" />)}
          </div>
        ) : packages.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No packages yet"
            description="Create your first platform subscription package"
            action={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Create Package</Button>}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {packages.map((pkg) => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                onEdit={openEdit}
                onToggle={(p) => toggleMutation.mutate({ id: p.id, currentStatus: p.status })}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editPackage ? 'Edit Package' : 'Create Package'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Package Name *</FormLabel>
                    <FormControl><Input placeholder="Starter, Professional..." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl><Textarea placeholder="Package details..." rows={2} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price (PKR) *</FormLabel>
                      <FormControl><Input type="number" min="0" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="billingCycle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Billing Cycle *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="MONTHLY">Monthly</SelectItem>
                          <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                          <SelectItem value="YEARLY">Yearly</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="maxBranches"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Branches</FormLabel>
                      <FormControl><Input type="number" min="1" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="maxTrainers"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Trainers</FormLabel>
                      <FormControl><Input type="number" min="0" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="maxMembers"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Members</FormLabel>
                      <FormControl><Input type="number" min="0" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
                  {editPackage ? 'Save Changes' : 'Create Package'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  )
}
