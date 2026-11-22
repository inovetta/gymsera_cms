'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Save, Building2 } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { FileUpload } from '@/components/features/file-upload'
import { MultiImageUpload } from '@/components/features/multi-image-upload'
import { BusinessStrip } from '@/components/features/business-strip'
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
import { organizationsApi } from '@/lib/api/organizations'
import { resolveApiError } from '@/lib/api/error-copy'
import {
  GENDER_TYPES,
  BUSINESS_CATEGORIES,
  BusinessImages,
  formFromBusiness,
  imagesFromBusiness,
  payloadFromForm,
} from '@/lib/organizations/profile'
import { useToast } from '@/hooks/use-toast'

/**
 * Business profile: one business at a time, as the mobile Edit Business (NEW-196). A host with
 * several businesses picks one in the strip; addresses and map locations belong to branches
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

const NO_IMAGES: BusinessImages = { logoUrl: null, coverImageUrl: null, gallery: [] }

export default function GymProfilePage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  // ?business=<id> from the Businesses page opens that business.
  const searchParams = useSearchParams()
  const [selectedId, setSelectedId] = useState<string | undefined>(() => searchParams?.get('business') ?? undefined)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [images, setImages] = useState<BusinessImages>(NO_IMAGES)
  const [galleryUploading, setGalleryUploading] = useState(false)

  const listingsQuery = useQuery({
    queryKey: ['host-businesses'],
    queryFn: () => hostApi.getBusinesses(),
  })
  // Every business can be edited, also one under review (it is how the host fixes it).
  const businesses = listingsQuery.data?.data ?? []
  const businessId = businesses.find((o) => o.id === selectedId)?.id ?? businesses[0]?.id

  const businessQuery = useQuery({
    queryKey: ['host-business', businessId],
    queryFn: () => hostApi.getBusiness(businessId as string),
    enabled: !!businessId,
  })
  const business = businessQuery.data?.data
  // The contact e-mail is only on the staff view of the business (contract v2 §3 BusinessProfile).
  const profileQuery = useQuery({
    queryKey: ['business-profile', businessId],
    queryFn: () => organizationsApi.getBusinessProfile(businessId as string),
    enabled: !!businessId,
  })
  const businessProfile = profileQuery.data?.data?.business

  const form = useForm<ProfileForm>({ resolver: zodResolver(profileSchema), defaultValues: EMPTY_FORM })

  useEffect(() => {
    if (!business) return
    form.reset(formFromBusiness(business, businessProfile))
    setImages(imagesFromBusiness(business))
    setLogoFile(null)
    setCoverFile(null)
  }, [business, businessProfile, form])

  const showError = (title: string, err: unknown) => {
    const { message, requestId } = resolveApiError(err)
    toast({ title, description: requestId ? `${message} (Reference: ${requestId})` : message, variant: 'destructive' })
  }

  const saveMutation = useMutation({
    mutationFn: async (values: ProfileForm) => {
      const id = businessId as string
      // New logo or cover: stored first, then saved on this business only.
      const upload = async (file: File) => {
        const [url] = await hostApi.uploadStagingImages([file])
        if (!url) throw new Error('The photo could not be uploaded. Please try again.')
        return url
      }
      const next: BusinessImages = {
        ...images,
        logoUrl: logoFile ? await upload(logoFile) : images.logoUrl,
        coverImageUrl: coverFile ? await upload(coverFile) : images.coverImageUrl,
      }
      await hostApi.updateBusiness(id, payloadFromForm(values, next))
      return next
    },
    onSuccess: (next) => {
      setImages(next)
      setLogoFile(null)
      setCoverFile(null)
      queryClient.invalidateQueries({ queryKey: ['host-business', businessId] })
      queryClient.invalidateQueries({ queryKey: ['business-profile', businessId] })
      queryClient.invalidateQueries({ queryKey: ['host-businesses'] })
      toast({ title: 'Saved', description: 'The business profile was updated.' })
    },
    onError: (err) => showError('Could not save the profile', err),
  })

  const addGalleryPhotos = async (files: File[]) => {
    if (files.length === 0) return
    setGalleryUploading(true)
    try {
      const urls = await hostApi.uploadStagingImages(files)
      setImages((prev) => ({ ...prev, gallery: [...prev.gallery, ...urls] }))
      toast({ title: 'Photos added', description: 'Save Changes to keep them on this business.' })
    } catch (err) {
      showError('Upload failed', err)
    } finally {
      setGalleryUploading(false)
    }
  }

  const removeGalleryPhoto = (url: string) =>
    setImages((prev) => ({ ...prev, gallery: prev.gallery.filter((u) => u !== url) }))

  const pick = (id: string) => {
    if (id === businessId) return
    setSelectedId(id)
  }

  const loadError = listingsQuery.error || businessQuery.error
  if (loadError) {
    return (
      <>
        <Header title="Business Profile" />
        <div className="p-6">
          <ErrorState
            error={loadError}
            what="the business profile"
            onRetry={() => (listingsQuery.error ? listingsQuery.refetch() : businessQuery.refetch())}
          />
        </div>
      </>
    )
  }

  const loading = listingsQuery.isLoading || (!!businessId && businessQuery.isLoading)
  if (loading) {
    return (
      <>
        <Header title="Business Profile" />
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

  if (!businessId || !business) {
    return (
      <>
        <Header title="Business Profile" />
        <div className="p-6">
          <EmptyState
            icon={Building2}
            title="No business yet"
            description="A business appears here once it is created. Add one from the Businesses page."
          />
        </div>
      </>
    )
  }

  const categories: string[] = [...BUSINESS_CATEGORIES]
  const currentCategory = form.watch('category')
  if (currentCategory && !categories.includes(currentCategory)) categories.push(currentCategory)

  return (
    <>
      <Header title="Business Profile" description="Manage each business's public information" />
      <div className="p-6 animate-fade-in">
        <PageHeader
          title="Business Profile"
          description="Update this business's details and branding"
          action={
            <Button onClick={form.handleSubmit((v) => saveMutation.mutate(v))} loading={saveMutation.isPending}>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          }
        />

        {businesses.length > 1 && (
          <BusinessStrip businesses={businesses} selectedId={businessId} onSelect={pick} />
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Logo</CardTitle>
              </CardHeader>
              <CardContent>
                <FileUpload
                  key={`logo-${businessId}`}
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
                  key={`cover-${businessId}`}
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
                  <span className="font-medium">{business.status || '—'}</span>
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
                          <FormLabel>Business name (shown to travellers) *</FormLabel>
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
                          <Textarea placeholder="Tell members about this business..." rows={4} {...field} />
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
