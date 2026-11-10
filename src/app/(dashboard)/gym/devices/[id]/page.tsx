'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { ErrorState } from '@/components/features/error-state'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { ConnectionBadge, DeviceStatusBadge, DIRECTION_LABEL, SetupCard, agoText } from '@/components/features/devices/device-ui'
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
 * Device page (ZKTeco spec §10.3, Phase 1: status only). Sync health, the command log and the live
 * feed come with the sync engine (Phase 2 and 3).
 */
export default function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { organization } = useGymAccess()
  const [confirm, setConfirm] = useState<'repair' | 'remove' | null>(null)
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
    mutationFn: () => devicesApi.remove(id),
    onSuccess: () => {
      setConfirm(null)
      void queryClient.invalidateQueries({ queryKey: ['devices'] })
      toast({ title: 'Device removed from GymsEra' })
      router.push('/gym/devices')
    },
    onError: onError('The device could not be removed.'),
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
  const mayRepair = holdsPermission(organization, 'devices.manage', 'org') && device.linkMode !== 'serial'
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

        {mayManage && (
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
                <Button variant="destructive" onClick={() => setConfirm('remove')}>Remove</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          {confirm === 'repair' ? (
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
                  The device stops talking to GymsEra and its key stops working. Users already on the device stay there until you delete them on the device.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
                <Button variant="destructive" loading={remove.isPending} onClick={() => remove.mutate()}>Remove device</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
