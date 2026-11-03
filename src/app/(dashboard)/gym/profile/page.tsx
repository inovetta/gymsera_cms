'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Save, Building2 } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { FileUpload } from '@/components/features/file-upload'
import { MultiImageUpload } from '@/components/features/multi-image-upload'
import { OrganizationStrip } from '@/components/features/organization-strip'
import { EmptyState } from '@/components/features/empty-state'
import { ErrorState } from '@/components/features/error-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { hostApi } from '@/lib/api/host'
import { resolveApiError } from '@/lib/api/error-copy'
import {
  GENDER_TYPES,
  ORGANIZATION_CATEGORIES,
  OrganizationImages,
  formFromOrganization,
  imagesFromOrganization,
  payloadFromForm,
  visibleOrganizations,
} from '@/lib/organizations/profile'
import { useToast } from '@/hooks/use-toast'

/**
 * Gym Profile: one organization at a time, as the mobile Edit Organization (NEW-196). It used to edit
 * /gyms/profile, which is the tenant's first organization whichever one the host meant. A host with
 * several organizations picks one in the strip; addresses and map locations belong to branches
 * (Branches page), as on mobile.
 */
const profileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  category: z.string(),
  establishedYear: z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d{4}$/.test(v) && Number(v) >= 1800 && Number(v) <= 2100), 'Enter a year such as 2018'),
  description: z.string(),
  phone: z.string(),
  email: z.string().trim().email('Enter a valid email address').or(z.literal('')),
  website: z
    .string()
    .trim()
    .refine((v) => v === '' || /^https?:\/\/\S+\.\S+/.test(v), 'Enter a full address such as https://www.gymname.com'),
  genderType: z.enum(['MIXED', 'MALE_ONLY', 'FEMALE_ONLY']),
})

type ProfileForm = z.infer<typeof profileSchema>

const EMPTY_FORM: ProfileForm = {
  name: '',
  category: '',
  establishedYear: '',
  description: '',
  phone: '',
  email: '',
  website: '',
  genderType: 'MIXED',
}

const NO_IMAGES: OrganizationImages = { logoUrl: null, coverImageUrl: null, gallery: [] }

export default function GymProfilePage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [images, setImages] = useState<OrganizationImages>(NO_IMAGES)
  const [galleryUploading, setGalleryUploading] = useState(false)

  const listingsQuery = useQuery({
    queryKey: ['host-listings'],
    queryFn: () => hostApi.getListings(),
  })
  const organizations = visibleOrganizations(listingsQuery.data?.data ?? [])
  const organizationId = organizations.find((o) => o.id === selectedId)?.id ?? organizations[0]?.id

  const organizationQuery = useQuery({
    queryKey: ['host-organization', organizationId],
    queryFn: () => hostApi.getOrganization(organizationId as string),
    enabled: !!organizationId,
  })
  const organization = organizationQuery.data?.data

  const form = useForm<ProfileForm>({ resolver: zodResolver(profileSchema), defaultValues: EMPTY_FORM })

  useEffect(() => {
    if (!organization) return
    form.reset(formFromOrganization(organization))
    setImages(imagesFromOrganization(organization))
    setLogoFile(null)
    setCoverFile(null)
  }, [organization, form])

  const showError = (title: string, err: unknown) => {
    const { message, requestId } = resolveApiError(err)
    toast({ title, description: requestId ? `${message} (Reference: ${requestId})` : message, variant: 'destructive' })
  }

  const saveMutation = useMutation({
    mutationFn: async (values: ProfileForm) => {
      const id = organizationId as string
      // New logo or cover: stored first, then saved on this organization only.
      const upload = async (file: File) => {
        const [url] = await hostApi.uploadOrganizationPhotos([file])
        if (!url) throw new Error('The photo could not be uploaded. Please try again.')
        return url
      }
      const next: OrganizationImages = {
        ...images,
        logoUrl: logoFile ? await upload(logoFile) : images.logoUrl,
        coverImageUrl: coverFile ? await upload(coverFile) : images.coverImageUrl,
      }
      await hostApi.updateOrganization(id, payloadFromForm(values, next))
      return next
    },
    onSuccess: (next) => {
      setImages(next)
      setLogoFile(null)
      setCoverFile(null)
      queryClient.invalidateQueries({ queryKey: ['host-organization', organizationId] })
      queryClient.invalidateQueries({ queryKey: ['host-listings'] })
      toast({ title: 'Saved', description: 'The organization profile was updated.' })
    },
    onError: (err) => showError('Could not save the profile', err),
  })

  const addGalleryPhotos = async (files: File[]) => {
    if (files.length === 0) return
    setGalleryUploading(true)
    try {
      const urls = await hostApi.uploadOrganizationPhotos(files)
      setImages((prev) => ({ ...prev, gallery: [...prev.gallery, ...urls] }))
      toast({ title: 'Photos added', description: 'Save Changes to keep them on this organization.' })
    } catch (err) {
      showError('Upload failed', err)
    } finally {
      setGalleryUploading(false)
    }
  }

  const removeGalleryPhoto = (url: string) =>
    setImages((prev) => ({ ...prev, gallery: prev.gallery.filter((u) => u !== url) }))

  const pick = (id: string) => {
    if (id === organizationId) return
    setSelectedId(id)
  }

  const loadError = listingsQuery.error || organizationQuery.error
  if (loadError) {
    return (
      <>
        <Header title="Gym Profile" />
        <div className="p-6">
          <ErrorState
            error={loadError}
            what="the organization profile"
            onRetry={() => (listingsQuery.error ? listingsQuery.refetch() : organizationQuery.refetch())}
          />
        </div>
      </>
    )
  }

  const loading = listingsQuery.isLoading || (!!organizationId && organizationQuery.isLoading)
  if (loading) {
    return (
      <>
        <Header title="Gym Profile" />
        <div className="p-6 space-y-6" data-testid="profile-loading">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-6 lg:grid-cols-3">
            <Skeleton className="h-64 rounded-lg" />
            <div className="lg:col-span-2 space-y-4">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          </div>
        </div>
      </>
    )
  }

  if (!organizationId || !organization) {
    return (
      <>
        <Header title="Gym Profile" />
        <div className="p-6">
          <EmptyState
            icon={Building2}
            title="No organization yet"
            description="An organization appears here once it is created. Add one from the Branches page."
          />
        </div>
      </>
    )
  }

  const categories: string[] = [...ORGANIZATION_CATEGORIES]
  const currentCategory = form.watch('category')
  if (currentCategory && !categories.includes(currentCategory)) categories.push(currentCategory)

  return (
    <>
      <Header title="Gym Profile" description="Manage each organization's public information" />
      <div className="p-6 animate-fade-in">
        <PageHeader
          title="Gym Profile"
          description="Update this organization's details and branding"
          action={
            <Button onClick={form.handleSubmit((v) => saveMutation.mutate(v))} loading={saveMutation.isPending}>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          }
        />

        {organizations.length > 1 && (
          <OrganizationStrip listings={organizations} selectedId={organizationId} onSelect={pick} />
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Logo</CardTitle>
              </CardHeader>
              <CardContent>
                <FileUpload
                  key={`logo-${organizationId}`}
                  onFileSelect={setLogoFile}
                  currentImageUrl={images.logoUrl ?? undefined}
                  label="Upload Logo"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cover Image</CardTitle>
              </CardHeader>
              <CardContent>
                <FileUpload
                  key={`cover-${organizationId}`}
                  onFileSelect={setCoverFile}
                  currentImageUrl={images.coverImageUrl ?? undefined}
                  label="Upload Cover"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Gallery Images</CardTitle>
              </CardHeader>
              <CardContent>
                <MultiImageUpload
                  existingUrls={images.gallery}
                  onFilesSelected={addGalleryPhotos}
                  onRemoveExisting={removeGalleryPhoto}
                  uploading={galleryUploading}
                  maxCount={10}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Profile Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Status:</span>
                  <span className="font-medium">{organization.status || '—'}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Business Details</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Organization Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. PowerGym Fitness Club" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="genderType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Who can join *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger aria-label="Who can join">
                                <SelectValue placeholder="Choose" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {GENDER_TYPES.map((g) => (
                                <SelectItem key={g.value} value={g.value}>
                                  {g.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger aria-label="Category">
                                <SelectValue placeholder="Choose a category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {categories.map((c) => (
                                <SelectItem key={c} value={c}>
                                  {c}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="establishedYear"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Established Year</FormLabel>
                          <FormControl>
                            <Input inputMode="numeric" placeholder="e.g. 2018" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Tell members about this organization..." rows={4} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Phone</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. +92 300 1234567" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Email</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. info@gymname.com" type="email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Website</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. https://www.gymname.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end pt-2">
                    <Button type="submit" loading={saveMutation.isPending}>
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
