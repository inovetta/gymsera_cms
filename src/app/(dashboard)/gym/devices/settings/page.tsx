'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { ErrorState } from '@/components/features/error-state'
import { NoAccess } from '@/components/features/no-access'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { devicesApi } from '@/lib/api/devices'
import { describeRequestError } from '@/lib/api/request-errors'
import { holdsAtBranch } from '@/lib/access/menu'
import { useGymAccess } from '@/hooks/use-gym-access'
import { useToast } from '@/hooks/use-toast'

/**
 * Device settings per branch: capture photos (owner decision D-6: off by default, 30-day retention;
 * turning it off deletes the stored photos) and the owner's device alerts (offline, errors, almost
 * full). Changing them needs "Add and manage access devices" at the branch.
 */
export default function DeviceSettingsPage() {
  const { organization, contextLoading } = useGymAccess()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const branches = (organization?.branches ?? []).filter((b) => holdsAtBranch(organization, b.id, 'devices.view'))
  const [branchId, setBranchId] = useState('')
  const [confirmOff, setConfirmOff] = useState(false)
  useEffect(() => {
    if (!branchId && branches.length) setBranchId(branches[0].id)
  }, [branchId, branches])

  const query = useQuery({
    queryKey: ['device-branch-settings', branchId],
    queryFn: () => devicesApi.branchSettings(branchId),
    enabled: !!branchId,
  })
  const save = useMutation({
    mutationFn: (patch: { capturePhotos?: boolean; alertsEnabled?: boolean }) => devicesApi.saveBranchSettings(branchId, patch),
    onSuccess: (res) => {
      setConfirmOff(false)
      queryClient.setQueryData(['device-branch-settings', branchId], { ...res, data: { settings: res.data.settings } })
      toast({ title: res.data.photosDeleted ? `Saved. ${res.data.photosDeleted} capture photos deleted.` : 'Device settings saved' })
    },
    onError: (err) => toast({ title: describeRequestError(err, 'The settings could not be saved.'), variant: 'destructive' }),
  })

  const back = (
    <Link href="/gym/devices" className="inline-flex items-center text-sm text-primary hover:underline">
      <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />Access devices
    </Link>
  )
  if (!organization && contextLoading) return (<><Header title="Device settings" /><div className="p-6"><Skeleton className="h-24 w-full" /></div></>)
  if (!branches.length) return (<><Header title="Device settings" /><div className="p-6"><NoAccess what="access devices" needs="View access devices" /></div></>)

  const settings = query.data?.data?.settings
  const mayManage = !!branchId && holdsAtBranch(organization, branchId, 'devices.manage')
  return (
    <>
      <Header title="Device settings" />
      <div className="space-y-4 p-6">
        {back}
        <PageHeader title="Device settings" description="Per branch: capture photos and alerts" />
        {branches.length > 1 && (
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="settings-branch" className="font-medium">Branch</label>
            <select id="settings-branch" className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
        {query.error ? <ErrorState error={query.error} what="the device settings" onRetry={() => query.refetch()} />
          : !settings ? <Skeleton className="h-40 w-full" /> : (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Capture photos</CardTitle>
                  <CardDescription>
                    Keep the photo the device takes at each scan, to see who came in. Photos are encrypted, only staff who can see the devices can open them, and they are deleted after {settings.photoRetentionDays} days.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-4">
                  <label htmlFor="capture-photos" className="text-sm">Keep capture photos</label>
                  <Switch
                    id="capture-photos"
                    checked={settings.capturePhotos}
                    disabled={!mayManage || save.isPending}
                    onCheckedChange={(on) => (on ? save.mutate({ capturePhotos: true }) : setConfirmOff(true))}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Alerts to the owner</CardTitle>
                  <CardDescription>A notification when a device goes offline, reports many errors in an hour, or is almost full (90%).</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-4">
                  <label htmlFor="device-alerts" className="text-sm">Send device alerts</label>
                  <Switch
                    id="device-alerts"
                    checked={settings.alertsEnabled}
                    disabled={!mayManage || save.isPending}
                    onCheckedChange={(on) => save.mutate({ alertsEnabled: on })}
                  />
                </CardContent>
              </Card>
              {!mayManage && <p className="text-sm text-muted-foreground lg:col-span-2">You can see these settings; changing them needs &quot;Add and manage access devices&quot; at this branch.</p>}
            </div>
          )}
      </div>
      <Dialog open={confirmOff} onOpenChange={setConfirmOff}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop keeping capture photos?</DialogTitle>
            <DialogDescription>Every capture photo already stored for this branch is deleted now. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOff(false)}>Cancel</Button>
            <Button variant="destructive" loading={save.isPending} onClick={() => save.mutate({ capturePhotos: false })}>Turn off and delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
