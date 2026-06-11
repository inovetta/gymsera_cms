'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, ChevronDown, ChevronRight, MapPin, Edit, Trash2 } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { EmptyState } from '@/components/features/empty-state'
import { FileUpload } from '@/components/features/file-upload'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { citiesApi } from '@/lib/api/cities'
import { ConfirmDialog } from '@/components/features/confirm-dialog'
import { City, Area } from '@/types'
import { useToast } from '@/hooks/use-toast'

const citySchema = z.object({
  name: z.string().min(2, 'Name required'),
})

const areaSchema = z.object({
  name: z.string().min(2, 'Name required'),
})

type CityForm = z.infer<typeof citySchema>
type AreaForm = z.infer<typeof areaSchema>

function CityRow({ city }: { city: City }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [addAreaOpen, setAddAreaOpen] = useState(false)
  const [editArea, setEditArea] = useState<Area | null>(null)
  const [editCityOpen, setEditCityOpen] = useState(false)
  const [deleteCityDialog, setDeleteCityDialog] = useState(false)
  const [deleteAreaTarget, setDeleteAreaTarget] = useState<Area | null>(null)
  const [cityImageFile, setCityImageFile] = useState<File | null>(null)
  const [areaImageFile, setAreaImageFile] = useState<File | null>(null)

  const { data: areasData, isLoading: areasLoading } = useQuery({
    queryKey: ['areas', city.id],
    queryFn: () => citiesApi.getAreas(city.id),
    enabled: expanded,
  })

  const areaForm = useForm<AreaForm>({ resolver: zodResolver(areaSchema), defaultValues: { name: '' } })
  const cityEditForm = useForm<CityForm>({ resolver: zodResolver(citySchema), defaultValues: { name: city.name } })

  const createAreaMutation = useMutation({
    mutationFn: async (payload: AreaForm) => {
      const area = await citiesApi.createArea(city.id, { name: payload.name })
      if (areaImageFile && area.data?.id) {
        await citiesApi.uploadAreaImage(city.id, area.data.id, areaImageFile)
      }
      return area
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['areas', city.id] })
      setAddAreaOpen(false)
      areaForm.reset()
      setAreaImageFile(null)
      toast({ title: 'Area added' })
    },
    onError: () => toast({ title: 'Error', description: 'Failed to add area', variant: 'destructive' }),
  })

  const updateAreaMutation = useMutation({
    mutationFn: async ({ areaId, payload }: { areaId: number; payload: AreaForm }) => {
      const result = await citiesApi.updateArea(city.id, areaId, { name: payload.name })
      if (areaImageFile) {
        await citiesApi.uploadAreaImage(city.id, areaId, areaImageFile)
      }
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['areas', city.id] })
      setEditArea(null)
      setAddAreaOpen(false)
      areaForm.reset()
      setAreaImageFile(null)
      toast({ title: 'Area updated' })
    },
  })

  const updateCityMutation = useMutation({
    mutationFn: async (payload: CityForm) => {
      const result = await citiesApi.updateCity(city.id, { name: payload.name })
      if (cityImageFile) {
        await citiesApi.uploadCityImage(city.id, cityImageFile)
      }
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cities'] })
      setEditCityOpen(false)
      setCityImageFile(null)
      toast({ title: 'City updated' })
    },
  })

  const uploadCityImageMutation = useMutation({
    mutationFn: (file: File) => citiesApi.uploadCityImage(city.id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cities'] })
      toast({ title: 'City image updated' })
    },
    onError: () => toast({ title: 'Error', description: 'Failed to upload image', variant: 'destructive' }),
  })

  const deleteCityMutation = useMutation({
    mutationFn: () => citiesApi.deleteCity(city.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['cities'] }); toast({ title: 'City deleted' }) },
    onError: (err: any) => toast({ title: 'Cannot delete', description: err?.response?.data?.message ?? 'Failed to delete city', variant: 'destructive' }),
  })

  const deleteAreaMutation = useMutation({
    mutationFn: (areaId: number) => citiesApi.deleteArea(city.id, areaId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['areas', city.id] }); setDeleteAreaTarget(null); toast({ title: 'Area deleted' }) },
    onError: (err: any) => toast({ title: 'Cannot delete', description: err?.response?.data?.message ?? 'Failed to delete area', variant: 'destructive' }),
  })

  const openAddArea = () => {
    areaForm.reset({ name: '' })
    setEditArea(null)
    setAreaImageFile(null)
    setAddAreaOpen(true)
  }

  const openEditArea = (area: Area) => {
    setEditArea(area)
    areaForm.reset({ name: area.name })
    setAreaImageFile(null)
    setAddAreaOpen(true)
  }

  const onAreaSubmit = (values: AreaForm) => {
    if (editArea) {
      updateAreaMutation.mutate({ areaId: editArea.id, payload: values })
    } else {
      createAreaMutation.mutate(values)
    }
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          {city.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={city.imageUrl} alt={city.name} className="h-8 w-8 rounded-full object-cover border" />
          ) : (
            <MapPin className="h-4 w-4 text-primary" />
          )}
          <span className="font-medium">{city.name}</span>
          <Badge variant={city.isActive ? 'success' : 'secondary'} className="text-xs">
            {city.isActive ? 'Active' : 'Inactive'}
          </Badge>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <span className="text-sm text-muted-foreground">{areasData?.data?.areas?.length ?? 0} areas</span>
          <Button size="sm" variant="ghost" onClick={() => setEditCityOpen(true)}>
            <Edit className="h-3 w-3 mr-1" /> Edit
          </Button>
          <Button size="sm" variant="outline" onClick={openAddArea}>
            <Plus className="h-3 w-3 mr-1" /> Add Area
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => setDeleteCityDialog(true)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t bg-muted/30 p-4">
          {areasLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 rounded" />)}
            </div>
          ) : areasData?.data?.areas?.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No areas yet. Add the first area.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {areasData?.data?.areas?.map((area) => (
                <div key={area.id} className="flex items-center justify-between px-3 py-2 bg-background rounded-md border">
                  <div className="flex items-center gap-2 min-w-0">
                    {area.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={area.imageUrl} alt={area.name} className="h-6 w-6 rounded object-cover border shrink-0" />
                    )}
                    <span className="text-sm truncate">{area.name}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon-sm" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => openEditArea(area)}>
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button size="icon-sm" variant="ghost" className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => setDeleteAreaTarget(area)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete City */}
      <ConfirmDialog
        open={deleteCityDialog} onOpenChange={setDeleteCityDialog}
        title="Delete City" variant="destructive"
        description={`Permanently delete "${city.name}"? This cannot be undone. The city must have no areas.`}
        confirmLabel="Delete" onConfirm={() => deleteCityMutation.mutate()} loading={deleteCityMutation.isPending}
      />

      {/* Delete Area */}
      <ConfirmDialog
        open={!!deleteAreaTarget} onOpenChange={(o) => !o && setDeleteAreaTarget(null)}
        title="Delete Area" variant="destructive"
        description={`Permanently delete "${deleteAreaTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete" onConfirm={() => deleteAreaTarget && deleteAreaMutation.mutate(deleteAreaTarget.id)} loading={deleteAreaMutation.isPending}
      />

      {/* Edit City Dialog */}
      <Dialog open={editCityOpen} onOpenChange={setEditCityOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit {city.name}</DialogTitle>
          </DialogHeader>
          <Form {...cityEditForm}>
            <form onSubmit={cityEditForm.handleSubmit((v) => updateCityMutation.mutate(v))} className="space-y-4">
              <FormField control={cityEditForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>City Name *</FormLabel>
                  <FormControl><Input placeholder="Lahore, Karachi..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="space-y-2">
                <p className="text-sm font-medium">City Image</p>
                <FileUpload
                  label="Upload city image"
                  currentImageUrl={city.imageUrl ?? undefined}
                  onFileSelect={setCityImageFile}
                  maxSizeMB={5}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditCityOpen(false)}>Cancel</Button>
                <Button type="submit" loading={updateCityMutation.isPending}>Save</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Area Dialog */}
      <Dialog open={addAreaOpen} onOpenChange={(open) => { setAddAreaOpen(open); if (!open) { setEditArea(null); setAreaImageFile(null) } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editArea ? 'Edit Area' : `Add Area to ${city.name}`}</DialogTitle>
          </DialogHeader>
          <Form {...areaForm}>
            <form onSubmit={areaForm.handleSubmit(onAreaSubmit)} className="space-y-4">
              <FormField control={areaForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Area Name *</FormLabel>
                  <FormControl><Input placeholder="DHA Phase 5..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="space-y-2">
                <p className="text-sm font-medium">Area Image</p>
                <FileUpload
                  label="Upload area image"
                  currentImageUrl={editArea?.imageUrl ?? undefined}
                  onFileSelect={setAreaImageFile}
                  maxSizeMB={5}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAddAreaOpen(false)}>Cancel</Button>
                <Button type="submit" loading={createAreaMutation.isPending || updateAreaMutation.isPending}>
                  {editArea ? 'Save' : 'Add Area'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function CitiesPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [addCityOpen, setAddCityOpen] = useState(false)
  const [cityImageFile, setCityImageFile] = useState<File | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['cities'],
    queryFn: () => citiesApi.getCities(),
  })

  const cityForm = useForm<CityForm>({ resolver: zodResolver(citySchema), defaultValues: { name: '' } })

  const createCityMutation = useMutation({
    mutationFn: async (payload: CityForm) => {
      const city = await citiesApi.createCity({ name: payload.name })
      if (cityImageFile && city.data?.id) {
        await citiesApi.uploadCityImage(city.data.id, cityImageFile)
      }
      return city
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cities'] })
      setAddCityOpen(false)
      cityForm.reset()
      setCityImageFile(null)
      toast({ title: 'City added successfully' })
    },
    onError: () => toast({ title: 'Error', description: 'Failed to add city', variant: 'destructive' }),
  })

  const cities = data?.data ?? []

  return (
    <>
      <Header title="Cities & Areas" description="Manage geographic locations" />
      <div className="p-6 animate-fade-in">
        <PageHeader
          title="Cities & Areas"
          description="Manage cities and their sub-areas"
          action={
            <Button onClick={() => setAddCityOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add City
            </Button>
          }
        />

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : cities.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No cities yet"
            description="Add your first city to get started"
            action={<Button onClick={() => setAddCityOpen(true)}><Plus className="h-4 w-4 mr-2" />Add City</Button>}
          />
        ) : (
          <div className="space-y-3">
            {cities.map((city) => (
              <CityRow key={city.id} city={city} />
            ))}
          </div>
        )}
      </div>

      {/* Add City Dialog */}
      <Dialog open={addCityOpen} onOpenChange={(open) => { setAddCityOpen(open); if (!open) setCityImageFile(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add City</DialogTitle>
          </DialogHeader>
          <Form {...cityForm}>
            <form onSubmit={cityForm.handleSubmit((v) => createCityMutation.mutate(v))} className="space-y-4">
              <FormField control={cityForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>City Name *</FormLabel>
                  <FormControl><Input placeholder="Lahore, Karachi..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="space-y-2">
                <p className="text-sm font-medium">City Image <span className="text-muted-foreground text-xs">(optional)</span></p>
                <FileUpload
                  label="Upload city image"
                  onFileSelect={setCityImageFile}
                  maxSizeMB={5}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAddCityOpen(false)}>Cancel</Button>
                <Button type="submit" loading={createCityMutation.isPending}>Add City</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  )
}
