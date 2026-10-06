'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Crown, Info, ShieldCheck, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { ConfirmDialog } from '@/components/features/confirm-dialog'
import { gymApi } from '@/lib/api/gym'
import { teamApi, PermissionDef, PermissionModule, TeamMemberDetail, TeamRole } from '@/lib/api/team'
import {
  AccessTier,
  OverrideMap,
  TIER_LABEL,
  diffChanges,
  displayTier,
  hasEverything,
  isGrantsChanged,
  isRowChanged,
  memberDisplayName,
  memberScopeLabel,
  presetOnlyLabel,
  presetTierFor,
  stageTier,
  teamErrorMessage,
  tierText,
  toOverrideMap,
} from '@/lib/team/access'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const TIERS: AccessTier[] = ['OFF', 'REQUEST', 'DIRECT']

interface MemberAccessPanelProps {
  assignmentId: string
  onClose: () => void
}

/**
 * One person's role, branches and permissions: the mobile permission editor
 * (permission_editor_screen.dart) laid out as the right-hand panel of the team page.
 */
export function MemberAccessPanel({ assignmentId, onClose }: MemberAccessPanelProps) {
  const { toast } = useToast()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const memberQuery = useQuery({
    queryKey: ['team-member', assignmentId],
    queryFn: () => teamApi.getMember(assignmentId),
  })
  const rolesQuery = useQuery({ queryKey: ['team-meta', 'roles'], queryFn: () => teamApi.getRoles() })
  const catalogueQuery = useQuery({
    queryKey: ['team-meta', 'permissions'],
    queryFn: () => teamApi.getPermissionCatalogue(),
  })
  const branchesQuery = useQuery({ queryKey: ['branches'], queryFn: () => gymApi.getBranches() })

  const detail = memberQuery.data?.data
  const roles = rolesQuery.data?.data?.roles ?? []
  const myLevel = rolesQuery.data?.data?.myLevel ?? 0
  const isOwner = rolesQuery.data?.data?.isOwner ?? false
  const modules = catalogueQuery.data?.data?.modules ?? []
  const branches = branchesQuery.data?.data?.branches ?? []

  const saved = React.useMemo(() => toOverrideMap(detail?.overrides ?? []), [detail])
  const [working, setWorking] = React.useState<OverrideMap>({})
  const [roleKey, setRoleKey] = React.useState('')
  const [allBranches, setAllBranches] = React.useState(false)
  const [branchIds, setBranchIds] = React.useState<string[]>([])
  const [diffOpen, setDiffOpen] = React.useState(false)
  const [pendingDangerous, setPendingDangerous] = React.useState<PermissionDef | null>(null)
  const [grantsChanged, setGrantsChanged] = React.useState(false)
  const [roleError, setRoleError] = React.useState<string | null>(null)

  // Start again from the server's copy whenever a new version of the record arrives.
  const loadedKey = detail ? `${detail.id}:${detail.version}` : ''
  React.useEffect(() => {
    if (!detail) return
    setWorking(toOverrideMap(detail.overrides))
    setRoleKey(detail.role.key)
    setAllBranches(detail.scopeType === 'ORG')
    setBranchIds(detail.branches.map((b) => b.id))
    setDiffOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedKey])

  const refreshMember = () => {
    queryClient.invalidateQueries({ queryKey: ['team-member', assignmentId] })
    queryClient.invalidateQueries({ queryKey: ['team'] })
  }

  /**
   * RBAC-08: someone else saved first. Load their version; the effect above then
   * replaces the stale edit, and the notice explains why it disappeared.
   */
  const handleError = (error: unknown): boolean => {
    if (isGrantsChanged(error)) {
      setDiffOpen(false)
      setGrantsChanged(true)
      refreshMember()
      return true
    }
    toast({ title: 'Error', description: teamErrorMessage(error).message, variant: 'destructive' })
    return false
  }

  const permissionsMutation = useMutation({
    mutationFn: (d: TeamMemberDetail) => teamApi.setPermissions(d.id, Object.values(working), d.version),
    onSuccess: (res) => {
      setDiffOpen(false)
      queryClient.setQueryData(['team-member', assignmentId], res)
      queryClient.invalidateQueries({ queryKey: ['team'] })
      setGrantsChanged(false)
      toast({ title: 'Access updated' })
    },
    onError: (error) => {
      handleError(error)
    },
  })

  const roleMutation = useMutation({
    mutationFn: (d: TeamMemberDetail) =>
      teamApi.updateMember(d.id, {
        ...(roleKey !== d.role.key ? { roleKey } : {}),
        ...(allBranches ? { assignToAllBranches: true } : { assignToAllBranches: false, branchIds }),
        expectedVersion: d.version,
      }),
    onSuccess: () => {
      setGrantsChanged(false)
      setRoleError(null)
      refreshMember()
      toast({ title: 'Team member updated' })
    },
    onError: (error, d) => {
      if (handleError(error)) return
      // The server refused (for example the level rule, 403). Show its reason, go
      // back to what it last confirmed, and re-read which roles may be assigned.
      setRoleError(teamErrorMessage(error).message)
      setRoleKey(d.role.key)
      setAllBranches(d.scopeType === 'ORG')
      setBranchIds(d.branches.map((b) => b.id))
      queryClient.invalidateQueries({ queryKey: ['team-meta', 'roles'] })
    },
  })

  if (memberQuery.isLoading || rolesQuery.isLoading || catalogueQuery.isLoading) {
    return (
      <aside aria-label="Team member access" className="space-y-3 rounded-lg border bg-card p-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </aside>
    )
  }

  const loadError = memberQuery.error || rolesQuery.error || catalogueQuery.error
  if (loadError || !detail) {
    return (
      <aside aria-label="Team member access" className="rounded-lg border bg-card p-4">
        <Alert variant="destructive">
          <AlertDescription>{teamErrorMessage(loadError).message}</AlertDescription>
        </Alert>
        <div className="mt-3 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              memberQuery.refetch()
              rolesQuery.refetch()
              catalogueQuery.refetch()
            }}
          >
            Try again
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </aside>
    )
  }

  const name = memberDisplayName(detail)
  const firstName = name.split(' ')[0]
  const role: TeamRole | undefined = roles.find((r) => r.key === detail.role.key)
  const isSelf = !!user?.id && user.id === detail.userId
  const aboveMe = !isOwner && detail.role.level >= myLevel
  const revoked = detail.status === 'REVOKED'
  // The same rules the server applies (access.service.js); it stays the authority.
  const lockReason = revoked
    ? `${name}'s access was revoked. The record is kept for history; restore access to add them again.`
    : isSelf
      ? 'You cannot change your own role or permissions.'
      : aboveMe
        ? 'You cannot manage a team member at or above your own level.'
        : null
  const locked = lockReason !== null

  const allPermissions = modules.flatMap((m) => m.permissions)
  const changes = diffChanges(allPermissions, detail, saved, working, role)

  const scopeChanged =
    allBranches !== (detail.scopeType === 'ORG') ||
    (!allBranches &&
      (branchIds.length !== detail.branches.length || detail.branches.some((b) => !branchIds.includes(b.id))))
  const roleChanged = roleKey !== detail.role.key
  const canSaveRole = (roleChanged || scopeChanged) && (allBranches || branchIds.length > 0)

  const stage = (perm: PermissionDef, next: AccessTier) => setWorking((w) => stageTier(w, perm, next))

  const resetToPreset = () =>
    setWorking((w) => Object.fromEntries(Object.entries(w).filter(([, o]) => o.branchId != null)))

  return (
    <aside aria-label="Team member access" className="rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-3 border-b p-4">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">{name}</h3>
          <p className="text-xs text-muted-foreground">
            {detail.role.name} · {memberScopeLabel(detail)}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close panel">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4 p-4">
        {hasEverything(detail) ? (
          <div className="flex flex-col items-center py-8 text-center">
            <Crown className="mb-3 h-10 w-10 text-primary" />
            <p className="font-semibold">{name} owns this organization</p>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              Owners have full access to everything and it cannot be fine-tuned or restricted.
            </p>
          </div>
        ) : (
          <>
            {grantsChanged && (
              <Alert variant="warning" data-testid="grants-changed-notice">
                <AlertTitle>This team member was just updated</AlertTitle>
                <AlertDescription>
                  Someone else changed {name}&apos;s access while you were editing, so your changes were not saved.
                  You are now looking at the latest version. Review it, then make your changes again.
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 pl-1"
                    onClick={() => setGrantsChanged(false)}
                  >
                    Dismiss
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {lockReason && (
              <Alert>
                <AlertDescription>{lockReason}</AlertDescription>
              </Alert>
            )}

            {/* Role and branches */}
            <section aria-label="Role and branches" className="space-y-3 rounded-md border p-3">
              <div className="space-y-1.5">
                <label htmlFor="team-member-role" className="text-sm font-medium">
                  Role
                </label>
                <select
                  id="team-member-role"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
                  value={roleKey}
                  disabled={locked}
                  onChange={(e) => {
                    setRoleError(null)
                    setRoleKey(e.target.value)
                  }}
                >
                  {roles
                    .filter((r) => r.assignable || r.key === detail.role.key)
                    .map((r) => (
                      <option
                        key={r.key}
                        value={r.key}
                        // Mobile shows these greyed out, not hidden, so the ceiling does not look like a bug.
                        disabled={!r.assignableByMe && r.key !== detail.role.key}
                      >
                        {r.name}
                      </option>
                    ))}
                </select>
                {roles.some((r) => r.assignable && !r.assignableByMe) && (
                  <p className="text-xs italic text-destructive">You cannot assign a role at or above your own.</p>
                )}
                {roleError && (
                  <p className="text-sm font-medium text-destructive" role="alert" data-testid="role-error">
                    {roleError}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-3 text-sm">
                  <Switch
                    checked={allBranches}
                    disabled={locked}
                    onCheckedChange={(v) => setAllBranches(v)}
                    aria-label="All branches"
                  />
                  <span>
                    <span className="font-medium">All branches</span>
                    <span className="block text-xs text-muted-foreground">Includes any branch you open later</span>
                  </span>
                </label>
                {!allBranches && (
                  <div className="space-y-1.5 pl-1">
                    {branches.map((b) => (
                      <label key={b.id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="rounded border-input accent-primary"
                          checked={branchIds.includes(b.id)}
                          disabled={locked}
                          onChange={(e) =>
                            setBranchIds((ids) => (e.target.checked ? [...ids, b.id] : ids.filter((id) => id !== b.id)))
                          }
                        />
                        {b.branchName}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <Button
                size="sm"
                variant="outline"
                disabled={locked || !canSaveRole}
                loading={roleMutation.isPending}
                onClick={() => roleMutation.mutate(detail)}
              >
                Save role & branches
              </Button>
            </section>

            {/* Permissions */}
            <div className="flex items-start gap-2 rounded-md border p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>
                Starting from the {detail.role.name} preset. Anything you change here applies only to {firstName}.
              </p>
            </div>

            {modules.map((module) => (
              <ModuleSection
                key={module.module}
                module={module}
                detail={detail}
                role={role}
                saved={saved}
                working={working}
                locked={locked}
                onStage={stage}
                onDangerous={setPendingDangerous}
              />
            ))}

            <div className="text-center">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                disabled={locked || !Object.values(working).some((o) => o.branchId == null)}
                onClick={resetToPreset}
              >
                Reset to {detail.role.name} defaults
              </Button>
            </div>
          </>
        )}
      </div>

      {changes.length > 0 && !locked && (
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-card p-4">
          <p className="text-sm text-muted-foreground">
            {changes.length} change{changes.length === 1 ? '' : 's'} to review
          </p>
          <Button onClick={() => setDiffOpen(true)}>Save changes</Button>
        </div>
      )}

      {/* Before/after diff: nothing is sent until this is confirmed. */}
      <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm changes for {name}</DialogTitle>
            <DialogDescription>This takes effect immediately.</DialogDescription>
          </DialogHeader>
          <ul aria-label="Changes" className="max-h-72 space-y-2 overflow-y-auto">
            {changes.map((c) => (
              <li key={c.permissionKey} className="flex items-center justify-between gap-3 text-sm">
                <span>{c.label}</span>
                <span className="shrink-0 text-xs font-semibold">
                  <span className="text-muted-foreground">{tierText(c.before, c.approvable)}</span>
                  {' → '}
                  <span>{tierText(c.after, c.approvable)}</span>
                </span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiffOpen(false)} disabled={permissionsMutation.isPending}>
              Cancel
            </Button>
            <Button loading={permissionsMutation.isPending} onClick={() => permissionsMutation.mutate(detail)}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!pendingDangerous}
        onOpenChange={(open) => !open && setPendingDangerous(null)}
        title="Grant direct access?"
        description="This permission is flagged as sensitive. Granting it directly means they will not need anyone to approve it — the action happens the moment they take it."
        confirmLabel="Grant direct access"
        onConfirm={() => {
          if (pendingDangerous) stage(pendingDangerous, 'DIRECT')
          setPendingDangerous(null)
        }}
      />
    </aside>
  )
}

function ModuleSection({
  module,
  detail,
  role,
  saved,
  working,
  locked,
  onStage,
  onDangerous,
}: {
  module: PermissionModule
  detail: TeamMemberDetail
  role: TeamRole | undefined
  saved: OverrideMap
  working: OverrideMap
  locked: boolean
  onStage: (perm: PermissionDef, next: AccessTier) => void
  onDangerous: (perm: PermissionDef) => void
}) {
  const tierOf = (perm: PermissionDef) =>
    displayTier(perm, detail, saved, working, presetTierFor(role, perm.key))
  const granted = module.permissions.filter((p) => tierOf(p) !== 'OFF').length
  const customized = module.permissions.some((p) => working[`${p.key}@*`])

  return (
    <details className="rounded-md border" open>
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold">
        <span>{module.label}</span>
        <span className="flex items-center gap-2">
          {customized && <Badge variant="secondary">Customized</Badge>}
          <span className="text-xs font-normal text-muted-foreground">
            {granted} of {module.permissions.length}
          </span>
        </span>
      </summary>
      <ul>
        {module.permissions.map((perm) => {
          const tier = tierOf(perm)
          const readOnly = presetOnlyLabel(perm, role, working)
          return (
            <li key={perm.key} data-permission={perm.key} className="space-y-1 border-t px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className={cn('text-sm font-medium', perm.dangerous && 'text-destructive')}>
                  {perm.label}
                  {isRowChanged(perm, saved, working) && (
                    <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" title="Changed" />
                  )}
                </span>
                {readOnly ? (
                  <span className="shrink-0 text-xs text-muted-foreground" data-testid={`preset-${perm.key}`}>
                    {readOnly}
                  </span>
                ) : perm.approvable ? (
                  <div role="group" aria-label={perm.label} className="flex shrink-0 rounded-md border p-0.5">
                    {TIERS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={tier === t}
                        disabled={locked}
                        onClick={() => (perm.dangerous && t === 'DIRECT' ? onDangerous(perm) : onStage(perm, t))}
                        className={cn(
                          'rounded px-2 py-1 text-[11px] font-semibold disabled:opacity-50',
                          tier === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
                        )}
                      >
                        {TIER_LABEL[t]}
                      </button>
                    ))}
                  </div>
                ) : (
                  <Switch
                    aria-label={perm.label}
                    checked={tier !== 'OFF'}
                    disabled={locked}
                    onCheckedChange={(on) => onStage(perm, on ? 'DIRECT' : 'OFF')}
                  />
                )}
              </div>
              {tier === 'REQUEST' && perm.approvable && !readOnly && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Info className="h-3 w-3" />
                  Requests go to whoever can approve at this branch
                </p>
              )}
              {perm.note && <p className="text-xs text-muted-foreground">{perm.note}</p>}
            </li>
          )
        })}
      </ul>
    </details>
  )
}
