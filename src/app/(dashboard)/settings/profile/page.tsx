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
import { ErrorState } from '@/components/features/error-state'
import { StatusBadge } from '@/components/features/status-badge'
import { organizationsApi } from '@/lib/api/organizations'
import { citiesApi, parseCities } from '@/lib/api/cities'
import { useToast } from '@/hooks/use-toast'
import { formatDate } from '@/lib/utils'
import { plainRequestError } from '@/lib/api/request-errors'
import { ORGANIZATION_NAME_MAX, ORGANIZATION_NAME_MIN, typedOrganizationName } from '@/lib/organizations/organization-name'

const schema = z.object({
  // R-112 (C1): the API decides (422 organization_name_*); this only gives the message first.
  organizationName: z
    .string()
    .trim()
    .min(ORGANIZATION_NAME_MIN, `Use ${ORGANIZATION_NAME_MIN} to ${ORGANIZATION_NAME_MAX} characters`)
    .max(ORGANIZATION_NAME_MAX, `Use ${ORGANIZATION_NAME_MIN} to ${ORGANIZATION_NAME_MAX} characters`)
    .refine((v) => /\p{L}/u.test(v), 'Use at least one letter')
    .refine((v) => !/[<>]/.test(v), 'Remove < and >'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional().or(z.literal('')),
  cityId: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

/**
 * Settings › Profile: the organization (enterprise D2, contract v2). Its name is private: only the
 * host and GymsEra see it; travellers see business names (D3).
 */
export default function OrganizationProfilePage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data: organizationData, isLoading, error: loadError, refetch } = useQuery({
    queryKey: ['my-organization'],
    queryFn: () => organizationsApi.getMine(),
  })

  const { data: citiesData } = useQuery({
    queryKey: ['cities'],
    queryFn: () => citiesApi.getCities(),
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { organizationName: '', email: '', phone: '', cityId: '' },
  })

  const organization = organizationData?.data?.organization
  const cities = parseCities(citiesData?.data)

  useEffect(() => {
    if (organization) {
      form.reset({
        organizationName: typedOrganizationName(organization.organizationName),
        email: organization.email || '',
        phone: organization.phone || '',
        cityId: organization.cityId ? String(organization.cityId) : '',
      })
    }
  }, [organization, form])

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      organizationsApi.updateMine({
        // R-112 (C4): the organization name only when it changed (an older stored name is not re-sent with an e-mail edit).
        organizationName: values.organizationName.trim() !== (organization?.organizationName ?? '').trim() ? values.organizationName.trim() : undefined,
        email: values.email,
        phone: values.phone || undefined,
        cityId: values.cityId ? Number(values.cityId) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-organization'] })
      toast({ title: 'Organization profile saved' })
    },
    onError: (err: unknown) =>
      toast({ title: 'Error', description: plainRequestError(err, 'Failed to update the organization profile'), variant: 'destructive' }),
  })

  if (loadError) {
    return (
      <>
        <Header title="Organization profile" />
        <div className="p-6">
          <ErrorState error={loadError} what="your organization profile" onRetry={() => refetch()} />
        </div>
      </>
    )
  }

  if (isLoading) {
    return (
      <>
        <Header title="Organization profile" />
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
      <Header title="Organization profile" description="Your company: the organization that owns your businesses" />
      <div className="p-6 animate-fade-in space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Info sidebar */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Organization status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  {organization && <StatusBadge status={organization.status} />}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">KYC</span>
                  <span className="font-medium capitalize">{organization?.kycStatus?.replace('_', ' ') || 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Registered</span>
                  <span className="font-medium">{organization ? formatDate(organization.createdAt) : '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Step</span>
                  <span className="font-medium">{organization?.onboardingStep ?? '—'} / 3</span>
                </div>
              </CardContent>
            </Card>

            {organization?.rejectionReason && (
              <Card className="border-destructive/50 bg-destructive/5">
                <CardHeader>
                  <CardTitle className="text-base text-destructive">Rejection Reason</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{organization.rejectionReason}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Form */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Organization information</CardTitle>
              <CardDescription>Update your organization&apos;s name and contact details</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="organizationName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organization name *</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input className="pl-9" placeholder="Iron Temple" maxLength={ORGANIZATION_NAME_MAX} {...field} />
                          </div>
                        </FormControl>
                        <p className="text-xs text-muted-foreground" data-testid="organization-name-helper">Only you and GymsEra see this</p>
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
                          <FormLabel>Organization email *</FormLabel>
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
