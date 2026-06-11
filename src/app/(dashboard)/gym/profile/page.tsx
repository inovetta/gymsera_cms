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
import { MapPicker } from '@/components/features/map-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { gymApi } from '@/lib/api/gym'
import { useToast } from '@/hooks/use-toast'

const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  genderType: z.enum(['MALE', 'FEMALE', 'MIXED']),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
})

type ProfileForm = z.infer<typeof profileSchema>

export default function GymProfilePage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [newGalleryFiles, setNewGalleryFiles] = useState<File[]>([])
  const [galleryUploading, setGalleryUploading] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['gym-profile'],
    queryFn: () => gymApi.getGymProfile(),
  })

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: '',
      description: '',
      genderType: 'MIXED',
      phone: '',
      email: '',
      address: '',
      latitude: undefined,
      longitude: undefined,
    },
  })

  useEffect(() => {
    if (data?.data?.gym) {
      const gym = data.data.gym
      form.reset({
        name: gym.name || '',
        description: gym.description || '',
        genderType: gym.genderType || 'MIXED',
        phone: gym.phone || '',
        email: gym.email || '',
        address: gym.address || '',
        latitude: gym.latitude ? Number(gym.latitude) : undefined,
        longitude: gym.longitude ? Number(gym.longitude) : undefined,
      })
    }
  }, [data, form])

  const updateMutation = useMutation({
    mutationFn: (payload: ProfileForm) => gymApi.updateGymProfile(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gym-profile'] })
      toast({ title: 'Success', description: 'Gym profile updated successfully', variant: 'default' })
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update gym profile', variant: 'destructive' })
    },
  })

  const logoMutation = useMutation({
    mutationFn: (file: File) => gymApi.uploadGymLogo(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gym-profile'] })
      toast({ title: 'Logo updated successfully' })
    },
  })

  const coverMutation = useMutation({
    mutationFn: (file: File) => gymApi.uploadGymCover(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gym-profile'] })
      toast({ title: 'Cover image updated successfully' })
    },
  })

  const deleteGymImageMutation = useMutation({
    mutationFn: (imageUrl: string) => gymApi.deleteGymImage(imageUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gym-profile'] })
      toast({ title: 'Image removed' })
    },
  })

  const onSubmit = async (values: ProfileForm) => {
    await updateMutation.mutateAsync(values)
    if (logoFile) await logoMutation.mutateAsync(logoFile)
    if (coverFile) await coverMutation.mutateAsync(coverFile)
    if (newGalleryFiles.length > 0) {
      setGalleryUploading(true)
      try {
        await gymApi.uploadGymImages(newGalleryFiles)
        setNewGalleryFiles([])
        queryClient.invalidateQueries({ queryKey: ['gym-profile'] })
        toast({ title: 'Gallery images uploaded' })
      } finally {
        setGalleryUploading(false)
      }
    }
  }

  const handleGalleryFilesSelected = async (files: File[]) => {
    setGalleryUploading(true)
    try {
      await gymApi.uploadGymImages(files)
      queryClient.invalidateQueries({ queryKey: ['gym-profile'] })
      toast({ title: `${files.length} image${files.length > 1 ? 's' : ''} uploaded` })
    } catch {
      toast({ title: 'Upload failed', variant: 'destructive' })
    } finally {
      setGalleryUploading(false)
    }
  }

  if (isLoading) {
    return (
      <>
        <Header title="Gym Profile" />
        <div className="p-6 space-y-6">
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

  return (
    <>
      <Header title="Gym Profile" description="Manage your gym's public information" />
      <div className="p-6 animate-fade-in">
        <PageHeader
          title="Gym Profile"
          description="Update your gym details and branding"
          action={
            <Button
              onClick={form.handleSubmit(onSubmit)}
              loading={updateMutation.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          }
        />

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Logo Upload */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Gym Logo</CardTitle>
              </CardHeader>
              <CardContent>
                <FileUpload
                  onFileSelect={setLogoFile}
                  currentImageUrl={data?.data?.gym?.logoUrl}
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
                  onFileSelect={setCoverFile}
                  currentImageUrl={data?.data?.gym?.coverImageUrl}
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
                  existingUrls={Array.isArray(data?.data?.gym?.imagesJson) ? data.data.gym.imagesJson : []}
                  onFilesSelected={handleGalleryFilesSelected}
                  onRemoveExisting={(url) => deleteGymImageMutation.mutate(url)}
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
                  <span className="font-medium">{data?.data?.gym?.status || 'N/A'}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Form */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Business Details</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gym Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="My Awesome Gym" {...field} />
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
                          <FormLabel>Gender Type *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select gender type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="MALE">Male Only</SelectItem>
                              <SelectItem value="FEMALE">Female Only</SelectItem>
                              <SelectItem value="MIXED">Mixed (Co-ed)</SelectItem>
                            </SelectContent>
                          </Select>
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
                          <Textarea
                            placeholder="Tell members about your gym..."
                            rows={4}
                            {...field}
                          />
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
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <Input placeholder="+92 300 0000000" {...field} />
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
                          <FormLabel>Business Email</FormLabel>
                          <FormControl>
                            <Input placeholder="gym@example.com" type="email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Full address..." rows={2} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Map location picker */}
                  <div>
                    <p className="text-sm font-medium mb-2">Location on Map</p>
                    <MapPicker
                      latitude={form.watch('latitude') ?? null}
                      longitude={form.watch('longitude') ?? null}
                      onChange={(lat, lng) => {
                        form.setValue('latitude', lat, { shouldDirty: true })
                        form.setValue('longitude', lng, { shouldDirty: true })
                      }}
                    />
                    <div className="grid grid-cols-2 gap-3 mt-2">
                      <FormField
                        control={form.control}
                        name="latitude"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">Latitude</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="any"
                                placeholder="e.g. 31.5204"
                                className="h-8 text-sm"
                                value={field.value ?? ''}
                                onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="longitude"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">Longitude</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="any"
                                placeholder="e.g. 74.3587"
                                className="h-8 text-sm"
                                value={field.value ?? ''}
                                onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button type="submit" loading={updateMutation.isPending}>
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
