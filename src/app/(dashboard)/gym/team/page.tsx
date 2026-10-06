'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Plus, Search, ShieldAlert, SlidersHorizontal, Store, UserMinus, Users } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { EmptyState } from '@/components/features/empty-state'
import { ConfirmDialog } from '@/components/features/confirm-dialog'
import { InviteMemberDialog } from '@/components/features/team/invite-member-dialog'
import { MemberAccessPanel } from '@/components/features/team/member-access-panel'
import { RoleFilterChips } from '@/components/features/team/role-filter-chips'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { teamApi, TeamMember } from '@/lib/api/team'
import { MEMBER_STATUS_LABEL, memberDisplayName, memberScopeLabel, teamErrorMessage } from '@/lib/team/access'
import { useToast } from '@/hooks/use-toast'
import { cn, getInitials } from '@/lib/utils'

const STATUS_CLASS: Record<string, string> = {
  ACTIVE: 'text-success',
  INVITED: 'text-warning',
  SUSPENDED: 'text-destructive',
  REVOKED: 'text-muted-foreground',
}

/**
 * Team & access — one page for every role (UX-12). The mobile Team & Access
 * screen on a wide layout: role chips and the member table on the left, the
 * selected person's access on the right.
 */
function TeamPageContent() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()

  const [roleFilter, setRoleFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showRevoked, setShowRevoked] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(searchParams?.get('member') ?? null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [restoreFrom, setRestoreFrom] = useState<TeamMember | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<TeamMember | null>(null)

  const teamQuery = useQuery({
    queryKey: ['team', { includeRevoked: showRevoked }],
    queryFn: () => teamApi.getTeam(showRevoked ? { includeRevoked: true } : undefined),
    retry: false,
  })

  const revokeMutation = useMutation({
    mutationFn: (member: TeamMember) => teamApi.revokeMember(member.id),
    onSuccess: (_res, member) => {
      queryClient.invalidateQueries({ queryKey: ['team'] })
      queryClient.invalidateQueries({ queryKey: ['team-member', member.id] })
      setRevokeTarget(null)
      toast({ title: `${memberDisplayName(member)} no longer has access` })
    },
    onError: (err) => {
      setRevokeTarget(null)
      toast({ title: 'Error', description: teamErrorMessage(err).message, variant: 'destructive' })
    },
  })

  const openInvite = (from: TeamMember | null = null) => {
    setRestoreFrom(from)
    setInviteOpen(true)
  }

  const all = teamQuery.data?.data?.team ?? []
  // Chips count people who have access; a revoked record is history, not a team member.
  const current = all.filter((m) => m.status !== 'REVOKED')
  const term = search.trim().toLowerCase()
  const visible = all.filter(
    (m) =>
      (roleFilter === null || m.role.key === roleFilter) &&
      (term === '' || memberDisplayName(m).toLowerCase().includes(term) || (m.email ?? '').toLowerCase().includes(term))
  )

  const error = teamQuery.error ? teamErrorMessage(teamQuery.error) : null

  return (
    <>
      <Header title="Team & access" description="Everyone with access to your gym, in every role" />
      <div className="p-6 animate-fade-in">
        <PageHeader
          title="Team & access"
          description={
            current.length === 0
              ? 'Add managers, admins, front desk staff, trainers and support in one place.'
              : 'Everyone with access to your gym. Select someone to change their role or fine-tune what they can do.'
          }
          action={
            <Button onClick={() => openInvite()}>
              <Plus className="mr-2 h-4 w-4" />
              Add team member
            </Button>
          }
        />

        {teamQuery.isLoading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading team">
            <Skeleton className="h-9 w-80" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : error?.status === 403 ? (
          <EmptyState icon={ShieldAlert} title="You do not have access to the team" description={error.message} />
        ) : error ? (
          <EmptyState
            icon={ShieldAlert}
            title="The team could not be loaded"
            description={error.message}
            action={
              <Button variant="outline" onClick={() => teamQuery.refetch()}>
                Try again
              </Button>
            }
          />
        ) : (
          <div className={cn('grid items-start gap-6', selectedId && 'xl:grid-cols-[minmax(0,1fr)_440px]')}>
            <div className="min-w-0 space-y-4">
              <RoleFilterChips team={current} selected={roleFilter} onSelect={setRoleFilter} />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative w-full max-w-xs">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-label="Search team"
                    placeholder="Search by name or email"
                    className="pl-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Switch checked={showRevoked} onCheckedChange={setShowRevoked} aria-label="Show revoked" />
                  Show revoked
                </label>
              </div>

              {visible.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title={roleFilter || term ? 'Nobody in this role yet' : 'No team members yet'}
                  description={
                    roleFilter || term
                      ? 'Add someone in this role, or clear the filter to see everyone.'
                      : 'Add a manager, admin, front desk clerk, trainer or support staff.'
                  }
                  action={
                    <Button onClick={() => openInvite()}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add team member
                    </Button>
                  }
                />
              ) : (
                <div className="rounded-lg border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Access</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((member) => {
                        const name = memberDisplayName(member)
                        const ScopeIcon = member.scopeType === 'ORG' ? Building2 : Store
                        return (
                          <TableRow
                            key={member.id}
                            data-state={selectedId === member.id ? 'selected' : undefined}
                            className="cursor-pointer"
                            onClick={() => setSelectedId(member.id)}
                          >
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-9 w-9">
                                  <AvatarImage src={member.profileImageUrl ?? undefined} alt={name} />
                                  <AvatarFallback className="bg-primary/10 text-xs text-primary">
                                    {getInitials(name)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{name}</p>
                                  <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{member.role.name}</Badge>
                                {/* In the list, not buried in the panel: who deviates from their preset. */}
                                {member.hasCustomAccess && (
                                  <Badge variant="secondary" className="gap-1">
                                    <SlidersHorizontal className="h-3 w-3" />
                                    Custom
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                <ScopeIcon className="h-3.5 w-3.5" />
                                {memberScopeLabel(member)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className={cn('text-xs font-semibold', STATUS_CLASS[member.status])}>
                                {MEMBER_STATUS_LABEL[member.status] ?? member.status}
                              </span>
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              {member.status === 'REVOKED' ? (
                                <Button variant="outline" size="sm" onClick={() => openInvite(member)}>
                                  Restore access
                                </Button>
                              ) : (
                                member.role.key !== 'OWNER' && (
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="text-destructive hover:bg-destructive/10"
                                    aria-label={`Revoke access for ${name}`}
                                    title="Revoke access"
                                    onClick={() => setRevokeTarget(member)}
                                  >
                                    <UserMinus className="h-4 w-4" />
                                  </Button>
                                )
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {selectedId && (
              <MemberAccessPanel key={selectedId} assignmentId={selectedId} onClose={() => setSelectedId(null)} />
            )}
          </div>
        )}
      </div>

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        restoreFrom={restoreFrom}
        onAdded={() => queryClient.invalidateQueries({ queryKey: ['team'] })}
      />

      {/* Revoking withdraws access; it does not delete the person. */}
      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title="Revoke access?"
        description={
          revokeTarget
            ? `${memberDisplayName(revokeTarget)} will immediately lose access to ${memberScopeLabel(revokeTarget).toLowerCase()}. Their record is kept so past approvals and payments stay traceable.`
            : ''
        }
        confirmLabel="Revoke access"
        loading={revokeMutation.isPending}
        onConfirm={() => revokeTarget && revokeMutation.mutate(revokeTarget)}
      />
    </>
  )
}

export default function TeamPage() {
  return (
    <Suspense fallback={null}>
      <TeamPageContent />
    </Suspense>
  )
}
