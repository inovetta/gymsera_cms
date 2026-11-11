'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { EmptyState } from '@/components/features/empty-state'
import { ErrorState } from '@/components/features/error-state'
import { NoAccess } from '@/components/features/no-access'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { devicesApi, UnlinkedUser } from '@/lib/api/devices'
import { gymApi } from '@/lib/api/gym'
import { describeRequestError } from '@/lib/api/request-errors'
import { holdsAtBranch, holdsPermission } from '@/lib/access/menu'
import { formatDate } from '@/lib/utils'
import { useDebounce } from '@/hooks/use-debounce'
import { useGymAccess } from '@/hooks/use-gym-access'
import { useToast } from '@/hooks/use-toast'

const SOURCE_LABEL: Record<UnlinkedUser['source'], string> = {
  scan: 'Seen at a scan',
  upload: 'Sent by the device',
  audit: 'Found in the nightly audit',
  import: 'Left on the device at the import',
}

/**
 * Unlinked device users (ZKTeco spec §7.5, §10.3): people the devices know by a PIN that is no
 * GymsEra member, usually added on the device by hand before GymsEra. Link one to a member (the
 * member takes that PIN, so what the device holds becomes theirs) or dismiss it, optionally
 * deleting it from the device. Nobody is ever created as a member from here.
 */
export default function UnlinkedUsersPage() {
  const { organization, contextLoading } = useGymAccess()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const mayView = holdsPermission(organization, 'devices.view', 'branch')
  const [linking, setLinking] = useState<UnlinkedUser | null>(null)
  const [dismissing, setDismissing] = useState<UnlinkedUser | null>(null)
  const [removeFromDevice, setRemoveFromDevice] = useState(false)
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 400)
  const [memberId, setMemberId] = useState('')

  const query = useQuery({ queryKey: ['unlinked-users'], queryFn: () => devicesApi.unlinked(), enabled: mayView && !!organization })
  const members = useQuery({
    queryKey: ['unlinked-member-search', debounced],
    queryFn: () => gymApi.getMembers({ q: debounced, limit: 10 }),
    enabled: !!linking && debounced.trim().length >= 2,
  })
  const done = (title: string) => {
    toast({ title })
    setLinking(null)
    setDismissing(null)
    setMemberId('')
    setSearch('')
    setRemoveFromDevice(false)
    void queryClient.invalidateQueries({ queryKey: ['unlinked-users'] })
  }
  const link = useMutation({
    mutationFn: () => devicesApi.linkUnlinked((linking as UnlinkedUser).deviceId, (linking as UnlinkedUser).pin, memberId),
    onSuccess: () => done('Linked. The device user is now this member, with their access rules.'),
    onError: (err) => toast({ title: describeRequestError(err, 'The device user could not be linked.'), variant: 'destructive' }),
  })
  const dismiss = useMutation({
    mutationFn: () => devicesApi.dismissUnlinked((dismissing as UnlinkedUser).deviceId, (dismissing as UnlinkedUser).pin, removeFromDevice),
    onSuccess: () => done(removeFromDevice ? 'Dismissed. The device will delete this user.' : 'Dismissed.'),
    onError: (err) => toast({ title: describeRequestError(err, 'The device user could not be dismissed.'), variant: 'destructive' }),
  })

  const back = (
    <Link href="/gym/devices" className="inline-flex items-center text-sm text-primary hover:underline">
      <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />Access devices
    </Link>
  )
  if (!organization && contextLoading) return (<><Header title="Unlinked device users" /><div className="p-6"><Skeleton className="h-24 w-full" /></div></>)
  if (!mayView) return (<><Header title="Unlinked device users" /><div className="p-6"><NoAccess what="access devices" needs="View access devices" /></div></>)

  const users = query.data?.data?.users
  return (
    <>
      <Header title="Unlinked device users" />
      <div className="space-y-4 p-6">
        {back}
        <PageHeader title="Unlinked device users" description="People your devices know by a PIN that is not a GymsEra member" />
        {query.error ? <ErrorState error={query.error} what="the unlinked device users" onRetry={() => query.refetch()} />
          : !users ? <Skeleton className="h-32 w-full" />
            : users.length === 0 ? <EmptyState title="Nothing to link" description="Every user on your devices is a GymsEra member." />
              : (
                <Table data-testid="unlinked-users">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead>PIN</TableHead>
                      <TableHead>Name on the device</TableHead>
                      <TableHead>Found</TableHead>
                      <TableHead>Last seen</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => {
                      const branchOk = !!u.branchId && holdsAtBranch(organization, u.branchId, 'devices.manage')
                      return (
                        <TableRow key={`${u.deviceId}-${u.pin}`}>
                          <TableCell><Link className="text-primary hover:underline" href={`/gym/devices/${u.deviceId}`}>{u.deviceName ?? 'Device'}</Link></TableCell>
                          <TableCell className="font-mono">{u.pin}</TableCell>
                          <TableCell>{u.name || '—'}</TableCell>
                          <TableCell className="text-sm">{SOURCE_LABEL[u.source]}</TableCell>
                          <TableCell className="text-sm">{formatDate(u.lastSeenAt)}</TableCell>
                          <TableCell className="space-x-2 text-right">
                            {branchOk && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => setLinking(u)}>Link to member</Button>
                                <Button size="sm" variant="ghost" onClick={() => setDismissing(u)}>Dismiss</Button>
                              </>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
      </div>

      <Dialog open={linking !== null} onOpenChange={(open) => { if (!open) { setLinking(null); setMemberId(''); setSearch('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link PIN {linking?.pin} to a member</DialogTitle>
            <DialogDescription>
              The member takes this device PIN, so the face or fingerprint already on the device opens the door for them. A member who already has a PIN cannot take another one: dismiss this user and enrol the member again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="link-search">Find the member</Label>
            <Input id="link-search" placeholder="Name, email or phone" value={search} onChange={(e) => { setSearch(e.target.value); setMemberId('') }} />
            {members.data?.data?.members && (
              <ul className="max-h-48 space-y-1 overflow-auto" role="listbox" aria-label="Members">
                {members.data.data.members.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={memberId === m.id}
                      className={`w-full rounded px-2 py-1 text-left text-sm ${memberId === m.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                      onClick={() => setMemberId(m.id)}
                    >
                      {m.fullName}{m.email ? ` · ${m.email}` : ''}
                    </button>
                  </li>
                ))}
                {members.data.data.members.length === 0 && <li className="text-sm text-muted-foreground">No member found.</li>}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinking(null)}>Cancel</Button>
            <Button disabled={!memberId} loading={link.isPending} onClick={() => link.mutate()}>Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dismissing !== null} onOpenChange={(open) => { if (!open) { setDismissing(null); setRemoveFromDevice(false) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dismiss PIN {dismissing?.pin}?</DialogTitle>
            <DialogDescription>It disappears from this list. GymsEra never adds it as a member.</DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={removeFromDevice} onChange={(e) => setRemoveFromDevice(e.target.checked)} />
            <span>Also delete this user, and their face or fingerprint, from {dismissing?.deviceName ?? 'the device'}. They can no longer open the door.</span>
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDismissing(null)}>Cancel</Button>
            <Button variant={removeFromDevice ? 'destructive' : 'default'} loading={dismiss.isPending} onClick={() => dismiss.mutate()}>
              {removeFromDevice ? 'Dismiss and delete' : 'Dismiss'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
