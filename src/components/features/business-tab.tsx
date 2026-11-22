'use client'

import { PendingAreaNote } from '@/components/features/areas/pending-area-note'
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
import { adminApi, AdminBusiness, UpdateBusinessPayload, CreateBusinessPayload } from '@/lib/api/admin'
import { citiesApi, parseCities } from '@/lib/api/cities'
import { useToast } from '@/hooks/use-toast'
import { StatusBadge } from './status-badge'

const BUSINESS_FACILITIES: { key: string; label: string }[] = [
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
  organizationId: string
  /** The one business this tab edits (contract v2: one businessId, no compound ids, F7). */
  businessId: string | null
  /** Default name for a business the admin creates. */
  defaultName: string
}

export function BusinessTab({ organizationId, businessId, defaultName }: Props) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const logoInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const imagesInputRef = useRef<HTMLInputElement>(null)

  const [editing, setEditing] = useState(false)
  const [createDialog, setCreateDialog] = useState(false)
  const [form, setForm] = useState<UpdateBusinessPayload>({})
  const [createForm, setCreateForm] = useState<CreateBusinessPayload>({
    name: defaultName,
    genderType: 'MIXED',
  })

  const { data, isLoading } = useQuery({
    queryKey: ['admin-business', businessId],
    queryFn: () => adminApi.getBusiness(businessId as string),
    enabled: !!businessId,
  })

  const { data: citiesData } = useQuery({
    queryKey: ['cities'],
    queryFn: () => citiesApi.getCities(),
  })

  const business: AdminBusiness | undefined = data?.data?.business
  const cities = parseCities(citiesData?.data)
  const selectedCity = cities.find((c: any) => c.id === (editing ? form.cityId : business?.cityId))
  const areas: any[] = selectedCity?.areas ?? []

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-business', businessId] })
    queryClient.invalidateQueries({ queryKey: ['organization', organizationId] })
  }

  const startEditing = () => {
    if (!business) return
    setForm({
      name: business.name,
      description: business.description ?? undefined,
      genderType: business.genderType,
      contactPhone: business.contactPhone ?? undefined,
      website: business.website ?? undefined,
      facilitiesJson: business.facilitiesJson ?? {},
      isFeatured: business.isFeatured,
      status: business.status,
      latitude: business.latitude ? Number(business.latitude) : undefined,
      longitude: business.longitude ? Number(business.longitude) : undefined,
      cityId: business.cityId,
      areaId: business.areaId ?? null,
    })
    setEditing(true)
  }

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateBusinessPayload) => adminApi.updateBusiness(businessId as string, payload),
    onSuccess: () => { invalidate(); setEditing(false); toast({ title: 'Business updated' }) },
    onError: () => toast({ title: 'Error', description: 'Failed to update business', variant: 'destructive' }),
  })

  const createMutation = useMutation({
    mutationFn: (payload: CreateBusinessPayload) => adminApi.createBusiness(organizationId, payload),
    onSuccess: () => { invalidate(); setCreateDialog(false); toast({ title: 'Business created' }) },
    onError: () => toast({ title: 'Error', description: 'Failed to create business', variant: 'destructive' }),
  })

  const uploadLogoMutation = useMutation({
    mutationFn: (file: File) => adminApi.uploadBusinessLogo(businessId as string, file),
    onSuccess: () => { invalidate(); toast({ title: 'Logo uploaded' }) },
    onError: () => toast({ title: 'Error', description: 'Failed to upload logo', variant: 'destructive' }),
  })

  const uploadCoverMutation = useMutation({
    mutationFn: (file: File) => adminApi.uploadBusinessCover(businessId as string, file),
    onSuccess: () => { invalidate(); toast({ title: 'Cover image uploaded' }) },
    onError: () => toast({ title: 'Error', description: 'Failed to upload cover', variant: 'destructive' }),
  })

  const uploadImagesMutation = useMutation({
    mutationFn: (files: File[]) => adminApi.uploadBusinessImages(businessId as string, files),
    onSuccess: () => { invalidate(); toast({ title: 'Images uploaded' }) },
    onError: () => toast({ title: 'Error', description: 'Failed to upload images', variant: 'destructive' }),
  })

  const deleteImageMutation = useMutation({
    mutationFn: (imageUrl: string) => adminApi.deleteBusinessImage(businessId as string, imageUrl),
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

  if (!businessId) {
    return (
      <Card>
        <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Globe className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold text-lg">No business yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create a business so travellers can find it on GymsEra.</p>
          </div>
          <Button onClick={() => setCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" /> Create Business
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

  if (!business) return null

  const activeFacilities = Object.entries(business.facilitiesJson ?? {}).filter(([, v]) => v).map(([k]) => k)

  return (
    <div className="space-y-6">
      {/* Header card: cover + logo + quick stats */}
      <Card className="overflow-hidden">
        {/* Cover */}
        <div className="relative h-44 bg-gradient-to-br from-slate-700 to-slate-900">
          {business.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.coverImageUrl} alt="Cover" className="w-full h-full object-cover" />
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
                {business.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={business.logoUrl} alt="Logo" className="w-full h-full object-contain" />
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
                <h3 className="font-bold text-lg leading-tight">{business.name}</h3>
                <StatusBadge status={business.status} />
                {business.isFeatured && <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">Featured</Badge>}
              </div>
              <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 text-amber-500" />{(Number(business.averageRating) || 0).toFixed(1)}</span>
                <span className="capitalize">{business.genderType?.replace('_', ' ').toLowerCase()}</span>
                {business.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{business.area?.name ? `${business.area.name}, ` : ''}{business.city.name}</span>}
                <PendingAreaNote pendingArea={business.pendingArea} />
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
            <CardTitle className="text-base">Edit Business</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}><X className="h-4 w-4 mr-1" />Cancel</Button>
              <Button size="sm" onClick={() => updateMutation.mutate(form)} loading={updateMutation.isPending}><Save className="h-4 w-4 mr-1" />Save</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label className="mb-2 block">Title *</Label>
                <Input value={form.name ?? ''} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Business name" />
              </div>
              <div className="sm:col-span-2">
                <Label className="mb-2 block">Short Description</Label>
                <Textarea value={form.description ?? ''} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Brief description shown on cards" rows={2} />
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
                  <p className="text-sm font-medium">Featured business</p>
                  <p className="text-xs text-muted-foreground">Show this gym in featured sections</p>
                </div>
                <Switch checked={form.isFeatured ?? false} onCheckedChange={(v) => setForm((p) => ({ ...p, isFeatured: v }))} />
              </div>
            </div>

            <div>
              <Label className="mb-3 block">Facilities</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {BUSINESS_FACILITIES.map(({ key, label }) => {
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
            <CardHeader><CardTitle className="text-base">Business details</CardTitle></CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                {business.description && (
                  <div><dt className="text-muted-foreground mb-1">Description</dt><dd className="leading-relaxed">{business.description}</dd></div>
                )}
                {business.contactPhone && (
                  <div className="flex justify-between"><dt className="text-muted-foreground flex items-center gap-1"><Phone className="h-3.5 w-3.5" />Phone</dt><dd className="font-medium">{business.contactPhone}</dd></div>
                )}
                {business.website && (
                  <div className="flex justify-between items-center"><dt className="text-muted-foreground flex items-center gap-1"><Globe className="h-3.5 w-3.5" />Website</dt><dd><a href={business.website} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate max-w-[160px] block">{business.website}</a></dd></div>
                )}
                {(business.latitude || business.longitude) && (
                  <div className="flex justify-between"><dt className="text-muted-foreground flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />Coordinates</dt><dd className="font-medium font-mono text-xs">{business.latitude}, {business.longitude}</dd></div>
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
                    const label = BUSINESS_FACILITIES.find((f) => f.key === key)?.label ?? key
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
          {business.imagesJson && business.imagesJson.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {business.imagesJson.map((url, i) => (
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
                <p className="text-xs text-muted-foreground mt-1">Upload images to showcase the gym on the public business</p>
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

      {/* Create business dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create Business</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Title *</Label>
              <Input value={createForm.name} onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))} placeholder="Business name" />
            </div>
            <div>
              <Label className="mb-2 block">Short Description</Label>
              <Textarea value={createForm.description ?? ''} onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))} placeholder="Brief description" rows={2} />
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
            <Button onClick={() => createMutation.mutate(createForm)} loading={createMutation.isPending} disabled={!createForm.name}>Create Business</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
