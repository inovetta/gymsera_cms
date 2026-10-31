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
import { OrganizationStrip } from '@/components/features/organization-strip'
import { BranchLimitDialog } from '@/components/features/branch-limit-dialog'
import { LastBranchDialog } from '@/components/features/last-branch-dialog'
import { ConfirmDialog } from '@/components/features/confirm-dialog'
import { NewOrganizationDialog } from '@/components/features/new-organization-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { hostApi, CreateHostBranchPayload, StorePlanNotice } from '@/lib/api/host'
import { DeleteBlocked, DeleteBlockedDialog, StorePlanNoticeDialog, deleteBlockedFrom } from '@/components/features/branch-lifecycle-dialogs'
import { invalidateBranchCapacity } from '@/hooks/use-branch-quota'
import { classifyBranchError } from '@/lib/branches/errors'
import { resolveApiError } from '@/lib/api/error-copy'
import { EmptyState } from '@/components/features/empty-state'
import { BranchLocationFields, BranchLocationValue, locationValid } from '@/components/features/places/branch-location-fields'
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
import { citiesApi, parseCities } from '@/lib/api/cities'
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
  // NEW-140: the Google place the address was picked from, and the names shown in the search fields
  googlePlaceId?: string
  cityName?: string
  areaName?: string
  status?: string
  initialPlanName?: string
  initialPlanPrice?: number
  initialPlanDuration?: string
}

const defaultForm = (): BranchFormState => ({
  branchName: '', address: '', cityId: 0, phone: '',
  openingTime: '06:00', closingTime: '22:00', facilities: [],
  // No plan is invented (NEW-146 / NEW-157 in the CMS): the host types the first plan.
  initialPlanName: '',
  initialPlanPrice: undefined,
  initialPlanDuration: 'MONTHLY',
})

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
              {/* P5b (R-81, NEW-167): paused by the host, hidden from travellers, nothing else changes. */}
              {paused && <Badge variant="outline" className="border-warning/50 bg-warning/10 text-warning">Paused</Badge>}
            </div>
            {paused && <p className="mt-1 text-xs text-muted-foreground">Hidden from travellers. Members, plans and history stay.</p>}
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
  const { isTenantOwner, organization } = useGymAccess()
  // Pause / resume: whoever may change the branch's settings (R-81 item 2).
  const canPauseBranch = (branchId: string) => {
    if (isTenantOwner) return true
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
  const rawListings = listingsQuery.data?.data ?? []
  const activeListings = rawListings.filter((l) => l.status?.toUpperCase() === 'ACTIVE')
  const displayListings = activeListings.length > 0 ? activeListings : rawListings
  const listingId =
    displayListings.find((l) => l.id === selectedListingId)?.id ?? displayListings[0]?.id

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
      latitude: v.latitude,
      longitude: v.longitude,
      googlePlaceId: v.googlePlaceId,
    }))
  // A new branch sells in its organization's currency (GLB-02: it inherits the first branch's).
  const planCurrency = (branchesData?.data?.branches ?? [])[0]?.currency ?? null

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
    onSuccess: (res) => {
      // P5b item 7: the organization went with its last branch, and the store plan still renews.
      if (res?.data?.storePlanNotice) setStoreNotice(res.data.storePlanNotice)
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
      toast({ title: res?.data?.organizationDeleted ? 'Branch and organization closed' : 'Branch closed' })
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
      googlePlaceId: branch.googlePlaceId ?? undefined,
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
    delete (payload as any).cityName
    delete (payload as any).areaName
    if (!payload.googlePlaceId) delete (payload as any).googlePlaceId
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
        ...(form.googlePlaceId ? { googlePlaceId: form.googlePlaceId } : {}),
        packages: [
          {
            name: form.initialPlanName.trim(),
            price: Number(form.initialPlanPrice),
            durationType: form.initialPlanDuration || 'MONTHLY',
            durationValue: form.initialPlanDuration === 'YEARLY' ? 12 : (form.initialPlanDuration === 'QUARTERLY' ? 3 : 1),
          },
        ],
      }
      setFormError(null)
      setLastCreate(hostPayload)
      createMutation.mutate(hostPayload)
    }
  }

  const branches = branchesData?.data?.branches ?? []
  const canSubmit = form.branchName.trim().length > 0 && locationValid(location) &&
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
          <OrganizationStrip listings={displayListings} selectedId={listingId} onSelect={setSelectedListingId} />
        )}

        {isTenantOwner && (
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
            action={isTenantOwner ? <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Branch</Button> : undefined}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {branches.map((branch) => (
              <BranchCard
                key={branch.id}
                branch={branch}
                onEdit={openEdit}
                onDeactivate={handleOpenDelete}
                canDelete={isTenantOwner}
                canPause={canPauseBranch(branch.id)}
                onTogglePause={(b) => pauseMutation.mutate({ branch: b, pause: !b.pausedAt })}
              />
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

            {/* Location: city, area and address from Google through our API (NEW-140) */}
            <BranchLocationFields
              value={location}
              onChange={setLocation}
              addressError={!editBranch && !form.address.trim() ? 'Address is required.' : null}
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
                    <Label htmlFor="initial-plan-name" className="mb-1 block text-xs">Plan Name *</Label>
                    <Input
                      id="initial-plan-name"
                      value={form.initialPlanName ?? ''}
                      onChange={(e) => setForm(p => ({ ...p, initialPlanName: e.target.value }))}
                      placeholder="e.g. Standard Monthly"
                      className="h-9 text-sm bg-background"
                    />
                  </div>
                  <div>
                    <Label htmlFor="initial-plan-price" className="mb-1 block text-xs">Price{planCurrency ? ` (${planCurrency})` : ''} *</Label>
                    <Input
                      id="initial-plan-price"
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
