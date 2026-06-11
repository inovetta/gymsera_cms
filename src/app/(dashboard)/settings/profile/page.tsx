'use client'

import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Save, Building2, Mail, Phone, MapPin } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/features/status-badge'
import { tenantsApi } from '@/lib/api/tenants'
import { citiesApi } from '@/lib/api/cities'
import { useToast } from '@/hooks/use-toast'
import { formatDate } from '@/lib/utils'

const schema = z.object({
  businessName: z.string().min(2, 'Business name must be at least 2 characters').max(200),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional().or(z.literal('')),
  cityId: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export default function BusinessProfilePage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data: tenantData, isLoading } = useQuery({
    queryKey: ['my-tenant'],
    queryFn: () => tenantsApi.getMyTenant(),
  })

  const { data: citiesData } = useQuery({
    queryKey: ['cities'],
    queryFn: () => citiesApi.getCities(),
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { businessName: '', email: '', phone: '', cityId: '' },
  })

  const tenant = tenantData?.data?.tenant
  const cities = Array.isArray(citiesData?.data) ? citiesData.data : []

  useEffect(() => {
    if (tenant) {
      form.reset({
        businessName: tenant.businessName || '',
        email: tenant.email || '',
        phone: tenant.phone || '',
        cityId: tenant.cityId ? String(tenant.cityId) : '',
      })
    }
  }, [tenant, form])

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      tenantsApi.updateMyTenant({
        businessName: values.businessName,
        email: values.email,
        phone: values.phone || undefined,
        cityId: values.cityId ? Number(values.cityId) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-tenant'] })
      toast({ title: 'Business profile updated successfully' })
    },
    onError: () => toast({ title: 'Error', description: 'Failed to update business profile', variant: 'destructive' }),
  })

  if (isLoading) {
    return (
      <>
        <Header title="Business Profile" />
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-6 lg:grid-cols-3">
            <Skeleton className="h-48 rounded-lg" />
            <div className="lg:col-span-2 space-y-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Header title="Business Profile" description="Manage your registered business information" />
      <div className="p-6 animate-fade-in space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Info sidebar */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Business Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  {tenant && <StatusBadge status={tenant.status} />}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">KYC</span>
                  <span className="font-medium capitalize">{tenant?.kycStatus?.replace('_', ' ') || 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Registered</span>
                  <span className="font-medium">{tenant ? formatDate(tenant.createdAt) : '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Step</span>
                  <span className="font-medium">{tenant?.onboardingStep ?? '—'} / 3</span>
                </div>
              </CardContent>
            </Card>

            {tenant?.rejectionReason && (
              <Card className="border-destructive/50 bg-destructive/5">
                <CardHeader>
                  <CardTitle className="text-base text-destructive">Rejection Reason</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{tenant.rejectionReason}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Form */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Business Information</CardTitle>
              <CardDescription>Update your registered business contact details</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="businessName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Name *</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input className="pl-9" placeholder="Iron Temple Fitness" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Business Email *</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input className="pl-9" type="email" placeholder="info@mygym.com" {...field} />
                            </div>
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
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input className="pl-9" placeholder="+92 300 0000000" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="cityId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                                <SelectValue placeholder="Select your city" />
                              </div>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {cities.map((city) => (
                              <SelectItem key={city.id} value={String(city.id)}>
                                {city.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end pt-2">
                    <Button type="submit" loading={mutation.isPending}>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
