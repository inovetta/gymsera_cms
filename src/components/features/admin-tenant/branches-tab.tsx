'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Clock, GitBranch, History, Plus, ToggleLeft, ToggleRight } from 'lucide-react'
import { StatusBadge } from '@/components/features/status-badge'
import { ErrorState } from '@/components/features/error-state'
import { BranchFormDialog } from '@/components/features/branch-form-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { adminApi, TenantBranch, CreateTenantBranchPayload, UpdateTenantBranchPayload } from '@/lib/api/admin'
import { citiesApi, parseCities } from '@/lib/api/cities'
import { useToast } from '@/hooks/use-toast'
import type { Tenant } from '@/types'

/** Branches of one tenant, with traveler visibility controls. Mounted only while its tab is open (PERF-10). */
export function BranchesTab({ tenant, tenantId }: { tenant: Tenant; tenantId: string }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [deactivateBranchDialog, setDeactivateBranchDialog] = useState<{ open: boolean; branchId: string }>({ open: false, branchId: '' })
  const [deactivateBranchReason, setDeactivateBranchReason] = useState('')
  const [historyDialog, setHistoryDialog] = useState<{ open: boolean; branchId: string; branchName: string }>({ open: false, branchId: '', branchName: '' })
  const [branchDialog, setBranchDialog] = useState<{ open: boolean; mode: 'create' | 'edit'; branch?: TenantBranch }>({ open: false, mode: 'create' })

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['admin-branch-visibility-history', historyDialog.branchId],
    queryFn: () => adminApi.getBranchVisibilityHistory(historyDialog.branchId),
    enabled: historyDialog.open && !!historyDialog.branchId,
  })

  const { data: branchesData, isLoading: branchesLoading, error: branchesError, refetch } = useQuery({
    queryKey: ['admin-tenant-branches', tenantId],
    queryFn: () => adminApi.getTenantBranches(tenantId),
    enabled: tenant.status === 'ACTIVE',
  })

  // Only the add / edit dialog needs the city list.
  const { data: citiesData } = useQuery({
    queryKey: ['cities'],
    queryFn: () => citiesApi.getCities(),
    enabled: branchDialog.open,
  })
  const cities = parseCities(citiesData?.data)

  // Branches grouped by organization: a host can run several (tenant.organizations). Falls back to
  // one "Branches" group when organization data is not available.
  const branchGroups = useMemo(() => {
    const branches = branchesData?.data?.branches ?? []
    const orgs = tenant.organizations
    if (!orgs || !orgs.length) {
      return branches.length ? [{ orgId: 'all', orgTitle: 'Branches', branches }] : []
    }
    const byOrg = new Map(orgs.map((o) => [o.id, { orgId: o.id, orgTitle: o.title, branches: [] as TenantBranch[] }]))
    const unassigned: TenantBranch[] = []
    for (const branch of branches) {
      const group = branch.gymListingId ? byOrg.get(branch.gymListingId) : undefined
      if (group) group.branches.push(branch)
      else unassigned.push(branch)
    }
    const groups = orgs.map((o) => byOrg.get(o.id)!).filter((g) => g.branches.length > 0)
    if (unassigned.length) groups.push({ orgId: 'unassigned', orgTitle: 'Other', branches: unassigned })
    return groups
  }, [branchesData, tenant.organizations])

  const branchStatusMutation = useMutation({
    mutationFn: ({ branchId, status }: { branchId: string; status: 'ACTIVE' | 'INACTIVE' }) =>
      adminApi.updateTenantBranchStatus(tenantId, branchId, status),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-tenant-branches', tenantId] }); toast({ title: 'Branch status updated' }) },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to update branch status', variant: 'destructive' }),
  })

  const travelerVisibilityMutation = useMutation({
    mutationFn: ({ branchId, status, reason }: { branchId: string; status: 'active' | 'deactivated'; reason?: string }) =>
      adminApi.updateBranchTravelerVisibility(branchId, status, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-branches', tenantId] })
      setDeactivateBranchDialog({ open: false, branchId: '' })
      setDeactivateBranchReason('')
      toast({ title: 'Branch traveler visibility updated' })
    },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to update visibility', variant: 'destructive' }),
  })

  const createBranchMutation = useMutation({
    mutationFn: (payload: CreateTenantBranchPayload) => adminApi.createTenantBranch(tenantId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-branches', tenantId] })
      setBranchDialog({ open: false, mode: 'create' })
      toast({ title: 'Branch created' })
    },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to create branch', variant: 'destructive' }),
  })

  const updateBranchMutation = useMutation({
    mutationFn: ({ branchId, payload }: { branchId: string; payload: UpdateTenantBranchPayload }) =>
      adminApi.updateTenantBranch(tenantId, branchId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-branches', tenantId] })
      setBranchDialog({ open: false, mode: 'create' })
      toast({ title: 'Branch updated' })
    },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to update branch', variant: 'destructive' }),
  })

  return (
    <>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><GitBranch className="h-4 w-4" /> Gym Branches</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            &quot;Traveler&quot; is an admin-controlled visibility toggle for the Travelers discovery feed — not a request from the host. Hover a badge for details.
          </p>
        </div>
        {tenant.status === 'ACTIVE' && (
          <Button size="sm" onClick={() => setBranchDialog({ open: true, mode: 'create' })}>
            <Plus className="h-4 w-4 mr-2" /> Add Branch
          </Button>
        )}
      </div>

      {tenant.status !== 'ACTIVE' ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Branch data is only available for active tenants.</CardContent></Card>
      ) : branchesLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
      ) : branchesError ? (
        <ErrorState error={branchesError} what="the branches" onRetry={() => refetch()} compact />
      ) : !branchGroups.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <GitBranch className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No branches yet.</p>
            <Button size="sm" className="mt-4" onClick={() => setBranchDialog({ open: true, mode: 'create' })}>
              <Plus className="h-4 w-4 mr-2" /> Add First Branch
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {branchGroups.map(({ orgId, orgTitle, branches }) => (
          <div key={orgId}>
            {branchGroups.length > 1 && (
              <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5" /> {orgTitle}
                <Badge variant="secondary" className="text-xs">{branches.length}</Badge>
              </h4>
            )}
            <div className="space-y-3">
          {branches.map((branch) => (
            <Card key={branch.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <span className="text-xs font-bold text-primary">{branch.branchName.charAt(0)}</span>
                  </div>
                   <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold">{branch.branchName}</p>
                      <StatusBadge status={branch.status} />
                      <span
                        title="Admin-controlled visibility to the Travelers discovery feed — not a request from the host, and not tied to review/approval. Toggle it yourself for a branch you want featured there."
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full cursor-help ${
                        (branch.travelerVisibilityStatus || 'pending') === 'active'
                          ? 'bg-green-100 text-green-800 border border-green-200'
                          : (branch.travelerVisibilityStatus || 'pending') === 'deactivated'
                          ? 'bg-red-100 text-red-800 border border-red-200'
                          : 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                      }`}>
                        Traveler: {(branch.travelerVisibilityStatus || 'pending').toUpperCase()}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 px-1.5 text-[10px] text-muted-foreground flex items-center gap-0.5 hover:text-primary hover:bg-muted"
                        onClick={() => setHistoryDialog({ open: true, branchId: branch.id, branchName: branch.branchName })}
                      >
                        <History className="h-3 w-3" /> History
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">{branch.address || '—'}</p>
                    {(branch.openingTime || branch.closingTime) && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3" />{branch.openingTime} – {branch.closingTime}
                      </p>
                    )}
                    {branch.facilitiesJson && branch.facilitiesJson.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {branch.facilitiesJson.slice(0, 5).map((f) => <Badge key={f} variant="secondary" className="text-xs">{f}</Badge>)}
                        {branch.facilitiesJson.length > 5 && <Badge variant="secondary" className="text-xs">+{branch.facilitiesJson.length - 5}</Badge>}
                      </div>
                    )}
                    {(branch.travelerVisibilityStatus || 'pending') === 'deactivated' && branch.deactivationReason && (
                      <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 mt-2 max-w-md">
                        <strong>Deactivation Reason:</strong> {branch.deactivationReason}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => setBranchDialog({ open: true, mode: 'edit', branch })}>
                      Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => branchStatusMutation.mutate({ branchId: branch.id, status: branch.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })} disabled={branchStatusMutation.isPending}>
                      {branch.status === 'ACTIVE' ? <><ToggleRight className="h-4 w-4 mr-1 text-green-600" />Disable</> : <><ToggleLeft className="h-4 w-4 mr-1 text-muted-foreground" />Enable</>}
                    </Button>
                    {(branch.travelerVisibilityStatus || 'pending') !== 'active' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-green-600 text-green-600 hover:bg-green-50 text-xs py-1 h-8"
                        onClick={() => travelerVisibilityMutation.mutate({ branchId: branch.id, status: 'active' })}
                        disabled={travelerVisibilityMutation.isPending}
                      >
                        Activate Traveler
                      </Button>
                    )}
                    {(branch.travelerVisibilityStatus || 'pending') !== 'deactivated' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-600 text-red-600 hover:bg-red-50 text-xs py-1 h-8"
                        onClick={() => setDeactivateBranchDialog({ open: true, branchId: branch.id })}
                        disabled={travelerVisibilityMutation.isPending}
                      >
                        Deactivate Traveler
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
            </div>
          </div>
          ))}
        </div>
      )}
    </div>

    <BranchFormDialog
      open={branchDialog.open}
      onOpenChange={(o) => !o && setBranchDialog((p) => ({ ...p, open: false }))}
      mode={branchDialog.mode}
      branch={branchDialog.branch}
      cities={cities}
      onSubmit={(payload) => {
        if (branchDialog.mode === 'create') {
          createBranchMutation.mutate(payload as CreateTenantBranchPayload)
        } else if (branchDialog.branch) {
          updateBranchMutation.mutate({ branchId: branchDialog.branch.id, payload: payload as UpdateTenantBranchPayload })
        }
      }}
      loading={createBranchMutation.isPending || updateBranchMutation.isPending}
    />

  <Dialog open={deactivateBranchDialog.open} onOpenChange={(o) => !o && setDeactivateBranchDialog({ open: false, branchId: '' })}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Deactivate Branch Traveler Visibility</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <p className="text-sm text-muted-foreground">
          Are you sure you want to deactivate this branch from traveler visibility? It will no longer appear in traveler search or discovery results.
        </p>
        <div className="space-y-2">
          <Label htmlFor="deactivate-reason">Reason for Deactivation</Label>
          <Textarea
            id="deactivate-reason"
            placeholder="Enter the reason for deactivation (mandatory)..."
            value={deactivateBranchReason}
            onChange={(e) => setDeactivateBranchReason(e.target.value)}
            rows={4}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => setDeactivateBranchDialog({ open: false, branchId: '' })}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          onClick={() => travelerVisibilityMutation.mutate({
            branchId: deactivateBranchDialog.branchId,
            status: 'deactivated',
            reason: deactivateBranchReason
          })}
          disabled={!deactivateBranchReason.trim() || travelerVisibilityMutation.isPending}
        >
          Deactivate
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>


  <Dialog open={historyDialog.open} onOpenChange={(o) => !o && setHistoryDialog({ open: false, branchId: '', branchName: '' })}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Visibility Logs: {historyDialog.branchName}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-2 max-h-[350px] overflow-y-auto">
        {historyLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading visibility history...</p>
        ) : !historyData?.data?.history || historyData.data.history.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No visibility logs found for this branch.</p>
        ) : (
          <div className="space-y-3">
            {historyData.data.history.map((log: any) => (
              <div key={log.id} className="border-b pb-2.5 last:border-0 last:pb-0">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    log.status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : log.status === 'deactivated'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {log.status.toUpperCase()}
                  </span>
                  <span className="text-[10px] text-muted-foreground flex items-center">
                    {log.changedAt ? new Date(log.changedAt).toLocaleString() : 'N/A'}
                  </span>
                </div>
                {log.reason && (
                  <p className="text-xs text-muted-foreground bg-muted p-2 rounded mt-1.5 border">
                    {log.reason}
                  </p>
                )}
                {log.changedBy && (
                  <p className="text-[9px] text-muted-foreground/80 mt-1">
                    By User ID: {log.changedBy}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => setHistoryDialog({ open: false, branchId: '', branchName: '' })}>
          Close
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

    </>
  )
}
