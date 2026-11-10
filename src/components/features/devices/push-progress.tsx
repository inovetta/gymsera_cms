'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { devicesApi, PushStatus } from '@/lib/api/devices'
import { describeRequestError } from '@/lib/api/request-errors'
import { PUSH_STATE_TONE, pushStateText } from './device-copy'

/**
 * Polls a push request every second until it is done or its 15 seconds (60 for an enrolment)
 * are over (spec §9.2). After that it keeps the last answer on screen; the commands stay queued
 * on the server and the member card shows when they land.
 */
export function usePushRequest(requestId: string | null) {
  const [stopped, setStopped] = useState(false)
  useEffect(() => setStopped(false), [requestId])
  const query = useQuery({
    queryKey: ['device-push', requestId],
    queryFn: () => devicesApi.pushStatus(requestId as string),
    enabled: !!requestId,
    refetchInterval: stopped ? false : 1000,
  })
  const status: PushStatus | undefined = query.data?.data
  useEffect(() => {
    if (status && status.status !== 'running') setStopped(true)
  }, [status])
  return { status, error: query.error, running: !!requestId && !stopped }
}

export function PushProgress({ requestId, title }: { requestId: string; title?: string }) {
  const { status, error, running } = usePushRequest(requestId)
  if (error) return <p role="alert" className="text-sm text-destructive">{describeRequestError(error, 'The push status could not be loaded.')}</p>
  if (!status) return <p className="text-sm text-muted-foreground">Sending…</p>
  const total = Math.max(1, new Date(status.deadlineAt).getTime() - new Date(status.createdAt).getTime())
  const elapsed = Math.min(100, Math.round(((total - status.secondsLeft * 1000) / total) * 100))
  return (
    <div data-testid="push-progress" className="space-y-2 rounded-md border p-3" aria-live="polite">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{title ?? 'Push'}</span>
        <span className="text-muted-foreground">
          {status.status === 'done' ? 'Finished' : status.status === 'timed_out' ? 'Time is up' : `${status.secondsLeft} s left`}
        </span>
      </div>
      {running && status.status === 'running' && <Progress value={elapsed} aria-label="Time waited for the devices" />}
      <ul className="space-y-1">
        {status.devices.map((d) => (
          <li key={d.deviceId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium">{d.name ?? 'Device'}</span>
            <span className="flex items-center gap-2">
              {d.progress && d.progress.total > 0 && (
                <span className="text-muted-foreground">{d.progress.done} of {d.progress.total} done{d.progress.failed ? `, ${d.progress.failed} failed` : ''}</span>
              )}
              <Badge variant="outline" className={PUSH_STATE_TONE[d.state]}>{pushStateText(d, status.kind)}</Badge>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
