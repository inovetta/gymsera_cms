'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Camera, Edit2, Save, X, Plus, Trash2, Upload, Globe, Phone, MapPin,
  Star, ImageIcon, Loader2, CheckCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { adminApi, GymListingDetail, UpdateGymListingPayload, CreateGymListingPayload } from '@/lib/api/admin'
import { citiesApi } from '@/lib/api/cities'
import { useToast } from '@/hooks/use-toast'
import { StatusBadge } from './status-badge'

const GYM_FACILITIES: { key: string; label: string }[] = [
  { key: 'ac', label: 'Air Conditioning' },
  { key: 'wifi', label: 'Wi-Fi' },
  { key: 'parking', label: 'Parking' },
  { key: 'locker', label: 'Lockers' },
  { key: 'shower', label: 'Showers' },
  { key: 'pool', label: 'Swimming Pool' },
  { key: 'sauna', label: 'Sauna' },
  { key: 'cafe', label: 'Café' },
  { key: 'personalTraining', label: 'Personal Training' },
  { key: 'mma', label: 'MMA' },
  { key: 'boxing', label: 'Boxing' },
  { key: 'wrestling', label: 'Wrestling' },
  { key: 'yoga', label: 'Yoga' },
  { key: 'zumba', label: 'Zumba' },
  { key: 'pilates', label: 'Pilates' },
  { key: 'spa', label: 'Spa' },
]

interface Props {
  tenantId: string
  hasListing: boolean
  tenantName: string
}

export function GymListingTab({ tenantId, hasListing, tenantName }: Props) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const logoInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const imagesInputRef = useRef<HTMLInputElement>(null)

  const [editing, setEditing] = useState(false)
  const [createDialog, setCreateDialog] = useState(false)
  const [form, setForm] = useState<UpdateGymListingPayload>({})
  const [createForm, setCreateForm] = useState<CreateGymListingPayload>({
    title: tenantName,
    genderType: 'MIXED',
  })

  const { data, isLoading } = useQuery({
    queryKey: ['admin-gym-listing', tenantId],
    queryFn: () => adminApi.getGymListing(tenantId),
    enabled: hasListing,
  })

  const { data: citiesData } = useQuery({
    queryKey: ['cities'],
    queryFn: () => citiesApi.getCities(),
  })

  const listing: GymListingDetail | undefined = data?.data?.gymListing
  const cities = Array.isArray(citiesData?.data) ? (citiesData.data as any[]) : []
  const selectedCity = cities.find((c: any) => c.id === (editing ? form.cityId : listing?.cityId))
  const areas: any[] = selectedCity?.areas ?? []

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-gym-listing', tenantId] })
    queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] })
  }

  const startEditing = () => {
    if (!listing) return
    setForm({
      title: listing.title,
      shortDescription: listing.shortDescription,
      genderType: listing.genderType,
      contactPhone: listing.contactPhone,
      website: listing.website,
      facilitiesJson: listing.facilitiesJson ?? {},
      isFeatured: listing.isFeatured,
      status: listing.status,
      latitude: listing.latitude ? Number(listing.latitude) : undefined,
      longitude: listing.longitude ? Number(listing.longitude) : undefined,
      cityId: listing.cityId,
      areaId: listing.areaId ?? null,
    })
    setEditing(true)
  }

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateGymListingPayload) => adminApi.updateGymListing(tenantId, payload),
    onSuccess: () => { invalidate(); setEditing(false); toast({ title: 'Gym listing updated' }) },
    onError: () => toast({ title: 'Error', description: 'Failed to update gym listing', variant: 'destructive' }),
  })

  const createMutation = useMutation({
    mutationFn: (payload: CreateGymListingPayload) => adminApi.createGymListing(tenantId, payload),
    onSuccess: () => { invalidate(); setCreateDialog(false); toast({ title: 'Gym listing created' }) },
    onError: () => toast({ title: 'Error', description: 'Failed to create gym listing', variant: 'destructive' }),
  })

  const uploadLogoMutation = useMutation({
    mutationFn: (file: File) => adminApi.uploadGymListingLogo(tenantId, file),
    onSuccess: () => { invalidate(); toast({ title: 'Logo uploaded' }) },
    onError: () => toast({ title: 'Error', description: 'Failed to upload logo', variant: 'destructive' }),
  })

  const uploadCoverMutation = useMutation({
    mutationFn: (file: File) => adminApi.uploadGymListingCover(tenantId, file),
    onSuccess: () => { invalidate(); toast({ title: 'Cover image uploaded' }) },
    onError: () => toast({ title: 'Error', description: 'Failed to upload cover', variant: 'destructive' }),
  })

  const uploadImagesMutation = useMutation({
    mutationFn: (files: File[]) => adminApi.uploadGymListingImages(tenantId, files),
    onSuccess: () => { invalidate(); toast({ title: 'Images uploaded' }) },
    onError: () => toast({ title: 'Error', description: 'Failed to upload images', variant: 'destructive' }),
  })

  const deleteImageMutation = useMutation({
    mutationFn: (imageUrl: string) => adminApi.deleteGymListingImage(tenantId, imageUrl),
    onSuccess: () => { invalidate(); toast({ title: 'Image removed' }) },
    onError: () => toast({ title: 'Error', description: 'Failed to remove image', variant: 'destructive' }),
  })

  const toggleFacility = (key: string) => {
    setForm((prev) => ({
      ...prev,
      facilitiesJson: {
        ...(prev.facilitiesJson ?? {}),
        [key]: !(prev.facilitiesJson ?? {})[key],
      },
    }))
  }

  if (!hasListing) {
    return (
      <Card>
        <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Globe className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold text-lg">No public gym listing yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create a listing so members can find this gym on the platform.</p>
          </div>
          <Button onClick={() => setCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" /> Create Gym Listing
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 rounded-xl" />
        <div className="grid sm:grid-cols-2 gap-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    )
  }

  if (!listing) return null

  const activeFacilities = Object.entries(listing.facilitiesJson ?? {}).filter(([, v]) => v).map(([k]) => k)

  return (
    <div className="space-y-6">
      {/* Header card: cover + logo + quick stats */}
      <Card className="overflow-hidden">
        {/* Cover */}
        <div className="relative h-44 bg-gradient-to-br from-slate-700 to-slate-900">
          {listing.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={listing.coverImageUrl} alt="Cover" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="h-10 w-10 text-white/20" />
            </div>
          )}
          <button
            onClick={() => coverInputRef.current?.click()}
            disabled={uploadCoverMutation.isPending}
            className="absolute bottom-3 right-3 h-8 w-8 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
            title="Upload cover image"
          >
            {uploadCoverMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          </button>
        </div>

        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            {/* Logo */}
            <div className="relative shrink-0 -mt-12">
              <div className="w-20 h-20 rounded-xl border-4 border-background bg-muted shadow-md overflow-hidden flex items-center justify-center">
                {listing.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={listing.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <Globe className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <button
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadLogoMutation.isPending}
                className="absolute -bottom-1 -right-1 h-7 w-7 flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow hover:bg-primary/90"
                title="Upload logo"
              >
                {uploadLogoMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              </button>
            </div>

            <div className="flex-1 min-w-0 mt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-lg leading-tight">{listing.title}</h3>
                <StatusBadge status={listing.status} />
                {listing.isFeatured && <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">Featured</Badge>}
              </div>
              <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 text-amber-500" />{(Number(listing.averageRating) || 0).toFixed(1)}</span>
                <span className="capitalize">{listing.genderType?.replace('_', ' ').toLowerCase()}</span>
                {listing.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{listing.area?.name ? `${listing.area.name}, ` : ''}{listing.city.name}</span>}
              </div>
            </div>

            {!editing && (
              <Button variant="outline" size="sm" onClick={startEditing} className="shrink-0">
                <Edit2 className="h-4 w-4 mr-1.5" /> Edit
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit form or details */}
      {editing ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Edit Gym Listing</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}><X className="h-4 w-4 mr-1" />Cancel</Button>
              <Button size="sm" onClick={() => updateMutation.mutate(form)} loading={updateMutation.isPending}><Save className="h-4 w-4 mr-1" />Save</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label className="mb-2 block">Title *</Label>
                <Input value={form.title ?? ''} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Gym listing title" />
              </div>
              <div className="sm:col-span-2">
                <Label className="mb-2 block">Short Description</Label>
                <Textarea value={form.shortDescription ?? ''} onChange={(e) => setForm((p) => ({ ...p, shortDescription: e.target.value }))} placeholder="Brief description shown on cards" rows={2} />
              </div>
              <div>
                <Label className="mb-2 block">Gender Type</Label>
                <Select value={form.genderType ?? ''} onValueChange={(v) => setForm((p) => ({ ...p, genderType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MIXED">Mixed</SelectItem>
                    <SelectItem value="MALE">Male Only</SelectItem>
                    <SelectItem value="FEMALE">Female Only</SelectItem>
                    <SelectItem value="FEMALE_ONLY">Female Only (legacy)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block">Status</Label>
                <Select value={form.status ?? ''} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                    <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block">Contact Phone</Label>
                <Input value={form.contactPhone ?? ''} onChange={(e) => setForm((p) => ({ ...p, contactPhone: e.target.value }))} placeholder="+92..." />
              </div>
              <div>
                <Label className="mb-2 block">Website</Label>
                <Input value={form.website ?? ''} onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))} placeholder="https://..." />
              </div>
              <div>
                <Label className="mb-2 block">City</Label>
                <Select value={String(form.cityId ?? '')} onValueChange={(v) => setForm((p) => ({ ...p, cityId: Number(v), areaId: null }))}>
                  <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
                  <SelectContent>
                    {cities.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block">Area</Label>
                <Select value={String(form.areaId ?? '')} onValueChange={(v) => setForm((p) => ({ ...p, areaId: v ? Number(v) : null }))} disabled={!areas.length}>
                  <SelectTrigger><SelectValue placeholder={areas.length ? 'Select area' : 'Select city first'} /></SelectTrigger>
                  <SelectContent>
                    {areas.map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block">Latitude</Label>
                <Input type="number" step="any" value={form.latitude ?? ''} onChange={(e) => setForm((p) => ({ ...p, latitude: e.target.value ? Number(e.target.value) : undefined }))} placeholder="e.g. 31.4150" />
              </div>
              <div>
                <Label className="mb-2 block">Longitude</Label>
                <Input type="number" step="any" value={form.longitude ?? ''} onChange={(e) => setForm((p) => ({ ...p, longitude: e.target.value ? Number(e.target.value) : undefined }))} placeholder="e.g. 73.0740" />
              </div>
              <div className="sm:col-span-2 flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Featured listing</p>
                  <p className="text-xs text-muted-foreground">Show this gym in featured sections</p>
                </div>
                <Switch checked={form.isFeatured ?? false} onCheckedChange={(v) => setForm((p) => ({ ...p, isFeatured: v }))} />
              </div>
            </div>

            <div>
              <Label className="mb-3 block">Facilities</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {GYM_FACILITIES.map(({ key, label }) => {
                  const active = !!(form.facilitiesJson ?? {})[key]
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleFacility(key)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${active ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-muted-foreground/40'}`}
                    >
                      <CheckCircle className={`h-4 w-4 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground/30'}`} />
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-6">
          {/* Details */}
          <Card>
            <CardHeader><CardTitle className="text-base">Listing Details</CardTitle></CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                {listing.shortDescription && (
                  <div><dt className="text-muted-foreground mb-1">Description</dt><dd className="leading-relaxed">{listing.shortDescription}</dd></div>
                )}
                {listing.contactPhone && (
                  <div className="flex justify-between"><dt className="text-muted-foreground flex items-center gap-1"><Phone className="h-3.5 w-3.5" />Phone</dt><dd className="font-medium">{listing.contactPhone}</dd></div>
                )}
                {listing.website && (
                  <div className="flex justify-between items-center"><dt className="text-muted-foreground flex items-center gap-1"><Globe className="h-3.5 w-3.5" />Website</dt><dd><a href={listing.website} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate max-w-[160px] block">{listing.website}</a></dd></div>
                )}
                {(listing.latitude || listing.longitude) && (
                  <div className="flex justify-between"><dt className="text-muted-foreground flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />Coordinates</dt><dd className="font-medium font-mono text-xs">{listing.latitude}, {listing.longitude}</dd></div>
                )}
              </dl>
            </CardContent>
          </Card>

          {/* Facilities */}
          <Card>
            <CardHeader><CardTitle className="text-base">Facilities</CardTitle></CardHeader>
            <CardContent>
              {activeFacilities.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {activeFacilities.map((key) => {
                    const label = GYM_FACILITIES.find((f) => f.key === key)?.label ?? key
                    return (
                      <Badge key={key} variant="secondary" className="gap-1">
                        <CheckCircle className="h-3 w-3 text-success" />
                        {label}
                      </Badge>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No facilities listed.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Gallery */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Gallery Images</CardTitle>
          <Button variant="outline" size="sm" onClick={() => imagesInputRef.current?.click()} disabled={uploadImagesMutation.isPending}>
            {uploadImagesMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            Upload Images
          </Button>
        </CardHeader>
        <CardContent>
          {listing.imagesJson && listing.imagesJson.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {listing.imagesJson.map((url, i) => (
                <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Gallery ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => deleteImageMutation.mutate(url)}
                    className="absolute top-1.5 right-1.5 h-7 w-7 flex items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                    title="Remove image"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="border-2 border-dashed border-muted-foreground/20 rounded-xl py-12 flex flex-col items-center gap-3 text-center">
              <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
              <div>
                <p className="text-sm font-medium">No gallery images</p>
                <p className="text-xs text-muted-foreground mt-1">Upload images to showcase the gym on the public listing</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => imagesInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> Upload
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hidden file inputs */}
      <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogoMutation.mutate(f); e.target.value = '' }} />
      <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCoverMutation.mutate(f); e.target.value = '' }} />
      <input ref={imagesInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) uploadImagesMutation.mutate(files); e.target.value = '' }} />

      {/* Create listing dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create Gym Listing</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Title *</Label>
              <Input value={createForm.title} onChange={(e) => setCreateForm((p) => ({ ...p, title: e.target.value }))} placeholder="Public listing title" />
            </div>
            <div>
              <Label className="mb-2 block">Short Description</Label>
              <Textarea value={createForm.shortDescription ?? ''} onChange={(e) => setCreateForm((p) => ({ ...p, shortDescription: e.target.value }))} placeholder="Brief description" rows={2} />
            </div>
            <div>
              <Label className="mb-2 block">Gender Type</Label>
              <Select value={createForm.genderType} onValueChange={(v) => setCreateForm((p) => ({ ...p, genderType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MIXED">Mixed</SelectItem>
                  <SelectItem value="MALE">Male Only</SelectItem>
                  <SelectItem value="FEMALE">Female Only</SelectItem>
                  <SelectItem value="FEMALE_ONLY">Female Only (legacy)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block">Contact Phone</Label>
              <Input value={createForm.contactPhone ?? ''} onChange={(e) => setCreateForm((p) => ({ ...p, contactPhone: e.target.value }))} placeholder="+92..." />
            </div>
            <div>
              <Label className="mb-2 block">City</Label>
              <Select value={String(createForm.cityId ?? '')} onValueChange={(v) => setCreateForm((p) => ({ ...p, cityId: Number(v), areaId: undefined }))}>
                <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
                <SelectContent>
                  {cities.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate(createForm)} loading={createMutation.isPending} disabled={!createForm.title}>Create Listing</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
