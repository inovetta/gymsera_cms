'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Camera } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/features/empty-state'
import { ErrorState } from '@/components/features/error-state'
import { AccessEvent, devicesApi } from '@/lib/api/devices'
import { describeRequestError } from '@/lib/api/request-errors'
import { formatDate } from '@/lib/utils'
import { ERROR_KIND_LABEL, reasonText, scanOutcomeText, SYNC_STATE_LABEL } from './device-copy'

const selectClass = 'h-9 rounded-md border border-input bg-background px-3 text-sm'

/** Who is on this device, with the sync state of each (spec §10.3 "Sync health"). */
export function DeviceMembersTab({ deviceId }: { deviceId: string }) {
  const [state, setState] = useState('')
  const query = useQuery({
    queryKey: ['device-members', deviceId, state],
    queryFn: () => devicesApi.members(deviceId, state || undefined),
    refetchInterval: 10000,
  })
  if (query.error) return <ErrorState error={query.error} what="the members on this device" onRetry={() => query.refetch()} />
  const data = query.data?.data
  return (
    <div className="space-y-3" data-testid="device-members">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {data && (
          <>
            <Badge variant="outline" className="bg-green-100 text-green-800">{data.counts.inSync} in sync</Badge>
            <Badge variant="outline" className="bg-yellow-100 text-yellow-800">{data.counts.pending} pending</Badge>
            <Badge variant="outline" className="bg-red-100 text-red-800">{data.counts.failed} failed</Badge>
          </>
        )}
        <label className="ml-auto flex items-center gap-2">
          <span className="text-muted-foreground">Show</span>
          <select aria-label="Filter members" className={selectClass} value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">Everyone</option>
            <option value="on_device">On the device</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </label>
      </div>
      {!data ? (
        <Skeleton className="h-32 w-full" />
      ) : data.members.length === 0 ? (
        <EmptyState title="Nobody here yet" description="Members with an active package at this branch are added automatically." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>PIN</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.members.map((m) => (
              <TableRow key={m.memberId}>
                <TableCell>
                  <Link className="text-primary hover:underline" href={`/gym/members/${m.memberId}`}>{m.name ?? 'Member'}</Link>
                  {!m.shouldBeOnDevice && m.state !== 'removed' && <div className="text-xs text-muted-foreground">Being removed</div>}
                </TableCell>
                <TableCell className="font-mono">{m.pin}</TableCell>
                <TableCell>
                  {m.state === 'failed'
                    ? <Badge variant="outline" className="bg-red-100 text-red-800">Failed: {reasonText(m.failedReason, m.lastReturnCode)}</Badge>
                    : <Badge variant="outline">{SYNC_STATE_LABEL[m.state] ?? m.state}</Badge>}
                </TableCell>
                <TableCell className="text-sm">{formatDate(m.updatedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

function CapturePhoto({ photoId }: { photoId: number }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!open || url) return undefined
    let cancelled = false
    devicesApi.capturePhotoUrl(photoId).then((u) => { if (!cancelled) setUrl(u) }).catch((err) => setError(describeRequestError(err, 'The photo could not be loaded.')))
    return () => { cancelled = true }
  }, [open, url, photoId])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  return (
    <>
      <Button size="sm" variant="ghost" aria-label="Show the capture photo" onClick={() => setOpen(true)}><Camera className="h-4 w-4" aria-hidden="true" /></Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Capture photo</DialogTitle></DialogHeader>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Photo the device took at the scan" className="max-h-96 w-full rounded object-contain" />
          ) : <Skeleton className="h-64 w-full" />}
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * The last 50 scans, granted and denied, refreshed every 3 seconds (spec §10.3, §10.5). A scan the
 * device let through but GymsEra did not count (D-5, duplicates) says why.
 */
export function LiveFeed({ deviceId, branchId }: { deviceId?: string; branchId?: string }) {
  const query = useQuery({
    queryKey: ['access-events', deviceId ?? null, branchId ?? null],
    queryFn: () => (deviceId ? devicesApi.accessEvents(deviceId) : devicesApi.branchAccessEvents(branchId as string)),
    enabled: !!(deviceId || branchId),
    refetchInterval: 3000,
  })
  if (query.error) return <ErrorState error={query.error} what="the live feed" onRetry={() => query.refetch()} />
  const events: AccessEvent[] | undefined = query.data?.data?.events
  if (!events) return <Skeleton className="h-32 w-full" />
  if (!events.length) return <EmptyState title="No scans yet" description="Scans appear here a few seconds after someone uses the device." />
  return (
    <Table data-testid="live-feed">
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Who</TableHead>
          {!deviceId && <TableHead>Device</TableHead>}
          <TableHead>Result</TableHead>
          <TableHead className="w-12" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((e) => (
          <TableRow key={e.id}>
            <TableCell className="whitespace-nowrap text-sm">{e.localTime}</TableCell>
            <TableCell>
              {e.memberId ? <Link className="text-primary hover:underline" href={`/gym/members/${e.memberId}`}>{e.memberName ?? 'Member'}</Link>
                : <span className="text-muted-foreground">{e.pin ? `Device user ${e.pin}` : '—'}</span>}
            </TableCell>
            {!deviceId && <TableCell className="text-sm">{e.deviceName}</TableCell>}
            <TableCell>
              <Badge variant="outline" className={e.result === 'granted' ? (e.checkedIn ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900') : 'bg-red-100 text-red-800'}>
                {scanOutcomeText(e)}
              </Badge>
            </TableCell>
            <TableCell>{e.photoId && <CapturePhoto photoId={e.photoId} />}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** The device's errorlog uploads and what GymsEra saw go wrong. */
export function DeviceErrorsTab({ deviceId }: { deviceId: string }) {
  const query = useQuery({ queryKey: ['device-errors', deviceId], queryFn: () => devicesApi.errors(deviceId), refetchInterval: 15000 })
  if (query.error) return <ErrorState error={query.error} what="the device errors" onRetry={() => query.refetch()} />
  const errors = query.data?.data?.errors
  if (!errors) return <Skeleton className="h-32 w-full" />
  if (!errors.length) return <EmptyState title="No errors" description="Nothing has gone wrong on this device." />
  return (
    <Table data-testid="device-errors">
      <TableHeader>
        <TableRow><TableHead>When</TableHead><TableHead>What</TableHead><TableHead>Code</TableHead><TableHead>From</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        {errors.map((e) => (
          <TableRow key={e.id}>
            <TableCell className="whitespace-nowrap text-sm">{formatDate(e.occurredAt)}</TableCell>
            <TableCell className="text-sm">{ERROR_KIND_LABEL[e.kind] ?? 'Error'}{e.source === 'device' && e.message ? `: ${e.message}` : ''}</TableCell>
            <TableCell className="font-mono text-sm">{e.code ?? '—'}</TableCell>
            <TableCell className="text-sm">{e.source === 'device' ? 'Device' : 'GymsEra'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

const AUDIT_STATUS: Record<string, string> = {
  requested: 'Asked, waiting for the device',
  receiving: 'Receiving the user list',
  compared: 'Done',
  incomplete: 'Incomplete: the device did not send its user list',
}

const ACTION_LABEL: Record<string, string> = {
  'devices.push': 'Push asked',
  'devices.push_result': 'Push finished',
  'devices.audit_requested': 'Full audit asked',
  'devices.unlinked_linked': 'Device user linked to a member',
  'devices.unlinked_dismissed': 'Device user dismissed',
  'devices.removed': 'Removed',
  'devices.removed_with_wipe': 'Removed with wipe',
  'devices.branch_settings': 'Branch device settings changed',
}

/** Nightly audit reports (layer 3) and who did what to this device. */
export function DeviceAuditTab({ deviceId }: { deviceId: string }) {
  const query = useQuery({ queryKey: ['device-audits', deviceId], queryFn: () => devicesApi.audits(deviceId), refetchInterval: 15000 })
  if (query.error) return <ErrorState error={query.error} what="the audit reports" onRetry={() => query.refetch()} />
  const data = query.data?.data
  if (!data) return <Skeleton className="h-32 w-full" />
  return (
    <div className="space-y-6" data-testid="device-audit">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Full audits</h3>
        {data.reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">No audit yet. The device is checked every night at 02:00 branch time.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Started</TableHead><TableHead>Status</TableHead><TableHead>On device</TableHead><TableHead>Expected</TableHead><TableHead>Fixed</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {data.reports.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-sm">{formatDate(r.startedAt)}</TableCell>
                  <TableCell className="text-sm">{AUDIT_STATUS[r.status] ?? r.status}</TableCell>
                  <TableCell>{r.deviceUserCount ?? '—'}</TableCell>
                  <TableCell>{r.desiredCount ?? '—'}</TableCell>
                  <TableCell className="text-sm">
                    {r.status === 'compared'
                      ? `${r.extraCount ?? 0} removed, ${r.missingCount ?? 0} sent again, ${r.unlinkedCount ?? 0} unlinked`
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Activity</h3>
        {data.activity.length === 0 ? <p className="text-sm text-muted-foreground">No activity recorded yet.</p> : (
          <ul className="space-y-1 text-sm">
            {data.activity.map((a, i) => (
              <li key={`${a.at}-${i}`} className="flex flex-wrap justify-between gap-2">
                <span>{ACTION_LABEL[a.action] ?? 'Change'}{a.result ? ` (${a.result === 'done' ? 'finished' : a.result === 'timed_out' ? 'no answer in time' : a.result})` : ''}</span>
                <span className="text-muted-foreground">{a.actorName ?? 'GymsEra'} · {formatDate(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
