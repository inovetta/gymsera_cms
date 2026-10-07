'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, MapPin, Phone, Clock, MoreHorizontal } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { StatusBadge } from '@/components/features/status-badge'
import { DeleteBranchDialog } from '@/components/features/delete-branch-dialog'
import { CapacityBanner } from '@/components/features/capacity-banner'
import { OrganizationStrip } from '@/components/features/organization-strip'
import { BranchLimitDialog } from '@/components/features/branch-limit-dialog'
import { LastBranchDialog } from '@/components/features/last-branch-dialog'
import { ConfirmDialog } from '@/components/features/confirm-dialog'
import { NewOrganizationDialog } from '@/components/features/new-organization-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { hostApi, CreateHostBranchPayload } from '@/lib/api/host'
import { invalidateBranchCapacity } from '@/hooks/use-branch-quota'
import { classifyBranchError } from '@/lib/branches/errors'
import { resolveApiError } from '@/lib/api/error-copy'
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
import { useGymAccess } from '@/hooks/use-gym-access'

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
  initialPlanName?: string
  initialPlanPrice?: number
  initialPlanDuration?: string
}

const defaultForm = (): BranchFormState => ({
  branchName: '', address: '', cityId: 0, phone: '',
  openingTime: '06:00', closingTime: '22:00', facilities: [],
  initialPlanName: 'Standard Membership',
  initialPlanPrice: 5000,
  initialPlanDuration: 'MONTHLY',
})

function BranchCard({ branch, onEdit, onDeactivate, canDelete }: { branch: Branch; onEdit: (b: Branch) => void; onDeactivate: (b: Branch) => void; canDelete: boolean }) {
  const router = useRouter()
  const facilities = Array.isArray(branch.facilities)
    ? branch.facilities
    : Object.keys((branch.facilities as unknown as Record<string, boolean>) || {}).filter(k => (branch.facilities as unknown as Record<string, boolean>)[k])

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
              {canDelete && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(e) => { e.stopPropagation(); onDeactivate(branch) }}
                >
                  Deactivate
                </DropdownMenuItem>
              )}
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
  // The host console routes (capacity, add, delete, restore) are the owner's.
  const { isTenantOwner } = useGymAccess()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editBranch, setEditBranch] = useState<Branch | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<Branch | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [form, setForm] = useState<BranchFormState>(defaultForm())
  const [facilityInput, setFacilityInput] = useState('')
  const [selectedListingId, setSelectedListingId] = useState<string | undefined>()
  const [formError, setFormError] = useState<string | null>(null)
  const [limitBlock, setLimitBlock] = useState<{ message: string; isOverQuota: boolean } | null>(null)
  const [lastCreate, setLastCreate] = useState<CreateHostBranchPayload | null>(null)
  const [lastBranchPrompt, setLastBranchPrompt] = useState<{ id: string; branchName: string; password?: string; organizationName: string | null } | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<Branch | null>(null)
  const [restoreLimit, setRestoreLimit] = useState<{ message: string; isOverQuota: boolean } | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [newOrgOpen, setNewOrgOpen] = useState(false)

  // The owner works in the host console: the organizations strip and each organization's
  // branches (the mobile Gyms tab). Anyone else gets the branches they have a grant at.
  // Organization limit and the sequential-approval gate (mobile listings_overview_screen.dart).
  const orgQuotaQuery = useQuery({
    queryKey: ['organization-quota'],
    queryFn: () => hostApi.getOrganizationQuota(),
    enabled: isTenantOwner,
    retry: false,
  })
  const orgQuota = orgQuotaQuery.data?.data
  const canCreateOrganization = orgQuota?.canCreateNext ?? true
  const blockingStatus = orgQuota?.blockingListingStatus ?? null
  const orgBlockMessage = canCreateOrganization
    ? null
    : blockingStatus === 'DRAFT'
      ? 'Complete and submit your current organization before adding another.'
      : blockingStatus
        ? 'Your current organization must be approved before you can add another.'
        : 'You have reached the organization limit of your plan.'

  const listingsQuery = useQuery({
    queryKey: ['host-listings'],
    queryFn: () => hostApi.getListings(),
    enabled: isTenantOwner,
  })
  const activeListings = (listingsQuery.data?.data ?? []).filter((l) => l.status?.toUpperCase() === 'ACTIVE')
  const listingId =
    activeListings.find((l) => l.id === selectedListingId)?.id ?? activeListings[0]?.id

  const branchesQuery = useQuery({
    queryKey: ['branches', isTenantOwner ? `listing:${listingId ?? 'none'}` : 'scoped'],
    queryFn: async (): Promise<{ data?: { branches?: Branch[] } }> =>
      (isTenantOwner ? await hostApi.getListingBranches(listingId as string) : await gymApi.getBranches()) as unknown as {
        data?: { branches?: Branch[] }
      },
    enabled: isTenantOwner ? !!listingId : true,
  })
  const branchesData = branchesQuery.data
  // Deleted (INACTIVE) branches of the selected organization, for "restore a deleted branch".
  const deletedQuery = useQuery({
    queryKey: ['branches', `deleted:${listingId ?? 'none'}`],
    queryFn: () => hostApi.getListingBranches(listingId as string, true),
    enabled: isTenantOwner && !!listingId,
  })
  const deletedBranches = ((deletedQuery.data?.data?.branches ?? []) as unknown as Branch[]).filter(
    (b) => b.status?.toUpperCase() === 'INACTIVE'
  )

  const isLoading = isTenantOwner ? listingsQuery.isLoading || branchesQuery.isLoading : branchesQuery.isLoading

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

  // Attempt first: capacity is never checked before sending. The server's 403 is what opens
  // the upsell (mobile add_branch_screen.dart `_createBranchRequest` / `_buyCapacityForThisBranch`).
  const createMutation = useMutation({
    mutationFn: (payload: CreateHostBranchPayload) => hostApi.createBranch(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      queryClient.invalidateQueries({ queryKey: ['host-listings'] })
      queryClient.invalidateQueries({ queryKey: ['organization-quota'] })
      invalidateBranchCapacity(queryClient)
      setDialogOpen(false)
      setLimitBlock(null)
      setFormError(null)
      setForm(defaultForm())
      toast({ title: 'Branch created', description: 'New branch has been added successfully' })
    },
    onError: (err) => {
      const block = classifyBranchError(err)
      if (block.kind === 'limit' || block.kind === 'over_quota') {
        setLimitBlock({ message: block.message, isOverQuota: block.kind === 'over_quota' })
      } else {
        setFormError(block.message)
      }
    },
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

  // Delete = DELETE /host/branches/:id with the owner's credentials (re-auth). The server
  // answers 401 for wrong credentials and 409 `last_branch_in_organization` when this is the
  // organization's last branch; we ask first, then send again with the confirmation.
  const deleteMutation = useMutation({
    mutationFn: ({ id, password, confirmOrganizationDeletion }: { id: string; branchName: string; password?: string; confirmOrganizationDeletion?: boolean }) =>
      hostApi.deleteBranch(id, {
        ...(password ? { password } : {}),
        ...(confirmOrganizationDeletion ? { confirmOrganizationDeletion: true } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      queryClient.invalidateQueries({ queryKey: ['host-listings'] })
      queryClient.invalidateQueries({ queryKey: ['organization-quota'] })
      queryClient.invalidateQueries({ queryKey: ['members'] })
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      invalidateBranchCapacity(queryClient)
      setDeactivateTarget(null)
      setLastBranchPrompt(null)
      setDeleteError(null)
      toast({ title: 'Branch deleted', description: 'Branch and associated data have been removed.' })
    },
    onError: (err: any, vars) => {
      if (err?.response?.status === 409 && err?.response?.data?.code === 'last_branch_in_organization') {
        setDeactivateTarget(null)
        setLastBranchPrompt({
          id: vars.id,
          branchName: vars.branchName,
          password: vars.password,
          organizationName: err?.response?.data?.data?.organizationName ?? null,
        })
        return
      }
      const serverMessage =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        resolveApiError(err).message
      setLastBranchPrompt(null)
      setDeleteError(serverMessage)
      toast({ title: 'Error', description: serverMessage, variant: 'destructive' })
    },
  })

  // Restore = POST /host/branches/:id/restore; it uses one unit of capacity again (403 when none).
  const restoreMutation = useMutation({
    mutationFn: (branch: Branch) => hostApi.restoreBranch(branch.id),
    onSuccess: (_res, branch) => {
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      queryClient.invalidateQueries({ queryKey: ['host-listings'] })
      invalidateBranchCapacity(queryClient)
      setRestoreTarget(null)
      setRestoreLimit(null)
      setRestoreError(null)
      toast({ title: `Branch "${branch.branchName}" restored.` })
    },
    onError: (err) => {
      const block = classifyBranchError(err)
      if (block.kind === 'limit' || block.kind === 'over_quota') {
        setRestoreLimit({ message: block.message, isOverQuota: block.kind === 'over_quota' })
      } else {
        setRestoreLimit(null)
        setRestoreError(block.message)
        setRestoreTarget(null)
      }
    },
  })

  const openCreate = () => {
    setFormError(null)
    setEditBranch(null)
    setForm(defaultForm())
    setFacilityInput('')
    setDialogOpen(true)
  }

  const handleOpenDelete = (branch: Branch) => {
    setDeleteError(null)
    setDeactivateTarget(branch)
  }

  const openEdit = (branch: Branch) => {
    setEditBranch(branch)
    const facs = Array.isArray(branch.facilities)
      ? branch.facilities as string[]
      : Object.keys((branch.facilities as unknown as Record<string, boolean>) || {}).filter(k => (branch.facilities as unknown as Record<string, boolean>)[k])
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
      delete (payload as any).initialPlanName
      delete (payload as any).initialPlanPrice
      delete (payload as any).initialPlanDuration
      updateMutation.mutate({ id: editBranch.id, payload })
    } else {
      if (!form.initialPlanName?.trim() || !form.initialPlanPrice || form.initialPlanPrice <= 0) {
        toast({ title: 'Initial membership plan required', description: 'Every branch must have at least 1 membership plan.', variant: 'destructive' })
        return
      }
      // The body the mobile wizard sends to POST /host/branches, for the selected organization.
      const hostPayload: CreateHostBranchPayload = {
        branchName: form.branchName.trim(),
        ...(listingId ? { gymListingId: listingId } : {}),
        address: form.address.trim(),
        cityId: form.cityId,
        ...(form.areaId ? { areaId: form.areaId } : {}),
        ...(form.phone ? { phone: form.phone } : {}),
        openingTime: form.openingTime,
        closingTime: form.closingTime,
        facilitiesJson: form.facilities,
        ...(form.latitude ? { latitude: form.latitude } : {}),
        ...(form.longitude ? { longitude: form.longitude } : {}),
        packages: [
          {
            name: form.initialPlanName.trim(),
            price: Number(form.initialPlanPrice),
            durationType: form.initialPlanDuration || 'MONTHLY',
            durationValue: form.initialPlanDuration === 'YEARLY' ? 12 : (form.initialPlanDuration === 'QUARTERLY' ? 3 : 1),
            description: 'Standard access to branch facilities',
          },
        ],
      }
      setFormError(null)
      setLastCreate(hostPayload)
      createMutation.mutate(hostPayload)
    }
  }

  const branches = branchesData?.data?.branches ?? []
  const canSubmit = form.branchName.trim().length > 0 &&
    (!!editBranch || (form.cityId > 0 && form.address.trim().length > 0 && !!form.initialPlanName?.trim() && (form.initialPlanPrice ?? 0) > 0))

  return (
    <>
      <Header title="Branches" description="Manage your gym locations" />
      <div className="p-6 animate-fade-in">
        <PageHeader
          title="Branches"
          description={`${branches.length} branch${branches.length !== 1 ? 'es' : ''} total`}
          action={
            isTenantOwner ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" disabled={!canCreateOrganization} onClick={() => setNewOrgOpen(true)}>
                  New Organization
                </Button>
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Branch
                </Button>
              </div>
            ) : undefined
          }
        />

        {isTenantOwner && orgBlockMessage && (
          <p className="-mt-3 mb-4 text-right text-xs text-muted-foreground">{orgBlockMessage}</p>
        )}

        {isTenantOwner && (
          <OrganizationStrip listings={activeListings} selectedId={listingId} onSelect={setSelectedListingId} />
        )}

        {isTenantOwner && (
          <div className="mb-6">
            <CapacityBanner />
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
          </div>
        ) : branches.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No branches yet"
            description="Add your first gym branch to get started"
            action={isTenantOwner ? <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Branch</Button> : undefined}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {branches.map((branch) => (
              <BranchCard key={branch.id} branch={branch} onEdit={openEdit} onDeactivate={handleOpenDelete} canDelete={isTenantOwner} />
            ))}
          </div>
        )}
      </div>

      {isTenantOwner && deletedBranches.length > 0 && (
        <div className="px-6 pb-6">
          <h3 className="mb-3 text-base font-semibold">Deleted branches</h3>
          {restoreError && (
            <Alert variant="destructive" className="mb-3" data-testid="restore-error">
              <AlertDescription>{restoreError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            {deletedBranches.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
                <div>
                  <p className="font-medium">{b.branchName}</p>
                  <p className="text-xs text-muted-foreground">{b.address}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Restore ${b.branchName}`}
                  onClick={() => { setRestoreError(null); setRestoreTarget(b) }}
                >
                  Restore
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

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

            {/* Initial Membership Plan (Mandatory for new branch) */}
            {!editBranch && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-semibold text-primary">Initial Membership Plan *</Label>
                    <p className="text-xs text-muted-foreground">Every branch must have at least 1 plan. You can add more later.</p>
                  </div>
                  <Badge variant="outline" className="border-primary text-primary text-xs">Mandatory</Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="mb-1 block text-xs">Plan Name *</Label>
                    <Input
                      value={form.initialPlanName ?? ''}
                      onChange={(e) => setForm(p => ({ ...p, initialPlanName: e.target.value }))}
                      placeholder="e.g. Standard Monthly"
                      className="h-9 text-sm bg-background"
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">Price (PKR) *</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.initialPlanPrice ?? ''}
                      onChange={(e) => setForm(p => ({ ...p, initialPlanPrice: e.target.value ? Number(e.target.value) : undefined }))}
                      placeholder="e.g. 5000"
                      className="h-9 text-sm bg-background"
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">Duration</Label>
                    <Select
                      value={form.initialPlanDuration ?? 'MONTHLY'}
                      onValueChange={(v) => setForm(p => ({ ...p, initialPlanDuration: v }))}
                    >
                      <SelectTrigger className="h-9 text-sm bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MONTHLY">Monthly</SelectItem>
                        <SelectItem value="QUARTERLY">Quarterly (3 Mo)</SelectItem>
                        <SelectItem value="YEARLY">Yearly (12 Mo)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

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

          {formError && (
            <Alert variant="destructive" data-testid="branch-form-error">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

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

      <NewOrganizationDialog
        open={newOrgOpen}
        onOpenChange={setNewOrgOpen}
        onCreated={(id) => id && setSelectedListingId(id)}
      />

      <BranchLimitDialog
        open={!!limitBlock}
        branchName={form.branchName.trim()}
        message={limitBlock?.message ?? ''}
        isOverQuota={!!limitBlock?.isOverQuota}
        loading={createMutation.isPending}
        onTryAgain={() => lastCreate && createMutation.mutate(lastCreate)}
        onClose={() => setLimitBlock(null)}
      />

      <ConfirmDialog
        open={!!restoreTarget && !restoreLimit}
        onOpenChange={(open) => !open && setRestoreTarget(null)}
        title="Restore Branch?"
        description={`"${restoreTarget?.branchName ?? ''}" will reopen with its profile, photos, reviews and history intact. It uses one unit of your branch capacity again. Members and staff are not automatically restored — you'll need to re-add them.`}
        confirmLabel="Restore"
        variant="default"
        loading={restoreMutation.isPending}
        onConfirm={() => restoreTarget && restoreMutation.mutate(restoreTarget)}
      />

      <BranchLimitDialog
        open={!!restoreLimit}
        branchName={restoreTarget?.branchName ?? ''}
        message={restoreLimit?.message ?? ''}
        isOverQuota={!!restoreLimit?.isOverQuota}
        loading={restoreMutation.isPending}
        onTryAgain={() => restoreTarget && restoreMutation.mutate(restoreTarget)}
        onClose={() => { setRestoreLimit(null); setRestoreTarget(null) }}
      />

      <LastBranchDialog
        open={!!lastBranchPrompt}
        branchName={lastBranchPrompt?.branchName ?? ''}
        organizationName={lastBranchPrompt?.organizationName}
        actionLabel="Delete anyway"
        loading={deleteMutation.isPending}
        onCancel={() => setLastBranchPrompt(null)}
        onConfirm={() =>
          lastBranchPrompt &&
          deleteMutation.mutate({
            id: lastBranchPrompt.id,
            branchName: lastBranchPrompt.branchName,
            password: lastBranchPrompt.password,
            confirmOrganizationDeletion: true,
          })
        }
      />

      <DeleteBranchDialog
        open={!!deactivateTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeactivateTarget(null)
            setDeleteError(null)
          }
        }}
        branchName={deactivateTarget?.branchName}
        onConfirm={(password) => {
          if (deactivateTarget) {
            deleteMutation.mutate({ id: deactivateTarget.id, branchName: deactivateTarget.branchName, password })
          }
        }}
        loading={deleteMutation.isPending}
        error={deleteError}
      />
    </>
  )
}
