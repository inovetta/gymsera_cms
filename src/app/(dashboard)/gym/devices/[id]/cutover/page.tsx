'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { ErrorState } from '@/components/features/error-state'
import { NoAccess } from '@/components/features/no-access'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { CUTOVER_STEP_LABEL, IMPORT_STATUS_LABEL, STEP_STATUS_LABEL, STEP_STATUS_TONE } from '@/components/features/devices/device-copy'
import { Cutover, devicesApi } from '@/lib/api/devices'
import { describeRequestError } from '@/lib/api/request-errors'
import { holdsAtBranch } from '@/lib/access/menu'
import { formatDate } from '@/lib/utils'
import { useGymAccess } from '@/hooks/use-gym-access'
import { useToast } from '@/hooks/use-toast'

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

const stepDetail = (s: Cutover['steps'][number]): string | null => {
  if (s.key === 'matched' && s.count) return `${s.count} not matched`
  if (s.key === 'conflicts' && s.count) return `${s.count} need a decision`
  if (s.key === 'consent' && s.count) return `${s.count} member${s.count === 1 ? '' : 's'} without consent`
  if (s.key === 'capacity' && s.percent !== null && s.percent !== undefined) return `${s.percent}% of the device's users`
  if (s.key === 'verified' && s.of) return `${s.count ?? 0} of ${s.of} confirmed by the device`
  if (s.key === 'gymbiosync_stopped' && s.at) return formatDate(s.at)
  return null
}

/**
 * Cut-over from GymBioSync (ZKTeco spec §15 Phase 4): one checklist per device, from "connected" to
 * "GymBioSync stopped", with the imported, matched and verified counts and the PINs not matched. Go live
 * ends the import: GymsEra decides who the device lets in from then on.
 */
export default function DeviceCutoverPage() {
  const { id } = useParams<{ id: string }>()
  const { organization, contextLoading } = useGymAccess()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [confirm, setConfirm] = useState(false)
  const [removeUnmatched, setRemoveUnmatched] = useState(false)

  const deviceQuery = useQuery({ queryKey: ['device', id], queryFn: () => devicesApi.get(id), enabled: !!id && !!organization })
  const device = deviceQuery.data?.data?.device
  const query = useQuery({ queryKey: ['device-cutover', id], queryFn: () => devicesApi.cutover(id), enabled: !!device, refetchInterval: 5000 })
  const cutover = query.data?.data?.cutover

  const store = (res: Awaited<ReturnType<typeof devicesApi.cutover>>) => {
    queryClient.setQueryData(['device-cutover', id], res)
    void queryClient.invalidateQueries({ queryKey: ['device', id] })
    void queryClient.invalidateQueries({ queryKey: ['device-imports', id] })
  }
  const goLive = useMutation({
    mutationFn: () => devicesApi.goLive(id, removeUnmatched),
    onSuccess: (res) => { store(res); setConfirm(false); toast({ title: 'Live. GymsEra now manages who this device lets in.' }) },
    onError: (err) => toast({ title: describeRequestError(err, 'The device could not go live.'), variant: 'destructive' }),
  })
  const stopped = useMutation({
    mutationFn: () => devicesApi.gymBioSyncStopped(id),
    onSuccess: (res) => { store(res); toast({ title: 'Recorded.' }) },
    onError: (err) => toast({ title: describeRequestError(err, 'That could not be saved.'), variant: 'destructive' }),
  })

  const back = (
    <Link href={`/gym/devices/${id}`} className="inline-flex items-center text-sm text-primary hover:underline">
      <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />Back to the device
    </Link>
  )
  if (deviceQuery.error) return <><Header title="Cut-over" /><div className="space-y-4 p-6">{back}<ErrorState error={deviceQuery.error} what="this device" onRetry={() => deviceQuery.refetch()} /></div></>
  if (contextLoading || !device) return <><Header title="Cut-over" /><div className="space-y-4 p-6">{back}<Skeleton className="h-40 w-full" /></div></>
  if (!holdsAtBranch(organization, device.branchId, 'devices.view')) return <><Header title="Cut-over" /><div className="p-6"><NoAccess what="this device's cut-over" needs="View access devices" /></div></>
  const mayManage = holdsAtBranch(organization, device.branchId, 'devices.manage')
  const live = cutover?.steps.find((s) => s.key === 'live')?.status === 'done'

  return (
    <>
      <Header title="Cut-over" />
      <div className="space-y-4 p-6">
        {back}
        <PageHeader
          title={`Leave GymBioSync: ${device.name ?? device.key}`}
          description="Follow the steps in order. The device keeps letting people in as before until you go live, so there is no gap at the door."
        />
        {query.error ? <ErrorState error={query.error} what="the cut-over" onRetry={() => query.refetch()} /> : !cutover ? <Skeleton className="h-64 w-full" /> : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="cutover-counts">
              <Count label="Users on the device" value={cutover.counts.deviceUsers} />
              <Count label="Imported" value={cutover.counts.imported} />
              <Count label="Matched" value={cutover.counts.matched} />
              <Count label="Not matched" value={cutover.counts.unmatched} />
              <Count label="Need a decision" value={cutover.counts.conflicts} />
              <Count label="Verified on device" value={cutover.counts.verified} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Checklist</CardTitle>
                <CardDescription>
                  {cutover.import ? `Import: ${IMPORT_STATUS_LABEL[cutover.import.status] ?? cutover.import.status}.` : 'No import yet.'}{' '}
                  <Link className="text-primary underline" href={`/gym/devices/${id}/import`}>Open the import</Link>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3" data-testid="cutover-steps">
                  {cutover.steps.map((s, i) => {
                    const label = CUTOVER_STEP_LABEL[s.key] ?? { title: s.key, help: '' }
                    const detail = stepDetail(s)
                    return (
                      <li key={s.key} className="flex flex-wrap items-start justify-between gap-2 border-b pb-3 last:border-0">
                        <div className="max-w-2xl">
                          <div className="font-medium">{i + 1}. {label.title}{detail ? <span className="font-normal text-muted-foreground"> · {detail}</span> : null}</div>
                          <p className="text-sm text-muted-foreground">{label.help}</p>
                          {s.key === 'gymbiosync_stopped' && s.status !== 'done' && live && mayManage && (
                            <Button className="mt-2" size="sm" variant="outline" loading={stopped.isPending} onClick={() => stopped.mutate()}>GymBioSync is stopped</Button>
                          )}
                        </div>
                        <Badge variant="outline" className={STEP_STATUS_TONE[s.status] ?? ''}>{STEP_STATUS_LABEL[s.status] ?? s.status}</Badge>
                      </li>
                    )
                  })}
                </ol>
              </CardContent>
            </Card>

            {cutover.unmatchedPins.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Device users not matched</CardTitle>
                  <CardDescription>
                    They stay on the device and keep their access as GymBioSync left it, with no end date. Match them, or mark them for removal on the import page.
                  </CardDescription>
                </CardHeader>
                <CardContent><p className="font-mono text-sm" data-testid="unmatched-pins">{cutover.unmatchedPins.join(', ')}</p></CardContent>
              </Card>
            )}

            {!live && mayManage && (
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={!cutover.canGoLive} onClick={() => setConfirm(true)}>Go live</Button>
                {!cutover.canGoLive && <span className="text-sm text-muted-foreground">Apply the import first, with no device user waiting for a decision.</span>}
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={confirm} onOpenChange={(open) => { setConfirm(open); if (!open) setRemoveUnmatched(false) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Go live on this device?</DialogTitle>
            <DialogDescription>
              From now on GymsEra decides who this device lets in: packages, freezes and expiries apply. Members are sent with their GymsEra name and dates.
              Device users you marked are removed. A check runs right after and removes matched members who have no active package.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={removeUnmatched} onChange={(e) => setRemoveUnmatched(e.target.checked)} />
            <span>Also remove the {cutover?.counts.unmatched ?? 0} device user{cutover?.counts.unmatched === 1 ? '' : 's'} not matched to a member (device administrators stay).</span>
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>Back</Button>
            <Button loading={goLive.isPending} onClick={() => goLive.mutate()}>Go live</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
