'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { NoAccess } from '@/components/features/no-access'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { SetupCard } from '@/components/features/devices/device-ui'
import { AccessDevice, DeviceDirection, DeviceLinkMode, DeviceSetup, devicesApi } from '@/lib/api/devices'
import { describeRequestError } from '@/lib/api/request-errors'
import { holdsAtBranch } from '@/lib/access/menu'
import { useGymAccess } from '@/hooks/use-gym-access'

const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm'

/**
 * Add device (ZKTeco spec §10.2): 1 branch, name, direction (and, rarely, how it connects);
 * 2 the setup card to type on the device; 3 a live wait for its first contact (polled every 2 s),
 * then what the device reported about itself.
 */
export default function NewDevicePage() {
  const { organization, contextLoading } = useGymAccess()
  const branches = (organization?.branches ?? []).filter((b) => holdsAtBranch(organization, b.id, 'devices.manage'))

  const [branchId, setBranchId] = useState('')
  const [name, setName] = useState('')
  const [direction, setDirection] = useState<DeviceDirection>('in')
  const [linkMode, setLinkMode] = useState<DeviceLinkMode | ''>('')
  const [serialNumber, setSerialNumber] = useState('')
  const [created, setCreated] = useState<{ device: AccessDevice; setup: DeviceSetup } | null>(null)

  useEffect(() => {
    if (!branchId && branches.length) setBranchId(branches[0].id)
  }, [branchId, branches])

  const create = useMutation({
    mutationFn: () =>
      devicesApi.create({
        branchId,
        name: name.trim(),
        direction,
        ...(linkMode ? { linkMode } : {}),
        ...(linkMode === 'serial' ? { serialNumber: serialNumber.trim() } : {}),
      }),
    onSuccess: (res) => setCreated(res.data ?? null),
  })

  const waiting = useQuery({
    queryKey: ['device', created?.device.id],
    queryFn: () => devicesApi.get(created!.device.id),
    enabled: !!created,
    refetchInterval: (q) => (q.state.data?.data?.device.connection === 'awaiting_connection' || !q.state.data ? 2000 : false),
  })

  if (!organization && contextLoading) {
    return (
      <>
        <Header title="Add device" />
        <div className="p-6"><Skeleton className="h-40 w-full" /></div>
      </>
    )
  }
  if (!branches.length) {
    return (
      <>
        <Header title="Add device" />
        <div className="p-6"><NoAccess what="adding access devices" needs="Add and manage access devices" /></div>
      </>
    )
  }

  if (created) {
    const live = waiting.data?.data?.device ?? created.device
    const connected = live.connection !== 'awaiting_connection'
    return (
      <>
        <Header title="Add device" />
        <div className="max-w-2xl space-y-4 p-6">
          <PageHeader title={`Device added: ${live.name ?? ''}`} description={`Branch: ${live.branchName ?? ''}`} />
          <SetupCard setup={waiting.data?.data?.setup ?? created.setup} />
          {connected ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
              <AlertDescription>
                <p className="font-medium">Connected</p>
                <p>{[live.model, live.firmware].filter(Boolean).join(' · ')}</p>
                {live.capabilities && (
                  <p className="text-muted-foreground">
                    {[live.capabilities.face && 'Face', live.capabilities.fingerprint && 'Fingerprint', live.capabilities.palm && 'Palm'].filter(Boolean).join(', ')}
                  </p>
                )}
              </AlertDescription>
            </Alert>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Waiting for the device to connect… It turns green within about 10 seconds of saving the settings on the device.
            </p>
          )}
          <Link href={`/gym/devices/${live.id}`} className={buttonVariants({ variant: 'outline' })}>Open device page</Link>
        </div>
      </>
    )
  }

  return (
    <>
      <Header title="Add device" />
      <div className="max-w-2xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Add a device</CardTitle>
            <CardDescription>A face, fingerprint or card terminal at one branch. You get the settings to enter on it next.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                create.mutate()
              }}
            >
              <div className="space-y-1">
                <Label htmlFor="device-branch">Branch</Label>
                <select id="device-branch" className={selectClass} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="device-name">Device name</Label>
                <Input id="device-name" value={name} maxLength={100} placeholder="Front door IN" onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="device-direction">Direction</Label>
                <select id="device-direction" className={selectClass} value={direction} onChange={(e) => setDirection(e.target.value as DeviceDirection)}>
                  <option value="in">Check-in</option>
                  <option value="out">Check-out</option>
                  <option value="both">Check-in and out</option>
                </select>
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">How the device connects (leave as recommended)</summary>
                <div className="mt-2 space-y-2">
                  <Label htmlFor="device-link-mode">Connection</Label>
                  <select id="device-link-mode" className={selectClass} value={linkMode} onChange={(e) => setLinkMode(e.target.value as DeviceLinkMode | '')}>
                    <option value="">Recommended</option>
                    <option value="host">Device key in the domain name</option>
                    <option value="path">Device key in the address path</option>
                    <option value="serial">Serial number (only if GymsEra support enabled it)</option>
                  </select>
                  {linkMode === 'serial' && (
                    <>
                      <Label htmlFor="device-serial">Serial number</Label>
                      <Input id="device-serial" value={serialNumber} maxLength={32} onChange={(e) => setSerialNumber(e.target.value)} />
                    </>
                  )}
                </div>
              </details>
              {create.error && (
                <Alert variant="destructive">
                  <AlertDescription>{describeRequestError(create.error, 'The device could not be added. Please try again.')}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" loading={create.isPending} disabled={!branchId}>
                Create device
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
