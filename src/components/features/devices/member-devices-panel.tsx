'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Fingerprint, RefreshCw, ScanFace, UserX } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ErrorState } from '@/components/features/error-state'
import { devicesApi, MemberDeviceRow } from '@/lib/api/devices'
import { describeRequestError } from '@/lib/api/request-errors'
import { holdsAtBranch, holdsPermission } from '@/lib/access/menu'
import { formatDate } from '@/lib/utils'
import { useGymAccess } from '@/hooks/use-gym-access'
import { useToast } from '@/hooks/use-toast'
import { BIO_TYPE_LABEL, reasonText, SYNC_STATE_LABEL } from './device-copy'
import { DeviceStatusBadge } from './device-ui'
import { PushProgress } from './push-progress'

const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm'

function syncChip(d: MemberDeviceRow) {
  if (!d.entitled) {
    return <Badge variant="outline" className="bg-gray-100 text-gray-800">Not entitled: {reasonText(d.reason)}</Badge>
  }
  if (d.state === 'failed') return <Badge variant="outline" className="bg-red-100 text-red-800">Failed: {reasonText(d.failedReason, d.lastReturnCode)}</Badge>
  if (d.pending || d.state.startsWith('pending')) return <Badge variant="outline" className="bg-yellow-100 text-yellow-800">Pending</Badge>
  if (d.state === 'in_sync') return <Badge variant="outline" className="bg-green-100 text-green-800">In sync</Badge>
  return <Badge variant="outline">{SYNC_STATE_LABEL[d.state] ?? 'Not on device'}</Badge>
}

/**
 * Member profile › Access devices (ZKTeco spec §9.1, §10.4): one row per device of the member's
 * branches with its status, Push now (15-second answer), Remove from device now for someone who is
 * not entitled any more, consent and remote enrolment. The server decides who is entitled; this
 * panel only shows it.
 */
export function MemberDevicesPanel({ memberId }: { memberId: string }) {
  const { organization } = useGymAccess()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [push, setPush] = useState<{ requestId: string; title: string } | null>(null)
  const [consentDialog, setConsentDialog] = useState<'give' | 'withdraw' | null>(null)
  const [enrollDevice, setEnrollDevice] = useState<MemberDeviceRow | null>(null)
  const [enrollType, setEnrollType] = useState('9')

  const query = useQuery({
    queryKey: ['member-devices', memberId],
    queryFn: () => devicesApi.memberStatus(memberId),
    enabled: !!memberId && !!organization,
    refetchInterval: push ? 3000 : 15000,
  })
  const data = query.data?.data
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['member-devices', memberId] })
  const onError = (fallback: string) => (err: unknown) => toast({ title: describeRequestError(err, fallback), variant: 'destructive' })

  const pushMut = useMutation({
    mutationFn: (deviceIds?: string[]) => devicesApi.pushMember(memberId, deviceIds),
    onSuccess: (res) => {
      setPush({ requestId: res.data.requestId, title: 'Push now' })
      if (res.data.reused) toast({ title: 'Already pushing this member. Showing that push.' })
      void refresh()
    },
    onError: onError('The member could not be pushed.'),
  })
  const removeMut = useMutation({
    mutationFn: (deviceIds: string[]) => devicesApi.removeMember(memberId, deviceIds),
    onSuccess: (res) => { setPush({ requestId: res.data.requestId, title: 'Remove from device' }); void refresh() },
    onError: onError('The member could not be removed from the device.'),
  })
  const consentMut = useMutation({
    mutationFn: async (kind: 'give' | 'withdraw'): Promise<void> => {
      if (kind === 'give') await devicesApi.giveConsent(memberId)
      else await devicesApi.withdrawConsent(memberId)
    },
    onSuccess: (_res, kind) => {
      setConsentDialog(null)
      toast({ title: kind === 'give' ? 'Consent recorded' : 'Consent withdrawn. Face, fingerprint and palm data is deleted here and from every device.' })
      void refresh()
    },
    onError: onError('Consent could not be saved.'),
  })
  const enrollMut = useMutation({
    mutationFn: ({ deviceId, type }: { deviceId: string; type: number }) => devicesApi.enroll(memberId, deviceId, type),
    onSuccess: (res) => {
      setEnrollDevice(null)
      setPush({ requestId: res.data.requestId, title: `Enrol on device (PIN ${res.data.pin})` })
    },
    onError: onError('Enrolment could not be started.'),
  })

  if (query.error) return <ErrorState error={query.error} what="this member's access devices" onRetry={() => query.refetch()} />
  if (!data) return <Skeleton className="h-40 w-full" />

  const mayEnroll = holdsPermission(organization, 'biometrics.enroll', 'branch')
  const mayDelete = holdsPermission(organization, 'biometrics.delete', 'branch')
  const pushable = data.devices.filter((d) => d.entitled && holdsAtBranch(organization, d.branchId ?? '', 'devices.push'))
  const consent = data.consent

  return (
    <div className="space-y-4" data-testid="member-devices">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base">Access devices</CardTitle>
            <CardDescription>
              {data.pin ? <>Device PIN <span className="font-mono">{data.pin}</span>. </> : 'No device PIN yet: one is given when the member first qualifies for a device. '}
              Entry rules come from the member&apos;s packages; a push only sends what GymsEra already allows.
            </CardDescription>
          </div>
          {pushable.length > 1 && (
            <Button size="sm" loading={pushMut.isPending} onClick={() => pushMut.mutate(pushable.map((d) => d.deviceId))}>
              <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />Push to all devices
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {push && <PushProgress requestId={push.requestId} title={push.title} />}
          {data.devices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              None of this member&apos;s branches has an access device. <Link className="text-primary hover:underline" href="/gym/devices">Access devices</Link>
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Device status</TableHead>
                  <TableHead>On the device</TableHead>
                  <TableHead>Last synced</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.devices.map((d) => {
                  const mayPush = holdsAtBranch(organization, d.branchId ?? '', 'devices.push')
                  return (
                    <TableRow key={d.deviceId} data-testid={`member-device-${d.deviceId}`}>
                      <TableCell>
                        <Link className="font-medium text-primary hover:underline" href={`/gym/devices/${d.deviceId}`}>{d.name ?? 'Device'}</Link>
                        <div className="text-xs text-muted-foreground">{d.branchName}</div>
                      </TableCell>
                      <TableCell><DeviceStatusBadge device={d} /></TableCell>
                      <TableCell>{syncChip(d)}</TableCell>
                      <TableCell className="text-sm">{d.lastSyncedAt ? formatDate(d.lastSyncedAt) : '—'}</TableCell>
                      <TableCell className="space-x-2 text-right">
                        {mayPush && d.entitled && (
                          <Button size="sm" variant="outline" loading={pushMut.isPending} onClick={() => pushMut.mutate([d.deviceId])}>Push now</Button>
                        )}
                        {mayPush && !d.entitled && d.onDevice && (
                          <Button size="sm" variant="outline" loading={removeMut.isPending} onClick={() => removeMut.mutate([d.deviceId])}>
                            <UserX className="mr-1 h-4 w-4" aria-hidden="true" />Remove from device now
                          </Button>
                        )}
                        {mayEnroll && consent.consented && holdsAtBranch(organization, d.branchId ?? '', 'biometrics.enroll') && (
                          <Button size="sm" variant="ghost" onClick={() => setEnrollDevice(d)}>Enrol on device</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Biometric consent</CardTitle>
          <CardDescription>
            Faces, fingerprints and palms are stored only with the member&apos;s consent. Without it the member uses a card or PIN.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p data-testid="consent-state">
            {consent.consented
              ? `Consent given ${consent.consentedAt ? formatDate(consent.consentedAt) : ''} (${consent.method === 'app' ? 'in the app' : 'in person'}).`
              : 'No consent recorded.'}
            {consent.waitingForConsent > 0 && ` ${consent.waitingForConsent} enrolled on a device, waiting for consent (deleted after 7 days without it).`}
          </p>
          {data.biometrics.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {data.biometrics.map((b) => (
                <li key={b.type}>
                  <Badge variant="outline" className="gap-1">
                    {b.type === 1 ? <Fingerprint className="h-3 w-3" aria-hidden="true" /> : <ScanFace className="h-3 w-3" aria-hidden="true" />}
                    {BIO_TYPE_LABEL[b.type] ?? 'Biometric'}{b.lastEnrolledAt ? ` · ${formatDate(b.lastEnrolledAt)}` : ''}{b.waitingForConsent ? ' · waiting for consent' : ''}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            {!consent.consented && mayEnroll && <Button size="sm" onClick={() => setConsentDialog('give')}>Record consent</Button>}
            {consent.consented && mayDelete && <Button size="sm" variant="destructive" onClick={() => setConsentDialog('withdraw')}>Withdraw consent</Button>}
          </div>
        </CardContent>
      </Card>

      <Dialog open={consentDialog !== null} onOpenChange={(open) => !open && setConsentDialog(null)}>
        <DialogContent>
          {consentDialog === 'give' ? (
            <>
              <DialogHeader>
                <DialogTitle>Record biometric consent</DialogTitle>
                <DialogDescription>
                  Confirm the member agreed, in person, that their face, fingerprint or palm is stored to open the gym&apos;s doors. They can withdraw it at any time; the data is then deleted here and from every device.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConsentDialog(null)}>Cancel</Button>
                <Button loading={consentMut.isPending} onClick={() => consentMut.mutate('give')}>The member agreed</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Withdraw biometric consent?</DialogTitle>
                <DialogDescription>
                  Every face, fingerprint and palm of this member is deleted from GymsEra and from every device now. The member can still enter with a card or PIN.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConsentDialog(null)}>Cancel</Button>
                <Button variant="destructive" loading={consentMut.isPending} onClick={() => consentMut.mutate('withdraw')}>Withdraw and delete</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={enrollDevice !== null} onOpenChange={(open) => !open && setEnrollDevice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enrol on {enrollDevice?.name ?? 'the device'}</DialogTitle>
            <DialogDescription>The device asks the member to look at it or place a finger or palm. Ask them to stand in front of it; you have 60 seconds.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="enroll-type">What to enrol</Label>
            <select id="enroll-type" className={selectClass} value={enrollType} onChange={(e) => setEnrollType(e.target.value)}>
              <option value="9">Face</option>
              <option value="1">Fingerprint</option>
              <option value="10">Palm</option>
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollDevice(null)}>Cancel</Button>
            <Button loading={enrollMut.isPending} onClick={() => enrollDevice && enrollMut.mutate({ deviceId: enrollDevice.deviceId, type: Number(enrollType) })}>Start</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
