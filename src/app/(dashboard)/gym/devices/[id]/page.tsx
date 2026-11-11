'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, ClipboardCheck, RefreshCw } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { ErrorState } from '@/components/features/error-state'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConnectionBadge, DeviceStatusBadge, DIRECTION_LABEL, SetupCard, agoText } from '@/components/features/devices/device-ui'
import { DeviceAuditTab, DeviceCommandsTab, DeviceErrorsTab, DeviceMembersTab, LiveFeed } from '@/components/features/devices/device-tabs'
import { PushProgress } from '@/components/features/devices/push-progress'
import { AccessDevice, DeviceDirection, DeviceSetup, devicesApi } from '@/lib/api/devices'
import { describeRequestError } from '@/lib/api/request-errors'
import { holdsAtBranch, holdsPermission } from '@/lib/access/menu'
import { formatDate } from '@/lib/utils'
import { useGymAccess } from '@/hooks/use-gym-access'
import { useToast } from '@/hooks/use-toast'

const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm'

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value ?? '—'}</span>
    </div>
  )
}

/**
 * Device page (ZKTeco spec §9.1, §10.3): status, Sync now (15-second answer) and Full audit, and the
 * tabs Members on device, Live feed (3-second refresh), Errors and Audit. Remove can wipe the device
 * (every GymsEra user deleted from it) after the person types the device name.
 */
export default function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { organization } = useGymAccess()
  const [confirm, setConfirm] = useState<'repair' | 'remove' | 'move' | null>(null)
  const [moveTo, setMoveTo] = useState('')
  const [wipe, setWipe] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const [push, setPush] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [direction, setDirection] = useState<DeviceDirection>('in')

  const query = useQuery({
    queryKey: ['device', id],
    queryFn: () => devicesApi.get(id),
    enabled: !!id && !!organization,
    refetchInterval: 5000,
  })
  const device: AccessDevice | undefined = query.data?.data?.device
  const setup: DeviceSetup | undefined = query.data?.data?.setup

  useEffect(() => {
    if (device) {
      setName(device.name ?? '')
      setDirection(device.direction ?? 'in')
    }
    // Only when another device is loaded, not on every refresh (it would undo typing).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device?.id])

  const store = (res: Awaited<ReturnType<typeof devicesApi.get>>) => {
    queryClient.setQueryData(['device', id], res)
    void queryClient.invalidateQueries({ queryKey: ['devices'] })
  }
  const onError = (fallback: string) => (err: unknown) =>
    toast({ title: describeRequestError(err, fallback), variant: 'destructive' })

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof devicesApi.update>[1]) => devicesApi.update(id, patch),
    onSuccess: (res) => { store(res); toast({ title: 'Device saved' }) },
    onError: onError('The device could not be saved.'),
  })
  const repair = useMutation({
    mutationFn: () => devicesApi.repair(id),
    onSuccess: (res) => { store(res); setConfirm(null); toast({ title: 'New key created. Enter the new settings on the device.' }) },
    onError: onError('A new key could not be created.'),
  })
  const remove = useMutation({
    mutationFn: () => devicesApi.remove(id, wipe ? { confirmName } : undefined),
    onSuccess: (res) => {
      setConfirm(null)
      void queryClient.invalidateQueries({ queryKey: ['devices'] })
      if (res.data.status === 'wiping') {
        void queryClient.invalidateQueries({ queryKey: ['device', id] })
        toast({ title: 'The device deletes its GymsEra users the next time it connects, then it is removed.' })
        return
      }
      toast({ title: 'Device removed from GymsEra' })
      router.push('/gym/devices')
    },
    onError: onError('The device could not be removed.'),
  })
  const move = useMutation({
    mutationFn: () => devicesApi.move(id, moveTo),
    onSuccess: (res) => {
      store(res)
      setConfirm(null)
      setMoveTo('')
      toast({ title: `Moved to ${res.data.device.branchName ?? 'the new branch'}. The old branch's members are being removed and the new branch's sent.` })
    },
    onError: onError('The device could not be moved.'),
  })
  const sync = useMutation({
    mutationFn: (mode: 'quick' | 'audit') => devicesApi.sync(id, mode),
    onSuccess: (res, mode) => {
      if (mode === 'audit') {
        toast({ title: 'Full audit asked. The report appears in the Audit tab in 1 to 3 minutes.' })
        void queryClient.invalidateQueries({ queryKey: ['device-audits', id] })
        return
      }
      setPush(res.data.requestId)
    },
    onError: onError('The device could not be synced.'),
  })

  const back = (
    <Link href="/gym/devices" className="inline-flex items-center text-sm text-primary hover:underline">
      <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />Access devices
    </Link>
  )

  if (query.error) {
    return (
      <>
        <Header title="Device" />
        <div className="space-y-4 p-6">{back}<ErrorState error={query.error} what="this device" onRetry={() => query.refetch()} /></div>
      </>
    )
  }
  if (!device || !setup) {
    return (
      <>
        <Header title="Device" />
        <div className="space-y-4 p-6">{back}<Skeleton className="h-40 w-full" /></div>
      </>
    )
  }

  const mayManage = holdsAtBranch(organization, device.branchId, 'devices.manage')
  const mayPush = holdsAtBranch(organization, device.branchId, 'devices.push')
  const wiping = device.connection === 'wiping'
  const mayRepair = holdsPermission(organization, 'devices.manage', 'org') && device.linkMode !== 'serial'
  const held = Boolean(device.importHold)
  // Move: devices.manage at this branch and at the new one.
  const moveTargets = (organization?.branches ?? []).filter((b) => b.id !== device.branchId && holdsAtBranch(organization, b.id, 'devices.manage'))
  const caps = device.capabilities
  const capList = caps ? [caps.face && 'Face', caps.fingerprint && 'Fingerprint', caps.palm && 'Palm'].filter(Boolean).join(', ') : null
  const seen = agoText(device.lastSeenSecondsAgo)

  return (
    <>
      <Header title="Device" />
      <div className="space-y-4 p-6">
        {back}
        <PageHeader title={device.name ?? device.key} description={`${device.branchName ?? ''}${device.direction ? ` · ${DIRECTION_LABEL[device.direction]}` : ''}`} />

        {device.serialMismatch && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Another device tried to use this key</AlertTitle>
            <AlertDescription>
              Serial number {device.serialMismatch.serialNumber} was refused on {formatDate(device.serialMismatch.at)}. If you replaced the device, re-pair it to get a new key.
            </AlertDescription>
          </Alert>
        )}

        {wiping && (
          <Alert>
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Wiping this device</AlertTitle>
            <AlertDescription>
              The device deletes every GymsEra user the next time it connects, then it is removed from GymsEra. If it never connects again it is removed after 7 days.
            </AlertDescription>
          </Alert>
        )}

        {held && (
          <Alert data-testid="import-hold">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Import in progress</AlertTitle>
            <AlertDescription>
              This device keeps the users GymBioSync put on it and gets nothing from GymsEra until you go live.{' '}
              <Link className="text-primary underline" href={`/gym/devices/${device.id}/import`}>Import</Link>
              {' · '}
              <Link className="text-primary underline" href={`/gym/devices/${device.id}/cutover`}>Cut-over checklist</Link>
            </AlertDescription>
          </Alert>
        )}

        {!wiping && !held && (mayPush || mayManage) && device.enabled && (
          <div className="flex flex-wrap items-center gap-2">
            {mayPush && (
              <Button size="sm" loading={sync.isPending && sync.variables === 'quick'} onClick={() => sync.mutate('quick')}>
                <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />Sync now
              </Button>
            )}
            {mayManage && (
              <Button size="sm" variant="outline" loading={sync.isPending && sync.variables === 'audit'} onClick={() => sync.mutate('audit')}>
                <ClipboardCheck className="mr-1 h-4 w-4" aria-hidden="true" />Run full audit
              </Button>
            )}
          </div>
        )}
        {push && <PushProgress requestId={push} title="Sync now" />}

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="members">Members on device</TabsTrigger>
            <TabsTrigger value="feed">Live feed</TabsTrigger>
            <TabsTrigger value="commands">Commands</TabsTrigger>
            <TabsTrigger value="errors">Errors</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Status</CardTitle></CardHeader>
                <CardContent>
                  <Field label="Status" value={<DeviceStatusBadge device={device} />} />
                  <Field label="Last seen" value={device.lastSeenAt ? `${formatDate(device.lastSeenAt)}${seen ? ` (${seen})` : ''}` : 'Never'} />
                  <Field label="IP address" value={device.lastIp} />
                  <Field label="Connection" value={<ConnectionBadge encrypted={device.encrypted} />} />
                  <Field label="Serial number" value={device.serialNumber} />
                  <Field label="Device key" value={<span className="font-mono">{device.key}</span>} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Device</CardTitle></CardHeader>
                <CardContent>
                  <Field label="Model" value={device.model} />
                  <Field label="Firmware" value={device.firmware} />
                  <Field label="Protocol" value={device.pushVersion} />
                  <Field label="Can read" value={capList || null} />
                  <Field label="Users on device" value={device.counts.users !== null ? `${device.counts.users}${device.counts.maxUsers ? ` of ${device.counts.maxUsers}` : ''}` : null} />
                  <Field label="Faces" value={device.counts.faces} />
                  <Field label="Fingerprints" value={device.counts.fingerprints} />
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Settings on the device</CardTitle>
                <CardDescription>What was entered on the device to connect it to GymsEra.</CardDescription>
              </CardHeader>
              <CardContent><SetupCard setup={setup} /></CardContent>
            </Card>

            {mayManage && !wiping && (
              <Card>
                <CardHeader><CardTitle>Manage</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <form
                    className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
                    onSubmit={(e) => {
                      e.preventDefault()
                      save.mutate({ name: name.trim(), direction })
                    }}
                  >
                    <div className="space-y-1">
                      <Label htmlFor="device-name">Device name</Label>
                      <Input id="device-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="device-direction">Direction</Label>
                      <select id="device-direction" className={selectClass} value={direction} onChange={(e) => setDirection(e.target.value as DeviceDirection)}>
                        <option value="in">Check-in</option>
                        <option value="out">Check-out</option>
                        <option value="both">Check-in and out</option>
                      </select>
                    </div>
                    <Button type="submit" loading={save.isPending}>Save</Button>
                  </form>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => save.mutate({ enabled: !device.enabled })}>
                      {device.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    {mayRepair && <Button variant="outline" onClick={() => setConfirm('repair')}>Re-pair</Button>}
                    {!held && moveTargets.length > 0 && <Button variant="outline" onClick={() => setConfirm('move')}>Move to another branch</Button>}
                    {!held && (
                      <Link className={buttonVariants({ variant: 'outline' })} href={`/gym/devices/${device.id}/import`}>Import from device</Link>
                    )}
                    {device.liveAt && !held && (
                      <Link className={buttonVariants({ variant: 'ghost' })} href={`/gym/devices/${device.id}/cutover`}>Cut-over checklist</Link>
                    )}
                    <Button variant="destructive" onClick={() => setConfirm('remove')}>Remove</Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
          <TabsContent value="members" className="mt-4"><DeviceMembersTab deviceId={device.id} /></TabsContent>
          <TabsContent value="feed" className="mt-4"><LiveFeed deviceId={device.id} /></TabsContent>
          <TabsContent value="commands" className="mt-4"><DeviceCommandsTab deviceId={device.id} /></TabsContent>
          <TabsContent value="errors" className="mt-4"><DeviceErrorsTab deviceId={device.id} /></TabsContent>
          <TabsContent value="audit" className="mt-4"><DeviceAuditTab deviceId={device.id} /></TabsContent>
        </Tabs>
      </div>

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          {confirm === 'move' ? (
            <>
              <DialogHeader>
                <DialogTitle>Move this device to another branch?</DialogTitle>
                <DialogDescription>
                  The device then lets in the new branch&apos;s members only. The current branch&apos;s members are removed from it at once, and the new branch&apos;s members are sent. Its key and settings stay the same.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1">
                <Label htmlFor="move-branch">New branch</Label>
                <select id="move-branch" className={selectClass} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                  <option value="">Choose a branch</option>
                  {moveTargets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
                <Button disabled={!moveTo} loading={move.isPending} onClick={() => move.mutate()}>Move device</Button>
              </DialogFooter>
            </>
          ) : confirm === 'repair' ? (
            <>
              <DialogHeader>
                <DialogTitle>Re-pair this device?</DialogTitle>
                <DialogDescription>
                  GymsEra creates a new device key and forgets the serial number. The current key stops working at once, so the device goes offline until the new settings are entered on it. Use this after replacing a broken device.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
                <Button loading={repair.isPending} onClick={() => repair.mutate()}>Create new key</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Remove this device?</DialogTitle>
                <DialogDescription>
                  The device stops talking to GymsEra and its key stops working. Without a wipe, users already on the device stay there until you delete them on the device.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={wipe} onChange={(e) => { setWipe(e.target.checked); setConfirmName('') }} />
                  <span>Also delete every user, face, fingerprint and palm from the device (wipe). Use this before giving the device away or moving it to another gym.</span>
                </label>
                {wipe && (
                  <div className="space-y-1">
                    <Label htmlFor="wipe-confirm">Type the device name to confirm: <span className="font-semibold">{device.name}</span></Label>
                    <Input id="wipe-confirm" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
                <Button
                  variant="destructive"
                  loading={remove.isPending}
                  disabled={wipe && confirmName.trim().toLowerCase() !== (device.name ?? '').trim().toLowerCase()}
                  onClick={() => remove.mutate()}
                >
                  {wipe ? 'Wipe and remove' : 'Remove device'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
