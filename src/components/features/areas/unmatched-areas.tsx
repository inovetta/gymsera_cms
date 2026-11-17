'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPin, RotateCw, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/features/empty-state'
import { ErrorState } from '@/components/features/error-state'
import { MapPicker } from '@/components/features/map-picker'
import { areaRequestsApi, AreaDecision, AreaRequestGroup, AreaRequestStatus } from '@/lib/api/area-requests'
import { citiesApi } from '@/lib/api/cities'
import { describeRequestError } from '@/lib/api/request-errors'
import { useToast } from '@/hooks/use-toast'
import { City } from '@/types'

/**
 * NEW-265 Part A (A6, A7, R-108, R-110): CMS › Cities & Areas › Unmatched areas. Typed areas and
 * Google roads / landmarks waiting for review, grouped by city and spelling, with the gyms waiting on
 * them. Approve (a new area; the pin is optional, R-110), merge into an existing area of the city, or
 * reject with a reason; the decision is written to every gym waiting on it, and a write that failed
 * can be retried.
 */
const STATUSES: { value: AreaRequestStatus; label: string }[] = [
  { value: 'pending_review', label: 'Waiting for review' },
  { value: 'approved', label: 'Approved' },
  { value: 'merged', label: 'Merged' },
  { value: 'rejected', label: 'Rejected' },
]
const SOURCE_LABEL: Record<string, string> = { typed: 'Typed', google_road: 'Google road', google_landmark: 'Google landmark' }

const mapsLink = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`

type Dialogs = { kind: 'approve' | 'merge' | 'reject'; group: AreaRequestGroup } | null

export function UnmatchedAreas({ cities }: { cities: City[] }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<AreaRequestStatus>('pending_review')
  const [cityId, setCityId] = useState<number | undefined>(undefined)
  const [dialog, setDialog] = useState<Dialogs>(null)
  // A write that failed stays visible (not only in a toast) until the next decision.
  const [notice, setNotice] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['area-requests', status, cityId],
    queryFn: () => areaRequestsApi.list({ status, ...(cityId ? { cityId } : {}) }),
  })
  const groups = query.data?.data?.groups ?? []

  const afterDecision = (title: string, result?: AreaDecision) => {
    queryClient.invalidateQueries({ queryKey: ['area-requests'] })
    queryClient.invalidateQueries({ queryKey: ['areas'] })
    queryClient.invalidateQueries({ queryKey: ['cities'] })
    setDialog(null)
    const failed = result?.failed?.length ?? 0
    setNotice(failed ? `${failed} gym${failed === 1 ? '' : 's'} could not be updated. Use Retry in the Approved or Merged list.` : null)
    toast({
      title,
      ...(failed
        ? { description: `${failed} gym${failed === 1 ? '' : 's'} could not be updated. Use Retry in the Approved or Merged list.`, variant: 'destructive' as const }
        : {}),
    })
  }

  const retry = useMutation({
    mutationFn: (id: number) => areaRequestsApi.retry(id),
    onSuccess: (res) => afterDecision('Retried', { decided: 0, failed: res.data?.failed }),
    onError: (err) => toast({ title: 'Could not retry', description: describeRequestError(err, 'Please try again.'), variant: 'destructive' }),
  })

  return (
    <div className="space-y-4" data-testid="unmatched-areas">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="area-requests-status">Status</Label>
          <select
            id="area-requests-status"
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as AreaRequestStatus)}
          >
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="area-requests-city">City</Label>
          <select
            id="area-requests-city"
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={cityId ?? ''}
            onChange={(e) => setCityId(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">All cities</option>
            {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {notice && <p role="status" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{notice}</p>}

      {query.isLoading ? (
        <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-lg" />)}</div>
      ) : query.error ? (
        <ErrorState error={query.error} what="the area requests" onRetry={() => query.refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState icon={MapPin} title="Nothing here" description={status === 'pending_review' ? 'No area is waiting for review.' : 'No area requests with this status.'} />
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <Card key={g.requestIds[0]} data-testid={`area-request-group-${g.requestIds[0]}`}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{g.name}</span>
                      <Badge variant="secondary" className="text-xs">{SOURCE_LABEL[g.source] ?? g.source}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {g.cityName ?? `City ${g.cityId}`} · {g.gymCount} gym{g.gymCount === 1 ? '' : 's'} · first asked {new Date(g.firstRequestedAt).toLocaleDateString()}
                    </p>
                    <p className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Users className="h-3.5 w-3.5" /> {g.requestedBy.map((u) => u.name || 'Unknown').join(', ')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {status === 'pending_review' ? (
                      <>
                        <Button size="sm" onClick={() => setDialog({ kind: 'approve', group: g })}>Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'merge', group: g })}>Merge</Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDialog({ kind: 'reject', group: g })}>Reject</Button>
                      </>
                    ) : status === 'approved' || status === 'merged' ? (
                      <Button size="sm" variant="outline" loading={retry.isPending} onClick={() => retry.mutate(g.requestIds[0])}>
                        <RotateCw className="mr-1 h-3.5 w-3.5" /> Retry failed updates
                      </Button>
                    ) : null}
                  </div>
                </div>

                {g.gyms.length > 0 && (
                  <ul className="space-y-1 text-sm">
                    {g.gyms.map((gym, i) => (
                      <li key={`${gym.tenantId}-${gym.listingId ?? ''}-${gym.branchId ?? ''}-${i}`} className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{gym.title ?? 'Unnamed gym'}</span>
                        {gym.latitude != null && gym.longitude != null && (
                          <a className="text-xs underline" href={mapsLink(gym.latitude, gym.longitude)} target="_blank" rel="noreferrer" aria-label={`${gym.title ?? 'Gym'} on the map`}>
                            map
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {g.similar.length > 0 && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Similar areas: </span>
                    {g.similar.map((s) => s.name).join(', ')}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {dialog?.kind === 'approve' && <ApproveDialog group={dialog.group} onClose={() => setDialog(null)} onDone={(r) => afterDecision('Area approved', r)} />}
      {dialog?.kind === 'merge' && <MergeDialog group={dialog.group} onClose={() => setDialog(null)} onDone={(r) => afterDecision('Area merged', r)} />}
      {dialog?.kind === 'reject' && <RejectDialog group={dialog.group} onClose={() => setDialog(null)} onDone={(r) => afterDecision('Area rejected', r)} />}
    </div>
  )
}

function GroupCheckbox({ id, checked, onChange, count }: { id: string; checked: boolean; onChange: (v: boolean) => void; count: number }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      Apply to every request with this spelling ({count})
    </label>
  )
}

function ApproveDialog({ group, onClose, onDone }: { group: AreaRequestGroup; onClose: () => void; onDone: (r: AreaDecision) => void }) {
  const firstPin = group.gyms.find((g) => g.latitude != null && g.longitude != null)
  const [name, setName] = useState(group.name)
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null)
  const [applyToGroup, setApplyToGroup] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const approve = useMutation({
    mutationFn: () => areaRequestsApi.approve(group.requestIds[0], {
      name: name.trim(),
      ...(pin ? { latitude: pin.lat, longitude: pin.lng } : {}),
      applyToGroup,
    }),
    onSuccess: (res) => onDone(res.data),
    onError: (err) => setError(describeRequestError(err, 'The area could not be approved. Please try again.')),
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Approve “{group.name}”</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="approve-area-name">Area name</Label>
            <Input id="approve-area-name" value={name} onChange={(e) => setName(e.target.value)} />
            <p className="text-xs text-muted-foreground">A different spelling from the request is kept as another spelling of this area.</p>
          </div>
          <div className="space-y-1">
            <Label>Pin on the map (optional)</Label>
            <MapPicker
              latitude={pin?.lat ?? null}
              longitude={pin?.lng ?? null}
              cityCoordinates={firstPin ? [firstPin.latitude!, firstPin.longitude!] : null}
              onChange={(lat, lng) => setPin({ lat, lng })}
            />
            {pin && <Button type="button" variant="ghost" size="sm" onClick={() => setPin(null)}>Remove the pin</Button>}
          </div>
          <GroupCheckbox id="approve-group" checked={applyToGroup} onChange={setApplyToGroup} count={group.requestIds.length} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={name.trim().length < 3} loading={approve.isPending} onClick={() => approve.mutate()}>Approve area</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MergeDialog({ group, onClose, onDone }: { group: AreaRequestGroup; onClose: () => void; onDone: (r: AreaDecision) => void }) {
  const areasQuery = useQuery({ queryKey: ['areas', group.cityId], queryFn: () => citiesApi.getAreas(group.cityId) })
  const areas = areasQuery.data?.data?.areas ?? []
  const similarIds = new Set(group.similar.map((s) => s.areaId).filter(Boolean))
  const ordered = [...areas].sort((a, b) => Number(!similarIds.has(a.id)) - Number(!similarIds.has(b.id)) || a.name.localeCompare(b.name))
  const [areaId, setAreaId] = useState<number | undefined>(group.similar.find((s) => s.areaId)?.areaId ?? undefined)
  const [applyToGroup, setApplyToGroup] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const merge = useMutation({
    mutationFn: () => areaRequestsApi.merge(group.requestIds[0], { areaId: areaId!, applyToGroup }),
    onSuccess: (res) => onDone(res.data),
    onError: (err) => setError(describeRequestError(err, 'The request could not be merged. Please try again.')),
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Merge “{group.name}” into an area</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="merge-area">Existing area</Label>
            <select
              id="merge-area"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={areaId ?? ''}
              onChange={(e) => setAreaId(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">Pick an area of {group.cityName ?? 'the city'}</option>
              {ordered.map((a) => <option key={a.id} value={a.id}>{a.name}{similarIds.has(a.id) ? ' (similar)' : ''}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">“{group.name}” is kept as another spelling of that area.</p>
          </div>
          <GroupCheckbox id="merge-group" checked={applyToGroup} onChange={setApplyToGroup} count={group.requestIds.length} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={!areaId} loading={merge.isPending} onClick={() => merge.mutate()}>Merge area</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RejectDialog({ group, onClose, onDone }: { group: AreaRequestGroup; onClose: () => void; onDone: (r: AreaDecision) => void }) {
  const [reason, setReason] = useState('')
  const [applyToGroup, setApplyToGroup] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const valid = reason.trim().length >= 3 && reason.trim().length <= 300
  const reject = useMutation({
    mutationFn: () => areaRequestsApi.reject(group.requestIds[0], { reason: reason.trim(), applyToGroup }),
    onSuccess: (res) => onDone(res.data),
    onError: (err) => setError(describeRequestError(err, 'The request could not be rejected. Please try again.')),
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Reject “{group.name}”</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="reject-reason">Reason (the host sees it)</Label>
            <Textarea id="reject-reason" value={reason} maxLength={300} rows={3} onChange={(e) => setReason(e.target.value)} />
            <p className="text-xs text-muted-foreground">3 to 300 characters. The gyms stay listed under their city; the host is asked to pick the area again.</p>
          </div>
          <GroupCheckbox id="reject-group" checked={applyToGroup} onChange={setApplyToGroup} count={group.requestIds.length} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="destructive" disabled={!valid} loading={reject.isPending} onClick={() => reject.mutate()}>Reject area</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Other spellings of one area (merged or corrected requests). */
export function AreaAliasesDialog({ areaId, areaName, onClose }: { areaId: number; areaName: string; onClose: () => void }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['area-aliases', areaId], queryFn: () => areaRequestsApi.aliases(areaId) })
  const aliases = query.data?.data?.aliases ?? []
  const remove = useMutation({
    mutationFn: (id: number) => areaRequestsApi.deleteAlias(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['area-aliases', areaId] }); toast({ title: 'Spelling removed' }) },
    onError: (err) => toast({ title: 'Could not remove', description: describeRequestError(err, 'Please try again.'), variant: 'destructive' }),
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Other spellings of {areaName}</DialogTitle></DialogHeader>
        {query.isLoading ? (
          <Skeleton className="h-16" />
        ) : query.error ? (
          <ErrorState error={query.error} what="the spellings" onRetry={() => query.refetch()} compact />
        ) : aliases.length === 0 ? (
          <p className="text-sm text-muted-foreground">No other spellings yet. They are added when a request is merged into this area.</p>
        ) : (
          <ul className="space-y-1">
            {aliases.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded border px-2 py-1 text-sm">
                <span>{a.aliasKey}</span>
                <Button type="button" size="sm" variant="ghost" className="text-destructive" aria-label={`Delete ${a.aliasKey}`} loading={remove.isPending} onClick={() => remove.mutate(a.id)}>
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
