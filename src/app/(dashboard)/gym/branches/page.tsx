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
import { BillingNotices } from '@/components/features/billing-notices'
import { BusinessStrip } from '@/components/features/business-strip'
import { visibleBusinesses } from '@/lib/organizations/profile'
import { BranchLimitDialog } from '@/components/features/branch-limit-dialog'
import { LastBranchDialog } from '@/components/features/last-branch-dialog'
import { ConfirmDialog } from '@/components/features/confirm-dialog'
import { AddBranchDialog } from '@/components/features/branches/add-branch-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { hostApi, StorePlanNotice } from '@/lib/api/host'
import { DeleteBlocked, DeleteBlockedDialog, StorePlanNoticeDialog, deleteBlockedFrom } from '@/components/features/branch-lifecycle-dialogs'
import { invalidateBranchCapacity } from '@/hooks/use-branch-quota'
import { classifyBranchError } from '@/lib/branches/errors'
import { resolveApiError } from '@/lib/api/error-copy'
import { EmptyState } from '@/components/features/empty-state'
import { BranchLocationFields, BranchLocationValue, locationValid, areaPayload, pendingAreaValue } from '@/components/features/places/branch-location-fields'
import { Button, buttonVariants } from '@/components/ui/button'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { organizationsApi } from '@/lib/api/organizations'
import { citiesApi, parseCities } from '@/lib/api/cities'
import { Branch } from '@/types'
import { useToast } from '@/hooks/use-toast'
import { useGymAccess } from '@/hooks/use-gym-access'
import { branchStates } from '@/lib/branches/states'

const COMMON_FACILITIES = [
  'AC', 'Wi-Fi', 'Parking', 'Lockers', 'Showers', 'Pool', 'Sauna', 'Café',
  'Personal Training', 'MMA', 'Boxing', 'Wrestling', 'Yoga', 'Zumba', 'Pilates', 'Spa',
]

interface BranchFormState {
  branchName: string
  address: string
  cityId: number
  areaId?: number
  // NEW-265: a typed area waiting for review (sent as areaRequestId instead of areaId).
  areaRequestId?: number
  areaStatus?: 'pending_review' | 'rejected'
  areaRejectReason?: string | null
  phone: string
  openingTime: string
  closingTime: string
  facilities: string[]
  latitude?: number
  longitude?: number
  // NEW-140: the Google place the address was picked from, and the names shown in the search fields
  googlePlaceId?: string
  cityName?: string
  areaName?: string
  }

const defaultForm = (): BranchFormState => ({
  branchName: '', address: '', cityId: 0, phone: '',
  openingTime: '06:00', closingTime: '22:00', facilities: [],
})

const STATE_CLASS: Record<string, string> = {
  ok: 'border-success/50 bg-success/10 text-success',
  warning: 'border-warning/50 bg-warning/10 text-warning',
  danger: 'border-destructive/50 bg-destructive/10 text-destructive',
  info: 'border-primary/40 bg-primary/10 text-primary',
}

function BranchCard({ branch, onEdit, onDeactivate, canDelete, canPause, onTogglePause }: {
  branch: Branch
  onEdit: (b: Branch) => void
  onDeactivate: (b: Branch) => void
  canDelete: boolean
  canPause: boolean
  onTogglePause: (b: Branch) => void
}) {
  const router = useRouter()
  const paused = !!branch.pausedAt
  // P9b item 4: paused, locked, in review or hidden by GymsEra, each with why (one rule, lib/branches/states).
  const states = branchStates(branch)
  const facilities = Array.isArray(branch.facilities)
    ? branch.facilities
    : Object.keys((branch.facilities as unknown as Record<string, boolean>) || {}).filter(k => (branch.facilities as unknown as Record<string, boolean>)[k])

  return (
    <Card data-testid={`branch-card-${branch.id}`} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push(`/gym/branches/${branch.id}`)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold text-lg">{branch.branchName}</h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={branch.status} />
              {states.map((s) => (
                <Badge key={s.key} variant="outline" className={STATE_CLASS[s.tone]}>{s.label}</Badge>
              ))}
            </div>
            {states.filter((s) => s.reason).map((s) => (
              <p key={s.key} className="mt-1 text-xs text-muted-foreground">{s.reason}</p>
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(branch) }}>Edit Branch</DropdownMenuItem>
              {canPause && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onTogglePause(branch) }}>
                  {paused ? 'Resume' : 'Pause'}
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(e) => { e.stopPropagation(); onDeactivate(branch) }}
                >
                  Delete branch
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
  const { isOrganizationOwner, organization } = useGymAccess()
  // Pause / resume: whoever may change the branch's settings (R-81 item 2).
  const canPauseBranch = (branchId: string) => {
    if (isOrganizationOwner) return true
    const perms = [...(organization?.orgPermissions ?? []), ...(organization?.branches?.find((b) => b.id === branchId)?.permissions ?? [])]
    return perms.includes('*') || perms.includes('branch.settings')
  }
  const [deleteBlocked, setDeleteBlocked] = useState<DeleteBlocked | null>(null)
  const [storeNotice, setStoreNotice] = useState<StorePlanNotice | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editBranch, setEditBranch] = useState<Branch | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<Branch | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [form, setForm] = useState<BranchFormState>(defaultForm())
  const [facilityInput, setFacilityInput] = useState('')
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | undefined>()
  const [formError, setFormError] = useState<string | null>(null)
  const [lastBranchPrompt, setLastBranchPrompt] = useState<{ id: string; branchName: string; password?: string; businessName: string | null } | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<Branch | null>(null)
  const [restoreLimit, setRestoreLimit] = useState<{ message: string; isOverQuota: boolean } | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [addBranchOpen, setAddBranchOpen] = useState(false)

  // The owner works in the host console: the organizations strip and each organization's
  // branches (the mobile Gyms tab). Anyone else gets the branches they have a grant at.
  const listingsQuery = useQuery({
    queryKey: ['host-businesses'],
    queryFn: () => hostApi.getBusinesses(),
    enabled: isOrganizationOwner,
  })
  const displayBusinesses = visibleBusinesses(listingsQuery.data?.data ?? [])
  const businessId =
    displayBusinesses.find((l) => l.id === selectedBusinessId)?.id ?? displayBusinesses[0]?.id

  const branchesQuery = useQuery({
    queryKey: ['branches', isOrganizationOwner ? `business:${businessId ?? 'none'}` : 'scoped'],
    queryFn: async (): Promise<{ data?: { branches?: Branch[] } }> =>
      (isOrganizationOwner ? await hostApi.getBusinessBranches(businessId as string) : await organizationsApi.getBranches()) as unknown as {
        data?: { branches?: Branch[] }
      },
    enabled: isOrganizationOwner ? !!businessId : true,
  })
  const branchesData = branchesQuery.data
  // Deleted (INACTIVE) branches of the selected organization, for "restore a deleted branch".
  const deletedQuery = useQuery({
    queryKey: ['branches', `deleted:${businessId ?? 'none'}`],
    queryFn: () => hostApi.getBusinessBranches(businessId as string, true),
    enabled: isOrganizationOwner && !!businessId,
  })
  const deletedBranches = ((deletedQuery.data?.data?.branches ?? []) as unknown as Branch[]).filter(
    (b) => b.status?.toUpperCase() === 'INACTIVE'
  )

  const isLoading = isOrganizationOwner ? listingsQuery.isLoading || branchesQuery.isLoading : branchesQuery.isLoading

  const { data: citiesData } = useQuery({
    queryKey: ['cities'],
    queryFn: () => citiesApi.getCities(),
  })

  // Names for an existing branch's saved city and area (a new pick carries its own names).
  const { data: areasData } = useQuery({
    queryKey: ['areas', form.cityId],
    queryFn: () => citiesApi.getAreas(form.cityId),
    enabled: !!editBranch && form.cityId > 0 && !!form.areaId && !form.areaName,
  })

  const cities = parseCities(citiesData?.data)
  const areas = areasData?.data?.areas ?? []
  const location: BranchLocationValue = {
    address: form.address,
    cityId: form.cityId || undefined,
    cityName: form.cityName ?? cities.find((c: any) => c.id === form.cityId)?.name,
    areaId: form.areaId,
    areaName: form.areaName ?? areas.find((a: any) => a.id === form.areaId)?.name,
    areaRequestId: form.areaRequestId,
    areaStatus: form.areaStatus,
    areaRejectReason: form.areaRejectReason,
    latitude: form.latitude,
    longitude: form.longitude,
    googlePlaceId: form.googlePlaceId,
  }
  const setLocation = (v: BranchLocationValue) =>
    setForm((p) => ({
      ...p,
      address: v.address,
      cityId: v.cityId ?? 0,
      cityName: v.cityName,
      areaId: v.areaId,
      areaName: v.areaName,
      areaRequestId: v.areaRequestId,
      areaStatus: v.areaStatus,
      areaRejectReason: v.areaRejectReason,
      latitude: v.latitude,
      longitude: v.longitude,
      googlePlaceId: v.googlePlaceId,
    }))
  // A new branch sells in its organization's currency (GLB-02: it inherits the first branch's).
  const planCurrency = (branchesData?.data?.branches ?? [])[0]?.currency ?? null

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<BranchFormState> }) =>
      organizationsApi.updateBranch(id, payload as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      setDialogOpen(false)
      setEditBranch(null)
      toast({ title: 'Branch updated' })
    },
    onError: () => toast({ title: 'Error', description: 'Failed to update branch', variant: 'destructive' }),
  })

  // Delete = DELETE /host/branches/:id with the owner's credentials (re-auth). The server
  // answers 401 for wrong credentials and 409 `last_branch_in_business` when this is the
  // business's last branch; we ask first, then send again with the confirmation.
  const deleteMutation = useMutation({
    mutationFn: ({ id, password, confirmBusinessDeletion }: { id: string; branchName: string; password?: string; confirmBusinessDeletion?: boolean }) =>
      hostApi.deleteBranch(id, {
        ...(password ? { password } : {}),
        ...(confirmBusinessDeletion ? { confirmBusinessDeletion: true } : {}),
      }),
    onSuccess: (res) => {
      // P5b item 7: the organization went with its last branch, and the store plan still renews.
      if (res?.data?.storePlanNotice) setStoreNotice(res.data.storePlanNotice)
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      queryClient.invalidateQueries({ queryKey: ['host-businesses'] })
      queryClient.invalidateQueries({ queryKey: ['business-quota'] })
      queryClient.invalidateQueries({ queryKey: ['members'] })
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      invalidateBranchCapacity(queryClient)
      setDeactivateTarget(null)
      setLastBranchPrompt(null)
      setDeleteError(null)
      toast({ title: res?.data?.businessDeleted ? 'Branch and business closed' : 'Branch closed' })
    },
    onError: (err: any, vars) => {
      // P5b item 3: open members, bookings or payments: say why and offer to pause instead.
      const blocked = deleteBlockedFrom(err)
      if (blocked) {
        setDeactivateTarget(null)
        setLastBranchPrompt(null)
        setDeleteError(null)
        setDeleteBlocked({ ...blocked, branchId: blocked.branchId ?? vars.id })
        return
      }
      if (err?.response?.status === 409 && err?.response?.data?.code === 'last_branch_in_business') {
        setDeactivateTarget(null)
        setLastBranchPrompt({
          id: vars.id,
          branchName: vars.branchName,
          password: vars.password,
          businessName: err?.response?.data?.data?.businessName ?? null,
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

  // Pause / resume (P5b item 2): hidden from travellers or shown again; nothing else changes.
  const pauseMutation = useMutation({
    mutationFn: ({ branch, pause }: { branch: Pick<Branch, 'id' | 'branchName'>; pause: boolean }) =>
      pause ? hostApi.pauseBranch(branch.id) : hostApi.resumeBranch(branch.id),
    onSuccess: (_res, { branch, pause }) => {
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      setDeleteBlocked(null)
      toast({
        title: pause ? `"${branch.branchName}" is paused. Travellers no longer see it.` : `"${branch.branchName}" is visible to travellers again.`,
      })
    },
    onError: (err) => toast({ title: 'Error', description: resolveApiError(err).message, variant: 'destructive' }),
  })

  // Restore = POST /host/branches/:id/restore; it uses one unit of capacity again (403 when none).
  const restoreMutation = useMutation({
    mutationFn: (branch: Branch) => hostApi.restoreBranch(branch.id),
    onSuccess: (_res, branch) => {
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      queryClient.invalidateQueries({ queryKey: ['host-businesses'] })
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

  // Add Branch is the shared dialog (business picker, area, hours, photos, first plan: D8).
  const openCreate = () => setAddBranchOpen(true)

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
      googlePlaceId: branch.googlePlaceId ?? undefined,
      // NEW-265: a branch waiting on an area request shows it "(under review)".
      ...pendingAreaValue(branch.pendingArea),
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
    if (!form.branchName.trim()) {
      toast({ title: 'Please fill in required fields', variant: 'destructive' })
      return
    }
    const payload = { ...form }
    delete (payload as any).cityName
    delete (payload as any).areaName
    // NEW-265: the area request or the area, never both (areaPayload).
    delete (payload as any).areaId
    delete (payload as any).areaRequestId
    delete (payload as any).areaStatus
    delete (payload as any).areaRejectReason
    Object.assign(payload, areaPayload(location))
    if (!payload.googlePlaceId) delete (payload as any).googlePlaceId
    if (!payload.cityId) delete (payload as any).cityId
    if (!payload.areaId) delete (payload as any).areaId
    if (!payload.latitude) delete (payload as any).latitude
    if (!payload.longitude) delete (payload as any).longitude

    if (!editBranch) return
    updateMutation.mutate({ id: editBranch.id, payload })
  }

  const branches = branchesData?.data?.branches ?? []
  const canSubmit = !!editBranch && form.branchName.trim().length > 0 && locationValid(location)

  return (
    <>
      <Header title="Branches" description="Manage your gym locations" />
      <div className="p-6 animate-fade-in">
        <PageHeader
          title="Branches"
          description={`${branches.length} branch${branches.length !== 1 ? 'es' : ''} total`}
          action={
            isOrganizationOwner ? (
              <div className="flex items-center gap-2">
                <Link href="/gym/businesses" className={buttonVariants({ variant: 'outline' })}>Businesses</Link>
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Branch
                </Button>
              </div>
            ) : undefined
          }
        />

        {isOrganizationOwner && (
          <BusinessStrip businesses={displayBusinesses} selectedId={businessId} onSelect={setSelectedBusinessId} />
        )}

        {isOrganizationOwner && (
          <div className="mb-6 space-y-3">
            <BillingNotices />
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
            action={isOrganizationOwner ? <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Branch</Button> : undefined}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {branches.map((branch) => (
              <BranchCard
                key={branch.id}
                branch={branch}
                onEdit={openEdit}
                onDeactivate={handleOpenDelete}
                canDelete={isOrganizationOwner}
                canPause={canPauseBranch(branch.id)}
                onTogglePause={(b) => pauseMutation.mutate({ branch: b, pause: !b.pausedAt })}
              />
            ))}
          </div>
        )}
      </div>

      {isOrganizationOwner && deletedBranches.length > 0 && (
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
            <DialogTitle>Edit Branch</DialogTitle>
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

            {/* Location: city, area and address from Google through our API (NEW-140) */}
            <BranchLocationFields
              value={location}
              onChange={setLocation}
              allowAreaRequests
              
            />

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

            {/* NEW-193: no Status select. The API refuses a status change here (branch_status_immutable_here);
                a branch is paused / resumed or deleted / restored from the card, which also settle capacity. */}
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
              loading={updateMutation.isPending}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteBlockedDialog
        blocked={deleteBlocked}
        pausing={pauseMutation.isPending}
        onPause={() => {
          const id = deleteBlocked?.branchId
          const b = branches.find((x) => x.id === id)
          if (id) pauseMutation.mutate({ branch: { id, branchName: b?.branchName ?? 'This branch' }, pause: true })
        }}
        onClose={() => setDeleteBlocked(null)}
      />
      <StorePlanNoticeDialog notice={storeNotice} onClose={() => setStoreNotice(null)} />

      <AddBranchDialog
        open={addBranchOpen}
        onOpenChange={setAddBranchOpen}
        businesses={listingsQuery.data?.data ?? []}
        defaultBusinessId={businessId}
        currency={planCurrency}
        onCreated={(id) => {
          setSelectedBusinessId(id)
          toast({ title: 'Branch created', description: 'New branch has been added successfully' })
        }}
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
        businessName={lastBranchPrompt?.businessName}
        actionLabel="Delete anyway"
        loading={deleteMutation.isPending}
        onCancel={() => setLastBranchPrompt(null)}
        onConfirm={() =>
          lastBranchPrompt &&
          deleteMutation.mutate({
            id: lastBranchPrompt.id,
            branchName: lastBranchPrompt.branchName,
            password: lastBranchPrompt.password,
            confirmBusinessDeletion: true,
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
