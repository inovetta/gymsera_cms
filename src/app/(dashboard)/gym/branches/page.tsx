'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, MapPin, Phone, Clock, MoreHorizontal } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { StatusBadge } from '@/components/features/status-badge'
import { ConfirmDialog } from '@/components/features/confirm-dialog'
import { EmptyState } from '@/components/features/empty-state'
import { MapPicker } from '@/components/features/map-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { gymApi } from '@/lib/api/gym'
import { citiesApi } from '@/lib/api/cities'
import { Branch } from '@/types'
import { useToast } from '@/hooks/use-toast'

const COMMON_FACILITIES = [
  'AC', 'Wi-Fi', 'Parking', 'Lockers', 'Showers', 'Pool', 'Sauna', 'Café',
  'Personal Training', 'MMA', 'Boxing', 'Wrestling', 'Yoga', 'Zumba', 'Pilates', 'Spa',
]

interface BranchFormState {
  branchName: string
  address: string
  cityId: number
  areaId?: number
  phone: string
  openingTime: string
  closingTime: string
  facilities: string[]
  latitude?: number
  longitude?: number
  status?: string
}

const defaultForm = (): BranchFormState => ({
  branchName: '', address: '', cityId: 0, phone: '',
  openingTime: '06:00', closingTime: '22:00', facilities: [],
})

function BranchCard({ branch, onEdit, onDeactivate }: { branch: Branch; onEdit: (b: Branch) => void; onDeactivate: (b: Branch) => void }) {
  const router = useRouter()
  const facilities = Array.isArray(branch.facilities)
    ? branch.facilities
    : Object.keys((branch.facilities as Record<string, boolean>) || {}).filter(k => (branch.facilities as Record<string, boolean>)[k])

  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push(`/gym/branches/${branch.id}`)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold text-lg">{branch.branchName}</h3>
            <StatusBadge status={branch.status} />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(branch) }}>Edit Branch</DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => { e.stopPropagation(); onDeactivate(branch) }}
              >
                Deactivate
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="space-y-2 text-sm text-muted-foreground">
          {branch.address && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="truncate">{branch.address}</span>
            </div>
          )}
          {branch.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 shrink-0" />
              <span>{branch.phone}</span>
            </div>
          )}
          {(branch.openingTime || branch.closingTime) && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0" />
              <span>{branch.openingTime} – {branch.closingTime}</span>
            </div>
          )}
        </div>

        {facilities.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1">
            {facilities.slice(0, 3).map((f) => (
              <span key={f} className="text-xs bg-secondary px-2 py-0.5 rounded-full">{f}</span>
            ))}
            {facilities.length > 3 && (
              <span className="text-xs bg-secondary px-2 py-0.5 rounded-full">+{facilities.length - 3} more</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function BranchesPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editBranch, setEditBranch] = useState<Branch | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<Branch | null>(null)
  const [form, setForm] = useState<BranchFormState>(defaultForm())
  const [facilityInput, setFacilityInput] = useState('')

  const { data: branchesData, isLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: () => gymApi.getBranches(),
  })

  const { data: citiesData } = useQuery({
    queryKey: ['cities'],
    queryFn: () => citiesApi.getCities(),
  })

  const { data: areasData } = useQuery({
    queryKey: ['areas', form.cityId],
    queryFn: () => citiesApi.getAreas(form.cityId),
    enabled: form.cityId > 0,
  })

  const cities = (citiesData?.data as any) ?? []
  const areas = areasData?.data?.areas ?? []

  const createMutation = useMutation({
    mutationFn: (payload: BranchFormState) => gymApi.createBranch(payload as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      setDialogOpen(false)
      setForm(defaultForm())
      toast({ title: 'Branch created', description: 'New branch has been added successfully' })
    },
    onError: () => toast({ title: 'Error', description: 'Failed to create branch', variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<BranchFormState> }) =>
      gymApi.updateBranch(id, payload as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      setDialogOpen(false)
      setEditBranch(null)
      toast({ title: 'Branch updated' })
    },
    onError: () => toast({ title: 'Error', description: 'Failed to update branch', variant: 'destructive' }),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => gymApi.updateBranch(id, { status: 'INACTIVE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      setDeactivateTarget(null)
      toast({ title: 'Branch deactivated' })
    },
  })

  const openCreate = () => {
    setEditBranch(null)
    setForm(defaultForm())
    setFacilityInput('')
    setDialogOpen(true)
  }

  const openEdit = (branch: Branch) => {
    setEditBranch(branch)
    const facs = Array.isArray(branch.facilities)
      ? branch.facilities as string[]
      : Object.keys((branch.facilities as Record<string, boolean>) || {}).filter(k => (branch.facilities as Record<string, boolean>)[k])
    setForm({
      branchName: branch.branchName,
      address: branch.address,
      cityId: branch.cityId ?? 0,
      areaId: branch.areaId ?? undefined,
      phone: branch.phone ?? '',
      openingTime: branch.openingTime ?? '06:00',
      closingTime: branch.closingTime ?? '22:00',
      facilities: facs,
      latitude: branch.latitude ? Number(branch.latitude) : undefined,
      longitude: branch.longitude ? Number(branch.longitude) : undefined,
      status: branch.status,
    })
    setFacilityInput('')
    setDialogOpen(true)
  }

  const addFacility = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed || form.facilities.includes(trimmed)) return
    setForm(p => ({ ...p, facilities: [...p.facilities, trimmed] }))
    setFacilityInput('')
  }

  const removeFacility = (name: string) => {
    setForm(p => ({ ...p, facilities: p.facilities.filter(f => f !== name) }))
  }

  const onSubmit = () => {
    if (!form.branchName.trim() || (!editBranch && (!form.cityId || !form.address.trim()))) {
      toast({ title: 'Please fill in required fields', variant: 'destructive' })
      return
    }
    const payload = { ...form }
    if (!payload.cityId) delete (payload as any).cityId
    if (!payload.areaId) delete (payload as any).areaId
    if (!payload.latitude) delete (payload as any).latitude
    if (!payload.longitude) delete (payload as any).longitude

    if (editBranch) {
      updateMutation.mutate({ id: editBranch.id, payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const branches = branchesData?.data?.branches ?? []
  const canSubmit = form.branchName.trim().length > 0 && (!!editBranch || (form.cityId > 0 && form.address.trim().length > 0))

  return (
    <>
      <Header title="Branches" description="Manage your gym locations" />
      <div className="p-6 animate-fade-in">
        <PageHeader
          title="Branches"
          description={`${branches.length} branch${branches.length !== 1 ? 'es' : ''} total`}
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Branch
            </Button>
          }
        />

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
          </div>
        ) : branches.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No branches yet"
            description="Add your first gym branch to get started"
            action={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Branch</Button>}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {branches.map((branch) => (
              <BranchCard key={branch.id} branch={branch} onEdit={openEdit} onDeactivate={setDeactivateTarget} />
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editBranch ? 'Edit Branch' : 'Add New Branch'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Name */}
            <div>
              <Label className="mb-2 block">Branch Name *</Label>
              <Input
                value={form.branchName}
                onChange={(e) => setForm(p => ({ ...p, branchName: e.target.value }))}
                placeholder="e.g. Main Branch, Gulberg Branch"
              />
            </div>

            {/* Address */}
            <div>
              <Label className="mb-2 block">Address {!editBranch && '*'}</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm(p => ({ ...p, address: e.target.value }))}
                placeholder="Street address, Building no."
              />
            </div>

            {/* City + Area */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-2 block">City {!editBranch && '*'}</Label>
                <Select
                  value={form.cityId ? String(form.cityId) : ''}
                  onValueChange={(v) => setForm(p => ({ ...p, cityId: Number(v), areaId: undefined }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
                  <SelectContent>
                    {cities.map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block">Area</Label>
                <Select
                  value={form.areaId ? String(form.areaId) : ''}
                  onValueChange={(v) => setForm(p => ({ ...p, areaId: v ? Number(v) : undefined }))}
                  disabled={!areas.length}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={form.cityId > 0 ? (areas.length ? 'Select area' : 'No areas') : 'Select city first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {areas.map((a: any) => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Phone */}
            <div>
              <Label className="mb-2 block">Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))}
                placeholder="+92 300 0000000"
              />
            </div>

            {/* Times */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-2 block">Opening Time</Label>
                <Input type="time" value={form.openingTime} onChange={(e) => setForm(p => ({ ...p, openingTime: e.target.value }))} />
              </div>
              <div>
                <Label className="mb-2 block">Closing Time</Label>
                <Input type="time" value={form.closingTime} onChange={(e) => setForm(p => ({ ...p, closingTime: e.target.value }))} />
              </div>
            </div>

            {/* Location Map */}
            <div>
              <Label className="mb-2 block">Location on Map</Label>
              <MapPicker
                latitude={form.latitude ?? null}
                longitude={form.longitude ?? null}
                onChange={(lat, lng) => setForm(p => ({ ...p, latitude: lat, longitude: lng }))}
              />
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">Latitude</Label>
                  <Input
                    type="number" step="any"
                    value={form.latitude ?? ''}
                    onChange={(e) => setForm(p => ({ ...p, latitude: e.target.value ? Number(e.target.value) : undefined }))}
                    placeholder="e.g. 31.5204"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">Longitude</Label>
                  <Input
                    type="number" step="any"
                    value={form.longitude ?? ''}
                    onChange={(e) => setForm(p => ({ ...p, longitude: e.target.value ? Number(e.target.value) : undefined }))}
                    placeholder="e.g. 74.3587"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Facilities */}
            <div>
              <Label className="mb-2 block">Facilities</Label>
              {form.facilities.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {form.facilities.map((f) => (
                    <Badge key={f} variant="secondary" className="gap-1 pr-1">
                      {f}
                      <button onClick={() => removeFacility(f)} className="hover:text-destructive ml-0.5">×</button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {COMMON_FACILITIES.filter(f => !form.facilities.includes(f)).map((f) => (
                  <button
                    key={f}
                    onClick={() => addFacility(f)}
                    className="text-xs px-2 py-1 rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    + {f}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={facilityInput}
                  onChange={(e) => setFacilityInput(e.target.value)}
                  placeholder="Custom facility..."
                  className="h-8 text-sm"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFacility(facilityInput) } }}
                />
                <Button variant="outline" size="sm" onClick={() => addFacility(facilityInput)} disabled={!facilityInput.trim()}>Add</Button>
              </div>
            </div>

            {/* Status (edit only) */}
            {editBranch && (
              <div>
                <Label className="mb-2 block">Status</Label>
                <Select value={form.status ?? 'ACTIVE'} onValueChange={(v) => setForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={onSubmit}
              disabled={!canSubmit}
              loading={createMutation.isPending || updateMutation.isPending}
            >
              {editBranch ? 'Save Changes' : 'Create Branch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deactivateTarget}
        onOpenChange={(open) => !open && setDeactivateTarget(null)}
        title="Deactivate Branch"
        description={`Are you sure you want to deactivate "${deactivateTarget?.branchName}"?`}
        confirmLabel="Deactivate"
        onConfirm={() => deactivateTarget && deactivateMutation.mutate(deactivateTarget.id)}
        loading={deactivateMutation.isPending}
      />
    </>
  )
}
