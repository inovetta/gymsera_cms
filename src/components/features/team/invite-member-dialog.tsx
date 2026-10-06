'use client'

import * as React from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { gymApi } from '@/lib/api/gym'
import { teamApi, TeamMember, TeamRole } from '@/lib/api/team'
import { teamErrorMessage } from '@/lib/team/access'
import { cn } from '@/lib/utils'

const STEPS = ['Who', 'Role', 'Branches'] as const

interface InviteMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after the member was added (and any new-account details were dismissed). */
  onAdded: () => void
  /** Restore access: start from a revoked record. A new assignment is created; the old row stays. */
  restoreFrom?: TeamMember | null
}

/**
 * Add a team member in any role: the mobile three-step flow
 * (add_team_member_screen.dart) as a dialog. Who → Role → Branches.
 */
export function InviteMemberDialog({ open, onOpenChange, onAdded, restoreFrom = null }: InviteMemberDialogProps) {
  const [step, setStep] = React.useState(0)
  const [email, setEmail] = React.useState('')
  const [fullName, setFullName] = React.useState('')
  const [jobTitle, setJobTitle] = React.useState('')
  const [roleKey, setRoleKey] = React.useState<string | null>(null)
  const [allBranches, setAllBranches] = React.useState(false)
  const [branchIds, setBranchIds] = React.useState<string[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [credentials, setCredentials] = React.useState<{ email: string; tempPassword: string } | null>(null)

  const rolesQuery = useQuery({ queryKey: ['team-meta', 'roles'], queryFn: () => teamApi.getRoles(), enabled: open })
  const branchesQuery = useQuery({ queryKey: ['branches'], queryFn: () => gymApi.getBranches(), enabled: open })
  const roles = (rolesQuery.data?.data?.roles ?? []).filter((r) => r.assignable)
  const branches = branchesQuery.data?.data?.branches ?? []
  const role = roles.find((r) => r.key === roleKey)

  React.useEffect(() => {
    if (!open) return
    setStep(0)
    setEmail(restoreFrom?.email ?? '')
    setFullName(restoreFrom?.fullName ?? '')
    setJobTitle(restoreFrom?.jobTitle ?? '')
    setRoleKey(restoreFrom?.role.key ?? null)
    setAllBranches(restoreFrom?.scopeType === 'ORG')
    setBranchIds(restoreFrom?.branches.map((b) => b.id) ?? [])
    setError(null)
    setCredentials(null)
  }, [open, restoreFrom])

  const inviteMutation = useMutation({
    mutationFn: () =>
      teamApi.invite({
        email: email.trim(),
        roleKey: roleKey as string,
        fullName: fullName.trim() || undefined,
        jobTitle: jobTitle.trim() || undefined,
        assignToAllBranches: allBranches,
        branchIds,
      }),
    onSuccess: (res) => {
      // A temporary password exists only when a brand new account was created.
      if (res.data?.tempPassword) {
        setCredentials({ email: res.data.email, tempPassword: res.data.tempPassword })
        return
      }
      onAdded()
      onOpenChange(false)
    },
    onError: (err) => {
      setError(teamErrorMessage(err).message)
      // The level rule may have changed under us (403): re-read what is assignable.
      rolesQuery.refetch()
    },
  })

  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim())
  // A role the server no longer lets this user assign cannot be carried forward.
  const roleSelectable = !!role && role.assignableByMe
  const canContinue = step === 0 ? emailValid : step === 1 ? roleSelectable : allBranches || branchIds.length > 0
  const isLast = step === STEPS.length - 1

  const pickRole = (r: TeamRole) => {
    setRoleKey(r.key)
    // An all-branches role by definition: pre-select it.
    if (r.defaultScope === 'ORG') setAllBranches(true)
  }

  if (credentials) {
    return (
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) onAdded()
          onOpenChange(next)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Account created</DialogTitle>
            <DialogDescription>
              Share these details with {fullName.trim() || credentials.email}. They should change the password after
              signing in.
            </DialogDescription>
          </DialogHeader>
          <dl className="space-y-2">
            <div className="rounded-md bg-muted px-3 py-2">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Email</dt>
              <dd className="font-mono text-sm font-semibold">{credentials.email}</dd>
            </div>
            <div className="rounded-md bg-muted px-3 py-2">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Temporary password</dt>
              <dd className="font-mono text-sm font-semibold" data-testid="temp-password">
                {credentials.tempPassword}
              </dd>
            </div>
          </dl>
          <DialogFooter>
            <Button
              onClick={() => {
                onAdded()
                onOpenChange(false)
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{restoreFrom ? 'Restore access' : 'Add team member'}</DialogTitle>
          <DialogDescription>
            {restoreFrom
              ? 'This creates a new access record. The revoked one stays in the history.'
              : `Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`}
          </DialogDescription>
        </DialogHeader>

        <ol className="flex items-center gap-2 text-xs font-semibold" aria-label="Steps">
          {STEPS.map((label, i) => (
            <li
              key={label}
              aria-current={i === step ? 'step' : undefined}
              className={cn('flex items-center gap-1.5', i <= step ? 'text-primary' : 'text-muted-foreground')}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full border text-[11px]',
                  i <= step ? 'border-primary bg-primary text-primary-foreground' : 'border-input'
                )}
              >
                {i + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {step === 0 && (
          <div className="space-y-4">
            <div>
              <p className="font-semibold">Who are you adding?</p>
              <p className="text-sm text-muted-foreground">
                If they already have a GymsEra account, we will add this role to it — they keep using the same login.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email address *</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="name@example.com"
                value={email}
                disabled={!!restoreFrom}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-name">Full name</Label>
              <Input
                id="invite-name"
                placeholder="Only needed for a new account"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-job-title">Job title</Label>
              <Input
                id="invite-job-title"
                placeholder="Optional — e.g. Senior Trainer"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <div>
              <p className="font-semibold">What should they be able to do?</p>
              <p className="text-sm text-muted-foreground">
                Each role comes with sensible access built in. You can fine-tune it afterwards.
              </p>
            </div>
            {rolesQuery.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : rolesQuery.error ? (
              <Alert variant="destructive">
                <AlertDescription>{teamErrorMessage(rolesQuery.error).message}</AlertDescription>
              </Alert>
            ) : (
              <div role="radiogroup" aria-label="Role" className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {roles.map((r) => {
                  const selected = roleKey === r.key
                  return (
                    // Roles at or above the user's own level are shown but disabled, with the reason.
                    <button
                      key={r.key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={!r.assignableByMe}
                      onClick={() => pickRole(r)}
                      className={cn(
                        'w-full rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                        selected ? 'border-primary ring-1 ring-primary' : 'hover:bg-accent/40'
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{r.name}</span>
                        {selected ? (
                          <CheckCircle2 className="h-5 w-5 text-primary" />
                        ) : (
                          <span className="text-xs text-muted-foreground">{r.permissionCount} permissions</span>
                        )}
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">{r.charter}</span>
                      {!r.assignableByMe && (
                        <span className="mt-1.5 block text-xs italic text-destructive">
                          You cannot assign a role at or above your own.
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div>
              <p className="font-semibold">Where do they work?</p>
              <p className="text-sm text-muted-foreground">
                {role?.name ?? 'They'} will only have access at the branches you pick.
              </p>
            </div>
            <label className="flex items-center gap-3 rounded-lg border p-3 text-sm">
              <Switch
                checked={allBranches}
                aria-label="All branches"
                onCheckedChange={(v) => {
                  setAllBranches(v)
                  if (v) setBranchIds([])
                }}
              />
              <span>
                <span className="font-medium">All branches</span>
                <span className="block text-xs text-muted-foreground">Includes any branch you open later</span>
              </span>
            </label>
            {!allBranches && (
              <fieldset className="space-y-1.5">
                <legend className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Select branches
                </legend>
                {branches.map((b) => (
                  <label key={b.id} className="flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-sm">
                    <input
                      type="checkbox"
                      className="rounded border-input accent-primary"
                      checked={branchIds.includes(b.id)}
                      onChange={(e) =>
                        setBranchIds((ids) => (e.target.checked ? [...ids, b.id] : ids.filter((id) => id !== b.id)))
                      }
                    />
                    {b.branchName}
                  </label>
                ))}
              </fieldset>
            )}
            <dl className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-primary">Review</p>
              <div className="flex gap-3">
                <dt className="w-16 text-muted-foreground">Person</dt>
                <dd className="font-semibold">{email.trim()}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-16 text-muted-foreground">Role</dt>
                <dd className="font-semibold">{role?.name ?? '—'}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-16 text-muted-foreground">Access</dt>
                <dd className="font-semibold">
                  {allBranches ? 'All branches' : `${branchIds.length} branch${branchIds.length === 1 ? '' : 'es'}`}
                </dd>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                You can fine-tune exactly what they can do straight after adding them.
              </p>
            </dl>
          </div>
        )}

        <DialogFooter>
          {step > 0 && (
            <Button variant="outline" disabled={inviteMutation.isPending} onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          )}
          <Button
            disabled={!canContinue}
            loading={inviteMutation.isPending}
            onClick={() => {
              setError(null)
              if (isLast) inviteMutation.mutate()
              else setStep((s) => s + 1)
            }}
          >
            {isLast ? 'Add to team' : 'Continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
